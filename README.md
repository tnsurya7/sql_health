# SQLSense AI

## "AI-Powered Multi-Database SQL Query Optimization and Database Health Analyzer Using Algorithmic Optimization and Retrieval-Augmented Generation"

SQLSense AI is an enterprise-grade SQL intelligence, algorithmic optimization, schema relationship analysis, and database health observability platform. It combines deterministic AST traversal, rule engines, dynamic programming join optimization, and cost-based evaluation with Retrieval-Augmented Generation (RAG) and Google Gemini AI structured generation.

---

## 🚀 Key Highlights & Architecture

- **No Mock/Demo Data**: Fully functional against real PostgreSQL instances with extensible adapter architecture for MySQL, Oracle, and SQL Server.
- **Dialect-Aware AST Parsing & DFS**: Recursive AST parser capturing tokens, nodes, and structural complexity metrics.
- **25 Deterministic Anti-Pattern Rules**: Identifies sargability issues, wildcard projections, unindexed sort/grouping, and unconstrained DML without AI hallucination.
- **Relational Algebra & DP-Join Optimizer**: Predicate pushdown, constant folding, redundant DISTINCT elimination, and $O(3^N)$ dynamic programming join order pruning ($DP[subset]$).
- **Index Advisor**: Selectivity and cost-benefit estimation for composite B-Tree indexes with deduplication against existing catalog indexes.
- **Execution Plan Analyzer**: Parses PostgreSQL JSON `EXPLAIN` and `EXPLAIN (ANALYZE, BUFFERS)` trees with Cardinality Error Ratio ($Actual / Estimated$) diagnostics.
- **Hybrid RAG Knowledge Base**: Database dialect and issue-category indexed optimization guides stored in local PostgreSQL.
- **Backend-Only Structured Gemini AI**: Structured JSON candidate generation with strict Zod schema validation.
- **7-Stage Candidate Validation Pipeline**: Syntax $\rightarrow$ Safety $\rightarrow$ Semantic $\rightarrow$ Schema $\rightarrow$ EXPLAIN $\rightarrow$ Cost Comparison $\rightarrow$ Safe Read-Only Benchmarking.
- **Time-Series Observability & ML**: Moving Averages (SMA/EMA), Z-Score spike detection ($|Z| > 2.5$), CUSUM change points, and Isolation Forest multidimensional anomaly classification.
- **Deadlock Detector**: Introspects lock dependency wait-for graphs and identifies cycles using recursive DFS.
- **Deterministic 5-Dimension Health Scoring**: Weighted scoring (Performance 35%, Security 20%, Indexing 20%, Quality 15%, Maintainability 10%).

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite, Monaco Editor, ECharts, Framer Motion, Lucide Icons, Zustand
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, Native `pg` Pool driver, Zod
- **AI & RAG Engine**: Google Gemini API (`@google/genai` / `@google/generative-ai`), Local PostgreSQL RAG Knowledge Store
- **Security**: AES-256-GCM credential encryption, JWT, Helmet, CORS, Statement Timeouts, Sandbox Read-Only Execution

---

## 📋 Prerequisites & Installation

### 1. Requirements
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: Local or remote instance (e.g., PostgreSQL 15/16)

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and `backend/.env`:
```bash
cp .env.example .env
cp .env.example backend/.env
```

Configure `.env`:
```env
NODE_ENV=development
APP_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sqlsense"
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sqlsense"
JWT_SECRET="sqlsense_super_secret_jwt_key_2026"
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
GEMINI_API_KEY="your_gemini_api_key_here"
GEMINI_MODEL="gemini-1.5-pro"
BACKEND_PORT=5001
FRONTEND_PORT=5173
```

### 3. Install Dependencies & Synchronize Application Database
```bash
npm install
npm run db:push
npm run db:generate
```

### 4. Run Test Suite
```bash
npm test
```
Executes 31 backend algorithm tests and frontend unit tests.

### 5. Start Development Servers
```bash
npm run dev
```
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API & Health**: [http://localhost:5001/api/health](http://localhost:5001/api/health)

---

## 📚 Comprehensive Documentation

Detailed documentation is available in the `docs/` directory:
- [Architecture Guide](file:///Users/suryakumar/Desktop/Ai_sql/docs/architecture.md)
- [Algorithms Reference](file:///Users/suryakumar/Desktop/Ai_sql/docs/algorithms.md)
- [Database Adapters](file:///Users/suryakumar/Desktop/Ai_sql/docs/database-adapters.md)
- [RAG Knowledge Base](file:///Users/suryakumar/Desktop/Ai_sql/docs/rag.md)
- [Query Optimizer & Candidate Generation](file:///Users/suryakumar/Desktop/Ai_sql/docs/optimizer.md)
- [7-Stage Validation Pipeline](file:///Users/suryakumar/Desktop/Ai_sql/docs/validation.md)
- [Security Architecture](file:///Users/suryakumar/Desktop/Ai_sql/docs/security.md)
- [Testing Guide](file:///Users/suryakumar/Desktop/Ai_sql/docs/testing.md)
