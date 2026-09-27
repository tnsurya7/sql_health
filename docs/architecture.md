# SQLSense AI - Architecture

## High-Level System Architecture

SQLSense AI is an enterprise-grade SQL intelligence, optimization, and database health observability platform built with deterministic algorithmic engines, retrieval-augmented generation (RAG), and large language models (Gemini).

```
+-----------------------------------------------------------------------------------+
|                                  Frontend UI                                      |
|  React 19 + TypeScript + Vite + TailwindCSS + Monaco Editor + ECharts + Lucide    |
+-----------------------------------------+-----------------------------------------+
                                          | REST API (JWT Authenticated)
+-----------------------------------------v-----------------------------------------+
|                                  Backend Core                                     |
|                       Node.js + Express + TypeScript + Prisma                     |
|                                                                                   |
|  +---------------------+  +----------------------+  +--------------------------+  |
|  | Connection Manager  |  | Rule-Based Analyzer  |  |  Index Advisor Engine    |  |
|  | Multi-DB Adapters   |  | 25 AST Rules         |  |  Selectivity & Benefit   |  |
|  +---------------------+  +----------------------+  +--------------------------+  |
|                                                                                   |
|  +---------------------+  +----------------------+  +--------------------------+  |
|  | Algorithmic Engine  |  | RAG Knowledge Store  |  |  Gemini Structured AI    |  |
|  | DP-Join / CBO / RA  |  | Hybrid DB Retrieval  |  |  Zod-Validated Candidate |  |
|  +---------------------+  +----------------------+  +--------------------------+  |
|                                                                                   |
|  +---------------------+  +----------------------+  +--------------------------+  |
|  | 7-Stage Validation  |  | Monitoring & ML      |  |  Deadlock Detector       |  |
|  | Syntax/Safety/Cost  |  | Z-Score / IsoForest  |  |  DFS Cycle Detection     |  |
|  +---------------------+  +----------------------+  +--------------------------+  |
+--------------------+------------------------------------------------+-------------+
                     |                                                |
        +------------v------------+                      +------------v------------+
        |   Application Metadata  |                      |    Target Databases     |
        |   PostgreSQL + Prisma   |                      | (PostgreSQL, MySQL,     |
        | (Users, RAG, Metrics)   |                      |  Oracle, SQL Server)    |
        +-------------------------+                      +-------------------------+
```

## System Components

1. **Database Adapter Abstraction**: Common interface isolating driver specifics. Implements native PostgreSQL driver with connection pooling, statement timeouts, and safe read-only query sandboxes.
2. **Deterministic SQL Parser & AST DFS**: Recursive AST parser capturing tokens, nodes, expressions, subqueries, and computing structural traversal metrics without AI hallucination.
3. **25 Anti-Pattern Rules Engine**: Deterministic rules covering sargability, wildcard projection, cartesian joins, index suppression, and unindexed sort/grouping.
4. **Relational Algebra & DP-Join Optimizer**: Predicate pushdown, constant folding, redundant DISTINCT elimination, subquery unnesting, and dynamic programming subset exploration ($O(3^N)$).
5. **Hybrid RAG Knowledge Engine**: Dialect-specific database tuning knowledge chunked, indexed, and retrieved using hybrid keyword/semantic scoring.
6. **Gemini AI Structured Output**: Backend-only Gemini integration with strict Zod schema validation for generating candidate queries and risk summaries.
7. **7-Stage Candidate Validation Pipeline**: Validates syntax, safety (destructive DDL/DML guards), semantic equivalence, table/column schema presence, EXPLAIN plan execution, and cost comparison.
8. **Time-Series Monitoring & ML Anomaly Detection**: SMA, EMA, Z-score spike detector ($|Z| > 2.5$), CUSUM change-point analysis, and Isolation Forest multidimensional anomaly classification.
9. **Deadlock Graph Detector**: Construct wait-for transaction dependency graphs and runs DFS cycle detection to detect lock deadlocks.
10. **Deterministic 5-Dimension Health Scorer**: Weighted scoring across Performance (35%), Security (20%), Indexing (20%), Query Quality (15%), and Maintainability (10%).
