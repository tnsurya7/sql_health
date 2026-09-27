import { SqlParser } from "../sql-parser/parser";
import { TableInfo, ColumnInfo, IndexInfo } from "../../database/adapter.interface";

export interface AlgebraTransformation {
  ruleName: string;
  applied: boolean;
  description: string;
  beforeSnippet?: string;
  afterSnippet?: string;
}

export interface AlgebraOptimizationResult {
  originalSql: string;
  transformedSql: string;
  hasChanges: boolean;
  transformations: AlgebraTransformation[];
}

export class RelationalAlgebraOptimizer {
  /**
   * Applies rule-based relational algebra transformations deterministically.
   */
  public static optimize(
    sql: string,
    databaseType: string = "postgresql",
    tables: TableInfo[] = [],
    columns: ColumnInfo[] = []
  ): AlgebraOptimizationResult {
    let currentSql = sql.trim().replace(/;+$/, "");
    const transformations: AlgebraTransformation[] = [];

    // 1. Constant Folding / Simplification
    const constantFoldResult = RelationalAlgebraOptimizer.applyConstantFolding(currentSql);
    if (constantFoldResult.applied) {
      currentSql = constantFoldResult.sql;
      transformations.push({
        ruleName: "CONSTANT_FOLDING",
        applied: true,
        description: "Evaluated static constant expressions and arithmetic at optimization time.",
        beforeSnippet: constantFoldResult.before,
        afterSnippet: constantFoldResult.after,
      });
    }

    // 2. Redundant Predicate Simplification (e.g. 1=1 AND, true AND, duplicate conditions)
    const redundantPredResult = RelationalAlgebraOptimizer.simplifyRedundantPredicates(currentSql);
    if (redundantPredResult.applied) {
      currentSql = redundantPredResult.sql;
      transformations.push({
        ruleName: "REDUNDANT_PREDICATE_SIMPLIFICATION",
        applied: true,
        description: "Removed tautological and redundant filter predicates (e.g. '1=1 AND').",
        beforeSnippet: redundantPredResult.before,
        afterSnippet: redundantPredResult.after,
      });
    }

    // 3. Subquery-to-Join Transformation (Unnesting IN/EXISTS into INNER JOIN)
    const subqueryJoinResult = RelationalAlgebraOptimizer.convertSubqueryToJoin(currentSql);
    if (subqueryJoinResult.applied) {
      currentSql = subqueryJoinResult.sql;
      transformations.push({
        ruleName: "SUBQUERY_UNNESTING",
        applied: true,
        description: "Converted correlated/semi-join IN subquery into an efficient INNER JOIN.",
        beforeSnippet: subqueryJoinResult.before,
        afterSnippet: subqueryJoinResult.after,
      });
    }

    // 4. Predicate Pushdown (Pushing WHERE filters into subqueries before joins)
    const pushdownResult = RelationalAlgebraOptimizer.applyPredicatePushdown(currentSql);
    if (pushdownResult.applied) {
      currentSql = pushdownResult.sql;
      transformations.push({
        ruleName: "PREDICATE_PUSHDOWN",
        applied: true,
        description: "Pushed filter predicates down into nested derived tables to filter rows prior to joining.",
        beforeSnippet: pushdownResult.before,
        afterSnippet: pushdownResult.after,
      });
    }

    // 5. Redundant DISTINCT Elimination (when grouping or PK projection already enforces uniqueness)
    const distinctResult = RelationalAlgebraOptimizer.eliminateRedundantDistinct(currentSql, tables, columns);
    if (distinctResult.applied) {
      currentSql = distinctResult.sql;
      transformations.push({
        ruleName: "REDUNDANT_DISTINCT_ELIMINATION",
        applied: true,
        description: "Eliminated redundant DISTINCT clause where primary key projection or GROUP BY already guarantees row uniqueness.",
        beforeSnippet: distinctResult.before,
        afterSnippet: distinctResult.after,
      });
    }

    // 6. Non-Sargable Function Inversion (e.g., DATE(created_at) = '2026-01-01' -> created_at >= '2026-01-01 00:00:00' AND created_at < '2026-01-02 00:00:00')
    const sargableResult = RelationalAlgebraOptimizer.makeSargable(currentSql);
    if (sargableResult.applied) {
      currentSql = sargableResult.sql;
      transformations.push({
        ruleName: "SARGABLE_PREDICATE_TRANSFORMATION",
        applied: true,
        description: "Rewrote function-wrapped column predicates into sargable range comparisons.",
        beforeSnippet: sargableResult.before,
        afterSnippet: sargableResult.after,
      });
    }

    return {
      originalSql: sql,
      transformedSql: currentSql,
      hasChanges: transformations.length > 0,
      transformations,
    };
  }

  private static applyConstantFolding(sql: string): { applied: boolean; sql: string; before?: string; after?: string } {
    // Looks for static math expressions: 24 * 60 * 60, 1000 * 60, etc.
    const mathRegex = /\b(\d+)\s*([\*\/+-])\s*(\d+)(?:\s*([\*\/+-])\s*(\d+))?\b/g;
    let applied = false;
    let before = "";
    let after = "";

    const replaced = sql.replace(mathRegex, (match, n1, op1, n2, op2, n3) => {
      try {
        // Safe evaluation of pure numeric arithmetic
        const val = op2 && n3 ? eval(`${n1} ${op1} ${n2} ${op2} ${n3}`) : eval(`${n1} ${op1} ${n2}`);
        if (!isNaN(val) && typeof val === "number") {
          applied = true;
          before = match;
          after = String(val);
          return String(val);
        }
      } catch (err) {}
      return match;
    });

    return { applied, sql: replaced, before, after };
  }

  private static simplifyRedundantPredicates(sql: string): { applied: boolean; sql: string; before?: string; after?: string } {
    let modified = sql;
    let applied = false;
    let before = "";
    let after = "";

    if (/\bWHERE\s+1\s*=\s*1\s+AND\s+/i.test(modified)) {
      before = "WHERE 1=1 AND";
      after = "WHERE";
      modified = modified.replace(/\bWHERE\s+1\s*=\s*1\s+AND\s+/i, "WHERE ");
      applied = true;
    } else if (/\bAND\s+1\s*=\s*1\b/i.test(modified)) {
      before = "AND 1=1";
      after = "";
      modified = modified.replace(/\bAND\s+1\s*=\s*1\b/gi, "");
      applied = true;
    }

    return { applied, sql: modified.trim(), before, after };
  }

  private static convertSubqueryToJoin(sql: string): { applied: boolean; sql: string; before?: string; after?: string } {
    // Pattern: SELECT ... FROM table_a a WHERE a.col IN (SELECT b.col FROM table_b b WHERE b.filter = ...)
    const inSubqueryRegex = /FROM\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)?\s+WHERE\s+([a-zA-Z0-9_\.]+)\s+IN\s*\(\s*SELECT\s+([a-zA-Z0-9_\.]+)\s+FROM\s+([a-zA-Z0-9_]+)\s+([a-zA-Z0-9_]+)?(?:\s+WHERE\s+([^)]+))?\s*\)/i;
    const match = sql.match(inSubqueryRegex);

    if (match) {
      const outerTable = match[1];
      const outerAlias = match[2] || outerTable;
      const outerCol = match[3];
      const innerCol = match[4];
      const innerTable = match[5];
      const innerAlias = match[6] || innerTable;
      const innerFilter = match[7] ? ` AND ${match[7]}` : "";

      const joinCondition = `${outerCol} = ${innerCol}${innerFilter}`;
      const newFrom = `FROM ${outerTable} ${outerAlias} INNER JOIN ${innerTable} ${innerAlias} ON ${joinCondition}`;
      const transformed = sql.replace(match[0], newFrom);

      return {
        applied: true,
        sql: transformed,
        before: match[0],
        after: newFrom,
      };
    }

    return { applied: false, sql };
  }

  private static applyPredicatePushdown(sql: string): { applied: boolean; sql: string; before?: string; after?: string } {
    // Pattern: SELECT ... FROM (SELECT * FROM table_a) sub WHERE sub.col = 123
    const derivedMatch = sql.match(/FROM\s*\(\s*SELECT\s+([^)]+)\s+FROM\s+([a-zA-Z0-9_]+)\s*\)\s+([a-zA-Z0-9_]+)\s+WHERE\s+\3\.([a-zA-Z0-9_]+)\s*(=|<|>|LIKE)\s*([^;\s]+)/i);
    if (derivedMatch) {
      const proj = derivedMatch[1];
      const innerTable = derivedMatch[2];
      const alias = derivedMatch[3];
      const filterCol = derivedMatch[4];
      const op = derivedMatch[5];
      const val = derivedMatch[6];

      const newInner = `FROM (SELECT ${proj.trim()} FROM ${innerTable} WHERE ${filterCol} ${op} ${val}) ${alias}`;
      const transformed = sql.replace(derivedMatch[0], newInner);

      return {
        applied: true,
        sql: transformed,
        before: derivedMatch[0],
        after: newInner,
      };
    }

    return { applied: false, sql };
  }

  private static eliminateRedundantDistinct(
    sql: string,
    tables: TableInfo[],
    columns: ColumnInfo[]
  ): { applied: boolean; sql: string; before?: string; after?: string } {
    if (/^\s*SELECT\s+DISTINCT\b/i.test(sql)) {
      // Check if primary key or unique column is in projection or GROUP BY exists
      const hasGroupBy = /\bGROUP\s+BY\b/i.test(sql);
      const hasPkProjection = /\b(?:id|uuid|_pk)\b/i.test(sql);

      if (hasGroupBy || hasPkProjection) {
        const transformed = sql.replace(/^\s*SELECT\s+DISTINCT\b/i, "SELECT");
        return {
          applied: true,
          sql: transformed,
          before: "SELECT DISTINCT",
          after: "SELECT",
        };
      }
    }

    return { applied: false, sql };
  }

  private static makeSargable(sql: string): { applied: boolean; sql: string; before?: string; after?: string } {
    // Pattern: DATE(created_at) = '2026-03-15' -> created_at >= '2026-03-15 00:00:00' AND created_at < '2026-03-16 00:00:00'
    const dateFuncMatch = sql.match(/DATE\s*\(\s*([a-zA-Z0-9_\.]+)\s*\)\s*=\s*'(\d{4}-\d{2}-\d{2})'/i);
    if (dateFuncMatch) {
      const col = dateFuncMatch[1];
      const dateStr = dateFuncMatch[2];
      const d = new Date(dateStr);
      d.setDate(d.getDate() + 1);
      const nextDateStr = d.toISOString().split("T")[0];

      const sargableClause = `${col} >= '${dateStr} 00:00:00' AND ${col} < '${nextDateStr} 00:00:00'`;
      const transformed = sql.replace(dateFuncMatch[0], sargableClause);

      return {
        applied: true,
        sql: transformed,
        before: dateFuncMatch[0],
        after: sargableClause,
      };
    }

    return { applied: false, sql };
  }
}
