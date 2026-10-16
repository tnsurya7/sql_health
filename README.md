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

## ⚡ Windows Quick Start (3 Steps)

Get up and running on Windows 10/11 with zero workspace or Prisma complexity:

### 1. Prerequisites
- **Git**: [https://git-scm.com/download/win](https://git-scm.com/download/win)
- **Node.js 18+**: [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
- **PostgreSQL 15 or 16**: [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)

Make sure the PostgreSQL service is running:
```powershell
Get-Service -Name postgresql*
```

### 2. Configure Environment
In PowerShell from the repository root:
```powershell
Copy-Item .env.example .env
Copy-Item .env backend\.env
```
Open `.env` in Notepad and adjust `DATABASE_URL` with your PostgreSQL password:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/sqlsense"
```
*(If your PostgreSQL username is not `postgres`, adjust accordingly).*

Ensure the application metadata database exists:
```powershell
psql -U postgres -c "CREATE DATABASE sqlsense;"
```

### 3. Install, Setup, and Run
```powershell
# Step A: Install dependencies across all workspaces
npm install

# Step B: One-command automated setup (validates env, checks Postgres, generates Prisma, migrates & seeds)
npm run setup

# Step C: Start both backend and frontend concurrently
npm run dev
```

- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API & Health**: [http://localhost:5001/api/health](http://localhost:5001/api/health)
- **Default Login**: `admin@localhost` / `admin`

---

## 🗄️ Setting Up the Target Benchmark Database (`sqlsense_test`)

SQLSense AI distinguishes between the **application metadata database** (`sqlsense`) and the **target database under analysis** (`sqlsense_test`).

To load the realistic test database with 11 tables, 4 views, functions, triggers, and procedures:
```powershell
# 1. Create target database
psql -U postgres -c "CREATE DATABASE sqlsense_test;"

# 2. Import schema & seed data
psql -U postgres -d sqlsense_test -f database/sqlsense_test_database.sql
```
Detailed instructions and test query walkthroughs are available in [database/README.md](file:///Users/suryakumar/Desktop/Ai_sql/database/README.md) and [database/sqlsense_test_queries.sql](file:///Users/suryakumar/Desktop/Ai_sql/database/sqlsense_test_queries.sql).

---

## 🔧 Windows Troubleshooting & Port Conflicts

### Port 5001 Already in Use (`EADDRINUSE`)
If port `5001` is already in use by another application or previous process:

1. Identify the process ID (PID) occupying port 5001:
   ```cmd
   netstat -ano | findstr :5001
   ```
2. Inspect the process name using its PID (the number in the rightmost column):
   ```cmd
   tasklist /FI "PID eq <PID>"
   ```
3. If you confirm it is a leftover Node or background process that is safe to terminate:
   ```powershell
   Stop-Process -Id <PID>           # PowerShell
   taskkill /F /PID <PID>           # Command Prompt
   ```
4. **Alternative**: You can simply change the port in `.env` without stopping anything:
   ```env
   BACKEND_PORT=5002
   ```
   The frontend Vite proxy automatically forwards requests to your configured `BACKEND_PORT`.

### PostgreSQL Service Not Running
If `npm run setup` reports that PostgreSQL cannot be reached:
```powershell
# Start PostgreSQL service
Start-Service -Name postgresql-x64-16
```
Or open `services.msc` via `Win + R`, locate **postgresql-x64-XX**, and click **Start**.

---

## 🧪 Testing and Building

```powershell
# Run backend algorithm tests
npm test --workspace=backend

# Run frontend tests
npm test --workspace=frontend

# Build for production
npm run build
```

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
