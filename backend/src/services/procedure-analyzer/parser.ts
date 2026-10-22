import { PlPgSqlLexer, Token } from "./lexer";
import {
  DeclaredCursor,
  DeclaredVariable,
  ParameterInfo,
  ProcedureParsedModel,
  ProcedureStatement,
} from "./types";

export class PlPgSqlParser {
  public static parse(source: string): ProcedureParsedModel {
    const tokens = PlPgSqlLexer.tokenize(source);
    const nonCommentTokens = tokens.filter((t) => t.type !== "COMMENT");

    let name = "unnamed_procedure";
    let schema = "public";
    let isFunction = false;
    let language = "plpgsql";
    const parameters: ParameterInfo[] = [];
    let returnType: string | undefined;

    // 1. Parse Header
    for (let i = 0; i < nonCommentTokens.length; i++) {
      const tok = nonCommentTokens[i];
      const upper = tok.value.toUpperCase();

      if (upper === "PROCEDURE" || upper === "FUNCTION") {
        isFunction = upper === "FUNCTION";
        if (i + 1 < nonCommentTokens.length) {
          const next = nonCommentTokens[i + 1];
          if (next.value.includes(".")) {
            const parts = next.value.split(".");
            schema = parts[0];
            name = parts[1];
          } else {
            name = next.value;
          }
        }
      }

      if (upper === "LANGUAGE" && i + 1 < nonCommentTokens.length) {
        language = nonCommentTokens[i + 1].value.toLowerCase().replace(/['"]/g, "");
      }

      if (upper === "RETURNS" && i + 1 < nonCommentTokens.length) {
        let ret = "";
        let j = i + 1;
        while (j < nonCommentTokens.length && nonCommentTokens[j].value.toUpperCase() !== "AS" && nonCommentTokens[j].value.toUpperCase() !== "LANGUAGE") {
          ret += (ret ? " " : "") + nonCommentTokens[j].value;
          j++;
        }
        returnType = ret;
      }
    }

    // Extract parameters from between first '(' and ')' after procedure name
    const openParenIdx = nonCommentTokens.findIndex((t) => t.value === "(");
    if (openParenIdx !== -1) {
      let closeParenIdx = -1;
      let depth = 0;
      for (let i = openParenIdx; i < nonCommentTokens.length; i++) {
        if (nonCommentTokens[i].value === "(") depth++;
        else if (nonCommentTokens[i].value === ")") {
          depth--;
          if (depth === 0) {
            closeParenIdx = i;
            break;
          }
        }
      }

      if (closeParenIdx > openParenIdx + 1) {
        const paramTokens = nonCommentTokens.slice(openParenIdx + 1, closeParenIdx);
        const paramGroups: Token[][] = [];
        let curGroup: Token[] = [];
        for (const pt of paramTokens) {
          if (pt.value === ",") {
            if (curGroup.length > 0) paramGroups.push(curGroup);
            curGroup = [];
          } else {
            curGroup.push(pt);
          }
        }
        if (curGroup.length > 0) paramGroups.push(curGroup);

        for (const grp of paramGroups) {
          if (grp.length === 0) continue;
          let mode: ParameterInfo["mode"] = "IN";
          let pIdx = 0;
          const firstVal = grp[0].value.toUpperCase();
          if (firstVal === "IN" || firstVal === "OUT" || firstVal === "INOUT" || firstVal === "VARIADIC") {
            mode = firstVal as any;
            pIdx = 1;
          }
          const pName = grp[pIdx]?.value || `param_${parameters.length + 1}`;
          const pType = grp.slice(pIdx + 1).map((t) => t.value).join(" ") || "unknown";
          parameters.push({ name: pName, mode, dataType: pType });
        }
      }
    }

    // 2. Locate DECLARE and BEGIN blocks
    let declareIdx = -1;
    let beginIdx = -1;
    let exceptionIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < nonCommentTokens.length; i++) {
      const upper = nonCommentTokens[i].value.toUpperCase();
      if (upper === "DECLARE" && declareIdx === -1) {
        declareIdx = i;
      } else if (upper === "BEGIN" && beginIdx === -1) {
        beginIdx = i;
      } else if (upper === "EXCEPTION" && beginIdx !== -1 && exceptionIdx === -1) {
        const prevUpper = i > 0 ? nonCommentTokens[i - 1].value.toUpperCase() : "";
        if (prevUpper !== "RAISE") {
          exceptionIdx = i;
        }
      }
    }

    // Find final matching END
    for (let i = nonCommentTokens.length - 1; i >= 0; i--) {
      if (nonCommentTokens[i].value.toUpperCase() === "END") {
        endIdx = i;
        break;
      }
    }

    // 3. Parse DECLARE Block
    const variables: DeclaredVariable[] = [];
    const cursors: DeclaredCursor[] = [];

    if (declareIdx !== -1 && beginIdx > declareIdx) {
      const declTokens = nonCommentTokens.slice(declareIdx + 1, beginIdx);
      let curDecl: Token[] = [];

      for (const tok of declTokens) {
        if (tok.value === ";") {
          if (curDecl.length >= 2) {
            const vName = curDecl[0].value;
            const isCursor = curDecl.some((t) => t.value.toUpperCase() === "CURSOR");

            if (isCursor) {
              const forIdx = curDecl.findIndex((t) => t.value.toUpperCase() === "FOR");
              const query = forIdx !== -1 ? curDecl.slice(forIdx + 1).map((t) => t.value).join(" ") : "";
              cursors.push({
                name: vName,
                query,
                position: { line: curDecl[0].line, column: curDecl[0].column },
              });
            } else {
              const isConstant = curDecl[1]?.value.toUpperCase() === "CONSTANT";
              const typeStart = isConstant ? 2 : 1;
              const assignIdx = curDecl.findIndex((t) => t.value === ":=" || t.value.toUpperCase() === "DEFAULT");
              const typeTokens = assignIdx !== -1 ? curDecl.slice(typeStart, assignIdx) : curDecl.slice(typeStart);
              const dataType = typeTokens.map((t) => t.value).join(" ") || "RECORD";
              const defaultVal = assignIdx !== -1 ? curDecl.slice(assignIdx + 1).map((t) => t.value).join(" ") : undefined;

              variables.push({
                name: vName,
                dataType,
                isConstant,
                defaultValue: defaultVal,
                position: { line: curDecl[0].line, column: curDecl[0].column },
              });
            }
          }
          curDecl = [];
        } else {
          curDecl.push(tok);
        }
      }
    }

    // 4. Parse Body Statements
    const bodyStartIdx = beginIdx !== -1 ? beginIdx + 1 : 0;
    const bodyEndIdx = exceptionIdx !== -1 ? exceptionIdx : endIdx !== -1 ? endIdx : nonCommentTokens.length;
    const bodyTokens = nonCommentTokens.slice(bodyStartIdx, bodyEndIdx);

    const bodyStatements: ProcedureStatement[] = [];
    let curStmtTokens: Token[] = [];
    let cyclomaticComplexity = 1;
    let maxNestingDepth = 0;
    let currentDepth = 0;

    for (let i = 0; i < bodyTokens.length; i++) {
      const tok = bodyTokens[i];
      const upper = tok.value.toUpperCase();

      if (upper === "IF" || upper === "ELSIF" || upper === "WHILE" || upper === "FOR" || upper === "WHEN") {
        cyclomaticComplexity++;
      }
      if (upper === "IF" || upper === "LOOP" || upper === "BEGIN") {
        currentDepth++;
        if (currentDepth > maxNestingDepth) maxNestingDepth = currentDepth;
      } else if (upper === "END") {
        currentDepth = Math.max(0, currentDepth - 1);
      }

      curStmtTokens.push(tok);

      if (tok.value === ";" || i === bodyTokens.length - 1) {
        if (curStmtTokens.length > 0) {
          const text = curStmtTokens.map((t) => t.value).join(" ");
          const firstTok = curStmtTokens[0];
          const firstUpper = firstTok.value.toUpperCase();

          let targetVar: string | undefined;
          const assignIdx = curStmtTokens.findIndex((t) => t.value === ":=");
          if (assignIdx > 0) {
            targetVar = curStmtTokens[assignIdx - 1].value;
          } else if (firstUpper === "SELECT") {
            const intoIdx = curStmtTokens.findIndex((t) => t.value.toUpperCase() === "INTO");
            if (intoIdx !== -1 && intoIdx + 1 < curStmtTokens.length) {
              targetVar = curStmtTokens[intoIdx + 1].value;
            }
          }

          bodyStatements.push({
            type: firstUpper,
            text,
            position: { line: firstTok.line, column: firstTok.column },
            targetVariable: targetVar,
            isDynamicSql: text.toUpperCase().includes("EXECUTE"),
          });
          curStmtTokens = [];
        }
      }
    }

    // 5. Parse Exception Clauses
    const exceptionClauses: string[] = [];
    const hasExceptionHandler = exceptionIdx !== -1;
    if (hasExceptionHandler && endIdx > exceptionIdx) {
      const excTokens = nonCommentTokens.slice(exceptionIdx + 1, endIdx);
      let curClause: Token[] = [];
      for (const tok of excTokens) {
        if (tok.value.toUpperCase() === "WHEN" && curClause.length > 0) {
          exceptionClauses.push(curClause.map((t) => t.value).join(" "));
          curClause = [tok];
        } else {
          curClause.push(tok);
        }
      }
      if (curClause.length > 0) {
        exceptionClauses.push(curClause.map((t) => t.value).join(" "));
      }
    }

    // Raw body extraction
    let rawBody = "";
    if (beginIdx !== -1 && endIdx > beginIdx) {
      const startLine = nonCommentTokens[beginIdx].line;
      const endLine = nonCommentTokens[endIdx].line;
      const lines = source.split("\n");
      rawBody = lines.slice(startLine - 1, endLine).join("\n");
    } else {
      rawBody = source;
    }

    return {
      name,
      schema,
      language,
      isFunction,
      parameters,
      returnType,
      variables,
      cursors,
      bodyStatements,
      rawBody,
      rawSource: source,
      hasExceptionHandler,
      exceptionClauses,
      cyclomaticComplexity,
      maxNestingDepth,
    };
  }
}
