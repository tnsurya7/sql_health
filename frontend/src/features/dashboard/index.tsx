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
  ShieldCheck
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const res = await fetch("/api/dashboard", {
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
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
      </div>
    );
  }

  const { kpis, healthScore, charts, recentRecommendations, connectionName } = data || {};

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
        subtitle={`Understand, optimize, and monitor database performance. Connected to: ${connectionName}`}
        action={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs border border-cyan-500/20">
            <Zap className="w-3.5 h-3.5" />
            Live Observing
          </span>
        }
      />

      {/* Health score gauges */}
      <GlassCard className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6 justify-center text-center">
        <ScoreRing score={healthScore?.overall || 0} size={100} strokeWidth={8} label="Overall" />
        <ScoreRing score={healthScore?.performance || 0} size={85} strokeWidth={6} label="Performance" />
        <ScoreRing score={healthScore?.security || 0} size={85} strokeWidth={6} label="Security" />
        <ScoreRing score={healthScore?.maintainability || 0} size={85} strokeWidth={6} label="Maintainability" />
        <ScoreRing score={healthScore?.indexHealth || 0} size={85} strokeWidth={6} label="Index Health" />
        <ScoreRing score={healthScore?.schemaQuality || 0} size={85} strokeWidth={6} label="Schema" />
        <ScoreRing score={healthScore?.queryQuality || 0} size={85} strokeWidth={6} label="Queries" />
      </GlassCard>

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
            <ReactECharts option={lineChartOption} style={{ height: "100%" }} />
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-4">Issue Severity Distribution</h3>
          <div className="h-72">
            <ReactECharts option={pieChartOption} style={{ height: "100%" }} />
          </div>
        </GlassCard>
      </div>

      {/* Slowest Queries and Recommendations List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-4">Top Slow Queries</h3>
          <div className="space-y-4">
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
              <p className="text-sm text-zinc-500">No query logs recorded.</p>
            )}
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-white mb-4">Recent Index/Performance Advisor Alerts</h3>
          <div className="space-y-4">
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
              <p className="text-sm text-zinc-500">No active alerts. Database is running smoothly!</p>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
