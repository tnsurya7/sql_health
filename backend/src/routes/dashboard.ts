import { Router, Response } from "express";
import { prisma } from "../server";
import { connectionManager } from "../database/connection-manager";
import { HealthCalculator } from "../services/health/health-calculator";
import { ProcedureAnalyzer } from "../services/procedure-analyzer/engine";
import { RecommendationEngine } from "../services/recommendations/recommendation-engine";

const router = Router();

// GET /api/dashboard - Real aggregated KPIs, health metrics, and procedure quality
router.get("/", async (req: any, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();

  try {
    // 1. Get database connections status
    const activeConnection = connectionId
      ? await prisma.databaseConnection.findUnique({ where: { id: connectionId } })
      : await prisma.databaseConnection.findFirst({ where: { isActive: true } });

    const isConnected = Boolean(activeConnection && connectionManager.isConnected(activeConnection.id));

    // When NO target database is active/connected: return explicit empty target-metrics state
    if (!isConnected || !activeConnection) {
      return res.status(200).json({
        success: true,
        data: {
          connectionName: activeConnection ? activeConnection.name : "No Active Database",
          databaseType: activeConnection ? activeConnection.databaseType : "postgresql",
          host: activeConnection?.host || null,
          database: activeConnection?.database || null,
          isConnected: false,
          status: activeConnection ? activeConnection.status : "NO_ACTIVE_DATABASE",
          healthScore: null,
          kpis: {
            totalQueries: 0,
            slowQueries: 0,
            criticalIssues: 0,
            highIssues: 0,
            indexRecommendations: 0,
            databaseObjects: 0,
            indexCount: 0,
          },
          procedureQuality: {
            totalAnalyzed: 0,
            totalFindings: 0,
            findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
            cleanProceduresCount: 0,
            requiringReviewCount: 0,
            highestRiskProcedures: [],
          },
          charts: {
            executionTimeTrend: [],
            severityDistribution: [
              { name: "Critical", value: 0 },
              { name: "High", value: 0 },
              { name: "Medium", value: 0 },
              { name: "Low", value: 0 },
            ],
            topSlowQueries: [],
          },
          recentRecommendations: [],
        },
      });
    }

    // When a target database IS connected: fetch real target-scoped metrics
    const adapter = connectionManager.getAdapter(activeConnection.id);
    const liveHealth = await HealthCalculator.calculateHealth(adapter, activeConnection.id).catch(() => null);
    const tables = await adapter.getTables().catch(() => []);
    const indexes = await adapter.getIndexes().catch(() => []);
    const tablesCount = tables.length;
    const indexCount = indexes.length;

    // 2. Fetch real query statistics and issues for this target connection
    const totalQueriesCount = await prisma.sqlQuery.count({
      where: { connectionId: activeConnection.id },
    });

    const recentQueries = await prisma.sqlQuery.findMany({
      where: { connectionId: activeConnection.id },
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        analyses: {
          include: {
            issues: true,
          },
        },
        benchmarks: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    // Recommendations count
    const recommendations = await RecommendationEngine.generateRecommendations(adapter, activeConnection.id).catch(() => []);
    const indexRecsCount = recommendations.filter((r) => r.category === "INDEXING").length;

    // Issues count by severity strictly scoped to this connection
    const allIssues = await prisma.queryIssue.findMany({
      where: {
        analysis: {
          query: {
            connectionId: activeConnection.id,
          },
        },
      },
      include: {
        analysis: {
          include: {
            query: true,
          },
        },
      },
    });

    const criticalIssues = allIssues.filter((i: any) => i.severity === "CRITICAL").length;
    const highIssues = allIssues.filter((i: any) => i.severity === "HIGH").length;
    const medIssues = allIssues.filter((i: any) => i.severity === "MEDIUM").length;
    const lowIssues = allIssues.filter((i: any) => i.severity === "LOW").length;

    // Performance metrics trend strictly for this connection
    const recentMetrics = await prisma.performanceMetric.findMany({
      where: { connectionId: activeConnection.id },
      orderBy: { createdAt: "asc" },
      take: 15,
    });

    const executionTimeTrend = recentMetrics.map((m: any) => ({
      date: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      avgTime: m.medianTimeMs,
    }));

    // Stored Procedure Quality Analysis
    let procedureQuality = {
      totalAnalyzed: 0,
      totalFindings: 0,
      findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      cleanProceduresCount: 0,
      requiringReviewCount: 0,
      highestRiskProcedures: [] as any[],
    };

    try {
      const procs = await adapter.getProcedures().catch(() => []);
      const validProcs = procs.filter((p) => Boolean(p.definition));
      if (validProcs.length > 0) {
        const batch = ProcedureAnalyzer.batchAnalyze(
          validProcs.map((p) => ({
            name: p.name,
            definition: p.definition!,
            schema: p.schema,
          }))
        );
        procedureQuality = {
          totalAnalyzed: batch.totalAnalyzed,
          totalFindings: batch.totalFindings,
          findingsBySeverity: batch.findingsBySeverity,
          cleanProceduresCount: batch.cleanProceduresCount,
          requiringReviewCount: batch.requiringReviewCount,
          highestRiskProcedures: batch.highestRiskProcedures,
        };
      }
    } catch (err: any) {
      console.warn(`[DashboardRoute] Procedure quality calculation warning: ${err.message}`);
    }

    // Slow queries: Performance metrics with execution time or issues with high latency
    const slowQueriesList = recentQueries.filter((q) => {
      const hasPerfBenchmark = q.benchmarks && q.benchmarks.some((b) => b.medianTimeMs > 50);
      const hasPerfIssue = q.analyses?.some((a) =>
        a.issues?.some((i) => i.category === "PERFORMANCE" && (i.severity === "HIGH" || i.severity === "CRITICAL"))
      );
      return hasPerfBenchmark || hasPerfIssue;
    });

    res.status(200).json({
      success: true,
      data: {
        connectionName: activeConnection.name,
        databaseType: activeConnection.databaseType,
        host: activeConnection.host,
        database: activeConnection.database,
        isConnected: true,
        status: "ONLINE",
        healthScore: liveHealth
          ? {
              overall: liveHealth.scoreOverall,
              grade: liveHealth.grade,
              performance: liveHealth.scorePerformance,
              security: liveHealth.scoreSecurity,
              maintainability: liveHealth.scoreMaintainability,
              indexHealth: liveHealth.scoreIndexing,
              queryQuality: liveHealth.scoreQueryQuality,
            }
          : null,
        kpis: {
          totalQueries: totalQueriesCount,
          slowQueries: slowQueriesList.length,
          criticalIssues,
          highIssues,
          indexRecommendations: indexRecsCount,
          databaseObjects: tablesCount,
          indexCount,
        },
        procedureQuality,
        charts: {
          executionTimeTrend,
          severityDistribution: [
            { name: "Critical", value: criticalIssues },
            { name: "High", value: highIssues },
            { name: "Medium", value: medIssues },
            { name: "Low", value: lowIssues },
          ],
          topSlowQueries: recentQueries.slice(0, 5).map((q: any) => ({
            id: q.id,
            sql: q.rawSql.length > 70 ? q.rawSql.substring(0, 70) + "..." : q.rawSql,
            score: q.score,
            measuredLatencyMs: q.benchmarks?.[0]?.medianTimeMs || null,
            createdAt: q.createdAt,
          })),
        },
        recentRecommendations: recommendations.slice(0, 10),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message },
    });
  }
});

// GET /api/dashboard/drilldown - Return detailed drill-down findings for clickable KPI counters
router.get("/drilldown", async (req: any, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();
  const type = (req.query.type as string) || "critical"; // "critical" | "high" | "slow_queries" | "index_recs" | "total_queries"
  const severityFilter = req.query.severity as string | undefined;
  const tableFilter = req.query.table as string | undefined;
  const categoryFilter = req.query.category as string | undefined;
  const searchFilter = req.query.search as string | undefined;

  try {
    const activeConnection = connectionId
      ? await prisma.databaseConnection.findUnique({ where: { id: connectionId } })
      : await prisma.databaseConnection.findFirst({ where: { isActive: true } });

    const isConnected = Boolean(activeConnection && connectionManager.isConnected(activeConnection.id));

    if (!activeConnection || !isConnected) {
      return res.status(200).json({
        success: true,
        data: {
          type,
          isConnected: false,
          total: 0,
          items: [],
          message: "Database is disconnected. Connect to live database to view findings.",
        },
      });
    }

    let items: any[] = [];

    if (type === "critical" || type === "high") {
      const targetSeverity = type.toUpperCase();
      const issues = await prisma.queryIssue.findMany({
        where: {
          analysis: {
            query: {
              connectionId: activeConnection.id,
            },
          },
          severity: targetSeverity,
        },
        include: {
          analysis: {
            include: {
              query: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      items = issues.map((i) => ({
        id: i.id,
        ruleCode: i.ruleId,
        title: i.title,
        severity: i.severity,
        category: i.category,
        affectedTables: i.affectedTables,
        affectedColumns: i.affectedColumns,
        query: i.analysis?.query?.rawSql || "Associated SQL query not available in historical record",
        evidence: i.evidence || "Static syntax analysis heuristic match",
        explanation: i.description,
        recommendation: i.recommendation,
        confidence: i.confidence,
        isLive: true,
        createdAt: i.createdAt,
      }));
    } else if (type === "slow_queries") {
      const queries = await prisma.sqlQuery.findMany({
        where: { connectionId: activeConnection.id },
        include: {
          analyses: {
            include: {
              issues: true,
            },
          },
          benchmarks: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      items = queries
        .filter((q) => {
          const hasBenchmark = q.benchmarks && q.benchmarks.length > 0;
          const hasPerfIssue = q.analyses?.some((a) =>
            a.issues?.some((i) => i.category === "PERFORMANCE")
          );
          return hasBenchmark || hasPerfIssue;
        })
        .map((q) => ({
          id: q.id,
          title: `Query execution (${q.rawSql.substring(0, 50)}...)`,
          query: q.rawSql,
          measuredTimeMs: q.benchmarks?.[0]?.medianTimeMs || null,
          minTimeMs: q.benchmarks?.[0]?.minTimeMs || null,
          maxTimeMs: q.benchmarks?.[0]?.maxTimeMs || null,
          score: q.score,
          issuesCount: q.analyses?.[0]?.issues?.length || 0,
          evidence: q.benchmarks?.[0]
            ? `Measured median execution latency: ${q.benchmarks[0].medianTimeMs.toFixed(2)} ms over ${q.benchmarks[0].iterations} iteration(s).`
            : "Flagged by performance diagnostic heuristic.",
          explanation: q.benchmarks?.[0]
            ? `Execution benchmark recorded ${q.benchmarks[0].rowsProcessed || 0} rows processed.`
            : "Identified as having non-sargable or full scan execution predicates.",
          createdAt: q.createdAt,
        }));
    } else if (type === "index_recs") {
      const adapter = connectionManager.getAdapter(activeConnection.id);
      const recs = await RecommendationEngine.generateRecommendations(adapter, activeConnection.id).catch(() => []);
      items = recs.filter((r) => r.category === "INDEXING");
    } else if (type === "total_queries") {
      const queries = await prisma.sqlQuery.findMany({
        where: { connectionId: activeConnection.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      items = queries.map((q) => ({
        id: q.id,
        query: q.rawSql,
        score: q.score,
        createdAt: q.createdAt,
      }));
    }

    // Filters
    if (severityFilter && severityFilter !== "ALL") {
      items = items.filter((i) => i.severity && i.severity.toUpperCase() === severityFilter.toUpperCase());
    }
    if (tableFilter && tableFilter !== "ALL") {
      items = items.filter((i) =>
        i.affectedTables?.some((t: string) => t.toLowerCase() === tableFilter.toLowerCase()) ||
        i.table?.toLowerCase() === tableFilter.toLowerCase()
      );
    }
    if (categoryFilter && categoryFilter !== "ALL") {
      items = items.filter((i) => i.category && i.category.toUpperCase() === categoryFilter.toUpperCase());
    }
    if (searchFilter && searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      items = items.filter(
        (i) =>
          (i.title && i.title.toLowerCase().includes(q)) ||
          (i.query && i.query.toLowerCase().includes(q)) ||
          (i.explanation && i.explanation.toLowerCase().includes(q))
      );
    }

    res.status(200).json({
      success: true,
      data: {
        type,
        isConnected: true,
        total: items.length,
        items,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "DRILLDOWN_ERROR", message: err.message },
    });
  }
});

export default router;
