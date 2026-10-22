import { ProcedureFinding, ProcedureParsedModel, ProcedureRule, SourcePosition } from "../types";
import { RuleRegistry } from "./registry";
import { PlPgSqlLexer } from "../lexer";

// Helper: Find line number and snippet in source
function findPositionAndSnippet(source: string, pattern: RegExp | string): { position: SourcePosition; snippet: string } {
  const lines = source.split("\n");
  if (typeof pattern === "string") {
    for (let i = 0; i < lines.length; i++) {
      const idx = lines[i].indexOf(pattern);
      if (idx !== -1) {
        return {
          position: { line: i + 1, column: idx + 1 },
          snippet: lines[i].trim(),
        };
      }
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(pattern);
      if (match && match.index !== undefined) {
        return {
          position: { line: i + 1, column: match.index + 1 },
          snippet: lines[i].trim(),
        };
      }
    }
  }
  return { position: { line: 1, column: 1 }, snippet: "" };
}

// SP001: Unused local variable
export const SP001_UnusedVariable: ProcedureRule = {
  id: "SP001",
  title: "Unused Local Variable",
  category: "Maintainability",
  defaultSeverity: "LOW",
  description: "Variables declared in DECLARE block should be utilized in the procedure body.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const bodyText = model.bodyStatements.map((s) => s.text).join(" ");
    const excText = model.exceptionClauses.join(" ");
    const fullExecutionScope = `${bodyText} ${excText}`;
    const cleanedScope = fullExecutionScope.replace(/'(?:[^']|'')*'/g, " ");

    for (const v of model.variables) {
      // Look for variable name as a standalone identifier token in execution scope (excluding string literals)
      const regex = new RegExp(`\\b${v.name}\\b`, "i");
      if (!regex.test(cleanedScope)) {
        findings.push({
          ruleId: "SP001",
          title: `Unused variable '${v.name}'`,
          category: "Maintainability",
          severity: "LOW",
          confidence: 0.95,
          procedureName: model.name,
          signature: `${model.name}(${model.parameters.map((p) => p.dataType).join(", ")})`,
          position: v.position,
          snippet: `${v.name} ${v.dataType};`,
          explanation: `The local variable '${v.name}' is declared in the DECLARE block but is never referenced or used in the body.`,
          whyItMatters: "Unused variables clutter code, obscure intended logic, and consume stack allocation memory.",
          recommendedFix: `Remove the declaration of '${v.name}' or implement its intended usage.`,
          safeExample: "-- Removed unused declaration\n-- DECLARE\n--     v_old_var INT; -- REMOVED",
        });
      }
    }
    return findings;
  },
};

// SP002: Declared variable assigned but never read (dead store)
export const SP002_DeadStore: ProcedureRule = {
  id: "SP002",
  title: "Variable Assigned But Never Read (Dead Store)",
  category: "Bug Risk",
  defaultSeverity: "MEDIUM",
  description: "Variables should not be assigned values that are never subsequently evaluated.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];

    for (const v of model.variables) {
      const vNameLower = v.name.toLowerCase();
      // Find all statements where variable is modified vs read
      const assignmentIndices: number[] = [];
      const readIndices: number[] = [];

      for (let i = 0; i < model.bodyStatements.length; i++) {
        const stmt = model.bodyStatements[i];
        const isAssigned =
          stmt.targetVariable?.toLowerCase() === vNameLower ||
          new RegExp(`\\b${v.name}\\s*:=`, "i").test(stmt.text) ||
          new RegExp(`INTO\\s+${v.name}\\b`, "i").test(stmt.text);

        if (isAssigned) {
          assignmentIndices.push(i);
        }

        // Check if read (present in statement text without being solely the left-hand target)
        const regex = new RegExp(`\\b${v.name}\\b`, "i");
        if (regex.test(stmt.text)) {
          // If assigned via :=, verify if it appears on the right side as well
          if (stmt.targetVariable?.toLowerCase() === vNameLower) {
            const rightSide = stmt.text.split(":=")[1] || "";
            if (regex.test(rightSide)) {
              readIndices.push(i);
            }
          } else {
            readIndices.push(i);
          }
        }
      }

      // If variable was assigned at least once, check if any read occurs AFTER the last assignment
      if (assignmentIndices.length > 0) {
        const lastAssign = assignmentIndices[assignmentIndices.length - 1];
        const hasSubsequentRead = readIndices.some((rIdx) => rIdx > lastAssign);
        // Also check if read in exception handler
        const excRead = new RegExp(`\\b${v.name}\\b`, "i").test(model.exceptionClauses.join(" "));

        if (!hasSubsequentRead && !excRead && readIndices.length === 0) {
          const assignStmt = model.bodyStatements[lastAssign];
          findings.push({
            ruleId: "SP002",
            title: `Variable '${v.name}' is assigned but its value is never read`,
            category: "Bug Risk",
            severity: "MEDIUM",
            confidence: 0.9,
            procedureName: model.name,
            position: assignStmt.position,
            snippet: assignStmt.text,
            explanation: `Variable '${v.name}' receives a value assignment, but this value is never subsequently read or returned.`,
            whyItMatters: "Dead stores indicate redundant computation, unfinished business logic, or possible copy-paste errors.",
            recommendedFix: `Review if the assignment is necessary, or whether '${v.name}' should be returned or passed to another statement.`,
            safeExample: "-- Either use the computed value:\nRETURN v_result;\n-- Or eliminate unnecessary assignment:\n-- v_temp := calculate(); -- REMOVE",
          });
        }
      }
    }
    return findings;
  },
};

// SP003: Unreachable statements after unconditional RETURN or RAISE
export const SP003_UnreachableCode: ProcedureRule = {
  id: "SP003",
  title: "Unreachable Code After Unconditional Jump",
  category: "Bug Risk",
  defaultSeverity: "HIGH",
  description: "Statements following an unconditional RETURN or RAISE EXCEPTION cannot be executed.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const stmts = model.bodyStatements;

    for (let i = 0; i < stmts.length - 1; i++) {
      const cur = stmts[i];
      const next = stmts[i + 1];
      const isUnconditionalReturn = /^\s*RETURN\b/i.test(cur.text) && !/^\s*RETURN\s+QUERY\b/i.test(cur.text);
      const isUnconditionalRaise = /^\s*RAISE\s+EXCEPTION\b/i.test(cur.text);

      if ((isUnconditionalReturn || isUnconditionalRaise) && next && !/^\s*END\b/i.test(next.text) && !/^\s*EXCEPTION\b/i.test(next.text)) {
        findings.push({
          ruleId: "SP003",
          title: "Unreachable statement detected",
          category: "Bug Risk",
          severity: "HIGH",
          confidence: 0.95,
          procedureName: model.name,
          position: next.position,
          snippet: next.text,
          explanation: `The statement '${next.text.substring(0, 50)}...' immediately follows an unconditional ${isUnconditionalReturn ? "RETURN" : "RAISE EXCEPTION"} and can never be reached.`,
          whyItMatters: "Unreachable code can mislead developers and indicates dead logic or structural control flow flaws.",
          recommendedFix: "Remove the unreachable statements or wrap them inside the appropriate conditional branch.",
          safeExample: "IF condition THEN\n    RETURN val;\nEND IF;\n-- Reachable statements continue below",
        });
      }
    }
    return findings;
  },
};

// SP004: Redundant boolean conditions
export const SP004_RedundantBoolean: ProcedureRule = {
  id: "SP004",
  title: "Redundant Boolean Comparison",
  category: "Maintainability",
  defaultSeverity: "LOW",
  description: "Boolean variables and expressions should not be compared directly against TRUE or FALSE.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const pattern = /\b([a-zA-Z0-9_.]+)\s*(?:=|<>|!=)\s*(?:TRUE|FALSE)\b/i;

    for (const stmt of model.bodyStatements) {
      const match = stmt.text.match(pattern);
      if (match) {
        findings.push({
          ruleId: "SP004",
          title: `Redundant boolean check: '${match[0]}'`,
          category: "Maintainability",
          severity: "LOW",
          confidence: 0.95,
          procedureName: model.name,
          position: stmt.position,
          snippet: stmt.text,
          explanation: `The expression explicitly tests '${match[0]}'. Boolean expressions can be evaluated directly without comparing to boolean literals.`,
          whyItMatters: "Comparing booleans to TRUE/FALSE adds syntactic noise and can conceal three-valued logic (NULL) ambiguities.",
          recommendedFix: `Simplify '${match[0]}' to '${match[1]}' or 'NOT ${match[1]}'.`,
          safeExample: "-- Preferred:\nIF is_active THEN ...\n-- Instead of:\n-- IF is_active = TRUE THEN ...",
        });
      }
    }
    return findings;
  },
};

// SP005: Suspicious tautologies (e.g. 1 = 1)
export const SP005_Tautology: ProcedureRule = {
  id: "SP005",
  title: "Suspicious Tautology / Constant Condition",
  category: "Bug Risk",
  defaultSeverity: "MEDIUM",
  description: "Avoid constant true conditions such as 1 = 1 in stored procedure branching or queries.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const tautologies = [/\b1\s*=\s*1\b/i, /\b0\s*=\s*0\b/i, /\b'a'\s*=\s*'a'\b/i];

    for (const stmt of model.bodyStatements) {
      for (const t of tautologies) {
        if (t.test(stmt.text)) {
          findings.push({
            ruleId: "SP005",
            title: "Suspicious tautological condition detected",
            category: "Bug Risk",
            severity: "MEDIUM",
            confidence: 0.9,
            procedureName: model.name,
            position: stmt.position,
            snippet: stmt.text,
            explanation: `The condition contains a constant true comparison '${stmt.text.match(t)?.[0]}'.`,
            whyItMatters: "Tautologies often indicate leftover debugging conditions, accidental disabled filters, or SQL injection vectors.",
            recommendedFix: "Remove the redundant constant condition or replace with the intentional filter logic.",
            safeExample: "-- Remove WHERE 1 = 1 if no dynamic conditions are attached",
          });
          break;
        }
      }
    }
    return findings;
  },
};

// SP006: Potentially unsafe dynamic SQL
export const SP006_UnsafeDynamicSql: ProcedureRule = {
  id: "SP006",
  title: "Potentially Unsafe Dynamic SQL (SQL Injection Risk)",
  category: "Security",
  defaultSeverity: "CRITICAL",
  description: "Dynamic SQL executed via EXECUTE should use parameters (USING) or quote_ident/quote_literal.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];

    for (const stmt of model.bodyStatements) {
      if (stmt.isDynamicSql || /^\s*EXECUTE\b/i.test(stmt.text)) {
        const hasConcatenation = stmt.text.includes("||") || /\bconcat\(/i.test(stmt.text);
        const hasSanitization =
          /\bquote_ident\(/i.test(stmt.text) ||
          /\bquote_literal\(/i.test(stmt.text) ||
          /\bformat\(/i.test(stmt.text) ||
          /\bUSING\b/i.test(stmt.text);

        if (hasConcatenation && !hasSanitization) {
          findings.push({
            ruleId: "SP006",
            title: "Unsanitized dynamic SQL string concatenation",
            category: "Security",
            severity: "CRITICAL",
            confidence: 0.95,
            procedureName: model.name,
            position: stmt.position,
            snippet: stmt.text,
            explanation: "Dynamic SQL query is constructed using string concatenation without proper identifier escaping or bind parameters.",
            whyItMatters: "Unescaped dynamic SQL allows SQL injection vulnerabilities that could compromise the database.",
            recommendedFix: "Use format() with %I for identifiers and %L for literals, or pass values safely via the USING clause.",
            safeExample: "EXECUTE format('SELECT * FROM %I WHERE status = $1', table_name) USING p_status;",
          });
        }
      }
    }
    return findings;
  },
};

// SP007: Missing or suspicious error handling
export const SP007_SuspiciousErrorHandler: ProcedureRule = {
  id: "SP007",
  title: "Empty or Swallowed Exception Handler",
  category: "Reliability",
  defaultSeverity: "HIGH",
  description: "Exception blocks should not silently swallow errors using NULL statements without logging or re-raising.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];

    for (const exc of model.exceptionClauses) {
      if (/WHEN\s+OTHERS\s+THEN\s+NULL\s*;/i.test(exc) || /WHEN\s+OTHERS\s+THEN\s*;\s*$/i.test(exc)) {
        const pos = findPositionAndSnippet(model.rawSource, /WHEN\s+OTHERS\s+THEN/i);
        findings.push({
          ruleId: "SP007",
          title: "Exception swallowed silently (WHEN OTHERS THEN NULL)",
          category: "Reliability",
          severity: "HIGH",
          confidence: 0.95,
          procedureName: model.name,
          position: pos.position,
          snippet: pos.snippet || exc,
          explanation: "The exception handler catches all exceptions (WHEN OTHERS) and executes NULL;, hiding critical database errors.",
          whyItMatters: "Silent exception swallowing hides bugs, causes silent data corruption, and makes debugging almost impossible.",
          recommendedFix: "Log the error using RAISE WARNING or re-raise the exception with contextual diagnostics.",
          safeExample: "EXCEPTION WHEN OTHERS THEN\n    RAISE WARNING 'Procedure % failed: %', procedure_name, SQLERRM;\n    RAISE;",
        });
      }
    }
    return findings;
  },
};

// SP008: Potentially dangerous transaction or exception behavior
export const SP008_DangerousTransaction: ProcedureRule = {
  id: "SP008",
  title: "Illegal Transaction Control in Function Context",
  category: "Reliability",
  defaultSeverity: "CRITICAL",
  description: "Explicit COMMIT or ROLLBACK statements are not permitted inside PostgreSQL user-defined functions.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];

    if (model.isFunction) {
      for (const stmt of model.bodyStatements) {
        if (/^\s*(COMMIT|ROLLBACK)\b/i.test(stmt.text)) {
          findings.push({
            ruleId: "SP008",
            title: `Illegal ${stmt.text.trim()} in FUNCTION`,
            category: "Reliability",
            severity: "CRITICAL",
            confidence: 1.0,
            procedureName: model.name,
            position: stmt.position,
            snippet: stmt.text,
            explanation: `PostgreSQL does not support explicit transaction management (${stmt.text.trim()}) inside user-defined FUNCTIONs.`,
            whyItMatters: "Executing COMMIT or ROLLBACK inside a function causes a runtime exception ('invalid transaction termination').",
            recommendedFix: "Convert the routine to a PROCEDURE (CREATE PROCEDURE) if explicit transaction control is required.",
            safeExample: "CREATE OR REPLACE PROCEDURE my_proc()\nLANGUAGE plpgsql AS $$\nBEGIN\n    -- COMMIT is valid in PROCEDURE\n    COMMIT;\nEND;\n$$;",
          });
        }
      }
    }
    return findings;
  },
};

// SP009: Unbounded loop
export const SP009_UnboundedLoop: ProcedureRule = {
  id: "SP009",
  title: "Potentially Infinite / Unbounded Loop",
  category: "Bug Risk",
  defaultSeverity: "HIGH",
  description: "LOOP statements must contain an explicit EXIT, EXIT WHEN, or RETURN termination condition.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const raw = model.rawBody;

    // Detect standalone LOOP without FOR or WHILE
    const loopRegex = /\bLOOP\b([\s\S]*?)\bEND\s+LOOP\b/gi;
    let match;
    while ((match = loopRegex.exec(raw)) !== null) {
      const loopBody = match[1];
      const hasExit = /\bEXIT\b/i.test(loopBody);
      const hasReturn = /\bRETURN\b/i.test(loopBody);
      const hasRaise = /\bRAISE\s+EXCEPTION\b/i.test(loopBody);

      if (!hasExit && !hasReturn && !hasRaise) {
        const pos = findPositionAndSnippet(model.rawSource, /\bLOOP\b/i);
        findings.push({
          ruleId: "SP009",
          title: "Unbounded LOOP construct without exit condition",
          category: "Bug Risk",
          severity: "HIGH",
          confidence: 0.9,
          procedureName: model.name,
          position: pos.position,
          snippet: "LOOP ... END LOOP;",
          explanation: "The LOOP block contains no EXIT, EXIT WHEN, or terminating RETURN statement.",
          whyItMatters: "An unbounded loop will spin indefinitely, exhausting connection threads and database CPU resources.",
          recommendedFix: "Add an explicit exit condition such as 'EXIT WHEN NOT FOUND;' or a counter bound.",
          safeExample: "LOOP\n    FETCH cur INTO rec;\n    EXIT WHEN NOT FOUND;\n    -- work\nEND LOOP;",
        });
      }
    }
    return findings;
  },
};

// SP010: Suspicious NULL handling (= NULL instead of IS NULL)
export const SP010_NullComparison: ProcedureRule = {
  id: "SP010",
  title: "Invalid NULL Comparison (= NULL or <> NULL)",
  category: "Bug Risk",
  defaultSeverity: "HIGH",
  description: "Comparing expressions to NULL with = or != always evaluates to unknown/false. Use IS NULL or IS NOT NULL.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const nullCompRegex = /\b([a-zA-Z0-9_.]+)\s*(=|!=|<>)\s*NULL\b/i;

    for (const stmt of model.bodyStatements) {
      const match = stmt.text.match(nullCompRegex);
      if (match) {
        findings.push({
          ruleId: "SP010",
          title: `Incorrect NULL comparison: '${match[0]}'`,
          category: "Bug Risk",
          severity: "HIGH",
          confidence: 1.0,
          procedureName: model.name,
          position: stmt.position,
          snippet: stmt.text,
          explanation: `The expression uses '${match[2]} NULL'. In standard SQL, comparing any value to NULL using relational operators yields NULL (falsy in predicates).`,
          whyItMatters: "Queries with '= NULL' never match any rows, leading to broken filters and silent logical bugs.",
          recommendedFix: `Replace '${match[0]}' with '${match[1]} ${match[2] === "=" ? "IS NULL" : "IS NOT NULL"}'.`,
          safeExample: "-- Correct:\nWHERE customer_id IS NULL\n-- Incorrect:\n-- WHERE customer_id = NULL",
        });
      }
    }
    return findings;
  },
};

// SP011: Repeated expressions or redundant assignments
export const SP011_RedundantAssignment: ProcedureRule = {
  id: "SP011",
  title: "Redundant Consecutive Variable Assignment",
  category: "Maintainability",
  defaultSeverity: "LOW",
  description: "Assigning the same variable multiple times without reading it in between is redundant.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const stmts = model.bodyStatements;

    for (let i = 0; i < stmts.length - 1; i++) {
      const s1 = stmts[i];
      const s2 = stmts[i + 1];

      if (s1.targetVariable && s2.targetVariable && s1.targetVariable.toLowerCase() === s2.targetVariable.toLowerCase()) {
        findings.push({
          ruleId: "SP011",
          title: `Consecutive overwrite of variable '${s1.targetVariable}'`,
          category: "Maintainability",
          severity: "LOW",
          confidence: 0.85,
          procedureName: model.name,
          position: s2.position,
          snippet: `${s1.text} -> ${s2.text}`,
          explanation: `Variable '${s1.targetVariable}' is assigned in consecutive statements without any intervening read.`,
          whyItMatters: "Consecutive assignments indicate copy-paste mistakes or unnecessary duplicate calculations.",
          recommendedFix: "Remove the first assignment if its result is unused, or verify whether different variables were intended.",
          safeExample: "-- Keep only the necessary assignment\nv_total := calculate_final_sum();",
        });
      }
    }
    return findings;
  },
};

// SP012: Potentially unsafe data modification without predicate
export const SP012_UnsafeDml: ProcedureRule = {
  id: "SP012",
  title: "Unsafe UPDATE or DELETE Without WHERE Clause",
  category: "Security",
  defaultSeverity: "CRITICAL",
  description: "Data-modifying statements (UPDATE, DELETE) should always include a restrictive WHERE clause.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];

    for (const stmt of model.bodyStatements) {
      const isUpdate = /^\s*UPDATE\b/i.test(stmt.text);
      const isDelete = /^\s*DELETE\s+FROM\b/i.test(stmt.text);

      if ((isUpdate || isDelete) && !/\bWHERE\b/i.test(stmt.text)) {
        findings.push({
          ruleId: "SP012",
          title: `Unbounded ${isUpdate ? "UPDATE" : "DELETE"} statement without WHERE clause`,
          category: "Security",
          severity: "CRITICAL",
          confidence: 0.95,
          procedureName: model.name,
          position: stmt.position,
          snippet: stmt.text,
          explanation: `The ${isUpdate ? "UPDATE" : "DELETE"} statement does not specify a WHERE clause and will modify all rows in the target table.`,
          whyItMatters: "Unbounded DML causes accidental table-wide overwrites or catastrophic data loss in production environments.",
          recommendedFix: "Add a WHERE clause specifying the target record ID or partition key.",
          safeExample: "UPDATE employees SET status = 'ACTIVE' WHERE id = p_employee_id;",
        });
      }
    }
    return findings;
  },
};

// SP013: Excessive nesting and high control-flow complexity
export const SP013_ExcessiveComplexity: ProcedureRule = {
  id: "SP013",
  title: "High Control Flow Complexity / Deep Nesting",
  category: "Maintainability",
  defaultSeverity: "MEDIUM",
  description: "Procedures with high cyclomatic complexity or deep nesting are error-prone and hard to maintain.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];

    if (model.cyclomaticComplexity > 10 || model.maxNestingDepth >= 4) {
      findings.push({
        ruleId: "SP013",
        title: `High complexity (Cyclomatic: ${model.cyclomaticComplexity}, Nesting Depth: ${model.maxNestingDepth})`,
        category: "Maintainability",
        severity: model.cyclomaticComplexity > 15 || model.maxNestingDepth >= 5 ? "HIGH" : "MEDIUM",
        confidence: 0.9,
        procedureName: model.name,
        position: { line: 1, column: 1 },
        explanation: `The procedure has a cyclomatic complexity of ${model.cyclomaticComplexity} (threshold: 10) and nesting depth of ${model.maxNestingDepth} (threshold: 4).`,
        whyItMatters: "Complex procedural logic increases test surface exponentially and correlates strongly with production defects.",
        recommendedFix: "Refactor into smaller modular helper functions or decompose nested branches with guard clauses.",
        safeExample: "-- Use early guard clauses:\nIF NOT is_valid THEN\n    RETURN;\nEND IF;\n-- Continue flat workflow",
      });
    }
    return findings;
  },
};

// SP014: Cursor resource handling problems
export const SP014_CursorLeak: ProcedureRule = {
  id: "SP014",
  title: "Cursor Resource Leak (Opened but Not Closed)",
  category: "Reliability",
  defaultSeverity: "HIGH",
  description: "Cursors opened with OPEN must have a guaranteed corresponding CLOSE statement.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];

    for (const cur of model.cursors) {
      const curNameLower = cur.name.toLowerCase();
      const openRegex = new RegExp(`\\bOPEN\\s+${cur.name}\\b`, "i");
      const closeRegex = new RegExp(`\\bCLOSE\\s+${cur.name}\\b`, "i");
      const codeStatementsText = model.bodyStatements.map((s) => s.text).join(" ");
      const isOpen = openRegex.test(codeStatementsText);
      const isClosed = closeRegex.test(codeStatementsText);

      if (isOpen && !isClosed) {
        findings.push({
          ruleId: "SP014",
          title: `Cursor '${cur.name}' opened without corresponding CLOSE`,
          category: "Reliability",
          severity: "HIGH",
          confidence: 0.95,
          procedureName: model.name,
          position: cur.position,
          snippet: `OPEN ${cur.name};`,
          explanation: `The explicit cursor '${cur.name}' is opened in the body but no CLOSE statement was detected.`,
          whyItMatters: "Unclosed cursors leak database server memory, hold open table locks, and exhaust backend portal resources.",
          recommendedFix: `Add 'CLOSE ${cur.name};' at the end of execution and inside the exception handler.`,
          safeExample: "OPEN my_cur;\n-- FETCH loop\nCLOSE my_cur;",
        });
      }
    }
    return findings;
  },
};

// SP015: Duplicate logic and suspicious repeated conditions in IF/ELSIF
export const SP015_DuplicateBranchCondition: ProcedureRule = {
  id: "SP015",
  title: "Duplicate Branch Condition in IF-ELSIF Chain",
  category: "Bug Risk",
  defaultSeverity: "HIGH",
  description: "An ELSIF branch condition must not be identical to an earlier condition in the same IF construct.",
  analyze(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    const conditionRegex = /\b(?:IF|ELSIF)\s+([\s\S]*?)\s+THEN\b/gi;
    const conditionsSeen = new Set<string>();

    let match;
    while ((match = conditionRegex.exec(model.rawBody)) !== null) {
      const cond = match[1].trim().replace(/\s+/g, " ").toLowerCase();
      if (conditionsSeen.has(cond)) {
        const pos = findPositionAndSnippet(model.rawSource, cond);
        findings.push({
          ruleId: "SP015",
          title: `Duplicate branch condition: '${cond}'`,
          category: "Bug Risk",
          severity: "HIGH",
          confidence: 0.95,
          procedureName: model.name,
          position: pos.position,
          snippet: pos.snippet,
          explanation: `The condition '${cond}' is duplicated in multiple branches of an IF-ELSIF chain. The second branch is dead code.`,
          whyItMatters: "Duplicate conditions prevent secondary business logic from executing and indicate copy-paste oversights.",
          recommendedFix: "Replace the duplicated condition with the intended alternate predicate or remove the dead branch.",
          safeExample: "IF val = 1 THEN ...\nELSIF val = 2 THEN ... -- Distinct condition",
        });
      } else {
        conditionsSeen.add(cond);
      }
    }
    return findings;
  },
};

// Register all rules automatically
export function registerAllRules(): void {
  RuleRegistry.register(SP001_UnusedVariable);
  RuleRegistry.register(SP002_DeadStore);
  RuleRegistry.register(SP003_UnreachableCode);
  RuleRegistry.register(SP004_RedundantBoolean);
  RuleRegistry.register(SP005_Tautology);
  RuleRegistry.register(SP006_UnsafeDynamicSql);
  RuleRegistry.register(SP007_SuspiciousErrorHandler);
  RuleRegistry.register(SP008_DangerousTransaction);
  RuleRegistry.register(SP009_UnboundedLoop);
  RuleRegistry.register(SP010_NullComparison);
  RuleRegistry.register(SP011_RedundantAssignment);
  RuleRegistry.register(SP012_UnsafeDml);
  RuleRegistry.register(SP013_ExcessiveComplexity);
  RuleRegistry.register(SP014_CursorLeak);
  RuleRegistry.register(SP015_DuplicateBranchCondition);
}
