import { Pool } from "pg";
import { logger } from "../server";

class ConnectionManager {
  private pools: Map<string, Pool> = new Map();

  public async getPool(config: {
    id: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password?: string;
  }): Promise<Pool> {
    const key = config.id;
    if (this.pools.has(key)) {
      return this.pools.get(key)!;
    }

    logger.info(`Creating new PostgreSQL pool for connection: ${config.database}@${config.host}:${config.port}`);
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Test connection
    const client = await pool.connect();
    client.release();

    this.pools.set(key, pool);
    return pool;
  }

  public async removePool(id: string): Promise<void> {
    const pool = this.pools.get(id);
    if (pool) {
      await pool.end();
      this.pools.delete(id);
      logger.info(`Closed database pool for connection ID: ${id}`);
    }
  }

  public async testConnection(config: {
    host: string;
    port: number;
    database: string;
    username: string;
    password?: string;
  }): Promise<boolean> {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: 3000,
    });

    try {
      const client = await pool.connect();
      client.release();
      await pool.end();
      return true;
    } catch (error) {
      logger.error("Connection test failed:", error);
      await pool.end();
      throw error;
    }
  }
}

export const connectionManager = new ConnectionManager();
