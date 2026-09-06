import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import { GlassCard, PageHeader, ScoreRing, SeverityBadge } from "../../components/UI";
import { Play, Sparkles, Code } from "lucide-react";

interface AnalyzerProps {
  objectType: "procedures" | "views" | "functions" | "triggers";
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
        subtitle={`Static code inspector for dynamic SQL, cursors, nested complexity, and execution side-effects.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Editor */}
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
                className="px-5 py-2 text-sm text-white bg-cyan-500 hover:bg-cyan-400 rounded-lg transition font-semibold flex items-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" />
                {loading ? "Analyzing DDL..." : "Analyze Definition"}
              </button>
            </div>
          </GlassCard>
        </div>

        {/* Results */}
        <div className="space-y-6">
          <GlassCard className="flex flex-col items-center justify-center text-center">
            <h3 className="text-sm font-semibold text-white mb-6">Object Quality Rating</h3>
            <ScoreRing score={result ? result.scores.overall : 100} size={130} strokeWidth={10} label="Score" />
            
            {result && (
              <div className="grid grid-cols-2 gap-4 w-full mt-6 pt-6 border-t border-zinc-800 text-xs">
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Performance</p>
                  <p className="text-sm font-mono font-bold text-white">{result.scores.performance}/100</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-zinc-500">Maintainability</p>
                  <p className="text-sm font-mono font-bold text-white">{result.scores.maintainability}/100</p>
                </div>
              </div>
            )}
          </GlassCard>

          <GlassCard className="max-h-[300px] overflow-y-auto">
            <h3 className="text-sm font-semibold text-white mb-4">Inspection Issues</h3>
            <div className="space-y-3">
              {result && result.issues.length > 0 ? (
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

export const StoredProcedures: React.FC = () => (
  <BaseAnalyzer
    objectType="procedures"
    title="Stored Procedure Analyzer"
    defaultCode={`CREATE OR REPLACE PROCEDURE get_large_salaries()
LANGUAGE plpgsql AS $$
DECLARE
    emp_cursor CURSOR FOR SELECT * FROM employees WHERE salary > 100000;
    r_emp RECORD;
BEGIN
    OPEN emp_cursor;
    LOOP
        FETCH emp_cursor INTO r_emp;
        EXIT WHEN NOT FOUND;
        -- procedural work
    END LOOP;
    CLOSE emp_cursor;
END;
$$;`}
  />
);

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
