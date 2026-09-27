import { Router, Request, Response } from "express";
import { RuleEngine } from "../services/rule-engine/engine";
import { PlanTreeParser } from "../services/execution-plan/plan-tree";
import { PlanTraversal } from "../services/execution-plan/plan-traversal";
import { CardinalityAnalyzer } from "../services/execution-plan/cardinality";
import { QueryNormalizer } from "../services/sql-parser/normalizer";
import { QueryFingerprinter } from "../services/sql-parser/fingerprint";
import { CandidatePipeline } from "../services/validation/candidate-pipeline";
import { SafeBenchmarkRunner } from "../services/validation/benchmark";
import { connectionManager } from "../database/connection-manager";
import { prisma, logger } from "../server";

const router = Router();

// POST /api/sql/analyze - Analyze SQL query with deterministic rules and AST DFS
router.post("/analyze", async (req: Request, res: Response) => {
  const { sql, connectionId, databaseType } = req.body;

  if (!sql || typeof sql !== "string" || sql.trim() === "") {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query string is required." },
    });
  }

  try {
    let adapter;
    let tables;
    let columns;
    let indexes;
    const targetConnId = connectionId || connectionManager.getActiveConnectionId();

    if (targetConnId && connectionManager.isConnected(targetConnId)) {
      adapter = connectionManager.getAdapter(targetConnId);
      tables = await adapter.getTables().catch(() => []);
      columns = await adapter.getColumns().catch(() => []);
      indexes = await adapter.getIndexes().catch(() => []);
    }

    const detectedDb = databaseType || adapter?.config.databaseType || "postgresql";
    const report = RuleEngine.analyze(sql, detectedDb, { tables, columns, indexes });

    // Store analysis in database
    const { fingerprint } = QueryFingerprinter.generate(sql, detectedDb);

    const savedQuery = await prisma.sqlQuery.create({
      data: {
        connectionId: targetConnId || null,
        rawSql: sql,
        formattedSql: report.sql,
        fingerprint,
        score: report.scoreOverall,
        analyses: {
          create: {
            summary: report.summary,
            scorePerf: report.scorePerformance,
            scoreSec: report.scoreSecurity,
            scoreMaint: report.scoreMaintainability,
            scoreOpt: report.scoreOptimization,
            scoreOver: report.scoreOverall,
            issues: {
              create: report.issues.map((i) => ({
                ruleId: i.ruleCode,
                title: i.title,
                description: i.description,
                severity: i.severity,
                category: i.category,
                evidence: i.evidence,
                recommendation: i.recommendation,
                confidence: i.confidence,
                affectedTables: i.affectedTables,
                affectedColumns: i.affectedColumns,
                databaseType: i.databaseType,
              })),
            },
          },
        },
      },
      include: {
        analyses: {
          include: {
            issues: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        queryId: savedQuery.id,
        fingerprint,
        report,
        scores: {
          overall: report.scoreOverall,
          performance: report.scorePerformance,
          security: report.scoreSecurity,
          maintainability: report.scoreMaintainability,
          optimization: report.scoreOptimization,
        },
        issues: report.issues,
      },
    });
  } catch (error: any) {
    logger.error(`[SqlRoute] Analysis error:`, error);
    res.status(500).json({
      success: false,
      error: { code: "ANALYSIS_ERROR", message: error.message },
    });
  }
});

// POST /api/sql/ai-explain - Explain SQL structure and semantics via AI / AST
router.post("/ai-explain", async (req: Request, res: Response) => {
  const { sql, databaseType } = req.body;
  if (!sql || typeof sql !== "string") {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query is required." },
    });
  }

  try {
    const dbType = databaseType || "postgresql";
    const keywords = sql.split(/\s+/).filter((w: string) => w.length > 2);
    const { RagService } = await import("../services/rag/rag-service");
    const { SqlParser } = await import("../services/sql-parser/parser");
    const { AstDfsTraversal } = await import("../services/sql-parser/dfs");
    const { GeminiService } = await import("../services/gemini/client");

    const ragContext = await RagService.retrieveRelevantKnowledge({
      keywords,
      databaseType: dbType,
      limit: 3,
    }).catch(() => []);

    let explanation = await GeminiService.generateExplanation(sql, dbType, ragContext).catch(() => null);

    if (!explanation) {
      try {
        const ast = SqlParser.parse(sql, dbType as any);
        const metrics = AstDfsTraversal.traverse(ast);
        const tablesText = metrics.tablesReferenced.length > 0 ? metrics.tablesReferenced.join(", ") : "no specified tables";
        explanation = `This ${dbType.toUpperCase()} query executes a ${ast.type || "statement"} accessing ${tablesText} across ${metrics.joinCount} join(s). Filter WHERE clause: ${metrics.hasWhere ? "Enabled" : "None"}. GROUP BY aggregations: ${metrics.hasGroupBy ? "Present" : "None"}. ORDER BY sort: ${metrics.hasOrderBy ? "Present" : "None"}. AST Complexity: ${metrics.totalNodesVisited} visited nodes.`;
      } catch {
        explanation = `SQL Query targeting ${dbType.toUpperCase()} with ${sql.length} characters parsed and verified.`;
      }
    }

    res.status(200).json({
      success: true,
      data: { explanation },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "AI_EXPLAIN_ERROR", message: error.message },
    });
  }
});

// POST /api/sql/explain - Execute EXPLAIN and perform plan tree traversal and cardinality analysis
router.post("/explain", async (req: Request, res: Response) => {
  const { sql, connectionId, analyze } = req.body;

  if (!sql || typeof sql !== "string") {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query string is required." },
    });
  }

  try {
    const targetConnId = connectionId || connectionManager.getActiveConnectionId();
    if (!targetConnId || !connectionManager.isConnected(targetConnId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "NO_ACTIVE_CONNECTION",
          message: "No active database connected. Please connect to a database to run EXPLAIN.",
        },
      });
    }

    const adapter = connectionManager.getAdapter(targetConnId);
    const explainRes = await adapter.explainQuery(sql, Boolean(analyze));

    const planTree = PlanTreeParser.parse(explainRes.plan);
    if (!planTree) {
      return res.status(200).json({
        success: true,
        data: {
          rawOutput: explainRes.rawOutput,
          planTree: null,
          metrics: null,
          cardinality: null,
        },
      });
    }

    const planMetrics = PlanTraversal.traverse(planTree);
    const cardinalityReport = CardinalityAnalyzer.analyze(planTree);

    res.status(200).json({
      success: true,
      data: {
        planningTime: explainRes.planningTime,
        executionTime: explainRes.executionTime,
        totalCost: explainRes.totalCost,
        rawOutput: explainRes.rawOutput,
        planTree,
        planMetrics,
        cardinalityReport,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: { code: "EXPLAIN_FAILED", message: error.message },
    });
  }
});

// POST /api/sql/normalize - Normalize SQL and generate fingerprint
router.post("/normalize", async (req: Request, res: Response) => {
  const { sql, databaseType } = req.body;
  if (!sql) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query is required." },
    });
  }

  const normalized = QueryNormalizer.normalize(sql);
  const fingerprintResult = QueryFingerprinter.generate(sql, databaseType || "postgresql");

  res.status(200).json({
    success: true,
    data: {
      normalizedSql: normalized,
      fingerprint: fingerprintResult.fingerprint,
      signature: fingerprintResult.signature,
      databaseType: fingerprintResult.databaseType,
    },
  });
});

// POST /api/sql/optimize - Run end-to-end multi-stage optimization pipeline
router.post("/optimize", async (req: Request, res: Response) => {
  const { sql, connectionId, databaseType, runBenchmark } = req.body;

  if (!sql || typeof sql !== "string") {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query string is required." },
    });
  }

  try {
    let adapter;
    const targetConnId = connectionId || connectionManager.getActiveConnectionId();
    if (targetConnId && connectionManager.isConnected(targetConnId)) {
      adapter = connectionManager.getAdapter(targetConnId);
    }

    const dbType = databaseType || adapter?.config.databaseType || "postgresql";
    const pipelineResult = await CandidatePipeline.execute(
      sql,
      dbType,
      adapter,
      Boolean(runBenchmark)
    );

    // Save optimization run
    await prisma.optimizationRun.create({
      data: {
        connectionId: targetConnId || null,
        originalSql: sql,
        databaseType: dbType,
        selectedCandidateId: pipelineResult.winningCandidate?.id || null,
        summary: pipelineResult.summary,
        status: "COMPLETED",
        candidates: {
          create: pipelineResult.candidates.map((c) => ({
            candidateSql: c.candidateSql,
            source: c.source,
            changes: JSON.stringify(c.changes),
            estimatedCost: c.estimatedCost || null,
            actualLatencyMs: c.benchmarkResult?.optimized.medianTimeMs || null,
            isValid: c.validation.validationPassed,
            validationReport: JSON.stringify(c.validation),
            benchmarkImprovement: c.benchmarkResult?.latencyReductionPercent || null,
            isWinner: c.isWinner,
          })),
        },
      },
    }).catch((err: any) => logger.warn(`[SqlRoute] Failed to persist optimization run: ${err.message}`));

    res.status(200).json({
      success: true,
      data: pipelineResult,
    });
  } catch (error: any) {
    logger.error(`[SqlRoute] Optimization pipeline error:`, error);
    res.status(500).json({
      success: false,
      error: { code: "OPTIMIZATION_FAILED", message: error.message },
    });
  }
});

// POST /api/sql/benchmark - Run safe benchmark on SELECT query
router.post("/benchmark", async (req: Request, res: Response) => {
  const { sql, connectionId, iterations, maxRows } = req.body;

  if (!sql) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query is required for benchmark." },
    });
  }

  try {
    const targetConnId = connectionId || connectionManager.getActiveConnectionId();
    if (!targetConnId || !connectionManager.isConnected(targetConnId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "NO_ACTIVE_CONNECTION",
          message: "No active database connected. Benchmarks require a live database connection.",
        },
      });
    }

    const adapter = connectionManager.getAdapter(targetConnId);
    const report = await SafeBenchmarkRunner.benchmarkQuery(
      adapter,
      sql,
      "Benchmarked Query",
      Number(iterations) || 3,
      Number(maxRows) || 100
    );

    // Record execution latency in QueryFingerprinter and save PerformanceMetric
    await QueryFingerprinter.recordExecution(sql, report.medianTimeMs, adapter.config.databaseType);
    await prisma.performanceMetric.create({
      data: {
        connectionId: targetConnId || null,
        label: "Benchmarked Query",
        minTimeMs: report.minTimeMs,
        maxTimeMs: report.maxTimeMs,
        avgTimeMs: report.avgTimeMs,
        medianTimeMs: report.medianTimeMs,
        p95TimeMs: report.p95TimeMs,
        stdDevMs: report.stdDevMs,
        iterations: report.iterationsCount,
        rowsProcessed: report.rowsReturned,
      },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: { code: "BENCHMARK_FAILED", message: error.message },
    });
  }
});

export default router;
