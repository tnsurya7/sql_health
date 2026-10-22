import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader, SeverityBadge, StatusBadge } from "../../components/UI";
import {
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  CheckCircle,
  Filter,
  Search,
  ExternalLink,
  RefreshCw,
  Database,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Archive,
  Layers,
  Sparkles,
  AlertTriangle
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";

interface Recommendation {
  id: string;
  category: "INDEXING" | "STORED_PROCEDURE" | "EXECUTION_PLAN" | "SQL_ANALYZER" | "HEALTH" | "ANOMALY" | "OPTIMIZATION";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  description: string;
  affectedObject?: string;
  evidence?: string;
  suggestedAction?: string;
  suggestedSql?: string;
  sourceModule?: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  createdAt?: string;
}

export const Recommendations: React.FC = () => {
  const { activeConnection } = useAppStore();
  const navigate = useNavigate();
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Sorting
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"severity" | "date" | "category">("severity");

  const fetchRecommendations = async () => {
    if (!activeConnection) {
      setRecs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("connectionId", activeConnection.id);
      if (categoryFilter !== "ALL") params.append("category", categoryFilter);
      if (severityFilter !== "ALL") params.append("severity", severityFilter);
      if (statusFilter !== "ALL") params.append("status", statusFilter);
      if (searchQuery) params.append("search", searchQuery);
      if (sortBy) params.append("sortBy", sortBy);

      const res = await fetch(`/api/recommendations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        const items = Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.data?.recommendations)
          ? json.data.recommendations
          : [];
        setRecs(items);
      } else {
        setError(json.error?.message || "Failed to fetch aggregated recommendations");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Network error loading recommendations");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") => {
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
        // Optimistically update local state
        setRecs((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [activeConnection, categoryFilter, severityFilter, statusFilter, sortBy]);

  // Debounced search trigger
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchRecommendations();
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const getSourcePath = (moduleName?: string): string => {
    switch (moduleName) {
      case "Index Advisor":
        return "/index-advisor";
      case "Stored Procedure Analyzer":
        return "/procedures";
      case "Execution Plans":
        return "/execution-plans";
      case "SQL Analyzer":
        return "/sql-analyzer";
      case "Database Health":
        return "/health";
      case "Performance Observability":
        return "/performance";
      default:
        return "/dashboard";
    }
  };

  const safeRecs = Array.isArray(recs) ? recs : [];
  const activeCount = safeRecs.filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED").length;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Optimization Recommendations"
        subtitle="Aggregated intelligence across SQL analysis, index advisors, execution plans, database health, anomaly telemetry, and stored procedure static analysis."
        action={
          <div className="flex items-center gap-3">
            {activeConnection && (
              <span className="text-xs text-zinc-400 font-mono">
                Target: <span className="text-white font-semibold">{activeConnection.name}</span>
              </span>
            )}
            <button
              onClick={fetchRecommendations}
              className="p-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-white transition"
              title="Refresh recommendations"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {/* Disconnected State */}
      {!activeConnection ? (
        <GlassCard className="text-center py-20 space-y-4">
          <Database className="w-12 h-12 text-zinc-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No Database Connected</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Connect to a database to aggregate real recommendations from execution plans, indexes, health metrics, and static procedure analysis.
            </p>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-cyan-500/20"
          >
            Connect Database <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </GlassCard>
      ) : (
        <>
          {/* Filter and Search Bar */}
          <GlassCard className="p-4 space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              {/* Search bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search by title, affected table/routine, evidence, or SQL..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">All Categories</option>
                  <option value="INDEXING">Indexing</option>
                  <option value="STORED_PROCEDURE">Stored Procedures</option>
                  <option value="EXECUTION_PLAN">Execution Plans</option>
                  <option value="SQL_ANALYZER">SQL Analyzer</option>
                  <option value="HEALTH">Database Health</option>
                  <option value="ANOMALY">Performance Anomalies</option>
                </select>

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

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OPEN">Open</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DISMISSED">Dismissed</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="severity">Sort by Severity</option>
                  <option value="date">Sort by Date</option>
                  <option value="category">Sort by Category</option>
                </select>
              </div>
            </div>

            {/* Quick stats summary */}
            <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-2 border-t border-zinc-800 font-mono">
              <span>
                Active Backlog: <strong className="text-cyan-400">{activeCount}</strong> open/acknowledged items
              </span>
              <span>Showing {recs.length} total recommendations</span>
            </div>
          </GlassCard>

          {/* Recommendations Content */}
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
              <p className="text-xs text-zinc-400 font-mono">Aggregating recommendations across all 7 diagnostic systems...</p>
            </div>
          ) : error ? (
            <GlassCard className="border border-rose-500/20 bg-rose-500/5 p-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Failed to Load Recommendations</h4>
              <p className="text-xs text-zinc-400">{error}</p>
              <button
                onClick={fetchRecommendations}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-semibold"
              >
                Retry
              </button>
            </GlassCard>
          ) : recs.length === 0 ? (
            <GlassCard className="text-center py-20 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">No Recommendations Found</h3>
              <p className="text-xs text-zinc-400 max-w-lg mx-auto">
                {searchQuery || categoryFilter !== "ALL" || severityFilter !== "ALL" || statusFilter !== "ALL"
                  ? "No recommendations matched your current filter criteria. Try resetting filters."
                  : "Database health is optimal! No missing indexes, execution plan bottlenecks, anomalous latencies, or routine static quality violations were detected."}
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-5">
              {recs.map((rec) => (
                <GlassCard key={rec.id} className="space-y-4 border-zinc-800 hover:border-zinc-700 transition">
                  {/* Top Bar: Category, Severity, Status, Source */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                          {rec.category.replace("_", " ")}
                        </span>
                        <SeverityBadge severity={rec.severity} />
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            rec.status === "OPEN"
                              ? "bg-zinc-800 text-zinc-300 border border-zinc-700"
                              : rec.status === "ACKNOWLEDGED"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : rec.status === "RESOLVED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-zinc-800 text-zinc-500 line-through"
                          }`}
                        >
                          {rec.status}
                        </span>
                        {rec.createdAt && (
                          <span className="text-[10px] font-mono text-zinc-500">
                            {new Date(rec.createdAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-white pt-1">{rec.title}</h3>
                      {rec.affectedObject && (
                        <p className="text-xs text-zinc-400 font-mono">
                          Affected: <span className="text-cyan-400">{rec.affectedObject}</span>
                        </p>
                      )}
                    </div>

                    {rec.sourceModule && (
                      <Link
                        to={getSourcePath(rec.sourceModule)}
                        className="px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-750 text-zinc-300 hover:text-white text-xs font-semibold rounded-lg transition inline-flex items-center gap-1.5 shrink-0 self-start"
                      >
                        Source: {rec.sourceModule} <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  {/* Description / Root Cause */}
                  <p className="text-xs text-zinc-300 leading-relaxed">{rec.description}</p>

                  {/* Evidence & Suggested SQL */}
                  {rec.evidence && (
                    <div className="p-2.5 rounded bg-zinc-950 border border-zinc-850 text-xs">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-0.5 font-sans">
                        Diagnostic Evidence:
                      </span>
                      <code className="text-cyan-300 font-mono text-[11px] block whitespace-pre-wrap">{rec.evidence}</code>
                    </div>
                  )}

                  {rec.suggestedSql && (
                    <div className="bg-zinc-950 border border-zinc-850 rounded-lg overflow-hidden font-mono text-xs">
                      <div className="bg-zinc-900/80 px-3 py-1.5 border-b border-zinc-800 text-[10px] text-zinc-500 uppercase font-bold">
                        Remediation SQL
                      </div>
                      <pre className="p-3 text-cyan-400 overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
                        {rec.suggestedSql}
                      </pre>
                    </div>
                  )}

                  {rec.suggestedAction && !rec.suggestedSql && (
                    <div className="text-xs text-zinc-300">
                      <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-0.5">
                        Suggested Remediation:
                      </span>
                      <p>{rec.suggestedAction}</p>
                    </div>
                  )}

                  {/* Lifecycle State Actions */}
                  <div className="pt-3 border-t border-zinc-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500 font-mono">
                      Status: {rec.status}
                    </span>

                    <div className="flex items-center gap-2">
                      {rec.status === "OPEN" && (
                        <button
                          onClick={() => updateStatus(rec.id, "ACKNOWLEDGED")}
                          className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded transition flex items-center gap-1"
                        >
                          <Clock className="w-3 h-3 text-blue-400" /> Acknowledge
                        </button>
                      )}

                      {rec.status !== "RESOLVED" && (
                        <button
                          onClick={() => updateStatus(rec.id, "RESOLVED")}
                          className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 hover:border-emerald-500/30 rounded transition flex items-center gap-1"
                        >
                          <CheckCircle className="w-3 h-3 text-emerald-400" /> Mark Resolved
                        </button>
                      )}

                      {rec.status !== "DISMISSED" && (
                        <button
                          onClick={() => updateStatus(rec.id, "DISMISSED")}
                          className="px-2.5 py-1 text-xs text-zinc-400 hover:text-rose-400 bg-zinc-900 border border-zinc-800 hover:border-rose-500/30 rounded transition flex items-center gap-1"
                        >
                          <Archive className="w-3 h-3" /> Dismiss
                        </button>
                      )}

                      {rec.status !== "OPEN" && (
                        <button
                          onClick={() => updateStatus(rec.id, "OPEN")}
                          className="px-2.5 py-1 text-xs text-zinc-400 hover:text-cyan-400 bg-zinc-900 border border-zinc-800 hover:border-cyan-500/30 rounded transition"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
