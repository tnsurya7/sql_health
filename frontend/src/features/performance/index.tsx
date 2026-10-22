import React, { useState, useEffect, useRef } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import {
  Play,
  Square,
  LineChart,
  ShieldAlert,
  Activity,
  AlertTriangle,
  TrendingUp,
  Fingerprint,
  Cpu,
  Layers,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowRight,
  Database,
  Sliders,
  GitCompare,
  Zap
} from "lucide-react";
import { useAppStore } from "../../store";

type BenchmarkStatus = "IDLE" | "RUNNING" | "STOPPED" | "COMPLETED" | "FAILED";

export const Performance: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [activeTab, setActiveTab] = useState<"benchmark" | "timeseries" | "isolation" | "fingerprints">("benchmark");

  // Benchmark state
  const [sql, setSql] = useState("SELECT id, first_name, last_name, email FROM customers WHERE city = 'New York';");
  const [enableComparison, setEnableComparison] = useState(false);
  const [compareSql, setCompareSql] = useState("SELECT id, first_name, last_name, email FROM customers WHERE city = 'New York' AND active = true;");
  const [iterations, setIterations] = useState(5);
  const [warmup, setWarmup] = useState(true);

  // Execution State Machine
  const [benchmarkStatus, setBenchmarkStatus] = useState<BenchmarkStatus>("IDLE");
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentProgressText, setCurrentProgressText] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<any>(null);

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
      if (jsonFp.success) {
        setFingerprints(Array.isArray(jsonFp.data) ? jsonFp.data : Array.isArray(jsonFp.data?.fingerprints) ? jsonFp.data.fingerprints : []);
      }
    } catch (err) {
      console.error("Failed to fetch performance metrics:", err);
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [activeConnection]);

  // Start Benchmark
  const runBenchmark = async () => {
    if (benchmarkStatus === "RUNNING") return; // Prevent duplicate loops

    setBenchmarkError(null);
    setBenchmarkResult(null);

    // Validate read-only SELECT workload
    const isSelect = /^\s*SELECT\b/i.test(sql);
    if (!isSelect) {
      setBenchmarkError("Benchmarking is strictly restricted to read-only SELECT queries to protect against data mutation.");
      setBenchmarkStatus("FAILED");
      return;
    }

    if (enableComparison && compareSql.trim()) {
      const isCompareSelect = /^\s*SELECT\b/i.test(compareSql);
      if (!isCompareSelect) {
        setBenchmarkError("Comparison query must also be a read-only SELECT query.");
        setBenchmarkStatus("FAILED");
        return;
      }
    }

    // Set up AbortController and timers
    abortControllerRef.current = new AbortController();
    setBenchmarkStatus("RUNNING");
    setElapsedTime(0);
    setCurrentProgressText(warmup ? "Executing warm-up run on target database..." : "Executing iteration 1...");

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      setElapsedTime(elapsed);

      // Estimate progress phases
      const approxTotalTime = (iterations * (enableComparison ? 2 : 1) * 0.2) + 0.3;
      const progressFraction = Math.min(0.95, elapsed / Math.max(1, approxTotalTime));
      const currentRunEst = Math.min(iterations, Math.floor(progressFraction * iterations) + 1);
      setCurrentProgressText(`Running iteration ${currentRunEst} of ${iterations} against live engine...`);
    }, 100);

    try {
      const res = await fetch("/api/sql/benchmark", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          sql,
          compareSql: enableComparison && compareSql.trim() ? compareSql.trim() : undefined,
          connectionId: activeConnection?.id || null,
          iterations,
          warmup
        }),
        signal: abortControllerRef.current.signal
      });

      const json = await res.json();
      if (json.success) {
        setBenchmarkResult(json.data);
        setBenchmarkStatus("COMPLETED");
        setCurrentProgressText(`Completed ${iterations} iterations in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
        fetchMetrics(); // Refresh telemetry
      } else {
        setBenchmarkError(json.error?.message || "Benchmark failed during execution.");
        setBenchmarkStatus("FAILED");
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setBenchmarkStatus("STOPPED");
        setBenchmarkError("Benchmark loop safely cancelled by user.");
      } else {
        setBenchmarkError(err.message || "Failed to communicate with benchmark service.");
        setBenchmarkStatus("FAILED");
      }
    } finally {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      abortControllerRef.current = null;
    }
  };

  // Safe cancellation
  const stopBenchmark = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Performance Observability & Telemetry"
        subtitle="Live execution benchmarking, Moving Averages, Z-Score Anomaly Detection, Change-Point Analytics, and Isolation Forest ML."
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
          {/* Controls Column */}
          <div className="space-y-6">
            <GlassCard className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Target Benchmark Query</h3>
                <span className="text-[10px] uppercase font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                  Read-Only SELECT
                </span>
              </div>

              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                disabled={benchmarkStatus === "RUNNING"}
                placeholder="Enter SELECT statement..."
                className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 font-mono focus:border-cyan-500 outline-none resize-none leading-relaxed"
              />

              {/* Comparison Query Toggle */}
              <div className="pt-2 border-t border-zinc-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-zinc-300 font-medium flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableComparison}
                      onChange={(e) => setEnableComparison(e.target.checked)}
                      disabled={benchmarkStatus === "RUNNING"}
                      className="rounded border-zinc-700 text-cyan-500 focus:ring-0"
                    />
                    <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
                    Before vs After Comparison
                  </label>
                  <span className="text-[10px] text-zinc-500 font-mono">Optional Alternate SQL</span>
                </div>

                {enableComparison && (
                  <textarea
                    value={compareSql}
                    onChange={(e) => setCompareSql(e.target.value)}
                    disabled={benchmarkStatus === "RUNNING"}
                    placeholder="Enter candidate / optimized SELECT statement..."
                    className="w-full h-24 bg-zinc-950 border border-cyan-500/30 rounded-lg p-2.5 text-xs text-cyan-300 font-mono focus:border-cyan-400 outline-none resize-none leading-relaxed"
                  />
                )}
              </div>

              {/* Execution Options */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Iterations</label>
                  <select
                    value={iterations}
                    onChange={(e) => setIterations(Number(e.target.value))}
                    disabled={benchmarkStatus === "RUNNING"}
                    className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value={3}>3 Iterations</option>
                    <option value={5}>5 Iterations</option>
                    <option value={10}>10 Iterations</option>
                    <option value={20}>20 Iterations</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="warmup"
                    checked={warmup}
                    onChange={(e) => setWarmup(e.target.checked)}
                    disabled={benchmarkStatus === "RUNNING"}
                    className="rounded border-zinc-800 text-cyan-500 focus:ring-0"
                  />
                  <label htmlFor="warmup" className="text-xs text-zinc-400 cursor-pointer">
                    Buffer Warm-Up Run
                  </label>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2">
                {benchmarkStatus === "RUNNING" ? (
                  <button
                    onClick={stopBenchmark}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
                  >
                    <Square className="w-3.5 h-3.5 fill-white" />
                    Stop / Cancel Benchmark
                  </button>
                ) : (
                  <button
                    onClick={runBenchmark}
                    disabled={!activeConnection}
                    className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-white font-semibold text-xs rounded-lg transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    Start Benchmark Loop
                  </button>
                )}
              </div>
            </GlassCard>

            {/* Error / Cancellation Notice */}
            {benchmarkError && (
              <GlassCard
                className={`border p-4 flex items-start gap-3 ${
                  benchmarkStatus === "STOPPED"
                    ? "border-yellow-500/20 bg-yellow-500/5 text-yellow-300"
                    : "border-rose-500/20 bg-rose-500/5 text-rose-300"
                }`}
              >
                {benchmarkStatus === "STOPPED" ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="text-xs">
                  <h4 className="font-semibold text-white">
                    {benchmarkStatus === "STOPPED" ? "Benchmark Stopped" : "Execution Halted"}
                  </h4>
                  <p className="mt-1 leading-relaxed">{benchmarkError}</p>
                </div>
              </GlassCard>
            )}
          </div>

          {/* Results Column */}
          <div className="lg:col-span-2">
            <GlassCard className="min-h-[460px] flex flex-col justify-between p-6">
              <div>
                <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <LineChart className="w-4 h-4 text-cyan-400" />
                    Benchmark Telemetry Report
                  </h3>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded ${
                        benchmarkStatus === "RUNNING"
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse"
                          : benchmarkStatus === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : benchmarkStatus === "FAILED"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : benchmarkStatus === "STOPPED"
                          ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      STATUS: {benchmarkStatus}
                    </span>
                  </div>
                </div>

                {/* Visible Live Progress while Running */}
                {benchmarkStatus === "RUNNING" && (
                  <div className="py-8 space-y-4">
                    <div className="flex justify-between items-center text-xs font-mono">
                      <span className="text-zinc-300 font-semibold flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-400 animate-spin" />
                        {currentProgressText}
                      </span>
                      <span className="text-cyan-400 font-bold">{elapsedTime.toFixed(1)}s elapsed</span>
                    </div>

                    <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-800">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-2.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.min(95, (elapsedTime / ((iterations * 0.25) || 1)) * 100)}%`
                        }}
                      />
                    </div>

                    <p className="text-[11px] text-zinc-500 italic text-center">
                      The page remains interactive. Press "Stop / Cancel Benchmark" anytime to cancel cleanly.
                    </p>
                  </div>
                )}

                {/* Completed Benchmark Results */}
                {benchmarkResult ? (
                  <div className="space-y-6">
                    {/* Primary Query Stats */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs uppercase font-bold text-zinc-400 font-mono">
                          {benchmarkResult.comparison ? "Baseline Query Latencies" : "Measured Run Latency"}
                        </span>
                        <span className="text-[11px] font-mono text-zinc-500">
                          {benchmarkResult.iterationsCount || (Array.isArray(benchmarkResult.iterations) ? benchmarkResult.iterations.length : iterations)} iterations • StdDev: {(benchmarkResult.stdDevMs ?? 0).toFixed(2)} ms
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-center">
                        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Min Time</p>
                          <p className="text-xl font-bold text-white mt-1">{(benchmarkResult.minTimeMs ?? 0).toFixed(2)} ms</p>
                        </div>
                        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Max Time</p>
                          <p className="text-xl font-bold text-white mt-1">{(benchmarkResult.maxTimeMs ?? 0).toFixed(2)} ms</p>
                        </div>
                        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Average</p>
                          <p className="text-xl font-bold text-cyan-400 mt-1">{(benchmarkResult.avgTimeMs ?? 0).toFixed(2)} ms</p>
                        </div>
                        <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-lg">
                          <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Median</p>
                          <p className="text-xl font-bold text-white mt-1">{(benchmarkResult.medianTimeMs ?? 0).toFixed(2)} ms</p>
                        </div>
                      </div>
                    </div>

                    {/* Before vs After Comparison Section */}
                    {benchmarkResult.comparison && (() => {
                      const comp = benchmarkResult.comparison;
                      const opt = comp.optimized || comp;
                      const isFaster = typeof comp.isImprovementVerified === "boolean"
                        ? comp.isImprovementVerified
                        : typeof comp.speedupMultiplier === "number"
                        ? comp.speedupMultiplier > 1
                        : Boolean(comp.isFaster);
                      const speedupPct = comp.latencyReductionPercent ?? comp.deltaPercent ?? (
                        benchmarkResult.avgTimeMs > 0
                          ? ((benchmarkResult.avgTimeMs - (opt.avgTimeMs ?? benchmarkResult.avgTimeMs)) / benchmarkResult.avgTimeMs) * 100
                          : 0
                      );
                      const deltaAvg = comp.deltaAvgMs ?? (benchmarkResult.avgTimeMs - (opt.avgTimeMs ?? benchmarkResult.avgTimeMs));

                      return (
                        <div className="p-4 rounded-xl bg-zinc-950 border border-cyan-500/30 space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs uppercase font-bold text-cyan-400 font-mono flex items-center gap-1.5">
                              <GitCompare className="w-4 h-4" />
                              Alternate / Candidate Query Measured Performance
                            </span>
                            <span
                              className={`px-2.5 py-0.5 rounded font-mono text-xs font-bold ${
                                isFaster
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                              }`}
                            >
                              {isFaster
                                ? `SPEEDUP: ${Math.abs(speedupPct).toFixed(1)}% FASTER`
                                : `SLOWDOWN: ${Math.abs(speedupPct).toFixed(1)}% SLOWER`}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-center">
                            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                              <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Min Time</p>
                              <p className="text-lg font-bold text-white mt-1">
                                {(opt.minTimeMs ?? 0).toFixed(2)} ms
                              </p>
                            </div>
                            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                              <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Max Time</p>
                              <p className="text-lg font-bold text-white mt-1">
                                {(opt.maxTimeMs ?? 0).toFixed(2)} ms
                              </p>
                            </div>
                            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                              <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Average</p>
                              <p
                                className={`text-lg font-bold mt-1 ${
                                  isFaster ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {(opt.avgTimeMs ?? 0).toFixed(2)} ms
                              </p>
                            </div>
                            <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                              <p className="text-[10px] uppercase font-bold text-zinc-500 font-sans">Delta</p>
                              <p
                                className={`text-lg font-bold mt-1 ${
                                  isFaster ? "text-emerald-400" : "text-rose-400"
                                }`}
                              >
                                {deltaAvg > 0 ? "-" : "+"}
                                {Math.abs(deltaAvg).toFixed(2)} ms
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Raw Execution Times Breakdown */}
                    {(() => {
                      const runs: number[] = Array.isArray(benchmarkResult.rawTimes)
                        ? benchmarkResult.rawTimes
                        : Array.isArray(benchmarkResult.iterations)
                        ? benchmarkResult.iterations.map((it: any) => typeof it === "number" ? it : it.durationMs)
                        : [];

                      if (runs.length === 0) return null;

                      return (
                        <div className="pt-4 border-t border-zinc-800 space-y-2">
                          <span className="text-[11px] uppercase font-bold text-zinc-400 font-mono">
                            Measured Iteration Runs (ms)
                          </span>
                          <div className="flex gap-2 flex-wrap font-mono text-xs">
                            {runs.map((time: number, idx: number) => (
                              <span
                                key={idx}
                                className="bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800 text-zinc-300"
                              >
                                Run {idx + 1}: <strong className="text-white">{(time ?? 0).toFixed(2)} ms</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : benchmarkStatus !== "RUNNING" ? (
                  <div className="py-20 text-center space-y-3">
                    <Database className="w-10 h-10 text-zinc-600 mx-auto" />
                    <h4 className="text-sm font-semibold text-white">No Benchmark Results Yet</h4>
                    <p className="text-xs text-zinc-400 max-w-md mx-auto">
                      {!activeConnection
                        ? "Connect to a target database from Settings to enable live execution benchmarking."
                        : "Configure your iterations and warm-up preference on the left, then click 'Start Benchmark Loop' to capture actual database execution times."}
                    </p>
                  </div>
                ) : null}
              </div>

              {/* Footer notes */}
              <div className="mt-8 pt-4 border-t border-zinc-800 text-[11px] text-zinc-500 font-mono flex items-center justify-between">
                <span>Safe Read-Only Protocol • Real Timed Measurements</span>
                {benchmarkResult && (
                  <span>Warmup: {benchmarkResult.warmup ? "Included" : "Bypassed"}</span>
                )}
              </div>
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
              <span
                className={`text-xs px-2.5 py-1 rounded font-mono font-bold ${
                  metricsData?.isolationForest?.isSufficientData
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                }`}
              >
                {metricsData?.isolationForest?.isSufficientData ? "Model Active" : "Insufficient Data"}
              </span>
            </div>

            {!metricsData?.isolationForest?.isSufficientData ? (
              <div className="p-8 text-center text-zinc-500 border border-zinc-800/60 rounded-xl">
                <p className="text-sm text-zinc-400">
                  {metricsData?.isolationForest?.message ||
                    "Insufficient historical data for Isolation Forest. Minimum 10 execution points required."}
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
              {Array.isArray(fingerprints) && fingerprints.length > 0 ? (
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
