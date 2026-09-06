import { Router, Response } from "express";
import { prisma } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Get Recommendations
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { connectionId } = req.query;

  try {
    const recs = await prisma.recommendation.findMany({
      where: connectionId ? { connectionId: String(connectionId) } : {},
      orderBy: { createdAt: "desc" }
    });

    res.status(200).json({ success: true, data: recs });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

// Update Recommendation Status
router.patch("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body; // e.g. ACCEPTED, REJECTED, APPLIED

  if (!status) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Status is required." }
    });
  }

  try {
    const updated = await prisma.recommendation.update({
      where: { id },
      data: { status }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: "UPDATE_RECOMMENDATION",
        details: `Recommendation ID ${id} status set to ${status}`
      }
    });

    res.status(200).json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

export default router;
