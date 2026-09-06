import { Router, Response } from "express";
import { prisma } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { RuleEngine } from "../services/rule-engine";
import { GeminiService } from "../services/gemini";
import { ExecutionPlanAnalyzer } from "../services/execution-plan";
import { PerformanceService } from "../services/performance";
import { connectionManager } from "../database/connection-manager";

const router = Router();

// Analyze SQL
router.post("/analyze", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { sql, connectionId } = req.body;
  if (!sql) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query string is required." }
    });
  }

  try {
    // 1. Run local rule engine
    const issues = RuleEngine.analyze(sql);

    // 2. Score calculations (deterministic)
    let scorePerf = 100;
    let scoreSec = 100;
    let scoreMaint = 100;
    let scoreOpt = 100;

    issues.forEach(issue => {
      let penalty = 0;
      if (issue.severity === "CRITICAL") penalty = 25;
      else if (issue.severity === "HIGH") penalty = 15;
      else if (issue.severity === "MEDIUM") penalty = 8;
      else if (issue.severity === "LOW") penalty = 3;

      if (issue.category === "Performance") {
        scorePerf -= penalty;
        scoreOpt -= penalty * 0.8;
      } else if (issue.category === "Security") {
        scoreSec -= penalty;
      } else if (issue.category === "Maintainability") {
        scoreMaint -= penalty;
      }
    });

    scorePerf = Math.max(10, Math.min(100, scorePerf));
    scoreSec = Math.max(10, Math.min(100, scoreSec));
    scoreMaint = Math.max(10, Math.min(100, scoreMaint));
    scoreOpt = Math.max(10, Math.min(100, scoreOpt));
    const scoreOver = Math.round((scorePerf + scoreSec + scoreMaint + scoreOpt) / 4);

    // 3. Try to explain if connectionId provided
    let executionPlan = null;
    let dbError = null;

    if (connectionId) {
      const dbConn = await prisma.databaseConnection.findUnique({ where: { id: connectionId } });
      if (dbConn) {
        try {
          const pool = await connectionManager.getPool(dbConn);
          const explainRes = await ExecutionPlanAnalyzer.explain(pool, sql);
          executionPlan = explainRes;
        } catch (err: any) {
          dbError = err.message;
        }
      }
    }

    // 4. Save Query to history database
    const dbQuery = await prisma.sqlQuery.create({
      data: {
        connectionId: connectionId || null,
        rawSql: sql,
        score: scoreOver
      }
    });

    const dbAnalysis = await prisma.queryAnalysis.create({
      data: {
        queryId: dbQuery.id,
        summary: `Analysis computed ${issues.length} deterministic issues.`,
        scorePerf,
        scoreSec,
        scoreMaint,
        scoreOpt,
        scoreOver
      }
    });

    for (const issue of issues) {
      await prisma.queryIssue.create({
        data: {
          analysisId: dbAnalysis.id,
          ruleId: issue.id,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          category: issue.category,
          evidence: issue.evidence,
          recommendation: issue.recommendation,
          confidence: issue.confidence
        }
      });
    }

    if (executionPlan) {
      await prisma.executionPlan.create({
        data: {
          analysisId: dbAnalysis.id,
          planJson: JSON.stringify(executionPlan.rawJson),
          planningTime: executionPlan.planningTime,
          executionTime: executionPlan.executionTime
        }
      });
    }

    await prisma.queryHistory.create({
      data: {
        queryId: dbQuery.id,
        status: "ANALYZED"
      }
    });

    res.status(200).json({
      success: true,
      data: {
        queryId: dbQuery.id,
        scores: {
          performance: scorePerf,
          security: scoreSec,
          maintainability: scoreMaint,
          optimization: scoreOpt,
          overall: scoreOver
        },
        issues,
        executionPlan,
        dbError
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "ANALYZE_FAILED", message: error.message }
    });
  }
});

// Explain SQL (plain English explanation)
router.post("/explain", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { sql } = req.body;
  if (!sql) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query string is required." }
    });
  }

  try {
    const explanation = await GeminiService.explainQuery(sql);
    res.status(200).json({ success: true, data: { explanation } });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "EXPLAIN_FAILED", message: error.message }
    });
  }
});

// Optimize SQL (AI suggestions)
router.post("/optimize", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { sql, connectionId } = req.body;
  if (!sql) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL query string is required." }
    });
  }

  try {
    let schemaContext = "";
    if (connectionId) {
      const metadata = await prisma.databaseMetadata.findFirst({
        where: { connectionId },
        include: { tables: { include: { columns: true, indexes: true } } }
      });
      if (metadata) {
        schemaContext = JSON.stringify(metadata.tables.map(t => ({
          table: t.tableName,
          columns: t.columns.map(c => `${c.columnName} (${c.dataType})`),
          indexes: t.indexes.map(i => i.indexName)
        })));
      }
    }

    const optimization = await GeminiService.optimizeQuery(sql, "PostgreSQL", schemaContext);

    // Save optimization result to SQLQuery
    const dbQuery = await prisma.sqlQuery.findFirst({
      where: { rawSql: sql },
      orderBy: { createdAt: "desc" }
    });

    if (dbQuery) {
      await prisma.optimizationResult.create({
        data: {
          queryId: dbQuery.id,
          optimizedSql: optimization.optimizedSql,
          aiExplanation: optimization.summary,
          risks: optimization.risks,
          confidence: optimization.confidence
        }
      });

      await prisma.queryHistory.create({
        data: {
          queryId: dbQuery.id,
          status: "OPTIMIZED"
        }
      });
    }

    res.status(200).json({ success: true, data: optimization });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "OPTIMIZE_FAILED", message: error.message }
    });
  }
});

// Benchmark SQL
router.post("/benchmark", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { sql, connectionId, iterations, warmup } = req.body;
  if (!sql || !connectionId) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "SQL and connectionId are required." }
    });
  }

  try {
    const dbConn = await prisma.databaseConnection.findUnique({ where: { id: connectionId } });
    if (!dbConn) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Database connection not found." }
      });
    }

    const pool = await connectionManager.getPool(dbConn);
    const result = await PerformanceService.benchmark(pool, sql, iterations ? Number(iterations) : 5, warmup !== false);

    // Log benchmark
    const dbQuery = await prisma.sqlQuery.findFirst({
      where: { rawSql: sql },
      orderBy: { createdAt: "desc" }
    });

    if (dbQuery) {
      await prisma.performanceMetric.create({
        data: {
          connectionId,
          queryId: dbQuery.id,
          label: "Original",
          minTimeMs: result.minTimeMs,
          maxTimeMs: result.maxTimeMs,
          avgTimeMs: result.avgTimeMs,
          medianTimeMs: result.medianTimeMs,
          iterations: result.iterations
        }
      });

      await prisma.queryHistory.create({
        data: {
          queryId: dbQuery.id,
          status: "BENCHMARKED"
        }
      });
    }

    res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "BENCHMARK_FAILED", message: error.message }
    });
  }
});

export default router;
