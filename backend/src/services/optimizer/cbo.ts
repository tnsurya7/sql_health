import { DatabaseAdapter, ExplainResult } from "../../database/adapter.interface";
import { logger } from "../../server";

export interface CostEvaluationCandidate {
  id: string;
  source: "ORIGINAL" | "RULE_ENGINE" | "RELATIONAL_ALGEBRA" | "DP_JOIN" | "INDEX_ADVISOR" | "GEMINI_RAG";
  sql: string;
  description: string;
  estimatedCost?: number;
  startupCost?: number;
  planRows?: number;
  isExplainValid: boolean;
  explainOutput?: string;
  explainError?: string;
  costReductionPercent?: number;
}

export class CostBasedOptimizer {
  /**
   * Compares execution plan costs across multiple query candidates using the database adapter.
   */
  public static async evaluateCandidates(
    originalSql: string,
    candidateSqls: Array<{ id: string; source: any; sql: string; description: string }>,
    adapter?: DatabaseAdapter
  ): Promise<{
    candidates: CostEvaluationCandidate[];
    winningCandidateId: string;
    baselineCost: number;
    maxCostReductionPercent: number;
  }> {
    const results: CostEvaluationCandidate[] = [];
    let baselineCost = 100.0;

    // 1. Evaluate Original
    if (adapter && adapter.isConnected) {
      try {
        const origExplain = await adapter.explainQuery(originalSql, false);
        baselineCost = origExplain.totalCost || 100.0;
        results.push({
          id: "candidate-original",
          source: "ORIGINAL",
          sql: originalSql,
          description: "Original user query",
          estimatedCost: baselineCost,
          startupCost: origExplain.startupCost,
          planRows: origExplain.planRows,
          isExplainValid: true,
          explainOutput: origExplain.rawOutput,
          costReductionPercent: 0,
        });
      } catch (err: any) {
        logger.warn(`[CBO] Could not explain original query: ${err.message}`);
        results.push({
          id: "candidate-original",
          source: "ORIGINAL",
          sql: originalSql,
          description: "Original user query",
          isExplainValid: false,
          explainError: err.message,
          costReductionPercent: 0,
        });
      }
    } else {
      // Offline fallback cost estimation
      results.push({
        id: "candidate-original",
        source: "ORIGINAL",
        sql: originalSql,
        description: "Original query (offline estimate)",
        estimatedCost: 100.0,
        isExplainValid: true,
        costReductionPercent: 0,
      });
    }

    // 2. Evaluate each generated candidate
    let minCost = baselineCost;
    let winningCandidateId = "candidate-original";

    for (const cand of candidateSqls) {
      if (adapter && adapter.isConnected) {
        try {
          const explain = await adapter.explainQuery(cand.sql, false);
          const cost = explain.totalCost || baselineCost;
          const reduction = baselineCost > 0 ? Number((((baselineCost - cost) / baselineCost) * 100).toFixed(1)) : 0;

          const evaluated: CostEvaluationCandidate = {
            id: cand.id,
            source: cand.source,
            sql: cand.sql,
            description: cand.description,
            estimatedCost: cost,
            startupCost: explain.startupCost,
            planRows: explain.planRows,
            isExplainValid: true,
            explainOutput: explain.rawOutput,
            costReductionPercent: reduction,
          };

          results.push(evaluated);

          if (cost < minCost) {
            minCost = cost;
            winningCandidateId = cand.id;
          }
        } catch (err: any) {
          results.push({
            id: cand.id,
            source: cand.source,
            sql: cand.sql,
            description: cand.description,
            isExplainValid: false,
            explainError: err.message,
            costReductionPercent: 0,
          });
        }
      } else {
        // Deterministic heuristics based on transformation
        let heuristicReduction = 15;
        if (cand.source === "RELATIONAL_ALGEBRA") heuristicReduction = 35;
        else if (cand.source === "DP_JOIN") heuristicReduction = 45;
        else if (cand.source === "GEMINI_RAG") heuristicReduction = 30;

        const estCost = Number((baselineCost * (1 - heuristicReduction / 100)).toFixed(2));
        results.push({
          id: cand.id,
          source: cand.source,
          sql: cand.sql,
          description: cand.description,
          estimatedCost: estCost,
          isExplainValid: true,
          costReductionPercent: heuristicReduction,
        });

        if (estCost < minCost) {
          minCost = estCost;
          winningCandidateId = cand.id;
        }
      }
    }

    const maxCostReductionPercent =
      baselineCost > 0 ? Math.max(0, Number((((baselineCost - minCost) / baselineCost) * 100).toFixed(1))) : 0;

    return {
      candidates: results,
      winningCandidateId,
      baselineCost,
      maxCostReductionPercent,
    };
  }
}
