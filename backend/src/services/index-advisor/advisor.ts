import { SqlStatementNode, SelectStatementNode } from "../sql-parser/ast.types";
import { AstMetrics } from "../sql-parser/dfs";
import { TableInfo, ColumnInfo, IndexInfo } from "../../database/adapter.interface";
import { SelectivityEstimator } from "./selectivity";
import { IndexCostBenefitAnalyzer, IndexCostBenefit } from "./cost-benefit";

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
  usageContext: "WHERE_FILTER" | "JOIN_KEY" | "ORDER_BY" | "GROUP_BY" | "COMPOSITE";
  confidence: number;
  reason: string;
}

export class IndexAdvisor {
  /**
   * Analyzes query AST and schema to generate validated, deduplicated index recommendations.
   */
  public static advise(
    ast: SqlStatementNode,
    metrics: AstMetrics,
    databaseType: string = "postgresql",
    tables: TableInfo[] = [],
    columns: ColumnInfo[] = [],
    existingIndexes: IndexInfo[] = []
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
      // Only generate index recommendations for actual physical tables present in database metadata
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
          // Check if used with range or equality
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
          if (j.table.name.toLowerCase() === tableName.toLowerCase()) {
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

      // Build composite candidate columns: Equality FIRST, then Range, then OrderBy
      const candidateCols = Array.from(
        new Set([...equalityFilterCols, ...joinCols, ...rangeFilterCols, ...orderCols])
      ).filter((c) => c !== "*" && c.toLowerCase() !== "id");

      if (candidateCols.length === 0) continue;

      // Obtain actual schema columns for the target table
      const tableColumns = columns.filter((c) => c.table.toLowerCase() === tableName.toLowerCase());
      const tableColMap = new Map<string, string>(); // lowercase -> exact schema casing
      for (const tc of tableColumns) {
        tableColMap.set(tc.name.toLowerCase(), tc.name);
      }

      // Filter and validate candidate columns against table schema and identifier rules
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
          // Schema metadata not provided: ensure it is a valid SQL identifier
          if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
            if (!validCandidateCols.includes(col)) {
              validCandidateCols.push(col);
            }
          }
        }
      }

      if (validCandidateCols.length === 0) continue;

      // Check if an index already covers these columns
      const isAlreadyIndexed = existingIndexes.some((idx) => {
        if (idx.table.toLowerCase() !== tableName.toLowerCase()) return false;
        // Check if candidate columns are a prefix of existing index
        const idxColsLower = idx.columns.map((c) => c.toLowerCase());
        const candidateColsLower = validCandidateCols.map((c) => c.toLowerCase());
        return candidateColsLower.every((c, i) => idxColsLower[i] === c);
      });

      if (isAlreadyIndexed) {
        continue; // Do not recommend existing index
      }

      // Selectivity estimation for the primary index column
      const primaryCol = validCandidateCols[0];
      const { selectivity } = SelectivityEstimator.estimateColumnSelectivity(
        primaryCol,
        tableName,
        tables,
        columns
      );

      // Cost-benefit evaluation
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
        confidence: 0.9,
        reason: `Optimal ${usageContext} access path covering columns (${cleanCols.join(", ")}) on table '${tableName}'. ${costBenefit.rationale}`,
      });
    }

    return recommendations;
  }
}
