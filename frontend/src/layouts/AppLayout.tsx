import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Settings,
  Database,
  LineChart,
  LogOut,
  Moon,
  Sun,
  ShieldCheck,
  TrendingUp,
  FileCode,
  FolderTree,
  AlertOctagon,
  History,
  FileText,
  Workflow,
  Sparkles,
  Lock,
  Activity,
  BookOpen,
  ChevronDown,
  ArrowLeft,
  X,
} from "lucide-react";
import { useAppStore } from "../store";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/databases", label: "Databases", icon: Database },
  { path: "/sql-analyzer", label: "SQL Analyzer", icon: FileCode },
  { path: "/optimizer", label: "Query Optimizer", icon: Sparkles },
  { path: "/execution-plans", label: "Execution Plans", icon: Workflow },
  { path: "/schema-explorer", label: "Schema Explorer", icon: FolderTree },
  { path: "/index-advisor", label: "Index Advisor", icon: ShieldCheck },
  { path: "/procedures", label: "Stored Procedures", icon: FileText },
  { path: "/views", label: "Views", icon: FileText },
  { path: "/functions", label: "Functions", icon: FileText },
  { path: "/triggers", label: "Triggers", icon: FileText },
  { path: "/performance", label: "Performance", icon: LineChart },
  { path: "/deadlocks", label: "Deadlocks", icon: Lock },
  { path: "/recommendations", label: "Recommendations", icon: AlertOctagon },
  { path: "/health", label: "Database Health", icon: Activity },
  { path: "/history", label: "Query History", icon: History },
  { path: "/rag", label: "RAG Knowledge", icon: BookOpen },
  { path: "/settings", label: "Settings", icon: Settings },
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeConnection, connections, setConnections, setActiveConnection, logout, theme, toggleTheme, searchOpen, setSearchOpen } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Initial load of connections
  useEffect(() => {
    fetch("/api/databases")
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data.length > 0) {
          setConnections(json.data);
          const active = json.data.find((c: any) => c.isActive) || json.data[0];
          if (active && (!activeConnection || activeConnection.id !== active.id)) {
            setActiveConnection(active);
          }
        }
      })
      .catch((err) => console.error(err));
  }, []);

  // Command palette hotkey (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(!searchOpen);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, setSearchOpen]);

  // Focus input when search modal opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  // Run backend search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const json = await res.json();
        if (json.success) setSearchResults(json.data);
      } catch (err) {
        console.error(err);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleSwitchActiveDb = async (connId: string) => {
    try {
      const res = await fetch(`/api/databases/${connId}/activate`, { method: "POST" });
      const json = await res.json();
      if (json.success) {
        const conn = connections.find((c) => c.id === connId) || null;
        setActiveConnection(conn);
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800/80 bg-zinc-950 flex flex-col justify-between shrink-0 sticky top-0 h-screen">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-5 border-b border-zinc-800/80 gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <span className="text-sm font-extrabold tracking-wider text-white">SQLSense AI</span>
              <span className="block text-[10px] text-zinc-500 uppercase font-mono tracking-widest leading-none mt-0.5">
                DATABASE OBSERVER
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-3 space-y-0.5 overflow-y-auto max-h-[calc(100vh-14rem)] custom-scrollbar">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-cyan-500/10 text-cyan-300 border-l-2 border-cyan-500 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-zinc-500"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Status */}
        <div className="p-4 border-t border-zinc-800/80 space-y-3 bg-zinc-950/90">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-2 h-2 rounded-full ${
                activeConnection?.status === "ONLINE" ? "bg-emerald-400 ring-2 ring-emerald-400/20" : "bg-zinc-600"
              }`}
            />
            <div className="truncate flex-1">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Active Database</p>
              <p className="text-xs text-white truncate font-medium">
                {activeConnection ? `${activeConnection.name}` : "Disconnected"}
              </p>
            </div>
          </div>

          {/* User profile / theme / logout */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
            <div className="truncate">
              <p className="text-xs text-zinc-300 font-medium truncate font-mono">
                {user?.email || "admin@sqlsense.local"}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                title="Toggle Theme"
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={logout}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-rose-400 hover:text-rose-300 transition"
                title="Logout"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-800/80 flex items-center justify-between px-8 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-30">
          {/* Global search launcher */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800/80 text-zinc-400 text-xs hover:border-zinc-700 w-72 justify-between transition"
            >
              <span className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-zinc-500" /> Search tables, queries, RAG...
              </span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-400 font-mono">⌘K</kbd>
            </button>
          </div>

          {/* Database Switcher Selector */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <select
                value={activeConnection?.id || ""}
                onChange={(e) => handleSwitchActiveDb(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-semibold focus:outline-none focus:border-cyan-500 cursor-pointer appearance-none pr-8"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.databaseType.toUpperCase()})
                  </option>
                ))}
                {connections.length === 0 && <option value="">No databases added</option>}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <Link
              to="/databases"
              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-lg font-semibold hover:bg-cyan-500/20 transition"
            >
              <Database className="w-3.5 h-3.5" />
              Manage Connections
            </Link>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>

      {/* Command Palette Modal (Ctrl/Cmd + K) */}
      {searchOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSearchOpen(false);
          }}
          className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
            {/* Modal Header */}
            <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-900/90">
              <div className="flex items-center gap-2 flex-1">
                <Search className="w-4 h-4 text-cyan-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tables, queries, recommendations, fingerprints, RAG knowledge..."
                  className="w-full bg-transparent border-0 outline-none ring-0 text-white placeholder-zinc-500 text-xs sm:text-sm font-sans"
                />
              </div>

              {/* Action Buttons: Back to Dashboard & Close */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                    navigate("/dashboard");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 rounded-lg transition font-semibold shadow-sm"
                  title="Return to Dashboard"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to Dashboard
                </button>
                <button
                  onClick={() => setSearchOpen(false)}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition"
                  title="Close (ESC)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search Results */}
            <div className="max-h-96 overflow-y-auto p-2 divide-y divide-zinc-800/40 custom-scrollbar">
              {searchResults.length > 0 ? (
                searchResults.map((item: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                      navigate(item.url);
                    }}
                    className="w-full text-left p-3 hover:bg-zinc-800/70 rounded-lg transition flex items-center justify-between group"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5">{item.subtitle}</p>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20 font-mono">
                      {item.category}
                    </span>
                  </button>
                ))
              ) : searchQuery ? (
                <p className="p-8 text-center text-zinc-500 text-sm">No matches found for "{searchQuery}"</p>
              ) : (
                <div className="p-6 text-center text-zinc-500 text-xs space-y-1">
                  <p className="text-zinc-400 font-medium">Quick Catalog Search</p>
                  <p>Type any table name, query snippet, fingerprint hash, or RAG keyword.</p>
                </div>
              )}
            </div>

            {/* Modal Footer with Shortcuts */}
            <div className="p-2.5 px-4 bg-zinc-950/80 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
              <button
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                  navigate("/dashboard");
                }}
                className="hover:text-cyan-400 flex items-center gap-1 transition"
              >
                <LayoutDashboard className="w-3.5 h-3.5" /> Go to Dashboard
              </button>
              <div className="flex items-center gap-3 font-mono text-[10px]">
                <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">ESC</kbd> close</span>
                <span><kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">↵</kbd> select</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
