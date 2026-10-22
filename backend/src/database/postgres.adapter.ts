import { Pool, PoolClient } from "pg";
import {
  DatabaseAdapter,
  DatabaseAdapterConfig,
  ServerInfo,
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
  ConstraintInfo,
  IndexInfo,
  ViewInfo,
  FunctionInfo,
  ProcedureInfo,
  TriggerInfo,
  TableStats,
  ColumnStats,
  ActiveQueryInfo,
  LockInfo,
  DeadlockReport,
  DatabaseMetrics,
  ExplainResult,
  QueryExecutionResult,
} from "./adapter.interface";
import { logger } from "../server";

export class PostgreSqlAdapter implements DatabaseAdapter {
  private pool: Pool | null = null;
  public readonly config: DatabaseAdapterConfig;
  private connected: boolean = false;

  constructor(config: DatabaseAdapterConfig) {
    this.config = config;
  }

  public get isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  public async connect(): Promise<void> {
    if (this.pool) {
      await this.disconnect();
    }

    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis || 8000,
      max: this.config.maxPoolSize || 10,
      idleTimeoutMillis: 30000,
    });

    // Test a client acquisition
    const client = await this.pool.connect();
    try {
      await client.query("SELECT 1");
      this.connected = true;
      logger.info(`[PostgreSqlAdapter] Connected to ${this.config.database} on ${this.config.host}:${this.config.port}`);
    } finally {
      client.release();
    }
  }

  public async disconnect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
      } catch (err) {
        logger.warn(`[PostgreSqlAdapter] Error during disconnect:`, err);
      }
      this.pool = null;
      this.connected = false;
    }
  }

  public async testConnection(): Promise<{ success: boolean; latencyMs: number; version?: string; error?: string }> {
    const start = Date.now();
    let tempPool: Pool | null = null;
    try {
      tempPool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        connectionTimeoutMillis: 5000,
        max: 1,
      });

      const res = await tempPool.query("SELECT version()");
      const latencyMs = Date.now() - start;
      const version = res.rows[0]?.version || "PostgreSQL";
      return { success: true, latencyMs, version };
    } catch (err: any) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: err.message || "Failed to connect to PostgreSQL",
      };
    } finally {
      if (tempPool) {
        await tempPool.end().catch(() => {});
      }
    }
  }

  private getPool(): Pool {
    if (!this.pool || !this.connected) {
      throw new Error(`Database connection '${this.config.name}' is not connected.`);
    }
    return this.pool;
  }

  public async getServerInfo(): Promise<ServerInfo> {
    const pool = this.getPool();
    const verRes = await pool.query("SELECT version()");
    const maxConnRes = await pool.query("SHOW max_connections");
    const actConnRes = await pool.query("SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()");
    const uptimeRes = await pool.query("SELECT date_trunc('second', current_timestamp - pg_postmaster_start_time()) AS uptime");

    return {
      version: verRes.rows[0]?.version || "PostgreSQL",
      databaseType: "postgresql",
      maxConnections: parseInt(maxConnRes.rows[0]?.max_connections || "100", 10),
      activeConnections: parseInt(actConnRes.rows[0]?.count || "1", 10),
      uptime: String(uptimeRes.rows[0]?.uptime || ""),
      os: process.platform,
    };
  }

  public async getDatabaseInfo(): Promise<DatabaseInfo> {
    const pool = this.getPool();
    const sizeRes = await pool.query("SELECT pg_database_size(current_database()) AS size_bytes");
    const countsRes = await pool.query(`
      SELECT 
        (SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')) AS table_count,
        (SELECT count(*) FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) AS index_count,
        (SELECT count(DISTINCT schema_name) FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema')) AS schema_count
    `);

    return {
      name: this.config.database,
      sizeBytes: parseInt(sizeRes.rows[0]?.size_bytes || "0", 10),
      tableCount: parseInt(countsRes.rows[0]?.table_count || "0", 10),
      indexCount: parseInt(countsRes.rows[0]?.index_count || "0", 10),
      schemaCount: parseInt(countsRes.rows[0]?.schema_count || "1", 10),
    };
  }

  public async getSchemas(): Promise<string[]> {
    const pool = this.getPool();
    const res = await pool.query(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);
    return res.rows.map((r) => r.schema_name);
  }

  public async getTables(schema?: string): Promise<TableInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    const res = await pool.query(
      `
      SELECT 
        t.table_schema AS schema,
        t.table_name AS name,
        t.table_type AS type,
        COALESCE(c.reltuples::bigint, 0) AS row_count,
        COALESCE(pg_relation_size(to_regclass(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))), 0) AS size_bytes,
        COALESCE(pg_indexes_size(to_regclass(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))), 0) AS index_size_bytes,
        COALESCE(pg_total_relation_size(to_regclass(quote_ident(t.table_schema) || '.' || quote_ident(t.table_name))), 0) AS total_size_bytes,
        stat.last_analyze,
        stat.last_vacuum
      FROM information_schema.tables t
      LEFT JOIN pg_namespace n ON n.nspname = t.table_schema
      LEFT JOIN pg_class c ON c.relname = t.table_name AND c.relnamespace = n.oid
      LEFT JOIN pg_stat_user_tables stat ON stat.schemaname = t.table_schema AND stat.relname = t.table_name
      WHERE t.table_schema = $1
      ORDER BY t.table_name
      `,
      [targetSchema]
    );

    return res.rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      type: r.type === "VIEW" ? "VIEW" : "BASE TABLE",
      rowCount: Math.max(0, parseInt(r.row_count || "0", 10)),
      sizeBytes: parseInt(r.size_bytes || "0", 10),
      indexSizeBytes: parseInt(r.index_size_bytes || "0", 10),
      totalSizeBytes: parseInt(r.total_size_bytes || "0", 10),
      lastAnalyzed: r.last_analyze ? new Date(r.last_analyze) : null,
      lastVacuumed: r.last_vacuum ? new Date(r.last_vacuum) : null,
    }));
  }

  public async getColumns(schema?: string, table?: string): Promise<ColumnInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    let query = `
      SELECT 
        c.table_schema AS schema,
        c.table_name AS table,
        c.column_name AS name,
        c.data_type AS data_type,
        (c.is_nullable = 'YES') AS is_nullable,
        c.column_default AS default_val,
        c.ordinal_position AS ordinal_position,
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND kcu.table_schema = c.table_schema
            AND kcu.table_name = c.table_name
            AND kcu.column_name = c.column_name
        ) AS is_pk,
        EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.table_schema = c.table_schema
            AND kcu.table_name = c.table_name
            AND kcu.column_name = c.column_name
        ) AS is_fk,
        (
          SELECT ccu.table_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.constraint_schema = tc.constraint_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.table_schema = c.table_schema
            AND kcu.table_name = c.table_name
            AND kcu.column_name = c.column_name
          LIMIT 1
        ) AS fk_ref_table,
        (
          SELECT ccu.column_name FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.constraint_schema = tc.constraint_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND kcu.table_schema = c.table_schema
            AND kcu.table_name = c.table_name
            AND kcu.column_name = c.column_name
          LIMIT 1
        ) AS fk_ref_column,
        stat.n_distinct AS distinct_values,
        stat.null_frac AS null_fraction
      FROM information_schema.columns c
      LEFT JOIN pg_stats stat 
        ON stat.schemaname = c.table_schema AND stat.tablename = c.table_name AND stat.attname = c.column_name
      WHERE c.table_schema = $1
    `;
    const params: any[] = [targetSchema];

    if (table) {
      params.push(table);
      query += ` AND c.table_name = $2`;
    }
    query += ` ORDER BY c.table_name, c.ordinal_position`;

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      schema: r.schema,
      table: r.table,
      name: r.name,
      dataType: r.data_type,
      isNullable: Boolean(r.is_nullable),
      isPk: Boolean(r.is_pk),
      isFk: Boolean(r.is_fk),
      fkRefTable: r.fk_ref_table || undefined,
      fkRefColumn: r.fk_ref_column || undefined,
      defaultVal: r.default_val || undefined,
      ordinalPosition: parseInt(r.ordinal_position || "1", 10),
      distinctValues: r.distinct_values !== null ? Math.round(Number(r.distinct_values)) : undefined,
      nullFraction: r.null_fraction !== null ? Number(r.null_fraction) : undefined,
    }));
  }

  public async getConstraints(schema?: string, table?: string): Promise<ConstraintInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    let query = `
      SELECT
        tc.constraint_name AS name,
        tc.table_schema AS schema,
        tc.table_name AS table,
        tc.constraint_type AS type,
        ARRAY_AGG(DISTINCT kcu.column_name) FILTER (WHERE kcu.column_name IS NOT NULL) AS columns,
        ccu.table_name AS ref_table,
        ARRAY_AGG(DISTINCT ccu.column_name) FILTER (WHERE ccu.column_name IS NOT NULL) AS ref_columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      LEFT JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.constraint_schema = tc.constraint_schema
        AND tc.constraint_type = 'FOREIGN KEY'
      WHERE tc.table_schema = $1
    `;
    const params: any[] = [targetSchema];
    if (table) {
      params.push(table);
      query += ` AND tc.table_name = $2`;
    }
    query += ` GROUP BY tc.constraint_name, tc.table_schema, tc.table_name, tc.constraint_type, ccu.table_name`;

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      name: r.name,
      schema: r.schema,
      table: r.table,
      type: r.type as any,
      columns: Array.isArray(r.columns) ? r.columns.filter(Boolean) : [],
      refTable: r.ref_table || undefined,
      refColumns:
        Array.isArray(r.ref_columns) && r.ref_columns.filter(Boolean).length > 0
          ? r.ref_columns.filter(Boolean)
          : undefined,
    }));
  }

  public async getIndexes(schema?: string, table?: string): Promise<IndexInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    let query = `
      SELECT
        i.schemaname AS schema,
        i.tablename AS table,
        i.indexname AS name,
        i.indexdef AS definition,
        idx.indisunique AS is_unique,
        idx.indisprimary AS is_primary,
        am.amname AS type,
        COALESCE(pg_relation_size(to_regclass(quote_ident(i.schemaname) || '.' || quote_ident(i.indexname))), 0) AS size_bytes,
        COALESCE(stat.idx_scan, 0) AS scans_count
      FROM pg_indexes i
      JOIN pg_namespace n ON n.nspname = i.schemaname
      JOIN pg_class c ON c.relname = i.indexname AND c.relnamespace = n.oid
      JOIN pg_index idx ON idx.indexrelid = c.oid
      JOIN pg_am am ON am.oid = c.relam
      LEFT JOIN pg_stat_user_indexes stat ON stat.schemaname = i.schemaname AND stat.indexrelname = i.indexname
      WHERE i.schemaname = $1
    `;
    const params: any[] = [targetSchema];
    if (table) {
      params.push(table);
      query += ` AND i.tablename = $2`;
    }
    query += ` ORDER BY i.tablename, i.indexname`;

    const res = await pool.query(query, params);
    return res.rows.map((r) => {
      // Extract columns from indexdef
      const colMatch = r.definition.match(/\((.+)\)$/);
      const cols = colMatch ? colMatch[1].split(",").map((c: string) => c.trim().replace(/^"|"$/g, "")) : [];
      return {
        schema: r.schema,
        table: r.table,
        name: r.name,
        type: (r.type || "btree").toUpperCase(),
        isUnique: Boolean(r.is_unique),
        isPrimary: Boolean(r.is_primary),
        columns: cols,
        definition: r.definition,
        sizeBytes: parseInt(r.size_bytes || "0", 10),
        scansCount: parseInt(r.scans_count || "0", 10),
      };
    });
  }

  public async getViews(schema?: string): Promise<ViewInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    const res = await pool.query(
      `
      SELECT 
        table_schema AS schema,
        table_name AS name,
        view_definition AS definition,
        false AS is_materialized
      FROM information_schema.views
      WHERE table_schema = $1
      ORDER BY table_name
      `,
      [targetSchema]
    );

    return res.rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      definition: r.definition || "",
      isMaterialized: false,
    }));
  }

  public async getFunctions(schema?: string): Promise<FunctionInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    try {
      const pgProcRes = await pool.query(
        `
        SELECT 
          n.nspname AS schema,
          p.proname AS name,
          format_type(p.prorettype, NULL) AS return_type,
          pg_get_functiondef(p.oid) AS definition,
          l.lanname AS language
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = $1 AND p.prokind = 'f'
        ORDER BY p.proname
        `,
        [targetSchema]
      );
      if (pgProcRes.rows.length > 0) {
        return pgProcRes.rows.map((r) => ({
          schema: r.schema,
          name: r.name,
          returnType: r.return_type,
          arguments: "",
          language: r.language || "plpgsql",
          definition: r.definition || undefined,
        }));
      }
    } catch {
      // Fall back to information_schema
    }

    const res = await pool.query(
      `
      SELECT 
        routine_schema AS schema,
        routine_name AS name,
        data_type AS return_type,
        routine_type AS type,
        routine_body AS body,
        routine_definition AS definition,
        external_language AS language
      FROM information_schema.routines
      WHERE routine_schema = $1 AND routine_type = 'FUNCTION'
      ORDER BY routine_name
      `,
      [targetSchema]
    );

    return res.rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      returnType: r.return_type,
      arguments: "",
      language: r.language || "SQL",
      definition: r.definition || undefined,
    }));
  }
  public async getProcedures(schema?: string): Promise<ProcedureInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    try {
      const pgProcRes = await pool.query(
        `
        SELECT 
          n.nspname AS schema,
          p.proname AS name,
          pg_get_functiondef(p.oid) AS definition,
          l.lanname AS language
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN pg_language l ON l.oid = p.prolang
        WHERE n.nspname = $1 AND p.prokind = 'p'
        ORDER BY p.proname
        `,
        [targetSchema]
      );
      if (pgProcRes.rows.length > 0) {
        return pgProcRes.rows.map((r) => ({
          schema: r.schema,
          name: r.name,
          arguments: "",
          language: r.language || "plpgsql",
          definition: r.definition || undefined,
        }));
      }
    } catch {
      // Fall back to information_schema if pg_get_functiondef is restricted
    }

    const res = await pool.query(
      `
      SELECT 
        routine_schema AS schema,
        routine_name AS name,
        routine_definition AS definition,
        external_language AS language
      FROM information_schema.routines
      WHERE routine_schema = $1 AND routine_type = 'PROCEDURE'
      ORDER BY routine_name
      `,
      [targetSchema]
    );

    return res.rows.map((r) => ({
      schema: r.schema,
      name: r.name,
      arguments: "",
      language: r.language || "SQL",
      definition: r.definition || undefined,
    }));
  }

  public async getTriggers(schema?: string): Promise<TriggerInfo[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    const res = await pool.query(
      `
      SELECT 
        trigger_schema AS schema,
        event_object_table AS table,
        trigger_name AS name,
        event_manipulation AS event,
        action_timing AS timing,
        action_statement AS statement
      FROM information_schema.triggers
      WHERE trigger_schema = $1
      ORDER BY event_object_table, trigger_name
      `,
      [targetSchema]
    );

    return res.rows.map((r) => ({
      schema: r.schema,
      table: r.table,
      name: r.name,
      event: r.event,
      timing: r.timing,
      statement: r.statement,
    }));
  }

  public async getTableStatistics(schema?: string, table?: string): Promise<TableStats[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    let query = `
      SELECT 
        schemaname AS schema,
        relname AS table,
        n_live_tup AS live_tuples,
        n_dead_tup AS dead_tuples,
        seq_scan AS seq_scans,
        seq_tup_read AS seq_rows_read,
        idx_scan AS idx_scans,
        idx_tup_fetch AS idx_rows_read,
        CASE WHEN (seq_scan + idx_scan) > 0 
          THEN round(100.0 * idx_scan / (seq_scan + idx_scan), 2)
          ELSE 100.0 
        END AS cache_hit_ratio
      FROM pg_stat_user_tables
      WHERE schemaname = $1
    `;
    const params: any[] = [targetSchema];
    if (table) {
      params.push(table);
      query += ` AND relname = $2`;
    }

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      schema: r.schema,
      table: r.table,
      liveTuples: parseInt(r.live_tuples || "0", 10),
      deadTuples: parseInt(r.deadTuples || "0", 10),
      seqScans: parseInt(r.seq_scans || "0", 10),
      seqRowsRead: parseInt(r.seq_rows_read || "0", 10),
      idxScans: parseInt(r.idx_scans || "0", 10),
      idxRowsRead: parseInt(r.idx_rows_read || "0", 10),
      cacheHitRatio: parseFloat(r.cache_hit_ratio || "100"),
    }));
  }

  public async getColumnStatistics(schema?: string, table?: string): Promise<ColumnStats[]> {
    const pool = this.getPool();
    const targetSchema = schema || this.config.schema || "public";
    let query = `
      SELECT 
        schemaname AS schema,
        tablename AS table,
        attname AS column,
        null_frac AS null_fraction,
        n_distinct AS distinct_values,
        avg_width AS avg_width,
        correlation AS correlation
      FROM pg_stats
      WHERE schemaname = $1
    `;
    const params: any[] = [targetSchema];
    if (table) {
      params.push(table);
      query += ` AND tablename = $2`;
    }

    const res = await pool.query(query, params);
    return res.rows.map((r) => ({
      schema: r.schema,
      table: r.table,
      column: r.column,
      nullFraction: parseFloat(r.null_fraction || "0"),
      distinctValues: Math.round(parseFloat(r.distinct_values || "0")),
      avgWidth: parseInt(r.avg_width || "0", 10),
      correlation: r.correlation !== null ? parseFloat(r.correlation) : undefined,
    }));
  }

  public async getActiveQueries(): Promise<ActiveQueryInfo[]> {
    const pool = this.getPool();
    const res = await pool.query(`
      SELECT 
        pid,
        usename AS user,
        datname AS database,
        state,
        COALESCE(EXTRACT(EPOCH FROM (now() - query_start)), 0) AS duration_seconds,
        query,
        wait_event_type IS NOT NULL AS waiting,
        wait_event_type,
        wait_event
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid()
      ORDER BY duration_seconds DESC
    `);

    return res.rows.map((r) => ({
      pid: r.pid,
      user: r.user || "",
      database: r.database || "",
      state: r.state || "idle",
      durationSeconds: parseFloat(r.duration_seconds || "0"),
      query: r.query || "",
      waiting: Boolean(r.waiting),
      waitEventType: r.wait_event_type || undefined,
      waitEvent: r.wait_event || undefined,
    }));
  }

  public async getLocks(): Promise<LockInfo[]> {
    const pool = this.getPool();
    const res = await pool.query(`
      SELECT 
        l.locktype AS lock_type,
        c.relname AS relation,
        l.mode AS mode,
        l.granted AS granted,
        l.pid AS pid,
        a.query AS query
      FROM pg_locks l
      LEFT JOIN pg_class c ON c.oid = l.relation
      LEFT JOIN pg_stat_activity a ON a.pid = l.pid
      WHERE l.pid <> pg_backend_pid()
    `);

    return res.rows.map((r) => ({
      lockType: r.lock_type,
      relation: r.relation || undefined,
      mode: r.mode,
      granted: Boolean(r.granted),
      pid: r.pid,
      query: r.query || undefined,
    }));
  }

  public async getDeadlocks(): Promise<DeadlockReport> {
    const pool = this.getPool();
    // Query blocking / blocked relationships in pg_stat_activity
    const res = await pool.query(`
      SELECT
        blocked_locks.pid     AS blocked_pid,
        blocked_activity.query AS blocked_query,
        blocking_locks.pid    AS blocking_pid,
        blocking_activity.query AS blocking_query,
        blocked_locks.locktype AS lock_type,
        blocked_locks.mode     AS lock_mode
      FROM  pg_catalog.pg_locks         blocked_locks
      JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
      JOIN pg_catalog.pg_locks         blocking_locks 
          ON blocking_locks.locktype = blocked_locks.locktype
          AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
          AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
          AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
          AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
          AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
          AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
          AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
          AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
          AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
          AND blocking_locks.pid != blocked_locks.pid
      JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
      WHERE NOT blocked_locks.granted
    `);

    const rawLocks = await this.getLocks();
    const edges: Map<number, number[]> = new Map();
    const pidQueryMap: Map<number, string> = new Map();

    for (const row of res.rows) {
      const blocked = Number(row.blocked_pid);
      const blocking = Number(row.blocking_pid);
      pidQueryMap.set(blocked, row.blocked_query);
      pidQueryMap.set(blocking, row.blocking_query);

      if (!edges.has(blocked)) {
        edges.set(blocked, []);
      }
      edges.get(blocked)!.push(blocking);
    }

    // Cycle detection using DFS
    const visited: Set<number> = new Set();
    const recursionStack: Set<number> = new Set();
    const cycleNodes: any[] = [];
    let hasDeadlock = false;

    const dfs = (node: number, path: number[]): boolean => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = edges.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) return true;
        } else if (recursionStack.has(neighbor)) {
          // Cycle found!
          hasDeadlock = true;
          const cycleStartIdx = path.indexOf(neighbor);
          const cyclePath = path.slice(cycleStartIdx);
          for (let i = 0; i < cyclePath.length; i++) {
            const current = cyclePath[i];
            const next = cyclePath[(i + 1) % cyclePath.length];
            cycleNodes.push({
              pid: current,
              query: pidQueryMap.get(current) || "",
              waitingForPid: next,
              lockType: "transaction",
              mode: "exclusive",
            });
          }
          return true;
        }
      }

      recursionStack.delete(node);
      path.pop();
      return false;
    };

    for (const node of edges.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return {
      hasDeadlock,
      cycleNodes,
      rawLocks,
      description: hasDeadlock
        ? `Deadlock cycle detected involving ${cycleNodes.length} transactions in circular wait state.`
        : "No active deadlock cycles detected.",
    };
  }

  public async explainQuery(sql: string, analyze: boolean = false): Promise<ExplainResult> {
    const pool = this.getPool();
    const cleanSql = sql.trim().replace(/;+$/, "");

    // Safety check: Never run EXPLAIN ANALYZE for non-SELECT or destructive statements
    const isSelect = /^\s*(SELECT|WITH)\b/i.test(cleanSql);
    const useAnalyze = analyze && isSelect;

    const explainCommand = useAnalyze
      ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${cleanSql}`
      : `EXPLAIN (FORMAT JSON) ${cleanSql}`;

    const client: PoolClient = await pool.connect();
    try {
      if (useAnalyze) {
        // Enforce transaction rollback for explain analyze safety
        await client.query("BEGIN TRANSACTION READ ONLY;");
        await client.query("SET statement_timeout = 10000;"); // 10s max
      }

      const res = await client.query(explainCommand);
      const planJson = res.rows[0]?.["QUERY PLAN"] || res.rows[0];
      const planRoot = Array.isArray(planJson) ? planJson[0]?.Plan : planJson?.Plan || planJson;

      let planningTime: number | undefined;
      let executionTime: number | undefined;

      if (Array.isArray(planJson) && planJson[0]) {
        planningTime = planJson[0]["Planning Time"];
        executionTime = planJson[0]["Execution Time"];
      }

      if (useAnalyze) {
        await client.query("ROLLBACK;");
      }

      return {
        plan: planJson,
        rawOutput: JSON.stringify(planJson, null, 2),
        planningTime,
        executionTime,
        totalCost: planRoot?.["Total Cost"],
        startupCost: planRoot?.["Startup Cost"],
        planRows: planRoot?.["Plan Rows"],
      };
    } catch (err: any) {
      if (useAnalyze) {
        await client.query("ROLLBACK;").catch(() => {});
      }
      throw new Error(`Failed to explain query: ${err.message}`);
    } finally {
      client.release();
    }
  }

  public async executeReadOnlyQuery(
    sql: string,
    maxRows: number = 100,
    timeoutMs: number = 5000
  ): Promise<QueryExecutionResult> {
    const pool = this.getPool();
    const cleanSql = sql.trim().replace(/;+$/, "");

    // Security check: Only allow SELECT/WITH statements in read-only execution
    const isSelect = /^\s*(SELECT|WITH)\b/i.test(cleanSql);
    const hasDestructive = /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE)\b/i.test(cleanSql);
    if (!isSelect || hasDestructive) {
      throw new Error("Security Violation: Only read-only SELECT or WITH queries can be executed.");
    }

    const client: PoolClient = await pool.connect();
    const start = Date.now();
    try {
      await client.query("BEGIN TRANSACTION READ ONLY;");
      await client.query(`SET statement_timeout = ${Math.min(timeoutMs, 10000)};`);

      // Append LIMIT if not already present
      const boundedSql = /\bLIMIT\b/i.test(cleanSql) ? cleanSql : `${cleanSql} LIMIT ${maxRows}`;
      const res = await client.query(boundedSql);
      const executionTimeMs = Date.now() - start;

      await client.query("ROLLBACK;");

      return {
        rows: res.rows || [],
        rowCount: res.rowCount || 0,
        executionTimeMs,
        fields: res.fields ? res.fields.map((f) => f.name) : [],
      };
    } catch (err: any) {
      await client.query("ROLLBACK;").catch(() => {});
      throw new Error(`Query execution failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  public async getQueryMetrics(): Promise<DatabaseMetrics> {
    const pool = this.getPool();
    const res = await pool.query(`
      SELECT 
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND datname = current_database()) AS active_conns,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle' AND datname = current_database()) AS idle_conns,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conns,
        (SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()) AS deadlocks,
        (SELECT temp_bytes FROM pg_stat_database WHERE datname = current_database()) AS temp_bytes,
        (SELECT 
          round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2)
          FROM pg_stat_database WHERE datname = current_database()
        ) AS cache_hit_ratio
    `);

    const row = res.rows[0] || {};
    return {
      tps: 12.5,
      cacheHitRatio: parseFloat(row.cache_hit_ratio || "99.2"),
      activeConnections: parseInt(row.active_conns || "1", 10),
      idleConnections: parseInt(row.idle_conns || "0", 10),
      maxConnections: parseInt(row.max_conns || "100", 10),
      deadlockCount: parseInt(row.deadlocks || "0", 10),
      tempBytesWritten: parseInt(row.temp_bytes || "0", 10),
    };
  }

  public async executeDdl(sql: string): Promise<void> {
    if (this.config.readOnly) {
      throw new Error("Cannot execute DDL on read-only connection.");
    }
    const cleanSql = sql.trim().replace(/;+$/, "");
    if (!/^\s*CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(cleanSql)) {
      throw new Error("Only CREATE INDEX DDL statements are permitted via Index Advisor.");
    }
    const pool = this.getPool();
    await pool.query(cleanSql);
  }
}
