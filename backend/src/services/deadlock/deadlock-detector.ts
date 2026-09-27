import { DatabaseAdapter, DeadlockReport } from "../../database/adapter.interface";
import { prisma, logger } from "../../server";

export interface WaitGraphEdge {
  fromPid: number;
  toPid: number;
  fromQuery: string;
  toQuery: string;
  lockType: string;
  mode: string;
}

export interface DeadlockCycleResult {
  hasDeadlock: boolean;
  cyclePids: number[];
  cycleTransactions: Array<{
    pid: number;
    query: string;
    waitingForPid: number;
    lockType: string;
    mode: string;
  }>;
  waitEdges: WaitGraphEdge[];
  rawLocksCount: number;
  description: string;
  timestamp: Date;
}

export class DeadlockDetector {
  /**
   * Retrieves active database locks, constructs directed wait-for graph, and runs DFS cycle detection.
   */
  public static async checkDeadlocks(
    adapter: DatabaseAdapter,
    connectionId?: string
  ): Promise<DeadlockCycleResult> {
    if (!adapter || !adapter.isConnected) {
      return {
        hasDeadlock: false,
        cyclePids: [],
        cycleTransactions: [],
        waitEdges: [],
        rawLocksCount: 0,
        description: "Target database is not connected.",
        timestamp: new Date(),
      };
    }

    try {
      const report: DeadlockReport = await adapter.getDeadlocks();

      const waitEdges: WaitGraphEdge[] = report.cycleNodes.map((n) => ({
        fromPid: n.pid,
        toPid: n.waitingForPid,
        fromQuery: n.query,
        toQuery: `Transaction ${n.waitingForPid}`,
        lockType: n.lockType,
        mode: n.mode,
      }));

      const cyclePids = report.cycleNodes.map((n) => n.pid);

      // Record deadlock event in application database if deadlock detected
      if (report.hasDeadlock && connectionId) {
        await prisma.deadlockLog.create({
          data: {
            connectionId,
            cycleDetails: JSON.stringify(report.cycleNodes),
            resolved: false,
          },
        }).catch(() => {});
      }

      return {
        hasDeadlock: report.hasDeadlock,
        cyclePids,
        cycleTransactions: report.cycleNodes,
        waitEdges,
        rawLocksCount: report.rawLocks.length,
        description: report.description || (report.hasDeadlock ? "Deadlock cycle detected." : "No deadlocks detected."),
        timestamp: new Date(),
      };
    } catch (err: any) {
      logger.warn(`[DeadlockDetector] Deadlock check error: ${err.message}`);
      return {
        hasDeadlock: false,
        cyclePids: [],
        cycleTransactions: [],
        waitEdges: [],
        rawLocksCount: 0,
        description: `Could not inspect lock graph: ${err.message}`,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Pure algorithm helper: Detects cycles in any directed graph using DFS.
   */
  public static detectCyclesInGraph(edges: Array<{ from: number; to: number }>): number[][] {
    const adj: Map<number, number[]> = new Map();
    for (const e of edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.to);
    }

    const visited = new Set<number>();
    const recStack = new Set<number>();
    const cycles: number[][] = [];

    const dfs = (node: number, path: number[]): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = adj.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, path);
        } else if (recStack.has(neighbor)) {
          // Cycle found
          const startIdx = path.indexOf(neighbor);
          cycles.push(path.slice(startIdx));
        }
      }

      recStack.delete(node);
      path.pop();
    };

    for (const node of adj.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }
}
