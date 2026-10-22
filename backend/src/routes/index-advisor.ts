import { Router, Request, Response } from "express";
import { connectionManager } from "../database/connection-manager";
import { IndexAdvisor } from "../services/index-advisor/advisor";
import { SqlParser } from "../services/sql-parser/parser";
import { AstDfsTraversal } from "../services/sql-parser/dfs";
import { prisma, logger } from "../server";

const router = Router();

// GET /api/index-advisor/recommendations - Comprehensive workload & schema inspection recommendations
router.get("/recommendations", async (req: Request, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();
  const mode = (req.query.mode as string) || "all"; // "all" | "schema" | "workload"

  if (!connectionId || !connectionManager.isConnected(connectionId)) {
    return res.status(200).json({
      success: true,
      data: {
        isConnected: false,
        message: "Database is disconnected. Please connect a target database to inspect schema and generate index advisories.",
        schemaModeCount: 0,
        workloadModeCount: 0,
        recommendations: [],
      },
    });
  }

  try {
    const adapter = connectionManager.getAdapter(connectionId);
    const dbType = adapter.config.databaseType;
    const tables = await adapter.getTables().catch(() => []);
    const columns = await adapter.getColumns().catch(() => []);
    const indexes = await adapter.getIndexes().catch(() => []);
    const constraints = await adapter.getConstraints().catch(() => []);

    // 1. Schema Inspection Mode (unindexed foreign keys and key pathways)
    const schemaRecs = (mode === "all" || mode === "schema")
      ? IndexAdvisor.adviseSchema(tables, columns, indexes, constraints, dbType)
      : [];

    // 2. Workload-Aware Mode (analyzed queries stored for this connection)
    let workloadRecs: any[] = [];
    if (mode === "all" || mode === "workload") {
      const storedQueries = await prisma.sqlQuery.findMany({
        where: { connectionId },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const workloadInput = storedQueries.map((q) => ({
        sql: q.rawSql,
        frequency: 1,
      }));

      workloadRecs = IndexAdvisor.adviseWorkloadQueries(workloadInput, tables, columns, indexes, dbType);
    }

    // Combine and deduplicate
    const combinedRecs = [...schemaRecs, ...workloadRecs];
    const seenDdl = new Set<string>();
    const deduplicated = combinedRecs.filter((r) => {
      const key = `${r.table.toLowerCase()}_${r.columns.join("_").toLowerCase()}`;
      if (seenDdl.has(key)) return false;
      seenDdl.add(key);
      return true;
    });

    res.status(200).json({
      success: true,
      data: {
        isConnected: true,
        databaseName: adapter.config.database,
        schema: adapter.config.schema || "public",
        schemaModeCount: schemaRecs.length,
        workloadModeCount: workloadRecs.length,
        recommendations: deduplicated,
      },
    });
  } catch (error: any) {
    logger.error("[IndexAdvisorRoute] Error generating recommendations:", error);
    res.status(500).json({
      success: false,
      error: { code: "INDEX_ADVISOR_ERROR", message: error.message },
    });
  }
});

// POST /api/index-advisor/analyze - Analyze specific SQL query for missing index access paths
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

    const recommendations = IndexAdvisor.advise(ast, metrics, dbType, tables, columns, indexes, sql);

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

// POST /api/index-advisor/apply - Safe index creation requiring explicit user authorization
router.post("/apply", async (req: Request, res: Response) => {
  const { ddl, connectionId, confirmed } = req.body;

  if (!ddl) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "DDL statement is required." },
    });
  }

  if (!confirmed) {
    return res.status(400).json({
      success: false,
      error: {
        code: "AUTHORIZATION_REQUIRED",
        message: "Explicit user authorization is required to execute DDL statements on the database.",
      },
    });
  }

  try {
    const targetConnId = connectionId || connectionManager.getActiveConnectionId();
    if (!targetConnId || !connectionManager.isConnected(targetConnId)) {
      return res.status(400).json({
        success: false,
        error: { code: "DISCONNECTED", message: "Target database is not connected." },
      });
    }

    const adapter = connectionManager.getAdapter(targetConnId);
    if (adapter.config.readOnly) {
      return res.status(403).json({
        success: false,
        error: {
          code: "READ_ONLY_GUARD",
          message: "Database connection is configured in Read-Only mode. Disable Read-Only guard in Settings to execute DDL.",
        },
      });
    }

    // Execute safe DDL
    if (adapter.executeDdl) {
      await adapter.executeDdl(ddl);
    } else {
      throw new Error(`DDL execution is not supported by adapter ${adapter.config.databaseType}.`);
    }

    res.status(200).json({
      success: true,
      message: "Index created successfully on live database.",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "INDEX_CREATION_FAILED", message: error.message },
    });
  }
});

export default router;
