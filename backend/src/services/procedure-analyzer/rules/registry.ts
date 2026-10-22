import { ProcedureParsedModel, ProcedureFinding, ProcedureRule } from "../types";

export class RuleRegistry {
  private static rules: ProcedureRule[] = [];

  public static register(rule: ProcedureRule): void {
    const existing = this.rules.find((r) => r.id === rule.id);
    if (!existing) {
      this.rules.push(rule);
    }
  }

  public static getAllRules(): ProcedureRule[] {
    return [...this.rules];
  }

  public static runAll(model: ProcedureParsedModel): ProcedureFinding[] {
    const findings: ProcedureFinding[] = [];
    for (const rule of this.rules) {
      try {
        const ruleFindings = rule.analyze(model);
        findings.push(...ruleFindings);
      } catch (err: any) {
        console.error(`Error running rule ${rule.id}:`, err);
      }
    }
    return findings;
  }
}
