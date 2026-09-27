export type AstNodeType =
  | "SelectStatement"
  | "InsertStatement"
  | "UpdateStatement"
  | "DeleteStatement"
  | "TruncateStatement"
  | "DropStatement"
  | "AlterStatement"
  | "CreateStatement"
  | "FromClause"
  | "TableReference"
  | "JoinClause"
  | "WhereClause"
  | "GroupByClause"
  | "HavingClause"
  | "OrderByClause"
  | "OrderByItem"
  | "LimitOffsetClause"
  | "ColumnReference"
  | "StarReference"
  | "BinaryExpression"
  | "UnaryExpression"
  | "InExpression"
  | "LikeExpression"
  | "BetweenExpression"
  | "ExistsExpression"
  | "FunctionExpression"
  | "AggregateExpression"
  | "CaseExpression"
  | "Subquery"
  | "CteClause"
  | "CteDefinition"
  | "UnionClause"
  | "LiteralValue";

export interface AstNode {
  type: AstNodeType;
  parent?: AstNode;
  loc?: { start: number; end: number };
  children?: AstNode[];
}

export interface LiteralValueNode extends AstNode {
  type: "LiteralValue";
  value: string | number | boolean | null;
  raw: string;
  dataType: "string" | "number" | "boolean" | "null";
}

export interface ColumnReferenceNode extends AstNode {
  type: "ColumnReference";
  column: string;
  table?: string;
  schema?: string;
  alias?: string;
}

export interface StarReferenceNode extends AstNode {
  type: "StarReference";
  table?: string;
}

export interface TableReferenceNode extends AstNode {
  type: "TableReference";
  name: string;
  schema?: string;
  alias?: string;
  subquery?: SelectStatementNode;
}

export type JoinType = "INNER" | "LEFT" | "RIGHT" | "FULL" | "CROSS" | "NATURAL" | "COMMA";

export interface JoinClauseNode extends AstNode {
  type: "JoinClause";
  joinType: JoinType;
  table: TableReferenceNode;
  onCondition?: ExpressionNode;
  usingColumns?: string[];
}

export type BinaryOperator =
  | "="
  | "!="
  | "<>"
  | "<"
  | "<="
  | ">"
  | ">="
  | "LIKE"
  | "ILIKE"
  | "NOT LIKE"
  | "AND"
  | "OR"
  | "IS"
  | "IS NOT"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "||";

export interface BinaryExpressionNode extends AstNode {
  type: "BinaryExpression";
  operator: BinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryExpressionNode extends AstNode {
  type: "UnaryExpression";
  operator: "NOT" | "-" | "+";
  argument: ExpressionNode;
}

export interface InExpressionNode extends AstNode {
  type: "InExpression";
  left: ExpressionNode;
  isNot: boolean;
  values?: ExpressionNode[];
  subquery?: SelectStatementNode;
}

export interface LikeExpressionNode extends AstNode {
  type: "LikeExpression";
  left: ExpressionNode;
  operator: "LIKE" | "ILIKE" | "NOT LIKE" | "NOT ILIKE";
  pattern: string;
  isLeadingWildcard: boolean;
}

export interface BetweenExpressionNode extends AstNode {
  type: "BetweenExpression";
  expression: ExpressionNode;
  lower: ExpressionNode;
  upper: ExpressionNode;
  isNot: boolean;
}

export interface ExistsExpressionNode extends AstNode {
  type: "ExistsExpression";
  isNot: boolean;
  subquery: SelectStatementNode;
}

export interface FunctionExpressionNode extends AstNode {
  type: "FunctionExpression";
  name: string;
  arguments: ExpressionNode[];
}

export interface AggregateExpressionNode extends AstNode {
  type: "AggregateExpression";
  name: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX" | string;
  isDistinct: boolean;
  argument: ExpressionNode;
  overClause?: string;
}

export interface CaseWhenClause {
  when: ExpressionNode;
  then: ExpressionNode;
}

export interface CaseExpressionNode extends AstNode {
  type: "CaseExpression";
  discriminant?: ExpressionNode;
  cases: CaseWhenClause[];
  elseBranch?: ExpressionNode;
}

export interface SubqueryNode extends AstNode {
  type: "Subquery";
  query: SelectStatementNode;
  alias?: string;
}

export type ExpressionNode =
  | ColumnReferenceNode
  | StarReferenceNode
  | LiteralValueNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | InExpressionNode
  | LikeExpressionNode
  | BetweenExpressionNode
  | ExistsExpressionNode
  | FunctionExpressionNode
  | AggregateExpressionNode
  | CaseExpressionNode
  | SubqueryNode;

export interface CteDefinitionNode extends AstNode {
  type: "CteDefinition";
  name: string;
  columns?: string[];
  query: SelectStatementNode;
}

export interface CteClauseNode extends AstNode {
  type: "CteClause";
  isRecursive: boolean;
  ctes: CteDefinitionNode[];
}

export interface OrderByItemNode extends AstNode {
  type: "OrderByItem";
  expression: ExpressionNode;
  direction: "ASC" | "DESC";
  nulls?: "FIRST" | "LAST";
}

export interface SelectStatementNode extends AstNode {
  type: "SelectStatement";
  isDistinct: boolean;
  cte?: CteClauseNode;
  projections: ExpressionNode[];
  from?: TableReferenceNode[];
  joins?: JoinClauseNode[];
  where?: ExpressionNode;
  groupBy?: ExpressionNode[];
  having?: ExpressionNode;
  orderBy?: OrderByItemNode[];
  limit?: number;
  offset?: number;
  unions?: { type: "UNION" | "UNION ALL"; query: SelectStatementNode }[];
}

export interface UpdateStatementNode extends AstNode {
  type: "UpdateStatement";
  table: string;
  schema?: string;
  setClauses: { column: string; value: ExpressionNode }[];
  where?: ExpressionNode;
}

export interface DeleteStatementNode extends AstNode {
  type: "DeleteStatement";
  table: string;
  schema?: string;
  where?: ExpressionNode;
}

export interface InsertStatementNode extends AstNode {
  type: "InsertStatement";
  table: string;
  schema?: string;
  columns?: string[];
  valuesCount?: number;
  selectQuery?: SelectStatementNode;
}

export interface TruncateStatementNode extends AstNode {
  type: "TruncateStatement";
  table: string;
  schema?: string;
}

export interface DropStatementNode extends AstNode {
  type: "DropStatement";
  objectType: "TABLE" | "VIEW" | "INDEX" | "SCHEMA" | "DATABASE";
  name: string;
  schema?: string;
}

export type SqlStatementNode =
  | SelectStatementNode
  | InsertStatementNode
  | UpdateStatementNode
  | DeleteStatementNode
  | TruncateStatementNode
  | DropStatementNode;
