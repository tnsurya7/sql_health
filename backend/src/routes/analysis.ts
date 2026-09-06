import { Router, Response } from "express";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { GeminiService } from "../services/gemini";

const router = Router();

// Helper to calculate score based on simple text heuristics
function runStaticCodeCheck(code: string, rules: { regex: RegExp; penalty: number; title: string; category: string; description: string }[]) {
  const issues: any[] = [];
  let scorePerf = 100;
  let scoreSec = 100;
  let scoreMaint = 100;

  rules.forEach(rule => {
    if (rule.regex.test(code)) {
      issues.push({
        title: rule.title,
        description: rule.description,
        evidence: code.match(rule.regex)?.[0] || "Detected pattern"
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
    issues
  };
}

// Analyze Stored Procedure
router.post("/procedures/analyze", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Procedure definition is required." }
    });
  }

  const rules = [
    { regex: /\bDECLARE\s+\w+\s+CURSOR\b/i, penalty: 15, title: "Cursor usage", category: "Performance", description: "Procedural cursors can be refactored to set-based operations." },
    { regex: /\bEXEC(?:UTE)?\s*\(/i, penalty: 20, title: "Dynamic SQL execution", category: "Security", description: "Dynamic SQL poses security and plan cache reuse issues." },
    { regex: /\bSELECT\s+\*\b/i, penalty: 10, title: "SELECT * Usage", category: "Performance", description: "Avoid SELECT * in stored procedures to prevent future schema compilation errors." },
    { regex: /\bEXCEPTION\b/i, penalty: -5, title: "Good Error Handling", category: "Maintainability", description: "Found EXCEPTION block." } // negative penalty means bonus!
  ];

  const analysis = runStaticCodeCheck(definition, rules);

  res.status(200).json({
    success: true,
    data: {
      name: name || "Unnamed Procedure",
      scores: {
        performance: analysis.scorePerf,
        security: analysis.scoreSec,
        maintainability: analysis.scoreMaint,
        overall: analysis.overall
      },
      issues: analysis.issues,
      recommendations: analysis.issues.map((i: any) => `Refactor procedure to resolve: ${i.title}`)
    }
  });
});

// Analyze View
router.post("/views/analyze", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "View definition is required." }
    });
  }

  const rules = [
    { regex: /\bSELECT\s+\*\b/i, penalty: 15, title: "SELECT * in View", category: "Maintainability", description: "Views with SELECT * do not update automatically when underlying table columns change." },
    { regex: /\bJOIN\b/i, penalty: 5, title: "Multiple Joins", category: "Performance", description: "Views joining multiple large tables can have bad performance on nested filters." }
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
        overall: analysis.overall
      },
      issues: analysis.issues
    }
  });
});

// Analyze Function
router.post("/functions/analyze", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Function definition is required." }
    });
  }

  const rules = [
    { regex: /\bRETURNS\s+TABLE\b/i, penalty: 0, title: "Inline Table Function", category: "Performance", description: "Inline table-valued functions are highly optimizable by the engine." }
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
        overall: analysis.overall
      },
      issues: analysis.issues
    }
  });
});

// Analyze Trigger
router.post("/triggers/analyze", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { name, definition } = req.body;
  if (!definition) {
    return res.status(400).json({
      success: false,
      error: { code: "BAD_REQUEST", message: "Trigger definition is required." }
    });
  }

  const rules = [
    { regex: /\bUPDATE\b/i, penalty: 10, title: "Cascade Writes (UPDATE)", category: "Performance", description: "Triggers that update other tables introduce hidden side effects and lock overhead." },
    { regex: /\bDELETE\b/i, penalty: 10, title: "Cascade Deletes (DELETE)", category: "Performance", description: "Triggers cascade deletes procedurally rather than using DB constraints." }
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
        overall: analysis.overall
      },
      issues: analysis.issues,
      hiddenWorkloadSeverity: analysis.issues.length > 0 ? "HIGH" : "LOW"
    }
  });
});

export default router;
