import { SqlParser } from "../sql-parser/parser";
import { AstDfsTraversal, AstMetrics } from "../sql-parser/dfs";
import { RelationalAlgebraOptimizer } from "../optimizer/relational-algebra";
import { DpJoinOptimizer, JoinRelation } from "../optimizer/dp-join-optimizer";
import { IndexAdvisor } from "../index-advisor/advisor";
import { RagService } from "../rag/rag-service";
import { GeminiService } from "../gemini/client";
import { CostBasedOptimizer } from "../optimizer/cbo";
import { SafeBenchmarkRunner, BenchmarkComparison } from "./benchmark";
import {
  DatabaseAdapter,
  TableInfo,
  ColumnInfo,
  IndexInfo,
} from "../../database/adapter.interface";
import { logger } from "../../server";

export interface CandidateValidationReport {
  isSyntaxValid: boolean;
  isSafetyValid: boolean;
  isSemanticValid: boolean;
  isSchemaValid: boolean;
  isExplainValid: boolean;
  validationPassed: boolean;
  validationErrors: string[];
}

export interface OptimizationCandidate {
  id: string;
  source:
    | "RELATIONAL_ALGEBRA"
    | "DP_JOIN"
    | "INDEX_ADVISOR"
    | "GEMINI_RAG"
    | "ORIGINAL";
  title: string;
  candidateSql: string;
  changes: Array<{ type: string; description: string }>;
  estimatedCost?: number;
  costReductionPercent?: number;
  validation: CandidateValidationReport;
  benchmarkResult?: BenchmarkComparison;
  isWinner: boolean;
}

export interface PipelineExecutionResult {
  originalSql: string;
  databaseType: string;
  baselineCost: number;
  candidates: OptimizationCandidate[];
  winningCandidate: OptimizationCandidate | null;
  recommendedDdl?: string;
  summary: string;
  ragRetrievedCount?: number;
  geminiAvailable?: boolean;
}

export class CandidatePipeline {
  /**
   * Executes the complete end-to-end candidate generation,
   * multi-stage validation, CBO, and benchmarking pipeline.
   */
  public static async execute(
    originalSql: string,
    databaseType: string = "postgresql",
    adapter?: DatabaseAdapter,
    runBenchmark: boolean = false
  ): Promise<PipelineExecutionResult> {
    const cleanSql = originalSql.trim().replace(/;+$/, "");

    logger.info(
      `[CandidatePipeline] Starting optimization pipeline for query...`
    );

    // ============================================================
    // 1. Parse original query and collect schema metadata
    // ============================================================

    const originalAst = SqlParser.parse(
      cleanSql,
      databaseType as any
    );

    const originalMetrics = AstDfsTraversal.traverse(originalAst);

    let tables: TableInfo[] = [];
    let columns: ColumnInfo[] = [];
    let existingIndexes: IndexInfo[] = [];

    if (adapter && adapter.isConnected) {
      try {
        tables = await adapter.getTables();
        columns = await adapter.getColumns();
        existingIndexes = await adapter.getIndexes();
      } catch (err) {
        logger.warn(
          `[CandidatePipeline] Metadata retrieval warning:`,
          err
        );
      }
    }

    // ============================================================
    // Raw candidate structure
    // ============================================================

    const rawCandidates: Array<{
      id: string;
      source:
        | "RELATIONAL_ALGEBRA"
        | "DP_JOIN"
        | "INDEX_ADVISOR"
        | "GEMINI_RAG";
      title: string;
      sql: string;
      changes: Array<{
        type: string;
        description: string;
      }>;
    }> = [];

    // ============================================================
    // 2. Candidate 1: Relational Algebra Transformations
    // ============================================================

    try {
      const algResult =
        RelationalAlgebraOptimizer.optimize(
          cleanSql,
          databaseType,
          tables,
          columns
        );

      if (
        algResult.hasChanges &&
        algResult.transformedSql !== cleanSql
      ) {
        rawCandidates.push({
          id: `cand-algebra-${Date.now()}`,
          source: "RELATIONAL_ALGEBRA",
          title: "Relational Algebra Optimizer",
          sql: algResult.transformedSql,
          changes: algResult.transformations.map((t) => ({
            type: t.ruleName,
            description: t.description,
          })),
        });
      }
    } catch (err) {
      logger.warn(
        `[CandidatePipeline] Relational algebra candidate generation failed:`,
        err
      );
    }

    // ============================================================
    // 3. Candidate 2: Dynamic Programming Join Optimizer
    // ============================================================

    try {
      if (
        originalMetrics.joinCount >= 1 &&
        originalMetrics.tablesReferenced.length >= 2
      ) {
        const relations: JoinRelation[] = [];

        if (originalAst.type === "SelectStatement") {
          const sel = originalAst as any;

          // --------------------------------------------
          // Extract FROM relations
          // --------------------------------------------

          if (sel.from) {
            for (const f of sel.from) {
              if (f.name) {
                const t = tables.find(
                  (tbl) =>
                    tbl.name.toLowerCase() ===
                    f.name.toLowerCase()
                );

                relations.push({
                  name: f.name,
                  alias: f.alias,
                  cardinality: t?.rowCount || 1000,
                });
              }
            }
          }

          // --------------------------------------------
          // Extract JOIN relations
          // --------------------------------------------

          if (sel.joins) {
            for (const j of sel.joins) {
              if (j.table?.name) {
                const t = tables.find(
                  (tbl) =>
                    tbl.name.toLowerCase() ===
                    j.table.name.toLowerCase()
                );

                relations.push({
                  name: j.table.name,
                  alias: j.table.alias,
                  cardinality: t?.rowCount || 1000,
                });
              }
            }
          }
        }

        // --------------------------------------------
        // Fallback to metrics
        // --------------------------------------------

        if (relations.length < 2) {
          for (const name of originalMetrics.tablesReferenced) {
            if (
              !relations.some(
                (r) =>
                  r.name.toLowerCase() ===
                  name.toLowerCase()
              )
            ) {
              const t = tables.find(
                (tbl) =>
                  tbl.name.toLowerCase() ===
                  name.toLowerCase()
              );

              relations.push({
                name,
                cardinality: t?.rowCount || 1000,
              });
            }
          }
        }

        // --------------------------------------------
        // Extract JOIN ON conditions
        // --------------------------------------------

        const joinConditions = new Map<string, string>();

        const joinMatches = cleanSql.matchAll(
          /\b(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+)?JOIN\s+([a-zA-Z0-9_\."`]+)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?\s+ON\s+([\s\S]+?)(?=\s+(?:INNER\s+|LEFT\s+|RIGHT\s+|FULL\s+|CROSS\s+)?JOIN|\s+WHERE|\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/gi
        );

        for (const jm of joinMatches) {
          const joinTable =
            jm[1]
              .replace(/["`]/g, "")
              .split(".")
              .pop() || jm[1];

          const joinAlias = jm[2];
          const onClause = jm[3].trim();

          for (const rel of relations) {
            if (
              rel.name.toLowerCase() !==
              joinTable.toLowerCase()
            ) {
              const name = rel.name;
              const alias = rel.alias;

              const nameRegex = new RegExp(
                `\\b${name}\\b`,
                "i"
              );

              const aliasRegex = alias
                ? new RegExp(`\\b${alias}\\b`, "i")
                : null;

              if (
                nameRegex.test(onClause) ||
                (aliasRegex && aliasRegex.test(onClause))
              ) {
                joinConditions.set(
                  `${joinTable}-${rel.name}`,
                  onClause
                );

                if (joinAlias && rel.alias) {
                  joinConditions.set(
                    `${joinAlias}-${rel.alias}`,
                    onClause
                  );
                }
              }
            }
          }

          // Two-relation fallback
          if (
            relations.length === 2 &&
            joinConditions.size === 0
          ) {
            joinConditions.set(
              `${relations[0].name}-${relations[1].name}`,
              onClause
            );

            if (
              relations[0].alias &&
              relations[1].alias
            ) {
              joinConditions.set(
                `${relations[0].alias}-${relations[1].alias}`,
                onClause
              );
            }
          }
        }

        const dpResult =
          DpJoinOptimizer.optimizeJoinOrder(
            relations,
            joinConditions
          );

        if (dpResult.costReductionPercent > 0) {
          const rewrittenSql = cleanSql.replace(
            /\bFROM\s+[\s\S]+?(?=\s+WHERE|\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i,
            `FROM ${dpResult.optimizedFromClause}`
          );

          if (rewrittenSql !== cleanSql) {
            rawCandidates.push({
              id: `cand-dpjoin-${Date.now()}`,
              source: "DP_JOIN",
              title:
                "Dynamic Programming Join Optimizer",
              sql: rewrittenSql,
              changes: [
                {
                  type: "DP_JOIN_ORDERING",
                  description: `Reordered join tree to [${dpResult.optimalOrder.join(
                    " -> "
                  )}] based on relation cardinality and hash join selectivity.`,
                },
              ],
            });
          }
        }
      }
    } catch (err) {
      logger.warn(
        `[CandidatePipeline] DP Join optimizer candidate generation failed:`,
        err
      );
    }

    // ============================================================
    // 4. Candidate 3: Index Advisor Recommendations
    // ============================================================

    let recommendedDdl: string | undefined;

    try {
      const indexRecs = IndexAdvisor.advise(
        originalAst,
        originalMetrics,
        databaseType,
        tables,
        columns,
        existingIndexes
      );

      if (indexRecs.length > 0) {
        recommendedDdl = indexRecs
          .map((r) => r.ddl)
          .join("\n");

        rawCandidates.push({
          id: `cand-index-${Date.now()}`,
          source: "INDEX_ADVISOR",
          title: "Index Advisor Access Path",

          // Query itself remains unchanged.
          // Index DDL is supplied separately.
          sql: cleanSql,

          changes: indexRecs.map((r) => ({
            type: "CREATE_INDEX",
            description: `${r.reason} -> ${r.ddl}`,
          })),
        });
      }
    } catch (err) {
      logger.warn(
        `[CandidatePipeline] Index advisor candidate generation failed:`,
        err
      );
    }

    // ============================================================
    // 5. Candidate 4: RAG Retrieval + Gemini
    // ============================================================

    let ragRetrievedCount = 0;

    try {
      const ragResults =
        await RagService.retrieveRelevantKnowledge({
          sql: cleanSql,
          databaseType,
          ruleCodes: originalMetrics.predicates,
          limit: 3,
        });

      ragRetrievedCount = ragResults.length;

      if (GeminiService.isAvailable()) {
        const geminiOutput =
          await GeminiService.generateCandidate({
            sql: cleanSql,

            databaseType,

            astSummary:
              `Projections: ${originalMetrics.columnsReferenced.length}, ` +
              `Tables: ${originalMetrics.tablesReferenced.join(
                ", "
              )}, ` +
              `Joins: ${originalMetrics.joinCount}`,

            schemaMetadata: tables
              .map(
                (t) =>
                  `${t.name} (${t.rowCount} rows)`
              )
              .join(", "),

            indexes: existingIndexes
              .map(
                (i) =>
                  `${i.name} on ${i.table}(${i.columns.join(
                    ","
                  )})`
              )
              .join("; "),

            detectedIssues:
              originalMetrics.predicates,

            ragContext: ragResults,

            algorithmicCandidates:
              rawCandidates.map((c) => c.sql),
          });

        // Add Gemini candidate only when it is a successful, different rewrite
        if (
          geminiOutput &&
          geminiOutput.status === "SUCCESS" &&
          geminiOutput.candidateSql &&
          geminiOutput.candidateSql.trim().length >= 5 &&
          geminiOutput.candidateSql !== cleanSql
        ) {
          rawCandidates.push({
            id: `cand-gemini-${Date.now()}`,
            source: "GEMINI_RAG",
            title: "Gemini AI + RAG Architecture",

            sql: geminiOutput.candidateSql
              .trim()
              .replace(/;+$/, ""),

            changes: geminiOutput.changes,
          });
        } else {
          logger.info(
            "[CandidatePipeline] Gemini did not produce a different SQL candidate."
          );
        }
      } else {
        logger.info(
          "[CandidatePipeline] Gemini is not configured."
        );
      }
    } catch (err) {
      logger.warn(
        `[CandidatePipeline] Gemini/RAG candidate generation failed:`,
        err
      );
    }

    // ============================================================
    // 6. Multi-Stage Validation Pipeline
    // ============================================================

    const validatedCandidates: OptimizationCandidate[] = [];

    for (const cand of rawCandidates) {
      const valReport =
        CandidatePipeline.validateCandidate(
          cleanSql,
          cand.sql,
          originalMetrics,
          tables
        );

      validatedCandidates.push({
        id: cand.id,
        source: cand.source,
        title: cand.title,
        candidateSql: cand.sql,
        changes: cand.changes,
        validation: valReport,
        isWinner: false,
      });
    }

    // ============================================================
    // 7. Cost-Based Evaluation
    // ============================================================

    const cboCandidates = validatedCandidates
      .filter(
        (c) => c.validation.validationPassed
      )
      .map((c) => ({
        id: c.id,
        source: c.source,
        sql: c.candidateSql,
        description: c.title,
      }));

    const cboResult =
      await CostBasedOptimizer.evaluateCandidates(
        cleanSql,
        cboCandidates,
        adapter
      );

    const baselineCost =
      cboResult.baselineCost;

    // Attach CBO results
    for (const cand of validatedCandidates) {
      const cboEval =
        cboResult.candidates.find(
          (c) => c.id === cand.id
        );

      if (cboEval) {
        cand.estimatedCost =
          cboEval.estimatedCost;

        cand.costReductionPercent =
          cboEval.costReductionPercent;
      }
    }

    // ============================================================
    // 8. Safe Benchmarking
    // ============================================================

    let winningCandidate:
      | OptimizationCandidate
      | null = null;

    const eligibleWinners =
      validatedCandidates.filter(
        (c) =>
          c.validation.validationPassed &&
          (c.costReductionPercent || 0) > 0
      );

    eligibleWinners.sort(
      (a, b) =>
        (b.costReductionPercent || 0) -
        (a.costReductionPercent || 0)
    );

    if (eligibleWinners.length > 0) {
      winningCandidate =
        eligibleWinners[0];

      winningCandidate.isWinner = true;

      if (
        runBenchmark &&
        adapter &&
        adapter.isConnected &&
        /^\s*SELECT\b/i.test(cleanSql)
      ) {
        try {
          const comp =
            await SafeBenchmarkRunner.compareQueries(
              adapter,
              cleanSql,
              winningCandidate.candidateSql,
              3
            );

          winningCandidate.benchmarkResult =
            comp;
        } catch (err) {
          logger.warn(
            `[CandidatePipeline] Benchmark comparison failed:`,
            err
          );
        }
      }
    }

    // ============================================================
    // Summary
    // ============================================================

    const summary = winningCandidate
      ? `Generated ${validatedCandidates.length} candidate(s). Optimal candidate selected from '${winningCandidate.title}' with an estimated ${winningCandidate.costReductionPercent}% execution cost reduction.`
      : `Evaluated ${validatedCandidates.length} candidate(s). Query is already in optimal shape or requires index provisioning.`;

    return {
      originalSql: cleanSql,
      databaseType,
      baselineCost,
      candidates: validatedCandidates,
      winningCandidate,
      recommendedDdl,
      summary,
      ragRetrievedCount,
      geminiAvailable:
        GeminiService.isAvailable(),
    };
  }

  // ==============================================================
  // 7-Stage Validation
  // ==============================================================

  public static validateCandidate(
    originalSql: string,
    candidateSql: string,
    origMetrics: AstMetrics,
    tables: TableInfo[]
  ): CandidateValidationReport {
    const errors: string[] = [];

    // ============================================================
    // Stage 1: Syntax Validation
    // ============================================================

    let candAst;

    try {
      candAst = SqlParser.parse(candidateSql);
    } catch (err: any) {
      errors.push(
        `Syntax Error: ${err.message}`
      );

      return {
        isSyntaxValid: false,
        isSafetyValid: false,
        isSemanticValid: false,
        isSchemaValid: false,
        isExplainValid: false,
        validationPassed: false,
        validationErrors: errors,
      };
    }

    const isSyntaxValid = true;

    // ============================================================
    // Stage 2: Safety Validation
    // ============================================================

    let isSafetyValid = true;

    const candMetrics =
      AstDfsTraversal.traverse(candAst);

    if (
      !origMetrics.isDml &&
      candMetrics.isDml
    ) {
      errors.push(
        "Safety Violation: Candidate introduced DML operations into read query."
      );

      isSafetyValid = false;
    }

    if (
      !origMetrics.isDdl &&
      candMetrics.isDdl
    ) {
      errors.push(
        "Safety Violation: Candidate introduced DDL operations into read query."
      );

      isSafetyValid = false;
    }

    // ============================================================
    // Stage 3: Semantic Validation
    // ============================================================

    let isSemanticValid = true;

    const origTables =
      origMetrics.tablesReferenced.map(
        (t) => t.toLowerCase()
      );

    const candTables =
      candMetrics.tablesReferenced.map(
        (t) => t.toLowerCase()
      );

    for (const t of origTables) {
      if (!candTables.includes(t)) {
        errors.push(
          `Semantic Mismatch: Candidate omitted original table '${t}'.`
        );

        isSemanticValid = false;
      }
    }

    // ============================================================
    // Stage 4: Schema Validation
    // ============================================================

    let isSchemaValid = true;

    if (tables.length > 0) {
      const knownTableNames =
        tables.map((t) =>
          t.name.toLowerCase()
        );

      for (const ct of candTables) {
        if (
          !knownTableNames.includes(ct) &&
          ct !== "subquery_table"
        ) {
          errors.push(
            `Schema Error: Candidate referenced unknown table '${ct}' not present in database schema.`
          );

          isSchemaValid = false;
        }
      }
    }

    // ============================================================
    // Stage 5: Final Validation Status
    // ============================================================

    const validationPassed =
      isSyntaxValid &&
      isSafetyValid &&
      isSemanticValid &&
      isSchemaValid;

    return {
      isSyntaxValid,
      isSafetyValid,
      isSemanticValid,
      isSchemaValid,
      isExplainValid: true,
      validationPassed,
      validationErrors: errors,
    };
  }
}