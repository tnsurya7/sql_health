import {
  SqlStatementNode,
  SelectStatementNode,
  UpdateStatementNode,
  DeleteStatementNode,
  InsertStatementNode,
  TruncateStatementNode,
  DropStatementNode,
  TableReferenceNode,
  JoinClauseNode,
  ExpressionNode,
  ColumnReferenceNode,
  StarReferenceNode,
  LiteralValueNode,
  BinaryExpressionNode,
  FunctionExpressionNode,
  AggregateExpressionNode,
  InExpressionNode,
  LikeExpressionNode,
  OrderByItemNode,
  CteClauseNode,
  CteDefinitionNode,
  JoinType,
} from "./ast.types";
import { DialectDetector, SqlDialect } from "./dialect";

export class SqlParser {
  /**
   * Validates SQL syntax and returns error string if invalid.
   */
  public static validateSyntax(sql: string): string | null {
    const cleaned = sql.trim().replace(/;+$/, "");
    if (!cleaned) return "Empty SQL query string.";

    // 1. Check unbalanced parentheses
    let depth = 0;
    let inSingleQuote = false;
    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (c === "'" && (i === 0 || cleaned[i - 1] !== "\\")) {
        inSingleQuote = !inSingleQuote;
      } else if (!inSingleQuote) {
        if (c === "(") depth++;
        else if (c === ")") depth--;
        if (depth < 0) return "Unbalanced closing parenthesis ')'.";
      }
    }
    if (depth !== 0) return "Unclosed parenthesis '('.";
    if (inSingleQuote) return "Unclosed string literal quote.";

    // 2. Check for hanging keywords at the end of statement
    if (/\b(WHERE|AND|OR|FROM|JOIN|ON|HAVING|ORDER\s+BY|GROUP\s+BY|SELECT|SET|VALUES)\s*$/i.test(cleaned)) {
      return `Incomplete statement: trailing hanging keyword at end of query.`;
    }

    // 3. Check for malformed SELECT statement
    if (/^\s*SELECT\b/i.test(cleaned)) {
      if (/\bFRM\b/i.test(cleaned)) {
        return "Syntax Error: Misspelled 'FRM', expected 'FROM'.";
      }
      if (!/\bFROM\b/i.test(cleaned) && !/^\s*SELECT\s+(?:[\d\w\(\)\+\-\*\/'",\s]+)$/i.test(cleaned)) {
        return "Syntax Error: SELECT statement missing FROM clause.";
      }
    }

    return null;
  }

  /**
   * Parses a SQL string into a structured AST.
   */
  public static parse(sql: string, dialect?: SqlDialect): SqlStatementNode {
    const syntaxErr = SqlParser.validateSyntax(sql);
    if (syntaxErr) {
      throw new Error(`SQL Syntax Error: ${syntaxErr}`);
    }

    const detectedDialect = dialect || DialectDetector.detect(sql);
    const cleaned = sql.trim().replace(/;+$/, "");

    // 1. Check for DML / DDL statements first
    if (/^\s*DROP\s+/i.test(cleaned)) {
      return SqlParser.parseDrop(cleaned);
    }
    if (/^\s*TRUNCATE\s+/i.test(cleaned)) {
      return SqlParser.parseTruncate(cleaned);
    }
    if (/^\s*UPDATE\s+/i.test(cleaned)) {
      return SqlParser.parseUpdate(cleaned);
    }
    if (/^\s*DELETE\s+/i.test(cleaned)) {
      return SqlParser.parseDelete(cleaned);
    }
    if (/^\s*INSERT\s+/i.test(cleaned)) {
      return SqlParser.parseInsert(cleaned);
    }

    // Default: parse as SELECT / CTE
    return SqlParser.parseSelect(cleaned, detectedDialect);
  }

  private static parseDrop(sql: string): DropStatementNode {
    const match = sql.match(/^\s*DROP\s+(TABLE|VIEW|INDEX|SCHEMA|DATABASE)\s+(?:IF\s+EXISTS\s+)?([\w\."]+)/i);
    const objectType = (match ? match[1].toUpperCase() : "TABLE") as any;
    const fullName = match ? match[2].replace(/"/g, "") : "unknown";
    const parts = fullName.split(".");
    return {
      type: "DropStatement",
      objectType,
      schema: parts.length > 1 ? parts[0] : undefined,
      name: parts.length > 1 ? parts[1] : parts[0],
    };
  }

  private static parseTruncate(sql: string): TruncateStatementNode {
    const match = sql.match(/^\s*TRUNCATE\s+(?:TABLE\s+)?([\w\."]+)/i);
    const fullName = match ? match[1].replace(/"/g, "") : "unknown";
    const parts = fullName.split(".");
    return {
      type: "TruncateStatement",
      schema: parts.length > 1 ? parts[0] : undefined,
      table: parts.length > 1 ? parts[1] : parts[0],
    };
  }

  private static parseUpdate(sql: string): UpdateStatementNode {
    const tableMatch = sql.match(/^\s*UPDATE\s+([\w\."]+)/i);
    const fullName = tableMatch ? tableMatch[1].replace(/"/g, "") : "unknown";
    const parts = fullName.split(".");

    const setMatch = sql.match(/\bSET\s+(.+?)(?:\s+WHERE\s+|$)/i);
    const setClauses: { column: string; value: ExpressionNode }[] = [];
    if (setMatch) {
      const items = setMatch[1].split(",");
      for (const item of items) {
        const [col, val] = item.split("=");
        if (col && val) {
          setClauses.push({
            column: col.trim().replace(/"/g, ""),
            value: SqlParser.parseExpression(val.trim()),
          });
        }
      }
    }

    const whereMatch = sql.match(/\bWHERE\s+(.+)$/i);
    const where = whereMatch ? SqlParser.parseExpression(whereMatch[1].trim()) : undefined;

    return {
      type: "UpdateStatement",
      schema: parts.length > 1 ? parts[0] : undefined,
      table: parts.length > 1 ? parts[1] : parts[0],
      setClauses,
      where,
    };
  }

  private static parseDelete(sql: string): DeleteStatementNode {
    const tableMatch = sql.match(/^\s*DELETE\s+FROM\s+([\w\."]+)/i);
    const fullName = tableMatch ? tableMatch[1].replace(/"/g, "") : "unknown";
    const parts = fullName.split(".");

    const whereMatch = sql.match(/\bWHERE\s+(.+)$/i);
    const where = whereMatch ? SqlParser.parseExpression(whereMatch[1].trim()) : undefined;

    return {
      type: "DeleteStatement",
      schema: parts.length > 1 ? parts[0] : undefined,
      table: parts.length > 1 ? parts[1] : parts[0],
      where,
    };
  }

  private static parseInsert(sql: string): InsertStatementNode {
    const tableMatch = sql.match(/^\s*INSERT\s+INTO\s+([\w\."]+)(?:\s*\((.+?)\))?/i);
    const fullName = tableMatch ? tableMatch[1].replace(/"/g, "") : "unknown";
    const parts = fullName.split(".");
    const cols = tableMatch && tableMatch[2] ? tableMatch[2].split(",").map((c) => c.trim().replace(/"/g, "")) : undefined;

    const valuesMatch = sql.match(/\bVALUES\s*\((.+)\)/i);
    const valuesCount = valuesMatch ? valuesMatch[1].split(",").length : undefined;

    return {
      type: "InsertStatement",
      schema: parts.length > 1 ? parts[0] : undefined,
      table: parts.length > 1 ? parts[1] : parts[0],
      columns: cols,
      valuesCount,
    };
  }

  public static parseSelect(sql: string, dialect: SqlDialect = "postgresql"): SelectStatementNode {
    let workingSql = sql.trim();
    let cte: CteClauseNode | undefined;

    // Check for CTE (WITH ... AS (...))
    if (/^\s*WITH\b/i.test(workingSql)) {
      const withMatch = workingSql.match(/^\s*WITH\s+(RECURSIVE\s+)?([\s\S]+?)\s+SELECT\b/i);
      if (withMatch) {
        const isRecursive = Boolean(withMatch[1]);
        const cteBody = withMatch[2];
        const ctes: CteDefinitionNode[] = [];

        // Parse individual CTEs: name AS (SELECT ...)
        const cteRegex = /([a-zA-Z_]\w*)\s+AS\s*\(([\s\S]+?)\)(?:,\s*|$)/gi;
        let cMatch;
        while ((cMatch = cteRegex.exec(cteBody)) !== null) {
          ctes.push({
            type: "CteDefinition",
            name: cMatch[1],
            query: SqlParser.parseSelect(cMatch[2], dialect),
          });
        }

        cte = { type: "CteClause", isRecursive, ctes };
        // Retain only the main SELECT body
        const mainSelectIdx = workingSql.search(/\bSELECT\b/i);
        if (mainSelectIdx !== -1) {
          workingSql = workingSql.substring(mainSelectIdx);
        }
      }
    }

    const isDistinct = /^\s*SELECT\s+DISTINCT\b/i.test(workingSql);

    // Extract clauses using keyword regex
    const projectionsStr = SqlParser.extractClause(workingSql, "SELECT(?:\\s+DISTINCT)?", ["FROM"]);
    const fromStr = SqlParser.extractClause(workingSql, "FROM", ["WHERE", "GROUP\\s+BY", "HAVING", "ORDER\\s+BY", "LIMIT", "UNION"]);
    const whereStr = SqlParser.extractClause(workingSql, "WHERE", ["GROUP\\s+BY", "HAVING", "ORDER\\s+BY", "LIMIT", "UNION"]);
    const groupByStr = SqlParser.extractClause(workingSql, "GROUP\\s+BY", ["HAVING", "ORDER\\s+BY", "LIMIT", "UNION"]);
    const havingStr = SqlParser.extractClause(workingSql, "HAVING", ["ORDER\\s+BY", "LIMIT", "UNION"]);
    const orderByStr = SqlParser.extractClause(workingSql, "ORDER\\s+BY", ["LIMIT", "UNION"]);
    const limitStr = SqlParser.extractClause(workingSql, "LIMIT", ["OFFSET", "UNION"]);
    const offsetStr = SqlParser.extractClause(workingSql, "OFFSET", ["UNION"]);

    // Parse Projections
    const projections: ExpressionNode[] = [];
    if (projectionsStr) {
      const projItems = SqlParser.splitTopLevel(projectionsStr, ",");
      for (const item of projItems) {
        projections.push(SqlParser.parseExpression(item.trim()));
      }
    }

    // Parse FROM & JOINs
    const from: TableReferenceNode[] = [];
    const joins: JoinClauseNode[] = [];
    if (fromStr) {
      SqlParser.parseFromAndJoins(fromStr, from, joins, dialect);
    }

    // Parse WHERE
    const where = whereStr ? SqlParser.parseExpression(whereStr.trim()) : undefined;

    // Parse GROUP BY
    const groupBy: ExpressionNode[] = [];
    if (groupByStr) {
      const groupItems = SqlParser.splitTopLevel(groupByStr, ",");
      for (const item of groupItems) {
        groupBy.push(SqlParser.parseExpression(item.trim()));
      }
    }

    // Parse HAVING
    const having = havingStr ? SqlParser.parseExpression(havingStr.trim()) : undefined;

    // Parse ORDER BY
    const orderBy: OrderByItemNode[] = [];
    if (orderByStr) {
      const orderItems = SqlParser.splitTopLevel(orderByStr, ",");
      for (const item of orderItems) {
        const itemTrim = item.trim();
        const dirMatch = itemTrim.match(/\s+(ASC|DESC)(?:\s+NULLS\s+(FIRST|LAST))?$/i);
        const direction = dirMatch ? (dirMatch[1].toUpperCase() as "ASC" | "DESC") : "ASC";
        const nulls = dirMatch && dirMatch[2] ? (dirMatch[2].toUpperCase() as "FIRST" | "LAST") : undefined;
        const exprStr = dirMatch ? itemTrim.substring(0, dirMatch.index).trim() : itemTrim;
        orderBy.push({
          type: "OrderByItem",
          expression: SqlParser.parseExpression(exprStr),
          direction,
          nulls,
        });
      }
    }

    // Parse LIMIT & OFFSET
    let limit: number | undefined;
    let offset: number | undefined;
    if (limitStr) {
      const lMatch = limitStr.match(/^(\d+)/);
      if (lMatch) limit = parseInt(lMatch[1], 10);
    }
    if (offsetStr) {
      const oMatch = offsetStr.match(/^(\d+)/);
      if (oMatch) offset = parseInt(oMatch[1], 10);
    }

    return {
      type: "SelectStatement",
      isDistinct,
      cte,
      projections,
      from: from.length > 0 ? from : undefined,
      joins: joins.length > 0 ? joins : undefined,
      where,
      groupBy: groupBy.length > 0 ? groupBy : undefined,
      having,
      orderBy: orderBy.length > 0 ? orderBy : undefined,
      limit,
      offset,
    };
  }

  private static parseFromAndJoins(
    fromClauseStr: string,
    fromList: TableReferenceNode[],
    joinList: JoinClauseNode[],
    dialect: SqlDialect
  ): void {
    // Split by JOIN keywords while honoring nested parentheses
    const joinRegex = /\b(LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN|CROSS\s+JOIN|NATURAL\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|INNER\s+JOIN|JOIN)\b/gi;
    const parts: { text: string; joinType?: JoinType }[] = [];
    let lastIndex = 0;
    let match;

    while ((match = joinRegex.exec(fromClauseStr)) !== null) {
      if (lastIndex === 0) {
        parts.push({ text: fromClauseStr.substring(0, match.index).trim() });
      }
      let rawJoin = match[1].toUpperCase().replace(/\s+OUTER/g, "");
      let type: JoinType = "INNER";
      if (rawJoin.includes("LEFT")) type = "LEFT";
      else if (rawJoin.includes("RIGHT")) type = "RIGHT";
      else if (rawJoin.includes("FULL")) type = "FULL";
      else if (rawJoin.includes("CROSS")) type = "CROSS";
      else if (rawJoin.includes("NATURAL")) type = "NATURAL";

      const nextStart = joinRegex.lastIndex;
      // We will slice until the next join keyword or end
      const remaining = fromClauseStr.substring(nextStart);
      const nextMatch = remaining.search(joinRegex);
      const chunk = nextMatch !== -1 ? remaining.substring(0, nextMatch) : remaining;

      parts.push({ text: chunk.trim(), joinType: type });
      lastIndex = nextStart + chunk.length;
    }

    if (parts.length === 0) {
      // Comma-separated tables
      const tables = SqlParser.splitTopLevel(fromClauseStr, ",");
      for (let i = 0; i < tables.length; i++) {
        const t = SqlParser.parseTableReference(tables[i].trim());
        if (i === 0) {
          fromList.push(t);
        } else {
          // Comma join is semantically a CROSS/COMMA join
          joinList.push({
            type: "JoinClause",
            joinType: "COMMA",
            table: t,
          });
        }
      }
      return;
    }

    // Process first FROM table
    if (parts[0]) {
      const tables = SqlParser.splitTopLevel(parts[0].text, ",");
      for (let i = 0; i < tables.length; i++) {
        const t = SqlParser.parseTableReference(tables[i].trim());
        if (i === 0) {
          fromList.push(t);
        } else {
          joinList.push({ type: "JoinClause", joinType: "COMMA", table: t });
        }
      }
    }

    // Process subsequent JOINs
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i];
      const onMatch = p.text.match(/\s+ON\s+([\s\S]+)$/i);
      const usingMatch = p.text.match(/\s+USING\s*\(([^)]+)\)$/i);

      let tableChunk = p.text;
      let onCondition: ExpressionNode | undefined;
      let usingColumns: string[] | undefined;

      if (onMatch) {
        tableChunk = p.text.substring(0, onMatch.index).trim();
        onCondition = SqlParser.parseExpression(onMatch[1].trim());
      } else if (usingMatch) {
        tableChunk = p.text.substring(0, usingMatch.index).trim();
        usingColumns = usingMatch[1].split(",").map((c) => c.trim().replace(/"/g, ""));
      }

      const tableRef = SqlParser.parseTableReference(tableChunk);
      joinList.push({
        type: "JoinClause",
        joinType: p.joinType || "INNER",
        table: tableRef,
        onCondition,
        usingColumns,
      });
    }
  }

  private static parseTableReference(chunk: string): TableReferenceNode {
    const text = chunk.trim();
    // Subquery table: (SELECT ...) AS alias
    if (text.startsWith("(")) {
      const closeIdx = text.lastIndexOf(")");
      if (closeIdx !== -1) {
        const subquerySql = text.substring(1, closeIdx).trim();
        const aliasChunk = text.substring(closeIdx + 1).trim().replace(/^\s*AS\s+/i, "");
        return {
          type: "TableReference",
          name: aliasChunk || "subquery_table",
          alias: aliasChunk || undefined,
          subquery: SqlParser.parseSelect(subquerySql),
        };
      }
    }

    const parts = text.split(/\s+(?:AS\s+)?/i);
    const fullName = parts[0].replace(/"/g, "").replace(/`/g, "");
    const alias = parts.length > 1 ? parts[1].replace(/"/g, "").replace(/`/g, "") : undefined;
    const nameParts = fullName.split(".");

    return {
      type: "TableReference",
      schema: nameParts.length > 1 ? nameParts[0] : undefined,
      name: nameParts.length > 1 ? nameParts[1] : nameParts[0],
      alias,
    };
  }

  public static parseExpression(rawExpr: string): ExpressionNode {
    const expr = rawExpr.trim();

    // 1. Star Reference: * or table.*
    if (expr === "*" || /^\w+\.\*$/.test(expr)) {
      const parts = expr.split(".");
      return {
        type: "StarReference",
        table: parts.length > 1 ? parts[0] : undefined,
      };
    }

    // 2. Subquery expression: (SELECT ...)
    if (expr.startsWith("(") && expr.endsWith(")") && /^\(\s*SELECT\b/i.test(expr)) {
      return {
        type: "Subquery",
        query: SqlParser.parseSelect(expr.slice(1, -1)),
      };
    }

    // 3. EXISTS (SELECT ...)
    if (/^EXISTS\s*\(\s*SELECT\b/i.test(expr)) {
      const sub = expr.replace(/^EXISTS\s*\(/i, "").slice(0, -1);
      return {
        type: "ExistsExpression",
        isNot: false,
        subquery: SqlParser.parseSelect(sub),
      };
    }
    if (/^NOT\s+EXISTS\s*\(\s*SELECT\b/i.test(expr)) {
      const sub = expr.replace(/^NOT\s+EXISTS\s*\(/i, "").slice(0, -1);
      return {
        type: "ExistsExpression",
        isNot: true,
        subquery: SqlParser.parseSelect(sub),
      };
    }

    // 4. IN expression: column IN (val1, val2) or column IN (SELECT ...)
    const inMatch = expr.match(/^(.+?)\s+(NOT\s+IN|IN)\s*\(([\s\S]+)\)$/i);
    if (inMatch) {
      const left = SqlParser.parseExpression(inMatch[1].trim());
      const isNot = inMatch[2].toUpperCase().includes("NOT");
      const inBody = inMatch[3].trim();
      if (/^SELECT\b/i.test(inBody)) {
        return {
          type: "InExpression",
          left,
          isNot,
          subquery: SqlParser.parseSelect(inBody),
        };
      } else {
        const values = SqlParser.splitTopLevel(inBody, ",").map((v) => SqlParser.parseExpression(v.trim()));
        return {
          type: "InExpression",
          left,
          isNot,
          values,
        };
      }
    }

    // 5. LIKE / ILIKE expression: col LIKE '%abc'
    const likeMatch = expr.match(/^(.+?)\s+(NOT\s+LIKE|NOT\s+ILIKE|LIKE|ILIKE)\s+'([^']*)'$/i);
    if (likeMatch) {
      const left = SqlParser.parseExpression(likeMatch[1].trim());
      const operator = likeMatch[2].toUpperCase() as any;
      const pattern = likeMatch[3];
      const isLeadingWildcard = pattern.startsWith("%") || pattern.startsWith("_");
      return {
        type: "LikeExpression",
        left,
        operator,
        pattern,
        isLeadingWildcard,
      };
    }

    // 6. Binary logical operators: OR, AND
    for (const op of ["OR", "AND"]) {
      const parts = SqlParser.splitTopLevelByOperator(expr, op);
      if (parts.length > 1) {
        let root: ExpressionNode = SqlParser.parseExpression(parts[0].trim());
        for (let i = 1; i < parts.length; i++) {
          root = {
            type: "BinaryExpression",
            operator: op as any,
            left: root,
            right: SqlParser.parseExpression(parts[i].trim()),
          };
        }
        return root;
      }
    }

    // 7. Comparison operators: =, !=, <>, <=, >=, <, >, IS NOT, IS
    const compRegex = /\s*(=|!=|<>|<=|>=|<|>|\bIS\s+NOT\b|\bIS\b)\s*/i;
    const compMatch = expr.match(compRegex);
    if (compMatch && compMatch.index !== undefined && compMatch.index > 0) {
      const operator = compMatch[1].toUpperCase().replace(/\s+/g, " ") as any;
      const leftStr = expr.substring(0, compMatch.index).trim();
      const rightStr = expr.substring(compMatch.index + compMatch[0].length).trim();
      if (leftStr && rightStr) {
        return {
          type: "BinaryExpression",
          operator,
          left: SqlParser.parseExpression(leftStr),
          right: SqlParser.parseExpression(rightStr),
        };
      }
    }

    // 8. Aggregates: COUNT(DISTINCT ...), SUM(...), AVG(...), MIN(...), MAX(...)
    const aggMatch = expr.match(/^(COUNT|SUM|AVG|MIN|MAX)\s*\(\s*(DISTINCT\s+)?([\s\S]+?)\s*\)$/i);
    if (aggMatch) {
      const name = aggMatch[1].toUpperCase() as any;
      const isDistinct = Boolean(aggMatch[2]);
      const argStr = aggMatch[3].trim();
      return {
        type: "AggregateExpression",
        name,
        isDistinct,
        argument: SqlParser.parseExpression(argStr),
      };
    }

    // 9. Functions: LOWER(col), UPPER(col), DATE(col), DATE_TRUNC('day', col)
    const funcMatch = expr.match(/^([a-zA-Z_]\w*)\s*\(([\s\S]*)\)$/);
    if (funcMatch) {
      const name = funcMatch[1].toUpperCase();
      const argsStr = funcMatch[2].trim();
      const args = argsStr ? SqlParser.splitTopLevel(argsStr, ",").map((a) => SqlParser.parseExpression(a.trim())) : [];
      return {
        type: "FunctionExpression",
        name,
        arguments: args,
      };
    }

    // 10. Literal numbers, strings, booleans, null
    if (/^'[\s\S]*'$/.test(expr)) {
      return {
        type: "LiteralValue",
        value: expr.slice(1, -1).replace(/''/g, "'"),
        raw: expr,
        dataType: "string",
      };
    }
    if (/^-?\d+(?:\.\d+)?$/.test(expr)) {
      return {
        type: "LiteralValue",
        value: Number(expr),
        raw: expr,
        dataType: "number",
      };
    }
    if (/^(TRUE|FALSE)$/i.test(expr)) {
      return {
        type: "LiteralValue",
        value: expr.toUpperCase() === "TRUE",
        raw: expr,
        dataType: "boolean",
      };
    }
    if (/^NULL$/i.test(expr)) {
      return {
        type: "LiteralValue",
        value: null,
        raw: expr,
        dataType: "null",
      };
    }

    // 11. Column reference: strictly validated identifiers and qualified identifiers
    const colRef = SqlParser.parseColumnReference(expr);
    if (colRef) {
      return colRef;
    }

    // 12. Fallback for unclassified literal or expression
    return {
      type: "LiteralValue",
      value: expr,
      raw: expr,
      dataType: "string",
    };
  }

  private static parseColumnReference(expr: string): ColumnReferenceNode | null {
    const trimmed = expr.trim();
    if (!trimmed || trimmed.includes("(") || trimmed.includes(")") || trimmed.includes(";")) {
      return null;
    }

    // 1. Check for column alias: expr AS alias or expr alias
    let baseExpr = trimmed;
    let alias: string | undefined;

    const colAliasMatch = trimmed.match(/^(.+?)\s+(?:AS\s+)?([a-zA-Z_]\w*)$/i);
    if (colAliasMatch && !trimmed.startsWith("'") && !trimmed.startsWith('"') && colAliasMatch[1].includes(".")) {
      baseExpr = colAliasMatch[1].trim();
      alias = colAliasMatch[2].trim();
    }

    // 2. Split qualified identifier by top-level dot (.)
    const parts = SqlParser.splitTopLevel(baseExpr, ".");
    if (parts.length === 0 || parts.length > 3) {
      return null;
    }

    const cleanParts: string[] = [];
    for (const part of parts) {
      const p = part.trim();
      if (!p) return null;

      // Double-quoted identifier: "rawSql" or "orders"
      if (/^"[^"]+"$/.test(p)) {
        const unquoted = p.slice(1, -1);
        if (!unquoted) return null;
        cleanParts.push(unquoted);
      }
      // Backtick identifier: `rawSql`
      else if (/^`[^`]+`$/.test(p)) {
        const unquoted = p.slice(1, -1);
        if (!unquoted) return null;
        cleanParts.push(unquoted);
      }
      // Bracket identifier: [rawSql]
      else if (/^\[[^\]]+\]$/.test(p)) {
        const unquoted = p.slice(1, -1);
        if (!unquoted) return null;
        cleanParts.push(unquoted);
      }
      // Standard unquoted identifier
      else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) {
        cleanParts.push(p);
      } else {
        // Not a valid identifier part (contains spaces, operators, keywords, etc.)
        return null;
      }
    }

    if (cleanParts.length === 1) {
      return {
        type: "ColumnReference",
        column: cleanParts[0],
        alias,
      };
    } else if (cleanParts.length === 2) {
      return {
        type: "ColumnReference",
        table: cleanParts[0],
        column: cleanParts[1],
        alias,
      };
    } else if (cleanParts.length === 3) {
      return {
        type: "ColumnReference",
        schema: cleanParts[0],
        table: cleanParts[1],
        column: cleanParts[2],
        alias,
      };
    }

    return null;
  }

  private static extractClause(sql: string, startKeyword: string, nextKeywords: string[]): string | undefined {
    const startRegex = new RegExp(`\\b${startKeyword}\\b`, "i");
    const startMatch = sql.match(startRegex);
    if (!startMatch || startMatch.index === undefined) return undefined;

    const startIdx = startMatch.index + startMatch[0].length;
    const remaining = sql.substring(startIdx);

    // Find the closest next keyword at top level (not inside parentheses)
    let minNextIdx = remaining.length;
    for (const kw of nextKeywords) {
      const kwRegex = new RegExp(`\\b${kw}\\b`, "gi");
      let m;
      while ((m = kwRegex.exec(remaining)) !== null) {
        if (SqlParser.isTopLevel(remaining, m.index)) {
          if (m.index < minNextIdx) {
            minNextIdx = m.index;
          }
          break;
        }
      }
    }

    return remaining.substring(0, minNextIdx).trim();
  }

  private static isTopLevel(str: string, index: number): boolean {
    let depth = 0;
    for (let i = 0; i < index; i++) {
      if (str[i] === "(") depth++;
      else if (str[i] === ")") depth--;
    }
    return depth === 0;
  }

  public static splitTopLevel(str: string, delimiter: string): string[] {
    const results: string[] = [];
    let current = "";
    let parenDepth = 0;
    let inQuotes = false;
    let quoteChar = "";

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if ((char === "'" || char === '"' || char === "`") && (i === 0 || str[i - 1] !== "\\")) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        }
      } else if (!inQuotes) {
        if (char === "(") parenDepth++;
        else if (char === ")") parenDepth--;
      }

      if (!inQuotes && parenDepth === 0 && str.substring(i, i + delimiter.length) === delimiter) {
        results.push(current.trim());
        current = "";
        i += delimiter.length - 1;
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      results.push(current.trim());
    }

    return results;
  }

  public static splitTopLevelByOperator(str: string, operator: string): string[] {
    const results: string[] = [];
    const opRegex = new RegExp(`\\b${operator}\\b`, "gi");
    let lastIndex = 0;
    let parenDepth = 0;
    let inQuotes = false;
    let quoteChar = "";

    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if ((char === "'" || char === '"' || char === "`") && (i === 0 || str[i - 1] !== "\\")) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuotes = false;
        }
      } else if (!inQuotes) {
        if (char === "(") parenDepth++;
        else if (char === ")") parenDepth--;
      }

      if (!inQuotes && parenDepth === 0) {
        const sub = str.substring(i);
        const match = sub.match(new RegExp(`^\\s+${operator}\\s+`, "i"));
        if (match) {
          results.push(str.substring(lastIndex, i).trim());
          i += match[0].length - 1;
          lastIndex = i + 1;
        }
      }
    }

    if (lastIndex < str.length) {
      results.push(str.substring(lastIndex).trim());
    }

    return results.length > 1 ? results : [str];
  }
}
