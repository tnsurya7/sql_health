import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import { Database, Table, Key, Info } from "lucide-react";
import { useAppStore } from "../../store";

export const SchemaExplorer: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [tables, setTables] = useState<any[]>([]);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchSchema = async () => {
    if (!activeConnection) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/schema/tables?connectionId=${activeConnection.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setTables(json.data);
        if (json.data.length > 0) setSelectedTable(json.data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchema();
  }, [activeConnection]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Schema Explorer"
        subtitle="Browse databases schemas, tables, columns, constraints and sizes."
      />

      {!activeConnection ? (
        <GlassCard className="text-center py-20">
          <p className="text-zinc-400">Please connect a database connection first to explore catalog schemas.</p>
        </GlassCard>
      ) : loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-cyan-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Tables Side Tree */}
          <GlassCard className="lg:col-span-1 p-4 space-y-4">
            <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-4 h-4 text-cyan-400" />
              Tables list ({tables.length})
            </h3>
            <div className="space-y-1">
              {tables.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTable(t)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${
                    selectedTable?.id === t.id
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  {t.tableName}
                </button>
              ))}
            </div>
          </GlassCard>

          {/* Table Details */}
          {selectedTable ? (
            <div className="lg:col-span-3 space-y-6">
              <GlassCard className="flex justify-between items-center bg-zinc-900/40 p-4">
                <div>
                  <h2 className="text-lg font-bold text-white font-mono">{selectedTable.tableName}</h2>
                  <p className="text-xs text-zinc-400 mt-1">
                    Row count: <span className="text-white font-medium">{selectedTable.rowCount}</span> | Size:{" "}
                    <span className="text-white font-medium">
                      {(Number(selectedTable.sizeBytes) / 1024).toFixed(2)} KB
                    </span>
                  </p>
                </div>
              </GlassCard>

              {/* Columns Table */}
              <GlassCard>
                <h3 className="text-sm font-semibold text-white mb-4">Columns list</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500 font-semibold uppercase tracking-wider">
                        <th className="pb-3">Column</th>
                        <th className="pb-3">Data Type</th>
                        <th className="pb-3">Nullable</th>
                        <th className="pb-3">Key</th>
                        <th className="pb-3">Default</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-350">
                      {selectedTable.columns?.map((c: any) => (
                        <tr key={c.id} className="hover:bg-zinc-900/20">
                          <td className="py-3 text-white font-semibold">{c.columnName}</td>
                          <td className="py-3">{c.dataType}</td>
                          <td className="py-3">{c.isNullable ? "YES" : "NO"}</td>
                          <td className="py-3">
                            {c.isPk && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-1.5 py-0.5 rounded font-sans font-bold">
                                <Key className="w-2.5 h-2.5" /> PK
                              </span>
                            )}
                            {c.isFk && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded font-sans font-bold ml-1">
                                <Key className="w-2.5 h-2.5" /> FK
                              </span>
                            )}
                          </td>
                          <td className="py-3">{c.defaultVal || "NULL"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              {/* Indexes Card */}
              <GlassCard>
                <h3 className="text-sm font-semibold text-white mb-4">Indexes list</h3>
                <div className="space-y-3 font-mono">
                  {selectedTable.indexes && selectedTable.indexes.length > 0 ? (
                    selectedTable.indexes.map((idx: any) => (
                      <div key={idx.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                        <p className="text-xs text-white font-bold">{idx.indexName}</p>
                        <code className="text-[10px] text-zinc-400 mt-1 block leading-relaxed">{idx.indexDef}</code>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-zinc-500">No indexes created for this table.</p>
                  )}
                </div>
              </GlassCard>
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No tables found.</p>
          )}
        </div>
      )}
    </div>
  );
};
