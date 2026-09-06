import { Pool } from "pg";
import { performance } from "perf_hooks";

export interface BenchmarkResult {
  minTimeMs: number;
  maxTimeMs: number;
  avgTimeMs: number;
  medianTimeMs: number;
  iterations: number;
  rawTimes: number[];
}

export class PerformanceService {
  public static async benchmark(
    pool: Pool,
    sql: string,
    iterations: number = 5,
    warmup: boolean = true
  ): Promise<BenchmarkResult> {
    // Safety check - strictly only allow SELECT queries
    const isSelect = /^\s*SELECT\b/i.test(sql);
    if (!isSelect) {
      throw new Error("Benchmarking is restricted to SELECT queries for safety.");
    }

    const times: number[] = [];

    // Warmup run
    if (warmup) {
      const client = await pool.connect();
      try {
        await client.query(sql);
      } finally {
        client.release();
      }
    }

    // Benchmark runs
    for (let i = 0; i < iterations; i++) {
      const client = await pool.connect();
      try {
        const start = performance.now();
        await client.query(sql);
        const end = performance.now();
        times.push(end - start);
      } finally {
        client.release();
      }
    }

    const minTimeMs = Math.min(...times);
    const maxTimeMs = Math.max(...times);
    const avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length;

    // Median
    const sorted = [...times].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianTimeMs = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    return {
      minTimeMs,
      maxTimeMs,
      avgTimeMs,
      medianTimeMs,
      iterations,
      rawTimes: times
    };
  }
}
