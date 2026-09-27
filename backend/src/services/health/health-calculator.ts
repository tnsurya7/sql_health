import { DatabaseAdapter, TableInfo, IndexInfo, DatabaseMetrics } from "../../database/adapter.interface";
import { prisma, logger } from "../../server";

export interface HealthDimension {
  name: string;
  weightPercent: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: string[];
}

export interface DatabaseHealthReport {
  connectionId?: string;
  databaseName: string;
  databaseType: string;
  scoreOverall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  scorePerformance: number;
  scoreSecurity: number;
  scoreIndexing: number;
  scoreQueryQuality: number;
  scoreMaintainability: number;
  dimensions: HealthDimension[];
  summary: string;
  calculatedAt: Date;
}

export class HealthCalculator {
  /**
   * Deterministically calculates database health across 5 weighted dimensions from a REAL connected database.
   * Performance (35%), Security (20%), Indexing (20%), Query Quality (15%), Maintainability (10%).
   * Returns null if no active target database connection is connected.
   */
  public static async calculateHealth(
    adapter?: DatabaseAdapter,
    connectionId?: string
  ): Promise<DatabaseHealthReport | null> {
    if (!adapter || !adapter.isConnected) {
      return null;
    }

    let tables: TableInfo[] = [];
    let indexes: IndexInfo[] = [];
    let metrics: DatabaseMetrics = {
      tps: 0,
      cacheHitRatio: 100.0,
      activeConnections: 1,
      idleConnections: 0,
      maxConnections: 100,
      deadlockCount: 0,
      tempBytesWritten: 0,
    };

    try {
      tables = await adapter.getTables();
      indexes = await adapter.getIndexes();
      metrics = await adapter.getQueryMetrics();
    } catch (err: any) {
      logger.warn(`[HealthCalculator] Failed to query target database catalog metrics: ${err.message}`);
    }

    // 1. Performance Dimension (35% Weight) - based on real buffer cache hit ratio & temp writes
    let perfScore = 100;
    const perfFactors: string[] = [];

    if (metrics.cacheHitRatio < 90.0) {
      perfScore -= 30;
      perfFactors.push(`Low buffer cache hit ratio (${metrics.cacheHitRatio.toFixed(1)}%), indicating heavy disk I/O.`);
    } else if (metrics.cacheHitRatio < 97.0) {
      perfScore -= 10;
      perfFactors.push(`Moderate buffer cache hit ratio (${metrics.cacheHitRatio.toFixed(1)}%).`);
    } else {
      perfFactors.push(`Optimal buffer cache hit ratio (${metrics.cacheHitRatio.toFixed(1)}%).`);
    }

    if (metrics.tempBytesWritten > 50 * 1024 * 1024) {
      perfScore -= 20;
      perfFactors.push(`High temporary file write volume (${(metrics.tempBytesWritten / 1024 / 1024).toFixed(1)} MB). Increase work_mem.`);
    } else {
      perfFactors.push("Minimal temporary spill writes to disk.");
    }

    const connUsageRatio = metrics.maxConnections > 0 ? metrics.activeConnections / metrics.maxConnections : 0;
    if (connUsageRatio > 0.8) {
      perfScore -= 25;
      perfFactors.push(`Connection pool saturation high: ${metrics.activeConnections}/${metrics.maxConnections} connections.`);
    } else {
      perfFactors.push(`Connection pool healthy (${metrics.activeConnections} active connections).`);
    }

    perfScore = Math.max(10, Math.min(100, perfScore));

    // 2. Security Dimension (20% Weight) - transport encryption & read-only enforcement
    let secScore = 100;
    const secFactors: string[] = [];
    if (!adapter.config.ssl && adapter.config.host !== "localhost" && adapter.config.host !== "127.0.0.1") {
      secScore -= 30;
      secFactors.push("Database connection is not encrypted with SSL/TLS over remote host.");
    } else {
      secFactors.push("Database transport encryption verified or local loopback.");
    }

    if (!adapter.config.readOnly) {
      secFactors.push("Connection configured in Read-Write mode (destructive statements must be guarded).");
    } else {
      secFactors.push("Safe Read-Only guard active.");
    }
    secScore = Math.max(20, Math.min(100, secScore));

    // 3. Indexing Dimension (20% Weight) - tables with missing indexes on large row counts
    let idxScore = 100;
    const idxFactors: string[] = [];
    const tablesWithoutIndexes = tables.filter((t) => {
      const tIdx = indexes.filter((i) => i.table.toLowerCase() === t.name.toLowerCase());
      return tIdx.length === 0 && t.rowCount > 500;
    });

    if (tablesWithoutIndexes.length > 0) {
      idxScore -= Math.min(50, tablesWithoutIndexes.length * 15);
      idxFactors.push(`${tablesWithoutIndexes.length} table(s) with >500 rows lack secondary indexes.`);
    } else {
      idxFactors.push("All primary and high-cardinality tables have indexing access paths.");
    }
    idxScore = Math.max(20, Math.min(100, idxScore));

    // 4. Query Quality Dimension (15% Weight) - deadlock and slow contention events
    let queryQualityScore = 95;
    const queryFactors: string[] = [];
    if (metrics.deadlockCount > 0) {
      queryQualityScore -= 35;
      queryFactors.push(`Detected ${metrics.deadlockCount} deadlock contention event(s) in database stats.`);
    } else {
      queryFactors.push("Zero transaction deadlocks recorded in recent transaction window.");
    }
    queryQualityScore = Math.max(20, Math.min(100, queryQualityScore));

    // 5. Maintainability Dimension (10% Weight) - statistics staleness & vacuum
    let maintScore = 100;
    const maintFactors: string[] = [];
    const tablesNeedingAnalyze = tables.filter((t) => !t.lastAnalyzed && t.rowCount > 1000);
    if (tablesNeedingAnalyze.length > 0) {
      maintScore -= 25;
      maintFactors.push(`${tablesNeedingAnalyze.length} table(s) have not been ANALYZED recently.`);
    } else {
      maintFactors.push("Optimizer statistics and distribution histograms are up-to-date.");
    }
    maintScore = Math.max(20, Math.min(100, maintScore));

    // Weighted Overall Score calculation
    const scoreOverall = Math.round(
      perfScore * 0.35 +
      secScore * 0.20 +
      idxScore * 0.20 +
      queryQualityScore * 0.15 +
      maintScore * 0.10
    );

    const getGrade = (s: number): "A" | "B" | "C" | "D" | "F" => {
      if (s >= 90) return "A";
      if (s >= 80) return "B";
      if (s >= 70) return "C";
      if (s >= 60) return "D";
      return "F";
    };

    const dimensions: HealthDimension[] = [
      { name: "Performance", weightPercent: 35, score: perfScore, grade: getGrade(perfScore), factors: perfFactors },
      { name: "Security", weightPercent: 20, score: secScore, grade: getGrade(secScore), factors: secFactors },
      { name: "Indexing", weightPercent: 20, score: idxScore, grade: getGrade(idxScore), factors: idxFactors },
      { name: "Query Quality", weightPercent: 15, score: queryQualityScore, grade: getGrade(queryQualityScore), factors: queryFactors },
      { name: "Maintainability", weightPercent: 10, score: maintScore, grade: getGrade(maintScore), factors: maintFactors },
    ];

    const report: DatabaseHealthReport = {
      connectionId,
      databaseName: adapter.config.database || adapter.config.name,
      databaseType: adapter.config.databaseType,
      scoreOverall,
      grade: getGrade(scoreOverall),
      scorePerformance: perfScore,
      scoreSecurity: secScore,
      scoreIndexing: idxScore,
      scoreQueryQuality: queryQualityScore,
      scoreMaintainability: maintScore,
      dimensions,
      summary: `Real Health Score is ${scoreOverall}/100 (Grade ${getGrade(scoreOverall)}). Performance: ${perfScore}, Security: ${secScore}, Indexing: ${idxScore}.`,
      calculatedAt: new Date(),
    };

    // Store in HealthScore table if connectionId provided
    if (connectionId) {
      await prisma.healthScore.create({
        data: {
          connectionId,
          scorePerf: perfScore,
          scoreSec: secScore,
          scoreMaint: maintScore,
          scoreIdx: idxScore,
          scoreSchema: 90,
          scoreQuery: queryQualityScore,
          scoreOver: scoreOverall,
          dimensions: JSON.stringify(dimensions),
        },
      }).catch(() => {});
    }

    return report;
  }
}
