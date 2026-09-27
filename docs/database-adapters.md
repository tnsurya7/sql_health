# SQLSense AI - Database Adapters Architecture

SQLSense AI connects to databases via a decoupled **Database Adapter Abstraction**. This enables adding new database engines (e.g. MySQL, Oracle, SQL Server) without changing the core analysis or optimization pipeline.

## Database Adapter Interface (`DatabaseAdapter`)

Every adapter implements the `DatabaseAdapter` interface defined in `backend/src/database/adapter.interface.ts`:

```typescript
export interface DatabaseAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<{ success: boolean; message: string; version?: string }>;
  getServerInfo(): Promise<Record<string, any>>;
  getDatabaseInfo(): Promise<Record<string, any>>;
  getSchemas(): Promise<string[]>;
  getTables(schema?: string): Promise<TableInfo[]>;
  getColumns(table: string, schema?: string): Promise<ColumnInfo[]>;
  getIndexes(table?: string, schema?: string): Promise<IndexInfo[]>;
  getConstraints(table?: string, schema?: string): Promise<ConstraintInfo[]>;
  getActiveQueries(): Promise<ActiveQueryInfo[]>;
  getLocks(): Promise<LockInfo[]>;
  getDeadlocks(): Promise<DeadlockInfo[]>;
  explainQuery(sql: string, analyze?: boolean): Promise<any>;
  executeReadOnlyQuery(sql: string, timeoutMs?: number, maxRows?: number): Promise<any[]>;
}
```

## Implemented Adapters

1. **PostgreSQL Adapter (`PostgresAdapter`)**:
   - Uses native `pg.Pool` connection pooling.
   - Queries `information_schema` and `pg_stat_*` catalog views for metadata and index definitions.
   - Executes `EXPLAIN (FORMAT JSON)` and safe `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.
   - Sandbox query execution with `statement_timeout` (5000ms default) and `LIMIT` clamping.
   - Live deadlock and active query introspection via `pg_locks` and `pg_stat_activity`.

2. **MySQL Adapter (`MySqlAdapter`)**:
   - Implements `EXPLAIN FORMAT=JSON` and `information_schema` catalog querying.
   - Handles MySQL backtick identifier escaping and storage engine metadata.

3. **Oracle Adapter (`OracleAdapter`)**:
   - Maps `ALL_TABLES`, `ALL_TAB_COLUMNS`, and `ALL_INDEXES`.
   - Implements Oracle `EXPLAIN PLAN FOR` integration.

4. **SQL Server Adapter (`SqlServerAdapter`)**:
   - Maps `sys.tables`, `sys.columns`, and `sys.indexes`.
   - Implements `SET SHOWPLAN_XML` execution plan extraction.

## Connection Manager (`ConnectionManager`)

- Manages concurrent database pools and active selection.
- Encrypts credentials with **AES-256-GCM** before persisting to the application database.
- Gracefully handles offline or network-failed databases (`DB_AUTH_FAILED`, `DB_TIMEOUT`, `DB_CONNECTION_REFUSED`) without crashing the application.
