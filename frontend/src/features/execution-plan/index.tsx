import React, { useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import { Workflow, Play, AlertCircle, Clock, Zap, Layers } from "lucide-react";
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
  isExpensive?: boolean;
  children?: PlanNode[];
}

export const ExecutionPlans: React.FC = () => {
  const { activeConnection, token } = useAppStore();
  const [sql, setSql] = useState("SELECT * FROM customers WHERE LOWER(email) = 'cust1@example.com';");
  const [loading, setLoading] = useState(false);
  const [planResult, setPlanResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const authToken = token || localStorage.getItem("token") || "";

  const fetchExplainPlan = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sql/explain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          sql,
          connectionId: activeConnection?.id || null,
          analyze: true,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setPlanResult(json.data);
      } else {
        setError(json.error?.message || "Failed to retrieve execution plan.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch EXPLAIN plan.");
    } finally {
      setLoading(false);
    }
  };

  const renderNode = (node: PlanNode, depth = 0): React.ReactNode => {
    if (!node) return null;
    const isExpensive = node.isExpensive || (node.totalCost && node.totalCost > 100);

    return (
      <div key={`${node.nodeType}-${depth}-${node.relationName || "rel"}`} className="space-y-2 pl-6 border-l border-zinc-800 relative">
        {/* Connector circle */}
        <div
          className={`absolute left-0 top-3 -translate-x-1.5 w-3 h-3 rounded-full border bg-zinc-900 ${
            isExpensive ? "border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "border-cyan-500"
          }`}
        />

        <div
          className={`p-4 rounded-lg bg-zinc-900/60 border ${
            isExpensive ? "border-rose-500/30" : "border-zinc-800"
          } hover:border-zinc-700 transition max-w-xl`}
        >
          <div className="flex justify-between items-start gap-4">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">{node.nodeType || "Plan Node"}</h4>
              {node.relationName && (
                <p className="text-xs text-zinc-400 mt-1">
                  On table: <span className="text-cyan-400 font-mono">{node.relationName}</span>{" "}
                  {node.alias && `(as ${node.alias})`}
                </p>
              )}
            </div>
            {isExpensive && (
              <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-semibold">
                High Cost
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-zinc-800/40 text-[10px] text-zinc-400 font-mono">
            <div>
              <p>
                Est Cost: <span className="text-white">{node.startupCost ?? 0}..{node.totalCost ?? 0}</span>
              </p>
              <p>
                Est Rows: <span className="text-white">{node.planRows ?? 0}</span>
              </p>
            </div>
            <div>
              {node.actualTotalTime !== undefined && (
                <p>
                  Actual Time: <span className="text-emerald-400">{node.actualTotalTime} ms</span>
                </p>
              )}
              <p>
                Width: <span className="text-white">{node.planWidth ?? 0} bytes</span>
              </p>
            </div>
          </div>
        </div>

        {Array.isArray(node.children) && node.children.length > 0 && (
          <div className="space-y-4 pt-2">
            {node.children.map((child, ci) => renderNode(child, depth + 1 + ci))}
          </div>
        )}
      </div>
    );
  };

  const rootNode = planResult?.planTree || planResult?.rootNode;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Execution Plans"
        subtitle={`Live physical optimizer cost analysis and node tree traversal for ${
          activeConnection?.name || "Target Database"
        }.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* SQL Entry */}
        <div className="space-y-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4">Input SQL Query</h3>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="w-full h-44 bg-zinc-950 border border-zinc-850 rounded-lg p-3 text-xs text-zinc-300 font-mono focus:border-cyan-500 outline-none resize-none"
            />
            <button
              onClick={fetchExplainPlan}
              disabled={loading || !activeConnection}
              className="w-full mt-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              {loading ? "Fetching Plan..." : "Explain Query (Live DB)"}
            </button>
          </GlassCard>

          {error && (
            <GlassCard className="border border-rose-500/20 bg-rose-500/5 flex items-start gap-3 p-4">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-white">Execution Plan Error</h4>
                <p className="text-xs text-zinc-400 mt-1">{error}</p>
              </div>
            </GlassCard>
          )}

          {planResult?.cardinalityReport && (
            <GlassCard className="p-4 space-y-3">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                Cardinality Assessment
              </h4>
              <p className="text-xs text-zinc-300">{planResult.cardinalityReport.summary}</p>
              {planResult.cardinalityReport.discrepancies?.length > 0 && (
                <div className="p-2.5 bg-zinc-950 rounded border border-zinc-850 text-[11px] font-mono text-amber-300">
                  {planResult.cardinalityReport.discrepancies.length} node(s) with high estimated vs actual row discrepancy.
                </div>
              )}
            </GlassCard>
          )}
        </div>

        {/* Tree Render Panel */}
        <div className="lg:col-span-2">
          <GlassCard className="min-h-[520px] overflow-x-auto p-6">
            <h3 className="text-sm font-semibold text-white mb-6 flex items-center gap-2">
              <Workflow className="w-4 h-4 text-cyan-400" />
              Visual Execution Plan Tree
            </h3>

            {planResult ? (
              <div className="space-y-4 font-sans">
                <div className="flex flex-wrap gap-6 mb-6 text-xs border-b border-zinc-850 pb-4 font-mono">
                  {planResult.planningTime !== undefined && (
                    <p className="flex items-center gap-1.5 text-zinc-400">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      Planning Time: <span className="text-white font-bold">{planResult.planningTime} ms</span>
                    </p>
                  )}
                  {planResult.executionTime !== undefined && (
                    <p className="flex items-center gap-1.5 text-zinc-400">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      Execution Time: <span className="text-white font-bold">{planResult.executionTime} ms</span>
                    </p>
                  )}
                  {planResult.totalCost !== undefined && (
                    <p className="flex items-center gap-1.5 text-zinc-400">
                      Total Cost: <span className="text-white font-bold">{planResult.totalCost}</span>
                    </p>
                  )}
                </div>
                {rootNode ? (
                  renderNode(rootNode)
                ) : (
                  <pre className="text-xs text-zinc-400 p-4 bg-zinc-950 rounded overflow-x-auto font-mono">
                    {planResult.rawOutput || "No structured plan tree returned."}
                  </pre>
                )}
              </div>
            ) : (
              <div className="text-center py-28 text-zinc-500 space-y-2">
                <Workflow className="w-10 h-10 text-zinc-700 mx-auto" />
                <p className="text-sm text-white font-medium">No Execution Plan Loaded</p>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Click 'Explain Query' to query your database optimizer and view physical plan costs.
                </p>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
