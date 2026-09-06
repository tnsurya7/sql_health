import { Router, Response } from "express";
import { prisma } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

// Get whole schema metadata tree
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { connectionId } = req.query;
  if (!connectionId) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "connectionId is required." }
    });
  }

  try {
    const meta = await prisma.databaseMetadata.findFirst({
      where: { connectionId: String(connectionId) },
      include: {
        tables: {
          include: {
            columns: true,
            indexes: true
          }
        }
      }
    });

    if (!meta) {
      return res.status(200).json({
        success: true,
        data: { tables: [], views: [], functions: [], procedures: [], triggers: [] }
      });
    }

    // Convert table row counts and sizes from BigInt to Number/String for JSON serialization
    const tables = meta.tables.map(t => ({
      ...t,
      rowCount: t.rowCount,
      sizeBytes: t.sizeBytes.toString()
    }));

    res.status(200).json({
      success: true,
      data: {
        tables,
        views: [], // Default empty or mock for local mode
        functions: [],
        procedures: [],
        triggers: []
      }
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

// Tables list
router.get("/tables", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { connectionId } = req.query;
  if (!connectionId) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "connectionId is required." }
    });
  }

  try {
    const metadata = await prisma.databaseMetadata.findFirst({
      where: { connectionId: String(connectionId) }
    });

    if (!metadata) {
      return res.status(200).json({ success: true, data: [] });
    }

    const tables = await prisma.tableMetadata.findMany({
      where: { metadataId: metadata.id },
      include: { columns: true, indexes: true }
    });

    const serializedTables = tables.map(t => ({
      ...t,
      sizeBytes: t.sizeBytes.toString()
    }));

    res.status(200).json({ success: true, data: serializedTables });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

export default router;
