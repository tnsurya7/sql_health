import { Router, Response } from "express";
import { prisma } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// List Queries
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { connectionId } = req.query;

  try {
    const queries = await prisma.sqlQuery.findMany({
      where: connectionId ? { connectionId: String(connectionId) } : {},
      orderBy: { createdAt: "desc" },
      include: {
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            issues: true
          }
        }
      }
    });

    res.status(200).json({ success: true, data: queries });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

// Get Query details by ID
router.get("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const query = await prisma.sqlQuery.findUnique({
      where: { id },
      include: {
        analyses: {
          orderBy: { createdAt: "desc" },
          include: {
            issues: true,
            plans: true
          }
        },
        optimizations: {
          orderBy: { createdAt: "desc" }
        },
        benchmarks: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!query) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Query not found." }
      });
    }

    res.status(200).json({ success: true, data: query });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

export default router;
