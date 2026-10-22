export type FindingCategory =
  | "Bug Risk"
  | "Performance"
  | "Security"
  | "Maintainability"
  | "Reliability";

export type FindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

export interface SourcePosition {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

export interface ProcedureFinding {
  ruleId: string;
  title: string;
  category: FindingCategory;
  severity: FindingSeverity;
  confidence: number; // 0.0 - 1.0
  procedureName: string;
  signature?: string;
  position?: SourcePosition;
  snippet?: string;
  explanation: string;
  whyItMatters: string;
  recommendedFix: string;
  safeExample?: string;
}

export interface DeclaredVariable {
  name: string;
  dataType: string;
  defaultValue?: string;
  isConstant: boolean;
  position: SourcePosition;
}

export interface DeclaredCursor {
  name: string;
  query: string;
  position: SourcePosition;
}

export interface ParameterInfo {
  name: string;
  mode: "IN" | "OUT" | "INOUT" | "VARIADIC";
  dataType: string;
  defaultValue?: string;
}

export interface ProcedureStatement {
  type: string;
  text: string;
  position: SourcePosition;
  children?: ProcedureStatement[];
  targetVariable?: string;
  condition?: string;
  isDynamicSql?: boolean;
}

export interface ProcedureParsedModel {
  name: string;
  schema: string;
  language: string;
  isFunction: boolean;
  parameters: ParameterInfo[];
  returnType?: string;
  variables: DeclaredVariable[];
  cursors: DeclaredCursor[];
  bodyStatements: ProcedureStatement[];
  rawBody: string;
  rawSource: string;
  hasExceptionHandler: boolean;
  exceptionClauses: string[];
  cyclomaticComplexity: number;
  maxNestingDepth: number;
}

export interface ProcedureAnalysisReport {
  procedureName: string;
  schema: string;
  signature: string;
  language: string;
  linesOfCode: number;
  cyclomaticComplexity: number;
  findings: ProcedureFinding[];
  scores: {
    overall: number; // 0 - 100
    performance: number;
    security: number;
    maintainability: number;
    reliability: number;
  };
  summary: {
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "CLEAN";
  };
  analyzedAt: string;
}

export interface ProcedureRule {
  id: string;
  title: string;
  category: FindingCategory;
  defaultSeverity: FindingSeverity;
  description: string;
  analyze(model: ProcedureParsedModel): ProcedureFinding[];
}
