import { Pool } from "pg";

export interface PlanNode {
  nodeType: string;
  relationName?: string;
  alias?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  actualStartupTime?: number;
  actualTotalTime?: number;
  actualRows?: number;
  actualLoops?: number;
  sharedHitBlocks?: number;
  sharedReadBlocks?: number;
  isExpensive: boolean;
  children: PlanNode[];
}

export interface PlanResult {
  planningTime: number;
  executionTime: number;
  rootNode: PlanNode;
  rawJson: any;
}

export class ExecutionPlanAnalyzer {
  public static async explain(pool: Pool, sql: string): Promise<PlanResult> {
    const isSelect = /^\s*SELECT\b/i.test(sql);
    let explainQuery = `EXPLAIN (FORMAT JSON) ${sql}`;

    // For SELECT, we can do full ANALYZE + BUFFERS safely
    if (isSelect) {
      explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`;
    }

    const client = await pool.connect();
    try {
      if (!isSelect) {
        // Run in a transaction and rollback just in case the explain with analyze execution is triggered
        await client.query("BEGIN");
      }

      const res = await client.query(explainQuery);

      if (!isSelect) {
        await client.query("ROLLBACK");
      }

      const rawPlan = res.rows[0]["QUERY PLAN"][0];
      const plan = rawPlan["Plan"];
      const planningTime = rawPlan["Planning Time"] || 0;
      const executionTime = rawPlan["Execution Time"] || 0;

      const rootNode = this.parseNode(plan);

      return {
        planningTime,
        executionTime,
        rootNode,
        rawJson: rawPlan
      };
    } catch (err) {
      if (!isSelect) {
        try {
          await client.query("ROLLBACK");
        } catch {}
      }
      throw err;
    } finally {
      client.release();
    }
  }

  private static parseNode(node: any): PlanNode {
    const nodeType = node["Node Type"] || "Unknown";
    const relationName = node["Relation Name"];
    const alias = node["Alias"];
    const startupCost = node["Startup Cost"] || 0;
    const totalCost = node["Total Cost"] || 0;
    const planRows = node["Plan Rows"] || 0;
    const planWidth = node["Plan Width"] || 0;

    const actualStartupTime = node["Actual Startup Time"];
    const actualTotalTime = node["Actual Total Time"];
    const actualRows = node["Actual Rows"];
    const actualLoops = node["Actual Loops"];

    const sharedHitBlocks = node["Shared Hit Blocks"] || 0;
    const sharedReadBlocks = node["Shared Read Blocks"] || 0;

    // Detect if this is an expensive node
    // E.g., Seq Scan on a larger table, nested loops with high cost, high actual times
    const isExpensive = 
      nodeType === "Seq Scan" || 
      totalCost > 1000 || 
      (actualTotalTime !== undefined && actualTotalTime > 100);

    const children: PlanNode[] = [];
    if (node["Plans"]) {
      for (const subPlan of node["Plans"]) {
        children.push(this.parseNode(subPlan));
      }
    }

    return {
      nodeType,
      relationName,
      alias,
      startupCost,
      totalCost,
      planRows,
      planWidth,
      actualStartupTime,
      actualTotalTime,
      actualRows,
      actualLoops,
      sharedHitBlocks,
      sharedReadBlocks,
      isExpensive,
      children
    };
  }
}
