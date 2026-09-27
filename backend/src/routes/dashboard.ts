import { Router, Response } from "express";
import { prisma } from "../server";
import { connectionManager } from "../database/connection-manager";
import { HealthCalculator } from "../services/health/health-calculator";

const router = Router();

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
      },
    });

    const recommendations = await prisma.recommendation.findMany({
      where: { connectionId: activeConnection.id },
      take: 10,
      orderBy: { priority: "asc" },
    });

    const indexRecsCount = await prisma.recommendation.count({
      where: {
        connectionId: activeConnection.id,
        category: "INDEXING",
      },
    });

    // Issues count by severity strictly scoped to this connection
    const allIssues = await prisma.queryIssue.findMany({
      where: {
        analysis: {
          query: {
            connectionId: activeConnection.id,
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
          slowQueries: allIssues.filter(
            (i: any) => i.category === "PERFORMANCE" && (i.severity === "HIGH" || i.severity === "CRITICAL")
          ).length,
          criticalIssues,
          highIssues,
          indexRecommendations: indexRecsCount,
          databaseObjects: tablesCount,
          indexCount,
        },
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
            createdAt: q.createdAt,
          })),
        },
        recentRecommendations: recommendations,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message },
    });
  }
});

export default router;
