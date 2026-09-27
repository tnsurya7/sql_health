import { DatabaseAdapter, TableInfo, IndexInfo } from "../../database/adapter.interface";
import { IndexAdvisor } from "../index-advisor/advisor";
import { SqlParser } from "../sql-parser/parser";
import { AstDfsTraversal } from "../sql-parser/dfs";
import { RULE_DEFINITIONS, RuleContext } from "../rule-engine/rules";
import { prisma, logger } from "../../server";

export interface AggregatedRecommendation {
  id: string;
  category: "PERFORMANCE" | "INDEXING" | "SECURITY" | "QUALITY" | "MAINTAINABILITY";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  source: "ALGORITHMIC_RULE" | "INDEX_ADVISOR" | "CBO" | "RAG" | "AI" | "MONITORING";
  title: string;
  description: string;
  evidence: string;
  suggestedSql?: string;
  priority: number;
  confidence: number;
  status: "NEW" | "REVIEWED" | "ACCEPTED" | "REJECTED" | "APPLIED";
}

export class RecommendationEngine {
  /**
   * Aggregates and deduplicates recommendations from all diagnostic sources.
   */
  public static async generateRecommendations(
    adapter?: DatabaseAdapter,
    connectionId?: string
  ): Promise<AggregatedRecommendation[]> {
    const recommendations: AggregatedRecommendation[] = [];
    const seenTitles = new Set<string>();

    let tables: TableInfo[] = [];
    let columns: any[] = [];
    let indexes: IndexInfo[] = [];
    const dbType = adapter?.config.databaseType || "postgresql";

    if (adapter && adapter.isConnected) {
      try {
        tables = await adapter.getTables();
        columns = await adapter.getColumns();
        indexes = await adapter.getIndexes();
      } catch (err) {
        logger.warn(`[RecommendationEngine] Schema metadata fetch error:`, err);
      }
    }

    // 1A. Workload-Driven Index Advisor Recommendations (using real analyzed queries for this connection)
    if (connectionId) {
      try {
        const workloadQueries = await prisma.sqlQuery.findMany({
          where: { connectionId },
          include: {
            analyses: {
              include: {
                issues: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

        for (const q of workloadQueries) {
          try {
            const ast = SqlParser.parse(q.rawSql, dbType as any);
            const metrics = AstDfsTraversal.traverse(ast);

            const idxRecs = IndexAdvisor.advise(ast, metrics, dbType, tables, columns, indexes);
            for (const r of idxRecs) {
              const recKey = `${r.table.toLowerCase()}_${r.columns.map((c) => c.toLowerCase()).join("_")}`;
              if (!seenTitles.has(recKey)) {
                seenTitles.add(recKey);
                const tableObj = tables.find((t) => t.name.toLowerCase() === r.table.toLowerCase());
                const rowInfo = tableObj && tableObj.rowCount > 0 ? ` on table '${r.table}' (~${tableObj.rowCount.toLocaleString()} rows)` : ` on table '${r.table}'`;
                const querySnippet = q.rawSql.length > 80 ? q.rawSql.substring(0, 80) + "..." : q.rawSql;

                recommendations.push({
                  id: `rec-idx-${connectionId}-${r.suggestedName}`,
                  category: "INDEXING",
                  severity: r.costBenefit.benefitRating === "HIGH" ? "HIGH" : "MEDIUM",
                  source: "INDEX_ADVISOR",
                  title: `Create Missing Index on ${r.table}(${r.columns.join(", ")})`,
                  description: r.reason,
                  evidence: `Workload query '${querySnippet}' uses unindexed column(s) (${r.columns.join(", ")})${rowInfo}.`,
                  suggestedSql: r.ddl,
                  priority: r.costBenefit.benefitRating === "HIGH" ? 1 : 2,
                  confidence: r.confidence,
                  status: "NEW",
                });
              }
            }
          } catch {
            // Ignore non-SELECT or unsupported statements in workload queries
          }
        }
      } catch (err) {
        logger.warn(`[RecommendationEngine] Workload index advisor error:`, err);
      }
    }

    // 1B. Proactive Schema-Only Index Advisor Recommendations for large tables (> 500 rows)
    if (tables.length > 0) {
      try {
        for (const t of tables) {
          if (t.rowCount > 500) {
            // Simulated query AST for table scan
            const sampleSql = `SELECT * FROM ${t.name} WHERE id > 0`;
            try {
              const ast = SqlParser.parse(sampleSql, dbType as any);
              const metrics = AstDfsTraversal.traverse(ast);

              const idxRecs = IndexAdvisor.advise(ast, metrics, dbType, tables, columns, indexes);
              for (const r of idxRecs) {
                const recKey = `${r.table.toLowerCase()}_${r.columns.map((c) => c.toLowerCase()).join("_")}`;
                if (!seenTitles.has(recKey)) {
                  seenTitles.add(recKey);
                  recommendations.push({
                    id: `rec-idx-${connectionId ? connectionId + '-' : ''}${r.suggestedName}`,
                    category: "INDEXING",
                    severity: r.costBenefit.benefitRating === "HIGH" ? "HIGH" : "MEDIUM",
                    source: "INDEX_ADVISOR",
                    title: `Create Missing Index on ${r.table}(${r.columns.join(", ")})`,
                    description: r.reason,
                    evidence: `Table '${r.table}' has ${t.rowCount.toLocaleString()} rows with no supporting index for columns (${r.columns.join(", ")}).`,
                    suggestedSql: r.ddl,
                    priority: r.costBenefit.benefitRating === "HIGH" ? 1 : 2,
                    confidence: r.confidence,
                    status: "NEW",
                  });
                }
              }
            } catch {}
          }
        }
      } catch (err) {
        logger.warn(`[RecommendationEngine] Proactive index advisor error:`, err);
      }
    }

    // 2. Monitoring & Latency Fingerprint Insights
    try {
      const slowFingerprints = await prisma.queryFingerprint.findMany({
        where: { avgLatencyMs: { gt: 100 } },
        orderBy: { avgLatencyMs: "desc" },
        take: 5,
      });

      for (const fp of slowFingerprints) {
        const title = `Optimize Slow Query Fingerprint (${fp.avgLatencyMs.toFixed(1)}ms avg)`;
        if (!seenTitles.has(title)) {
          seenTitles.add(title);
          recommendations.push({
            id: `rec-fp-${fp.id}`,
            category: "PERFORMANCE",
            severity: fp.avgLatencyMs > 500 ? "HIGH" : "MEDIUM",
            source: "MONITORING",
            title,
            description: `Query template has executed ${fp.executionCount} time(s) with an average latency of ${fp.avgLatencyMs.toFixed(1)}ms and P95 of ${fp.p95LatencyMs.toFixed(1)}ms.`,
            evidence: `Normalized SQL: ${fp.normalizedSql}`,
            suggestedSql: fp.normalizedSql,
            priority: fp.avgLatencyMs > 500 ? 1 : 2,
            confidence: 0.95,
            status: "NEW",
          });
        }
      }
    } catch (err) {
      logger.warn(`[RecommendationEngine] Fingerprint recommendation error:`, err);
    }

    // 3. Security Recommendations
    if (adapter && !adapter.config.ssl && adapter.config.host !== "localhost" && adapter.config.host !== "127.0.0.1") {
      const secTitle = "Enable SSL/TLS Encryption for Database Connection";
      if (!seenTitles.has(secTitle)) {
        seenTitles.add(secTitle);
        recommendations.push({
          id: "rec-sec-ssl",
          category: "SECURITY",
          severity: "HIGH",
          source: "ALGORITHMIC_RULE",
          title: secTitle,
          description: "Database connection transmits query data and credentials in plain text over the network.",
          evidence: `Host: ${adapter.config.host}, SSL: false`,
          priority: 1,
          confidence: 1.0,
          status: "NEW",
        });
      }
    }

    // Persist to Recommendation table if connectionId provided
    if (connectionId) {
      for (const rec of recommendations) {
        await prisma.recommendation.upsert({
          where: { id: rec.id },
          update: {
            title: rec.title,
            description: rec.description,
            severity: rec.severity,
            category: rec.category,
            evidence: rec.evidence,
            suggestedSql: rec.suggestedSql,
          },
          create: {
            id: rec.id,
            connectionId,
            category: rec.category,
            severity: rec.severity,
            source: rec.source,
            title: rec.title,
            description: rec.description,
            evidence: rec.evidence,
            suggestedSql: rec.suggestedSql,
            priority: rec.priority,
            confidence: rec.confidence,
            status: rec.status,
          },
        }).catch(() => {});
      }
    }

    // Sort by priority ascending, severity descending
    return recommendations.sort((a, b) => a.priority - b.priority);
  }
}
