import React, { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { GlassCard, PageHeader, ScoreRing, SeverityBadge } from "../../components/UI";
import {
  Play,
  Sparkles,
  Code,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  Database,
  Search,
  Filter,
  CheckCircle2,
  RefreshCw,
  FileCode,
  Layers,
  ArrowRight,
  Info,
  ChevronRight,
  Zap,
  BookOpen
} from "lucide-react";
import { useAppStore } from "../../store";

interface Finding {
  id?: string;
  ruleId: string;
  title: string;
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  confidence: number;
  procedureName?: string;
  signature?: string;
  line?: number;
  column?: number;
  position?: { line: number; column: number };
  snippet?: string;
  explanation?: string;
  description?: string;
  whyItMatters?: string;
  recommendedFix?: string;
  recommendation?: string;
  safeExample?: string;
}

interface AnalysisReport {
  name?: string;
  procedureName?: string;
  schema?: string;
  signature?: string;
  language?: string;
  linesOfCode?: number;
  cyclomaticComplexity?: number;
  nestingDepth?: number;
  variablesCount?: number;
  scores?: {
    overall?: number;
    reliability?: number;
    security?: number;
    maintainability?: number;
    performance?: number;
  };
  summary?: {
    totalFindings?: number;
    critical?: number;
    high?: number;
    medium?: number;
    low?: number;
    info?: number;
    riskLevel?: string;
  };
  metrics?: {
    linesOfCode?: number;
    cyclomaticComplexity?: number;
    nestingDepth?: number;
    variablesCount?: number;
    cursorCount?: number;
  };
  findings?: Finding[];
  issues?: any[];
}

const SAMPLE_PROCEDURES = [
  {
    name: "process_monthly_bonuses",
    schema: "public",
    definition: `CREATE OR REPLACE PROCEDURE process_monthly_bonuses(p_dept_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_unused_counter INT := 0;
    v_dead_store VARCHAR(50);
    c_emp CURSOR FOR SELECT id, salary FROM employees WHERE department_id = p_dept_id;
    r_emp RECORD;
    v_total_bonus NUMERIC := 0;
BEGIN
    v_dead_store := 'INITIAL_STATE';
    v_dead_store := 'OVERWRITTEN_NEVER_READ';

    IF 1 = 1 THEN
        v_total_bonus := v_total_bonus + 500;
    END IF;

    IF p_dept_id = NULL THEN
        RAISE NOTICE 'Dept is null';
    END IF;

    EXECUTE 'SELECT count(*) FROM emp_' || p_dept_id;

    OPEN c_emp;
    LOOP
        FETCH c_emp INTO r_emp;
        EXIT WHEN NOT FOUND;
        UPDATE employees SET salary = salary + 100 WHERE id = r_emp.id;
    END LOOP;
    -- Note: Missing CLOSE c_emp; to test cursor leak detection!
END;
$$;`
  },
  {
    name: "transfer_funds",
    schema: "public",
    definition: `CREATE OR REPLACE PROCEDURE transfer_funds(from_acc INT, to_acc INT, amount NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
    v_from_bal NUMERIC;
BEGIN
    SELECT balance INTO v_from_bal FROM accounts WHERE id = from_acc;
    IF v_from_bal < amount THEN
        RAISE EXCEPTION 'Insufficient balance';
        -- Unreachable code below
        v_from_bal := v_from_bal - amount;
    END IF;

    UPDATE accounts SET balance = balance - amount WHERE id = from_acc;
    UPDATE accounts SET balance = balance + amount WHERE id = to_acc;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Swallowed exception antipattern
END;
$$;`
  },
  {
    name: "clean_procedure_example",
    schema: "public",
    definition: `CREATE OR REPLACE PROCEDURE clean_procedure_example(p_dept_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    c_emp CURSOR FOR SELECT id, salary FROM employees WHERE department_id = p_dept_id;
    r_emp RECORD;
    v_total_processed INT := 0;
BEGIN
    IF p_dept_id IS NULL THEN
        RAISE EXCEPTION 'Department ID cannot be null';
    END IF;

    OPEN c_emp;
    LOOP
        FETCH c_emp INTO r_emp;
        EXIT WHEN NOT FOUND;
        UPDATE employees SET last_reviewed = CURRENT_TIMESTAMP WHERE id = r_emp.id;
        v_total_processed := v_total_processed + 1;
    END LOOP;
    CLOSE c_emp;
END;
$$;`
  }
];

export const StoredProcedures: React.FC = () => {
  const { activeConnection } = useAppStore();
  const [dbProcedures, setDbProcedures] = useState<any[]>([]);
  const [selectedProcKey, setSelectedProcKey] = useState<string>("sample:process_monthly_bonuses");
  const [currentSchema, setCurrentSchema] = useState<string>("public");
  const [currentName, setCurrentName] = useState<string>("process_monthly_bonuses");
  const [code, setCode] = useState(SAMPLE_PROCEDURES[0].definition);

  const [loading, setLoading] = useState(false);
  const [fetchingRoutines, setFetchingRoutines] = useState(false);
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  // Load procedures from active connected database
  const loadDatabaseProcedures = async () => {
    if (!activeConnection) return;
    setFetchingRoutines(true);
    try {
      const res = await fetch(`/api/schema/procedures?connectionId=${activeConnection.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        setDbProcedures(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingRoutines(false);
    }
  };

  useEffect(() => {
    loadDatabaseProcedures();
  }, [activeConnection]);

  // When selection changes
  const handleSelectProcedure = (key: string) => {
    setSelectedProcKey(key);
    setSelectedFinding(null);

    if (key.startsWith("sample:")) {
      const sampleName = key.replace("sample:", "");
      const found = SAMPLE_PROCEDURES.find((p) => p.name === sampleName);
      if (found) {
        setCurrentName(found.name);
        setCurrentSchema(found.schema);
        setCode(found.definition);
      }
    } else if (key.startsWith("db:")) {
      const dbName = key.replace("db:", "");
      const found = dbProcedures.find((p) => p.name === dbName);
      if (found) {
        setCurrentName(found.name);
        setCurrentSchema(found.schema || "public");
        setCode(found.definition || `-- Stored procedure ${found.name}\n-- Definition not present in routine catalog.`);
      }
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    setSelectedFinding(null);
    try {
      const res = await fetch("/api/procedures/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: currentName,
          schema: currentSchema,
          definition: code
        })
      });
      const json = await res.json();
      if (json.success) {
        setReport(json.data);
        if (json.data.findings && json.data.findings.length > 0) {
          setSelectedFinding(json.data.findings[0]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Run initial analysis on mount
  useEffect(() => {
    runAnalysis();
  }, [currentName]);

  const rawFindings = (report?.findings || report?.issues || []) as Finding[];
  const filteredFindings = rawFindings.filter((f) => {
    const sev = (f.severity || "LOW").toUpperCase();
    const cat = (f.category || "MAINTAINABILITY").toUpperCase();
    const matchSev = severityFilter === "ALL" || sev === severityFilter.toUpperCase();
    const matchCat = categoryFilter === "ALL" || cat.includes(categoryFilter.toUpperCase());
    return matchSev && matchCat;
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Stored Procedure Quality Inspector"
        subtitle="SonarQube-style PL/pgSQL static AST & lexical analysis. Detects unused variables, dead stores, unreachable branches, cursor leaks, and unsafe dynamic SQL."
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-mono">
              Database Context: <strong className="text-white">{activeConnection?.name || "Standalone"}</strong> ({currentSchema})
            </span>
          </div>
        }
      />

      {/* Routine Selector Bar */}
      <GlassCard className="p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-cyan-400" />
            <label className="text-xs font-bold text-zinc-300 uppercase">Target Routine:</label>
          </div>
          <select
            value={selectedProcKey}
            onChange={(e) => handleSelectProcedure(e.target.value)}
            className="flex-1 max-w-md bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
          >
            <optgroup label="Sample Demonstration Routines (Static Analysis Tests)">
              {SAMPLE_PROCEDURES.map((p) => (
                <option key={`sample:${p.name}`} value={`sample:${p.name}`}>
                  {p.schema}.{p.name} (Demonstration)
                </option>
              ))}
            </optgroup>
            {dbProcedures.length > 0 && (
              <optgroup label={`Live Target Database Routines (${activeConnection?.name})`}>
                {dbProcedures.map((p) => (
                  <option key={`db:${p.name}`} value={`db:${p.name}`}>
                    {p.schema || "public"}.{p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {activeConnection && (
            <button
              onClick={loadDatabaseProcedures}
              disabled={fetchingRoutines}
              className="p-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-white transition"
              title="Refresh database routine catalog"
            >
              <RefreshCw className={`w-4 h-4 ${fetchingRoutines ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          )}

          <button
            onClick={runAnalysis}
            disabled={loading}
            className="px-4 py-2 text-xs text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg transition font-semibold flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            {loading ? "Analyzing AST & Tokens..." : "Run Static Analysis"}
          </button>
        </div>
      </GlassCard>

      {/* Main Grid: Code Editor & Scores */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="h-[480px] p-4 flex flex-col relative">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800 shrink-0">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                <Code className="w-4 h-4 text-cyan-400" />
                PL/pgSQL Routine Definition
                <span className="text-[10px] font-mono text-zinc-500">
                  ({report?.linesOfCode ?? report?.metrics?.linesOfCode ?? 0} LOC)
                </span>
              </span>
              <span className="text-[11px] font-mono text-zinc-400">
                Safe Mode: Read-Only Analysis (No execution against production data)
              </span>
            </div>

            <div className="flex-1 w-full overflow-hidden rounded-lg border border-zinc-800">
              <Editor
                height="100%"
                defaultLanguage="pgsql"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val || "")}
                options={{
                  fontSize: 13,
                  fontFamily: "JetBrains Mono, monospace",
                  lineNumbers: "on",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  wordWrap: "on"
                }}
              />
            </div>
          </GlassCard>
        </div>

        {/* Quality Rating & Metrics Panel */}
        <div className="space-y-4">
          <GlassCard className="p-5 flex flex-col items-center justify-between text-center border-cyan-500/20">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              SonarQube Code Quality Rating
            </h3>

            <div className="py-2">
              <ScoreRing
                score={report?.scores?.overall ?? 100}
                size={130}
                strokeWidth={10}
                sublabel="Overall"
              />
            </div>

            {/* Dimensional Score Breakdown */}
            <div className="grid grid-cols-2 gap-2 w-full mt-4 pt-4 border-t border-zinc-800 text-xs font-mono">
              <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                <span className="text-[10px] uppercase font-sans text-zinc-500 block">Reliability</span>
                <span className="text-emerald-400 font-bold">{report?.scores?.reliability ?? 100}/100</span>
              </div>
              <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                <span className="text-[10px] uppercase font-sans text-zinc-500 block">Security</span>
                <span className="text-cyan-400 font-bold">{report?.scores?.security ?? 100}/100</span>
              </div>
              <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                <span className="text-[10px] uppercase font-sans text-zinc-500 block">Maintainability</span>
                <span className="text-yellow-400 font-bold">{report?.scores?.maintainability ?? 100}/100</span>
              </div>
              <div className="p-2 bg-zinc-900 rounded border border-zinc-800">
                <span className="text-[10px] uppercase font-sans text-zinc-500 block">Performance</span>
                <span className="text-blue-400 font-bold">{report?.scores?.performance ?? 100}/100</span>
              </div>
            </div>

            {/* Complexity & Structure Metrics */}
            <div className="grid grid-cols-3 gap-2 w-full mt-2 text-[11px] font-mono text-zinc-400">
              <div className="p-1.5 bg-zinc-900/60 rounded text-center">
                <span className="text-[9px] uppercase text-zinc-500 block">Cyclomatic</span>
                <span className="text-white font-bold">{report?.cyclomaticComplexity ?? report?.metrics?.cyclomaticComplexity ?? 1}</span>
              </div>
              <div className="p-1.5 bg-zinc-900/60 rounded text-center">
                <span className="text-[9px] uppercase text-zinc-500 block">Nesting</span>
                <span className="text-white font-bold">{report?.nestingDepth ?? report?.metrics?.nestingDepth ?? 0}</span>
              </div>
              <div className="p-1.5 bg-zinc-900/60 rounded text-center">
                <span className="text-[9px] uppercase text-zinc-500 block">Variables</span>
                <span className="text-white font-bold">{report?.variablesCount ?? report?.metrics?.variablesCount ?? (report?.summary?.totalFindings ?? 0)}</span>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Findings Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Static Code Findings & Rules
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-cyan-400 border border-zinc-700">
                {filteredFindings.length} detected
              </span>
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Categories</option>
              <option value="MAINTAINABILITY">Maintainability</option>
              <option value="SECURITY">Security</option>
              <option value="RELIABILITY">Reliability</option>
              <option value="PERFORMANCE">Performance</option>
              <option value="COMPLEXITY">Complexity</option>
            </select>
          </div>
        </div>

        {filteredFindings.length === 0 ? (
          <GlassCard className="text-center py-16 space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white">Clean Stored Procedure!</h4>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              No code quality violations, dead stores, unreachable branches, cursor leaks, or security issues were detected.
            </p>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Findings List (Left) */}
            <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
              {filteredFindings.map((finding) => (
                <div
                  key={finding.id}
                  onClick={() => setSelectedFinding(finding)}
                  className={`p-4 rounded-xl border transition cursor-pointer space-y-2 ${
                    selectedFinding?.id === finding.id
                      ? "bg-zinc-850 border-cyan-500/60 shadow-lg shadow-cyan-950/20"
                      : "bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SeverityBadge severity={finding.severity} />
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {finding.ruleId}
                      </span>
                      <span className="text-[10px] uppercase font-bold text-zinc-500">
                        {finding.category}
                      </span>
                    </div>
                    {(finding.position?.line || finding.line) && (
                      <span className="text-[11px] font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                        Line {finding.position?.line || finding.line}
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-bold text-white">{finding.title}</h4>

                  {finding.snippet && (
                    <code className="block text-[11px] font-mono text-cyan-400 bg-zinc-950 p-2 rounded truncate">
                      {finding.snippet}
                    </code>
                  )}
                </div>
              ))}
            </div>

            {/* Finding Detail & Remediation Pattern (Right) */}
            {selectedFinding ? (
              <GlassCard className="p-6 space-y-5 border-zinc-800">
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-800">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <SeverityBadge severity={selectedFinding.severity} />
                      <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                        {selectedFinding.ruleId}
                      </span>
                      <span className="text-xs font-mono text-zinc-400">
                        Confidence: {Math.round(selectedFinding.confidence <= 1 ? selectedFinding.confidence * 100 : selectedFinding.confidence)}%
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{selectedFinding.title}</h3>
                    {(selectedFinding.position?.line || selectedFinding.line) && (
                      <p className="text-xs text-zinc-400 font-mono mt-0.5">
                        Location: Line {selectedFinding.position?.line || selectedFinding.line}, Column {selectedFinding.position?.column || selectedFinding.column || 1}
                      </p>
                    )}
                  </div>
                </div>

                {/* Source Snippet */}
                {selectedFinding.snippet && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block mb-1">
                      Detected Code Construct:
                    </span>
                    <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-xs text-rose-300 overflow-x-auto whitespace-pre-wrap select-all">
                      {selectedFinding.snippet}
                    </pre>
                  </div>
                )}

                {/* Why It Matters */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 mb-1">
                    <Info className="w-3.5 h-3.5 text-cyan-400" />
                    Why This Matters (Risk Evaluation)
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 p-3 rounded border border-zinc-800">
                    {selectedFinding.whyItMatters || "Identified potential defect, security vulnerability, or maintainability violation."}
                  </p>
                </div>

                {/* Recommended Fix */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Recommended Remediation
                  </span>
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/60 p-3 rounded border border-zinc-800">
                    {selectedFinding.recommendedFix || selectedFinding.recommendation || "Refactor routine following standard PL/pgSQL practices."}
                  </p>
                </div>

                {/* Safe Before/After Example */}
                {selectedFinding.safeExample && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1.5 mb-1">
                      <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                      Improved Pattern Example
                    </span>
                    <pre className="p-3 bg-zinc-950 border border-zinc-800 rounded font-mono text-[11px] text-cyan-300 overflow-x-auto whitespace-pre-wrap select-all">
                      {selectedFinding.safeExample}
                    </pre>
                  </div>
                )}
              </GlassCard>
            ) : (
              <GlassCard className="flex items-center justify-center p-12 text-center text-xs text-zinc-500">
                Select a finding from the list on the left to inspect its root-cause explanation, risk impact, and safe code example.
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Generic BaseAnalyzer for Views, Functions, Triggers
interface AnalyzerProps {
  objectType: "views" | "functions" | "triggers";
  title: string;
  defaultCode: string;
}

const BaseAnalyzer: React.FC<AnalyzerProps> = ({ objectType, title, defaultCode }) => {
  const [code, setCode] = useState(defaultCode);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${objectType}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          name: `demo_${objectType}`,
          definition: code
        })
      });
      const json = await res.json();
      if (json.success) {
        setResult(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={title}
        subtitle="Static code inspector for dynamic SQL, cursors, nested complexity, and execution side-effects."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="h-[460px] p-4 flex flex-col relative">
            <span className="text-xs font-semibold text-zinc-400 mb-4 flex items-center gap-1.5 shrink-0">
              <Code className="w-4 h-4 text-cyan-400" />
              {title} Source DDL
            </span>
            <div className="flex-1 w-full overflow-hidden rounded-lg border border-zinc-800">
              <Editor
                height="100%"
                defaultLanguage="sql"
                theme="vs-dark"
                value={code}
                onChange={(val) => setCode(val || "")}
                options={{
                  fontSize: 13,
                  fontFamily: "JetBrains Mono",
                  lineNumbers: "on",
                  minimap: { enabled: false }
                }}
              />
            </div>
            <div className="flex justify-end mt-4 shrink-0">
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="px-5 py-2 text-sm text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg transition font-semibold flex items-center gap-2 shadow-lg shadow-cyan-500/20"
              >
                <Play className="w-4 h-4 fill-white" />
                {loading ? "Analyzing DDL..." : "Analyze Definition"}
              </button>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="flex flex-col items-center justify-center text-center">
            <h3 className="text-sm font-semibold text-white mb-6">Object Quality Rating</h3>
            <ScoreRing
              score={result?.scores?.overall ?? result?.overall ?? 100}
              size={130}
              strokeWidth={10}
              label="Score"
            />

            {result && (
              <div className="grid grid-cols-2 gap-4 w-full mt-6 pt-6 border-t border-zinc-800 text-xs">
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Performance</p>
                  <p className="text-sm font-mono font-bold text-white">
                    {result?.scores?.performance ?? result?.scorePerf ?? 100}/100
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Maintainability</p>
                  <p className="text-sm font-mono font-bold text-white">
                    {result?.scores?.maintainability ?? result?.scoreMaint ?? 100}/100
                  </p>
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard className="max-h-[300px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-4">Inspection Issues</h3>
            <div className="space-y-3">
              {result && Array.isArray(result.issues) && result.issues.length > 0 ? (
                result.issues.map((i: any, idx: number) => (
                  <div key={idx} className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <h4 className="text-xs font-semibold text-white">{i.title}</h4>
                    <p className="text-xs text-zinc-400 mt-1">{i.description}</p>
                    {i.evidence && (
                      <code className="block text-[9px] font-mono text-cyan-400 bg-zinc-950 p-1.5 rounded mt-2 truncate">
                        {i.evidence}
                      </code>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500 text-center py-12">
                  {result ? "No syntax issues detected." : "Paste definition and run analysis."}
                </p>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export const Views: React.FC = () => (
  <BaseAnalyzer
    objectType="views"
    title="View Analyzer"
    defaultCode={`CREATE VIEW sales_v AS 
SELECT * 
FROM orders o 
JOIN customers c ON o.customer_id = c.id;`}
  />
);

export const Functions: React.FC = () => (
  <BaseAnalyzer
    objectType="functions"
    title="Function Analyzer"
    defaultCode={`CREATE OR REPLACE FUNCTION calculate_bonus(val NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
    RETURN val * 0.10;
END;
$$ LANGUAGE plpgsql;`}
  />
);

export const Triggers: React.FC = () => (
  <BaseAnalyzer
    objectType="triggers"
    title="Trigger Analyzer"
    defaultCode={`CREATE TRIGGER audit_trigger
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_changes();`}
  />
);
