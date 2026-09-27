export type SqlDialect = "postgresql" | "mysql" | "oracle" | "sqlserver" | "generic";

export class DialectDetector {
  /**
   * Detects the SQL dialect based on distinctive syntax keywords, quoting, and functions.
   */
  public static detect(sql: string, defaultDialect: SqlDialect = "postgresql"): SqlDialect {
    const text = sql.trim();

    // Oracle specific keywords/idioms
    if (/\b(ROWNUM|CONNECT BY|START WITH|DUAL|NVL|NVL2|DECODE|SYSDATE|MINUS)\b/i.test(text)) {
      return "oracle";
    }

    // SQL Server (T-SQL) specific keywords/idioms
    if (/\b(TOP\s+\d+|@@IDENTITY|@@ROWCOUNT|ISNULL|GETDATE|CROSS APPLY|OUTER APPLY|DATENAME|DATEPART)\b/i.test(text) || /\[\w+\]/.test(text)) {
      return "sqlserver";
    }

    // MySQL specific keywords/idioms
    if (/\b(IFNULL|UNIX_TIMESTAMP|NOW\(\)|STRAIGHT_JOIN|LIMIT\s+\d+\s*,\s*\d+|`\w+`|ENGINE\s*=|AUTO_INCREMENT)\b/i.test(text)) {
      return "mysql";
    }

    // PostgreSQL specific keywords/idioms
    if (/::\s*\w+|ILIKE|SIMILAR TO|\bGENERATE_SERIES\b|\bRETURNING\b|\bON CONFLICT\b|\bVACUUM\b|\bDATE_TRUNC\b/i.test(text)) {
      return "postgresql";
    }

    return defaultDialect;
  }
}
