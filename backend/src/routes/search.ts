import { Router, Response } from "express";
import { prisma } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

const router = Router();

router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { q } = req.query;
  if (!q) {
    return res.status(200).json({ success: true, data: [] });
  }

  const queryStr = String(q);

  try {
    // 1. Search table names
    const tables = await prisma.tableMetadata.findMany({
      where: { tableName: { contains: queryStr, mode: "insensitive" } },
      take: 5
    });

    // 2. Search SQL queries
    const queries = await prisma.sqlQuery.findMany({
      where: { rawSql: { contains: queryStr, mode: "insensitive" } },
      take: 5
    });

    // 3. Search Recommendations
    const recs = await prisma.recommendation.findMany({
      where: {
        OR: [
          { title: { contains: queryStr, mode: "insensitive" } },
          { description: { contains: queryStr, mode: "insensitive" } }
        ]
      },
      take: 5
    });

    // 4. Search Issues
    const issues = await prisma.queryIssue.findMany({
      where: {
        OR: [
          { title: { contains: queryStr, mode: "insensitive" } },
          { description: { contains: queryStr, mode: "insensitive" } }
        ]
      },
      take: 5
    });

    // Map into unified search result items
    const results = [
      ...tables.map(t => ({ id: t.id, type: "TABLE", title: t.tableName, subtitle: `Database table metadata` })),
      ...queries.map(q => ({ id: q.id, type: "QUERY", title: q.rawSql.substring(0, 50) + "...", subtitle: `Score: ${q.score}` })),
      ...recs.map(r => ({ id: r.id, type: "RECOMMENDATION", title: r.title, subtitle: `Severity: ${r.severity}` })),
      ...issues.map(i => ({ id: i.id, type: "ISSUE", title: i.title, subtitle: `Severity: ${i.severity}` }))
    ];

    res.status(200).json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

export default router;
