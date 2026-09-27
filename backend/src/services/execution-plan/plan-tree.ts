export interface PlanNode {
  id: string;
  nodeType: string;
  parentRelationship?: string;
  relationName?: string;
  schema?: string;
  alias?: string;
  indexName?: string;
  indexCond?: string;
  filter?: string;
  joinType?: string;
  hashCond?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth?: number;
  actualStartupTime?: number;
  actualTotalTime?: number;
  actualRows?: number;
  actualLoops?: number;
  sharedHitBlocks?: number;
  sharedReadBlocks?: number;
  costPercent: number;
  timePercent: number;
  cardinalityErrorRatio?: number;
  isExpensive: boolean;
  warnings: string[];
  plans: PlanNode[];
}

export class PlanTreeParser {
  /**
   * Parses raw PostgreSQL EXPLAIN JSON into a normalized PlanNode tree.
   */
  public static parse(rawJson: any): PlanNode | null {
    if (!rawJson) return null;

    let root = rawJson;
    if (Array.isArray(rawJson) && rawJson.length > 0) {
      root = rawJson[0]?.Plan || rawJson[0];
    } else if (rawJson.Plan) {
      root = rawJson.Plan;
    }

    if (!root || !root["Node Type"]) return null;

    let counter = 0;
    const totalRootCost = Number(root["Total Cost"] || 1);
    const totalRootTime = Number(root["Actual Total Time"] || 0);

    function parseNode(node: any): PlanNode {
      const id = `plan-node-${counter++}`;
      const nodeType = String(node["Node Type"] || "Unknown");
      const startupCost = Number(node["Startup Cost"] || 0);
      const totalCost = Number(node["Total Cost"] || 0);
      const planRows = Number(node["Plan Rows"] || 0);
      const actualRows = node["Actual Rows"] !== undefined ? Number(node["Actual Rows"]) : undefined;
      const actualTotalTime = node["Actual Total Time"] !== undefined ? Number(node["Actual Total Time"]) : undefined;
      const actualLoops = node["Actual Loops"] !== undefined ? Number(node["Actual Loops"]) : undefined;

      const costPercent = totalRootCost > 0 ? Number(((totalCost / totalRootCost) * 100).toFixed(1)) : 0;
      const timePercent = totalRootTime > 0 && actualTotalTime !== undefined
        ? Number(((actualTotalTime / totalRootTime) * 100).toFixed(1))
        : 0;

      // Cardinality Error
      let cardinalityErrorRatio: number | undefined;
      if (actualRows !== undefined && planRows > 0) {
        cardinalityErrorRatio = Number((actualRows / planRows).toFixed(2));
      }

      const warnings: string[] = [];
      let isExpensive = false;

      if (nodeType === "Seq Scan" && planRows > 1000) {
        warnings.push(`Sequential Scan across ${planRows.toLocaleString()} estimated rows on table '${node["Relation Name"] || "unknown"}'.`);
        isExpensive = true;
      }
      if (cardinalityErrorRatio !== undefined && (cardinalityErrorRatio > 10 || cardinalityErrorRatio < 0.1)) {
        warnings.push(`Extreme cardinality error ratio: ${cardinalityErrorRatio}x mismatch between estimated (${planRows}) and actual (${actualRows}) rows.`);
        isExpensive = true;
      }
      if (costPercent > 50 || timePercent > 50) {
        isExpensive = true;
      }

      const children: PlanNode[] = [];
      if (Array.isArray(node.Plans)) {
        for (const child of node.Plans) {
          children.push(parseNode(child));
        }
      }

      return {
        id,
        nodeType,
        parentRelationship: node["Parent Relationship"],
        relationName: node["Relation Name"],
        schema: node["Schema"],
        alias: node["Alias"],
        indexName: node["Index Name"],
        indexCond: node["Index Cond"],
        filter: node["Filter"],
        joinType: node["Join Type"],
        hashCond: node["Hash Cond"],
        startupCost,
        totalCost,
        planRows,
        planWidth: node["Plan Width"],
        actualStartupTime: node["Actual Startup Time"],
        actualTotalTime,
        actualRows,
        actualLoops,
        sharedHitBlocks: node["Shared Hit Blocks"],
        sharedReadBlocks: node["Shared Read Blocks"],
        costPercent,
        timePercent,
        cardinalityErrorRatio,
        isExpensive,
        warnings,
        plans: children,
      };
    }

    return parseNode(root);
  }
}
