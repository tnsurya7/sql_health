import React, { useEffect, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  MetricCard,
  ScoreRing,
  GlassCard,
  PageHeader,
  SeverityBadge
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
  Server
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAppStore } from "../../store";

export const Dashboard: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const url = activeConnection ? `/api/dashboard?connectionId=${activeConnection.id}` : "/api/dashboard";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeConnection]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
      </div>
    );
  }

  const { kpis, healthScore, charts, recentRecommendations, connectionName, isConnected, status, databaseType } = data || {};

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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Database Intelligence"
        subtitle={`Real-time SQL observability, execution plan telemetry, and algorithmic optimization. Target: ${connectionName || "No Database Connected"}`}
        action={
          isConnected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20 font-mono font-bold">
              <Zap className="w-3.5 h-3.5" />
              ONLINE ({databaseType?.toUpperCase()})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-400 text-xs border border-zinc-700">
              <PowerOff className="w-3.5 h-3.5" />
              DISCONNECTED
            </span>
          )
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

      {/* Health score gauges - prominent, large, and clearly visible cards */}
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
            {/* Card 1: Overall Score */}
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

            {/* Card 2: Performance */}
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

            {/* Card 3: Security */}
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

            {/* Card 4: Indexing */}
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

            {/* Card 5: Quality */}
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

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
        <MetricCard title="Total Queries" value={kpis?.totalQueries || 0} icon={<FileCode className="w-5 h-5" />} />
        <MetricCard title="Slow Queries" value={kpis?.slowQueries || 0} icon={<Clock className="w-5 h-5" />} />
        <MetricCard title="Critical Issues" value={kpis?.criticalIssues || 0} icon={<AlertOctagon className="w-5 h-5 text-rose-400" />} />
        <MetricCard title="High Issues" value={kpis?.highIssues || 0} icon={<AlertOctagon className="w-5 h-5 text-orange-400" />} />
        <MetricCard title="Index Recs" value={kpis?.indexRecommendations || 0} icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />} />
        <MetricCard title="Tables Count" value={kpis?.databaseObjects || 0} icon={<Database className="w-5 h-5 text-cyan-400" />} />
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

      {/* Slowest Queries and Recommendations List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-4">Top Analyzed Queries</h3>
          <div className="space-y-3">
            {charts?.topSlowQueries && charts.topSlowQueries.length > 0 ? (
              charts.topSlowQueries.map((q: any) => (
                <div key={q.id} className="flex justify-between items-center p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition">
                  <div className="truncate mr-4">
                    <code className="text-xs font-mono text-zinc-300 block truncate">{q.sql}</code>
                    <span className="text-[10px] text-zinc-500 block mt-1">{new Date(q.createdAt).toLocaleString()}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
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
          <h3 className="text-sm font-semibold text-white mb-4">Recent Index/Performance Advisor Alerts</h3>
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
    </div>
  );
};
