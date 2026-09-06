import React, { useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import { Play, LineChart, ShieldAlert } from "lucide-react";
import { useAppStore } from "../../store";

export const Performance: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [sql, setSql] = useState("SELECT id, first_name, last_name FROM customers WHERE city = 'New York';");
  const [iterations, setIterations] = useState(5);
  const [warmup, setWarmup] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runBenchmark = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    // Safety validation
    const isSelect = /^\s*SELECT\b/i.test(sql);
    if (!isSelect) {
      setError("Benchmarking is restricted to SELECT queries only to prevent destructive operations.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/sql/benchmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          sql,
          connectionId: activeConnection?.id || null,
          iterations,
          warmup
        })
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
      } else {
        setError(json.error?.message || "Failed to execute benchmarking.");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Performance Benchmarker"
        subtitle="Safely run performance telemetry benchmark loops against your live database."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Benchmark setup */}
        <div className="space-y-6">
          <GlassCard className="space-y-4">
            <h3 className="text-sm font-semibold text-white">Select Benchmark Query</h3>
            <textarea
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              className="w-full h-36 bg-zinc-950 border border-zinc-850 rounded-lg p-3 text-sm text-zinc-350 font-mono focus:border-cyan-500 outline-none resize-none"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-zinc-500">Iterations</label>
                <select
                  value={iterations}
                  onChange={(e) => setIterations(Number(e.target.value))}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-white"
                >
                  <option value={3}>3 Runs</option>
                  <option value={5}>5 Runs</option>
                  <option value={10}>10 Runs</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="warmup"
                  checked={warmup}
                  onChange={(e) => setWarmup(e.target.checked)}
                  className="rounded border-zinc-800 text-cyan-500 focus:ring-0"
                />
                <label htmlFor="warmup" className="text-xs text-zinc-400 cursor-pointer">
                  Warmup Run
                </label>
              </div>
            </div>

            <button
              onClick={runBenchmark}
              disabled={loading || !activeConnection}
              className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-sm rounded-lg transition flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {loading ? "Benchmarking..." : "Start Benchmark Loop"}
            </button>
          </GlassCard>

          {error && (
            <GlassCard className="border border-rose-500/20 bg-rose-500/5 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-450 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-white">Benchmark Failed</h4>
                <p className="text-xs text-zinc-450 mt-1">{error}</p>
              </div>
            </GlassCard>
          )}
        </div>

        {/* Results metrics */}
        <div className="lg:col-span-2">
          <GlassCard className="min-h-[380px] flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white mb-6 flex items-center gap-2">
                <LineChart className="w-4 h-4 text-cyan-400" />
                Benchmark telemetry report
              </h3>

              {result ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 font-mono text-center">
                  <div className="p-4 bg-zinc-900 border border-zinc-850 rounded-lg">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Min Time</p>
                    <p className="text-xl font-bold text-white mt-2">{result.minTimeMs.toFixed(2)} ms</p>
                  </div>
                  <div className="p-4 bg-zinc-900 border border-zinc-850 rounded-lg">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Max Time</p>
                    <p className="text-xl font-bold text-white mt-2">{result.maxTimeMs.toFixed(2)} ms</p>
                  </div>
                  <div className="p-4 bg-zinc-900 border border-zinc-850 rounded-lg">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Average</p>
                    <p className="text-xl font-bold text-cyan-400 mt-2">{result.avgTimeMs.toFixed(2)} ms</p>
                  </div>
                  <div className="p-4 bg-zinc-900 border border-zinc-850 rounded-lg">
                    <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Median</p>
                    <p className="text-xl font-bold text-white mt-2">{result.medianTimeMs.toFixed(2)} ms</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-20">
                  {!activeConnection ? "Database is disconnected. Benchmark requires an active connection." : "Launch loop to capture latency statistics."}
                </p>
              )}
            </div>

            {result && (
              <div className="mt-8 pt-6 border-t border-zinc-800 text-xs text-zinc-400 space-y-2 font-mono">
                <p>Telemetry stats: Completed {result.iterations} iterations.</p>
                <div className="flex gap-2 flex-wrap pt-2">
                  {result.rawTimes.map((time: number, idx: number) => (
                    <span key={idx} className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">
                      Run {idx + 1}: {time.toFixed(1)} ms
                    </span>
                  ))}
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
