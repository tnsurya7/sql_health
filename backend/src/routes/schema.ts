import { Router, Request, Response } from "express";
import { connectionManager } from "../database/connection-manager";
import { SchemaGraph } from "../services/schema-analyzer/schema-graph";

const router = Router();

// Middleware to resolve active adapter
function getActiveAdapter(req: Request) {
  const connectionId = (req.query.connectionId as string) || (req.headers["x-connection-id"] as string);
  const targetId = connectionId || connectionManager.getActiveConnectionId();
  if (!targetId || !connectionManager.isConnected(targetId)) {
    return null;
  }
  return connectionManager.getAdapter(targetId);
}

// GET /api/schema/tables
router.get("/tables", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const schema = (req.query.schema as string) || adapter.config.schema || "public";
    const tables = await adapter.getTables(schema);
    res.status(200).json({ success: true, data: tables });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "SCHEMA_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/table-details - Get full table metadata, columns, indexes, and constraints
router.get("/table-details", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: null });
  }

  try {
    const schema = (req.query.schema as string) || adapter.config.schema || "public";
    const table = req.query.table as string;
    if (!table) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_TABLE", message: "table parameter is required" },
      });
    }

    const tables = await adapter.getTables(schema);
    const tableInfo = tables.find((t) => t.name === table) || {
      schema,
      name: table,
      type: "BASE TABLE",
      rowCount: 0,
      sizeBytes: 0,
      indexSizeBytes: 0,
      totalSizeBytes: 0,
      lastAnalyzed: null,
      lastVacuumed: null,
    };

    const [columns, indexes, constraints] = await Promise.all([
      adapter.getColumns(schema, table),
      adapter.getIndexes(schema, table),
      adapter.getConstraints(schema, table),
    ]);

    res.status(200).json({
      success: true,
      data: {
        table: tableInfo,
        columns,
        indexes,
        constraints,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "TABLE_DETAILS_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/columns
router.get("/columns", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const schema = (req.query.schema as string) || adapter.config.schema || "public";
    const table = req.query.table as string | undefined;
    const columns = await adapter.getColumns(schema, table);
    res.status(200).json({ success: true, data: columns });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "COLUMNS_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/indexes
router.get("/indexes", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const schema = (req.query.schema as string) || adapter.config.schema || "public";
    const table = req.query.table as string | undefined;
    const indexes = await adapter.getIndexes(schema, table);
    res.status(200).json({ success: true, data: indexes });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "INDEXES_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/constraints
router.get("/constraints", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const schema = (req.query.schema as string) || adapter.config.schema || "public";
    const table = req.query.table as string | undefined;
    const constraints = await adapter.getConstraints(schema, table);
    res.status(200).json({ success: true, data: constraints });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "CONSTRAINTS_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/views
router.get("/views", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const views = await adapter.getViews();
    res.status(200).json({ success: true, data: views });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "VIEWS_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/functions
router.get("/functions", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const functions = await adapter.getFunctions();
    res.status(200).json({ success: true, data: functions });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "FUNCTIONS_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/procedures
router.get("/procedures", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const procedures = await adapter.getProcedures();
    res.status(200).json({ success: true, data: procedures });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "PROCEDURES_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/triggers
router.get("/triggers", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: [] });
  }

  try {
    const triggers = await adapter.getTriggers();
    res.status(200).json({ success: true, data: triggers });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "TRIGGERS_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/schema/graph - Generate full schema relationship graph
router.get("/graph", async (req: Request, res: Response) => {
  const adapter = getActiveAdapter(req);
  if (!adapter) {
    return res.status(200).json({ success: true, data: { nodes: [], edges: [] } });
  }

  try {
    const tables = await adapter.getTables();
    const columns = await adapter.getColumns();
    const constraints = await adapter.getConstraints();
    const indexes = await adapter.getIndexes();

    const graph = new SchemaGraph(tables, columns, constraints, indexes);

    res.status(200).json({
      success: true,
      data: {
        nodes: Array.from(graph.nodes.values()),
        edges: graph.edges,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "GRAPH_BUILD_ERROR", message: error.message },
    });
  }
});

export default router;
