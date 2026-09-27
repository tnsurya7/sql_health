import { Router, Request, Response } from "express";
import { RagService } from "../services/rag/rag-service";

const router = Router();

// GET /api/rag/knowledge - List all knowledge documents and chunks
router.get("/knowledge", async (req: Request, res: Response) => {
  try {
    const docs = await RagService.listAll();
    res.status(200).json({ success: true, data: docs });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "RAG_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/rag/search - Search knowledge base via query param
router.get("/search", async (req: Request, res: Response) => {
  const query = (req.query.q || req.query.query) as string;
  const databaseType = req.query.databaseType as string | undefined;
  const category = req.query.category as string | undefined;
  const limit = req.query.limit as string | undefined;

  if (!query) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Search query string is required." },
    });
  }

  try {
    const results = await RagService.retrieveRelevantKnowledge({
      keywords: query.split(/\s+/),
      databaseType,
      category,
      limit: Number(limit) || 10,
    });

    res.status(200).json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "RAG_SEARCH_ERROR", message: error.message },
    });
  }
});

// POST /api/rag/search - Search knowledge base
router.post("/search", async (req: Request, res: Response) => {
  const { query, databaseType, category, limit } = req.body;
  if (!query) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Search query string is required." },
    });
  }

  try {
    const results = await RagService.retrieveRelevantKnowledge({
      keywords: query.split(/\s+/),
      databaseType,
      category,
      limit: Number(limit) || 10,
    });

    res.status(200).json({ success: true, data: results });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "RAG_SEARCH_ERROR", message: error.message },
    });
  }
});

// POST /api/rag/ingest - Add new knowledge document
router.post("/ingest", async (req: Request, res: Response) => {
  const { title, category, databaseType, source, content, keywords } = req.body;
  if (!title || !content || !category) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Title, category, and content are required." },
    });
  }

  try {
    await RagService.addDocument({
      title,
      category,
      databaseType: databaseType || "ALL",
      source: source || "User Submitted",
      content,
      keywords: keywords || [],
    });

    res.status(201).json({ success: true, message: "Knowledge document ingested successfully." });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "RAG_INGEST_ERROR", message: error.message },
    });
  }
});

// DELETE /api/rag/knowledge/:id - Delete knowledge document
router.delete("/knowledge/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await RagService.deleteDocument(id);
    res.status(200).json({ success: true, message: "Document deleted successfully." });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "RAG_DELETE_ERROR", message: error.message },
    });
  }
});

// POST /api/rag/reindex - Re-seed standard knowledge guides
router.post("/reindex", async (req: Request, res: Response) => {
  try {
    await RagService.seedIfEmpty();
    res.status(200).json({ success: true, message: "Knowledge base reindexed successfully." });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "REINDEX_ERROR", message: error.message },
    });
  }
});

export default router;
