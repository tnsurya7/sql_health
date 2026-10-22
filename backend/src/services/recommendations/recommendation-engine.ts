import { DatabaseAdapter, TableInfo, IndexInfo, ColumnInfo, ConstraintInfo } from "../../database/adapter.interface";
import { IndexAdvisor } from "../index-advisor/advisor";
import { ProcedureAnalyzer } from "../procedure-analyzer/engine";
import { prisma, logger } from "../../server";

export interface AggregatedRecommendation {
  id: string;
  category: "PERFORMANCE" | "INDEXING" | "SECURITY" | "QUALITY" | "MAINTAINABILITY";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  source: "ALGORITHMIC_RULE" | "INDEX_ADVISOR" | "CBO" | "RAG" | "AI" | "MONITORING" | "STATIC_ANALYSIS";
  sourceModule: "sql-analyzer" | "index-advisor" | "execution-plans" | "optimizer" | "health" | "performance" | "procedures" | "schema-explorer";
  affectedObject?: string;
  title: string;
  description: string;
  explanation: string;
  evidence: string;
  suggestedAction: string;
  suggestedSql?: string;
  priority: number;
  confidence: number;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED" | "NEW" | "REVIEWED" | "ACCEPTED" | "REJECTED" | "APPLIED";
  createdAt: string;
}

export class RecommendationEngine {
  /**
   * Aggregates and deduplicates recommendations from all 7 diagnostic sources:
   * 1. SQL Analyzer findings
   * 2. Index Advisor candidates (schema & workload)
   * 3. Execution plan diagnostics
   * 4. Query optimization results
   * 5. Database health analysis
   * 6. Performance anomalies
   * 7. Stored procedure static analysis
   */
  public static async generateRecommendations(
    adapter?: DatabaseAdapter,
    connectionId?: string
  ): Promise<AggregatedRecommendation[]> {
    const recommendations: AggregatedRecommendation[] = [];
    const seenKeys = new Set<string>();

    let tables: TableInfo[] = [];
    let columns: ColumnInfo[] = [];
    let indexes: IndexInfo[] = [];
    let constraints: ConstraintInfo[] = [];
    const dbType = adapter?.config.databaseType || "postgresql";

    if (adapter && adapter.isConnected) {
      try {
        tables = await adapter.getTables().catch(() => []);
        columns = await adapter.getColumns().catch(() => []);
        indexes = await adapter.getIndexes().catch(() => []);
        constraints = await adapter.getConstraints().catch(() => []);
      } catch (err) {
        logger.warn(`[RecommendationEngine] Schema metadata fetch error:`, err);
      }
    }

    // Load existing persisted recommendations to preserve user lifecycle status
    const existingDbRecs = connectionId
      ? await prisma.recommendation.findMany({ where: { connectionId } }).catch(() => [])
      : [];
    const statusMap = new Map<string, string>();
    for (const er of existingDbRecs) {
      statusMap.set(er.id, er.status);
    }

    // Helper: Map DB status to modern UI lifecycle state
    const resolveStatus = (id: string, defaultStatus: string = "OPEN"): any => {
      const dbStatus = statusMap.get(id);
      if (!dbStatus) return defaultStatus;
      if (dbStatus === "NEW") return "OPEN";
      if (dbStatus === "REVIEWED") return "ACKNOWLEDGED";
      if (dbStatus === "ACCEPTED" || dbStatus === "APPLIED") return "RESOLVED";
      if (dbStatus === "REJECTED") return "DISMISSED";
      return dbStatus;
    };

    // -------------------------------------------------------------------------
    // 1. SQL Analyzer Findings (QueryIssue)
    // -------------------------------------------------------------------------
    try {
      const issues = await prisma.queryIssue.findMany({
        where: connectionId
          ? {
              analysis: {
                query: {
                  connectionId,
                },
              },
            }
          : undefined,
        take: 30,
        orderBy: { createdAt: "desc" },
        include: {
          analysis: {
            include: {
              query: true,
            },
          },
        },
      });

      for (const iss of issues) {
        const issueKey = `sql-issue-${iss.ruleId}-${iss.title}-${(iss.affectedTables || []).join("_")}`;
        if (!seenKeys.has(issueKey)) {
          seenKeys.add(issueKey);
          const recId = `rec-sql-${iss.id}`;
          const currentStatus = resolveStatus(recId, "OPEN");

          const affected = (iss.affectedTables && iss.affectedTables.length > 0)
            ? iss.affectedTables.join(", ")
            : "Query Statement";

          const categoryMap: Record<string, AggregatedRecommendation["category"]> = {
            PERFORMANCE: "PERFORMANCE",
            SECURITY: "SECURITY",
            MAINTAINABILITY: "MAINTAINABILITY",
            QUALITY: "QUALITY",
            INDEXING: "INDEXING",
          };
          const mappedCategory = categoryMap[iss.category?.toUpperCase()] || "QUALITY";

          recommendations.push({
            id: recId,
            category: mappedCategory,
            severity: iss.severity as any,
            source: "ALGORITHMIC_RULE",
            sourceModule: "sql-analyzer",
            affectedObject: affected,
            title: iss.title,
            description: iss.description,
            explanation: `Rule ${iss.ruleId} flagged: ${iss.description}`,
            evidence: iss.evidence || iss.analysis?.query?.rawSql?.substring(0, 100) || "Detected by AST rule engine",
            suggestedAction: iss.recommendation || `Refactor SQL query to satisfy rule ${iss.ruleId}`,
            suggestedSql: iss.analysis?.query?.formattedSql || undefined,
            priority: iss.severity === "CRITICAL" ? 1 : iss.severity === "HIGH" ? 2 : 3,
            confidence: iss.confidence || 0.9,
            status: currentStatus,
            createdAt: iss.createdAt.toISOString(),
          });
        }
      }
    } catch (err: any) {
      logger.warn(`[RecommendationEngine] SQL Analyzer issues fetch warning:`, err.message);
    }

    // -------------------------------------------------------------------------
    // 2. Index Advisor Candidates (Workload & Schema Inspection)
    // -------------------------------------------------------------------------
    try {
      // 2A. Schema-based unindexed foreign keys
      if (tables.length > 0) {
        const schemaIdxRecs = IndexAdvisor.adviseSchema(tables, columns, indexes, constraints, dbType);
        for (const sr of schemaIdxRecs) {
          const key = `idx-${sr.table.toLowerCase()}_${sr.columns.join("_").toLowerCase()}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            const recId = `rec-idx-schema-${sr.table}-${sr.columns.join("-")}`;
            const currentStatus = resolveStatus(recId, "OPEN");

            recommendations.push({
              id: recId,
              category: "INDEXING",
              severity: "HIGH",
              source: "INDEX_ADVISOR",
              sourceModule: "index-advisor",
              affectedObject: `${sr.schema}.${sr.table} (${sr.columns.join(", ")})`,
              title: `Create Index on Foreign Key ${sr.table}(${sr.columns.join(", ")})`,
              description: sr.reason,
              explanation: sr.reason,
              evidence: sr.evidence,
              suggestedAction: `Execute CREATE INDEX to eliminate sequential scans on foreign key '${sr.columns.join(", ")}'`,
              suggestedSql: sr.ddl,
              priority: 1,
              confidence: sr.confidence,
              status: currentStatus,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }

      // 2B. Workload-driven index recommendations
      if (connectionId) {
        const workloadQueries = await prisma.sqlQuery.findMany({
          where: { connectionId },
          take: 30,
          orderBy: { createdAt: "desc" },
        });

        const workloadInput = workloadQueries.map((q) => ({ sql: q.rawSql, frequency: 1 }));
        const workloadIdxRecs = IndexAdvisor.adviseWorkloadQueries(workloadInput, tables, columns, indexes, dbType);

        for (const wr of workloadIdxRecs) {
          const key = `idx-${wr.table.toLowerCase()}_${wr.columns.join("_").toLowerCase()}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            const recId = `rec-idx-wl-${wr.table}-${wr.columns.join("-")}`;
            const currentStatus = resolveStatus(recId, "OPEN");

            recommendations.push({
              id: recId,
              category: "INDEXING",
              severity: wr.costBenefit.benefitRating === "HIGH" ? "HIGH" : "MEDIUM",
              source: "INDEX_ADVISOR",
              sourceModule: "index-advisor",
              affectedObject: `${wr.schema}.${wr.table} (${wr.columns.join(", ")})`,
              title: `Add Composite Index on ${wr.table}(${wr.columns.join(", ")})`,
              description: wr.reason,
              explanation: wr.confidenceCalculation,
              evidence: wr.evidence,
              suggestedAction: `Create supporting composite index for ${wr.usageContext} access path`,
              suggestedSql: wr.ddl,
              priority: wr.costBenefit.benefitRating === "HIGH" ? 1 : 2,
              confidence: wr.confidence,
              status: currentStatus,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[RecommendationEngine] Index Advisor recommendations error:`, err.message);
    }

    // -------------------------------------------------------------------------
    // 3. Execution Plan Diagnostics (High cardinality error ratio / sequential scans)
    // -------------------------------------------------------------------------
    try {
      const plans = await prisma.executionPlan.findMany({
        where: {
          OR: [
            { cardinalityErrorRatio: { gt: 5 } },
            { executionTime: { gt: 100 } },
          ],
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          analysis: {
            include: {
              query: true,
            },
          },
        },
      });

      for (const p of plans) {
        const ratio = p.cardinalityErrorRatio ? p.cardinalityErrorRatio.toFixed(1) : "N/A";
        const key = `cbo-plan-${p.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const recId = `rec-plan-${p.id}`;
          const currentStatus = resolveStatus(recId, "OPEN");

          recommendations.push({
            id: recId,
            category: "PERFORMANCE",
            severity: p.cardinalityErrorRatio && p.cardinalityErrorRatio > 20 ? "HIGH" : "MEDIUM",
            source: "CBO",
            sourceModule: "execution-plans",
            affectedObject: "Cost-Based Query Planner",
            title: `Severe Cardinality Misestimate (${ratio}x Error Ratio)`,
            description: `Query planner estimated ${p.planRows} rows, but actual execution processed ${p.actualRows} rows.`,
            explanation: `Large discrepancies between estimated plan rows and actual executed rows cause the optimizer to choose suboptimal join methods (e.g. nested loops instead of hash joins).`,
            evidence: `Planning time: ${p.planningTime}ms, Execution time: ${p.executionTime}ms. Ratio: ${ratio}x.`,
            suggestedAction: "Run ANALYZE on referenced tables to update table cardinality and distribution statistics.",
            suggestedSql: "ANALYZE;",
            priority: 2,
            confidence: 0.92,
            status: currentStatus,
            createdAt: p.createdAt.toISOString(),
          });
        }
      }
    } catch (err: any) {
      logger.warn(`[RecommendationEngine] Execution plan diagnostics error:`, err.message);
    }

    // -------------------------------------------------------------------------
    // 4. Query Optimization Pipeline Results (DP Join Order / Rewrites)
    // -------------------------------------------------------------------------
    try {
      const optRuns = await prisma.optimizationRun.findMany({
        where: connectionId ? { connectionId } : undefined,
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          candidates: {
            where: { isWinner: true },
          },
        },
      });

      for (const run of optRuns) {
        const winner = run.candidates[0];
        if (winner && winner.candidateSql !== run.originalSql) {
          const key = `opt-winner-${run.id}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            const recId = `rec-opt-${run.id}`;
            const currentStatus = resolveStatus(recId, "OPEN");

            const speedup = winner.benchmarkImprovement
              ? `${winner.benchmarkImprovement.toFixed(1)}% verified speedup`
              : "Estimated relational cost reduction";

            recommendations.push({
              id: recId,
              category: "PERFORMANCE",
              severity: "HIGH",
              source: "CBO",
              sourceModule: "optimizer",
              affectedObject: `SQL Query (${run.databaseType.toUpperCase()})`,
              title: `Apply Optimized Query Rewrite (${speedup})`,
              description: `Query optimization engine identified an improved SQL query candidate via ${winner.source}.`,
              explanation: run.summary || "Candidate rewrite reduces join order combinatorial cost and predicate evaluation overhead.",
              evidence: `Original SQL: ${run.originalSql.substring(0, 80)}...`,
              suggestedAction: "Adopt the mathematically optimized query rewrite in application code.",
              suggestedSql: winner.candidateSql,
              priority: 1,
              confidence: 0.95,
              status: currentStatus,
              createdAt: run.createdAt.toISOString(),
            });
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[RecommendationEngine] Optimization pipeline results error:`, err.message);
    }

    // -------------------------------------------------------------------------
    // 5. Database Health Analysis (Deadlocks, SSL, Cache hit)
    // -------------------------------------------------------------------------
    try {
      // 5A. Deadlocks
      const deadlocks = await prisma.deadlockLog.findMany({
        where: connectionId ? { connectionId, resolved: false } : { resolved: false },
        take: 5,
        orderBy: { detectedAt: "desc" },
      });

      for (const dl of deadlocks) {
        const key = `dl-log-${dl.id}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const recId = `rec-dl-${dl.id}`;
          const currentStatus = resolveStatus(recId, "OPEN");

          recommendations.push({
            id: recId,
            category: "QUALITY",
            severity: "CRITICAL",
            source: "ALGORITHMIC_RULE",
            sourceModule: "health",
            affectedObject: "Transaction Lock Graph",
            title: "Resolve Active Deadlock Cycle in Database",
            description: "A circular dependency cycle was detected between concurrent database transactions.",
            explanation: "Deadlocks force PostgreSQL to terminate one of the competing backend sessions with 40P01 deadlock_detected.",
            evidence: dl.cycleDetails,
            suggestedAction: "Enforce consistent table lock acquisition order across all application transaction blocks.",
            priority: 1,
            confidence: 1.0,
            status: currentStatus,
            createdAt: dl.detectedAt.toISOString(),
          });
        }
      }

      // 5B. Security: Plaintext connection without SSL
      if (adapter && !adapter.config.ssl && adapter.config.host !== "localhost" && adapter.config.host !== "127.0.0.1") {
        const secKey = `sec-ssl-${adapter.config.host}`;
        if (!seenKeys.has(secKey)) {
          seenKeys.add(secKey);
          const recId = "rec-sec-ssl";
          const currentStatus = resolveStatus(recId, "OPEN");

          recommendations.push({
            id: recId,
            category: "SECURITY",
            severity: "HIGH",
            source: "ALGORITHMIC_RULE",
            sourceModule: "health",
            affectedObject: `${adapter.config.host}:${adapter.config.port}`,
            title: "Enable SSL/TLS Encryption for Database Connection",
            description: "Database connection transmits query data and credentials in plain text over the network.",
            explanation: "Unencrypted database traffic is vulnerable to man-in-the-middle interception and packet snooping.",
            evidence: `Host: ${adapter.config.host}, Port: ${adapter.config.port}, SSL: false`,
            suggestedAction: "Enable SSL in database connection parameters.",
            priority: 1,
            confidence: 1.0,
            status: currentStatus,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (err: any) {
      logger.warn(`[RecommendationEngine] Health analysis recommendations error:`, err.message);
    }

    // -------------------------------------------------------------------------
    // 6. Performance Monitoring & Latency Fingerprints
    // -------------------------------------------------------------------------
    try {
      const slowFingerprints = await prisma.queryFingerprint.findMany({
        where: { avgLatencyMs: { gt: 100 } },
        orderBy: { avgLatencyMs: "desc" },
        take: 5,
      });

      for (const fp of slowFingerprints) {
        const key = `fp-slow-${fp.fingerprint}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          const recId = `rec-fp-${fp.id}`;
          const currentStatus = resolveStatus(recId, "OPEN");

          recommendations.push({
            id: recId,
            category: "PERFORMANCE",
            severity: fp.avgLatencyMs > 500 ? "HIGH" : "MEDIUM",
            source: "MONITORING",
            sourceModule: "performance",
            affectedObject: `Query Fingerprint [${fp.fingerprint}]`,
            title: `Optimize Slow Query Fingerprint (${fp.avgLatencyMs.toFixed(1)}ms avg)`,
            description: `Query template has executed ${fp.executionCount} time(s) with high latency.`,
            explanation: `Average execution time is ${fp.avgLatencyMs.toFixed(1)}ms and P95 latency is ${fp.p95LatencyMs.toFixed(1)}ms.`,
            evidence: `Normalized SQL: ${fp.normalizedSql}`,
            suggestedAction: "Analyze query in SQL Analyzer and inspect execution plan bottlenecks.",
            suggestedSql: fp.normalizedSql,
            priority: fp.avgLatencyMs > 500 ? 1 : 2,
            confidence: 0.95,
            status: currentStatus,
            createdAt: fp.createdAt.toISOString(),
          });
        }
      }
    } catch (err: any) {
      logger.warn(`[RecommendationEngine] Latency fingerprints error:`, err.message);
    }

    // -------------------------------------------------------------------------
    // 7. Stored Procedure Static Analysis
    // -------------------------------------------------------------------------
    if (adapter && adapter.isConnected) {
      try {
        const procedures = await adapter.getProcedures().catch(() => []);
        for (const proc of procedures) {
          if (proc.definition) {
            try {
              const rep = ProcedureAnalyzer.analyzeProcedure(proc.definition, proc.name, proc.schema);
              for (const finding of rep.findings) {
                if (finding.severity === "CRITICAL" || finding.severity === "HIGH") {
                  const key = `sp-finding-${proc.name}-${finding.ruleId}`;
                  if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    const recId = `rec-sp-${proc.name}-${finding.ruleId}`.toLowerCase();
                    const currentStatus = resolveStatus(recId, "OPEN");

                    recommendations.push({
                      id: recId,
                      category: finding.category === "Security" ? "SECURITY" : "QUALITY",
                      severity: finding.severity,
                      source: "STATIC_ANALYSIS",
                      sourceModule: "procedures",
                      affectedObject: `Procedure ${proc.schema}.${proc.name}()`,
                      title: `Procedure Quality: ${finding.title}`,
                      description: finding.explanation,
                      explanation: finding.whyItMatters,
                      evidence: finding.snippet || `Procedure ${proc.name}`,
                      suggestedAction: finding.recommendedFix,
                      suggestedSql: finding.safeExample,
                      priority: finding.severity === "CRITICAL" ? 1 : 2,
                      confidence: finding.confidence,
                      status: currentStatus,
                      createdAt: new Date().toISOString(),
                    });
                  }
                }
              }
            } catch {
              // Skip procedure analysis failure
            }
          }
        }
      } catch (err: any) {
        logger.warn(`[RecommendationEngine] Stored procedure static analysis error:`, err.message);
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

    // Sort by priority ascending, then severity
    const severityWeight: Record<string, number> = {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      INFO: 1,
    };

    return recommendations.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
    });
  }
}
