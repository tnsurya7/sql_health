import { ProcedureAnalyzer } from "../services/procedure-analyzer/engine";

describe("Dashboard Drilldown & Procedure Quality Contract", () => {
  it("should calculate correct batch procedure metrics with risk levels", () => {
    const procs = [
      {
        name: "clean_procedure",
        schema: "public",
        definition: `
          CREATE OR REPLACE PROCEDURE clean_procedure(p_id INT)
          LANGUAGE plpgsql AS $$
          BEGIN
              UPDATE employees SET salary = salary * 1.05 WHERE id = p_id;
          END;
          $$;
        `,
      },
      {
        name: "risky_procedure",
        schema: "public",
        definition: `
          CREATE OR REPLACE PROCEDURE risky_procedure()
          LANGUAGE plpgsql AS $$
          BEGIN
              -- Unsafe update without WHERE clause
              UPDATE employees SET salary = 0;
          END;
          $$;
        `,
      },
    ];

    const batch = ProcedureAnalyzer.batchAnalyze(procs);

    expect(batch.totalAnalyzed).toBe(2);
    expect(batch.cleanProceduresCount).toBe(1);
    expect(batch.requiringReviewCount).toBe(1);
    expect(batch.findingsBySeverity.critical).toBeGreaterThanOrEqual(1);
    expect(batch.highestRiskProcedures.length).toBe(2);
    expect(batch.highestRiskProcedures[0].name).toBe("risky_procedure");
    expect(batch.highestRiskProcedures[0].riskLevel).toBe("CRITICAL");
  });

  it("should return zeroed metrics when procedure list is empty", () => {
    const batch = ProcedureAnalyzer.batchAnalyze([]);
    expect(batch.totalAnalyzed).toBe(0);
    expect(batch.totalFindings).toBe(0);
    expect(batch.cleanProceduresCount).toBe(0);
    expect(batch.requiringReviewCount).toBe(0);
    expect(batch.highestRiskProcedures).toEqual([]);
  });
});
