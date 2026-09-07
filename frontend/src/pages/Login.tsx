import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";
import { useAppStore } from "../store";

export const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAppStore((state) => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        throw new Error("Cannot connect to backend server. Please verify the backend is running on port 5001.");
      }

      if (json && json.success) {
        setAuth(json.data.token, json.data.user);
        navigate("/dashboard");
      } else {
        setError(json?.error?.message || "Invalid credentials.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8 glass-panel p-8">
        <div className="flex flex-col items-center text-center">
          <div className="h-12 w-12 rounded-xl bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 mb-4">
            <Sparkles className="w-6 h-6 text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Welcome to SQLSense AI</h2>
          <p className="text-sm text-zinc-400 mt-1">Sign in to observe and optimize your SQL databases.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-500">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase font-bold text-zinc-500">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-sm text-white focus:border-cyan-500 outline-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded text-rose-400 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-white font-semibold rounded-lg text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10"
          >
            {loading ? "Signing in..." : "Sign In"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center pt-2 text-xs text-zinc-500">
          Don't have an account?{" "}
          <Link to="/register" className="text-cyan-400 hover:underline">
            Register here
          </Link>
        </div>

        <div className="text-center pt-4 border-t border-zinc-800 text-[10px] text-zinc-650">
          <p className="font-bold text-zinc-500">DEMO MODE PRESETS:</p>
          <p className="mt-1">User: <span className="font-mono text-zinc-400">admin@localhost</span></p>
          <p>Pass: <span className="font-mono text-zinc-400">admin</span></p>
        </div>
      </div>
    </div>
  );
};
