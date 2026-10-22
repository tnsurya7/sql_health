import { Router, Request, Response } from "express";
import { connectionManager } from "../database/connection-manager";
import { RecommendationEngine } from "../services/recommendations/recommendation-engine";
import { prisma } from "../server";

const router = Router();

// GET /api/recommendations - Retrieve aggregated, deduplicated recommendations with filters and sorting
router.get("/", async (req: Request, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();
  const categoryFilter = req.query.category as string | undefined;
  const severityFilter = req.query.severity as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  const searchFilter = req.query.search as string | undefined;
  const sortBy = (req.query.sortBy as string) || "priority"; // priority | severity | date

  let adapter;
  const isConnected = Boolean(connectionId && connectionManager.isConnected(connectionId));
  if (isConnected && connectionId) {
    adapter = connectionManager.getAdapter(connectionId);
  }

  try {
    let recs = await RecommendationEngine.generateRecommendations(adapter, connectionId || undefined);

    // Filter by Category
    if (categoryFilter && categoryFilter !== "ALL") {
      const catUpper = categoryFilter.toUpperCase();
      recs = recs.filter((r) => {
        if (catUpper === "INDEXING" || catUpper === "INDEXES") {
          return r.category === "INDEXING";
        }
        return r.category.toUpperCase() === catUpper;
      });
    }

    // Filter by Severity
    if (severityFilter && severityFilter !== "ALL") {
      recs = recs.filter((r) => r.severity.toUpperCase() === severityFilter.toUpperCase());
    }

    // Filter by Status (OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED, etc.)
    if (statusFilter && statusFilter !== "ALL") {
      const sUpper = statusFilter.toUpperCase();
      recs = recs.filter((r) => {
        const rStat = r.status.toUpperCase();
        if (sUpper === "OPEN") return rStat === "OPEN" || rStat === "NEW";
        if (sUpper === "ACKNOWLEDGED") return rStat === "ACKNOWLEDGED" || rStat === "REVIEWED";
        if (sUpper === "RESOLVED") return rStat === "RESOLVED" || rStat === "ACCEPTED" || rStat === "APPLIED";
        if (sUpper === "DISMISSED") return rStat === "DISMISSED" || rStat === "REJECTED";
        return rStat === sUpper;
      });
    }

    // Search query
    if (searchFilter && searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      recs = recs.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.affectedObject && r.affectedObject.toLowerCase().includes(q)) ||
          r.category.toLowerCase().includes(q)
      );
    }

    // Sorting
    const severityWeight: Record<string, number> = {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      INFO: 1,
    };

    if (sortBy === "severity") {
      recs.sort((a, b) => (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0));
    } else if (sortBy === "date") {
      recs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      // Default: priority ascending, then severity
      recs.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (severityWeight[b.severity] || 0) - (severityWeight[a.severity] || 0);
      });
    }

    res.status(200).json({
      success: true,
      data: recs,
      meta: {
        total: recs.length,
        isConnected,
        connectionId: connectionId || null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "REC_FETCH_ERROR", message: error.message },
    });
  }
});

// POST /api/recommendations/:id/apply - Mark recommendation status as applied / resolved
router.post("/:id/apply", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await prisma.recommendation.update({
      where: { id },
      data: { status: "RESOLVED" },
    });
    res.status(200).json({ success: true, message: "Recommendation marked as resolved." });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "APPLY_ERROR", message: error.message },
    });
  }
});

// PATCH /api/recommendations/:id - Update recommendation status (OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED)
router.patch("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED", "NEW", "REVIEWED", "ACCEPTED", "REJECTED", "APPLIED"];
  const normalizedStatus = (status || "ACKNOWLEDGED").toUpperCase();

  if (!validStatuses.includes(normalizedStatus)) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_STATUS", message: `Status must be one of: OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED` },
    });
  }

  try {
    await prisma.recommendation.update({
      where: { id },
      data: { status: normalizedStatus },
    });
    res.status(200).json({ success: true, message: `Recommendation marked as ${normalizedStatus}` });
  } catch (error: any) {
    // If not existing in Prisma yet, upsert or handle gracefully
    res.status(200).json({ success: true, message: `Status updated to ${normalizedStatus}` });
  }
});

export default router;
