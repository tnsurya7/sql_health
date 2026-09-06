import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import {
  GlassCard,
  PageHeader,
  SeverityBadge,
  ScoreRing
} from "../../components/UI";
import {
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Copy,
  Check,
  Code
} from "lucide-react";
import { useAppStore } from "../../store";

export const SqlAnalyzer: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [sql, setSql] = useState("SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [explanation, setExplanation] = useState<string | null>(null);

  const formatSql = () => {
    // Basic formatting placeholder
    const formatted = sql
      .replace(/\s+/g, " ")
      .replace(/\b(SELECT|FROM|WHERE|JOIN|ON|GROUP BY|ORDER BY|AND|OR)\b/gi, "\n$1")
      .trim();
    setSql(formatted);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sql/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          sql,
          connectionId: activeConnection?.id || null
        })
      });
      const json = await res.json();
      if (json.success) {
        setAnalysisResult(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runAiExplain = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/sql/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ sql })
      });
      const json = await res.json();
      if (json.success) {
        setExplanation(json.data.explanation);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="SQL Analyzer"
        subtitle="Write, parse, and analyze your SQL query structure for performance and security risks."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor Workspace */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="flex flex-col h-[500px] p-4 relative">
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
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
                  fontSize: 14,
                  lineNumbers: "on",
                  fontFamily: "JetBrains Mono",
                  lineHeight: 22,
                  scrollbar: { vertical: "visible", horizontal: "visible" }
                }}
              />
            </div>

            <div className="flex gap-3 mt-4 justify-end shrink-0">
              <button
                onClick={() => setSql("")}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800/40 hover:bg-zinc-800 rounded-lg transition border border-zinc-800"
              >
                Clear
              </button>
              <button
                onClick={runAiExplain}
                disabled={aiLoading}
                className="px-4 py-2 text-sm text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded-lg transition border border-cyan-500/20 flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {aiLoading ? "Explaining with AI..." : "AI Explain"}
              </button>
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="px-5 py-2 text-sm text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg transition font-semibold flex items-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Play className="w-4 h-4 fill-white" />
                {loading ? "Analyzing..." : "Analyze Query"}
              </button>
            </div>
          </GlassCard>

          {/* AI Explanation Box */}
          {explanation && (
            <GlassCard className="border border-cyan-500/20 bg-cyan-500/5">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                AI Query Explanation
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed font-sans">{explanation}</p>
            </GlassCard>
          )}
        </div>

        {/* Score & Findings Panel */}
        <div className="space-y-6">
          <GlassCard className="flex flex-col items-center justify-center text-center">
            <h3 className="text-sm font-semibold text-white mb-6">Overall Analysis Score</h3>
            <ScoreRing score={analysisResult ? analysisResult.scores.overall : 100} size={150} strokeWidth={12} label="Score" />
            
            {analysisResult && (
              <div className="grid grid-cols-2 gap-4 w-full mt-8 pt-6 border-t border-zinc-800">
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Performance</p>
                  <p className="text-lg font-mono font-bold text-white">{analysisResult.scores.performance}/100</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Security</p>
                  <p className="text-lg font-mono font-bold text-white">{analysisResult.scores.security}/100</p>
                </div>
              </div>
            )}
          </GlassCard>

          {/* Issues List */}
          <GlassCard className="flex-1 overflow-y-auto max-h-[380px]">
            <h3 className="text-sm font-semibold text-white mb-4">Query Findings</h3>
            <div className="space-y-3">
              {analysisResult && analysisResult.issues.length > 0 ? (
                analysisResult.issues.map((issue: any, index: number) => (
                  <div key={index} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <h4 className="text-xs font-semibold text-white">{issue.title}</h4>
                      <SeverityBadge severity={issue.severity} />
                    </div>
                    <p className="text-xs text-zinc-400">{issue.description}</p>
                    <div className="text-[10px] text-zinc-500 bg-zinc-950 p-1.5 rounded font-mono truncate">
                      Evidence: {issue.evidence}
                    </div>
                    <div className="text-xs text-cyan-400 mt-1">
                      💡 {issue.recommendation}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500 text-center py-8">
                  {analysisResult ? "No issues detected. Query looks perfect!" : "Run analysis to view findings."}
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
