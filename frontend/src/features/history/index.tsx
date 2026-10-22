import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader, SeverityBadge } from "../../components/UI";
import { History, FileCode, Trash2, ArrowRight, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useAppStore } from "../../store";

export const QueryHistory: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const url = activeConnection
        ? `/api/queries?connectionId=${activeConnection.id}`
        : "/api/queries";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setHistory(Array.isArray(json.data) ? json.data : Array.isArray(json.data?.items) ? json.data.items : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeConnection]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Query History"
        subtitle={
          activeConnection
            ? `Analyzed SQL query runs for target database: ${activeConnection.name}`
            : "Review previously analyzed, optimized, and benchmarked SQL runs across all sessions."
        }
      />

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {history.length > 0 ? (
            history.map((item) => {
              const issues = item.analyses?.[0]?.issues || [];
              const isExpanded = expandedId === item.id;

              return (
                <GlassCard key={item.id} className="space-y-3 p-4">
                  <div
                    onClick={() => toggleExpand(item.id)}
                    className="flex justify-between items-center gap-6 cursor-pointer"
                  >
                    <div className="flex items-center gap-4 truncate">
                      <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 shrink-0">
                        <FileCode className="w-5 h-5" />
                      </div>
                      <div className="truncate">
                        <code className="text-xs font-mono text-zinc-200 block truncate max-w-2xl">{item.rawSql}</code>
                        <div className="flex gap-3 text-[10px] text-zinc-500 mt-1 font-mono">
                          <span>{new Date(item.createdAt).toLocaleString()}</span>
                          {item.fingerprint && <span>FP: {item.fingerprint.substring(0, 16)}...</span>}
                          {issues.length > 0 && (
                            <span className="text-amber-400 font-sans">{issues.length} issue(s) detected</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                          item.score >= 80 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                        }`}
                      >
                        Score: {item.score}/100
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="pt-4 mt-2 border-t border-zinc-800 space-y-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500">Full Query SQL</span>
                        <pre className="p-3 bg-zinc-950 border border-zinc-850 rounded text-xs font-mono text-zinc-300 mt-1 overflow-x-auto select-all">
                          {item.rawSql}
                        </pre>
                      </div>

                      {issues.length > 0 ? (
                        <div className="space-y-2">
                          <span className="text-[10px] uppercase font-bold text-zinc-500">Detected Issues ({issues.length})</span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {issues.map((issue: any, idx: number) => (
                              <div key={idx} className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded text-xs space-y-1">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-semibold text-white text-[11px]">{issue.title}</h4>
                                  <SeverityBadge severity={issue.severity} />
                                </div>
                                <p className="text-[11px] text-zinc-400">{issue.description}</p>
                                <p className="text-[10px] text-cyan-400">💡 {issue.recommendation}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-400">No anti-pattern issues detected for this run.</p>
                      )}
                    </div>
                  )}
                </GlassCard>
              );
            })
          ) : (
            <GlassCard className="text-center py-20">
              <p className="text-zinc-500">No SQL queries analyzed yet for this database connection.</p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
};
