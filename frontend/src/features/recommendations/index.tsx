import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader, SeverityBadge, StatusBadge } from "../../components/UI";
import { AlertCircle, ThumbsUp, ThumbsDown, CheckCircle } from "lucide-react";
import { useAppStore } from "../../store";

export const Recommendations: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecommendations = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/recommendations?connectionId=${activeConnection.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setRecs(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/recommendations/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ status })
      });
      const json = await res.json();
      if (json.success) {
        // Update local state
        setRecs(recs.map(r => r.id === id ? { ...r, status } : r));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [activeConnection]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Optimization Recommendations"
        subtitle="Global database metrics suggestions covering performance, indexes, and database schema layouts."
      />

      {!activeConnection ? (
        <GlassCard className="text-center py-20">
          <p className="text-zinc-400">Please connect a database connection first to list design recommendations.</p>
        </GlassCard>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
        </div>
      ) : (
        <div className="space-y-6">
          {recs.length > 0 ? (
            recs.map((rec) => (
              <GlassCard key={rec.id} className="space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {rec.category}
                      </span>
                      <StatusBadge status={rec.status} />
                    </div>
                    <h3 className="text-sm font-bold text-white pt-1">{rec.title}</h3>
                    <p className="text-xs text-zinc-450">{rec.description}</p>
                  </div>
                  <SeverityBadge severity={rec.severity} />
                </div>

                {rec.suggestedSql && (
                  <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-[11px] text-cyan-400 overflow-x-auto">
                    {rec.suggestedSql}
                  </pre>
                )}

                {rec.status === "NEW" && (
                  <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/40">
                    <button
                      onClick={() => updateStatus(rec.id, "REJECTED")}
                      className="px-3 py-1 text-xs text-zinc-450 hover:text-rose-400 bg-zinc-900 border border-zinc-800 hover:border-rose-500/20 rounded transition flex items-center gap-1"
                    >
                      <ThumbsDown className="w-3 h-3" /> Reject
                    </button>
                    <button
                      onClick={() => updateStatus(rec.id, "ACCEPTED")}
                      className="px-3 py-1 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded transition flex items-center gap-1"
                    >
                      <ThumbsUp className="w-3 h-3" /> Accept
                    </button>
                  </div>
                )}

                {rec.status === "ACCEPTED" && (
                  <div className="flex justify-end pt-2 border-t border-zinc-800/40">
                    <button
                      onClick={() => updateStatus(rec.id, "APPLIED")}
                      className="px-3 py-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded flex items-center gap-1"
                    >
                      <CheckCircle className="w-3 h-3" /> Mark Applied
                    </button>
                  </div>
                )}
              </GlassCard>
            ))
          ) : (
            <GlassCard className="text-center py-20">
              <p className="text-zinc-500">Your database currently has no detected recommendations.</p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
};
