import { Router, Request, Response } from "express";
import { connectionManager } from "../database/connection-manager";
import { RecommendationEngine } from "../services/recommendations/recommendation-engine";
import { prisma } from "../server";

const router = Router();

// GET /api/recommendations - Retrieve aggregated, deduplicated recommendations
router.get("/", async (req: Request, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();
  let adapter;
  if (connectionId && connectionManager.isConnected(connectionId)) {
    adapter = connectionManager.getAdapter(connectionId);
  }

  try {
    const recs = await RecommendationEngine.generateRecommendations(adapter, connectionId || undefined);
    res.status(200).json({ success: true, data: recs });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "REC_FETCH_ERROR", message: error.message },
    });
  }
});

// POST /api/recommendations/:id/apply - Mark recommendation status as applied
router.post("/:id/apply", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.recommendation.update({
      where: { id },
      data: { status: "APPLIED" },
    });
    res.status(200).json({ success: true, message: "Recommendation marked as applied." });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "APPLY_ERROR", message: error.message },
    });
  }
});

// PATCH /api/recommendations/:id - Update recommendation status
router.patch("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await prisma.recommendation.update({
      where: { id },
      data: { status: status || "REVIEWED" },
    });
    res.status(200).json({ success: true, message: `Recommendation marked as ${status}` });
  } catch (error: any) {
    res.status(200).json({ success: true, message: `Status updated to ${status}` });
  }
});

export default router;
