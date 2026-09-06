import React, { useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import { Workflow, Play, AlertCircle } from "lucide-react";
import { useAppStore } from "../../store";

interface PlanNode {
  nodeType: string;
  relationName?: string;
  alias?: string;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  actualTotalTime?: number;
  isExpensive: boolean;
  children: PlanNode[];
}

export const ExecutionPlans: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [sql, setSql] = useState("SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';");
  const [loading, setLoading] = useState(false);
  const [planResult, setPlanResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchExplainPlan = async () => {
    setLoading(true);
    setError(null);
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
      if (json.success && json.data.executionPlan) {
        setPlanResult(json.data.executionPlan);
      } else {
        setError(json.data.dbError || "Failed to retrieve execution plan.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderNode = (node: PlanNode, depth = 0): React.ReactNode => {
    return (
      <div key={node.nodeType + depth} className="space-y-2 pl-6 border-l border-zinc-800 relative">
        {/* Connector circle */}
        <div className={`absolute left-0 top-3 -translate-x-1.5 w-3 h-3 rounded-full border bg-zinc-900 ${
          node.isExpensive ? "border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "border-cyan-500"
        }`} />

        <div className={`p-4 rounded-lg bg-zinc-900/60 border ${
          node.isExpensive ? "border-rose-500/30" : "border-zinc-800"
        } hover:border-zinc-700 transition max-w-xl`}>
          <div className="flex justify-between items-start gap-4">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">{node.nodeType}</h4>
              {node.relationName && (
                <p className="text-xs text-zinc-400 mt-1">
                  On table: <span className="text-cyan-400 font-mono">{node.relationName}</span> {node.alias && `(as ${node.alias})`}
                </p>
              )}
            </div>
            {node.isExpensive && (
              <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-semibold">
                Costly Node
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-zinc-800/40 text-[10px] text-zinc-400 font-mono">
            <div>
              <p>Est Cost: <span className="text-white">{node.startupCost}..{node.totalCost}</span></p>
              <p>Est Rows: <span className="text-white">{node.planRows}</span></p>
            </div>
            <div>
              {node.actualTotalTime !== undefined && (
                <p>Actual Time: <span className="text-emerald-400">{node.actualTotalTime} ms</span></p>
              )}
              <p>Width: <span className="text-white">{node.planWidth} bytes</span></p>
            </div>
          </div>
        </div>

        {node.children && node.children.length > 0 && (
          <div className="space-y-4 pt-2">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Execution Plans"
        subtitle="Graph-based visual node breakdown of database physical optimizer steps."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SQL Entry */}
        <div className="space-y-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4">Input SQL Query</h3>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="w-full h-44 bg-zinc-950 border border-zinc-850 rounded-lg p-3 text-sm text-zinc-300 font-mono focus:border-cyan-500 outline-none resize-none"
            />
            <button
              onClick={fetchExplainPlan}
              disabled={loading}
              className="w-full mt-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-sm rounded-lg transition flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {loading ? "Fetching Plan..." : "Explain Query"}
            </button>
          </GlassCard>

          {error && (
            <GlassCard className="border border-rose-500/20 bg-rose-500/5 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-450 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-white">Database Error</h4>
                <p className="text-xs text-zinc-400 mt-1">{error}</p>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Tree Render Panel */}
        <div className="lg:col-span-2">
          <GlassCard className="min-h-[500px] overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-6 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-cyan-400" />
              Visual Execution Plan
            </h3>

            {planResult ? (
              <div className="space-y-4 font-sans">
                <div className="flex gap-6 mb-6 text-xs border-b border-zinc-800 pb-4 font-mono">
                  <p>Planning Time: <span className="text-white">{planResult.planningTime} ms</span></p>
                  <p>Execution Time: <span className="text-white">{planResult.executionTime} ms</span></p>
                </div>
                {renderNode(planResult.rootNode)}
              </div>
            ) : (
              <p className="text-sm text-zinc-500 text-center py-24">
                Run EXPLAIN on your SQL query to generate a visual plan graph.
              </p>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
