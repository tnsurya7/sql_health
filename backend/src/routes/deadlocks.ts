import { Router, Request, Response } from "express";
import { connectionManager } from "../database/connection-manager";
import { DeadlockDetector } from "../services/deadlock/deadlock-detector";
import { prisma } from "../server";

const router = Router();

// GET /api/deadlocks - Check current live locks and deadlock wait-for cycle graph
router.get("/", async (req: Request, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();
  if (!connectionId || !connectionManager.isConnected(connectionId)) {
    return res.status(200).json({
      success: true,
      data: {
        hasDeadlock: false,
        cyclePids: [],
        cycleTransactions: [],
        waitEdges: [],
        rawLocksCount: 0,
        description: "No active database connected to inspect locks.",
        timestamp: new Date(),
      },
    });
  }

  try {
    const adapter = connectionManager.getAdapter(connectionId);
    const result = await DeadlockDetector.checkDeadlocks(adapter, connectionId);
    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "DEADLOCK_CHECK_ERROR", message: error.message },
    });
  }
});

// GET /api/deadlocks/history - List historical deadlock log events
router.get("/history", async (req: Request, res: Response) => {
  try {
    const logs = await prisma.deadlockLog.findMany({
      orderBy: { detectedAt: "desc" },
      take: 20,
      include: {
        connection: {
          select: { name: true, database: true },
        },
      },
    });

    res.status(200).json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "HISTORY_FETCH_ERROR", message: error.message },
    });
  }
});

export default router;
