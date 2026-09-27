import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import {
  GlassCard,
  PageHeader,
  SeverityBadge,
  ScoreRing,
} from "../../components/UI";
import {
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Copy,
  Check,
  Code,
  AlertTriangle,
  Database,
  Layers,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useAppStore } from "../../store";

export const SqlAnalyzer: React.FC = () => {
  const { activeConnection, token } = useAppStore();
  const [sql, setSql] = useState(
    "SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';"
  );
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const authToken = token || localStorage.getItem("token") || "";

  const formatSql = () => {
    const formatted = sql
      .replace(/\s+/g, " ")
      .replace(
        /\b(SELECT|FROM|WHERE|LEFT JOIN|RIGHT JOIN|INNER JOIN|JOIN|ON|GROUP BY|ORDER BY|HAVING|LIMIT|AND|OR)\b/gi,
        "\n$1"
      )
      .trim();
    setSql(formatted);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runAnalysis = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/sql/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sql,
          connectionId: activeConnection?.id || null,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        // Normalize report structure
        const report = json.data.report || json.data;
        const normalized = {
          scoreOverall: report.scoreOverall ?? json.data.scores?.overall ?? 100,
          scorePerformance: report.scorePerformance ?? json.data.scores?.performance ?? 100,
          scoreSecurity: report.scoreSecurity ?? json.data.scores?.security ?? 100,
          scoreOptimization: report.scoreOptimization ?? json.data.scores?.optimization ?? 100,
          scoreMaintainability: report.scoreMaintainability ?? json.data.scores?.maintainability ?? 100,
          summary: report.summary || "Query structural analysis complete.",
          issues: Array.isArray(report.issues)
            ? report.issues
            : Array.isArray(json.data.issues)
            ? json.data.issues
            : [],
          astMetrics: report.astMetrics || null,
          antiPatternCount: report.antiPatternCount ?? 0,
        };
        setAnalysisResult(normalized);
      } else {
        setErrorMessage(json.error?.message || "Analysis request failed.");
      }
    } catch (err: any) {
      console.error("[SqlAnalyzer] Error:", err);
      setErrorMessage(err.message || "Failed to analyze query.");
    } finally {
      setLoading(false);
    }
  };

  const runAiExplain = async () => {
    if (!sql.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/sql/ai-explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sql,
          databaseType: activeConnection?.databaseType || "postgresql",
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.explanation) {
        setExplanation(json.data.explanation);
      }
    } catch (err) {
      console.error("[SqlAnalyzer] AI Explain Error:", err);
    } finally {
      setAiLoading(false);
    }
  };

  const overallScore = analysisResult?.scoreOverall ?? 100;
  const issues = analysisResult?.issues || [];

  return (
    <div className="space-y-8">
      <PageHeader
        title="SQL Analyzer"
        subtitle={`Deterministic AST parser, anti-pattern detection, and multi-dialect linting for ${
          activeConnection?.name || "Target Database"
        }.`}
      />

      {errorMessage && (
        <GlassCard className="p-4 border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </GlassCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor Workspace */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="flex flex-col h-[520px] p-4 relative">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5">
                <Code className="w-4 h-4 text-cyan-400" />
                SQL Query Editor
              </span>
              <div className="flex gap-2">
                <button
                  onClick={formatSql}
                  className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition border border-zinc-700"
                >
                  Format SQL
                </button>
                <button
                  onClick={handleCopy}
                  className="p-1 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition border border-zinc-700"
                  title="Copy SQL"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex-1 w-full overflow-hidden rounded-lg border border-zinc-850">
              <Editor
                height="100%"
                defaultLanguage="sql"
                theme="vs-dark"
                value={sql}
                onChange={(val) => setSql(val || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: "on",
                  fontFamily: "JetBrains Mono",
                  lineHeight: 22,
                  scrollbar: { vertical: "visible", horizontal: "visible" },
                }}
              />
            </div>

            <div className="flex gap-3 mt-4 justify-end shrink-0">
              <button
                onClick={() => {
                  setSql("");
                  setAnalysisResult(null);
                  setExplanation(null);
                }}
                className="px-4 py-2 text-xs text-zinc-400 hover:text-white bg-zinc-800/40 hover:bg-zinc-800 rounded-lg transition border border-zinc-800"
              >
                Clear
              </button>
              <button
                onClick={runAiExplain}
                disabled={aiLoading}
                className="px-4 py-2 text-xs text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg transition border border-cyan-500/20 flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {aiLoading ? "Explaining with AI..." : "AI Explain"}
              </button>
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="px-5 py-2 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg transition font-semibold flex items-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                {loading ? "Analyzing..." : "Analyze Query"}
              </button>
            </div>
          </GlassCard>

          {/* AST Telemetry Pills */}
          {analysisResult?.astMetrics && (
            <GlassCard className="p-4">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                AST Structural Telemetry
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 block">Tables Referenced</span>
                  <span className="text-white font-bold truncate block">
                    {analysisResult.astMetrics.tablesReferenced?.join(", ") || "None"}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 block">Join Count</span>
                  <span className="text-cyan-400 font-bold block">
                    {analysisResult.astMetrics.joinCount ?? 0}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 block">Filter WHERE Status</span>
                  <span
                    className={`font-bold block ${
                      analysisResult.astMetrics.hasWhere ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {analysisResult.astMetrics.hasWhere ? "Indexed / Present" : "Missing WHERE"}
                  </span>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <span className="text-[10px] text-zinc-500 block">AST Traversed Nodes</span>
                  <span className="text-white font-bold block">
                    {analysisResult.astMetrics.totalNodesVisited ?? 0}
                  </span>
                </div>
              </div>
            </GlassCard>
          )}

          {/* AI Explanation Box */}
          {explanation && (
            <GlassCard className="border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                AI Query Explanation
              </h3>
              <p className="text-xs text-zinc-300 leading-relaxed font-sans whitespace-pre-line">
                {explanation}
              </p>
            </GlassCard>
          )}
        </div>

        {/* Score & Findings Panel */}
        <div className="space-y-6">
          <GlassCard className="flex flex-col items-center justify-center text-center p-6">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-5">
              Overall Analysis Score
            </h3>
            <ScoreRing
              score={overallScore}
              size={140}
              strokeWidth={11}
              label="Quality"
            />

            {analysisResult && (
              <div className="grid grid-cols-2 gap-3 w-full mt-6 pt-5 border-t border-zinc-850 text-left">
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Performance</p>
                  <p className="text-base font-mono font-bold text-white">
                    {analysisResult.scorePerformance}/100
                  </p>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Security</p>
                  <p className="text-base font-mono font-bold text-white">
                    {analysisResult.scoreSecurity}/100
                  </p>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Optimization</p>
                  <p className="text-base font-mono font-bold text-white">
                    {analysisResult.scoreOptimization}/100
                  </p>
                </div>
                <div className="p-2.5 bg-zinc-950/60 rounded border border-zinc-850">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Maintainability</p>
                  <p className="text-base font-mono font-bold text-white">
                    {analysisResult.scoreMaintainability}/100
                  </p>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Issues List */}
          <GlassCard className="flex-1 overflow-y-auto max-h-[460px] p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Query Findings ({issues.length})
              </h3>
              {issues.length > 0 && (
                <span className="text-[10px] font-mono text-zinc-500">
                  {issues.filter((i: any) => i.severity === "CRITICAL" || i.severity === "HIGH").length} High Risk
                </span>
              )}
            </div>

            <div className="space-y-3">
              {issues.length > 0 ? (
                issues.map((issue: any, index: number) => (
                  <div
                    key={index}
                    className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-lg space-y-2 font-mono text-xs"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">
                          {issue.ruleCode || issue.ruleId || `ISSUE-${index + 1}`}
                        </span>
                        <h4 className="text-xs font-bold text-white mt-0.5">{issue.title}</h4>
                      </div>
                      <SeverityBadge severity={issue.severity} />
                    </div>

                    <p className="text-xs text-zinc-300 font-sans">{issue.description}</p>

                    {issue.evidence && (
                      <div className="text-[10px] text-zinc-400 bg-zinc-900/90 p-2 rounded border border-zinc-850 font-mono truncate">
                        Evidence: <span className="text-cyan-300">{issue.evidence}</span>
                      </div>
                    )}

                    {issue.recommendation && (
                      <div className="text-xs text-emerald-400 font-sans flex items-start gap-1.5 pt-1">
                        <span>💡</span>
                        <span>{issue.recommendation}</span>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-xs text-zinc-500">
                  {analysisResult ? (
                    <div className="space-y-1">
                      <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                      <p className="text-white font-medium">No anti-patterns detected.</p>
                      <p className="text-zinc-500">Query structure and dialect rules verified.</p>
                    </div>
                  ) : (
                    "Click 'Analyze Query' to inspect AST structure, anti-patterns, and security rules."
                  )}
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
