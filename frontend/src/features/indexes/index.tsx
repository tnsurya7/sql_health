import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader, SeverityBadge } from "../../components/UI";
import {
  ShieldAlert,
  Copy,
  Check,
  Play,
  Layers,
  Search,
  Database,
  Info,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  HardDrive,
  FileText,
  CheckCircle,
  XCircle,
  ExternalLink,
  ShieldCheck
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAppStore } from "../../store";

interface IndexRecommendation {
  id: string;
  table: string;
  columns: string[];
  indexType: string;
  definition: string;
  reason: string;
  evidence?: string;
  source: "SCHEMA_INSPECTION" | "WORKLOAD_ANALYSIS";
  existingIndexComparison: string;
  estimatedBenefit: string;
  confidence: number;
  confidenceExplanation: string;
  writeOverhead: "LOW" | "MEDIUM" | "HIGH";
  storageCost: "LOW" | "MEDIUM" | "HIGH";
  status: "VALIDATED" | "CANDIDATE";
  severity?: string;
}

export const IndexAdvisor: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [recs, setRecs] = useState<IndexRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<"all" | "schema" | "workload">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Authorization Modal State for CREATE INDEX
  const [applyCandidate, setApplyCandidate] = useState<IndexRecommendation | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string } | null>(null);

  const fetchRecommendations = async () => {
    if (!activeConnection) {
      setRecs([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/index-advisor/recommendations?mode=${modeFilter}&connectionId=${activeConnection.id}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        }
      );
      const json = await res.json();
      if (json.success) {
        const items = Array.isArray(json.data)
          ? json.data
          : Array.isArray(json.data?.recommendations)
          ? json.data.recommendations
          : [];
        setRecs(items);
      } else {
        setError(json.error?.message || "Failed to fetch index advisor recommendations");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Network error fetching index advisor recommendations");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (id: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleApplyIndex = async () => {
    if (!applyCandidate || !activeConnection) return;
    setIsApplying(true);
    setApplyResult(null);

    try {
      const res = await fetch("/api/index-advisor/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          connectionId: activeConnection.id,
          sql: applyCandidate.definition,
          confirmed: true
        })
      });

      const json = await res.json();
      if (json.success) {
        setApplyResult({
          success: true,
          message: `Index created successfully: ${json.data?.indexName || applyCandidate.definition}`
        });
        // Refresh recommendations after creation
        setTimeout(() => {
          fetchRecommendations();
          setApplyCandidate(null);
        }, 1500);
      } else {
        setApplyResult({
          success: false,
          message: json.error?.message || "Failed to apply index DDL"
        });
      }
    } catch (err: any) {
      setApplyResult({
        success: false,
        message: err.message || "Network error executing DDL"
      });
    } finally {
      setIsApplying(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [activeConnection, modeFilter]);

  const safeRecs = Array.isArray(recs) ? recs : [];
  const filteredRecs = safeRecs.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.table && r.table.toLowerCase().includes(q)) ||
      (Array.isArray(r.columns) && r.columns.some((c) => c.toLowerCase().includes(q))) ||
      (r.reason && r.reason.toLowerCase().includes(q)) ||
      (r.evidence && r.evidence.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Index Advisor"
        subtitle="Workload-driven and Schema-inspected physical index recommendation engine with cost, benefit, and write-overhead analysis."
        action={
          activeConnection ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-mono">
                Target: <span className="text-white font-semibold">{activeConnection.name}</span>
              </span>
            </div>
          ) : null
        }
      />

      {/* Disconnected State */}
      {!activeConnection ? (
        <GlassCard className="text-center py-20 space-y-4">
          <Database className="w-12 h-12 text-zinc-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">No Target Database Connected</h3>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Please connect to a live database first to introspect schemas, unindexed foreign keys, and query workloads.
            </p>
          </div>
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition shadow-lg shadow-cyan-500/20"
          >
            Configure Database Connections <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </GlassCard>
      ) : (
        <>
          {/* Controls & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            {/* Mode selection tabs */}
            <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs font-semibold">
              <button
                onClick={() => setModeFilter("all")}
                className={`px-3 py-1.5 rounded-md transition ${
                  modeFilter === "all"
                    ? "bg-cyan-500 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                All Advisories
              </button>
              <button
                onClick={() => setModeFilter("schema")}
                className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                  modeFilter === "schema"
                    ? "bg-cyan-500 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                Schema Inspection Mode (Unindexed FKs)
              </button>
              <button
                onClick={() => setModeFilter("workload")}
                className={`px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                  modeFilter === "workload"
                    ? "bg-cyan-500 text-white shadow"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                Workload Query Analysis
              </button>
            </div>

            {/* Search Box */}
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search table, column, or reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Mode Explanation Notice */}
          <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-lg text-xs text-zinc-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>
                {modeFilter === "schema"
                  ? "Schema Inspection Mode: Detects tables where foreign keys lack supporting indexes. In PostgreSQL, primary keys are auto-indexed, but foreign keys are NOT automatically indexed and often trigger full table sequential scans during JOINs or cascade deletes."
                  : modeFilter === "workload"
                  ? "Workload Analysis Mode: Synthesizes index recommendations based on measured WHERE predicates, JOIN conditions, ORDER BY and GROUP BY columns observed in executed queries."
                  : "Combined Mode: Aggregating structural schema candidates and measured workload-driven index advisories."}
              </span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500 shrink-0 ml-2">
              {filteredRecs.length} candidates
            </span>
          </div>

          {/* Main List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
              <p className="text-xs text-zinc-400 font-mono">Introspecting catalog metadata & workload predicates...</p>
            </div>
          ) : error ? (
            <GlassCard className="border border-rose-500/20 bg-rose-500/5 p-6 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Error Generating Recommendations</h4>
              <p className="text-xs text-zinc-400">{error}</p>
              <button
                onClick={fetchRecommendations}
                className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-xs font-semibold"
              >
                Retry
              </button>
            </GlassCard>
          ) : filteredRecs.length === 0 ? (
            <GlassCard className="text-center py-20 space-y-3">
              <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-sm font-bold text-white">No Missing Index Advisories</h3>
              <p className="text-xs text-zinc-400 max-w-lg mx-auto">
                {searchQuery
                  ? "No recommendations matched your search query."
                  : modeFilter === "workload"
                  ? "No workload query predicates require new indexes. Run queries through the SQL Analyzer or Benchmarker to collect query patterns."
                  : "All inspected foreign keys and primary keys in the connected database schema already possess index coverage."}
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-6">
              {filteredRecs.map((rec) => (
                <GlassCard key={rec.id} className="space-y-5 border-zinc-800 hover:border-zinc-700 transition">
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                            rec.source === "SCHEMA_INSPECTION"
                              ? "bg-purple-500/10 text-purple-300 border-purple-500/20"
                              : "bg-cyan-500/10 text-cyan-300 border-cyan-500/20"
                          }`}
                        >
                          {rec.source === "SCHEMA_INSPECTION" ? "SCHEMA-BASED CANDIDATE" : "WORKLOAD-MEASURED"}
                        </span>
                        <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                          {rec.indexType}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            rec.status === "VALIDATED"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                          }`}
                        >
                          {rec.status}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white pt-1">
                        Table: <span className="text-cyan-400 font-mono">{rec.table}</span>
                      </h3>
                      <p className="text-xs text-zinc-300 leading-relaxed">{rec.reason}</p>
                    </div>

                    <div className="flex items-center sm:flex-col items-end gap-2 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Confidence</span>
                        <span className="text-base font-mono font-bold text-cyan-400">{rec.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Proposed Index Definition */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden font-mono text-xs">
                    <div className="flex justify-between items-center bg-zinc-900 px-4 py-2 border-b border-zinc-800 shrink-0">
                      <span className="text-zinc-500 font-bold text-[10px] uppercase tracking-wider">
                        Proposed DDL (Explicit User Authorization Required)
                      </span>
                      <button
                        onClick={() => handleCopy(rec.id, rec.definition)}
                        className="text-zinc-400 hover:text-white flex items-center gap-1 text-[11px]"
                      >
                        {copiedId === rec.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy DDL
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3 text-cyan-400 overflow-x-auto select-all leading-relaxed whitespace-pre-wrap">
                      {rec.definition}
                    </pre>
                  </div>

                  {/* Multi-Dimensional Impact & Cost Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] uppercase font-sans text-zinc-500 block">Estimated Benefit</span>
                      <span className="text-emerald-400 font-bold">{rec.estimatedBenefit}</span>
                    </div>

                    <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] uppercase font-sans text-zinc-500 block">Write Overhead</span>
                      <span
                        className={`font-bold ${
                          rec.writeOverhead === "LOW"
                            ? "text-emerald-400"
                            : rec.writeOverhead === "MEDIUM"
                            ? "text-yellow-400"
                            : "text-rose-400"
                        }`}
                      >
                        {rec.writeOverhead}
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] uppercase font-sans text-zinc-500 block">Storage Cost</span>
                      <span
                        className={`font-bold ${
                          rec.storageCost === "LOW"
                            ? "text-emerald-400"
                            : rec.storageCost === "MEDIUM"
                            ? "text-yellow-400"
                            : "text-rose-400"
                        }`}
                      >
                        {rec.storageCost}
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800">
                      <span className="text-[10px] uppercase font-sans text-zinc-500 block">Target Columns</span>
                      <span className="text-zinc-300 font-bold truncate block">
                        ({rec.columns.join(", ")})
                      </span>
                    </div>
                  </div>

                  {/* Diagnostic Evidence & Existing Comparison */}
                  <div className="space-y-2 text-xs">
                    {rec.evidence && (
                      <div className="p-2.5 rounded bg-zinc-900/50 border border-zinc-800 text-zinc-300">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-0.5">
                          Evidence / Pattern:
                        </span>
                        <code className="text-cyan-300 font-mono text-[11px] block">{rec.evidence}</code>
                      </div>
                    )}

                    <div className="p-2.5 rounded bg-zinc-900/50 border border-zinc-800 text-zinc-300">
                      <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-0.5">
                        Existing Index Comparison & Overlap Check:
                      </span>
                      <p className="text-zinc-400">{rec.existingIndexComparison}</p>
                    </div>

                    <div className="text-[11px] text-zinc-500 italic">
                      Confidence Calculation: {rec.confidenceExplanation}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-zinc-800 flex items-center justify-end gap-3">
                    <button
                      onClick={() => setApplyCandidate(rec)}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" />
                      Authorize & Apply Index
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}

          {/* Authorization Modal for CREATE INDEX */}
          {applyCandidate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-lg">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Explicit Index Authorization</h3>
                    <p className="text-xs text-zinc-400">Confirmation required before executing DDL</p>
                  </div>
                </div>

                <div className="text-xs text-zinc-300 space-y-2">
                  <p>
                    You are authorizing the execution of the following DDL statement on target database{" "}
                    <strong className="text-white">{activeConnection?.name}</strong>:
                  </p>
                  <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-cyan-400 text-[11px] overflow-x-auto whitespace-pre-wrap select-all">
                    {applyCandidate.definition}
                  </pre>
                  <div className="p-3 bg-zinc-950/80 rounded border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                    <p>• Uses non-blocking concurrent indexing (<code className="text-zinc-300 font-mono">CONCURRENTLY</code>) where supported.</p>
                    <p>• Estimated write overhead: <strong className="text-zinc-200">{applyCandidate.writeOverhead}</strong>.</p>
                    <p>• Estimated storage cost: <strong className="text-zinc-200">{applyCandidate.storageCost}</strong>.</p>
                  </div>
                </div>

                {applyResult && (
                  <div
                    className={`p-3 rounded text-xs flex items-center gap-2 ${
                      applyResult.success
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                        : "bg-rose-500/10 border border-rose-500/20 text-rose-300"
                    }`}
                  >
                    {applyResult.success ? (
                      <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    )}
                    <span>{applyResult.message}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setApplyCandidate(null);
                      setApplyResult(null);
                    }}
                    disabled={isApplying}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyIndex}
                    disabled={isApplying}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold text-xs rounded-lg transition flex items-center gap-2 shadow-lg shadow-cyan-500/20"
                  >
                    {isApplying ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-white" />
                        Executing DDL...
                      </>
                    ) : (
                      "Confirm & Execute"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
