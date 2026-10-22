import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

// Helper to calculate score based on simple text heuristics
function runStaticCodeCheck(
  code: string,
  rules: { regex: RegExp; penalty: number; title: string; category: string; description: string }[]
) {
  const issues: any[] = [];
  let scorePerf = 100;
  let scoreSec = 100;
  let scoreMaint = 100;

  rules.forEach((rule) => {
    if (rule.regex.test(code)) {
      issues.push({
        title: rule.title,
        description: rule.description,
        evidence: code.match(rule.regex)?.[0] || "Detected pattern",
      });

      if (rule.category === "Performance") scorePerf -= rule.penalty;
      else if (rule.category === "Security") scoreSec -= rule.penalty;
      else if (rule.category === "Maintainability") scoreMaint -= rule.penalty;
    }
  });

  return {
    scorePerf: Math.max(10, scorePerf),
    scoreSec: Math.max(10, scoreSec),
    scoreMaint: Math.max(10, scoreMaint),
    overall: Math.round((scorePerf + scoreSec + scoreMaint) / 3),
    issues,
  };
}

// ---------------------------------------------------------------------------
import { ProcedureAnalyzer } from "../services/procedure-analyzer/engine";
import { connectionManager } from "../database/connection-manager";

// Handlers
// ---------------------------------------------------------------------------

export const handleAnalyzeProcedure = async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition, schema } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Procedure definition is required." },
    });
  }

  try {
    const report = ProcedureAnalyzer.analyzeProcedure(definition, name, schema);
    res.status(200).json({
      success: true,
      data: {
        name: report.procedureName,
        signature: report.signature,
        schema: report.schema,
        language: report.language,
        linesOfCode: report.linesOfCode,
        cyclomaticComplexity: report.cyclomaticComplexity,
        scores: report.scores,
        summary: report.summary,
        findings: report.findings,
        issues: report.findings.map((f) => ({
          title: f.title,
          category: f.category,
          severity: f.severity,
          description: f.explanation,
          evidence: f.snippet,
          recommendation: f.recommendedFix,
          ruleId: f.ruleId,
          confidence: f.confidence,
          whyItMatters: f.whyItMatters,
          safeExample: f.safeExample,
          position: f.position,
        })),
        recommendations: report.findings.map((f) => f.recommendedFix),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "PROCEDURE_ANALYSIS_ERROR", message: err.message },
    });
  }
};

export const handleGetProcedureQualitySummary = async (req: AuthenticatedRequest, res: Response) => {
  const connectionId = (req.query.connectionId as string) || connectionManager.getActiveConnectionId();

  if (!connectionId || !connectionManager.isConnected(connectionId)) {
    return res.status(200).json({
      success: true,
      data: {
        isConnected: false,
        totalAnalyzed: 0,
        totalFindings: 0,
        findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        cleanProceduresCount: 0,
        requiringReviewCount: 0,
        highestRiskProcedures: [],
        procedures: [],
      },
    });
  }

  try {
    const adapter = connectionManager.getAdapter(connectionId);
    const procs = await adapter.getProcedures().catch(() => []);
    const validProcs = procs.filter((p) => Boolean(p.definition));

    const batch = ProcedureAnalyzer.batchAnalyze(
      validProcs.map((p) => ({
        name: p.name,
        definition: p.definition!,
        schema: p.schema,
      }))
    );

    res.status(200).json({
      success: true,
      data: {
        isConnected: true,
        ...batch,
        procedures: procs.map((p) => ({
          name: p.name,
          schema: p.schema,
          language: p.language,
          hasDefinition: Boolean(p.definition),
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { code: "SUMMARY_FETCH_ERROR", message: err.message },
    });
  }
};

export const handleAnalyzeView = async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "View definition is required." },
    });
  }

  const rules = [
    {
      regex: /\bSELECT\s+\*\b/i,
      penalty: 15,
      title: "SELECT * in View",
      category: "Maintainability",
      description: "Views with SELECT * do not update automatically when underlying table columns change.",
    },
    {
      regex: /\bJOIN\b/i,
      penalty: 5,
      title: "Multiple Joins",
      category: "Performance",
      description: "Views joining multiple large tables can have bad performance on nested filters.",
    },
  ];

  const analysis = runStaticCodeCheck(definition, rules);

  res.status(200).json({
    success: true,
    data: {
      name: name || "Unnamed View",
      scores: {
        performance: analysis.scorePerf,
        security: analysis.scoreSec,
        maintainability: analysis.scoreMaint,
        overall: analysis.overall,
      },
      issues: analysis.issues,
    },
  });
};

export const handleAnalyzeFunction = async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Function definition is required." },
    });
  }

  const rules = [
    {
      regex: /\bRETURNS\s+TABLE\b/i,
      penalty: 0,
      title: "Inline Table Function",
      category: "Performance",
      description: "Inline table-valued functions are highly optimizable by the engine.",
    },
  ];

  const analysis = runStaticCodeCheck(definition, rules);

  res.status(200).json({
    success: true,
    data: {
      name: name || "Unnamed Function",
      scores: {
        performance: analysis.scorePerf,
        security: analysis.scoreSec,
        maintainability: analysis.scoreMaint,
        overall: analysis.overall,
      },
      issues: analysis.issues,
    },
  });
};

export const handleAnalyzeTrigger = async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Trigger definition is required." },
    });
  }

  const rules = [
    {
      regex: /\bUPDATE\b/i,
      penalty: 10,
      title: "Cascade Writes (UPDATE)",
      category: "Performance",
      description: "Triggers that update other tables introduce hidden side effects and lock overhead.",
    },
    {
      regex: /\bDELETE\b/i,
      penalty: 10,
      title: "Cascade Deletes (DELETE)",
      category: "Performance",
      description: "Triggers cascade deletes procedurally rather than using DB constraints.",
    },
  ];

  const analysis = runStaticCodeCheck(definition, rules);

  res.status(200).json({
    success: true,
    data: {
      name: name || "Unnamed Trigger",
      scores: {
        performance: analysis.scorePerf,
        security: analysis.scoreSec,
        maintainability: analysis.scoreMaint,
        overall: analysis.overall,
      },
      issues: analysis.issues,
      hiddenWorkloadSeverity: analysis.issues.length > 0 ? "HIGH" : "LOW",
    },
  });
};

// ---------------------------------------------------------------------------
// Dedicated Routers for specific mounts
// ---------------------------------------------------------------------------

export const proceduresRouter = Router();
proceduresRouter.post("/analyze", authMiddleware, handleAnalyzeProcedure);
proceduresRouter.post("/", authMiddleware, handleAnalyzeProcedure);
proceduresRouter.get("/summary", authMiddleware, handleGetProcedureQualitySummary);
proceduresRouter.post("/batch-analyze", authMiddleware, handleGetProcedureQualitySummary);

export const viewsRouter = Router();
viewsRouter.post("/analyze", authMiddleware, handleAnalyzeView);
viewsRouter.post("/", authMiddleware, handleAnalyzeView);

export const functionsRouter = Router();
functionsRouter.post("/analyze", authMiddleware, handleAnalyzeFunction);
functionsRouter.post("/", authMiddleware, handleAnalyzeFunction);

export const triggersRouter = Router();
triggersRouter.post("/analyze", authMiddleware, handleAnalyzeTrigger);
triggersRouter.post("/", authMiddleware, handleAnalyzeTrigger);

// ---------------------------------------------------------------------------
// Unified Router
// ---------------------------------------------------------------------------

const router = Router();
router.post("/procedures/analyze", authMiddleware, handleAnalyzeProcedure);
router.post("/views/analyze", authMiddleware, handleAnalyzeView);
router.post("/functions/analyze", authMiddleware, handleAnalyzeFunction);
router.post("/triggers/analyze", authMiddleware, handleAnalyzeTrigger);

export default router;
