import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import { History, FileCode, Trash2, ArrowRight } from "lucide-react";
import { useAppStore } from "../../store";

export const QueryHistory: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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
        setHistory(json.data);
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Query History"
        subtitle="Review previously analyzed, optimized, and benchmarked SQL runs."
      />

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
        </div>
      ) : (
        <div className="space-y-4">
          {history.length > 0 ? (
            history.map((item) => (
              <GlassCard key={item.id} className="flex justify-between items-center gap-6 p-4">
                <div className="flex items-center gap-4 truncate">
                  <div className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 shrink-0">
                    <FileCode className="w-5 h-5" />
                  </div>
                  <div className="truncate">
                    <code className="text-xs font-mono text-zinc-200 block truncate max-w-2xl">{item.rawSql}</code>
                    <span className="text-[10px] text-zinc-500 block mt-1">
                      Analyzed on {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                    item.score >= 80 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                  }`}>
                    Score: {item.score}
                  </span>
                </div>
              </GlassCard>
            ))
          ) : (
            <GlassCard className="text-center py-20">
              <p className="text-zinc-500">No SQL queries analyzed yet.</p>
            </GlassCard>
          )}
        </div>
      )}
    </div>
  );
};
