import {
  AstNode,
  SqlStatementNode,
  SelectStatementNode,
  UpdateStatementNode,
  DeleteStatementNode,
  InsertStatementNode,
  TruncateStatementNode,
  DropStatementNode,
  ExpressionNode,
  BinaryExpressionNode,
  InExpressionNode,
  LikeExpressionNode,
  FunctionExpressionNode,
  AggregateExpressionNode,
  ColumnReferenceNode,
  StarReferenceNode,
  TableReferenceNode,
  JoinClauseNode,
} from "./ast.types";

export interface AstMetrics {
  totalNodesVisited: number;
  maxNestingDepth: number;
  subqueryNestingDepth: number;
  tablesReferenced: string[];
  columnsReferenced: string[];
  joinCount: number;
  subqueryCount: number;
  aggregateCount: number;
  functionCount: number;
  hasStar: boolean;
  hasCte: boolean;
  hasUnion: boolean;
  hasDistinct: boolean;
  hasWhere: boolean;
  hasGroupBy: boolean;
  hasOrderBy: boolean;
  hasLimit: boolean;
  isDml: boolean;
  isDdl: boolean;
  predicates: string[];
  functionsUsed: string[];
}

export type AstVisitorCallback = (node: AstNode, depth: number, parent?: AstNode) => boolean | void;

export class AstDfsTraversal {
  /**
   * Performs recursive DFS traversal across the SQL AST and executes visitor callbacks.
   */
  public static traverse(root: AstNode, visitor?: AstVisitorCallback): AstMetrics {
    const metrics: AstMetrics = {
      totalNodesVisited: 0,
      maxNestingDepth: 0,
      subqueryNestingDepth: 0,
      tablesReferenced: [],
      columnsReferenced: [],
      joinCount: 0,
      subqueryCount: 0,
      aggregateCount: 0,
      functionCount: 0,
      hasStar: false,
      hasCte: false,
      hasUnion: false,
      hasDistinct: false,
      hasWhere: false,
      hasGroupBy: false,
      hasOrderBy: false,
      hasLimit: false,
      isDml: false,
      isDdl: false,
      predicates: [],
      functionsUsed: [],
    };

    const visitedTables = new Set<string>();
    const visitedColumns = new Set<string>();
    const visitedFuncs = new Set<string>();

    function dfs(
      node: AstNode | undefined,
      depth: number,
      parent?: AstNode,
      subqueryDepth: number = 0
    ): void {
      if (!node) return;

      metrics.totalNodesVisited++;
      if (depth > metrics.maxNestingDepth) {
        metrics.maxNestingDepth = depth;
      }

      // Invoke external visitor
      if (visitor) {
        const shouldStop = visitor(node, depth, parent);
        if (shouldStop === false) return;
      }

      // Collect metrics based on node type
      switch (node.type) {
        case "SelectStatement": {
          const sel = node as SelectStatementNode;
          if (sel.isDistinct) metrics.hasDistinct = true;
          if (sel.cte) metrics.hasCte = true;
          if (sel.where) metrics.hasWhere = true;
          if (sel.groupBy && sel.groupBy.length > 0) metrics.hasGroupBy = true;
          if (sel.orderBy && sel.orderBy.length > 0) metrics.hasOrderBy = true;
          if (sel.limit !== undefined) metrics.hasLimit = true;
          if (sel.unions && sel.unions.length > 0) metrics.hasUnion = true;

          // Visit CTEs
          if (sel.cte?.ctes) {
            for (const c of sel.cte.ctes) {
              metrics.subqueryCount++;
              const nextSqDepth = subqueryDepth + 1;
              if (nextSqDepth > metrics.subqueryNestingDepth) {
                metrics.subqueryNestingDepth = nextSqDepth;
              }
              dfs(c.query, depth + 1, sel, nextSqDepth);
            }
          }

          // Visit Projections
          for (const p of sel.projections) {
            dfs(p, depth + 1, sel, subqueryDepth);
          }

          // Visit FROM tables
          if (sel.from) {
            for (const f of sel.from) {
              dfs(f, depth + 1, sel, subqueryDepth);
            }
          }

          // Visit JOINs
          if (sel.joins) {
            metrics.joinCount += sel.joins.length;
            for (const j of sel.joins) {
              dfs(j, depth + 1, sel, subqueryDepth);
            }
          }

          // Visit WHERE
          if (sel.where) {
            dfs(sel.where, depth + 1, sel, subqueryDepth);
          }

          // Visit GROUP BY
          if (sel.groupBy) {
            for (const g of sel.groupBy) {
              dfs(g, depth + 1, sel, subqueryDepth);
            }
          }

          // Visit HAVING
          if (sel.having) {
            dfs(sel.having, depth + 1, sel, subqueryDepth);
          }

          // Visit ORDER BY
          if (sel.orderBy) {
            for (const o of sel.orderBy) {
              dfs(o.expression, depth + 1, sel, subqueryDepth);
            }
          }
          break;
        }

        case "TableReference": {
          const t = node as TableReferenceNode;
          if (t.subquery) {
            metrics.subqueryCount++;
            const nextSqDepth = subqueryDepth + 1;
            if (nextSqDepth > metrics.subqueryNestingDepth) {
              metrics.subqueryNestingDepth = nextSqDepth;
            }
            dfs(t.subquery, depth + 1, t, nextSqDepth);
          } else if (t.name && !visitedTables.has(t.name.toLowerCase())) {
            visitedTables.add(t.name.toLowerCase());
            metrics.tablesReferenced.push(t.name);
          }
          break;
        }

        case "JoinClause": {
          const j = node as JoinClauseNode;
          dfs(j.table, depth + 1, j, subqueryDepth);
          if (j.onCondition) {
            dfs(j.onCondition, depth + 1, j, subqueryDepth);
          }
          break;
        }

        case "StarReference": {
          metrics.hasStar = true;
          break;
        }

        case "ColumnReference": {
          const c = node as ColumnReferenceNode;
          const fullCol = c.table ? `${c.table}.${c.column}` : c.column;
          if (!visitedColumns.has(fullCol.toLowerCase())) {
            visitedColumns.add(fullCol.toLowerCase());
            metrics.columnsReferenced.push(fullCol);
          }
          break;
        }

        case "BinaryExpression": {
          const b = node as BinaryExpressionNode;
          if (["=", "!=", "<>", "<", "<=", ">", ">=", "LIKE", "ILIKE"].includes(b.operator)) {
            metrics.predicates.push(`${b.operator} condition`);
          }
          dfs(b.left, depth + 1, b, subqueryDepth);
          dfs(b.right, depth + 1, b, subqueryDepth);
          break;
        }

        case "InExpression": {
          const ie = node as InExpressionNode;
          metrics.predicates.push(ie.isNot ? "NOT IN" : "IN");
          dfs(ie.left, depth + 1, ie, subqueryDepth);
          if (ie.values) {
            for (const v of ie.values) {
              dfs(v, depth + 1, ie, subqueryDepth);
            }
          }
          if (ie.subquery) {
            metrics.subqueryCount++;
            const nextSqDepth = subqueryDepth + 1;
            if (nextSqDepth > metrics.subqueryNestingDepth) {
              metrics.subqueryNestingDepth = nextSqDepth;
            }
            dfs(ie.subquery, depth + 1, ie, nextSqDepth);
          }
          break;
        }

        case "LikeExpression": {
          const lk = node as LikeExpressionNode;
          metrics.predicates.push(lk.operator);
          dfs(lk.left, depth + 1, lk, subqueryDepth);
          break;
        }

        case "FunctionExpression": {
          const fn = node as FunctionExpressionNode;
          metrics.functionCount++;
          if (!visitedFuncs.has(fn.name.toUpperCase())) {
            visitedFuncs.add(fn.name.toUpperCase());
            metrics.functionsUsed.push(fn.name.toUpperCase());
          }
          for (const arg of fn.arguments) {
            dfs(arg, depth + 1, fn, subqueryDepth);
          }
          break;
        }

        case "AggregateExpression": {
          const agg = node as AggregateExpressionNode;
          metrics.aggregateCount++;
          if (!visitedFuncs.has(agg.name.toUpperCase())) {
            visitedFuncs.add(agg.name.toUpperCase());
            metrics.functionsUsed.push(agg.name.toUpperCase());
          }
          dfs(agg.argument, depth + 1, agg, subqueryDepth);
          break;
        }

        case "Subquery": {
          metrics.subqueryCount++;
          const sub = node as any;
          if (sub.query) {
            const nextSqDepth = subqueryDepth + 1;
            if (nextSqDepth > metrics.subqueryNestingDepth) {
              metrics.subqueryNestingDepth = nextSqDepth;
            }
            dfs(sub.query, depth + 1, sub, nextSqDepth);
          }
          break;
        }

        case "ExistsExpression": {
          const ee = node as any;
          if (ee.subquery) {
            metrics.subqueryCount++;
            const nextSqDepth = subqueryDepth + 1;
            if (nextSqDepth > metrics.subqueryNestingDepth) {
              metrics.subqueryNestingDepth = nextSqDepth;
            }
            dfs(ee.subquery, depth + 1, ee, nextSqDepth);
          }
          break;
        }

        case "UpdateStatement": {
          metrics.isDml = true;
          const upd = node as UpdateStatementNode;
          if (upd.table && !visitedTables.has(upd.table.toLowerCase())) {
            visitedTables.add(upd.table.toLowerCase());
            metrics.tablesReferenced.push(upd.table);
          }
          if (upd.where) {
            metrics.hasWhere = true;
            dfs(upd.where, depth + 1, upd, subqueryDepth);
          }
          for (const s of upd.setClauses) {
            dfs(s.value, depth + 1, upd, subqueryDepth);
          }
          break;
        }

        case "DeleteStatement": {
          metrics.isDml = true;
          const del = node as DeleteStatementNode;
          if (del.table && !visitedTables.has(del.table.toLowerCase())) {
            visitedTables.add(del.table.toLowerCase());
            metrics.tablesReferenced.push(del.table);
          }
          if (del.where) {
            metrics.hasWhere = true;
            dfs(del.where, depth + 1, del, subqueryDepth);
          }
          break;
        }

        case "InsertStatement": {
          metrics.isDml = true;
          const ins = node as InsertStatementNode;
          if (ins.table && !visitedTables.has(ins.table.toLowerCase())) {
            visitedTables.add(ins.table.toLowerCase());
            metrics.tablesReferenced.push(ins.table);
          }
          if (ins.selectQuery) {
            metrics.subqueryCount++;
            const nextSqDepth = subqueryDepth + 1;
            if (nextSqDepth > metrics.subqueryNestingDepth) {
              metrics.subqueryNestingDepth = nextSqDepth;
            }
            dfs(ins.selectQuery, depth + 1, ins, nextSqDepth);
          }
          break;
        }

        case "TruncateStatement":
        case "DropStatement": {
          metrics.isDdl = true;
          const obj = node as any;
          if (obj.table || obj.name) {
            const n = (obj.table || obj.name) as string;
            if (!visitedTables.has(n.toLowerCase())) {
              visitedTables.add(n.toLowerCase());
              metrics.tablesReferenced.push(n);
            }
          }
          break;
        }
      }
    }

    dfs(root, 1, undefined, 0);
    return metrics;
  }
}
