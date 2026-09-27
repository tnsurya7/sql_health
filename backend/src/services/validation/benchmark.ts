import { DatabaseAdapter } from "../../database/adapter.interface";
import { logger } from "../../server";

export interface BenchmarkIteration {
  iteration: number;
  durationMs: number;
  rowsReturned: number;
}

export interface BenchmarkReport {
  queryLabel: string;
  sql: string;
  iterationsCount: number;
  minTimeMs: number;
  maxTimeMs: number;
  avgTimeMs: number;
  medianTimeMs: number;
  p95TimeMs: number;
  stdDevMs: number;
  rowsReturned: number;
  iterations: BenchmarkIteration[];
  isSafe: boolean;
}

export interface BenchmarkComparison {
  original: BenchmarkReport;
  optimized: BenchmarkReport;
  speedupMultiplier: number;
  latencyReductionPercent: number;
  isImprovementVerified: boolean;
  rowCountsMatch: boolean;
}

export class SafeBenchmarkRunner {
  /**
   * Executes a safe, read-only benchmark with warm-up and multiple iterations on the target database.
   */
  public static async benchmarkQuery(
    adapter: DatabaseAdapter,
    sql: string,
    label: string = "Query",
    iterationsCount: number = 3,
    maxRows: number = 100
  ): Promise<BenchmarkReport> {
    const cleanSql = sql.trim().replace(/;+$/, "");

    // Safety verify: Only allow SELECT/WITH statements
    const isSelect = /^\s*(SELECT|WITH)\b/i.test(cleanSql);
    const hasDestructive = /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE)\b/i.test(cleanSql);
    if (!isSelect || hasDestructive) {
      throw new Error(`Benchmark rejected: Only read-only SELECT queries can be safely benchmarked.`);
    }

    // 1. Warm-up execution (primes OS disk cache and shared buffers)
    try {
      await adapter.executeReadOnlyQuery(cleanSql, maxRows, 5000);
    } catch (err: any) {
      logger.warn(`[SafeBenchmarkRunner] Warm-up execution warning: ${err.message}`);
    }

    // 2. Measured iterations
    const iterations: BenchmarkIteration[] = [];
    const durations: number[] = [];
    let rowsReturned = 0;

    for (let i = 1; i <= iterationsCount; i++) {
      const res = await adapter.executeReadOnlyQuery(cleanSql, maxRows, 8000);
      const duration = res.executionTimeMs;
      durations.push(duration);
      rowsReturned = res.rowCount;
      iterations.push({
        iteration: i,
        durationMs: duration,
        rowsReturned: res.rowCount,
      });
    }

    // Sort durations for median and P95
    durations.sort((a, b) => a - b);
    const minTimeMs = durations[0];
    const maxTimeMs = durations[durations.length - 1];
    const sum = durations.reduce((acc, v) => acc + v, 0);
    const avgTimeMs = Number((sum / durations.length).toFixed(2));

    const mid = Math.floor(durations.length / 2);
    const medianTimeMs = durations.length % 2 !== 0 ? durations[mid] : Number(((durations[mid - 1] + durations[mid]) / 2).toFixed(2));

    const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
    const p95TimeMs = durations[p95Index];

    // Standard deviation
    const variance = durations.reduce((acc, v) => acc + Math.pow(v - avgTimeMs, 2), 0) / durations.length;
    const stdDevMs = Number(Math.sqrt(variance).toFixed(2));

    return {
      queryLabel: label,
      sql: cleanSql,
      iterationsCount,
      minTimeMs,
      maxTimeMs,
      avgTimeMs,
      medianTimeMs,
      p95TimeMs,
      stdDevMs,
      rowsReturned,
      iterations,
      isSafe: true,
    };
  }

  /**
   * Runs side-by-side benchmark comparing Original vs Optimized queries.
   */
  public static async compareQueries(
    adapter: DatabaseAdapter,
    originalSql: string,
    optimizedSql: string,
    iterationsCount: number = 3
  ): Promise<BenchmarkComparison> {
    const original = await SafeBenchmarkRunner.benchmarkQuery(adapter, originalSql, "Original", iterationsCount);
    const optimized = await SafeBenchmarkRunner.benchmarkQuery(adapter, optimizedSql, "Optimized", iterationsCount);

    const origTime = Math.max(original.medianTimeMs, 0.1);
    const optTime = Math.max(optimized.medianTimeMs, 0.1);

    const speedupMultiplier = Number((origTime / optTime).toFixed(2));
    const latencyReductionPercent = origTime > 0 ? Number((((origTime - optTime) / origTime) * 100).toFixed(1)) : 0;
    const rowCountsMatch = original.rowsReturned === optimized.rowsReturned;
    const isImprovementVerified = speedupMultiplier > 1.05 && rowCountsMatch;

    return {
      original,
      optimized,
      speedupMultiplier,
      latencyReductionPercent,
      isImprovementVerified,
      rowCountsMatch,
    };
  }
}
