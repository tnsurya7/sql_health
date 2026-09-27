export class QueryNormalizer {
  /**
   * Normalizes a SQL query string by parameterizing literals, collapsing whitespace,
   * standardizing casing of core keywords, and stripping redundant comments/delimiters.
   */
  public static normalize(sql: string): string {
    if (!sql) return "";

    let normalized = sql.trim();

    // 1. Remove single line comments (-- ...) and block comments (/* ... */)
    normalized = normalized.replace(/--.*$/gm, " ");
    normalized = normalized.replace(/\/\*[\s\S]*?\*\//g, " ");

    // 2. Replace string literals '...' with ?
    normalized = normalized.replace(/'(?:''|[^'])*'/g, "?");

    // 3. Replace numeric literals with ? (excluding numbers inside identifiers or after LIMIT/OFFSET if desired, but parameterizing where clauses)
    // Matches numbers preceded by operator or keyword
    normalized = normalized.replace(/([=<>!+\-*/%,(]\s*)-?\d+(?:\.\d+)?/g, "$1?");
    normalized = normalized.replace(/\bIN\s*\(\s*(?:\?|\d+)(?:\s*,\s*(?:\?|\d+))*\s*\)/gi, "IN (?)");
    normalized = normalized.replace(/\bVALUES\s*\([^)]+\)/gi, "VALUES (?)");

    // 4. Standardize keywords to UPPERCASE
    const keywords = [
      "SELECT", "DISTINCT", "FROM", "WHERE", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN",
      "FULL JOIN", "CROSS JOIN", "ON", "USING", "GROUP BY", "HAVING", "ORDER BY", "ASC", "DESC",
      "LIMIT", "OFFSET", "UNION", "UNION ALL", "INSERT INTO", "VALUES", "UPDATE", "SET",
      "DELETE FROM", "TRUNCATE", "DROP TABLE", "DROP VIEW", "DROP INDEX", "WITH", "RECURSIVE",
      "AND", "OR", "NOT", "IN", "LIKE", "ILIKE", "IS", "NULL", "IS NOT", "BETWEEN", "EXISTS",
      "CASE", "WHEN", "THEN", "ELSE", "END", "AS"
    ];

    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, "gi");
      normalized = normalized.replace(regex, kw);
    }

    // 5. Collapse multiple spaces, tabs, and newlines into single spaces
    normalized = normalized.replace(/\s+/g, " ");

    // 6. Clean up spacing around commas and operators
    normalized = normalized.replace(/\s*,\s*/g, ", ");
    normalized = normalized.replace(/\s*=\s*/g, " = ");
    normalized = normalized.replace(/\s*\(\s*/g, "(");
    normalized = normalized.replace(/\s*\)\s*/g, ")");
    normalized = normalized.replace(/;\s*$/, "");

    return normalized.trim();
  }
}
