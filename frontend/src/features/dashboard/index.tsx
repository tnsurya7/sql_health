import React, { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  MetricCard,
  ScoreRing,
  GlassCard,
  PageHeader,
  SeverityBadge,
  StatusBadge
} from "../../components/UI";
import {
  Database,
  AlertOctagon,
  Clock,
  Sparkles,
  Zap,
  TrendingDown,
  FileCode,
  ShieldCheck,
  PowerOff,
  ArrowRight,
  Server,
  X,
  Search,
  Filter,
  ExternalLink,
  Code2,
  RefreshCw,
  Layers,
  AlertTriangle,
  CheckCircle2
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";

interface DrilldownItem {
  id: string;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  ruleCode?: string;
  affectedObject?: string;
  query?: string;
  evidence?: string;
  explanation: string;
  recommendedAction: string;
  category?: string;
  date?: string;
  isLive?: boolean;
}

export const Dashboard: React.FC = () => {
  const { activeConnection } = useAppStore();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown Modal State
  const [drilldownType, setDrilldownType] = useState<string | null>(null);
  const [drilldownTitle, setDrilldownTitle] = useState("");
  const [drilldownItems, setDrilldownItems] = useState<DrilldownItem[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [isScanningProcedures, setIsScanningProcedures] = useState(false);

  const fetchDashboardData = async () => {
    setError(null);
    try {
      const url = activeConnection ? `/api/dashboard?connectionId=${activeConnection.id}` : "/api/dashboard";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error?.message || "Failed to load dashboard data");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Network error loading dashboard telemetry");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeConnection]);

  // Open drilldown dialog
  const handleOpenDrilldown = async (type: string, title: string) => {
    if (type === "tables") {
      navigate("/schema-explorer");
      return;
    }

    setDrilldownType(type);
    setDrilldownTitle(title);
    setDrilldownLoading(true);
    setDrilldownError(null);
    setSearchFilter("");
    setSeverityFilter("ALL");

    try {
      const connParam = activeConnection ? `&connectionId=${activeConnection.id}` : "";
      const res = await fetch(`/api/dashboard/drilldown?type=${type}${connParam}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        const items = Array.isArray(json.data?.items)
          ? json.data.items
          : Array.isArray(json.data)
          ? json.data
          : [];
        setDrilldownItems(items);
      } else {
        setDrilldownError(json.error?.message || "Failed to retrieve drilldown records");
      }
    } catch (err: any) {
      setDrilldownError(err.message || "Failed to fetch drilldown findings");
    } finally {
      setDrilldownLoading(false);
    }
  };

  const handleRunBatchScan = async () => {
    if (!activeConnection) return;
    setIsScanningProcedures(true);
    try {
      const res = await fetch(`/api/procedures/summary?connectionId=${activeConnection.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        await fetchDashboardData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsScanningProcedures(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="animate-spin rounded-full h-9 w-9 border-t-2 border-cyan-400" />
        <p className="text-xs text-zinc-400 font-mono">Aggregating database intelligence & routine metrics...</p>
      </div>
    );
  }

  const {
    kpis,
    healthScore,
    charts,
    recentRecommendations,
    connectionName,
    isConnected,
    status,
    databaseType,
    procedureQuality
  } = data || {};

  // ECharts Theme Settings
  const lineChartOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis" },
    grid: { left: "3%", right: "4%", bottom: "3%", containLabel: true },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: charts?.executionTimeTrend?.map((d: any) => d.date) || [],
      axisLabel: { color: "#71717a" },
      axisLine: { lineStyle: { color: "#27272a" } }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#71717a" },
      axisLine: { lineStyle: { color: "#27272a" } },
      splitLine: { lineStyle: { color: "#27272a" } }
    },
    series: [
      {
        name: "Avg execution time (ms)",
        type: "line",
        smooth: true,
        data: charts?.executionTimeTrend?.map((d: any) => d.avgTime) || [],
        itemStyle: { color: "#06b6d4" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(6, 182, 212, 0.3)" },
              { offset: 1, color: "rgba(6, 182, 212, 0)" }
            ]
          }
        }
      }
    ]
  };

  const pieChartOption = {
    backgroundColor: "transparent",
    tooltip: { trigger: "item" },
    legend: { bottom: "0", left: "center", textStyle: { color: "#a1a1aa" } },
    series: [
      {
        name: "Issues Severity",
        type: "pie",
        radius: ["40%", "70%"],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 8, borderColor: "#18181b", borderWidth: 2 },
        label: { show: false },
        data: charts?.severityDistribution || []
      }
    ]
  };

  // Filter drilldown items
  const safeDrilldownItems = Array.isArray(drilldownItems) ? drilldownItems : [];
  const filteredDrilldownItems = safeDrilldownItems.filter((item) => {
    const matchesSeverity = severityFilter === "ALL" || (item.severity && item.severity.toUpperCase() === severityFilter.toUpperCase());
    const queryStr = searchFilter.toLowerCase();
    const matchesSearch =
      !queryStr ||
      (item.title && item.title.toLowerCase().includes(queryStr)) ||
      (item.ruleCode && item.ruleCode.toLowerCase().includes(queryStr)) ||
      (item.affectedObject && item.affectedObject.toLowerCase().includes(queryStr)) ||
      (item.query && item.query.toLowerCase().includes(queryStr)) ||
      (item.explanation && item.explanation.toLowerCase().includes(queryStr));
    return matchesSeverity && matchesSearch;
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Database Intelligence"
        subtitle={`Real-time SQL observability, execution plan telemetry, and algorithmic optimization. Target: ${connectionName || "No Database Connected"}`}
        action={
          <div className="flex items-center gap-3">
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20 font-mono font-bold">
                <Zap className="w-3.5 h-3.5" />
                ONLINE ({databaseType?.toUpperCase()})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-400 text-xs border border-zinc-700">
                <PowerOff className="w-3.5 h-3.5" />
                DISCONNECTED
              </span>
            )}
            <button
              onClick={fetchDashboardData}
              title="Refresh telemetry"
              className="p-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-white transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* Disconnected Notice Banner */}
      {!isConnected && (
        <GlassCard className="border border-zinc-800 bg-zinc-900/60 p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 justify-center md:justify-start">
              <Server className="w-4 h-4 text-cyan-400" />
              No Live Target Database Connected
            </h3>
            <p className="text-xs text-zinc-400 max-w-xl">
              Connect to your local or remote database to inspect live schemas, extract real EXPLAIN plans, calculate actual health scores, and run benchmarks.
            </p>
          </div>
          <Link
            to="/settings"
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition flex items-center gap-2 shrink-0 shadow-lg shadow-cyan-500/20"
          >
            Connect Database <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </GlassCard>
      )}

      {/* Health score gauges */}
      {healthScore && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Target Database Health Evaluation
            </h3>
            <span className="text-[11px] font-mono text-zinc-500">
              Grade {healthScore.grade} • Weighted Multi-Dimensional Model
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            <GlassCard className="p-5 flex flex-col items-center justify-between text-center border-cyan-500/30 bg-cyan-500/5 shadow-xl shadow-cyan-950/20">
              <div className="w-full flex justify-between items-center pb-2 border-b border-cyan-500/20 mb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Overall Score</span>
                <span className="text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Grade {healthScore.grade}
                </span>
              </div>
              <div className="py-2">
                <ScoreRing score={healthScore.overall} size={135} strokeWidth={10} sublabel="Overall" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 font-medium">Deterministic Global Health</p>
            </GlassCard>

            <GlassCard className="p-5 flex flex-col items-center justify-between text-center">
              <div className="w-full flex justify-between items-center pb-2 border-b border-zinc-800/80 mb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Performance</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                  35% Weight
                </span>
              </div>
              <div className="py-2">
                <ScoreRing score={healthScore.performance} size={130} strokeWidth={10} sublabel="Perf" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 font-medium">Cache Hit & I/O Spills</p>
            </GlassCard>

            <GlassCard className="p-5 flex flex-col items-center justify-between text-center">
              <div className="w-full flex justify-between items-center pb-2 border-b border-zinc-800/80 mb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Security</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                  20% Weight
                </span>
              </div>
              <div className="py-2">
                <ScoreRing score={healthScore.security} size={130} strokeWidth={10} sublabel="Security" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 font-medium">SSL & Read-Only Guard</p>
            </GlassCard>

            <GlassCard className="p-5 flex flex-col items-center justify-between text-center">
              <div className="w-full flex justify-between items-center pb-2 border-b border-zinc-800/80 mb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Indexing</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                  20% Weight
                </span>
              </div>
              <div className="py-2">
                <ScoreRing score={healthScore.indexHealth} size={130} strokeWidth={10} sublabel="Indexes" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 font-medium">Access Paths & Keys</p>
            </GlassCard>

            <GlassCard className="p-5 flex flex-col items-center justify-between text-center">
              <div className="w-full flex justify-between items-center pb-2 border-b border-zinc-800/80 mb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Quality</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                  15% Weight
                </span>
              </div>
              <div className="py-2">
                <ScoreRing score={healthScore.queryQuality} size={130} strokeWidth={10} sublabel="Quality" />
              </div>
              <p className="text-[11px] text-zinc-400 mt-2 font-medium">Deadlocks & Antipatterns</p>
            </GlassCard>
          </div>
        </div>
      )}

      {/* KPI Stats - Clickable Drill-down Counters */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>Click any counter below to inspect granular findings, rule codes, and query evidence:</span>
          <span className="text-cyan-400 font-mono">Live Interactive Counters</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
          <MetricCard
            title="Total Queries"
            value={kpis?.totalQueries || 0}
            icon={<FileCode className="w-5 h-5 text-cyan-400" />}
            clickable={false}
          />
          <MetricCard
            title="Slow Queries"
            value={kpis?.slowQueries || 0}
            icon={<Clock className="w-5 h-5 text-yellow-400" />}
            onClick={() => handleOpenDrilldown("slow_queries", "Slow Query Executions")}
            subtitle="Click to view measured runtimes"
          />
          <MetricCard
            title="Critical Issues"
            value={kpis?.criticalIssues || 0}
            icon={<AlertOctagon className="w-5 h-5 text-rose-400" />}
            onClick={() => handleOpenDrilldown("critical", "Critical Severity Findings")}
            subtitle="Click to drill down"
          />
          <MetricCard
            title="High Issues"
            value={kpis?.highIssues || 0}
            icon={<AlertOctagon className="w-5 h-5 text-orange-400" />}
            onClick={() => handleOpenDrilldown("high", "High Priority Findings")}
            subtitle="Click to drill down"
          />
          <MetricCard
            title="Index Recs"
            value={kpis?.indexRecommendations || 0}
            icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
            onClick={() => handleOpenDrilldown("index_recs", "Index Recommendations")}
            subtitle="Click to view candidates"
          />
          <MetricCard
            title="Tables Count"
            value={kpis?.databaseObjects || 0}
            icon={<Database className="w-5 h-5 text-cyan-400" />}
            onClick={() => handleOpenDrilldown("tables", "Database Tables & Schema")}
            subtitle="Click for Schema Explorer"
          />
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <GlassCard className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-4">Query Execution Time Trend (ms)</h3>
          <div className="h-72">
            {charts?.executionTimeTrend && charts.executionTimeTrend.length > 0 ? (
              <ReactECharts option={lineChartOption} style={{ height: "100%" }} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                No execution time telemetry recorded yet. Run queries or benchmarks to view trends.
              </div>
            )}
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-4">Issue Severity Distribution</h3>
          <div className="h-72">
            {charts?.severityDistribution && charts.severityDistribution.some((d: any) => d.value > 0) ? (
              <ReactECharts option={pieChartOption} style={{ height: "100%" }} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-zinc-500">
                No active issues recorded in query history.
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      {/* SonarQube-Style Stored Procedure Quality Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Code2 className="w-4 h-4 text-cyan-400" />
              Stored Procedure & Routine Code Quality
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Static AST inspection for PL/pgSQL routines: unused variables, dead stores, unreachable branches, and resource leaks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunBatchScan}
              disabled={isScanningProcedures || !isConnected}
              className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningProcedures ? "animate-spin text-cyan-400" : ""}`} />
              {isScanningProcedures ? "Scanning Routines..." : "Scan Database Routines"}
            </button>
            <Link
              to="/procedures"
              className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold rounded-lg transition flex items-center gap-1"
            >
              Open Procedure Analyzer <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {procedureQuality ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 cols: Metrics & Severity breakdown */}
            <div className="lg:col-span-2 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <GlassCard className="p-4 text-center">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Procedures Analyzed</p>
                  <p className="text-2xl font-mono font-bold text-white mt-1">{procedureQuality.analyzed}</p>
                </GlassCard>
                <GlassCard className="p-4 text-center">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Clean Routines</p>
                  <p className="text-2xl font-mono font-bold text-emerald-400 mt-1">{procedureQuality.cleanProcedures}</p>
                </GlassCard>
                <GlassCard className="p-4 text-center">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Requiring Review</p>
                  <p className="text-2xl font-mono font-bold text-orange-400 mt-1">{procedureQuality.requiringReview}</p>
                </GlassCard>
                <GlassCard className="p-4 text-center">
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Total Findings</p>
                  <p className="text-2xl font-mono font-bold text-rose-400 mt-1">{procedureQuality.totalFindings}</p>
                </GlassCard>
              </div>

              {/* Severity bar */}
              <GlassCard className="p-4">
                <p className="text-xs font-semibold text-zinc-300 mb-2">Findings Severity Breakdown</p>
                <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
                  <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded">
                    <span className="text-rose-400 font-bold block">{procedureQuality.critical}</span>
                    <span className="text-[10px] text-zinc-400 uppercase">Critical</span>
                  </div>
                  <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded">
                    <span className="text-orange-400 font-bold block">{procedureQuality.high}</span>
                    <span className="text-[10px] text-zinc-400 uppercase">High</span>
                  </div>
                  <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                    <span className="text-yellow-400 font-bold block">{procedureQuality.medium}</span>
                    <span className="text-[10px] text-zinc-400 uppercase">Medium</span>
                  </div>
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded">
                    <span className="text-blue-400 font-bold block">{procedureQuality.low}</span>
                    <span className="text-[10px] text-zinc-400 uppercase">Low</span>
                  </div>
                </div>
              </GlassCard>
            </div>

            {/* Right col: Highest risk procedures */}
            <GlassCard className="p-4 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  Highest-Risk Routines
                </h4>
                <div className="space-y-2">
                  {procedureQuality.highestRiskProcedures && procedureQuality.highestRiskProcedures.length > 0 ? (
                    procedureQuality.highestRiskProcedures.slice(0, 4).map((proc: any, idx: number) => (
                      <Link
                        key={idx}
                        to="/procedures"
                        className="flex items-center justify-between p-2.5 rounded bg-zinc-900 border border-zinc-800 hover:border-cyan-500/40 hover:bg-zinc-850 transition text-xs group"
                      >
                        <div className="truncate mr-2">
                          <code className="font-mono text-zinc-200 group-hover:text-cyan-400 transition truncate block">
                            {proc.schema}.{proc.name}
                          </code>
                          <span className="text-[10px] text-zinc-500 block">
                            {proc.findingsCount} findings detected
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold shrink-0 ${
                            proc.score < 70
                              ? "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                              : proc.score < 85
                              ? "text-orange-400 bg-orange-500/10 border border-orange-500/20"
                              : "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          }`}
                        >
                          Score {proc.score}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <div className="py-8 text-center text-xs text-zinc-500">
                      {isConnected
                        ? "No risky stored procedures detected."
                        : "Connect database to introspect stored procedure definitions."}
                    </div>
                  )}
                </div>
              </div>
              <Link
                to="/procedures"
                className="mt-3 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center justify-end gap-1"
              >
                Inspect All Routines <ArrowRight className="w-3 h-3" />
              </Link>
            </GlassCard>
          </div>
        ) : (
          <GlassCard className="p-6 text-center text-xs text-zinc-400 space-y-3">
            <p>Stored procedure static analysis has not been executed yet on this database.</p>
            <button
              onClick={handleRunBatchScan}
              disabled={isScanningProcedures || !isConnected}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition inline-flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningProcedures ? "animate-spin" : ""}`} />
              Run AST Static Code Scan
            </button>
          </GlassCard>
        )}
      </div>

      {/* Slowest Queries and Recommendations List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Top Analyzed Queries</h3>
            <Link to="/history" className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1">
              View History <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {charts?.topSlowQueries && charts.topSlowQueries.length > 0 ? (
              charts.topSlowQueries.map((q: any) => (
                <div key={q.id} className="flex justify-between items-center p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition">
                  <div className="truncate mr-4">
                    <code className="text-xs font-mono text-zinc-300 block truncate">{q.sql}</code>
                    <span className="text-[10px] text-zinc-500 block mt-1">{new Date(q.createdAt).toLocaleString()}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold shrink-0 ${
                    q.score >= 80 ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                  }`}>
                    Score: {q.score}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500 py-8 text-center">No SQL queries analyzed yet.</p>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Recent Advisor Recommendations</h3>
            <Link to="/recommendations" className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1">
              All Recommendations <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {recentRecommendations && recentRecommendations.length > 0 ? (
              recentRecommendations.map((r: any) => (
                <div key={r.id} className="flex justify-between items-start gap-4 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                  <div>
                    <h4 className="text-xs font-semibold text-white">{r.title}</h4>
                    <p className="text-xs text-zinc-400 mt-1">{r.description}</p>
                  </div>
                  <SeverityBadge severity={r.severity} />
                </div>
              ))
            ) : (
              <p className="text-xs text-zinc-500 py-8 text-center">No active alerts recorded.</p>
            )}
          </div>
        </GlassCard>
      </div>

      {/* Drilldown Modal (Issue 1) */}
      {drilldownType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {drilldownTitle}
                    <span className="text-xs font-mono font-normal text-zinc-400 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
                      {filteredDrilldownItems.length} findings
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Granular root-cause telemetry, rule codes, and recommended mitigations
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDrilldownType(null)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-950/50 flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <div className="relative flex-1 w-full">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by title, table, rule code (e.g. SP001), or query text..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="w-3.5 h-3.5 text-zinc-500" />
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {drilldownLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
                  <p className="text-xs text-zinc-500 font-mono">Querying actual findings...</p>
                </div>
              ) : drilldownError ? (
                <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                  <p className="font-bold">Error loading drill-down data:</p>
                  <p className="mt-1">{drilldownError}</p>
                </div>
              ) : filteredDrilldownItems.length === 0 ? (
                <div className="py-16 text-center space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                  <h4 className="text-sm font-semibold text-white">No Matching Findings Found</h4>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    {drilldownItems.length === 0
                      ? "There are currently no recorded findings for this category in the connected database or query log."
                      : "No findings matched your search/severity criteria. Try adjusting the filters above."}
                  </p>
                </div>
              ) : (
                filteredDrilldownItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700 transition space-y-3"
                  >
                    {/* Header line */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SeverityBadge severity={item.severity} />
                        {item.ruleCode && (
                          <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono text-[11px] font-bold">
                            {item.ruleCode}
                          </span>
                        )}
                        {item.category && (
                          <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                            {item.category}
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            item.isLive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {item.isLive ? "LIVE DATABASE" : "HISTORICAL"}
                        </span>
                      </div>
                      {item.date && (
                        <span className="text-[10px] font-mono text-zinc-500">
                          {new Date(item.date).toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <div>
                      <h4 className="text-sm font-bold text-white">{item.title}</h4>
                      {item.affectedObject && (
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">
                          Affected Object: <span className="text-cyan-400">{item.affectedObject}</span>
                        </p>
                      )}
                    </div>

                    {/* Associated Query */}
                    {item.query ? (
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                          Associated SQL Query
                        </span>
                        <pre className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap select-all">
                          {item.query}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-500 italic bg-zinc-900/40 p-2 rounded border border-zinc-850">
                        Notice: Schema-level finding; no standalone SQL query is associated with this object.
                      </div>
                    )}

                    {/* Evidence & Explanation */}
                    <div className="space-y-1.5 text-xs">
                      {item.evidence && (
                        <div className="text-zinc-300 bg-zinc-900/60 p-2.5 rounded border border-zinc-800/80">
                          <span className="text-zinc-500 font-semibold uppercase text-[10px] block mb-0.5">
                            Diagnostic Evidence:
                          </span>
                          <span className="font-mono text-[11px] text-cyan-300">{item.evidence}</span>
                        </div>
                      )}
                      <div className="text-zinc-300">
                        <span className="text-zinc-500 font-semibold uppercase text-[10px] block mb-0.5">
                          Root Cause Analysis:
                        </span>
                        <p className="text-zinc-300 leading-relaxed">{item.explanation}</p>
                      </div>
                    </div>

                    {/* Recommended Action */}
                    <div className="pt-2 border-t border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="text-emerald-400 font-semibold text-[10px] uppercase block">
                          Recommended Action:
                        </span>
                        <p className="text-zinc-300">{item.recommendedAction}</p>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        {item.ruleCode?.startsWith("SP") ? (
                          <Link
                            to="/procedures"
                            onClick={() => setDrilldownType(null)}
                            className="px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold rounded transition flex items-center gap-1"
                          >
                            Open Procedure <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : item.ruleCode?.includes("INDEX") ? (
                          <Link
                            to="/index-advisor"
                            onClick={() => setDrilldownType(null)}
                            className="px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold rounded transition flex items-center gap-1"
                          >
                            View Index Advisor <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : item.query ? (
                          <Link
                            to="/sql-analyzer"
                            onClick={() => setDrilldownType(null)}
                            className="px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold rounded transition flex items-center gap-1"
                          >
                            Analyze in SQL Analyzer <ExternalLink className="w-3 h-3" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-zinc-800 bg-zinc-900/90 flex justify-between items-center shrink-0">
              <span className="text-[11px] text-zinc-500 font-mono">
                Showing {filteredDrilldownItems.length} of {drilldownItems.length} records
              </span>
              <button
                onClick={() => setDrilldownType(null)}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg transition"
              >
                Close Drilldown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
