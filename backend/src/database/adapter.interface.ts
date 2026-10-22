export interface ServerInfo {
  version: string;
  databaseType: string;
  uptime?: string;
  maxConnections?: number;
  activeConnections?: number;
  os?: string;
}

export interface DatabaseInfo {
  name: string;
  sizeBytes: number;
  tableCount: number;
  indexCount: number;
  schemaCount: number;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: "BASE TABLE" | "VIEW" | "MATERIALIZED VIEW";
  rowCount: number;
  sizeBytes: number;
  indexSizeBytes: number;
  totalSizeBytes: number;
  lastAnalyzed?: Date | null;
  lastVacuumed?: Date | null;
}

export interface ColumnInfo {
  schema: string;
  table: string;
  name: string;
  dataType: string;
  isNullable: boolean;
  isPk: boolean;
  isFk: boolean;
  fkRefTable?: string;
  fkRefColumn?: string;
  defaultVal?: string;
  ordinalPosition: number;
  distinctValues?: number;
  nullFraction?: number;
}

export interface ConstraintInfo {
  name: string;
  schema: string;
  table: string;
  type: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK";
  columns: string[];
  refTable?: string;
  refColumns?: string[];
}

export interface IndexInfo {
  schema: string;
  table: string;
  name: string;
  type: string;
  isUnique: boolean;
  isPrimary: boolean;
  columns: string[];
  definition: string;
  sizeBytes: number;
  scansCount?: number;
}

export interface ViewInfo {
  schema: string;
  name: string;
  definition: string;
  isMaterialized: boolean;
}

export interface FunctionInfo {
  schema: string;
  name: string;
  returnType: string;
  arguments: string;
  language: string;
  definition?: string;
}

export interface ProcedureInfo {
  schema: string;
  name: string;
  arguments: string;
  language: string;
  definition?: string;
}

export interface TriggerInfo {
  schema: string;
  table: string;
  name: string;
  event: string;
  timing: string;
  statement: string;
}

export interface TableStats {
  schema: string;
  table: string;
  liveTuples: number;
  deadTuples: number;
  seqScans: number;
  seqRowsRead: number;
  idxScans: number;
  idxRowsRead: number;
  cacheHitRatio: number;
}

export interface ColumnStats {
  schema: string;
  table: string;
  column: string;
  nullFraction: number;
  distinctValues: number;
  avgWidth: number;
  correlation?: number;
}

export interface ActiveQueryInfo {
  pid: number;
  user: string;
  database: string;
  state: string;
  durationSeconds: number;
  query: string;
  waiting: boolean;
  waitEventType?: string;
  waitEvent?: string;
}

export interface LockInfo {
  lockType: string;
  relation?: string;
  mode: string;
  granted: boolean;
  pid: number;
  query?: string;
}

export interface DeadlockNode {
  pid: number;
  query: string;
  waitingForPid: number;
  lockType: string;
  mode: string;
}

export interface DeadlockReport {
  hasDeadlock: boolean;
  cycleNodes: DeadlockNode[];
  rawLocks: LockInfo[];
  description?: string;
}

export interface DatabaseMetrics {
  tps: number;
  cacheHitRatio: number;
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  deadlockCount: number;
  tempBytesWritten: number;
}

export interface QueryExecutionResult {
  rows: any[];
  rowCount: number;
  executionTimeMs: number;
  fields: string[];
}

export interface ExplainResult {
  plan: any;
  rawOutput: string;
  planningTime?: number;
  executionTime?: number;
  totalCost?: number;
  startupCost?: number;
  planRows?: number;
}

export interface DatabaseAdapterConfig {
  connectionId: string;
  name: string;
  databaseType: string;
  host: string;
  port: number;
  database: string;
  schema?: string;
  username: string;
  password?: string;
  ssl?: boolean;
  readOnly?: boolean;
  connectionTimeoutMillis?: number;
  maxPoolSize?: number;
}

export interface DatabaseAdapter {
  readonly config: DatabaseAdapterConfig;
  readonly isConnected: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<{ success: boolean; latencyMs: number; version?: string; error?: string }>;

  getServerInfo(): Promise<ServerInfo>;
  getDatabaseInfo(): Promise<DatabaseInfo>;
  getSchemas(): Promise<string[]>;

  getTables(schema?: string): Promise<TableInfo[]>;
  getColumns(schema?: string, table?: string): Promise<ColumnInfo[]>;
  getConstraints(schema?: string, table?: string): Promise<ConstraintInfo[]>;
  getIndexes(schema?: string, table?: string): Promise<IndexInfo[]>;
  getViews(schema?: string): Promise<ViewInfo[]>;
  getFunctions(schema?: string): Promise<FunctionInfo[]>;
  getProcedures(schema?: string): Promise<ProcedureInfo[]>;
  getTriggers(schema?: string): Promise<TriggerInfo[]>;

  getTableStatistics(schema?: string, table?: string): Promise<TableStats[]>;
  getColumnStatistics(schema?: string, table?: string): Promise<ColumnStats[]>;

  getActiveQueries(): Promise<ActiveQueryInfo[]>;
  getLocks(): Promise<LockInfo[]>;
  getDeadlocks(): Promise<DeadlockReport>;

  explainQuery(sql: string, analyze?: boolean): Promise<ExplainResult>;
  executeReadOnlyQuery(sql: string, maxRows?: number, timeoutMs?: number): Promise<QueryExecutionResult>;
  executeDdl?(sql: string): Promise<void>;

  getQueryMetrics(): Promise<DatabaseMetrics>;
}
