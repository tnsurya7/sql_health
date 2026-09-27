import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import {
  Database,
  Table,
  Key,
  Layers,
  Search,
  Hash,
  HardDrive,
  CheckCircle2,
  ShieldCheck,
  Link as LinkIcon,
  RefreshCw,
  ExternalLink,
  Info,
} from "lucide-react";
import { useAppStore } from "../../store";

interface TableMeta {
  schema: string;
  name: string;
  tableName?: string;
  type: string;
  rowCount: number;
  sizeBytes: number;
  indexSizeBytes: number;
  totalSizeBytes: number;
  lastAnalyzed?: string | null;
  lastVacuumed?: string | null;
}

interface ColumnMeta {
  schema: string;
  table: string;
  name: string;
  columnName?: string;
  dataType: string;
  isNullable: boolean;
  isPk: boolean;
  isFk: boolean;
  fkRefTable?: string;
  fkRefColumn?: string;
  defaultVal?: string;
  ordinalPosition: number;
  distinctValues?: number;
  nullFraction?: number;
}

interface IndexMeta {
  schema: string;
  table: string;
  name: string;
  indexName?: string;
  type: string;
  isUnique: boolean;
  isPrimary: boolean;
  columns: string[];
  definition: string;
  indexDef?: string;
  sizeBytes: number;
  scansCount: number;
}

interface ConstraintMeta {
  name: string;
  schema: string;
  table: string;
  type: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK";
  columns: string[];
  refTable?: string;
  refColumns?: string[];
}

export const SchemaExplorer: React.FC = () => {
  const { activeConnection, token } = useAppStore();
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedTable, setSelectedTable] = useState<TableMeta | null>(null);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [indexes, setIndexes] = useState<IndexMeta[]>([]);
  const [constraints, setConstraints] = useState<ConstraintMeta[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"columns" | "indexes" | "constraints">("columns");

  const authToken = token || localStorage.getItem("token") || "";

  const fetchTables = async () => {
    if (!activeConnection) return;
    setLoadingTables(true);
    try {
      const res = await fetch(`/api/schema/tables?connectionId=${activeConnection.id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setTables(json.data);
        if (json.data.length > 0) {
          // Keep current selection if still present, otherwise select the first table
          setSelectedTable((prev) => {
            if (prev) {
              const prevName = prev.name || prev.tableName;
              const found = json.data.find((t: any) => (t.name || t.tableName) === prevName);
              if (found) return found;
            }
            return json.data[0];
          });
        } else {
          setSelectedTable(null);
        }
      }
    } catch (err) {
      console.error("[SchemaExplorer] Error fetching tables:", err);
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchTableDetails = async (table: TableMeta) => {
    const tableName = table.name || table.tableName;
    if (!tableName || !activeConnection) return;
    setLoadingDetails(true);

    try {
      const schemaName = table.schema || "public";
      const res = await fetch(
        `/api/schema/table-details?connectionId=${activeConnection.id}&table=${encodeURIComponent(tableName)}&schema=${encodeURIComponent(schemaName)}`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      const json = await res.json();

      if (json.success && json.data) {
        if (json.data.table) {
          setSelectedTable(json.data.table);
        }
        setColumns(json.data.columns || []);
        setIndexes(json.data.indexes || []);
        setConstraints(json.data.constraints || []);
      } else {
        // Fallback to separate endpoints if table-details route is not ready
        const [colRes, idxRes, conRes] = await Promise.all([
          fetch(`/api/schema/columns?connectionId=${activeConnection.id}&table=${encodeURIComponent(tableName)}&schema=${encodeURIComponent(schemaName)}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }),
          fetch(`/api/schema/indexes?connectionId=${activeConnection.id}&table=${encodeURIComponent(tableName)}&schema=${encodeURIComponent(schemaName)}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }),
          fetch(`/api/schema/constraints?connectionId=${activeConnection.id}&table=${encodeURIComponent(tableName)}&schema=${encodeURIComponent(schemaName)}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          }),
        ]);

        const [colJson, idxJson, conJson] = await Promise.all([colRes.json(), idxRes.json(), conRes.json()]);
        if (colJson.success) setColumns(colJson.data || []);
        if (idxJson.success) setIndexes(idxJson.data || []);
        if (conJson.success) setConstraints(conJson.data || []);
      }
    } catch (err) {
      console.error("[SchemaExplorer] Error fetching table details:", err);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchTables();
  }, [activeConnection?.id]);

  useEffect(() => {
    if (selectedTable) {
      fetchTableDetails(selectedTable);
    } else {
      setColumns([]);
      setIndexes([]);
      setConstraints([]);
    }
  }, [selectedTable?.name, selectedTable?.tableName, activeConnection?.id]);

  const filteredTables = tables.filter((t) => {
    const name = (t.name || t.tableName || "").toLowerCase();
    const schema = (t.schema || "").toLowerCase();
    return name.includes(searchFilter.toLowerCase()) || schema.includes(searchFilter.toLowerCase());
  });

  const formatBytes = (bytes: number) => {
    if (!bytes || isNaN(bytes) || bytes === 0) return "0.00 KB";
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Schema Explorer"
        subtitle={`Browse database schemas, tables, columns, constraints, foreign keys, and indexes for ${
          activeConnection?.name || "Target Database"
        }.`}
        action={
          <button
            onClick={() => fetchTables()}
            disabled={loadingTables || !activeConnection}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition border border-zinc-700 font-mono disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTables ? "animate-spin text-cyan-400" : ""}`} />
            Refresh Schema
          </button>
        }
      />

      {!activeConnection ? (
        <GlassCard className="text-center py-20">
          <Database className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white mb-1">No Active Database Selected</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Please select or connect a target database in Databases / Settings to explore catalog schemas.
          </p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Tables Sidebar */}
          <GlassCard className="lg:col-span-1 p-4 space-y-4 flex flex-col h-[calc(100vh-240px)] min-h-[500px]">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-cyan-400" />
                Tables List ({tables.length})
              </h3>
              {loadingTables && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Search tables..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Tables List Scrollable */}
            <div className="space-y-1 flex-1 overflow-y-auto pr-1">
              {loadingTables && tables.length === 0 ? (
                <div className="space-y-2 py-4">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-8 bg-zinc-850 animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : filteredTables.length === 0 ? (
                <div className="text-center py-10 text-xs text-zinc-500">
                  {searchFilter ? "No tables match filter" : "No tables found in catalog"}
                </div>
              ) : (
                filteredTables.map((t) => {
                  const tName = t.name || t.tableName || "Unnamed Table";
                  const isSelected =
                    (selectedTable?.name || selectedTable?.tableName) === tName;
                  return (
                    <button
                      key={`${t.schema}.${tName}`}
                      onClick={() => setSelectedTable(t)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center justify-between group ${
                        isSelected
                          ? "bg-cyan-500/15 border border-cyan-500/30 text-white font-semibold shadow-sm"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-850 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Table
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? "text-cyan-400" : "text-zinc-500 group-hover:text-zinc-400"
                          }`}
                        />
                        <span className="truncate font-mono">{tName}</span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0 ml-1.5">
                        {t.rowCount !== undefined ? `${t.rowCount.toLocaleString()} r` : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </GlassCard>

          {/* Table Details Main Panel */}
          {selectedTable ? (
            <div className="lg:col-span-3 space-y-6">
              {/* Table Metrics Header */}
              <GlassCard className="p-5 border-zinc-800 bg-zinc-900/60">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-mono uppercase">
                        {selectedTable.schema || "public"}
                      </span>
                      <h2 className="text-xl font-black text-white font-mono tracking-tight">
                        {selectedTable.name || selectedTable.tableName}
                      </h2>
                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold uppercase">
                        {selectedTable.type || "BASE TABLE"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      Relational metadata and storage metrics extracted from target database catalog.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedTable.lastAnalyzed && (
                      <span className="text-[11px] text-zinc-500 font-mono">
                        Analyzed: {new Date(selectedTable.lastAnalyzed).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* KPI stats for table */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
                  <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                      <Hash className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Estimated Rows</span>
                    </div>
                    <span className="text-lg font-black text-white font-mono">
                      {(selectedTable.rowCount || 0).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Table Data Size</span>
                    </div>
                    <span className="text-lg font-black text-white font-mono">
                      {formatBytes(selectedTable.sizeBytes)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>Index Size</span>
                    </div>
                    <span className="text-lg font-black text-white font-mono">
                      {formatBytes(selectedTable.indexSizeBytes)}
                    </span>
                  </div>

                  <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-850">
                    <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                      <span>Total Rel Size</span>
                    </div>
                    <span className="text-lg font-black text-white font-mono">
                      {formatBytes(selectedTable.totalSizeBytes || selectedTable.sizeBytes)}
                    </span>
                  </div>
                </div>
              </GlassCard>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                <button
                  onClick={() => setActiveTab("columns")}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                    activeTab === "columns"
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-850"
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  Columns ({columns.length})
                </button>

                <button
                  onClick={() => setActiveTab("indexes")}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                    activeTab === "indexes"
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-850"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  Indexes ({indexes.length})
                </button>

                <button
                  onClick={() => setActiveTab("constraints")}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                    activeTab === "constraints"
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-850"
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  Constraints ({constraints.length})
                </button>
              </div>

              {/* Details Content */}
              {loadingDetails ? (
                <div className="flex items-center justify-center min-h-[300px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
                </div>
              ) : activeTab === "columns" ? (
                /* Columns View */
                <GlassCard className="p-0 overflow-hidden">
                  <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Table className="w-4 h-4 text-cyan-400" />
                      Table Columns ({columns.length})
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 font-semibold uppercase tracking-wider text-[11px]">
                          <th className="py-3 px-4">#</th>
                          <th className="py-3 px-4">Column</th>
                          <th className="py-3 px-4">Data Type</th>
                          <th className="py-3 px-4">Nullable</th>
                          <th className="py-3 px-4">Keys / Constraints</th>
                          <th className="py-3 px-4">Default</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                        {columns.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-zinc-500 font-sans">
                              No columns retrieved for this table.
                            </td>
                          </tr>
                        ) : (
                          columns.map((c, idx) => {
                            const cName = c.name || c.columnName;
                            return (
                              <tr key={cName || idx} className="hover:bg-zinc-850/40 transition">
                                <td className="py-3 px-4 text-zinc-500">{c.ordinalPosition || idx + 1}</td>
                                <td className="py-3 px-4 font-bold text-white">{cName}</td>
                                <td className="py-3 px-4 text-cyan-300">{c.dataType}</td>
                                <td className="py-3 px-4">
                                  {c.isNullable ? (
                                    <span className="text-zinc-400">YES</span>
                                  ) : (
                                    <span className="text-amber-400/90 font-bold">NO</span>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {c.isPk && (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded font-sans font-bold shadow-sm">
                                        <Key className="w-2.5 h-2.5" /> PRIMARY KEY
                                      </span>
                                    )}
                                    {c.isFk && (
                                      <span
                                        className="inline-flex items-center gap-1 text-[10px] text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded font-sans font-bold shadow-sm"
                                        title={
                                          c.fkRefTable
                                            ? `References ${c.fkRefTable}(${c.fkRefColumn || ""})`
                                            : "Foreign Key"
                                        }
                                      >
                                        <LinkIcon className="w-2.5 h-2.5" />
                                        FK {c.fkRefTable ? `→ ${c.fkRefTable}` : ""}
                                      </span>
                                    )}
                                    {!c.isPk && !c.isFk && <span className="text-zinc-600">—</span>}
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-zinc-400 max-w-xs truncate">
                                  {c.defaultVal || <span className="text-zinc-600">NULL</span>}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              ) : activeTab === "indexes" ? (
                /* Indexes View */
                <GlassCard className="p-5 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers className="w-4 h-4 text-cyan-400" />
                      Table Indexes ({indexes.length})
                    </h3>
                  </div>

                  {indexes.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500">
                      <Layers className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs">No indexes created for this table.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4">
                      {indexes.map((idx, i) => {
                        const idxName = idx.name || idx.indexName;
                        const idxDef = idx.definition || idx.indexDef;
                        return (
                          <div
                            key={idxName || i}
                            className="p-4 bg-zinc-950/70 border border-zinc-800/80 rounded-xl space-y-3 font-mono"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">{idxName}</span>
                                {idx.isPrimary && (
                                  <span className="text-[10px] px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded font-sans font-bold">
                                    PRIMARY
                                  </span>
                                )}
                                {idx.isUnique && !idx.isPrimary && (
                                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded font-sans font-bold">
                                    UNIQUE
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px]">
                                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                                  {idx.type || "BTREE"}
                                </span>
                                {idx.sizeBytes > 0 && (
                                  <span className="text-zinc-500">{formatBytes(idx.sizeBytes)}</span>
                                )}
                              </div>
                            </div>

                            {idx.columns && idx.columns.length > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-sans">
                                <span className="text-zinc-500 text-[11px]">Indexed columns:</span>
                                <div className="flex flex-wrap gap-1">
                                  {idx.columns.map((c, ci) => (
                                    <span
                                      key={ci}
                                      className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-cyan-300 rounded text-[11px] font-mono"
                                    >
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {idxDef && (
                              <div className="p-2.5 bg-zinc-900/90 rounded border border-zinc-850 overflow-x-auto text-[11px] text-zinc-300 leading-relaxed">
                                {idxDef}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>
              ) : (
                /* Constraints View */
                <GlassCard className="p-5 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Key className="w-4 h-4 text-cyan-400" />
                      Table Constraints ({constraints.length})
                    </h3>
                  </div>

                  {constraints.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500">
                      <Key className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                      <p className="text-xs">No explicit constraints found for this table.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 font-mono">
                      {constraints.map((con, ci) => {
                        const colList = Array.isArray(con.columns)
                          ? con.columns.filter(Boolean).join(", ")
                          : typeof con.columns === "string"
                          ? con.columns
                          : "—";
                        const refColList = Array.isArray(con.refColumns)
                          ? con.refColumns.filter(Boolean).join(", ")
                          : typeof con.refColumns === "string"
                          ? con.refColumns
                          : "";

                        return (
                          <div
                            key={con.name || ci}
                            className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">{con.name || "Constraint"}</span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-sans font-bold ${
                                    con.type === "PRIMARY KEY"
                                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                      : con.type === "FOREIGN KEY"
                                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                      : "bg-zinc-800 text-zinc-300"
                                  }`}
                                >
                                  {con.type || "CONSTRAINT"}
                                </span>
                              </div>
                              <div className="text-xs text-zinc-400 font-sans">
                                Columns: <span className="font-mono text-zinc-300">{colList}</span>
                              </div>
                            </div>

                            {con.refTable && (
                              <div className="text-xs text-zinc-400 font-sans md:text-right">
                                References:{" "}
                                <span className="font-mono text-cyan-300 font-bold">
                                  {con.refTable} {refColList ? `(${refColList})` : ""}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>
              )}
            </div>
          ) : (
            <div className="lg:col-span-3 flex items-center justify-center min-h-[400px]">
              <p className="text-sm text-zinc-500">Select a table from the left list to inspect columns, constraints, and indexes.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
