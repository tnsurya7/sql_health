import React, { useState, useEffect } from "react";
import { Activity, Shield, Zap, Database, CheckCircle2, AlertTriangle, RefreshCw, BarChart3, PowerOff, ArrowRight } from "lucide-react";
import { useAppStore } from "../../store";
import { GlassCard, PageHeader } from "../../components/UI";
import { Link } from "react-router-dom";

export const DatabaseHealthPage: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [healthData, setHealthData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHealth = async () => {
    if (!activeConnection || activeConnection.status !== "ONLINE") {
      setHealthData(null);
      setHistory([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/health?connectionId=${activeConnection.id}`);
      const json = await res.json();
      if (json.success && json.data.targetDatabaseHealth) {
        setHealthData(json.data.targetDatabaseHealth);
      } else {
        setHealthData(null);
      }

      const histRes = await fetch(`/api/health/history?connectionId=${activeConnection.id}`);
      const histJson = await histRes.json();
      if (histJson.success) {
        setHistory(histJson.data);
      }
    } catch (err) {
      console.error(err);
      setHealthData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [activeConnection]);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
    if (score >= 80) return "text-cyan-400 border-cyan-500/40 bg-cyan-500/10";
    if (score >= 70) return "text-amber-400 border-amber-500/40 bg-amber-500/10";
    return "text-rose-400 border-rose-500/40 bg-rose-500/10";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader
          title="Database Health & Compliance"
          subtitle="Deterministic weighted health scoring across Performance (35%), Security (20%), Indexing (20%), Quality (15%), and Maintainability (10%)."
        />
        {activeConnection && activeConnection.status === "ONLINE" && (
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-cyan-400" : ""}`} /> Recalculate
          </button>
        )}
      </div>

      {!activeConnection || activeConnection.status !== "ONLINE" ? (
        <GlassCard className="text-center py-20 space-y-4">
          <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700 flex items-center justify-center mx-auto text-zinc-400">
            <PowerOff className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">No Target Database Connected</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1">
              Database health scores are calculated exclusively from live telemetry, buffer cache hit ratios, catalog indexes, and transaction deadlocks of a real connected database.
            </p>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition"
          >
            Configure & Connect Database <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </GlassCard>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
        </div>
      ) : healthData ? (
        <>
          {/* Main Overall Score Card */}
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/70 backdrop-blur flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Overall Deterministic Health Index
              </span>
              <h2 className="text-xl font-bold text-white">
                {healthData.databaseName} ({healthData.databaseType?.toUpperCase() || "POSTGRESQL"}) Health Report
              </h2>
              <p className="text-xs text-zinc-400 max-w-xl">
                {healthData.summary}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <div
                className={`w-28 h-28 rounded-2xl border-2 flex flex-col items-center justify-center shadow-2xl ${getScoreColor(
                  healthData.scoreOverall
                )}`}
              >
                <span className="text-3xl font-extrabold tracking-tight">
                  {healthData.scoreOverall}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-wider mt-0.5">
                  Grade {healthData.grade}
                </span>
              </div>
            </div>
          </div>

          {/* 5 Dimensional Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {healthData.dimensions?.map((dim: any, i: number) => (
              <div
                key={i}
                className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
                    <div>
                      <h3 className="text-sm font-bold text-white">{dim.name}</h3>
                      <p className="text-[11px] text-zinc-500 font-mono">Weight: {dim.weightPercent}%</p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getScoreColor(
                        dim.score
                      )}`}
                    >
                      {dim.score} / 100 ({dim.grade})
                    </span>
                  </div>

                  <div className="mt-3.5 space-y-2 text-xs">
                    {dim.factors?.map((f: string, j: number) => (
                      <div key={j} className="flex items-start gap-2 text-zinc-300">
                        <span className="text-cyan-400 text-sm leading-none mt-0.5">•</span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/60">
                  <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-400 h-full rounded-full"
                      style={{ width: `${dim.score}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* History Log */}
          {history.length > 0 && (
            <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/50">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                Historical Health Score Log
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider font-semibold font-mono">
                      <th className="pb-2.5">Date</th>
                      <th className="pb-2.5">Overall</th>
                      <th className="pb-2.5">Performance</th>
                      <th className="pb-2.5">Security</th>
                      <th className="pb-2.5">Indexing</th>
                      <th className="pb-2.5">Quality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {history.map((h: any, idx: number) => (
                      <tr key={idx} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 text-zinc-400">{new Date(h.createdAt).toLocaleDateString()} {new Date(h.createdAt).toLocaleTimeString()}</td>
                        <td className="py-2.5 text-emerald-400 font-bold">{h.scoreOver}/100</td>
                        <td className="py-2.5 text-zinc-300">{h.scorePerf}</td>
                        <td className="py-2.5 text-zinc-300">{h.scoreSec}</td>
                        <td className="py-2.5 text-zinc-300">{h.scoreIdx}</td>
                        <td className="py-2.5 text-zinc-300">{h.scoreQuery}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <GlassCard className="text-center py-16">
          <p className="text-xs text-zinc-400">Unable to retrieve catalog metrics from the target database.</p>
        </GlassCard>
      )}
    </div>
  );
};
