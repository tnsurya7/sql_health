import React from "react";
import { AlertTriangle, ShieldCheck, Cpu, Info } from "lucide-react";

// Severity Badge
export const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const sev = severity.toUpperCase();
  let bg = "bg-zinc-800 text-zinc-300 border-zinc-700";
  let icon = <Info className="w-3.5 h-3.5 mr-1" />;

  if (sev === "CRITICAL") {
    bg = "bg-red-500/10 text-red-400 border-red-500/20";
    icon = <AlertTriangle className="w-3.5 h-3.5 mr-1" />;
  } else if (sev === "HIGH") {
    bg = "bg-orange-500/10 text-orange-400 border-orange-500/20";
    icon = <AlertTriangle className="w-3.5 h-3.5 mr-1" />;
  } else if (sev === "MEDIUM") {
    bg = "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";
    icon = <AlertTriangle className="w-3.5 h-3.5 mr-1" />;
  } else if (sev === "LOW") {
    bg = "bg-blue-500/10 text-blue-400 border-blue-500/20";
    icon = <Info className="w-3.5 h-3.5 mr-1" />;
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${bg}`}>
      {icon}
      {severity}
    </span>
  );
};

// Status Badge
export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const stat = status.toUpperCase();
  let bg = "bg-zinc-800 text-zinc-400 border-zinc-700";
  if (stat === "ACCEPTED" || stat === "APPLIED") bg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
  if (stat === "REJECTED") bg = "bg-rose-500/10 text-rose-400 border-rose-500/20";
  if (stat === "REVIEWED") bg = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${bg}`}>
      {status}
    </span>
  );
};

// GlassCard
export const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => {
  return (
    <div className={`glass-card p-6 shadow-lg shadow-black/20 ${className}`}>
      {children}
    </div>
  );
};

// PageHeader
export const PageHeader: React.FC<{ title: string; subtitle?: string; action?: React.ReactNode }> = ({ title, subtitle, action }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-400 mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </div>
  );
};

// MetricCard
export const MetricCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { value: string; positive: boolean };
  icon?: React.ReactNode;
}> = ({ title, value, subtitle, trend, icon }) => {
  return (
    <GlassCard className="flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium tracking-wider text-zinc-400 uppercase">{title}</p>
          <h3 className="text-2xl font-bold text-white mt-2 font-mono">{value}</h3>
        </div>
        {icon && <div className="p-2 bg-zinc-800/40 rounded-lg text-zinc-400">{icon}</div>}
      </div>
      {subtitle && (
        <div className="flex items-center gap-2 mt-4 text-xs">
          {trend && (
            <span className={`font-semibold ${trend.positive ? "text-emerald-400" : "text-rose-400"}`}>
              {trend.value}
            </span>
          )}
          <span className="text-zinc-500">{subtitle}</span>
        </div>
      )}
    </GlassCard>
  );
};

// ScoreRing (Circular Animated Progress)
export const ScoreRing: React.FC<{ score: number; size?: number; strokeWidth?: number; label?: string }> = ({
  score,
  size = 120,
  strokeWidth = 10,
  label = "Health"
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let color = "stroke-emerald-500";
  if (score < 60) color = "stroke-red-500";
  else if (score < 80) color = "stroke-amber-500";

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full transform -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            className="stroke-zinc-800"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          {/* Progress circle */}
          <circle
            className={`${color} transition-all duration-1000 ease-out`}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
        </svg>
        {/* Inside Label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl font-extrabold text-white font-mono">{score}</span>
          <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mt-0.5">{label}</span>
        </div>
      </div>
    </div>
  );
};
