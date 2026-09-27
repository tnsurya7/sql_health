# SQLSense AI - RAG Knowledge Base & Hybrid Retrieval

SQLSense AI includes a **Retrieval-Augmented Generation (RAG)** architecture for SQL optimization knowledge.

## Knowledge Store Structure

The local PostgreSQL database stores optimization documents and chunked passages:

- `OptimizationDocument`: Metadata, source, title, database dialect, and category.
- `OptimizationChunk`: Chunked text content, keywords, token counts, and retrieval tracking.

### Seeded Knowledge Domains
1. **B-Tree & Composite Indexing**: Equality-first ordering, covering indexes (`INCLUDE`), and partial indexing.
2. **Sargability & Predicate Tuning**: Elimination of `LOWER()`, `YEAR()`, or expression wrappers on indexed columns.
3. **Join Optimization**: Nested Loop vs Hash Join vs Merge Join characteristics and join order pruning.
4. **Cardinality & Statistics**: Mitigating stale optimizer row estimates and running `ANALYZE`.
5. **Deadlock Prevention**: Deterministic lock ordering and short transaction lifetimes.

## Hybrid Retrieval Pipeline

1. **Query Formulation**: Constructs a structured search query combining database dialect, AST findings, detected anti-pattern rule IDs, and table dependencies.
2. **Filtering**: Pre-filters chunks by target database dialect (`POSTGRESQL`, `MYSQL`, etc.) and issue categories (`INDEXES`, `PERFORMANCE`, `SECURITY`).
3. **Hybrid Scoring**: Combines full-text keyword token matching and relevance weighting.
4. **Context Injection**: Injects only the top relevant chunks (max 3) into the Gemini structured prompt to prevent context overflow or hallucinations.
