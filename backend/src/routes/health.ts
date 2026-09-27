import { Router, Request, Response } from "express";
import { connectionManager } from "../database/connection-manager";
import { HealthCalculator } from "../services/health/health-calculator";
import { prisma } from "../server";

const router = Router();

// GET /api/health - Application status and connected target database health report
router.get("/", async (req: Request, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();
  let adapter;
  if (connectionId && connectionManager.isConnected(connectionId)) {
    adapter = connectionManager.getAdapter(connectionId);
  }

  try {
    const targetDatabaseHealth = adapter
      ? await HealthCalculator.calculateHealth(adapter, connectionId || undefined)
      : null;

    // Overall application system health (Application DB, RAG Knowledge, Configured DBs)
    const totalConnections = await prisma.databaseConnection.count();
    const totalQueries = await prisma.sqlQuery.count();
    const totalKnowledge = await prisma.optimizationDocument.count();

    res.status(200).json({
      success: true,
      data: {
        appStatus: "ONLINE",
        activeConnectionsCount: connectionManager.getAllActiveAdapters().size,
        totalConfiguredDatabases: totalConnections,
        totalQueriesAnalyzed: totalQueries,
        ragDocumentsCount: totalKnowledge,
        targetDatabaseStatus: adapter ? "CONNECTED" : "NO_ACTIVE_DATABASE",
        targetDatabaseHealth,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "HEALTH_CALC_ERROR", message: error.message },
    });
  }
});

// GET /api/health/history - Historical health scores over time for a target database
router.get("/history", async (req: Request, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();
  if (!connectionId) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const scores = await prisma.healthScore.findMany({
      where: { connectionId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    res.status(200).json({ success: true, data: scores.reverse() });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "HEALTH_HISTORY_ERROR", message: error.message },
    });
  }
});

export default router;
