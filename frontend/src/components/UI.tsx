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
  onClick?: () => void;
  clickable?: boolean;
}> = ({ title, value, subtitle, trend, icon, onClick, clickable }) => {
  const isClickable = clickable || !!onClick;
  return (
    <div
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={`glass-card p-6 shadow-lg shadow-black/20 flex flex-col justify-between transition-all duration-200 ${
        isClickable
          ? "cursor-pointer hover:border-cyan-500/50 hover:bg-zinc-800/80 hover:shadow-cyan-500/10 hover:scale-[1.02] active:scale-[0.99] group focus:outline-none focus:ring-1 focus:ring-cyan-400"
          : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-1.5">
            <p className={`text-xs font-medium tracking-wider uppercase transition-colors ${isClickable ? "text-zinc-400 group-hover:text-cyan-400" : "text-zinc-400"}`}>{title}</p>
            {isClickable && <span className="text-[10px] text-zinc-500 group-hover:text-cyan-400/80 transition-colors">↗</span>}
          </div>
          <h3 className="text-2xl font-bold text-white mt-2 font-mono">{value}</h3>
        </div>
        {icon && <div className="p-2 bg-zinc-800/40 rounded-lg text-zinc-400 group-hover:text-white transition-colors">{icon}</div>}
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
    </div>
  );
};

// ScoreRing (Circular Animated Progress)
export const ScoreRing: React.FC<{
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
}> = ({
  score,
  size = 130,
  strokeWidth = 10,
  label,
  sublabel = "/ 100",
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  let strokeColor = "stroke-emerald-400";
  let glowColor = "rgba(52, 211, 153, 0.25)";
  if (clampedScore < 60) {
    strokeColor = "stroke-rose-500";
    glowColor = "rgba(244, 63, 94, 0.25)";
  } else if (clampedScore < 80) {
    strokeColor = "stroke-amber-400";
    glowColor = "rgba(251, 191, 36, 0.25)";
  } else if (clampedScore < 90) {
    strokeColor = "stroke-cyan-400";
    glowColor = "rgba(6, 182, 212, 0.25)";
  }

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          className="w-full h-full transform -rotate-90 filter"
          style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Background track circle */}
          <circle
            className="stroke-zinc-850"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          {/* Progress circle */}
          <circle
            className={`${strokeColor} transition-all duration-1000 ease-out`}
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

        {/* Inside Score & Sublabel */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 select-none">
          <span
            className={`font-black text-white font-mono tracking-tight leading-none ${
              size >= 130 ? "text-3xl" : size >= 110 ? "text-2xl" : "text-xl"
            }`}
          >
            {clampedScore}
          </span>
          {label ? (
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider mt-1 line-clamp-1">
              {label}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-zinc-500 font-semibold mt-0.5">
              {sublabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
