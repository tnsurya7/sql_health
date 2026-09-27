import { PlanNode } from "./plan-tree";

export interface PlanTraversalMetrics {
  totalNodes: number;
  maxDepth: number;
  expensiveNodes: PlanNode[];
  nodeTypesCount: Record<string, number>;
  totalEstimatedCost: number;
  totalActualTimeMs: number;
  hasSeqScans: boolean;
  seqScanTables: string[];
  indexScansCount: number;
  joinsCount: number;
  sortsCount: number;
  aggregatesCount: number;
}

export class PlanTraversal {
  /**
   * Performs recursive tree traversal over the parsed execution plan.
   */
  public static traverse(root: PlanNode): PlanTraversalMetrics {
    const metrics: PlanTraversalMetrics = {
      totalNodes: 0,
      maxDepth: 0,
      expensiveNodes: [],
      nodeTypesCount: {},
      totalEstimatedCost: root.totalCost,
      totalActualTimeMs: root.actualTotalTime || 0,
      hasSeqScans: false,
      seqScanTables: [],
      indexScansCount: 0,
      joinsCount: 0,
      sortsCount: 0,
      aggregatesCount: 0,
    };

    function dfs(node: PlanNode, depth: number): void {
      metrics.totalNodes++;
      if (depth > metrics.maxDepth) {
        metrics.maxDepth = depth;
      }

      metrics.nodeTypesCount[node.nodeType] = (metrics.nodeTypesCount[node.nodeType] || 0) + 1;

      if (node.isExpensive) {
        metrics.expensiveNodes.push(node);
      }

      if (node.nodeType === "Seq Scan") {
        metrics.hasSeqScans = true;
        if (node.relationName && !metrics.seqScanTables.includes(node.relationName)) {
          metrics.seqScanTables.push(node.relationName);
        }
      } else if (node.nodeType.includes("Index Scan") || node.nodeType.includes("Bitmap Index Scan")) {
        metrics.indexScansCount++;
      } else if (node.nodeType.includes("Join") || node.nodeType === "Nested Loop") {
        metrics.joinsCount++;
      } else if (node.nodeType === "Sort") {
        metrics.sortsCount++;
      } else if (node.nodeType === "Aggregate" || node.nodeType.includes("Aggregate")) {
        metrics.aggregatesCount++;
      }

      for (const child of node.plans) {
        dfs(child, depth + 1);
      }
    }

    dfs(root, 1);
    return metrics;
  }
}
