import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader, SeverityBadge } from "../../components/UI";
import { ShieldAlert, Copy, Check, Play } from "lucide-react";
import { useAppStore } from "../../store";

export const IndexAdvisor: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [recs, setRecs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchRecommendations = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/recommendations?connectionId=${activeConnection.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setRecs(json.data.filter((r: any) => r.category === "INDEXES"));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    fetchRecommendations();
  }, [activeConnection]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Index Advisor"
        subtitle="Review, analyze, and build physical column indexes based on filter and join execution heuristics."
      />

      {!activeConnection ? (
        <GlassCard className="text-center py-20">
          <p className="text-zinc-400">Please connect a database connection first to retrieve indexing advisories.</p>
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
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-sm font-bold text-white">{rec.title}</h3>
                    <p className="text-xs text-zinc-400 mt-1">{rec.description}</p>
                  </div>
                  <SeverityBadge severity={rec.severity} />
                </div>

                {rec.evidence && (
                  <div className="text-[10px] text-zinc-400 font-mono bg-zinc-950 p-2 rounded">
                    Query evidence: {rec.evidence}
                  </div>
                )}

                {rec.suggestedSql && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs">
                    <div className="flex justify-between items-center bg-zinc-900 px-4 py-2 border-b border-zinc-800 shrink-0">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase">Suggested SQL</span>
                      <button
                        onClick={() => handleCopy(rec.id, rec.suggestedSql)}
                        className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px]"
                      >
                        {copiedId === rec.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy SQL
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-4 text-cyan-400 overflow-x-auto select-all">{rec.suggestedSql}</pre>
                  </div>
                )}
              </GlassCard>
            ))
          ) : (
            <GlassCard className="text-center py-20">
              <p className="text-zinc-400">No missing index advisories found for the connected database schema.</p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
};
