export type TokenType =
  | "KEYWORD"
  | "IDENTIFIER"
  | "STRING"
  | "NUMBER"
  | "OPERATOR"
  | "PUNCTUATION"
  | "COMMENT"
  | "WHITESPACE"
  | "UNKNOWN";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

const PLPGSQL_KEYWORDS = new Set([
  "CREATE", "OR", "REPLACE", "PROCEDURE", "FUNCTION", "LANGUAGE", "PLPGSQL",
  "RETURNS", "TABLE", "AS", "DECLARE", "BEGIN", "END", "IF", "THEN", "ELSIF",
  "ELSE", "LOOP", "WHILE", "FOR", "IN", "REVERSE", "BY", "EXIT", "CONTINUE",
  "WHEN", "RETURN", "RAISE", "NOTICE", "WARNING", "EXCEPTION", "DEBUG", "INFO",
  "EXECUTE", "USING", "INTO", "STRICT", "OPEN", "FETCH", "CLOSE", "PERFORM",
  "CALL", "COMMIT", "ROLLBACK", "SELECT", "INSERT", "UPDATE", "DELETE", "FROM",
  "WHERE", "SET", "VALUES", "JOIN", "ON", "AND", "NOT", "NULL", "IS", "TRUE",
  "FALSE", "CURSOR", "CONSTANT", "DEFAULT", "ALIAS", "RECORD", "ROW_COUNT",
  "GET", "DIAGNOSTICS", "FOUND", "NOTFOUND", "OTHERS"
]);

export class PlPgSqlLexer {
  public static tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let pos = 0;
    let line = 1;
    let col = 1;
    const len = source.length;

    while (pos < len) {
      const char = source[pos];
      const startLine = line;
      const startCol = col;

      // Handle Line Comment (-- ...)
      if (char === "-" && source[pos + 1] === "-") {
        let val = "";
        while (pos < len && source[pos] !== "\n") {
          val += source[pos];
          pos++;
          col++;
        }
        tokens.push({ type: "COMMENT", value: val, line: startLine, column: startCol });
        continue;
      }

      // Handle Block Comment (/* ... */)
      if (char === "/" && source[pos + 1] === "*") {
        let val = "/*";
        pos += 2;
        col += 2;
        while (pos < len && !(source[pos] === "*" && source[pos + 1] === "/")) {
          if (source[pos] === "\n") {
            line++;
            col = 1;
          } else {
            col++;
          }
          val += source[pos];
          pos++;
        }
        if (pos < len) {
          val += "*/";
          pos += 2;
          col += 2;
        }
        tokens.push({ type: "COMMENT", value: val, line: startLine, column: startCol });
        continue;
      }

      // Handle Dollar-quote Delimiter ($$...$$ or $tag$...$tag$)
      if (char === "$") {
        const dollarMatch = source.slice(pos).match(/^(\$[a-zA-Z0-9_]*\$)/);
        if (dollarMatch) {
          const tag = dollarMatch[1];
          tokens.push({ type: "PUNCTUATION", value: tag, line: startLine, column: startCol });
          pos += tag.length;
          col += tag.length;
          continue;
        }
      }

      // Handle Standard Single-quoted String ('...')
      if (char === "'") {
        let val = "'";
        pos++;
        col++;
        while (pos < len) {
          if (source[pos] === "'") {
            val += "'";
            pos++;
            col++;
            // Check for escaped quote ''
            if (pos < len && source[pos] === "'") {
              val += "'";
              pos++;
              col++;
            } else {
              break;
            }
          } else {
            if (source[pos] === "\n") {
              line++;
              col = 1;
            } else {
              col++;
            }
            val += source[pos];
            pos++;
          }
        }
        tokens.push({ type: "STRING", value: val, line: startLine, column: startCol });
        continue;
      }

      // Handle Double-quoted Identifier ("...")
      if (char === '"') {
        let val = '"';
        pos++;
        col++;
        while (pos < len && source[pos] !== '"') {
          if (source[pos] === "\n") {
            line++;
            col = 1;
          } else {
            col++;
          }
          val += source[pos];
          pos++;
        }
        if (pos < len && source[pos] === '"') {
          val += '"';
          pos++;
          col++;
        }
        tokens.push({ type: "IDENTIFIER", value: val, line: startLine, column: startCol });
        continue;
      }

      // Handle Whitespace
      if (/\s/.test(char)) {
        if (char === "\n") {
          line++;
          col = 1;
        } else {
          col++;
        }
        pos++;
        continue;
      }

      // Handle Multi-char Operators (:=, <=, >=, <>, !=, ||, ..)
      const twoChar = source.slice(pos, pos + 2);
      if (twoChar === ":=" || twoChar === "<=" || twoChar === ">=" || twoChar === "<>" || twoChar === "!=" || twoChar === "||" || twoChar === "..") {
        tokens.push({ type: "OPERATOR", value: twoChar, line: startLine, column: startCol });
        pos += 2;
        col += 2;
        continue;
      }

      // Handle Numbers
      if (/[0-9]/.test(char)) {
        let val = "";
        while (pos < len && /[0-9.]/.test(source[pos])) {
          val += source[pos];
          pos++;
          col++;
        }
        tokens.push({ type: "NUMBER", value: val, line: startLine, column: startCol });
        continue;
      }

      // Handle Word / Identifier / Keyword
      if (/[a-zA-Z_]/.test(char)) {
        let val = "";
        while (pos < len && /[a-zA-Z0-9_$]/.test(source[pos])) {
          val += source[pos];
          pos++;
          col++;
        }
        const upper = val.toUpperCase();
        const type: TokenType = PLPGSQL_KEYWORDS.has(upper) ? "KEYWORD" : "IDENTIFIER";
        tokens.push({ type, value: val, line: startLine, column: startCol });
        continue;
      }

      // Handle Punctuation / Single Operators
      if (";,()[]{}.:+-*/%<>=!".includes(char)) {
        const type: TokenType = ";,()[]{}".includes(char) ? "PUNCTUATION" : "OPERATOR";
        tokens.push({ type, value: char, line: startLine, column: startCol });
        pos++;
        col++;
        continue;
      }

      // Unknown character fallback
      tokens.push({ type: "UNKNOWN", value: char, line: startLine, column: startCol });
      pos++;
      col++;
    }

    return tokens;
  }
}
