import { DatabaseAdapter, DatabaseAdapterConfig } from "./adapter.interface";
import { PostgreSqlAdapter } from "./postgres.adapter";
import { MySqlAdapter } from "./mysql.adapter";
import { OracleAdapter } from "./oracle.adapter";
import { SqlServerAdapter } from "./sqlserver.adapter";
import { prisma, logger } from "../server";
import { encryptCredential, decryptCredential } from "../utils/crypto";

export class ConnectionManager {
  private static instance: ConnectionManager;
  private adapters: Map<string, DatabaseAdapter> = new Map();
  private activeConnectionId: string | null = null;

  private constructor() {}

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  public createAdapter(config: DatabaseAdapterConfig): DatabaseAdapter {
    const type = (config.databaseType || "postgresql").toLowerCase();
    switch (type) {
      case "mysql":
        return new MySqlAdapter(config);
      case "oracle":
        return new OracleAdapter(config);
      case "sqlserver":
      case "mssql":
        return new SqlServerAdapter(config);
      case "postgresql":
      case "postgres":
      default:
        return new PostgreSqlAdapter(config);
    }
  }

  /**
   * Initializes all active connections saved in the application database on startup.
   */
  public async initializeConnections(): Promise<void> {
    try {
      const connections = await prisma.databaseConnection.findMany();
      logger.info(`[ConnectionManager] Found ${connections.length} configured database connection(s).`);

      for (const conn of connections) {
        if (conn.isActive) {
          try {
            await this.connect(conn.id);
            if (!this.activeConnectionId) {
              this.activeConnectionId = conn.id;
            }
          } catch (err: any) {
            logger.warn(`[ConnectionManager] Failed to auto-connect to ${conn.name}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      logger.error("[ConnectionManager] Failed to load connections from database:", err);
    }
  }

  public getAdapter(connectionId?: string): DatabaseAdapter {
    const targetId = connectionId || this.activeConnectionId;
    if (!targetId) {
      throw new Error("No database connection specified and no active connection available. Please connect to a database.");
    }

    const adapter = this.adapters.get(targetId);
    if (!adapter) {
      throw new Error(`Database connection '${targetId}' is not connected or registered.`);
    }

    return adapter;
  }

  public getActiveAdapter(): DatabaseAdapter | null {
    if (!this.activeConnectionId) return null;
    return this.adapters.get(this.activeConnectionId) || null;
  }

  public getActiveConnectionId(): string | null {
    return this.activeConnectionId;
  }

  public async setActiveConnection(connectionId: string): Promise<void> {
    // Ensure it is connected
    if (!this.adapters.has(connectionId)) {
      await this.connect(connectionId);
    }

    await prisma.databaseConnection.updateMany({
      data: { isActive: false },
    });

    await prisma.databaseConnection.update({
      where: { id: connectionId },
      data: { isActive: true },
    });

    this.activeConnectionId = connectionId;
    logger.info(`[ConnectionManager] Set active connection to ID: ${connectionId}`);
  }

  public async connect(connectionId: string): Promise<DatabaseAdapter> {
    const connRecord = await prisma.databaseConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connRecord) {
      throw new Error(`Database connection ID '${connectionId}' not found.`);
    }

    // Existing adapter?
    let adapter = this.adapters.get(connectionId);
    if (adapter && adapter.isConnected) {
      return adapter;
    }

    const decryptedPassword = decryptCredential(connRecord.password);

    const config: DatabaseAdapterConfig = {
      connectionId: connRecord.id,
      name: connRecord.name,
      databaseType: connRecord.databaseType,
      host: connRecord.host,
      port: connRecord.port,
      database: connRecord.database,
      schema: connRecord.schema,
      username: connRecord.username,
      password: decryptedPassword,
      ssl: connRecord.ssl,
      readOnly: connRecord.readOnly,
    };

    adapter = this.createAdapter(config);

    try {
      await adapter.connect();
      this.adapters.set(connectionId, adapter);

      await prisma.databaseConnection.update({
        where: { id: connectionId },
        data: {
          status: "ONLINE",
          lastCheckedAt: new Date(),
          errorMessage: null,
        },
      });

      return adapter;
    } catch (err: any) {
      await prisma.databaseConnection.update({
        where: { id: connectionId },
        data: {
          status: "ERROR",
          lastCheckedAt: new Date(),
          errorMessage: err.message || "Connection failed",
        },
      });
      throw err;
    }
  }

  public async disconnect(connectionId: string): Promise<void> {
    const adapter = this.adapters.get(connectionId);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(connectionId);
    }

    if (this.activeConnectionId === connectionId) {
      this.activeConnectionId = null;
    }

    await prisma.databaseConnection.update({
      where: { id: connectionId },
      data: {
        status: "DISCONNECTED",
        isActive: false,
        lastCheckedAt: new Date(),
      },
    });
  }

  public async testConnection(config: DatabaseAdapterConfig): Promise<{ success: boolean; latencyMs: number; version?: string; error?: string }> {
    const adapter = this.createAdapter(config);
    return await adapter.testConnection();
  }

  public isConnected(connectionId: string): boolean {
    const adapter = this.adapters.get(connectionId);
    return Boolean(adapter && adapter.isConnected);
  }

  public getAllActiveAdapters(): Map<string, DatabaseAdapter> {
    return this.adapters;
  }
}

export const connectionManager = ConnectionManager.getInstance();
