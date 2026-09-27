import { Router, Request, Response } from "express";
import { prisma } from "../server";
import { connectionManager } from "../database/connection-manager";

const router = Router();

export interface GlobalSearchResult {
  category: "Databases" | "Tables" | "Queries" | "Recommendations" | "Fingerprints" | "Knowledge";
  title: string;
  subtitle: string;
  url: string;
  badge?: string;
}

// GET /api/search - Global search across databases, tables, queries, recommendations, fingerprints, and knowledge
router.get("/", async (req: Request, res: Response) => {
  const query = String(req.query.q || "").trim().toLowerCase();
  if (!query) {
    return res.status(200).json({ success: true, data: [] });
  }

  const results: GlobalSearchResult[] = [];

  try {
    // 1. Search Databases
    const databases = await prisma.databaseConnection.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { database: { contains: query, mode: "insensitive" } },
          { host: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 4,
    });

    for (const d of databases) {
      results.push({
        category: "Databases",
        title: d.name,
        subtitle: `${d.databaseType.toUpperCase()} - ${d.database} on ${d.host}:${d.port}`,
        url: `/databases?id=${d.id}`,
        badge: connectionManager.isConnected(d.id) ? "Online" : d.status,
      });
    }

    // 2. Search Live Tables from active adapter
    const activeAdapter = connectionManager.getActiveAdapter();
    if (activeAdapter) {
      const tables = await activeAdapter.getTables().catch(() => []);
      const matchedTables = tables.filter((t) => t.name.toLowerCase().includes(query)).slice(0, 5);
      for (const t of matchedTables) {
        results.push({
          category: "Tables",
          title: t.name,
          subtitle: `Schema: ${t.schema} - ${t.rowCount.toLocaleString()} rows (${(t.sizeBytes / 1024).toFixed(0)} KB)`,
          url: `/schema?table=${t.name}`,
          badge: t.type,
        });
      }
    }

    // 3. Search SQL Queries
    const queries = await prisma.sqlQuery.findMany({
      where: {
        rawSql: { contains: query, mode: "insensitive" },
      },
      take: 4,
    });

    for (const q of queries) {
      results.push({
        category: "Queries",
        title: q.rawSql.length > 50 ? q.rawSql.substring(0, 50) + "..." : q.rawSql,
        subtitle: `Score: ${q.score}/100 - Fingerprint: ${q.fingerprint || "N/A"}`,
        url: `/optimizer?sql=${encodeURIComponent(q.rawSql)}`,
        badge: `${q.score}/100`,
      });
    }

    // 4. Search Recommendations
    const recs = await prisma.recommendation.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 4,
    });

    for (const r of recs) {
      results.push({
        category: "Recommendations",
        title: r.title,
        subtitle: r.description.length > 70 ? r.description.substring(0, 70) + "..." : r.description,
        url: `/recommendations?id=${r.id}`,
        badge: r.severity,
      });
    }

    // 5. Search Query Fingerprints
    const fingerprints = await prisma.queryFingerprint.findMany({
      where: {
        OR: [
          { fingerprint: { contains: query, mode: "insensitive" } },
          { normalizedSql: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 4,
    });

    for (const fp of fingerprints) {
      results.push({
        category: "Fingerprints",
        title: fp.fingerprint,
        subtitle: `Avg Latency: ${fp.avgLatencyMs.toFixed(1)}ms (${fp.executionCount} executions)`,
        url: `/performance?fp=${fp.fingerprint}`,
        badge: `${fp.avgLatencyMs.toFixed(1)}ms`,
      });
    }

    // 6. Search RAG Knowledge
    const chunks = await prisma.optimizationChunk.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { content: { contains: query, mode: "insensitive" } },
        ],
      },
      take: 4,
    });

    for (const ch of chunks) {
      results.push({
        category: "Knowledge",
        title: ch.title,
        subtitle: ch.content.length > 70 ? ch.content.substring(0, 70) + "..." : ch.content,
        url: `/rag?id=${ch.id}`,
        badge: ch.category,
      });
    }

    res.status(200).json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SEARCH_ERROR", message: err.message },
    });
  }
});

export default router;
