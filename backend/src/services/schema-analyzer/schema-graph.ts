import { TableInfo, ColumnInfo, ConstraintInfo, IndexInfo } from "../../database/adapter.interface";

export interface GraphNode {
  id: string; // tableName
  label: string;
  schema: string;
  type: "BASE TABLE" | "VIEW" | "MATERIALIZED VIEW";
  rowCount: number;
  sizeBytes: number;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
}

export interface GraphEdge {
  id: string;
  source: string; // From Table
  target: string; // To Table (referenced table)
  sourceColumn: string;
  targetColumn: string;
  constraintName: string;
}

export interface JoinPathStep {
  fromTable: string;
  toTable: string;
  fromColumn: string;
  toColumn: string;
  joinCondition: string;
}

export class SchemaGraph {
  public nodes: Map<string, GraphNode> = new Map();
  public edges: GraphEdge[] = [];
  private adjacencyList: Map<string, Array<{ neighbor: string; edge: GraphEdge }>> = new Map();

  constructor(
    tables: TableInfo[],
    columns: ColumnInfo[],
    constraints: ConstraintInfo[],
    indexes: IndexInfo[]
  ) {
    this.buildGraph(tables, columns, constraints, indexes);
  }

  private buildGraph(
    tables: TableInfo[],
    columns: ColumnInfo[],
    constraints: ConstraintInfo[],
    indexes: IndexInfo[]
  ): void {
    // 1. Create Nodes
    for (const t of tables) {
      const tableCols = columns.filter((c) => c.schema === t.schema && c.table === t.name);
      const tableIdxs = indexes.filter((i) => i.schema === t.schema && i.table === t.name);
      const node: GraphNode = {
        id: t.name,
        label: t.name,
        schema: t.schema,
        type: t.type,
        rowCount: t.rowCount,
        sizeBytes: t.sizeBytes,
        columns: tableCols,
        indexes: tableIdxs,
      };
      this.nodes.set(t.name.toLowerCase(), node);
      this.adjacencyList.set(t.name.toLowerCase(), []);
    }

    // 2. Create Edges from Foreign Key Constraints
    let edgeIdx = 0;
    for (const c of constraints) {
      if (c.type === "FOREIGN KEY" && c.refTable && c.columns.length > 0) {
        const source = c.table.toLowerCase();
        const target = c.refTable.toLowerCase();
        const sourceCol = c.columns[0];
        const targetCol = (c.refColumns && c.refColumns[0]) || "id";

        const edge: GraphEdge = {
          id: `edge-${edgeIdx++}-${source}-${target}`,
          source: c.table,
          target: c.refTable,
          sourceColumn: sourceCol,
          targetColumn: targetCol,
          constraintName: c.name,
        };

        this.edges.push(edge);

        // Directed and reverse lookups for undirected pathfinding
        if (this.adjacencyList.has(source)) {
          this.adjacencyList.get(source)!.push({ neighbor: target, edge });
        }
        if (this.adjacencyList.has(target)) {
          this.adjacencyList.get(target)!.push({ neighbor: source, edge });
        }
      }
    }
  }

  /**
   * Finds the shortest join path between two tables using BFS traversal.
   */
  public findShortestJoinPath(startTable: string, targetTable: string): JoinPathStep[] {
    const start = startTable.toLowerCase();
    const target = targetTable.toLowerCase();

    if (start === target || !this.adjacencyList.has(start) || !this.adjacencyList.has(target)) {
      return [];
    }

    const queue: Array<{ current: string; path: JoinPathStep[] }> = [{ current: start, path: [] }];
    const visited = new Set<string>([start]);

    while (queue.length > 0) {
      const { current, path } = queue.shift()!;

      if (current === target) {
        return path;
      }

      const neighbors = this.adjacencyList.get(current) || [];
      for (const { neighbor, edge } of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);

          let fromCol = edge.sourceColumn;
          let toCol = edge.targetColumn;
          let fromT = edge.source;
          let toT = edge.target;

          if (current !== edge.source.toLowerCase()) {
            // Reverse edge
            fromT = edge.target;
            toT = edge.source;
            fromCol = edge.targetColumn;
            toCol = edge.sourceColumn;
          }

          const step: JoinPathStep = {
            fromTable: fromT,
            toTable: toT,
            fromColumn: fromCol,
            toColumn: toCol,
            joinCondition: `${fromT}.${fromCol} = ${toT}.${toCol}`,
          };

          queue.push({
            current: neighbor,
            path: [...path, step],
          });
        }
      }
    }

    return [];
  }

  /**
   * Returns all tables directly related to the given table (1 degree of separation).
   */
  public getRelatedTables(tableName: string): string[] {
    const tableKey = tableName.toLowerCase();
    const neighbors = this.adjacencyList.get(tableKey) || [];
    return Array.from(new Set(neighbors.map((n) => n.neighbor)));
  }

  /**
   * Calculates relationship depth and dependencies for a set of tables in a query.
   */
  public analyzeQueryDependencies(tableNames: string[]): {
    joinChains: JoinPathStep[][];
    missingRelationships: string[];
  } {
    const joinChains: JoinPathStep[][] = [];
    const missingRelationships: string[] = [];

    if (tableNames.length < 2) {
      return { joinChains, missingRelationships };
    }

    for (let i = 0; i < tableNames.length - 1; i++) {
      for (let j = i + 1; j < tableNames.length; j++) {
        const path = this.findShortestJoinPath(tableNames[i], tableNames[j]);
        if (path.length > 0) {
          joinChains.push(path);
        } else {
          missingRelationships.push(`No direct foreign key relationship found between '${tableNames[i]}' and '${tableNames[j]}'.`);
        }
      }
    }

    return { joinChains, missingRelationships };
  }
}
