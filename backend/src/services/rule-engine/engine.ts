import { SqlParser } from "../sql-parser/parser";
import { AstDfsTraversal, AstMetrics } from "../sql-parser/dfs";
import { SqlStatementNode } from "../sql-parser/ast.types";
import { RULE_DEFINITIONS, RuleContext, RuleIssue, RuleSeverity } from "./rules";
import { TableInfo, ColumnInfo, IndexInfo } from "../../database/adapter.interface";

export interface AnalysisReport {
  sql: string;
  ast: SqlStatementNode;
  metrics: AstMetrics;
  issues: RuleIssue[];
  scorePerformance: number;
  scoreSecurity: number;
  scoreMaintainability: number;
  scoreOptimization: number;
  scoreOverall: number;
  summary: string;
}

export class RuleEngine {
  /**
   * Evaluates SQL through the deterministic AST parser, DFS metrics collector, and 25 rules.
   */
  public static analyze(
    sql: string,
    databaseType: string = "postgresql",
    schemaContext?: { tables?: TableInfo[]; columns?: ColumnInfo[]; indexes?: IndexInfo[] }
  ): AnalysisReport {
    const ast = SqlParser.parse(sql, databaseType as any);
    const metrics = AstDfsTraversal.traverse(ast);

    const ctx: RuleContext = {
      sql,
      ast,
      metrics,
      databaseType,
      tables: schemaContext?.tables,
      columns: schemaContext?.columns,
      indexes: schemaContext?.indexes,
    };

    const issues: RuleIssue[] = [];
    for (const rule of RULE_DEFINITIONS) {
      try {
        const issue = rule.analyze(ctx);
        if (issue) {
          issues.push(issue);
        }
      } catch (err) {
        // Individual rule failure should not abort full analysis
      }
    }

    // Deterministic scoring calculation based on severities
    let perfPenalties = 0;
    let secPenalties = 0;
    let maintPenalties = 0;

    for (const issue of issues) {
      const penalty = RuleEngine.getSeverityPenalty(issue.severity);
      if (issue.category === "PERFORMANCE" || issue.category === "INDEXING") {
        perfPenalties += penalty;
      } else if (issue.category === "SECURITY") {
        secPenalties += penalty;
      } else {
        maintPenalties += penalty;
      }
    }

    const scorePerformance = Math.max(10, 100 - perfPenalties);
    const scoreSecurity = Math.max(0, 100 - secPenalties);
    const scoreMaintainability = Math.max(20, 100 - maintPenalties);
    const scoreOptimization = Math.max(15, Math.round((scorePerformance + scoreMaintainability) / 2));

    // Weighted Overall Score: Perf (40%), Sec (30%), Maint (20%), Opt (10%)
    const scoreOverall = Math.round(
      scorePerformance * 0.4 +
      scoreSecurity * 0.3 +
      scoreMaintainability * 0.2 +
      scoreOptimization * 0.1
    );

    const summary = RuleEngine.generateSummary(issues, scoreOverall);

    return {
      sql,
      ast,
      metrics,
      issues,
      scorePerformance,
      scoreSecurity,
      scoreMaintainability,
      scoreOptimization,
      scoreOverall,
      summary,
    };
  }

  private static getSeverityPenalty(severity: RuleSeverity): number {
    switch (severity) {
      case "CRITICAL":
        return 40;
      case "HIGH":
        return 20;
      case "MEDIUM":
        return 10;
      case "LOW":
        return 5;
      case "INFO":
      default:
        return 2;
    }
  }

  private static generateSummary(issues: RuleIssue[], scoreOverall: number): string {
    if (issues.length === 0) {
      return "Query passed all deterministic anti-pattern checks with an excellent health score (100/100).";
    }

    const criticalCount = issues.filter((i) => i.severity === "CRITICAL").length;
    const highCount = issues.filter((i) => i.severity === "HIGH").length;
    const mediumCount = issues.filter((i) => i.severity === "MEDIUM").length;

    let text = `Detected ${issues.length} potential issue(s) with an overall score of ${scoreOverall}/100. `;
    if (criticalCount > 0) {
      text += `Contains ${criticalCount} CRITICAL issue(s) requiring immediate attention. `;
    }
    if (highCount > 0) {
      text += `Found ${highCount} HIGH impact performance/indexing bottleneck(s). `;
    }
    if (mediumCount > 0) {
      text += `Identified ${mediumCount} MEDIUM severity optimization opportunity(ies).`;
    }

    return text.trim();
  }
}
