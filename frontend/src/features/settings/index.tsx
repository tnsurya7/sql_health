import React, { useEffect, useState } from "react";
import { GlassCard, PageHeader } from "../../components/UI";
import { Database, Plus, CheckCircle, AlertTriangle, RefreshCw, Zap } from "lucide-react";
import { useAppStore } from "../../store";

export const SettingsPage: React.FC = () => {
  const { activeConnection, connections, setActiveConnection, setConnections } = useAppStore();

  const [name, setName] = useState("Demo Postgres");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("sqlsense");
  const [username, setUsername] = useState("postgres");
  const [password, setPassword] = useState("");

  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/databases", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success) {
        setConnections(json.data);
        const active = json.data.find((c: any) => c.isActive);
        if (active) setActiveConnection(active);
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
        body: JSON.stringify({ host, port, database, username, password })
      });
      const json = await res.json();
      if (json.success) {
        setTestResult({ success: true, message: "Connection test successful!" });
      } else {
        setTestResult({ success: false, message: json.error?.message || "Connection failed." });
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
        body: JSON.stringify({ name, host, port, database, username, password })
      });
      const json = await res.json();
      if (json.success) {
        await fetchConnections();
        // Reset form
        setName("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/databases/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ id })
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

  const handleSeedDemo = async () => {
    setSeedLoading(true);
    try {
      const res = await fetch("/api/databases/seed-demo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      const json = await res.json();
      if (json.success) {
        alert("Demo Database successfully initialized and seeded with 10k orders/customers data!");
      } else {
        alert(json.error?.message || "Failed to seed demo database.");
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
        title="Settings & Connections"
        subtitle="Manage target database credentials and configure SQLSense AI engines."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Connection Form */}
        <div className="lg:col-span-2 space-y-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4">Add Database Connection</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Connection Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Local PG Server"
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Host</label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    required
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
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-zinc-500">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-white focus:border-cyan-500 outline-none"
                  />
                </div>
              </div>

              {testResult && (
                <div className={`p-3 rounded text-xs border flex items-center gap-2 ${
                  testResult.success 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}>
                  {testResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  {testResult.message}
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
                  className="px-4 py-2 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded transition font-semibold"
                >
                  Save Connection
                </button>
              </div>
            </form>
          </GlassCard>

          {/* Seed demo database */}
          {activeConnection && (
            <GlassCard className="border border-cyan-500/20 bg-cyan-500/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  Initialize Demo Catalog
                </h4>
                <p className="text-xs text-zinc-400 mt-1 max-w-lg">
                  Instantly seed 9 demo tables (orders, order_items, payments, employees) with realistic index issues, queries and data models.
                </p>
              </div>
              <button
                onClick={handleSeedDemo}
                disabled={seedLoading}
                className="px-4 py-2 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg transition font-semibold shrink-0"
              >
                {seedLoading ? "Initializing..." : "Initialize Demo Database"}
              </button>
            </GlassCard>
          )}
        </div>

        {/* Connections List */}
        <div className="space-y-6">
          <GlassCard>
            <h3 className="text-sm font-semibold text-white mb-4">Saved Connections</h3>
            <div className="space-y-3">
              {connections.map((c) => (
                <div key={c.id} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex justify-between items-center">
                  <div>
                    <h4 className="text-xs font-semibold text-white">{c.name}</h4>
                    <p className="text-[10px] text-zinc-400 mt-0.5 font-mono">
                      {c.host}:{c.port} | {c.database}
                    </p>
                  </div>
                  {c.isActive ? (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">
                      Connected
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConnect(c.id)}
                      disabled={loading}
                      className="px-2 py-1 text-[10px] bg-zinc-850 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded transition border border-zinc-700"
                    >
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
