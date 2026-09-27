import React, { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { GlassCard, PageHeader } from "../../components/UI";
import {
  Sparkles,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  XCircle,
  Layers,
  Zap,
  TrendingDown,
  Cpu,
  Bot,
  BookOpen,
  Check,
  Clock,
  Gauge
} from "lucide-react";
import { useAppStore } from "../../store";

export interface CandidateValidation {
  isSyntaxValid: boolean;
  isSafetyValid: boolean;
  isSemanticValid: boolean;
  isSchemaValid: boolean;
  isExplainValid: boolean;
  validationPassed: boolean;
  validationErrors: string[];
}

export interface BenchmarkComparison {
  baseline: {
    iterations: number;
    minTimeMs: number;
    maxTimeMs: number;
    avgTimeMs: number;
    medianTimeMs: number;
  };
  optimized: {
    iterations: number;
    minTimeMs: number;
    maxTimeMs: number;
    avgTimeMs: number;
    medianTimeMs: number;
  };
  latencyReductionPercent: number;
  speedupFactor: number;
}

export interface OptimizationCandidate {
  id: string;
  source: "RELATIONAL_ALGEBRA" | "DP_JOIN" | "INDEX_ADVISOR" | "GEMINI_RAG" | "ORIGINAL" | string;
  title: string;
  candidateSql: string;
  changes: Array<{ type: string; description: string }>;
  estimatedCost?: number;
  costReductionPercent?: number;
  validation: CandidateValidation;
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

export const formatSource = (source: string): string => {
  switch (source) {
    case "RELATIONAL_ALGEBRA":
      return "Relational Algebra";
    case "DP_JOIN":
      return "DP Join Optimizer";
    case "INDEX_ADVISOR":
      return "Index Advisor";
    case "GEMINI_RAG":
    case "GEMINI":
      return "Gemini AI + RAG";
    case "ORIGINAL":
      return "Original Query";
    default:
      return source;
  }
};

export const QueryOptimizer: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [originalSql, setOriginalSql] = useState("SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';");
  const [selectedCandidate, setSelectedCandidate] = useState<OptimizationCandidate | null>(null);
  const [loading, setLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineExecutionResult | null>(null);

  const runOptimization = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sql/optimize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          sql: originalSql,
          connectionId: activeConnection?.id || null
        })
      });
      const json = await res.json();
      if (json.success && json.data) {
        const data: PipelineExecutionResult = json.data;
        setPipelineResult(data);
        if (data.winningCandidate) {
          setSelectedCandidate(data.winningCandidate);
        } else if (data.candidates && data.candidates.length > 0) {
          setSelectedCandidate(data.candidates[0]);
        } else {
          setSelectedCandidate(null);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCandidate = (candidate: OptimizationCandidate) => {
    setSelectedCandidate(candidate);
  };

  const candidates = pipelineResult?.candidates || [];
  const selectedCandidateSql = selectedCandidate ? selectedCandidate.candidateSql : originalSql;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Algorithmic & AI Query Optimizer"
        subtitle="Multi-candidate transformation pipeline combining Relational Algebra, DP Join Optimizer, Cost-Based Evaluator, RAG Knowledge, and Gemini Structured Generation."
      />

      {/* Input SQL & Action Bar */}
      <GlassCard className="p-4 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-zinc-400 flex items-center gap-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            Input Query for Candidate Optimization
          </span>
          <button
            onClick={runOptimization}
            disabled={loading}
            className="px-5 py-2 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {loading ? "Generating Candidates..." : "Run Optimization Pipeline"}
          </button>
        </div>
        <textarea
          value={originalSql}
          onChange={(e) => setOriginalSql(e.target.value)}
          className="w-full h-24 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 font-mono focus:border-cyan-500 outline-none resize-none"
        />
      </GlassCard>

      {/* Pipeline Status & AI/RAG Transparency */}
      {pipelineResult && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <GlassCard className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">PostgreSQL Baseline Cost</span>
              <Gauge className="w-4 h-4 text-zinc-400" />
            </div>
            <p className="text-lg font-mono font-bold text-white mt-1">
              {pipelineResult.baselineCost !== undefined ? pipelineResult.baselineCost.toFixed(2) : "N/A"}
            </p>
          </GlassCard>

          <GlassCard className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Evaluated Candidates</span>
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-lg font-mono font-bold text-cyan-300 mt-1">
              {candidates.length}
            </p>
          </GlassCard>

          <GlassCard className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">Knowledge Retrieval</span>
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-xs font-medium text-zinc-300 mt-1">
              RAG documents retrieved: <span className="font-mono font-bold text-indigo-300">{pipelineResult.ragRetrievedCount ?? 0}</span>
            </p>
          </GlassCard>

          <GlassCard className="p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">AI Candidate Generation</span>
              <Bot className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-xs font-medium text-zinc-300 mt-1">
              {pipelineResult.geminiAvailable ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Gemini: Available
                </span>
              ) : (
                <span className="text-zinc-500 font-semibold">Gemini: Not configured</span>
              )}
            </p>
          </GlassCard>
        </div>
      )}

      {/* Multi-Candidate Pool Selector */}
      {pipelineResult && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Candidate Pool & Candidate Validation
            </h3>
            {pipelineResult.winningCandidate ? (
              <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Optimal Winner Selected
              </span>
            ) : (
              <span className="text-xs text-zinc-400 font-medium">
                No lower-cost candidate was found.
              </span>
            )}
          </div>

          {candidates.length === 0 ? (
            <GlassCard className="p-8 text-center text-zinc-400 text-sm">
              No optimization candidates were generated for this query.
            </GlassCard>
          ) : (
            <div className={`grid gap-6 ${candidates.length === 1 ? "grid-cols-1 max-w-2xl" : candidates.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
              {candidates.map((c) => {
                const isSelected = selectedCandidate?.id === c.id;
                const costReduction = c.costReductionPercent !== undefined ? c.costReductionPercent : 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCandidate(c)}
                    className={`p-6 rounded-2xl text-left border transition-all duration-200 relative flex flex-col justify-between ${
                      isSelected
                        ? "bg-zinc-800/90 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.2)] ring-1 ring-cyan-500/50"
                        : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850/60"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-xs uppercase font-bold tracking-wider text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-md border border-cyan-500/20">
                          {formatSource(c.source)}
                        </span>
                        {c.isWinner ? (
                          <span className="text-xs uppercase font-bold tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-md border border-emerald-500/20 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Winner
                          </span>
                        ) : costReduction > 0 ? (
                          <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                            <TrendingDown className="w-3.5 h-3.5" />
                            -{costReduction.toFixed(1)}% Cost
                          </span>
                        ) : (
                          <span className="text-xs font-mono font-semibold text-zinc-400 bg-zinc-800/80 px-2.5 py-1 rounded border border-zinc-700/60">
                            0% Cost Reduction
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-bold text-white tracking-tight">{c.title}</h4>

                      {c.estimatedCost !== undefined && (
                        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-950/60 px-3 py-1.5 rounded-lg border border-zinc-800/80 w-fit">
                          <span>Estimated Cost:</span>
                          <span className="text-cyan-300 font-bold">{c.estimatedCost.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="space-y-2 pt-1">
                        {c.changes && c.changes.length > 0 ? (
                          c.changes.map((ch, i) => (
                            <p key={i} className="text-xs text-zinc-300 leading-relaxed">
                              • {ch.description}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-zinc-400 italic">No structural rewrite</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-zinc-800/80 space-y-3">
                      {/* Real Backend Validation Matrix */}
                      <div className="space-y-1.5">
                        <span className="text-xs text-zinc-400 font-medium block">Validation:</span>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span
                            title="Syntax"
                            className={`px-2 py-0.5 rounded-md flex items-center gap-1 font-medium ${
                              c.validation?.isSyntaxValid ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                            }`}
                          >
                            {c.validation?.isSyntaxValid ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            Syntax
                          </span>
                          <span
                            title="Safety"
                            className={`px-2 py-0.5 rounded-md flex items-center gap-1 font-medium ${
                              c.validation?.isSafetyValid ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                            }`}
                          >
                            {c.validation?.isSafetyValid ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            Safety
                          </span>
                          <span
                            title="Semantic"
                            className={`px-2 py-0.5 rounded-md flex items-center gap-1 font-medium ${
                              c.validation?.isSemanticValid ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                            }`}
                          >
                            {c.validation?.isSemanticValid ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            Semantic
                          </span>
                          <span
                            title="Schema"
                            className={`px-2 py-0.5 rounded-md flex items-center gap-1 font-medium ${
                              c.validation?.isSchemaValid ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                            }`}
                          >
                            {c.validation?.isSchemaValid ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            Schema
                          </span>
                          <span
                            title="Explain"
                            className={`px-2 py-0.5 rounded-md flex items-center gap-1 font-medium ${
                              c.validation?.isExplainValid ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                            }`}
                          >
                            {c.validation?.isExplainValid ? <Check className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            Explain
                          </span>
                        </div>
                      </div>

                      {/* Benchmark Status */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5 text-zinc-400" /> Benchmark:
                        </span>
                        {c.benchmarkResult ? (
                          <span className="font-mono text-cyan-300 font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                            {c.benchmarkResult.latencyReductionPercent.toFixed(1)}% speedup (Measured)
                          </span>
                        ) : (
                          <span className="font-mono text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded border border-zinc-700/50">
                            Not Run
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Side-by-Side Diff Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="h-[460px] p-4 flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <span className="text-xs font-semibold text-zinc-400">
                SQL Comparison: Original (Left) vs {selectedCandidate ? selectedCandidate.title : "Candidate"} (Right)
              </span>
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded font-mono">
                {selectedCandidate?.validation?.validationPassed ? "Validation Passed" : "Pending Evaluation"}
              </span>
            </div>

            <div className="flex-1 w-full overflow-hidden rounded-lg border border-zinc-800">
              <DiffEditor
                original={originalSql}
                modified={selectedCandidateSql}
                language="sql"
                theme="vs-dark"
                options={{
                  fontSize: 13,
                  fontFamily: "JetBrains Mono",
                  lineNumbers: "on",
                  minimap: { enabled: false }
                }}
              />
            </div>
          </GlassCard>

          {/* Pipeline Summary & Risk Safeguards */}
          {pipelineResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GlassCard className="border border-cyan-500/20 bg-cyan-500/5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-cyan-400" />
                  Optimization Pipeline Summary
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                  {pipelineResult.summary}
                </p>
              </GlassCard>

              <GlassCard className="border border-rose-500/20 bg-rose-500/5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  Validation & Risk Safeguards
                </h3>
                <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-300">
                  {selectedCandidate?.validation?.validationErrors && selectedCandidate.validation.validationErrors.length > 0 ? (
                    selectedCandidate.validation.validationErrors.map((err, i) => (
                      <li key={i} className="text-rose-300">{err}</li>
                    ))
                  ) : (
                    <li>No semantic regression or validation violations detected in candidate.</li>
                  )}
                </ul>
              </GlassCard>
            </div>
          )}
        </div>

        {/* Index Suggestions & Access Path Advisors */}
        <div className="space-y-6">
          <GlassCard className="flex-1 max-h-[600px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Recommended Access Path Indexes
            </h3>
            <div className="space-y-4">
              {pipelineResult?.recommendedDdl ? (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-white">Index DDL Recommendation</h4>
                    <span className="text-[10px] text-cyan-400 font-mono">DDL</span>
                  </div>
                  <pre className="block text-[10px] text-cyan-400 bg-zinc-950 p-2 rounded font-mono select-all overflow-x-auto whitespace-pre-wrap">
                    {pipelineResult.recommendedDdl}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 text-center py-12">
                  No missing index advisories required for this candidate.
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
