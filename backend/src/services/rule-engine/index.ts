export interface RuleIssue {
  id: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  category: string;
  evidence: string;
  recommendation: string;
  confidence: number;
}

export class RuleEngine {
  public static analyze(sql: string, tableMetadataList?: any[]): RuleIssue[] {
    const issues: RuleIssue[] = [];
    const normalizedSql = sql.toUpperCase().trim();
    const cleanSql = sql.replace(/\s+/g, " ");

    // RULE-001: SELECT *
    if (/\bSELECT\s+\*\b/i.test(sql)) {
      issues.push({
        id: "RULE-001",
        title: "Avoid SELECT *",
        description: "Selecting all columns increases network traffic, prevents index-only scans, and creates application fragility.",
        severity: "MEDIUM",
        category: "Performance",
        evidence: "SELECT *",
        recommendation: "Specify only the exact columns required by your application.",
        confidence: 0.95
      });
    }

    // RULE-002: Function applied to indexed/filter column
    // e.g. LOWER(email) = '...', YEAR(created_at) = 2025
    if (/\b(?:LOWER|UPPER|YEAR|MONTH|DATE|TO_CHAR|ROUND|TRUNC)\s*\(\s*\w+\s*\)/i.test(sql)) {
      issues.push({
        id: "RULE-002",
        title: "Function on Filter Column",
        description: "Applying a function to a column in the WHERE clause prevents the database from utilizing standard indexes on that column.",
        severity: "HIGH",
        category: "Performance",
        evidence: sql.match(/\b(?:LOWER|UPPER|YEAR|MONTH|DATE|TO_CHAR|ROUND|TRUNC)\s*\(\s*\w+\s*\)/i)?.[0] || "Function in WHERE",
        recommendation: "Use sargable expressions or define a functional (expression-based) index.",
        confidence: 0.9
      });
    }

    // RULE-005: Correlated subquery
    // e.g. WHERE x.id IN (SELECT id FROM y WHERE y.ref = x.ref)
    if (/\bWHERE\s+.*?\b(IN|EXISTS)\s*\(\s*SELECT\s+.*?\bWHERE\s+.*?\b\w+\.\w+\s*=\s*\w+\.\w+/i.test(cleanSql)) {
      issues.push({
        id: "RULE-005",
        title: "Potential Correlated Subquery",
        description: "Correlated subqueries execute once for each row processed by the outer query, causing slow execution plans.",
        severity: "HIGH",
        category: "Performance",
        evidence: "Subquery references outer table prefix",
        recommendation: "Refactor the subquery into a JOIN or a Common Table Expression (CTE).",
        confidence: 0.8
      });
    }

    // RULE-006: Deep nested subquery
    const subqueryCount = (sql.match(/\bSELECT\b/gi) || []).length;
    if (subqueryCount > 3) {
      issues.push({
        id: "RULE-006",
        title: "Deeply Nested Subqueries",
        description: "Too many nested subqueries make the query difficult to maintain and optimize.",
        severity: "MEDIUM",
        category: "Maintainability",
        evidence: `Found ${subqueryCount} SELECT statements`,
        recommendation: "Use Common Table Expressions (CTEs) or temporary tables to flatten the query structure.",
        confidence: 0.95
      });
    }

    // RULE-007: Unnecessary DISTINCT
    if (/\bSELECT\s+DISTINCT\b/i.test(sql)) {
      issues.push({
        id: "RULE-007",
        title: "Unnecessary DISTINCT Usage",
        description: "DISTINCT triggers a sort and deduplication operation, which is highly resource-intensive if rows are already unique.",
        severity: "MEDIUM",
        category: "Performance",
        evidence: "SELECT DISTINCT",
        recommendation: "Verify if rows are already unique or optimize joining criteria to prevent duplicate rows without DISTINCT.",
        confidence: 0.75
      });
    }

    // RULE-008: Large IN clause
    const inMatch = sql.match(/\bIN\s*\(\s*([^)]+)\s*\)/i);
    if (inMatch) {
      const items = inMatch[1].split(",");
      if (items.length > 50) {
        issues.push({
          id: "RULE-008",
          title: "Large IN Clause List",
          description: "An IN clause with a massive literal value list degrades parser performance and increases cost.",
          severity: "MEDIUM",
          category: "Performance",
          evidence: `IN clause with ${items.length} items`,
          recommendation: "Join against a temporary table or use a subquery.",
          confidence: 0.9
        });
      }
    }

    // RULE-009: OR-heavy filtering
    const orCount = (sql.match(/\bOR\b/gi) || []).length;
    if (orCount > 5) {
      issues.push({
        id: "RULE-009",
        title: "Excessive OR Conditions",
        description: "OR-heavy clauses make index selection difficult, forcing index scans or full table scans.",
        severity: "MEDIUM",
        category: "Performance",
        evidence: `${orCount} OR operators`,
        recommendation: "Split the query using UNION ALL or use IN list if filtering on the same column.",
        confidence: 0.85
      });
    }

    // RULE-010: Implicit type conversion
    // Hard to check purely statically without schema columns, but we can note numeric vs string assignments
    if (/\w+\s*=\s*'\d+'/i.test(sql) || /\w+\s*=\s*\d+/i.test(sql)) {
      // General warning rule if we suspect type casting mismatches
    }

    // RULE-012: Potential SQL injection
    if (/\bUNION\s+SELECT\b/i.test(sql) || /'\s*OR\s*'\d+'\s*=\s*'\d+'/i.test(sql)) {
      issues.push({
        id: "RULE-012",
        title: "Potential SQL Injection Pattern",
        description: "The SQL contains keywords or syntax patterns that are commonly used in SQL injection attacks.",
        severity: "CRITICAL",
        category: "Security",
        evidence: "UNION SELECT or tautology detected",
        recommendation: "Ensure all parameters are passed using parameterized bindings.",
        confidence: 0.9
      });
    }

    // RULE-013: Dynamic SQL
    if (/\bEXEC(?:UTE)?\s*\(/i.test(sql) || /\bEXECUTE\s+IMMEDIATE\b/i.test(sql)) {
      issues.push({
        id: "RULE-013",
        title: "Dynamic SQL execution",
        description: "Executing dynamically constructed SQL statement strings increases injection risks and hinders caching.",
        severity: "HIGH",
        category: "Security",
        evidence: "EXECUTE or EXEC statement",
        recommendation: "Use static parameterized queries where possible.",
        confidence: 0.95
      });
    }

    // RULE-014: Cursor usage
    if (/\bDECLARE\s+\w+\s+CURSOR\b/i.test(sql) || /\bFETCH\s+NEXT\s+FROM\b/i.test(sql)) {
      issues.push({
        id: "RULE-014",
        title: "Cursor Usage Detected",
        description: "Cursors process rows procedurally rather than set-based, which leads to slow execution on large datasets.",
        severity: "MEDIUM",
        category: "Performance",
        evidence: "CURSOR definition/FETCH statement",
        recommendation: "Replace procedural cursors with set-based SQL joins and aggregations.",
        confidence: 0.95
      });
    }

    // RULE-015: UPDATE without WHERE
    if (/\bUPDATE\s+\w+\s+SET\b/i.test(cleanSql) && !/\bWHERE\b/i.test(cleanSql)) {
      issues.push({
        id: "RULE-015",
        title: "Unconditional UPDATE",
        description: "The UPDATE statement does not contain a WHERE clause and will update all rows in the table.",
        severity: "CRITICAL",
        category: "Security",
        evidence: "UPDATE without WHERE",
        recommendation: "Always specify a WHERE clause unless you explicitly intend to modify the entire table.",
        confidence: 0.99
      });
    }

    // RULE-016: DELETE without WHERE
    if (/\bDELETE\s+FROM\s+\w+\b/i.test(cleanSql) && !/\bWHERE\b/i.test(cleanSql)) {
      issues.push({
        id: "RULE-016",
        title: "Unconditional DELETE",
        description: "The DELETE statement does not contain a WHERE clause and will delete all rows in the table.",
        severity: "CRITICAL",
        category: "Security",
        evidence: "DELETE without WHERE",
        recommendation: "Use TRUNCATE if you intend to empty the table, or always specify a WHERE clause to limit deletions.",
        confidence: 0.99
      });
    }

    // RULE-017: TRUNCATE
    if (/\bTRUNCATE\b/i.test(sql)) {
      issues.push({
        id: "RULE-017",
        title: "Table Truncation (TRUNCATE)",
        description: "TRUNCATE is a DDL operation that instantly deletes all rows from a table and cannot be rolled back easily in some database settings.",
        severity: "CRITICAL",
        category: "Security",
        evidence: "TRUNCATE statement",
        recommendation: "Ensure this command is executed only in administrative contexts.",
        confidence: 0.95
      });
    }

    // RULE-018: DROP
    if (/\bDROP\s+(TABLE|VIEW|PROCEDURE|FUNCTION|TRIGGER|INDEX|DATABASE)\b/i.test(sql)) {
      issues.push({
        id: "RULE-018",
        title: "Object Drop (DROP)",
        description: "DROP deletes database structural objects permanently. High risk of accidental data loss.",
        severity: "CRITICAL",
        category: "Security",
        evidence: "DROP statement",
        recommendation: "Ensure double checks or backup mechanisms before running schema migrations.",
        confidence: 0.98
      });
    }

    // RULE-019: Potential Cartesian join
    if (/\bFROM\s+\w+\s*,\s*\w+/i.test(cleanSql) && !/\bWHERE\b/i.test(cleanSql)) {
      issues.push({
        id: "RULE-019",
        title: "Potential Cartesian Product (Cross Join)",
        description: "Listing multiple tables in the FROM clause without JOIN criteria creates a Cartesian product, producing massive numbers of rows.",
        severity: "CRITICAL",
        category: "Performance",
        evidence: "Multiple tables in FROM without WHERE",
        recommendation: "Use explicit INNER/LEFT JOIN syntax with clear ON constraints.",
        confidence: 0.9
      });
    }

    // RULE-020: Excessive joins
    const joinMatches = sql.match(/\bJOIN\b/gi);
    const joinCount = joinMatches ? joinMatches.length : 0;
    if (joinCount > 5) {
      issues.push({
        id: "RULE-020",
        title: "Excessive Table Joins",
        description: "Queries joining more than 5 tables become highly complex, causing the query planner to spend substantial time finding plans.",
        severity: "MEDIUM",
        category: "Performance",
        evidence: `${joinCount} table JOINs`,
        recommendation: "Consider denormalizing, partitioning, or splitting the query into multiple smaller queries.",
        confidence: 0.95
      });
    }

    return issues;
  }
}
