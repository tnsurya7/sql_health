import { Router, Response } from "express";
import { prisma } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { connectionId } = req.query;

  try {
    const metrics = await prisma.performanceMetric.findMany({
      where: connectionId ? { connectionId: String(connectionId) } : {},
      orderBy: { createdAt: "desc" },
      include: {
        query: true
      }
    });

    res.status(200).json({ success: true, data: metrics });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

export default router;
