import { Router, Request, Response } from "express";
import { prisma, logger } from "../server";
import { connectionManager } from "../database/connection-manager";
import { encryptCredential } from "../utils/crypto";
import { SampleDbSeeder } from "../database/sample-db-seeder";

const router = Router();

// GET /api/databases - List all database connections
router.get("/", async (req: Request, res: Response) => {
  try {
    const connections = await prisma.databaseConnection.findMany({
      orderBy: { createdAt: "desc" },
    });

    const sanitized = connections.map((conn: any) => ({
      id: conn.id,
      name: conn.name,
      databaseType: conn.databaseType,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      schema: conn.schema,
      username: conn.username,
      ssl: conn.ssl,
      readOnly: conn.readOnly,
      isActive: conn.isActive,
      status: connectionManager.isConnected(conn.id) ? "ONLINE" : conn.status,
      lastCheckedAt: conn.lastCheckedAt,
      errorMessage: conn.errorMessage,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    }));

    res.status(200).json({ success: true, data: sanitized });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "DB_FETCH_ERROR", message: error.message },
    });
  }
});

// POST /api/databases/test - Test connection parameters before saving
router.post("/test", async (req: Request, res: Response) => {
  const { name, databaseType, host, port, database, schema, username, password, ssl, readOnly } = req.body;

  try {
    const result = await connectionManager.testConnection({
      connectionId: "test-temp",
      name: name || "Test Connection",
      databaseType: databaseType || "postgresql",
      host: host || "localhost",
      port: Number(port) || 5432,
      database: database || "postgres",
      schema: schema || "public",
      username: username || "postgres",
      password: password || "",
      ssl: Boolean(ssl),
      readOnly: Boolean(readOnly),
    });

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: { code: "TEST_FAILED", message: error.message },
    });
  }
});

// POST /api/databases - Create a new database connection
router.post("/", async (req: Request, res: Response) => {
  const { name, databaseType, host, port, database, schema, username, password, ssl, readOnly } = req.body;

  if (!name || !host || !database || !username) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Name, host, database, and username are required." },
    });
  }

  try {
    const encryptedPassword = encryptCredential(password || "");

    const newConn = await prisma.databaseConnection.create({
      data: {
        name,
        databaseType: databaseType || "postgresql",
        host,
        port: Number(port) || 5432,
        database,
        schema: schema || "public",
        username,
        password: encryptedPassword,
        ssl: Boolean(ssl),
        readOnly: readOnly !== undefined ? Boolean(readOnly) : true,
        isActive: false,
        status: "DISCONNECTED",
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: newConn.id,
        name: newConn.name,
        databaseType: newConn.databaseType,
        host: newConn.host,
        port: newConn.port,
        database: newConn.database,
        schema: newConn.schema,
        username: newConn.username,
        ssl: newConn.ssl,
        readOnly: newConn.readOnly,
        status: newConn.status,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "CREATE_FAILED", message: error.message },
    });
  }
});

// PUT /api/databases/:id - Update connection
router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, databaseType, host, port, database, schema, username, password, ssl, readOnly } = req.body;

  try {
    const updateData: any = {
      name,
      databaseType,
      host,
      port: port ? Number(port) : undefined,
      database,
      schema,
      username,
      ssl: ssl !== undefined ? Boolean(ssl) : undefined,
      readOnly: readOnly !== undefined ? Boolean(readOnly) : undefined,
    };

    if (password && password.trim() !== "") {
      updateData.password = encryptCredential(password);
    }

    const updated = await prisma.databaseConnection.update({
      where: { id },
      data: updateData,
    });

    res.status(200).json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        databaseType: updated.databaseType,
        host: updated.host,
        port: updated.port,
        database: updated.database,
        schema: updated.schema,
        username: updated.username,
        ssl: updated.ssl,
        readOnly: updated.readOnly,
        status: updated.status,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "UPDATE_FAILED", message: error.message },
    });
  }
});

// DELETE /api/databases/:id - Delete connection
router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await connectionManager.disconnect(id);
    await prisma.databaseConnection.delete({ where: { id } });
    res.status(200).json({ success: true, message: "Database connection deleted." });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "DELETE_FAILED", message: error.message },
    });
  }
});

// POST /api/databases/:id/connect - Connect to target database
router.post("/:id/connect", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await connectionManager.connect(id);
    await connectionManager.setActiveConnection(id);
    res.status(200).json({ success: true, message: "Connected successfully." });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: { code: "CONNECT_FAILED", message: error.message },
    });
  }
});

// POST /api/databases/:id/disconnect - Disconnect from target database
router.post("/:id/disconnect", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await connectionManager.disconnect(id);
    res.status(200).json({ success: true, message: "Disconnected successfully." });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "DISCONNECT_FAILED", message: error.message },
    });
  }
});

// POST /api/databases/:id/activate - Set as active target database
router.post("/:id/activate", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await connectionManager.setActiveConnection(id);
    res.status(200).json({ success: true, message: "Active database set successfully." });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: { code: "ACTIVATE_FAILED", message: error.message },
    });
  }
});

// POST /api/databases/:id/seed-sample - Seeds real PostgreSQL sample dataset into target database
router.post("/:id/seed-sample", async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const adapter = await connectionManager.connect(id);
    const result = await SampleDbSeeder.seedPostgres(adapter);
    res.status(200).json({
      success: true,
      data: result,
      message: `Sample dataset provisioned: ${result.tablesCreated} tables created/verified, ${result.rowsInserted} rows populated.`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "SEED_FAILED", message: error.message },
    });
  }
});

export default router;
