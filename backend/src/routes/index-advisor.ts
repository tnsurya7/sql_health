import { Router, Request, Response } from "express";
import { connectionManager } from "../database/connection-manager";
import { IndexAdvisor } from "../services/index-advisor/advisor";
import { SqlParser } from "../services/sql-parser/parser";
import { AstDfsTraversal } from "../services/sql-parser/dfs";

const router = Router();

// POST /api/index-advisor/analyze - Analyze SQL query for missing index access paths
router.post("/analyze", async (req: Request, res: Response) => {
  const { sql, connectionId } = req.body;

  if (!sql) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query string is required." },
    });
  }

  try {
    const targetConnId = connectionId || connectionManager.getActiveConnectionId();
    let tables: any[] = [];
    let columns: any[] = [];
    let indexes: any[] = [];
    let dbType = "postgresql";

    if (targetConnId && connectionManager.isConnected(targetConnId)) {
      const adapter = connectionManager.getAdapter(targetConnId);
      dbType = adapter.config.databaseType;
      tables = await adapter.getTables().catch(() => []);
      columns = await adapter.getColumns().catch(() => []);
      indexes = await adapter.getIndexes().catch(() => []);
    }

    const ast = SqlParser.parse(sql, dbType as any);
    const metrics = AstDfsTraversal.traverse(ast);

    const recommendations = IndexAdvisor.advise(ast, metrics, dbType, tables, columns, indexes);

    res.status(200).json({
      success: true,
      data: {
        recommendations,
        ddlScript: recommendations.map((r) => r.ddl).join("\n\n"),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "INDEX_ADVISOR_ERROR", message: error.message },
    });
  }
});

export default router;
