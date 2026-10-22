import { SqlStatementNode, SelectStatementNode } from "../sql-parser/ast.types";
import { AstMetrics, AstDfsTraversal } from "../sql-parser/dfs";
import { SqlParser } from "../sql-parser/parser";
import { TableInfo, ColumnInfo, IndexInfo, ConstraintInfo } from "../../database/adapter.interface";
import { SelectivityEstimator } from "./selectivity";
import { IndexCostBenefitAnalyzer, IndexCostBenefit } from "./cost-benefit";

export interface ExistingIndexComparison {
  hasExistingIndexesOnTable: boolean;
  existingIndexesCount: number;
  matchingPrefix: boolean;
  existingIndexes: string[];
  comparisonNotes: string;
}

export interface IndexRecommendation {
  id: string;
  table: string;
  schema: string;
  columns: string[];
  indexType: "BTREE" | "GIN" | "HASH";
  isUnique: boolean;
  suggestedName: string;
  ddl: string;
  selectivity: number;
  costBenefit: IndexCostBenefit;
  usageContext: "WHERE_FILTER" | "JOIN_KEY" | "ORDER_BY" | "GROUP_BY" | "COMPOSITE" | "FOREIGN_KEY";
  candidateType: "WORKLOAD_DRIVEN" | "SCHEMA_INSPECTION";
  confidence: number;
  confidenceCalculation: string;
  estimatedBenefit: string;
  potentialWriteOverhead: "LOW" | "MEDIUM" | "HIGH";
  writeOverheadDetails: string;
  storageOverheadBytes: number;
  storageOverheadFormatted: string;
  reason: string;
  evidence: string;
  evidenceQuery?: string;
  existingIndexesComparison: ExistingIndexComparison;
  validationStatus: "VALIDATED" | "PENDING_AUTH" | "APPLIED";
}

export class IndexAdvisor {
  /**
   * Analyzes query AST and schema to generate validated, deduplicated workload-driven index recommendations.
   */
  public static advise(
    ast: SqlStatementNode,
    metrics: AstMetrics,
    databaseType: string = "postgresql",
    tables: TableInfo[] = [],
    columns: ColumnInfo[] = [],
    existingIndexes: IndexInfo[] = [],
    sourceQuery?: string
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];

    if (ast.type !== "SelectStatement") {
      return recommendations;
    }

    const sel = ast as SelectStatementNode;
    const tableNames = metrics.tablesReferenced.length > 0 ? metrics.tablesReferenced : tables.map((t) => t.name);

    // Build table alias mapping from AST
    const aliasToTable = new Map<string, string>();
    if (sel.from) {
      for (const f of sel.from) {
        if (f.subquery && f.alias) {
          const innerFrom = f.subquery.from;
          if (innerFrom && innerFrom.length > 0 && innerFrom[0].name) {
            aliasToTable.set(f.alias.toLowerCase(), innerFrom[0].name.toLowerCase());
          }
        } else if (f.name) {
          aliasToTable.set(f.name.toLowerCase(), f.name.toLowerCase());
          if (f.alias) {
            aliasToTable.set(f.alias.toLowerCase(), f.name.toLowerCase());
          }
        }
      }
    }
    if (sel.joins) {
      for (const j of sel.joins) {
        if (j.table.subquery && j.table.alias) {
          const innerFrom = j.table.subquery.from;
          if (innerFrom && innerFrom.length > 0 && innerFrom[0].name) {
            aliasToTable.set(j.table.alias.toLowerCase(), innerFrom[0].name.toLowerCase());
          }
        } else if (j.table.name) {
          aliasToTable.set(j.table.name.toLowerCase(), j.table.name.toLowerCase());
          if (j.table.alias) {
            aliasToTable.set(j.table.alias.toLowerCase(), j.table.name.toLowerCase());
          }
        }
      }
    }

    for (const tableName of tableNames) {
      // Only generate index recommendations for physical tables in metadata
      if (tables.length > 0 && !tables.some((t) => t.name.toLowerCase() === tableName.toLowerCase())) {
        continue;
      }

      const tableObj = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
      const schema = tableObj?.schema || "public";
      const tableRows = tableObj?.rowCount || 1000;
      const tableSize = tableObj?.sizeBytes || 1048576;

      // Collect candidate columns for this table
      const equalityFilterCols: string[] = [];
      const rangeFilterCols: string[] = [];
      const joinCols: string[] = [];
      const orderCols: string[] = [];

      // 1. Inspect WHERE filters
      for (const colRef of metrics.columnsReferenced) {
        const [tblOrAlias, col] = colRef.includes(".") ? colRef.split(".") : [tableName, colRef];
        const resolvedTable = aliasToTable.get(tblOrAlias.toLowerCase()) || tblOrAlias.toLowerCase();
        if (resolvedTable === tableName.toLowerCase()) {
          if (metrics.predicates.some((p) => p.includes("LIKE") || p.includes("<") || p.includes(">"))) {
            if (!rangeFilterCols.includes(col)) rangeFilterCols.push(col);
          } else {
            if (!equalityFilterCols.includes(col)) equalityFilterCols.push(col);
          }
        }
      }

      // 2. Inspect JOIN keys
      if (sel.joins) {
        for (const j of sel.joins) {
          if (j.table.name && j.table.name.toLowerCase() === tableName.toLowerCase()) {
            if (j.onCondition) {
              const onStr = JSON.stringify(j.onCondition);
              const colMatch = onStr.match(/"column":"([^"]+)"/g);
              if (colMatch) {
                for (const cm of colMatch) {
                  const c = cm.replace(/"column":"|"/g, "");
                  if (!joinCols.includes(c) && !["id"].includes(c.toLowerCase())) {
                    joinCols.push(c);
                  }
                }
              }
            }
          }
        }
      }

      // 3. Inspect ORDER BY
      if (sel.orderBy) {
        for (const o of sel.orderBy) {
          const oStr = JSON.stringify(o.expression);
          const colMatch = oStr.match(/"column":"([^"]+)"/);
          if (colMatch && !orderCols.includes(colMatch[1])) {
            orderCols.push(colMatch[1]);
          }
        }
      }

      // Build composite candidate columns: Equality FIRST, then Join, then Range, then OrderBy
      const candidateCols = Array.from(
        new Set([...equalityFilterCols, ...joinCols, ...rangeFilterCols, ...orderCols])
      ).filter((c) => c !== "*" && c.toLowerCase() !== "id");

      if (candidateCols.length === 0) continue;

      // Validate candidate columns against table schema
      const tableColumns = columns.filter((c) => c.table.toLowerCase() === tableName.toLowerCase());
      const tableColMap = new Map<string, string>();
      for (const tc of tableColumns) {
        tableColMap.set(tc.name.toLowerCase(), tc.name);
      }

      const validCandidateCols: string[] = [];
      for (const col of candidateCols) {
        const colLower = col.toLowerCase();
        if (tableColMap.size > 0) {
          if (tableColMap.has(colLower)) {
            const realName = tableColMap.get(colLower)!;
            if (!validCandidateCols.includes(realName)) {
              validCandidateCols.push(realName);
            }
          }
        } else {
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
            if (!validCandidateCols.includes(col)) {
              validCandidateCols.push(col);
            }
          }
        }
      }

      if (validCandidateCols.length === 0) continue;

      // Existing indexes inspection for this table
      const tableIndexes = existingIndexes.filter((idx) => idx.table.toLowerCase() === tableName.toLowerCase());
      const isAlreadyIndexed = tableIndexes.some((idx) => {
        const idxColsLower = idx.columns.map((c) => c.toLowerCase());
        const candidateColsLower = validCandidateCols.map((c) => c.toLowerCase());
        return candidateColsLower.every((c, i) => idxColsLower[i] === c);
      });

      if (isAlreadyIndexed) {
        continue; // Deduplicated
      }

      // Selectivity and Cost-benefit evaluation
      const primaryCol = validCandidateCols[0];
      const { selectivity } = SelectivityEstimator.estimateColumnSelectivity(
        primaryCol,
        tableName,
        tables,
        columns
      );

      const costBenefit = IndexCostBenefitAnalyzer.evaluate(
        tableRows,
        tableSize,
        selectivity,
        validCandidateCols.length
      );

      const cleanCols = validCandidateCols.map((c) => c.replace(/[^a-zA-Z0-9_]/g, ""));
      const suggestedName = `idx_${tableName}_${cleanCols.join("_")}`.toLowerCase().substring(0, 60);

      const isPostgres = databaseType.toLowerCase().includes("postgres");
      const ddl = isPostgres
        ? `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${suggestedName} ON ${schema}.${tableName} (${cleanCols.join(", ")});`
        : `CREATE INDEX ${suggestedName} ON ${tableName} (${cleanCols.join(", ")});`;

      const usageContext =
        validCandidateCols.length > 1
          ? "COMPOSITE"
          : joinCols.some((c) => c.toLowerCase() === primaryCol.toLowerCase())
          ? "JOIN_KEY"
          : orderCols.some((c) => c.toLowerCase() === primaryCol.toLowerCase())
          ? "ORDER_BY"
          : "WHERE_FILTER";

      const confidence = Math.min(0.98, Math.max(0.7, 1 - selectivity));
      const confidenceExplanation = `Calculated confidence ${(confidence * 100).toFixed(0)}% based on predicate selectivity (${selectivity.toFixed(3)}), table cardinality (~${tableRows.toLocaleString()} rows), and observed ${usageContext} access pattern.`;

      const writeOverheadLevel: "LOW" | "MEDIUM" | "HIGH" =
        costBenefit.writeOverheadPenaltyPercent > 7 ? "HIGH" : costBenefit.writeOverheadPenaltyPercent > 3 ? "MEDIUM" : "LOW";
      const writeOverheadDetails = `Estimated ~${costBenefit.writeOverheadPenaltyPercent}% additional write latency on INSERT/UPDATE/DELETE targeting ${cleanCols.join(", ")}.`;

      const storageFormatted = `${(costBenefit.estimatedStorageBytes / 1024).toFixed(1)} KB`;
      const querySnippet = sourceQuery ? (sourceQuery.length > 90 ? sourceQuery.substring(0, 90) + "..." : sourceQuery) : undefined;
      const evidence = querySnippet
        ? `Workload query '${querySnippet}' executes ${usageContext} on table '${tableName}' without index coverage for (${cleanCols.join(", ")}).`
        : `Workload pattern uses unindexed ${usageContext} on table '${tableName}' (${cleanCols.join(", ")}).`;

      const existingIndexNames = tableIndexes.map((i) => `${i.name} (${i.columns.join(", ")})`);
      const existingComp: ExistingIndexComparison = {
        hasExistingIndexesOnTable: tableIndexes.length > 0,
        existingIndexesCount: tableIndexes.length,
        matchingPrefix: false,
        existingIndexes: existingIndexNames,
        comparisonNotes:
          tableIndexes.length > 0
            ? `Table currently has ${tableIndexes.length} index(es) [${existingIndexNames.join("; ")}], but none cover (${cleanCols.join(", ")}) as a leading prefix.`
            : `Table has zero existing secondary indexes. Creating this index provides the first index scan access path.`,
      };

      recommendations.push({
        id: `idx-rec-${tableName}-${cleanCols.join("-")}`,
        table: tableName,
        schema,
        columns: cleanCols,
        indexType: "BTREE",
        isUnique: false,
        suggestedName,
        ddl,
        selectivity,
        costBenefit,
        usageContext,
        candidateType: "WORKLOAD_DRIVEN",
        confidence,
        confidenceCalculation: confidenceExplanation,
        estimatedBenefit: `~${costBenefit.estimatedSpeedupPercent}% reduction in scan latency`,
        potentialWriteOverhead: writeOverheadLevel,
        writeOverheadDetails,
        storageOverheadBytes: costBenefit.estimatedStorageBytes,
        storageOverheadFormatted: storageFormatted,
        reason: `Optimal ${usageContext} composite access path covering columns (${cleanCols.join(", ")}) on table '${tableName}'. ${costBenefit.rationale}`,
        evidence,
        evidenceQuery: sourceQuery,
        existingIndexesComparison: existingComp,
        validationStatus: "VALIDATED",
      });
    }

    return recommendations;
  }

  /**
   * Schema Inspection Mode:
   * Identifies unindexed foreign keys and joinable relational pathways directly from database schema metadata,
   * even when query execution history is empty. Clearly labels candidates as SCHEMA_INSPECTION.
   */
  public static adviseSchema(
    tables: TableInfo[] = [],
    columns: ColumnInfo[] = [],
    existingIndexes: IndexInfo[] = [],
    constraints: ConstraintInfo[] = [],
    databaseType: string = "postgresql"
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];
    const seenCandidates = new Set<string>();

    for (const table of tables) {
      const tableName = table.name;
      const schema = table.schema || "public";
      const tableRows = table.rowCount || 1000;
      const tableSize = table.sizeBytes || 1048576;
      const tableCols = columns.filter((c) => c.table.toLowerCase() === tableName.toLowerCase());
      const tableIndexes = existingIndexes.filter((i) => i.table.toLowerCase() === tableName.toLowerCase());

      // 1. Unindexed Foreign Keys
      // In PostgreSQL, primary keys are auto-indexed, but foreign keys are NOT.
      const fkCols = tableCols.filter((c) => c.isFk && !c.isPk);

      // Also incorporate foreign key constraints if available
      for (const con of constraints) {
        if (con.table.toLowerCase() === tableName.toLowerCase() && con.type === "FOREIGN KEY") {
          for (const col of con.columns) {
            if (!fkCols.some((c) => c.name.toLowerCase() === col.toLowerCase())) {
              const matchedCol = tableCols.find((c) => c.name.toLowerCase() === col.toLowerCase());
              if (matchedCol && !matchedCol.isPk) fkCols.push(matchedCol);
            }
          }
        }
      }

      for (const fkCol of fkCols) {
        const colName = fkCol.name;
        const candidateKey = `${tableName.toLowerCase()}_${colName.toLowerCase()}`;
        if (seenCandidates.has(candidateKey)) continue;

        // Check if ANY existing index covers this FK column as its FIRST (leading) column
        const isCovered = tableIndexes.some((idx) => {
          if (!idx.columns || idx.columns.length === 0) return false;
          return idx.columns[0].toLowerCase() === colName.toLowerCase();
        });

        if (isCovered) continue;

        seenCandidates.add(candidateKey);

        const { selectivity } = SelectivityEstimator.estimateColumnSelectivity(
          colName,
          tableName,
          tables,
          columns
        );

        const costBenefit = IndexCostBenefitAnalyzer.evaluate(
          tableRows,
          tableSize,
          selectivity,
          1
        );

        const suggestedName = `idx_${tableName}_${colName}`.toLowerCase().substring(0, 60);
        const isPostgres = databaseType.toLowerCase().includes("postgres");
        const ddl = isPostgres
          ? `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${suggestedName} ON ${schema}.${tableName} (${colName});`
          : `CREATE INDEX ${suggestedName} ON ${tableName} (${colName});`;

        const targetRef = fkCol.fkRefTable ? ` -> ${fkCol.fkRefTable}(${fkCol.fkRefColumn || "id"})` : "";
        const confidence = 0.95;
        const confidenceExplanation = "High confidence (95%): Unindexed foreign key detected via relational metadata introspection. Unindexed FKs cause full sequential scans on parent delete/update cascades and relational joins.";

        const existingIndexNames = tableIndexes.map((i) => `${i.name} (${i.columns.join(", ")})`);
        const existingComp: ExistingIndexComparison = {
          hasExistingIndexesOnTable: tableIndexes.length > 0,
          existingIndexesCount: tableIndexes.length,
          matchingPrefix: false,
          existingIndexes: existingIndexNames,
          comparisonNotes:
            tableIndexes.length > 0
              ? `Table '${tableName}' has ${tableIndexes.length} existing index(es), but none have foreign key '${colName}' as the leading index key.`
              : `Table '${tableName}' has no secondary indexes. Creating this foreign key index prevents sequential scans during JOINs.`,
        };

        recommendations.push({
          id: `idx-fk-${tableName}-${colName}`,
          table: tableName,
          schema,
          columns: [colName],
          indexType: "BTREE",
          isUnique: false,
          suggestedName,
          ddl,
          selectivity,
          costBenefit,
          usageContext: "FOREIGN_KEY",
          candidateType: "SCHEMA_INSPECTION",
          confidence,
          confidenceCalculation: confidenceExplanation,
          estimatedBenefit: `Eliminates sequential table scans when joining with parent table${targetRef}`,
          potentialWriteOverhead: "LOW",
          writeOverheadDetails: "~2.5% write penalty on row inserts; significantly reduces row locking during parent updates and cascade checks.",
          storageOverheadBytes: costBenefit.estimatedStorageBytes,
          storageOverheadFormatted: `${(costBenefit.estimatedStorageBytes / 1024).toFixed(1)} KB`,
          reason: `Unindexed Foreign Key: Column '${colName}'${targetRef} has no supporting index. In ${databaseType.toUpperCase()}, foreign keys are not automatically indexed, causing table-wide sequential scans during joins and lock escalations.`,
          evidence: `Schema Introspection: Table '${tableName}' (~${tableRows.toLocaleString()} rows) has FOREIGN KEY '${colName}' without a supporting index.`,
          existingIndexesComparison: existingComp,
          validationStatus: "VALIDATED",
        });
      }
    }

    return recommendations;
  }

  /**
   * Workload-driven multi-query index advisor:
   * Aggregates multiple SQL queries from history or logs, extracts query frequencies and latencies,
   * and produces prioritized, deduplicated recommendations with composite index column ordering.
   */
  public static adviseWorkloadQueries(
    workload: Array<{ sql: string; frequency?: number; avgLatencyMs?: number }>,
    tables: TableInfo[] = [],
    columns: ColumnInfo[] = [],
    existingIndexes: IndexInfo[] = [],
    databaseType: string = "postgresql"
  ): IndexRecommendation[] {
    const recommendations: IndexRecommendation[] = [];
    const seenKeys = new Set<string>();

    for (const item of workload) {
      try {
        const ast = SqlParser.parse(item.sql, databaseType as any);
        const metrics = AstDfsTraversal.traverse(ast);
        const recs = this.advise(ast, metrics, databaseType, tables, columns, existingIndexes, item.sql);

        for (const r of recs) {
          const key = `${r.table.toLowerCase()}_${r.columns.join("_").toLowerCase()}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            if (item.frequency && item.frequency > 1) {
              r.evidence += ` Observed ${item.frequency} execution(s) in workload telemetry.`;
            }
            if (item.avgLatencyMs && item.avgLatencyMs > 0) {
              r.evidence += ` Measured average latency: ${item.avgLatencyMs.toFixed(1)} ms.`;
            }
            recommendations.push(r);
          }
        }
      } catch {
        // Skip unparseable statements
      }
    }

    return recommendations;
  }
}
