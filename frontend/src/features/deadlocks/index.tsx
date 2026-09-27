import React, { useState, useEffect } from "react";
import { Lock, AlertTriangle, ShieldCheck, RefreshCw, Activity, CheckCircle2 } from "lucide-react";
import { useAppStore } from "../../store";

export const DeadlocksPage: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [data, setData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDeadlocks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deadlocks${activeConnection ? `?connectionId=${activeConnection.id}` : ""}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }

      const histRes = await fetch("/api/deadlocks/history");
      const histJson = await histRes.json();
      if (histJson.success) {
        setHistory(histJson.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeadlocks();
    const interval = setInterval(fetchDeadlocks, 10000);
    return () => clearInterval(interval);
  }, [activeConnection]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Lock className="w-6 h-6 text-rose-400" />
            Lock Contention & Deadlock Analyzer
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time lock analysis, wait-for transaction graph, and DFS cycle detection on {activeConnection?.name || "database"}.
          </p>
        </div>
        <button
          onClick={fetchDeadlocks}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} /> Refresh
        </button>
      </div>

      {/* Cycle Detection Status Banner */}
      {data?.hasDeadlock ? (
        <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 flex items-start gap-3 shadow-lg shadow-rose-500/10">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-white">Potential Deadlock Cycle Detected!</h4>
            <p className="text-xs text-rose-200 mt-0.5">
              DFS graph search identified a circular wait dependency involving {data.cyclePids?.length} transactions (PIDs: {data.cyclePids?.join(", ")}).
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-white">No Active Deadlock Cycles Detected</h4>
            <p className="text-xs text-emerald-200/80 mt-0.5">
              All active database transactions are executing or waiting without circular graph dependencies.
            </p>
          </div>
        </div>
      )}

      {/* Directed Wait-For Graph View */}
      <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-cyan-400" />
          Directed Wait-For Dependency Graph
        </h3>

        {data?.waitEdges && data.waitEdges.length > 0 ? (
          <div className="space-y-3">
            {data.waitEdges.map((edge: any, i: number) => (
              <div
                key={i}
                className="p-3.5 rounded-lg border border-rose-500/30 bg-zinc-950 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-1 rounded bg-rose-500/20 text-rose-400 font-bold">
                    PID {edge.fromPid}
                  </span>
                  <span className="text-zinc-500">── waiting for lock [{edge.lockType} {edge.mode}] ──▶</span>
                  <span className="px-2 py-1 rounded bg-amber-500/20 text-amber-400 font-bold">
                    PID {edge.toPid}
                  </span>
                </div>
                <p className="text-zinc-400 truncate max-w-md">{edge.fromQuery}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center border border-dashed border-zinc-800 rounded-lg text-xs text-zinc-500">
            Wait-for graph is empty. No blocked transactions waiting on locks.
          </div>
        )}
      </div>

      {/* Deadlock Log History */}
      <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <h3 className="text-sm font-bold text-white mb-3">Historical Deadlock Events</h3>
        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider font-semibold">
                  <th className="pb-3">Timestamp</th>
                  <th className="pb-3">Database</th>
                  <th className="pb-3">Cycle Details</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono">
                {history.map((h: any) => (
                  <tr key={h.id} className="hover:bg-zinc-800/30">
                    <td className="py-3 text-zinc-400">{new Date(h.detectedAt).toLocaleString()}</td>
                    <td className="py-3 text-white">{h.connection?.name || "PostgreSQL"}</td>
                    <td className="py-3 text-zinc-300 max-w-xs truncate">{h.cycleDetails}</td>
                    <td className="py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                        RESOLVED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 py-4 text-center">No recorded deadlock events in application history.</p>
        )}
      </div>
    </div>
  );
};
