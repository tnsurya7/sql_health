import React, { useState, useEffect } from "react";
import { Database, Plus, Trash2, CheckCircle2, XCircle, RefreshCw, Power, Server, Shield, Lock, Layers } from "lucide-react";
import { useAppStore, DatabaseConnection } from "../../store";

export const DatabasesPage: React.FC = () => {
  const { connections, setConnections, activeConnection, setActiveConnection } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; version?: string; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [seedLoading, setSeedLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "Production PostgreSQL",
    databaseType: "postgresql",
    host: "localhost",
    port: 5432,
    database: "sqlsense",
    schema: "public",
    username: "suryakumar",
    password: "",
    ssl: false,
    readOnly: true,
  });

  const fetchConnections = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/databases");
      const json = await res.json();
      if (json.success) {
        setConnections(json.data);
        const active = json.data.find((c: DatabaseConnection) => c.isActive) || json.data[0] || null;
        if (active && (!activeConnection || activeConnection.id === active.id)) {
          setActiveConnection(active);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/databases/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setTestResult(json.data);
      } else {
        setTestResult({ success: false, error: json.error?.message || "Connection failed." });
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/databases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setModalOpen(false);
        fetchConnections();
        setStatusMessage("Connection added successfully.");
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        alert(json.error?.message || "Failed to create connection.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleConnect = async (id: string) => {
    try {
      const res = await fetch(`/api/databases/${id}/connect`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        fetchConnections();
      } else {
        alert(json.error?.message || "Connection failed.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await fetch(`/api/databases/${id}/disconnect`, { method: "POST" });
      fetchConnections();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this database connection?")) return;
    try {
      await fetch(`/api/databases/${id}`, { method: "DELETE" });
      fetchConnections();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSeedSample = async (id: string) => {
    setSeedLoading(id);
    try {
      const res = await fetch(`/api/databases/${id}/seed-sample`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        alert(`Sample data seeded successfully: ${json.data.tablesCreated} tables, ${json.data.rowsInserted} rows populated.`);
        fetchConnections();
      } else {
        alert(json.error?.message || "Failed to seed sample dataset.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSeedLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Database className="w-6 h-6 text-cyan-400" />
            Database Connections
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage live connections across PostgreSQL, MySQL, Oracle, and SQL Server instances.
          </p>
        </div>
        <button
          onClick={() => {
            setTestResult(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-sm transition shadow-lg shadow-cyan-500/20"
        >
          <Plus className="w-4 h-4" /> Add Connection
        </button>
      </div>

      {statusMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {statusMessage}
        </div>
      )}

      {/* Connection Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {connections.map((conn) => {
          const isOnline = conn.status === "ONLINE";
          return (
            <div
              key={conn.id}
              className={`p-5 rounded-xl border bg-zinc-900/70 backdrop-blur transition flex flex-col justify-between ${
                conn.isActive
                  ? "border-cyan-500/60 shadow-lg shadow-cyan-500/10"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-zinc-800 border border-zinc-700">
                      <Server className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        {conn.name}
                        {conn.isActive && (
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30 font-semibold">
                            ACTIVE
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-zinc-400 uppercase tracking-wider font-mono">
                        {conn.databaseType} • {conn.database}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isOnline
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400" : "bg-rose-400"}`} />
                    {conn.status}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 text-xs text-zinc-400 bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80 font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Host:</span>
                    <span className="text-zinc-300">{conn.host}:{conn.port}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Schema:</span>
                    <span className="text-zinc-300">{conn.schema || "public"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">User:</span>
                    <span className="text-zinc-300">{conn.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Security:</span>
                    <span className="text-zinc-300">{conn.ssl ? "SSL Encrypted" : "Plaintext"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Mode:</span>
                    <span className="text-zinc-300">{conn.readOnly ? "Read Only Guard" : "Read/Write"}</span>
                  </div>
                </div>

                {conn.errorMessage && (
                  <p className="mt-2 text-xs text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/20">
                    {conn.errorMessage}
                  </p>
                )}
              </div>

              <div className="mt-5 pt-4 border-t border-zinc-800 flex items-center justify-between gap-2">
                <div className="flex gap-2">
                  {isOnline ? (
                    <button
                      onClick={() => handleDisconnect(conn.id)}
                      className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 flex items-center gap-1.5"
                    >
                      <Power className="w-3.5 h-3.5 text-rose-400" /> Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(conn.id)}
                      className="px-3 py-1.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 border border-cyan-500/30"
                    >
                      <Power className="w-3.5 h-3.5 text-cyan-400" /> Connect
                    </button>
                  )}

                  {conn.databaseType === "postgresql" && isOnline && (
                    <button
                      onClick={() => handleSeedSample(conn.id)}
                      disabled={seedLoading === conn.id}
                      className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs flex items-center gap-1"
                      title="Seed realistic tables (customers, orders, products) with foreign keys and indexes"
                    >
                      <Layers className="w-3.5 h-3.5 text-emerald-400" />
                      {seedLoading === conn.id ? "Seeding..." : "Seed Dataset"}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => handleDelete(conn.id)}
                  className="p-1.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition"
                  title="Delete Connection"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {connections.length === 0 && !loading && (
          <div className="col-span-full p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40">
            <Database className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white">No Database Connections Configured</h3>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Add your PostgreSQL, MySQL, Oracle, or SQL Server connection parameters to start real SQL diagnostics.
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="mt-4 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-sm inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add First Connection
            </button>
          </div>
        )}
      </div>

      {/* Add Connection Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-cyan-400" /> Add Database Connection
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveConnection} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Connection Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Database Type</label>
                  <select
                    value={formData.databaseType}
                    onChange={(e) => setFormData({ ...formData, databaseType: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="oracle">Oracle</option>
                    <option value="sqlserver">SQL Server</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Host</label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Port</label>
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value, 10) || 5432 })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Database</label>
                  <input
                    type="text"
                    value={formData.database}
                    onChange={(e) => setFormData({ ...formData, database: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Schema</label>
                  <input
                    type="text"
                    value={formData.schema}
                    onChange={(e) => setFormData({ ...formData, schema: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Encrypted AES-256"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.ssl}
                    onChange={(e) => setFormData({ ...formData, ssl: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-700 text-cyan-500"
                  />
                  SSL/TLS Encryption
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.readOnly}
                    onChange={(e) => setFormData({ ...formData, readOnly: e.target.checked })}
                    className="rounded bg-zinc-950 border-zinc-700 text-cyan-500"
                  />
                  Enforce Read-Only Mode
                </label>
              </div>

              {/* Test Connection Output */}
              {testResult && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    testResult.success
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-400"
                  }`}
                >
                  {testResult.success ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Connection Successful ({testResult.latencyMs}ms) - {testResult.version}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{testResult.error}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-xs shadow-lg shadow-cyan-500/20"
                  >
                    Save Connection
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
