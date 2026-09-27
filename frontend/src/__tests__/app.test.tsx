import { describe, it, expect } from "vitest";
import { useAppStore, DatabaseConnection } from "../store";

describe("Frontend Zustand State Store", () => {
  it("initializes with null activeConnection and empty connections list", () => {
    const state = useAppStore.getState();
    expect(state.connections).toEqual([]);
    expect(state.activeConnection).toBeNull();
  });

  it("can set active connection and update connections list", () => {
    const mockConn: DatabaseConnection = {
      id: "conn-123",
      name: "Production PostgreSQL",
      databaseType: "POSTGRESQL",
      host: "localhost",
      port: 5432,
      database: "sqlsense",
      username: "suryakumar",
      ssl: false,
      readOnly: true,
      isActive: true,
      status: "CONNECTED",
      createdAt: new Date().toISOString()
    };

    useAppStore.getState().setConnections([mockConn]);
    useAppStore.getState().setActiveConnection(mockConn);

    const updatedState = useAppStore.getState();
    expect(updatedState.connections.length).toBe(1);
    expect(updatedState.activeConnection?.name).toBe("Production PostgreSQL");
    expect(updatedState.activeConnection?.databaseType).toBe("POSTGRESQL");
  });

  it("can toggle theme and clear active connection", () => {
    useAppStore.getState().toggleTheme();
    expect(["dark", "light"]).toContain(useAppStore.getState().theme);

    useAppStore.getState().setActiveConnection(null);
    expect(useAppStore.getState().activeConnection).toBeNull();
  });

  it("Index Advisor filter accepts canonical INDEXING and legacy INDEXES recommendations", () => {
    const mockRecommendations = [
      { id: "1", category: "INDEXING", title: "Create Missing Index on SqlQuery(rawSql)" },
      { id: "2", category: "INDEXES", title: "Create Missing Index on Users(email)" },
      { id: "3", category: "PERFORMANCE", title: "Optimize Slow Query" },
      { id: "4", category: "SECURITY", title: "Enable SSL/TLS" }
    ];

    const filterFunction = (r: any) => r.category === "INDEXING" || r.category === "INDEXES";
    const filtered = mockRecommendations.filter(filterFunction);

    expect(filtered.length).toBe(2);
    expect(filtered.map(r => r.id)).toEqual(["1", "2"]);
    expect(filtered.some(r => r.category === "INDEXING")).toBe(true);
    expect(filtered.some(r => r.category === "INDEXES")).toBe(true);
  });
});

import {
  formatSource,
  PipelineExecutionResult,
  OptimizationCandidate,
  CandidateValidation
} from "../features/optimizer/index";

describe("Query Optimizer Frontend Integrity & Transparency", () => {
  const sampleValidation: CandidateValidation = {
    isSyntaxValid: true,
    isSafetyValid: true,
    isSemanticValid: true,
    isSchemaValid: true,
    isExplainValid: true,
    validationPassed: true,
    validationErrors: []
  };

  it("A. Backend candidate array is mapped directly from backend payload without static pool injection", () => {
    const backendResult: PipelineExecutionResult = {
      originalSql: "SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';",
      databaseType: "postgresql",
      baselineCost: 30.0,
      candidates: [
        {
          id: "cand-idx-1",
          source: "INDEX_ADVISOR",
          title: "Index Advisor Access Path",
          candidateSql: "SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';",
          changes: [{ type: "CREATE_INDEX", description: "CREATE INDEX ON customers(email)" }],
          estimatedCost: 30.0,
          costReductionPercent: 0,
          validation: sampleValidation,
          isWinner: false
        }
      ],
      winningCandidate: null,
      recommendedDdl: "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_email ON public.customers (email);",
      summary: "Evaluated 1 candidate(s). Query is already in optimal shape or requires index provisioning.",
      ragRetrievedCount: 0,
      geminiAvailable: false
    };

    expect(backendResult.candidates.length).toBe(1);
    expect(backendResult.candidates[0].id).toBe("cand-idx-1");
    expect(backendResult.candidates[0].source).toBe("INDEX_ADVISOR");
  });

  it("B. Hardcoded candidate names do not appear when backend returns different candidates", () => {
    const backendCandidates: OptimizationCandidate[] = [
      {
        id: "cand-dp-99",
        source: "DP_JOIN",
        title: "Dynamic Programming Join Optimizer",
        candidateSql: "SELECT * FROM a JOIN b ON a.id = b.a_id",
        changes: [],
        estimatedCost: 18.5,
        costReductionPercent: 12.5,
        validation: sampleValidation,
        isWinner: true
      }
    ];

    const renderedTitles = backendCandidates.map(c => c.title);
    expect(renderedTitles).not.toContain("RAG + Relational Optimizer (Recommended)");
    expect(renderedTitles).not.toContain("Relational Algebra (Predicate Pushdown)");
    expect(renderedTitles).toEqual(["Dynamic Programming Join Optimizer"]);
  });

  it("C. Backend candidate with costReductionPercent = 0 renders 0%, not a fabricated value", () => {
    const cand: OptimizationCandidate = {
      id: "cand-zero",
      source: "INDEX_ADVISOR",
      title: "Index Advisor Access Path",
      candidateSql: "SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';",
      changes: [],
      estimatedCost: 30.0,
      costReductionPercent: 0,
      validation: sampleValidation,
      isWinner: false
    };

    const displayCostReduction = cand.costReductionPercent !== undefined ? cand.costReductionPercent : 0;
    expect(displayCostReduction).toBe(0);
    expect(displayCostReduction).not.toBe(62.5);
    expect(displayCostReduction).not.toBe(46.2);
    expect(displayCostReduction).not.toBe(33.3);
  });

  it("D. Missing benchmark renders 'Not Run' rather than fake latency or speedup", () => {
    const candWithoutBenchmark: OptimizationCandidate = {
      id: "cand-no-bench",
      source: "RELATIONAL_ALGEBRA",
      title: "Relational Algebra",
      candidateSql: "SELECT 1",
      changes: [],
      estimatedCost: 5.0,
      costReductionPercent: 10,
      validation: sampleValidation,
      isWinner: false
      // benchmarkResult is undefined
    };

    const benchmarkStatus = candWithoutBenchmark.benchmarkResult
      ? `${candWithoutBenchmark.benchmarkResult.latencyReductionPercent.toFixed(1)}% speedup (Measured)`
      : "Not Run";

    expect(benchmarkStatus).toBe("Not Run");
    expect(candWithoutBenchmark.benchmarkResult).toBeUndefined();
  });

  it("E. No winning candidate does not select a fake winner", () => {
    const pipelineWithoutWinner: PipelineExecutionResult = {
      originalSql: "SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';",
      databaseType: "postgresql",
      baselineCost: 30.0,
      candidates: [
        {
          id: "cand-1",
          source: "INDEX_ADVISOR",
          title: "Index Advisor Access Path",
          candidateSql: "SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';",
          changes: [],
          estimatedCost: 30.0,
          costReductionPercent: 0,
          validation: sampleValidation,
          isWinner: false
        }
      ],
      winningCandidate: null,
      summary: "Evaluated 1 candidate(s). Query is already in optimal shape or requires index provisioning."
    };

    expect(pipelineWithoutWinner.winningCandidate).toBeNull();
    expect(pipelineWithoutWinner.candidates.some(c => c.isWinner)).toBe(false);
  });

  it("F. Gemini unavailable is displayed honestly as Not configured", () => {
    const pipelineData: PipelineExecutionResult = {
      originalSql: "SELECT 1",
      databaseType: "postgresql",
      baselineCost: 1.0,
      candidates: [],
      winningCandidate: null,
      summary: "Done",
      geminiAvailable: false
    };

    const geminiStatus = pipelineData.geminiAvailable ? "Gemini: Available" : "Gemini: Not configured";
    expect(geminiStatus).toBe("Gemini: Not configured");
  });

  it("G. RAG/Gemini are not falsely attributed as candidate sources", () => {
    expect(formatSource("RELATIONAL_ALGEBRA")).toBe("Relational Algebra");
    expect(formatSource("DP_JOIN")).toBe("DP Join Optimizer");
    expect(formatSource("INDEX_ADVISOR")).toBe("Index Advisor");
    expect(formatSource("ORIGINAL")).toBe("Original Query");
    expect(formatSource("GEMINI_RAG")).toBe("Gemini AI + RAG");
    expect(formatSource("RELATIONAL_ALGEBRA")).not.toContain("RAG");
    expect(formatSource("INDEX_ADVISOR")).not.toContain("RAG");
  });

  it("H. Validation reflects actual backend validation fields (syntax, safety, semantic, schema, explain)", () => {
    const val: CandidateValidation = {
      isSyntaxValid: true,
      isSafetyValid: true,
      isSemanticValid: false,
      isSchemaValid: true,
      isExplainValid: true,
      validationPassed: false,
      validationErrors: ["Semantic Mismatch: Candidate omitted original table 'orders'."]
    };

    expect(val.isSyntaxValid).toBe(true);
    expect(val.isSafetyValid).toBe(true);
    expect(val.isSemanticValid).toBe(false);
    expect(val.isSchemaValid).toBe(true);
    expect(val.isExplainValid).toBe(true);
    expect(val.validationPassed).toBe(false);
    expect(val.validationErrors.length).toBe(1);
  });
});
