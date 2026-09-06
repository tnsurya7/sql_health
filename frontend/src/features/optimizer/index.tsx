import React, { useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import {
  GlassCard,
  PageHeader,
  SeverityBadge
} from "../../components/UI";
import {
  Sparkles,
  AlertTriangle,
  Lightbulb,
  CheckCircle,
  Play
} from "lucide-react";
import { useAppStore } from "../../store";

export const QueryOptimizer: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [originalSql, setOriginalSql] = useState("SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';");
  const [optimizedSql, setOptimizedSql] = useState("SELECT id, first_name, last_name, email FROM customers WHERE email = 'cust1@example.com';");
  const [loading, setLoading] = useState(false);
  const [optimizationData, setOptimizationData] = useState<any>(null);

  const runAiOptimize = async () => {
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
      if (json.success) {
        setOptimizedSql(json.data.optimizedSql);
        setOptimizationData(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Query Optimizer"
        subtitle="Compare original queries side-by-side with AI-driven structural enhancements."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Monaco Diff Editor Card */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="h-[480px] p-4 flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <span className="text-xs font-semibold text-zinc-400">
                SQL Comparison (Original vs Optimized)
              </span>
              <button
                onClick={runAiOptimize}
                disabled={loading}
                className="px-4 py-1.5 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg font-semibold flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loading ? "Optimizing..." : "Optimize with AI"}
              </button>
            </div>

            <div className="flex-1 w-full overflow-hidden rounded-lg border border-zinc-800">
              <DiffEditor
                original={originalSql}
                modified={optimizedSql}
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

          {/* AI Explanation & Risks */}
          {optimizationData && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GlassCard className="border border-cyan-500/20 bg-cyan-500/5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4 text-cyan-400" />
                  AI Optimization Summary
                </h3>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {optimizationData.summary}
                </p>
              </GlassCard>

              <GlassCard className="border border-rose-500/20 bg-rose-500/5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  Potential Risks & Warnings
                </h3>
                <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-300">
                  {optimizationData.risks && optimizationData.risks.length > 0 ? (
                    optimizationData.risks.map((risk: string, i: number) => (
                      <li key={i}>{risk}</li>
                    ))
                  ) : (
                    <li>No significant deployment risks identified.</li>
                  )}
                </ul>
              </GlassCard>
            </div>
          )}
        </div>

        {/* Index Suggestions & Recommendations panel */}
        <div className="space-y-6">
          <GlassCard className="flex-1 max-h-[600px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-4">Recommended Indexes</h3>
            <div className="space-y-4">
              {optimizationData?.indexRecommendations && optimizationData.indexRecommendations.length > 0 ? (
                optimizationData.indexRecommendations.map((rec: any, idx: number) => (
                  <div key={idx} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                    <h4 className="text-xs font-semibold text-white">Table: {rec.table}</h4>
                    <p className="text-xs text-zinc-400">{rec.reason}</p>
                    <code className="block text-[10px] text-cyan-400 bg-zinc-950 p-2 rounded font-mono select-all">
                      {rec.sql}
                    </code>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500 text-center py-12">
                  No index recommendations generated for this query.
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
