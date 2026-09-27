import { PlanNode } from "./plan-tree";

export interface CardinalityIssue {
  nodeId: string;
  nodeType: string;
  relationName?: string;
  estimatedRows: number;
  actualRows: number;
  errorFactor: number;
  direction: "UNDERESTIMATE" | "OVERESTIMATE";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  evidence: string;
  recommendation: string;
  potentialCauses: string[];
}

export interface CardinalityAnalysisResult {
  hasCardinalityErrors: boolean;
  maxErrorFactor: number;
  issues: CardinalityIssue[];
  summary: string;
}

export class CardinalityAnalyzer {
  /**
   * Analyzes estimated vs actual row counts across all execution plan nodes.
   * Cardinality Error Ratio = Actual Rows / Estimated Rows (or Estimated / Actual).
   */
  public static analyze(root: PlanNode): CardinalityAnalysisResult {
    const issues: CardinalityIssue[] = [];
    let maxErrorFactor = 1.0;

    function evaluateNode(node: PlanNode): void {
      if (node.actualRows !== undefined && node.planRows > 0) {
        const est = node.planRows;
        const act = node.actualRows;

        let ratio = act / est;
        let factor = ratio >= 1 ? ratio : 1 / Math.max(ratio, 0.0001);
        factor = Number(factor.toFixed(2));

        if (factor > maxErrorFactor) {
          maxErrorFactor = factor;
        }

        // Flag issues if discrepancy is >= 5x
        if (factor >= 5.0) {
          const direction: "UNDERESTIMATE" | "OVERESTIMATE" = act > est ? "UNDERESTIMATE" : "OVERESTIMATE";
          let severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
          if (factor >= 100) severity = "CRITICAL";
          else if (factor >= 20) severity = "HIGH";
          else if (factor >= 5) severity = "MEDIUM";

          const potentialCauses: string[] = [];
          let recommendation = "";

          if (direction === "UNDERESTIMATE") {
            potentialCauses.push("Outdated database table statistics (stale pg_statistic).");
            potentialCauses.push("Correlated filter predicates violating independence assumptions.");
            potentialCauses.push("Non-uniform skewed data distribution on filtered columns.");
            recommendation = `Run 'ANALYZE ${node.relationName || "table"};' to refresh histogram statistics, or create extended statistics (CREATE STATISTICS) if multiple columns are correlated.`;
          } else {
            potentialCauses.push("High filter selectivity underestimated by the query planner.");
            potentialCauses.push("Complex non-sargable functions or subqueries obscuring row cardinality.");
            recommendation = `Review predicate selectivity and ensure statistics target (default_statistics_target) is sufficiently high.`;
          }

          issues.push({
            nodeId: node.id,
            nodeType: node.nodeType,
            relationName: node.relationName,
            estimatedRows: est,
            actualRows: act,
            errorFactor: factor,
            direction,
            severity,
            evidence: `Node '${node.nodeType}' estimated ${est.toLocaleString()} rows but processed ${act.toLocaleString()} actual rows (${factor}x ${direction.toLowerCase()}).`,
            recommendation,
            potentialCauses,
          });
        }
      }

      for (const child of node.plans) {
        evaluateNode(child);
      }
    }

    evaluateNode(root);

    const hasCardinalityErrors = issues.length > 0;
    let summary = "Cardinality estimation is accurate across all plan nodes.";
    if (hasCardinalityErrors) {
      summary = `Detected ${issues.length} execution plan node(s) with significant cardinality estimation errors (up to ${maxErrorFactor}x discrepancy).`;
    }

    return {
      hasCardinalityErrors,
      maxErrorFactor,
      issues,
      summary,
    };
  }
}
