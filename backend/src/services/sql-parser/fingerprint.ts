import crypto from "crypto";
import { QueryNormalizer } from "./normalizer";
import { prisma, logger } from "../../server";

export interface FingerprintResult {
  fingerprint: string;
  signature: string;
  normalizedSql: string;
  databaseType: string;
}

export class QueryFingerprinter {
  /**
   * Generates a stable deterministic fingerprint and readable signature from SQL.
   */
  public static generate(sql: string, databaseType: string = "postgresql"): FingerprintResult {
    const normalized = QueryNormalizer.normalize(sql);

    // Create a human-readable signature prefix
    let signature = "SQL_QUERY";
    if (/^SELECT\b/i.test(normalized)) {
      const fromMatch = normalized.match(/\bFROM\s+([a-zA-Z0-9_]+)/i);
      const table = fromMatch ? fromMatch[1].toUpperCase() : "DATA";
      const whereMatch = normalized.match(/\bWHERE\s+([a-zA-Z0-9_]+)/i);
      const filter = whereMatch ? `_BY_${whereMatch[1].toUpperCase()}` : "";
      signature = `SELECT_${table}${filter}`;
    } else if (/^INSERT\s+INTO\b/i.test(normalized)) {
      const match = normalized.match(/\bINSERT\s+INTO\s+([a-zA-Z0-9_]+)/i);
      signature = `INSERT_${match ? match[1].toUpperCase() : "RECORD"}`;
    } else if (/^UPDATE\b/i.test(normalized)) {
      const match = normalized.match(/\bUPDATE\s+([a-zA-Z0-9_]+)/i);
      signature = `UPDATE_${match ? match[1].toUpperCase() : "RECORD"}`;
    } else if (/^DELETE\b/i.test(normalized)) {
      const match = normalized.match(/\bDELETE\s+FROM\s+([a-zA-Z0-9_]+)/i);
      signature = `DELETE_${match ? match[1].toUpperCase() : "RECORD"}`;
    }

    // Deterministic 16-character SHA-256 hash of normalized SQL + databaseType
    const hash = crypto
      .createHash("sha256")
      .update(`${databaseType.toLowerCase()}:${normalized}`)
      .digest("hex")
      .substring(0, 16);

    const fingerprint = `${signature}_${hash}`;

    return {
      fingerprint,
      signature,
      normalizedSql: normalized,
      databaseType,
    };
  }

  /**
   * Records a query execution metric against its fingerprint in the application database.
   */
  public static async recordExecution(
    sql: string,
    latencyMs: number,
    databaseType: string = "postgresql"
  ): Promise<void> {
    try {
      const { fingerprint, normalizedSql } = QueryFingerprinter.generate(sql, databaseType);

      const existing = await prisma.queryFingerprint.findUnique({
        where: { fingerprint },
      });

      if (!existing) {
        await prisma.queryFingerprint.create({
          data: {
            fingerprint,
            normalizedSql,
            databaseType,
            executionCount: 1,
            avgLatencyMs: latencyMs,
            minLatencyMs: latencyMs,
            maxLatencyMs: latencyMs,
            p95LatencyMs: latencyMs,
            p99LatencyMs: latencyMs,
            lastSeenAt: new Date(),
          },
        });
      } else {
        const count = existing.executionCount + 1;
        const newAvg = (existing.avgLatencyMs * existing.executionCount + latencyMs) / count;
        const newMin = Math.min(existing.minLatencyMs, latencyMs);
        const newMax = Math.max(existing.maxLatencyMs, latencyMs);
        // Approximation for running P95
        const newP95 = latencyMs > existing.p95LatencyMs ? (existing.p95LatencyMs * 0.9 + latencyMs * 0.1) : existing.p95LatencyMs;

        await prisma.queryFingerprint.update({
          where: { fingerprint },
          data: {
            executionCount: count,
            avgLatencyMs: Number(newAvg.toFixed(2)),
            minLatencyMs: Number(newMin.toFixed(2)),
            maxLatencyMs: Number(newMax.toFixed(2)),
            p95LatencyMs: Number(newP95.toFixed(2)),
            lastSeenAt: new Date(),
          },
        });
      }
    } catch (err) {
      logger.warn(`[QueryFingerprinter] Failed to record query execution fingerprint:`, err);
    }
  }
}
