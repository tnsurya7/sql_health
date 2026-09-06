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
  ListRestart,
  History,
  FileText,
  Workflow,
  Sparkles
} from "lucide-react";
import { useAppStore } from "../store";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
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
  { path: "/recommendations", label: "Recommendations", icon: AlertOctagon },
  { path: "/history", label: "Query History", icon: History },
  { path: "/settings", label: "Settings", icon: Settings },
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeConnection, connections, logout, theme, toggleTheme, searchOpen, setSearchOpen } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${searchQuery}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const json = await res.json();
        if (json.success) setSearchResults(json.data);
      } catch (err) {
        console.error(err);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  return (
    <div className="flex min-h-screen bg-background text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-6 border-b border-zinc-800 gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            <span className="text-lg font-bold tracking-wider text-white">SQLSense AI</span>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1 overflow-y-auto max-h-[calc(100vh-14rem)]">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-500"
                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom Sidebar Status */}
        <div className="p-4 border-t border-zinc-800 space-y-3 bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${activeConnection ? "bg-emerald-500" : "bg-zinc-600"}`} />
            <div className="truncate">
              <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Active Database</p>
              <p className="text-xs text-white truncate font-medium">
                {activeConnection ? activeConnection.name : "Disconnected (Demo)"}
              </p>
            </div>
          </div>

          {/* User profile / theme / logout */}
          <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
            <div className="truncate">
              <p className="text-xs text-zinc-300 font-medium truncate">{user?.email || "guest@sqlsense.ai"}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleTheme}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
              <button
                onClick={logout}
                className="p-1.5 rounded-md hover:bg-zinc-800 text-rose-400 hover:text-rose-300"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-md">
          {/* Breadcrumbs or search placeholder */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs hover:border-zinc-700 w-64 justify-between"
            >
              <span className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5" /> Search palette...
              </span>
              <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-zinc-500 font-mono">⌘K</kbd>
            </button>
          </div>

          {/* Connection Status & selectors */}
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              {activeConnection ? `PostgreSQL: ${activeConnection.database}` : "Demo Catalog Mode"}
            </span>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>

      {/* Command Palette Modal */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-24">
          <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
              <Search className="w-5 h-5 text-cyan-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tables, recommendations, SQL history..."
                className="w-full bg-transparent border-0 outline-none ring-0 text-white placeholder-zinc-500 text-sm"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-xs text-zinc-500 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded"
              >
                ESC
              </button>
            </div>
            {/* Search Results */}
            <div className="max-h-96 overflow-y-auto p-2">
              {searchResults.length > 0 ? (
                searchResults.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSearchOpen(false);
                      if (item.type === "TABLE") navigate("/schema-explorer");
                      if (item.type === "QUERY") navigate("/history");
                      if (item.type === "RECOMMENDATION") navigate("/recommendations");
                      if (item.type === "ISSUE") navigate("/sql-analyzer");
                    }}
                    className="w-full text-left p-3 hover:bg-zinc-800/60 rounded-lg transition flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{item.subtitle}</p>
                    </div>
                    <span className="text-[10px] uppercase font-bold text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">
                      {item.type}
                    </span>
                  </button>
                ))
              ) : searchQuery ? (
                <p className="p-4 text-center text-zinc-500 text-sm">No matches found for "{searchQuery}"</p>
              ) : (
                <p className="p-4 text-center text-zinc-500 text-sm">Type to begin searching catalog...</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
