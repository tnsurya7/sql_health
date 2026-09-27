import React, { useState, useEffect } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import {
  Play,
  LineChart,
  ShieldAlert,
  Activity,
  AlertTriangle,
  TrendingUp,
  Fingerprint,
  Cpu,
  Layers
} from "lucide-react";
import { useAppStore } from "../../store";

export const Performance: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [activeTab, setActiveTab] = useState<"benchmark" | "timeseries" | "isolation" | "fingerprints">("benchmark");

  // Benchmark state
  const [sql, setSql] = useState("SELECT id, first_name, last_name FROM customers WHERE city = 'New York';");
  const [iterations, setIterations] = useState(5);
  const [warmup, setWarmup] = useState(true);
  const [benchmarkLoading, setBenchmarkLoading] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  // Time-Series and Metrics state
  const [metricsData, setMetricsData] = useState<any>(null);
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);

  const fetchMetrics = async () => {
    setMetricsLoading(true);
    try {
      const [resMetrics, resFp] = await Promise.all([
        fetch("/api/performance/metrics", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        }),
        fetch("/api/performance/fingerprints", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        })
      ]);

      const jsonMetrics = await resMetrics.json();
      const jsonFp = await resFp.json();

      if (jsonMetrics.success) setMetricsData(jsonMetrics.data);
      if (jsonFp.success) setFingerprints(jsonFp.data);
    } catch (err) {
      console.error("Failed to fetch performance metrics:", err);
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, [activeConnection]);

  const runBenchmark = async () => {
    setBenchmarkLoading(true);
    setBenchmarkError(null);
    setBenchmarkResult(null);

    const isSelect = /^\s*SELECT\b/i.test(sql);
    if (!isSelect) {
      setBenchmarkError("Benchmarking is restricted to SELECT queries only to prevent destructive operations.");
      setBenchmarkLoading(false);
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
        setBenchmarkResult(json.data);
        fetchMetrics(); // Refresh telemetry
      } else {
        setBenchmarkError(json.error?.message || "Failed to execute benchmarking.");
      }
    } catch (err: any) {
      setBenchmarkError(err.message);
    } finally {
      setBenchmarkLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Performance Observability & Telemetry"
        subtitle="Real execution benchmarking, Moving Averages, Z-Score Anomaly Detection, Change-Point Analytics, and Isolation Forest ML."
      />

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-800 gap-4">
        <button
          onClick={() => setActiveTab("benchmark")}
          className={`pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "benchmark"
              ? "border-cyan-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Play className="w-4 h-4" />
          Query Benchmarker
        </button>
        <button
          onClick={() => setActiveTab("timeseries")}
          className={`pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "timeseries"
              ? "border-cyan-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Activity className="w-4 h-4" />
          Time-Series & Z-Score Anomalies
        </button>
        <button
          onClick={() => setActiveTab("isolation")}
          className={`pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "isolation"
              ? "border-cyan-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Cpu className="w-4 h-4" />
          Isolation Forest Anomaly Model
        </button>
        <button
          onClick={() => setActiveTab("fingerprints")}
          className={`pb-3 text-xs font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === "fingerprints"
              ? "border-cyan-500 text-white"
              : "border-transparent text-zinc-400 hover:text-white"
          }`}
        >
          <Fingerprint className="w-4 h-4" />
          Query Fingerprints ({fingerprints.length})
        </button>
      </div>

      {/* Tab 1: Benchmarker */}
      {activeTab === "benchmark" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <GlassCard className="space-y-4">
              <h3 className="text-sm font-semibold text-white">Select Benchmark Query</h3>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                className="w-full h-36 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 font-mono focus:border-cyan-500 outline-none resize-none"
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Iterations</label>
                  <select
                    value={iterations}
                    onChange={(e) => setIterations(Number(e.target.value))}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white"
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
                disabled={benchmarkLoading || !activeConnection}
                className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                {benchmarkLoading ? "Benchmarking Live Database..." : "Start Benchmark Loop"}
              </button>
            </GlassCard>

            {benchmarkError && (
              <GlassCard className="border border-rose-500/20 bg-rose-500/5 flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-450 shrink-0" />
                <div>
                  <h4 className="text-xs font-semibold text-white">Benchmark Failed</h4>
                  <p className="text-xs text-zinc-400 mt-1">{benchmarkError}</p>
                </div>
              </GlassCard>
            )}
          </div>

          <div className="lg:col-span-2">
            <GlassCard className="min-h-[380px] flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white mb-6 flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-cyan-400" />
                  Benchmark Telemetry Report
                </h3>

                {benchmarkResult ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 font-mono text-center">
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Min Time</p>
                      <p className="text-xl font-bold text-white mt-2">{benchmarkResult.minTimeMs.toFixed(2)} ms</p>
                    </div>
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Max Time</p>
                      <p className="text-xl font-bold text-white mt-2">{benchmarkResult.maxTimeMs.toFixed(2)} ms</p>
                    </div>
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Average</p>
                      <p className="text-xl font-bold text-cyan-400 mt-2">{benchmarkResult.avgTimeMs.toFixed(2)} ms</p>
                    </div>
                    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg">
                      <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Median</p>
                      <p className="text-xl font-bold text-white mt-2">{benchmarkResult.medianTimeMs.toFixed(2)} ms</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-20">
                    {!activeConnection ? "Database is disconnected. Benchmark requires an active connection." : "Launch loop to capture live latency statistics."}
                  </p>
                )}
              </div>

              {benchmarkResult && (
                <div className="mt-8 pt-6 border-t border-zinc-800 text-xs text-zinc-400 space-y-2 font-mono">
                  <p>Telemetry stats: Completed {benchmarkResult.iterations} iterations with warm-up run.</p>
                  <div className="flex gap-2 flex-wrap pt-2">
                    {benchmarkResult.rawTimes.map((time: number, idx: number) => (
                      <span key={idx} className="bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700 text-zinc-300">
                        Run {idx + 1}: {time.toFixed(2)} ms
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          </div>
        </div>
      )}

      {/* Tab 2: Time-Series & Z-Score */}
      {activeTab === "timeseries" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <GlassCard className="p-4">
              <h4 className="text-xs font-bold uppercase text-zinc-400">Total Telemetry Points</h4>
              <p className="text-2xl font-mono font-bold text-white mt-2">
                {metricsData?.pointsCount || 0}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">Recorded query executions</p>
            </GlassCard>

            <GlassCard className="p-4">
              <h4 className="text-xs font-bold uppercase text-zinc-400">Z-Score Spike Anomalies</h4>
              <p className="text-2xl font-mono font-bold text-rose-400 mt-2">
                {metricsData?.zScoreReports?.filter((r: any) => r.isAnomaly).length || 0}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">Threshold: |Z| &gt; 2.5 std deviations</p>
            </GlassCard>

            <GlassCard className="p-4">
              <h4 className="text-xs font-bold uppercase text-zinc-400">Detected Change Points</h4>
              <p className="text-2xl font-mono font-bold text-yellow-400 mt-2">
                {metricsData?.changePoints?.length || 0}
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">CUSUM distribution shifts</p>
            </GlassCard>
          </div>

          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4">Time-Series Latency & Z-Score Evaluation</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse font-mono">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase">
                    <th className="pb-3">Timestamp</th>
                    <th className="pb-3">Latency (ms)</th>
                    <th className="pb-3">SMA (window 5)</th>
                    <th className="pb-3">Z-Score</th>
                    <th className="pb-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {metricsData?.zScoreReports?.length > 0 ? (
                    metricsData.zScoreReports.slice(-15).reverse().map((r: any, idx: number) => (
                      <tr key={idx} className="hover:bg-zinc-900/40">
                        <td className="py-2.5 text-zinc-400">{new Date(r.timestamp).toLocaleTimeString()}</td>
                        <td className="py-2.5 text-white font-bold">{r.value.toFixed(2)} ms</td>
                        <td className="py-2.5 text-zinc-300">
                          {metricsData.sma[idx] !== undefined ? `${metricsData.sma[idx].toFixed(2)} ms` : "N/A"}
                        </td>
                        <td className="py-2.5 text-cyan-400">{r.zScore.toFixed(2)}</td>
                        <td className="py-2.5">
                          {r.isAnomaly ? (
                            <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-sans font-bold">
                              ANOMALY SPIKE
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-sans">
                              NORMAL
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-zinc-500">
                        No performance telemetry data available. Run queries or benchmarks to populate.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Tab 3: Isolation Forest */}
      {activeTab === "isolation" && (
        <div className="space-y-6">
          <GlassCard className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  Isolation Forest Multi-Dimensional Anomaly Detector
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Evaluates multidimensional feature trees across Latency, Plan Rows, and Execution Cost.
                </p>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded font-mono font-bold ${
                metricsData?.isolationForest?.isSufficientData
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
              }`}>
                {metricsData?.isolationForest?.isSufficientData ? "Model Active" : "Insufficient Data"}
              </span>
            </div>

            {!metricsData?.isolationForest?.isSufficientData ? (
              <div className="p-8 text-center text-zinc-500 border border-zinc-800/60 rounded-xl">
                <p className="text-sm text-zinc-400">
                  {metricsData?.isolationForest?.message || "Insufficient historical data for Isolation Forest. Minimum 10 execution points required."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 uppercase">
                      <th className="pb-3">Record ID</th>
                      <th className="pb-3">Latency</th>
                      <th className="pb-3">Rows</th>
                      <th className="pb-3">Cost</th>
                      <th className="pb-3">Anomaly Score</th>
                      <th className="pb-3">Classification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {metricsData.isolationForest.scoredData?.map((item: any) => (
                      <tr key={item.id} className="hover:bg-zinc-900/40">
                        <td className="py-2.5 text-zinc-400 truncate max-w-[120px]">{item.id}</td>
                        <td className="py-2.5 text-white">{item.latencyMs.toFixed(2)} ms</td>
                        <td className="py-2.5 text-zinc-300">{item.rows}</td>
                        <td className="py-2.5 text-zinc-300">{item.executionCost}</td>
                        <td className="py-2.5 text-cyan-400">{item.anomalyScore.toFixed(3)}</td>
                        <td className="py-2.5">
                          {item.isAnomaly ? (
                            <span className="text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded font-sans font-bold">
                              ISOLATION ANOMALY
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-sans">
                              NORMAL
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* Tab 4: Fingerprints Registry */}
      {activeTab === "fingerprints" && (
        <div className="space-y-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-cyan-400" />
              Parameterized Query Fingerprints & Aggregation
            </h3>
            <div className="space-y-3">
              {fingerprints.length > 0 ? (
                fingerprints.map((fp) => (
                  <div key={fp.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <code className="text-xs text-white font-mono">{fp.fingerprint}</code>
                      <span className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded font-mono font-bold">
                        {fp.executionCount} executions
                      </span>
                    </div>
                    <code className="block text-[11px] text-zinc-400 bg-zinc-950 p-2 rounded font-mono truncate">
                      {fp.normalizedSql}
                    </code>
                    <div className="flex gap-6 text-[10px] text-zinc-500 font-mono pt-1">
                      <span>Avg: {fp.avgLatencyMs ? `${fp.avgLatencyMs.toFixed(2)} ms` : "N/A"}</span>
                      <span>P95: {fp.p95LatencyMs ? `${fp.p95LatencyMs.toFixed(2)} ms` : "N/A"}</span>
                      <span>Total: {fp.totalDurationMs ? `${fp.totalDurationMs.toFixed(2)} ms` : "N/A"}</span>
                      <span>Last Seen: {new Date(fp.lastSeenAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500 text-center py-12">
                  No query fingerprints captured yet. Run queries through SQL Analyzer to normalize.
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
};
