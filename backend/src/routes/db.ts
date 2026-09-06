import { Router, Response } from "express";
import { prisma, logger } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { connectionManager } from "../database/connection-manager";
import { SchemaAnalyzer } from "../services/schema-analyzer";
import { DemoDbService } from "../services/demo-db";
import { HealthScoreEngine } from "../services/health-score";

const router = Router();

// Test Connection
router.post("/test", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { host, port, database, username, password } = req.body;
  if (!host || !port || !database || !username) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Host, port, database, and username are required." }
    });
  }

  try {
    await connectionManager.testConnection({ host, port: Number(port), database, username, password });
    res.status(200).json({ success: true, message: "Connection successful." });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { code: "CONNECTION_FAILED", message: err.message }
    });
  }
});

// Save / Add Connection
router.post("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { name, host, port, database, username, password } = req.body;
  if (!name || !host || !port || !database || !username) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "All fields are required." }
    });
  }

  try {
    const conn = await prisma.databaseConnection.create({
      data: {
        name,
        host,
        port: Number(port),
        database,
        username,
        password: password || "",
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: "ADD_CONNECTION",
        details: `Saved connection: ${name} (${database})`
      }
    });

    res.status(201).json({ success: true, data: conn });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

// List Connections
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const conns = await prisma.databaseConnection.findMany({
      orderBy: { createdAt: "desc" }
    });
    res.status(200).json({ success: true, data: conns });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SERVER_ERROR", message: err.message }
    });
  }
});

// Connect / Activate Connection
router.post("/connect", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Connection ID is required." }
    });
  }

  try {
    const dbConn = await prisma.databaseConnection.findUnique({ where: { id } });
    if (!dbConn) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Database connection not found." }
      });
    }

    // Set all other connections as inactive, and this one as active
    await prisma.databaseConnection.updateMany({
      where: { id: { not: id } },
      data: { isActive: false }
    });

    const activeConn = await prisma.databaseConnection.update({
      where: { id },
      data: { isActive: true }
    });

    // Initialize Connection Pool
    const pool = await connectionManager.getPool(activeConn);

    // Analyze schema metadata in background & save to DB
    const metadata = await SchemaAnalyzer.analyze(pool);

    // Save schemas to database_metadata, table_metadata, column_metadata, index_metadata
    await prisma.databaseMetadata.deleteMany({ where: { connectionId: id } });
    
    const dbMetadata = await prisma.databaseMetadata.create({
      data: {
        connectionId: id,
        schemaName: "public"
      }
    });

    for (const table of metadata.tables) {
      const dbTable = await prisma.tableMetadata.create({
        data: {
          metadataId: dbMetadata.id,
          tableName: table.name,
          rowCount: table.rowCount,
          sizeBytes: BigInt(table.sizeBytes)
        }
      });

      for (const col of table.columns) {
        await prisma.columnMetadata.create({
          data: {
            tableId: dbTable.id,
            columnName: col.name,
            dataType: col.type,
            isNullable: col.isNullable,
            isPk: col.isPk,
            isFk: col.isFk,
            defaultVal: col.default ? String(col.default) : null
          }
        });
      }

      for (const idx of table.indexes) {
        // Parse columns from index definition if possible
        const colMatches = idx.definition.match(/\(([^)]+)\)/);
        const columns = colMatches ? colMatches[1].split(",").map((s: string) => s.trim()) : [];
        await prisma.indexMetadata.create({
          data: {
            tableId: dbTable.id,
            indexName: idx.name,
            indexDef: idx.definition,
            columns,
            isUnique: idx.definition.toUpperCase().includes("UNIQUE"),
            isPrimary: idx.name.endsWith("_pkey")
          }
        });
      }
    }

    // Calculate database health scores based on schema & write to db
    const issues: any[] = []; // no queries analyzed yet, so 0 issues
    const recommendations: any[] = [];
    const healthScores = HealthScoreEngine.calculate(
      {
        tables: metadata.tables,
        viewsCount: metadata.views.length,
        triggersCount: metadata.triggers.length
      },
      issues,
      recommendations
    );

    await prisma.healthScore.create({
      data: {
        connectionId: id,
        scorePerf: healthScores.performance,
        scoreSec: healthScores.security,
        scoreMaint: healthScores.maintainability,
        scoreIdx: healthScores.indexHealth,
        scoreSchema: healthScores.schemaQuality,
        scoreQuery: healthScores.queryQuality,
        scoreOver: healthScores.overall
      }
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user?.id,
        action: "CONNECT",
        details: `Connected database & initialized metadata: ${dbConn.name}`
      }
    });

    res.status(200).json({
      success: true,
      data: {
        connection: activeConn,
        metadataSummary: {
          tablesCount: metadata.tables.length,
          viewsCount: metadata.views.length,
          functionsCount: metadata.functions.length,
          proceduresCount: metadata.procedures.length,
          triggersCount: metadata.triggers.length
        }
      }
    });
  } catch (err: any) {
    logger.error(err);
    res.status(500).json({
      success: false,
      error: { code: "CONNECT_FAILED", message: err.message }
    });
  }
});

// Initialize / Seed Demo DB Tables
router.post("/seed-demo", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const activeConn = await prisma.databaseConnection.findFirst({
      where: { isActive: true }
    });

    if (!activeConn) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_ACTIVE_CONNECTION", message: "Please connect a database connection first." }
      });
    }

    const pool = await connectionManager.getPool(activeConn);
    await DemoDbService.initializeDemoDb(pool);

    // Refresh metadata after seeding
    const metadata = await SchemaAnalyzer.analyze(pool);
    
    // Save metadata
    const dbMetadata = await prisma.databaseMetadata.findFirst({
      where: { connectionId: activeConn.id }
    });

    if (dbMetadata) {
      await prisma.databaseMetadata.delete({ where: { id: dbMetadata.id } });
    }

    const newDbMetadata = await prisma.databaseMetadata.create({
      data: {
        connectionId: activeConn.id,
        schemaName: "public"
      }
    });

    for (const table of metadata.tables) {
      const dbTable = await prisma.tableMetadata.create({
        data: {
          metadataId: newDbMetadata.id,
          tableName: table.name,
          rowCount: table.rowCount,
          sizeBytes: BigInt(table.sizeBytes)
        }
      });

      for (const col of table.columns) {
        await prisma.columnMetadata.create({
          data: {
            tableId: dbTable.id,
            columnName: col.name,
            dataType: col.type,
            isNullable: col.isNullable,
            isPk: col.isPk,
            isFk: col.isFk,
            defaultVal: col.default ? String(col.default) : null
          }
        });
      }

      for (const idx of table.indexes) {
        const colMatches = idx.definition.match(/\(([^)]+)\)/);
        const columns = colMatches ? colMatches[1].split(",").map((s: string) => s.trim()) : [];
        await prisma.indexMetadata.create({
          data: {
            tableId: dbTable.id,
            indexName: idx.name,
            indexDef: idx.definition,
            columns,
            isUnique: idx.definition.toUpperCase().includes("UNIQUE"),
            isPrimary: idx.name.endsWith("_pkey")
          }
        });
      }
    }

    // Add some index recommendations automatically for the seeded demo DB to test optimization features
    await prisma.recommendation.deleteMany({ where: { connectionId: activeConn.id } });
    await prisma.recommendation.createMany({
      data: [
        {
          connectionId: activeConn.id,
          category: "INDEXES",
          severity: "HIGH",
          title: "Missing Index on orders(customer_id)",
          description: "Frequent joins between customers and orders table require an index on customer_id to avoid slow sequential scans.",
          evidence: "SELECT * FROM orders WHERE customer_id = ...",
          suggestedSql: "CREATE INDEX idx_orders_customer_id ON orders(customer_id);",
          status: "NEW"
        },
        {
          connectionId: activeConn.id,
          category: "INDEXES",
          severity: "HIGH",
          title: "Missing Index on order_items(order_id)",
          description: "Joining orders and order_items will perform a full table scan of order_items without an index on order_id.",
          evidence: "SELECT * FROM order_items WHERE order_id = ...",
          suggestedSql: "CREATE INDEX idx_order_items_order_id ON order_items(order_id);",
          status: "NEW"
        },
        {
          connectionId: activeConn.id,
          category: "INDEXES",
          severity: "MEDIUM",
          title: "Missing Index on payments(order_id)",
          description: "Querying payments by order_id is currently doing a full table scan.",
          evidence: "SELECT * FROM payments WHERE order_id = ...",
          suggestedSql: "CREATE INDEX idx_payments_order_id ON payments(order_id);",
          status: "NEW"
        }
      ]
    });

    res.status(200).json({ success: true, message: "Demo database successfully initialized and metadata indexed." });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SEED_FAILED", message: err.message }
    });
  }
});

export default router;
