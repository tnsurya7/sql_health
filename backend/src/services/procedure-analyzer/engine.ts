import { PlPgSqlParser } from "./parser";
import { RuleRegistry } from "./rules/registry";
import { registerAllRules } from "./rules/sp-rules";
import { ProcedureAnalysisReport, ProcedureFinding } from "./types";

// Ensure rules are registered
registerAllRules();

export class ProcedureAnalyzer {
  public static analyzeProcedure(
    definition: string,
    overrideName?: string,
    overrideSchema?: string
  ): ProcedureAnalysisReport {
    if (!definition || typeof definition !== "string" || definition.trim() === "") {
      throw new Error("Stored procedure definition is required for static analysis.");
    }

    const model = PlPgSqlParser.parse(definition);
    if (overrideName) model.name = overrideName;
    if (overrideSchema) model.schema = overrideSchema;

    const findings = RuleRegistry.runAll(model);

    // Compute metrics
    const lines = definition.split("\n").filter((l) => l.trim().length > 0);
    const linesOfCode = lines.length;

    let scorePerf = 100;
    let scoreSec = 100;
    let scoreMaint = 100;
    let scoreRel = 100;

    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let info = 0;

    for (const f of findings) {
      let penalty = 0;
      switch (f.severity) {
        case "CRITICAL":
          penalty = 25;
          critical++;
          break;
        case "HIGH":
          penalty = 15;
          high++;
          break;
        case "MEDIUM":
          penalty = 8;
          medium++;
          break;
        case "LOW":
          penalty = 3;
          low++;
          break;
        case "INFO":
          penalty = 1;
          info++;
          break;
      }

      switch (f.category) {
        case "Performance":
          scorePerf = Math.max(0, scorePerf - penalty);
          break;
        case "Security":
          scoreSec = Math.max(0, scoreSec - penalty);
          break;
        case "Maintainability":
          scoreMaint = Math.max(0, scoreMaint - penalty);
          break;
        case "Reliability":
        case "Bug Risk":
          scoreRel = Math.max(0, scoreRel - penalty);
          break;
      }
    }

    const overall = Math.round((scorePerf * 0.25) + (scoreSec * 0.35) + (scoreMaint * 0.2) + (scoreRel * 0.2));

    let riskLevel: ProcedureAnalysisReport["summary"]["riskLevel"] = "CLEAN";
    if (critical > 0) riskLevel = "CRITICAL";
    else if (high > 0) riskLevel = "HIGH";
    else if (medium > 0) riskLevel = "MEDIUM";
    else if (low > 0) riskLevel = "LOW";

    const paramSignature = model.parameters.map((p) => `${p.name} ${p.dataType}`).join(", ");
    const signature = `${model.name}(${paramSignature})`;

    return {
      procedureName: model.name,
      schema: model.schema,
      signature,
      language: model.language,
      linesOfCode,
      cyclomaticComplexity: model.cyclomaticComplexity,
      findings,
      scores: {
        overall,
        performance: scorePerf,
        security: scoreSec,
        maintainability: scoreMaint,
        reliability: scoreRel,
      },
      summary: {
        totalFindings: findings.length,
        critical,
        high,
        medium,
        low,
        info,
        riskLevel,
      },
      analyzedAt: new Date().toISOString(),
    };
  }

  public static batchAnalyze(procedures: Array<{ name: string; definition: string; schema?: string }>) {
    const reports: ProcedureAnalysisReport[] = [];
    let totalFindings = 0;
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const p of procedures) {
      try {
        const rep = this.analyzeProcedure(p.definition, p.name, p.schema);
        reports.push(rep);
        totalFindings += rep.summary.totalFindings;
        critical += rep.summary.critical;
        high += rep.summary.high;
        medium += rep.summary.medium;
        low += rep.summary.low;
      } catch (err: any) {
        console.warn(`[ProcedureAnalyzer] Failed to analyze ${p.name}:`, err.message);
      }
    }

    const cleanCount = reports.filter((r) => r.findings.length === 0).length;
    const reviewCount = reports.filter((r) => r.findings.length > 0).length;

    // Highest risk procedures
    const highestRisk = [...reports]
      .sort((a, b) => a.scores.overall - b.scores.overall)
      .slice(0, 5)
      .map((r) => ({
        name: r.procedureName,
        schema: r.schema,
        score: r.scores.overall,
        riskLevel: r.summary.riskLevel,
        totalFindings: r.summary.totalFindings,
        topFinding: r.findings[0]?.title || "None",
      }));

    return {
      totalAnalyzed: reports.length,
      totalFindings,
      findingsBySeverity: { critical, high, medium, low },
      cleanProceduresCount: cleanCount,
      requiringReviewCount: reviewCount,
      highestRiskProcedures: highestRisk,
      reports,
    };
  }
}
