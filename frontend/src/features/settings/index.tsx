import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import {
  Database,
  Plus,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  Trash2,
  Power,
  PowerOff,
  Shield,
  Layers
} from "lucide-react";
import { useAppStore } from "../../store";

export const SettingsPage: React.FC = () => {
  const { activeConnection, connections, setActiveConnection, setConnections } = useAppStore();

  const [name, setName] = useState("");
  const [databaseType, setDatabaseType] = useState("postgresql");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [schema, setSchema] = useState("public");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);
  const [readOnly, setReadOnly] = useState(true);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/databases", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setConnections(json.data);
        const online = json.data.find((c: any) => c.status === "ONLINE" && c.isActive);
        if (online) {
          setActiveConnection(online);
        } else if (json.data.length === 0 || !json.data.some((c: any) => c.status === "ONLINE")) {
          setActiveConnection(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTest = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/databases/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: name || "Test Connection",
          databaseType,
          host,
          port,
          database,
          schema,
          username,
          password,
          ssl,
          readOnly
        })
      });
      const json = await res.json();
      if (json.success && json.data.success) {
        setTestResult({
          success: true,
          message: `Connected successfully! Latency: ${json.data.latencyMs}ms ${json.data.version ? `(${json.data.version.substring(0, 30)}...)` : ""}`
        });
      } else {
        setTestResult({
          success: false,
          message: json.data?.error || json.error?.message || "Connection test failed."
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/databases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name,
          databaseType,
          host,
          port,
          database,
          schema,
          username,
          password,
          ssl,
          readOnly
        })
      });
      const json = await res.json();
      if (json.success) {
        await fetchConnections();
        // Reset form
        setName("");
        setDatabase("");
        setUsername("");
        setPassword("");
        setTestResult(null);
      } else {
        alert(json.error?.message || "Failed to save connection.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/databases/${id}/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      const json = await res.json();
      if (json.success) {
        await fetchConnections();
      } else {
        alert(json.error?.message || "Failed to connect to target database.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/databases/${id}/disconnect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      const json = await res.json();
      if (json.success) {
        await fetchConnections();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this database connection?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/databases/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        await fetchConnections();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProvisionSampleDataset = async () => {
    if (!activeConnection) return;
    setSeedLoading(true);
    setSeedResult(null);
    try {
      const res = await fetch(`/api/databases/${activeConnection.id}/seed-sample`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      const json = await res.json();
      if (json.success) {
        setSeedResult(json.message || "Benchmark dataset successfully provisioned!");
      } else {
        alert(json.error?.message || "Failed to provision benchmark dataset.");
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSeedLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings & Target Database Connections"
        subtitle="Manage live target database connections, test network credentials, and configure query optimization engines."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Connection Form */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" />
              Add Target Database Connection
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Connection Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Production Analytics"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Database Engine</label>
                  <select
                    value={databaseType}
                    onChange={(e) => setDatabaseType(e.target.value)}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  >
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="oracle">Oracle</option>
                    <option value="sqlserver">SQL Server (T-SQL)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Host</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    required
                    placeholder="localhost or db.example.com"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Port</label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    required
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Database Name</label>
                  <input
                    type="text"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    required
                    placeholder="e.g. sqlsense or enterprise_db"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Schema</label>
                  <input
                    type="text"
                    value={schema}
                    onChange={(e) => setSchema(e.target.value)}
                    placeholder="public"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="Database user"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Password (Encrypted AES-256)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-6 pt-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={readOnly}
                    onChange={(e) => setReadOnly(e.target.checked)}
                    className="rounded border-zinc-800 text-cyan-500 focus:ring-0"
                  />
                  <span>Read-Only Guard (Prevents accidental DML execution)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ssl}
                    onChange={(e) => setSsl(e.target.checked)}
                    className="rounded border-zinc-800 text-cyan-500 focus:ring-0"
                  />
                  <span>SSL / TLS Encryption</span>
                </label>
              </div>

              {testResult && (
                <div className={`p-3 rounded text-xs border flex items-center gap-2 ${
                  testResult.success 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}

              <div className="flex gap-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={loading}
                  className="px-4 py-2 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition border border-zinc-700"
                >
                  Test Connection
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded transition font-semibold shadow-lg shadow-cyan-500/20"
                >
                  Save Connection
                </button>
              </div>
            </form>
          </GlassCard>

          {/* Optional Sample Dataset Provisioner for Active Database */}
          {activeConnection && activeConnection.status === "ONLINE" && (
            <GlassCard className="border border-cyan-500/20 bg-cyan-500/5 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-cyan-400" />
                    Provision Benchmark Dataset (Optional)
                  </h4>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xl">
                    Populates realistic relational tables (customers, departments, employees, products, orders, order_items, payments, audit_logs) with realistic cardinalities to test EXPLAIN and query optimizations.
                  </p>
                </div>
                <button
                  onClick={handleProvisionSampleDataset}
                  disabled={seedLoading}
                  className="px-4 py-2 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg transition font-semibold shrink-0"
                >
                  {seedLoading ? "Provisioning Tables..." : "Provision Benchmark Dataset"}
                </button>
              </div>
              {seedResult && (
                <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                  {seedResult}
                </p>
              )}
            </GlassCard>
          )}
        </div>

        {/* Configured Connections List */}
        <div className="space-y-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              Configured Target Databases ({connections.length})
            </h3>
            <div className="space-y-3">
              {connections.length > 0 ? (
                connections.map((c) => (
                  <div key={c.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-semibold text-white">{c.name}</h4>
                        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                          {c.host}:{c.port} / {c.database} ({c.databaseType.toUpperCase()})
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                        c.status === "ONLINE" && c.isActive
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-zinc-800 text-zinc-400"
                      }`}>
                        {c.status === "ONLINE" && c.isActive ? "Connected (Active)" : c.status}
                      </span>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800/60">
                      {c.status === "ONLINE" && c.isActive ? (
                        <button
                          onClick={() => handleDisconnect(c.id)}
                          disabled={loading}
                          className="px-2.5 py-1 text-[10px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded transition border border-rose-500/20 flex items-center gap-1"
                        >
                          <PowerOff className="w-3 h-3" /> Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(c.id)}
                          disabled={loading}
                          className="px-2.5 py-1 text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 rounded transition border border-cyan-500/20 flex items-center gap-1"
                        >
                          <Power className="w-3 h-3" /> Connect & Activate
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={loading}
                        className="p-1 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition"
                        title="Delete connection"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-zinc-500 text-xs">
                  No target databases configured. Fill in the connection form to add a database.
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
