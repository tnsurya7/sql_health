import { SqlStatementNode } from "../sql-parser/ast.types";
import { AstMetrics } from "../sql-parser/dfs";
import { TableInfo, ColumnInfo, IndexInfo } from "../../database/adapter.interface";

export type RuleSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type RuleCategory = "PERFORMANCE" | "SECURITY" | "INDEXING" | "QUALITY" | "MAINTAINABILITY";

export interface RuleContext {
  sql: string;
  ast: SqlStatementNode;
  metrics: AstMetrics;
  databaseType: string;
  tables?: TableInfo[];
  columns?: ColumnInfo[];
  indexes?: IndexInfo[];
}

export interface RuleIssue {
  id: string;
  ruleCode: string;
  title: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  confidence: number;
  evidence: string;
  affectedTables: string[];
  affectedColumns: string[];
  recommendation: string;
  databaseType: string;
}

export interface RuleDefinition {
  code: string;
  title: string;
  category: RuleCategory;
  severity: RuleSeverity;
  analyze: (ctx: RuleContext) => RuleIssue | null;
}

export const RULE_DEFINITIONS: RuleDefinition[] = [
  // R001: SELECT * Wildcard
  {
    code: "R001",
    title: "Unbounded Projection (SELECT *)",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      if (ctx.metrics.hasStar) {
        return {
          id: `issue-R001-${Date.now()}`,
          ruleCode: "R001",
          title: "Unbounded Projection (SELECT *)",
          description:
            "Using 'SELECT *' retrieves all columns across joined tables, bypassing index-only scans, wasting bandwidth, and increasing I/O cache pressure.",
          category: "PERFORMANCE",
          severity: "MEDIUM",
          confidence: 1.0,
          evidence: "Query contains wildcard '*' in projection list.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: ["*"],
          recommendation:
            "Specify only the exact required columns explicitly in the SELECT projection list.",
          databaseType: ctx.databaseType,
        };
      }
      return null;
    },
  },

  // R002: Function applied to indexed/filter column (Non-sargable)
  {
    code: "R002",
    title: "Non-Sargable Function in Filter Predicate",
    category: "PERFORMANCE",
    severity: "HIGH",
    analyze: (ctx) => {
      const nonSargableRegex =
        /\b(LOWER|UPPER|DATE|DATE_TRUNC|SUBSTRING|TRIM|ROUND|CAST)\s*\(\s*([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?)\s*\)\s*(=|!=|LIKE|ILIKE|<|>)/i;

      const match = ctx.sql.match(nonSargableRegex);

      if (match) {
        return {
          id: `issue-R002-${Date.now()}`,
          ruleCode: "R002",
          title: "Non-Sargable Function in Filter Predicate",
          description: `Applying function '${match[1]}' directly to column '${match[2]}' prevents the optimizer from utilizing B-Tree index range scans, forcing a full table scan.`,
          category: "PERFORMANCE",
          severity: "HIGH",
          confidence: 0.95,
          evidence: `Predicate contains: ${match[0]}`,
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [match[2]],
          recommendation:
            `Rewrite to avoid function wrapping on column or create an expression index: CREATE INDEX idx_func ON table (${match[1]}(${match[2]}));`,
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R003: Potential Missing Index on Filter / Join Column
  {
    code: "R003",
    title: "Potential Missing Index on Filter Column",
    category: "INDEXING",
    severity: "HIGH",
    analyze: (ctx) => {
      if (ctx.metrics.columnsReferenced.length > 0 && ctx.indexes) {
        for (const col of ctx.metrics.columnsReferenced) {
          const colName = col.includes(".") ? col.split(".")[1] : col;

          const hasIdx = ctx.indexes.some((idx) =>
            idx.columns.some(
              (c) => c.toLowerCase() === colName.toLowerCase(),
            ),
          );

          if (
            !hasIdx &&
            !["*", "id", "created_at"].includes(colName.toLowerCase())
          ) {
            return {
              id: `issue-R003-${Date.now()}`,
              ruleCode: "R003",
              title: "Potential Missing Index on Filter Column",
              description: `Column '${col}' is used in filtering/joining predicates but does not have a supporting index, which may cause costly sequential scans.`,
              category: "INDEXING",
              severity: "HIGH",
              confidence: 0.85,
              evidence: `No index found covering column '${col}'.`,
              affectedTables: ctx.metrics.tablesReferenced,
              affectedColumns: [col],
              recommendation: `Add a B-Tree index: CREATE INDEX idx_${colName} ON table (${colName});`,
              databaseType: ctx.databaseType,
            };
          }
        }
      }

      return null;
    },
  },

  // R004: Sequential scan on large table
  {
    code: "R004",
    title: "Sequential Scan Risk on Large Table",
    category: "PERFORMANCE",
    severity: "HIGH",
    analyze: (ctx) => {
      if (ctx.tables && ctx.tables.length > 0) {
        for (const t of ctx.tables) {
          if (
            t.rowCount > 5000 &&
            ctx.metrics.tablesReferenced.some(
              (tr) => tr.toLowerCase() === t.name.toLowerCase(),
            )
          ) {
            if (!ctx.metrics.hasLimit && !ctx.metrics.hasWhere) {
              return {
                id: `issue-R004-${Date.now()}`,
                ruleCode: "R004",
                title: "Sequential Scan Risk on Large Table",
                description: `Table '${t.name}' contains ${t.rowCount.toLocaleString()} rows and is being scanned without a restrictive WHERE filter or LIMIT.`,
                category: "PERFORMANCE",
                severity: "HIGH",
                confidence: 0.9,
                evidence: `Table '${t.name}' rowCount = ${t.rowCount}, no indexed filter applied.`,
                affectedTables: [t.name],
                affectedColumns: [],
                recommendation:
                  "Apply pagination with LIMIT / OFFSET or filter by indexed partition key.",
                databaseType: ctx.databaseType,
              };
            }
          }
        }
      }

      return null;
    },
  },

  // R005: Correlated Subquery
  {
    code: "R005",
    title: "Correlated Subquery in SELECT or WHERE",
    category: "PERFORMANCE",
    severity: "HIGH",
    analyze: (ctx) => {
      if (
        ctx.metrics.subqueryCount > 0 &&
        /\bWHERE\s+[\w\.]+\s*(?:IN|=|>|<)\s*\(\s*SELECT\b/i.test(ctx.sql)
      ) {
        return {
          id: `issue-R005-${Date.now()}`,
          ruleCode: "R005",
          title: "Correlated Subquery in SELECT or WHERE",
          description:
            "Correlated subqueries execute once for every outer row (O(N*M) complexity).",
          category: "PERFORMANCE",
          severity: "HIGH",
          confidence: 0.9,
          evidence:
            "Subquery references outer query variables inside WHERE/SELECT clause.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Rewrite correlated subquery into an INNER JOIN, LEFT JOIN, or Common Table Expression (CTE).",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R006: Deep Nested Subquery
  {
    code: "R006",
    title: "Deeply Nested Subqueries (> 2 Levels)",
    category: "MAINTAINABILITY",
    severity: "MEDIUM",
    analyze: (ctx) => {
      const subqueryNestingDepth = ctx.metrics.subqueryNestingDepth ?? 0;
      const subqueryCount = ctx.metrics.subqueryCount ?? 0;

      if (subqueryCount > 0 && subqueryNestingDepth > 2) {
        return {
          id: `issue-R006-${Date.now()}`,
          ruleCode: "R006",
          title: "Deeply Nested Subqueries (> 2 Levels)",
          description: `Query contains ${subqueryCount} subquery node(s) with a maximum nesting depth of ${subqueryNestingDepth} levels (threshold is > 2), increasing optimizer complexity and hurting query maintainability.`,
          category: "MAINTAINABILITY",
          severity: "MEDIUM",
          confidence: 0.95,
          evidence: `Actual subquery nesting depth = ${subqueryNestingDepth}, subquery count = ${subqueryCount}.`,
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Refactor deeply nested subqueries into modular Common Table Expressions (WITH clause) or JOINs.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R007: Unnecessary DISTINCT
  {
    code: "R007",
    title: "Unnecessary DISTINCT Clause",
    category: "PERFORMANCE",
    severity: "LOW",
    analyze: (ctx) => {
      if (ctx.metrics.hasDistinct && ctx.metrics.hasGroupBy) {
        return {
          id: `issue-R007-${Date.now()}`,
          ruleCode: "R007",
          title: "Unnecessary DISTINCT Clause",
          description:
            "DISTINCT is redundant when used alongside GROUP BY, forcing an extra sort or hash aggregation step.",
          category: "PERFORMANCE",
          severity: "LOW",
          confidence: 0.9,
          evidence:
            "Query contains both SELECT DISTINCT and GROUP BY clauses.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Remove SELECT DISTINCT when GROUP BY is already aggregating uniqueness.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R008: Large IN Clause
  {
    code: "R008",
    title: "Large IN Clause List (> 30 elements)",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      const inMatch = ctx.sql.match(/\bIN\s*\(([^)]{100,})\)/i);

      if (inMatch) {
        const count = inMatch[1].split(",").length;

        if (count > 25) {
          return {
            id: `issue-R008-${Date.now()}`,
            ruleCode: "R008",
            title: "Large IN Clause List (> 30 elements)",
            description: `IN clause contains ${count} literal parameters. Long IN lists degrade query planning time and prevent index seek efficiencies.`,
            category: "PERFORMANCE",
            severity: "MEDIUM",
            confidence: 0.95,
            evidence: `IN clause contains ${count} elements.`,
            affectedTables: ctx.metrics.tablesReferenced,
            affectedColumns: [],
            recommendation:
              "Replace large literal IN lists with an indexed temporary table or VALUES join.",
            databaseType: ctx.databaseType,
          };
        }
      }

      return null;
    },
  },

  // R009: OR-Heavy Filtering
  {
    code: "R009",
    title: "Excessive OR Conditions in Filter",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      const orCount = (ctx.sql.match(/\bOR\b/gi) || []).length;

      if (orCount >= 3) {
        return {
          id: `issue-R009-${Date.now()}`,
          ruleCode: "R009",
          title: "Excessive OR Conditions in Filter",
          description: `Query contains ${orCount} OR clauses across multiple columns. OR conditions often disable composite indexes and force bitmap heap scans or sequential scans.`,
          category: "PERFORMANCE",
          severity: "MEDIUM",
          confidence: 0.85,
          evidence: `${orCount} OR operators detected in filter predicates.`,
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Consider splitting into UNION ALL branches if distinct indexes exist on each branch.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R010: Implicit Type Conversion
  {
    code: "R010",
    title: "Potential Implicit Type Conversion",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      if (
        /\b(?:id|count|quantity|amount|total|price)\s*=\s*'(\d+)'/i.test(
          ctx.sql,
        )
      ) {
        return {
          id: `issue-R010-${Date.now()}`,
          ruleCode: "R010",
          title: "Potential Implicit Type Conversion",
          description:
            "Comparing numeric columns against string literals causes runtime implicit type casting and invalidates index usage.",
          category: "PERFORMANCE",
          severity: "MEDIUM",
          confidence: 0.8,
          evidence:
            "Quoted string literal compared against numeric column name.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Pass numeric literals unquoted (e.g., id = 123 instead of id = '123').",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R011: Repeated Subquery
  {
    code: "R011",
    title: "Repeated Redundant Subquery Expression",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      const subqueries = ctx.sql.match(/\(SELECT\s+[^)]+\)/gi);

      if (subqueries && subqueries.length >= 2) {
        if (subqueries[0] === subqueries[1]) {
          return {
            id: `issue-R011-${Date.now()}`,
            ruleCode: "R011",
            title: "Repeated Redundant Subquery Expression",
            description:
              "The exact same subquery is evaluated multiple times in the query statement.",
            category: "PERFORMANCE",
            severity: "MEDIUM",
            confidence: 0.95,
            evidence: `Identical subquery repeated: ${subqueries[0]}`,
            affectedTables: ctx.metrics.tablesReferenced,
            affectedColumns: [],
            recommendation:
              "Extract duplicate subquery into a Common Table Expression (WITH clause) to execute it once.",
            databaseType: ctx.databaseType,
          };
        }
      }

      return null;
    },
  },

  // R012: Cartesian Join / Cross Join
  {
    code: "R012",
    title: "Cartesian Join (Missing ON Condition)",
    category: "PERFORMANCE",
    severity: "CRITICAL",
    analyze: (ctx) => {
      if (
        /\bCROSS\s+JOIN\b/i.test(ctx.sql) ||
        (ctx.metrics.tablesReferenced.length > 1 &&
          !ctx.sql.includes("JOIN") &&
          !ctx.sql.includes("WHERE"))
      ) {
        return {
          id: `issue-R012-${Date.now()}`,
          ruleCode: "R012",
          title: "Cartesian Join (Missing ON Condition)",
          description:
            "Cartesian join produces an N x M row cross-multiplication, which causes catastrophic memory explosion on large tables.",
          category: "PERFORMANCE",
          severity: "CRITICAL",
          confidence: 0.95,
          evidence:
            "Tables referenced in comma/cross-join without join predicate.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Add explicit INNER JOIN with ON foreign-key condition.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R013: Excessive Joins
  {
    code: "R013",
    title: "Excessive Table Joins (> 5 Tables)",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      if (ctx.metrics.joinCount >= 5) {
        return {
          id: `issue-R013-${Date.now()}`,
          ruleCode: "R013",
          title: "Excessive Table Joins (> 5 Tables)",
          description: `Query joins ${ctx.metrics.joinCount} tables. Joining more than 5 tables exponentially increases query planner search space and lock contention.`,
          category: "PERFORMANCE",
          severity: "MEDIUM",
          confidence: 0.9,
          evidence: `${ctx.metrics.joinCount} JOIN operations in single query.`,
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Denormalize reporting models or break down query with CTEs or materialized views.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R014: Dynamic SQL Construction Risk
  {
    code: "R014",
    title: "Dynamic String Concatenation Risk",
    category: "SECURITY",
    severity: "HIGH",
    analyze: (ctx) => {
      if (
        /EXEC(?:UTE)?\s*\(/i.test(ctx.sql) ||
        /EXECUTE\s+IMMEDIATE\b/i.test(ctx.sql) ||
        /\|\|\s*'/i.test(ctx.sql)
      ) {
        return {
          id: `issue-R014-${Date.now()}`,
          ruleCode: "R014",
          title: "Dynamic String Concatenation Risk",
          description:
            "Dynamic SQL execution without parameterized queries exposes database to syntax parsing overhead and potential injection.",
          category: "SECURITY",
          severity: "HIGH",
          confidence: 0.85,
          evidence: "EXECUTE / dynamic concatenation detected.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Use parameterized queries ($1, $2 or ?) instead of string concatenation.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R015: SQL Injection Risk
  {
    code: "R015",
    title: "Critical SQL Injection Vulnerability Risk",
    category: "SECURITY",
    severity: "CRITICAL",
    analyze: (ctx) => {
      if (
        /--\s*$/m.test(ctx.sql) ||
        /\bOR\s+'1'\s*=\s*'1'/i.test(ctx.sql) ||
        /\bUNION\s+SELECT\b/i.test(ctx.sql)
      ) {
        return {
          id: `issue-R015-${Date.now()}`,
          ruleCode: "R015",
          title: "Critical SQL Injection Vulnerability Risk",
          description:
            "Detected signature commonly associated with SQL injection attempts (tautology '1'='1' or comment truncation).",
          category: "SECURITY",
          severity: "CRITICAL",
          confidence: 0.9,
          evidence:
            "Pattern matching injection heuristics (e.g., OR '1'='1').",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Enforce strict parameterization using prepared statements.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R015B: Any DELETE statement
  {
    code: "R015B",
    title: "Destructive Action: DELETE Statement",
    category: "SECURITY",
    severity: "CRITICAL",
    analyze: (ctx) => {
      if (/^\s*DELETE\s+FROM\b/i.test(ctx.sql)) {
        return {
          id: `issue-R015B-${Date.now()}`,
          ruleCode: "R015B",
          title: "Destructive Action: DELETE Statement",
          description:
            "DELETE is a destructive data-modification operation and can permanently remove database records.",
          category: "SECURITY",
          severity: "CRITICAL",
          confidence: 1.0,
          evidence: "DELETE FROM statement detected.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Do not execute DELETE against the target database unless explicitly authorized. Use a read-only transaction or require explicit destructive-operation confirmation.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R016: UPDATE without WHERE
  {
    code: "R016",
    title: "Destructive Action: UPDATE without WHERE Clause",
    category: "SECURITY",
    severity: "CRITICAL",
    analyze: (ctx) => {
      if (
        /^\s*UPDATE\b/i.test(ctx.sql) &&
        !/\bWHERE\b/i.test(ctx.sql)
      ) {
        return {
          id: `issue-R016-${Date.now()}`,
          ruleCode: "R016",
          title: "Destructive Action: UPDATE without WHERE Clause",
          description:
            "UPDATE statement lacks a WHERE clause and will mutate ALL rows in the table!",
          category: "SECURITY",
          severity: "CRITICAL",
          confidence: 1.0,
          evidence: "UPDATE statement contains no WHERE predicate.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Add an explicit WHERE condition to specify targeted rows.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R017: DELETE without WHERE
  {
    code: "R017",
    title: "Destructive Action: DELETE without WHERE Clause",
    category: "SECURITY",
    severity: "CRITICAL",
    analyze: (ctx) => {
      if (
        /^\s*DELETE\s+FROM\b/i.test(ctx.sql) &&
        !/\bWHERE\b/i.test(ctx.sql)
      ) {
        return {
          id: `issue-R017-${Date.now()}`,
          ruleCode: "R017",
          title: "Destructive Action: DELETE without WHERE Clause",
          description:
            "DELETE statement lacks a WHERE clause and will irreversibly delete ALL rows in the table!",
          category: "SECURITY",
          severity: "CRITICAL",
          confidence: 1.0,
          evidence: "DELETE FROM statement contains no WHERE predicate.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Add an explicit WHERE condition with primary key or targeted partition.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R018: TRUNCATE Table
  {
    code: "R018",
    title: "DDL Action: TRUNCATE Table",
    category: "SECURITY",
    severity: "HIGH",
    analyze: (ctx) => {
      if (/^\s*TRUNCATE\b/i.test(ctx.sql)) {
        return {
          id: `issue-R018-${Date.now()}`,
          ruleCode: "R018",
          title: "DDL Action: TRUNCATE Table",
          description:
            "TRUNCATE immediately removes all rows and resets sequence generators, bypassing row-level audit triggers.",
          category: "SECURITY",
          severity: "HIGH",
          confidence: 1.0,
          evidence: "TRUNCATE statement detected.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Ensure this DDL operation is intentional and verified in non-production environment.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R019: DROP Object
  {
    code: "R019",
    title: "DDL Action: DROP Object Statement",
    category: "SECURITY",
    severity: "CRITICAL",
    analyze: (ctx) => {
      if (
        /^\s*DROP\s+(TABLE|VIEW|INDEX|SCHEMA|DATABASE)\b/i.test(ctx.sql)
      ) {
        return {
          id: `issue-R019-${Date.now()}`,
          ruleCode: "R019",
          title: "DDL Action: DROP Object Statement",
          description:
            "DROP permanently destroys schema objects and all associated data records.",
          category: "SECURITY",
          severity: "CRITICAL",
          confidence: 1.0,
          evidence: "DROP statement detected.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Verify backups before dropping any schema entity.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R020: Unbounded Query (No LIMIT / Pagination)
  {
    code: "R020",
    title: "Unbounded Query Without LIMIT",
    category: "PERFORMANCE",
    severity: "LOW",
    analyze: (ctx) => {
      if (
        /^\s*SELECT\b/i.test(ctx.sql) &&
        !ctx.metrics.hasLimit &&
        !ctx.metrics.aggregateCount
      ) {
        return {
          id: `issue-R020-${Date.now()}`,
          ruleCode: "R020",
          title: "Unbounded Query Without LIMIT",
          description:
            "SELECT query does not specify a LIMIT or pagination clause, potentially transferring unbounded rows to the client.",
          category: "PERFORMANCE",
          severity: "LOW",
          confidence: 0.85,
          evidence: "No LIMIT or FETCH FIRST clause in query.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Append LIMIT (e.g. LIMIT 100) or pagination cursor.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R021: Missing Join Predicate
  {
    code: "R021",
    title: "Missing Join ON Predicate",
    category: "QUALITY",
    severity: "HIGH",
    analyze: (ctx) => {
      if (ctx.ast.type === "SelectStatement") {
        const joins = ctx.ast.joins || [];

        for (const j of joins) {
          if (
            j.joinType !== "CROSS" &&
            j.joinType !== "NATURAL" &&
            !j.onCondition &&
            (!j.usingColumns || j.usingColumns.length === 0)
          ) {
            return {
              id: `issue-R021-${Date.now()}`,
              ruleCode: "R021",
              title: "Missing Join ON Predicate",
              description: `JOIN on table '${j.table.name}' does not contain an ON condition or USING clause.`,
              category: "QUALITY",
              severity: "HIGH",
              confidence: 1.0,
              evidence: `JOIN ${j.table.name} has no ON expression.`,
              affectedTables: [j.table.name],
              affectedColumns: [],
              recommendation: `Specify ON condition (e.g., ON a.id = ${j.table.name}.a_id).`,
              databaseType: ctx.databaseType,
            };
          }
        }
      }

      return null;
    },
  },

  // R022: ORDER BY without supporting index on large table
  {
    code: "R022",
    title: "ORDER BY on Potentially Unindexed Column",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      if (ctx.metrics.hasOrderBy && !ctx.metrics.hasLimit) {
        return {
          id: `issue-R022-${Date.now()}`,
          ruleCode: "R022",
          title: "ORDER BY on Potentially Unindexed Column",
          description:
            "Sorting full result sets without a LIMIT or index access path forces an in-memory or disk-based Sort node.",
          category: "PERFORMANCE",
          severity: "MEDIUM",
          confidence: 0.8,
          evidence: "ORDER BY clause present without LIMIT clause.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Add index matching ORDER BY columns and limit result size.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R023: GROUP BY without useful index
  {
    code: "R023",
    title: "Unindexed GROUP BY Access Path",
    category: "PERFORMANCE",
    severity: "MEDIUM",
    analyze: (ctx) => {
      if (ctx.metrics.hasGroupBy && ctx.metrics.joinCount > 1) {
        return {
          id: `issue-R023-${Date.now()}`,
          ruleCode: "R023",
          title: "Unindexed GROUP BY Access Path",
          description:
            "Aggregating across multiple joined tables requires expensive HashAggregate or GroupAggregate steps.",
          category: "PERFORMANCE",
          severity: "MEDIUM",
          confidence: 0.75,
          evidence: "GROUP BY evaluated across multi-table join.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Pre-aggregate within a CTE before performing outer joins.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R024: Function-based filtering on indexed timestamp
  {
    code: "R024",
    title: "Function-Based Filtering on Timestamp",
    category: "PERFORMANCE",
    severity: "HIGH",
    analyze: (ctx) => {
      if (/\b(?:DATE_TRUNC|DATE|EXTRACT)\s*\([^)]+\)\s*=\s*/i.test(ctx.sql)) {
        return {
          id: `issue-R024-${Date.now()}`,
          ruleCode: "R024",
          title: "Function-Based Filtering on Timestamp",
          description:
            "Wrapping timestamp columns in DATE_TRUNC() or DATE() disables standard range index seeks.",
          category: "PERFORMANCE",
          severity: "HIGH",
          confidence: 0.9,
          evidence: "DATE_TRUNC / DATE function used in comparison.",
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Convert to range bounds: created_at >= '2026-01-01' AND created_at < '2026-02-01'.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },

  // R025: Leading wildcard LIKE pattern
  {
    code: "R025",
    title: "Leading Wildcard in LIKE Predicate",
    category: "PERFORMANCE",
    severity: "HIGH",
    analyze: (ctx) => {
      const match = ctx.sql.match(/\b(LIKE|ILIKE)\s+'([%_][^']*)'/i);

      if (match) {
        return {
          id: `issue-R025-${Date.now()}`,
          ruleCode: "R025",
          title: "Leading Wildcard in LIKE Predicate",
          description: `Pattern '${match[2]}' begins with a wildcard '${match[2][0]}', which completely prevents B-Tree index seeks.`,
          category: "PERFORMANCE",
          severity: "HIGH",
          confidence: 1.0,
          evidence: `Predicate contains: ${match[0]}`,
          affectedTables: ctx.metrics.tablesReferenced,
          affectedColumns: [],
          recommendation:
            "Use full-text search (TSVECTOR / GIN index in Postgres) or remove leading '%'.",
          databaseType: ctx.databaseType,
        };
      }

      return null;
    },
  },
];