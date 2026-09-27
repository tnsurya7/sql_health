import React, { useState, useEffect } from "react";
import { BookOpen, Search, Plus, Trash2, RefreshCw, Layers, Sparkles, Tag } from "lucide-react";

export const RagKnowledgePage: React.FC = () => {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Ingestion form state
  const [formData, setFormData] = useState({
    title: "",
    category: "INDEXING",
    databaseType: "ALL",
    source: "DBA Optimization Handbook",
    content: "",
    keywords: "",
  });

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/rag/knowledge");
      const json = await res.json();
      if (json.success) {
        setDocuments(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/rag/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery }),
      });
      const json = await res.json();
      if (json.success) {
        setSearchResults(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          keywords: formData.keywords.split(",").map((k) => k.trim()),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setModalOpen(false);
        setFormData({ title: "", category: "INDEXING", databaseType: "ALL", source: "", content: "", keywords: "" });
        fetchDocuments();
      } else {
        alert(json.error?.message || "Failed to ingest knowledge document.");
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this knowledge document?")) return;
    try {
      await fetch(`/api/rag/knowledge/${id}`, { method: "DELETE" });
      fetchDocuments();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleReindex = async () => {
    setLoading(true);
    try {
      await fetch("/api/rag/reindex", { method: "POST" });
      fetchDocuments();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-cyan-400" />
            RAG Knowledge Base
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Hybrid vector & full-text relational optimization knowledge retrieved during AI-assisted candidate generation.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleReindex}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" /> Reindex
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-sm transition shadow-lg shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" /> Add Knowledge
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search optimization knowledge (e.g., 'composite index equality', 'sargable date', 'cardinality error')..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition"
        >
          Search
        </button>
        {searchResults && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSearchResults(null);
            }}
            className="px-3 py-2 rounded-lg bg-zinc-800/60 text-zinc-400 text-sm font-semibold hover:text-white"
          >
            Clear
          </button>
        )}
      </form>

      {/* Search Results Display */}
      {searchResults && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Hybrid Retrieval Results ({searchResults.length} chunks matched)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {searchResults.map((res, i) => (
              <div key={i} className="p-4 rounded-xl border border-cyan-500/40 bg-zinc-900/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    Relevance Score: {(res.score * 100).toFixed(0)}%
                  </span>
                  <span className="text-xs text-zinc-500 font-mono">{res.databaseType}</span>
                </div>
                <h4 className="text-sm font-bold text-white">{res.chunkTitle}</h4>
                <p className="text-xs text-zinc-300 leading-relaxed">{res.content}</p>
                <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-500 flex justify-between">
                  <span>Source: {res.source}</span>
                  <span>Category: {res.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Knowledge Documents List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">
          All Knowledge Documents & Chunks ({documents.length})
        </h3>

        <div className="space-y-4">
          {documents.map((doc) => (
            <div key={doc.id} className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/60 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-white">{doc.title}</h3>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {doc.category}
                    </span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-mono">
                      {doc.databaseType}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">Source: {doc.source} • Version: {doc.version}</p>
                </div>
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 rounded hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 transition"
                  title="Delete Document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Chunks List */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {doc.chunks?.map((chunk: any) => (
                  <div
                    key={chunk.id}
                    className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/80 flex flex-col justify-between space-y-2"
                  >
                    <div>
                      <h4 className="text-xs font-bold text-cyan-300">{chunk.title}</h4>
                      <p className="text-xs text-zinc-300 mt-1 line-clamp-3 leading-relaxed">
                        {chunk.content}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-[10px] text-zinc-500">
                      <span>Retrieved: {chunk.retrievalCount} times</span>
                      <div className="flex gap-1">
                        {chunk.keywords?.slice(0, 2).map((k: string, idx: number) => (
                          <span key={idx} className="bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                            {k}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ingest Knowledge Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-cyan-400" /> Ingest Knowledge Document
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-white text-sm">
                ✕
              </button>
            </div>

            <form onSubmit={handleIngest} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Document Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Multi-Column GIN Indexing Guide"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="INDEXING">INDEXING</option>
                    <option value="SARGABILITY">SARGABILITY</option>
                    <option value="JOINS">JOINS</option>
                    <option value="CARDINALITY">CARDINALITY</option>
                    <option value="REWRITE">REWRITE</option>
                    <option value="SECURITY">SECURITY</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1">Database Type</label>
                  <select
                    value={formData.databaseType}
                    onChange={(e) => setFormData({ ...formData, databaseType: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">ALL Dialects</option>
                    <option value="postgresql">PostgreSQL</option>
                    <option value="mysql">MySQL</option>
                    <option value="oracle">Oracle</option>
                    <option value="sqlserver">SQL Server</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Content / Rule Body</label>
                <textarea
                  rows={4}
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Detailed rule explanation, indexing strategy, or transformation guideline..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Keywords (comma separated)</label>
                <input
                  type="text"
                  value={formData.keywords}
                  onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                  placeholder="btree, gin, lower, index only scan"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-semibold text-xs"
                >
                  Ingest Knowledge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
