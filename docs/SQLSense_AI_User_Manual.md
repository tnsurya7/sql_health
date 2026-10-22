# SQLSense AI — Beginner-Friendly User Manual & Observability Guide

> **SQLSense AI: Database Observer & Query Intelligence Platform**  
> *Version:* 2.0.0 Enterprise Ready  
> *Target Systems:* PostgreSQL 14+, MySQL 8+, Oracle 19c+, SQL Server 2019+  
> *Application Stack:* React 18, TypeScript, Vite, TailwindCSS, Node.js, Express, Prisma ORM, Gemini AI, Vector RAG

---

## Table of Contents
1. [Introduction & Architectural Overview](#1-introduction--architectural-overview)
2. [Foundational Database & Query Concepts](#2-foundational-database--query-concepts)
3. [System Navigation & Global Controls](#3-system-navigation--global-controls)
4. [Module 1: Dashboard & Observability Drilldown](#4-module-1-dashboard--observability-drilldown)
5. [Module 2: Databases & Connection Manager](#5-module-2-databases--connection-manager)
6. [Module 3: SQL Analyzer & Static Rule Engine](#6-module-3-sql-analyzer--static-rule-engine)
7. [Module 4: Query Optimizer & Candidate Pipeline](#7-module-4-query-optimizer--candidate-pipeline)
8. [Module 5: Execution Plans & Physical Tree Traversal](#8-module-5-execution-plans--physical-tree-traversal)
9. [Module 6: Schema Explorer & Relationship Graph](#9-module-6-schema-explorer--relationship-graph)
10. [Module 7: Index Advisor (Schema & Workload Driven)](#10-module-7-index-advisor-schema--workload-driven)
11. [Module 8: Stored Procedures Static Quality Engine (SP001–SP015)](#11-module-8-stored-procedures-static-quality-engine-sp001sp015)
12. [Module 9: Views, Functions, and Triggers Analyzers](#12-module-9-views-functions-and-triggers-analyzers)
13. [Module 10: Performance Benchmarking & Anomaly Telemetry](#13-module-10-performance-benchmarking--anomaly-telemetry)
14. [Module 11: Lock Contention & Deadlock DFS Graph](#14-module-11-lock-contention--deadlock-dfs-graph)
15. [Module 12: Unified Recommendations Engine & Lifecycle](#15-module-12-unified-recommendations-engine--lifecycle)
16. [Module 13: Database Health & Compliance Scoring](#16-module-13-database-health--compliance-scoring)
17. [Module 14: Query History & Historical Telemetry](#17-module-14-query-history--historical-telemetry)
18. [Module 15: RAG Optimization Knowledge Base](#18-module-15-rag-optimization-knowledge-base)
19. [Module 16: Settings & Administrative Controls](#19-module-16-settings--administrative-controls)
20. [Security, Read-Only Guards & Secret Protection](#20-security-read-only-guards--secret-protection)
21. [Common Errors & Troubleshooting Guide](#21-common-errors--troubleshooting-guide)
22. [Step-by-Step Manual Testing Walkthrough](#22-step-by-step-manual-testing-walkthrough)

---

## 1. Introduction & Architectural Overview

### 1.1 What is SQLSense AI?
SQLSense AI is an enterprise-grade database observability, static code analysis, and query optimization platform. In modern web and enterprise architectures, database latency accounts for 70% to 90% of total application response time. Poorly indexed foreign keys, non-sargable query filters, sub-optimal join sequences, missing composite indexes, and buggy stored procedures create severe system bottlenecks.

SQLSense AI connects to your live relational database and provides:
1. **Deterministic Static Code Quality Analysis**: Instant detection of 25 query anti-patterns (`R001`–`R025`) and 15 stored procedure flaws (`SP001`–`SP015`).
2. **Deterministic Query Optimization**: Relational algebra transformations (predicate push-down, subquery unnesting, constant folding) combined with Dynamic Programming (DP-Size) Join Order optimization.
3. **Multi-Source AI & RAG Augmentation**: Grounded candidate generation combining localized vector retrieval (RAG) with Google Gemini AI.
4. **Physical Plan Introspection**: Live PostgreSQL `EXPLAIN (ANALYZE, COSTS, BUFFERS)` node traversal with visual cardinality error detection.
5. **Safe Performance Benchmarking**: Controlled iteration benchmarks with buffer warm-up runs and before-and-after performance comparisons.
6. **Telemetry & Statistical Anomaly Detection**: Simple Moving Averages (SMA), Exponential Moving Averages (EMA), Z-Score latency spike detection ($|Z| \ge 2.5$), and Isolation Forest anomaly scoring.

### 1.2 System Architecture
```
┌────────────────────────────────────────────────────────────────────────┐
│                          Frontend (React 18 + Vite)                    │
│   Dashboard | SQL Analyzer | Optimizer | Plans | Index Advisor | etc.  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │ HTTP / REST APIs (Port 5001)
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Backend (Node.js + Express)                     │
│  ┌────────────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ Anti-Pattern Engine    │  │ DP-Join Engine │  │ Procedure Parser │  │
│  │ (AST Lexer & Rules)    │  │ (Relational)   │  │ (PL/pgSQL SP)    │  │
│  └────────────────────────┘  └────────────────┘  └──────────────────┘  │
│  ┌────────────────────────┐  ┌────────────────┐  ┌──────────────────┐  │
│  │ RAG Vector Knowledge   │  │ Gemini Client  │  │ Anomaly Engine   │  │
│  │ (Embeddings & Chunks)  │  │ (AI Candidate) │  │ (Z-Score & IF)   │  │
│  └────────────────────────┘  └────────────────┘  └──────────────────┘  │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │ Prisma ORM                             │ Target Adapter
                ▼                                        ▼
┌───────────────────────────────┐        ┌───────────────────────────────┐
│     Application Database      │        │       Target Database         │
│         (PostgreSQL)          │        │    (sqlsense_test on 5432)    │
│  Users, Queries, Analyses,    │        │  Catalogs, Tables, Routines,  │
│  Recommendations, Metrics     │        │  Buffer Cache, Live Plans     │
└───────────────────────────────┘        └───────────────────────────────┘
```

---

## 2. Foundational Database & Query Concepts

If you are new to relational databases or SQL optimization, this section explains the core concepts in plain English.

### 2.1 Abstract Syntax Tree (AST) Parsing
When you submit a SQL query, a computer cannot understand it as raw text. An **AST Parser** reads the string of characters, groups them into tokens (like `SELECT`, column names, numbers, operators), and organizes them into a hierarchical tree data structure:
- **Root Node**: The statement type (e.g., `SELECT`).
- **Projection Nodes**: The columns you requested (`first_name`, `email`).
- **Relation Nodes**: The tables you are reading from (`customers`).
- **Predicate Nodes**: The filters in your `WHERE` clause (`id = 1`).

SQLSense AI uses AST traversal to inspect every clause deterministically, without executing destructive queries on your database.

### 2.2 Sargability (Search Argument Ability)
A query predicate is **sargable** (Search-Argument-able) if the database query engine can use an index to jump directly to matching rows (an **Index Scan**) rather than inspecting every single row from beginning to end (a **Sequential Scan**).

- **Non-Sargable Example**: `WHERE LOWER(email) = 'user@example.com'`  
  *Why it is bad:* Because `LOWER()` is applied to every row in the table at runtime, the database cannot use a standard index on `email`. It must read all 1,000,000 rows.
- **Sargable Example**: `WHERE email = 'user@example.com'`  
  *Why it is good:* The database performs an instant B-Tree traversal in $O(\log N)$ time, reading only 1 or 2 disk blocks.

### 2.3 B-Tree & Composite Indexes
A **B-Tree (Balanced Tree)** index is like the alphabetical index at the back of a 1,000-page textbook. Instead of reading every page to find "Photosynthesis", you check the index and jump directly to page 412.
- **Single-Column Index**: Created on one column, e.g., `CREATE INDEX idx_orders_status ON orders(status);`
- **Composite Index**: Created on multiple columns, e.g., `CREATE INDEX idx_orders_cust_status ON orders(customer_id, status);`
- **The Golden Rule of Composite Indexes**: Equality columns come first, range columns come second (`Equality -> Range`).

### 2.4 Query Execution Plans: Sequential Scan vs Index Scan
When you ask PostgreSQL to run a query, the **Cost-Based Optimizer (CBO)** considers dozens of different execution strategies:
1. **Sequential Scan (`Seq Scan`)**: Reads the table file sequentially from start to finish. Fast for 10 rows; disastrous for 10,000,000 rows.
2. **Index Scan (`Index Scan`)**: Traverses the B-tree to find physical tuple pointers (`ctid`), then fetches only those rows from the heap table.
3. **Index Only Scan**: All requested columns are present in the index itself! The database never even touches the main table heap.
4. **Bitmap Index Scan**: Scans multiple index pages, constructs an in-memory bitmap of row locations, and reads the table in physical disk order.

### 2.5 Relational Algebra & Cost-Based Optimization
Relational algebra is the mathematical framework behind SQL:
- **Selection ($\sigma$)**: Filtering rows (`WHERE` clause).
- **Projection ($\pi$)**: Selecting columns (`SELECT` clause).
- **Join ($\bowtie$)**: Combining tables based on matching keys.
- **Predicate Push-down**: If you filter `WHERE customers.country = 'USA'` after joining 5 tables, moving that filter **before** the join eliminates millions of unnecessary intermediate tuples!

### 2.6 Dynamic Programming Join Optimization (DP-Size)
When you join 4 tables ($A, B, C, D$), there are $4! = 24$ possible join orders:
- $((A \bowtie B) \bowtie C) \bowtie D$
- $(A \bowtie C) \bowtie (B \bowtie D)$
- And many more.

The **DP-Size algorithm** evaluates subsets of size 1 (single relations), then combines them into subsets of size 2, then size 3, and finally the full query. It calculates the physical cost of each combination using table row counts and index availability, pruning expensive orders and guaranteeing the mathematically cheapest execution plan.

---

## 3. System Navigation & Global Controls

### 3.1 Sidebar Navigation
The left sidebar provides one-click navigation across all 18 application modules:
- **Dashboard**: High-level telemetry, KPI cards, and critical issue drilldowns.
- **Databases**: Add, test, connect, seed, and manage database connection profiles.
- **SQL Analyzer**: Paste SQL queries for instant static AST code quality analysis (Rules R001–R025).
- **Query Optimizer**: Multi-engine candidate generation (Relational Algebra, DP Join, Gemini AI, RAG).
- **Execution Plans**: Live visual tree rendering of PostgreSQL physical execution plans with cost badges.
- **Schema Explorer**: Interactive catalog of tables, columns, constraints, indexes, and relationship graph.
- **Index Advisor**: Automated indexing recommendations based on schema gaps and query workloads.
- **Stored Procedures**: SonarQube-style static code quality analysis for PL/pgSQL procedures (Rules SP001–SP015).
- **Views, Functions, Triggers**: Dedicated analyzers for PostgreSQL database objects.
- **Performance**: Safe 5-iteration benchmarking loop with before/after comparisons and anomaly charts.
- **Deadlocks**: Directed wait-for graph with Depth-First Search (DFS) cycle detection.
- **Recommendations**: Unified repository of recommendations from all 7 modules with lifecycle management.
- **Database Health**: Real-time weighted health score (0–100) calculated across 5 dimensions.
- **Query History**: Audit log of all analyzed, optimized, and benchmarked SQL runs.
- **RAG Knowledge**: Search, inspect, and ingest optimization knowledge chunks and best practices.
- **Settings**: System configuration, database connectivity, and administrative tools.

### 3.2 Header Controls & Database Switcher
- **Global Search Launcher (`⌘K` or `Ctrl+K`)**: Opens the universal search palette. Type table names (`customers`), rule codes (`R001`), or keywords (`index`) to instantly jump to results.
- **Active Database Dropdown**: Located at the top right of the navigation header. Allows instant switching between configured databases (e.g., `SQLSense Test Database`). All schema lookups and execution plans immediately synchronize to the chosen database.
- **Theme Toggle**: Switch between Dark Mode and Light Mode.
- **User Profile & Logout**: Displays your authenticated session (`admin@localhost`) with secure JWT token revocation upon logout.

---

## 4. Module 1: Dashboard & Observability Drilldown

### 4.1 Purpose
The Dashboard provides an instant, executive-level pulse of your database health, operational performance, active issues, and stored procedure code quality.

### 4.2 Key Metrics Cards
1. **Target Database Health (0–100%)**:
   - Calculated dynamically from buffer cache hit ratio, index coverage, transaction contention, and query latency.
   - Click to open the **Health Breakdown Modal**, displaying weighted sub-scores for Performance (35%), Security (20%), Indexing (20%), Quality (15%), and Maintainability (10%).
2. **Critical Issues Counter**:
   - Aggregates all open High and Critical severity findings across SQL Analyzer, Index Advisor, and Stored Procedures.
   - Click to open the **Critical Issues Drilldown Modal**, displaying the exact query or object, rule ID, and remediation.
3. **Stored Procedures Scanned**:
   - Displays total routines scanned and average quality score.
   - Click to open the **Stored Procedure Batch Quality Modal**, showing per-procedure scores, lines of code (LOC), and risk classifications.
4. **Queries Analyzed**:
   - Total queries inspected in the current session.
   - Click to open the **Recent Queries Modal**, displaying normalized SQL, fingerprints, scores, and execution timestamps.

---

## 5. Module 2: Databases & Connection Manager

### 5.1 Purpose
Manage connection profiles for target databases. SQLSense AI supports PostgreSQL, MySQL, Oracle, and Microsoft SQL Server.

### 5.2 Step-by-Step Instructions: Connecting to `sqlsense_test`
1. Navigate to **Databases** (`/databases`) or **Settings** (`/settings`).
2. Click **Add Database Connection** to open the connection modal.
3. Enter the connection parameters:
   - **Connection Name**: `SQLSense Test Database`
   - **Database Type**: `POSTGRESQL`
   - **Host**: `localhost`
   - **Port**: `5432`
   - **Database Name**: `sqlsense_test`
   - **Schema**: `public`
   - **Username**: `postgres`
   - **Password**: `surya` (or your local postgres password)
   - **Read-Only Mode**: `Enabled` (Recommended for safety)
4. Click **Test Connection**:
   - SQLSense AI verifies network connectivity, queries `SELECT version()`, and measures latency.
   - A green checkmark displays the connection latency in milliseconds.
5. Click **Save Connection**:
   - The password is encrypted using AES-256-CBC before storage in the application database.
   - Cleartext passwords are never returned in any API response.
6. Click **Activate**:
   - Sets this connection as the active target for the entire application.

---

## 6. Module 3: SQL Analyzer & Static Rule Engine

### 6.1 Purpose
Static analysis of SQL queries before they ever reach production. SQLSense AI checks queries against 25 deterministic anti-pattern rules (`R001`–`R025`).

### 6.2 Supported Rules Summary
| Rule ID | Name | Severity | Description |
| :--- | :--- | :--- | :--- |
| `R001` | Wildcard Projection (`SELECT *`) | Medium | Unnecessary columns increase network I/O and prevent Index-Only scans. |
| `R002` | Non-Sargable Function | High | `LOWER(col)`, `UPPER(col)`, `DATE(col)` on indexed columns causes sequential scans. |
| `R003` | Missing Foreign Key Index | High | Unindexed foreign keys cause full table locks during child updates. |
| `R004` | Redundant Boolean Comparison | Low | `WHERE is_active = TRUE` is redundant; use `WHERE is_active`. |
| `R005` | Tautology Predicate | Medium | `WHERE 1 = 1` wastes CPU evaluation cycles. |
| `R006` | Deeply Nested Subqueries | High | Subqueries nested deeper than 2 levels degrade planner accuracy. |
| `R010` | Implicit Cartesian Join | Critical | Comma joins without explicit ON conditions risk accidental full cross products. |
| `R011` | Invalid NULL Comparison | High | `= NULL` always evaluates to UNKNOWN; use `IS NULL`. |
| `R012` | NOT IN with Nullable Columns | High | `NOT IN (SELECT ...)` returns zero rows if any subquery row is NULL. |
| `R015` | Non-Deterministic Sorting | High | `ORDER BY RANDOM()` requires materializing and sorting the entire table. |
| `R016` | Destructive DELETE Without WHERE | Critical | Deletes every row in the target table. |
| `R017` | Destructive UPDATE Without WHERE | Critical | Overwrites every row in the target table. |
| `R018` | Table Truncation (`TRUNCATE`) | Critical | Irreversible data deletion statement. |
| `R019` | Drop Statement (`DROP`) | Critical | Destructive schema deletion statement. |
| `R025` | Leading Wildcard (`LIKE '%abc'`) | Medium | Leading wildcards cannot use standard B-Tree index ordering. |

### 6.3 Interactive Controls
- **Format SQL**: Re-indents keywords and organizes clauses onto clean newlines.
- **Copy**: Copies the query text to the system clipboard.
- **Analyze Query**: Runs AST parsing, anti-pattern rules, and complexity scoring.
- **AI Explain**: Calls Gemini AI to generate an intuitive, multi-point explanation of query logic, joined tables, and indexing suggestions.

---

## 7. Module 4: Query Optimizer & Candidate Pipeline

### 7.1 Purpose
Generates, validates, and compares mathematically optimized versions of slow queries.

### 7.2 The Multi-Engine Pipeline
```
Original SQL
    │
    ├──▶ 1. Relational Algebra Optimizer (Deterministic)
    │       - Predicate Push-Down
    │       - IN-Subquery Unnesting
    │       - Constant Folding
    │
    ├──▶ 2. Dynamic Programming (DP-Size) Join Optimizer
    │       - Table Permutations Evaluated
    │       - Cheaper Join Orientation Selected
    │
    └──▶ 3. Gemini AI + RAG Generator
            - Retrieves Domain Guidelines from Vector Store
            - Proposes Syntactically Aligned Query Candidate
    │
    ▼
Strict 5-Point Validation Gate
    ├── Syntax Validation (AST Parser)
    ├── Safety Validation (SELECT Only, Read-Only Guard)
    ├── Semantic Validation (Preserves Relations & Projection)
    ├── Schema Validation (Tables & Columns Exist in Target DB)
    └── EXPLAIN Validation (Generates Valid Physical Plan)
    │
    ▼
Cost-Based Optimizer Evaluation (CBO)
    ├── Compare Original Cost vs Candidate Cost
    └── Select Winning Candidate (Best Positive Cost Reduction)
```

### 7.3 How to Use the Monaco Diff Viewer
1. Enter your SQL query in the input panel.
2. Click **Run Optimization Pipeline**.
3. Inspect the candidate tabs:
   - **Relational Algebra**: Shows algebraic transformations.
   - **DP Join Optimizer**: Shows re-ordered join sequences.
   - **Gemini AI + RAG**: Shows AI-assisted rewrites.
4. The Monaco **Diff Editor** displays the original query on the left and the candidate query on the right, with green additions and red deletions clearly highlighted.
5. Inspect the **5-Point Validation Badges** below the editor to confirm that the candidate passed all safety gates.

---

## 8. Module 5: Execution Plans & Physical Tree Traversal

### 8.1 Purpose
Inspect the actual physical execution strategy chosen by the PostgreSQL query planner.

### 8.2 What the Colors & Badges Mean
- **Cyan Nodes**: Normal, low-cost operations (e.g., Index Scan, Hash, Materialize).
- **Red Nodes / "High Cost" Badge**: Expensive operations where estimated total cost exceeds 100 units.
- **Startup Cost**: Work required before the first row can be returned (e.g., building a hash table).
- **Total Cost**: Total work units required to return all matching rows.
- **Actual Time (ms)**: Real measured latency recorded by `EXPLAIN ANALYZE`.
- **Cardinality Assessment**: Compares estimated rows vs actual rows. When the ratio exceeds 10x or 100x, SQLSense AI flags a **Severe Cardinality Discrepancy**, indicating that table statistics are stale and `ANALYZE <table>` is required.

---

## 9. Module 6: Schema Explorer & Relationship Graph

### 9.1 Purpose
Introspect live tables, columns, constraints, indexes, views, functions, and procedures from the active database catalog.

### 9.2 Key Features
1. **Tables List**: Real-time table count and estimated row count from `pg_class.reltuples`.
2. **Columns Tab**: Column names, data types, nullability, defaults, primary keys (`PK`), and foreign keys (`FK`).
3. **Indexes Tab**: Index names, index types (B-Tree, GIN, GiST), unique constraints, index definitions, and table sizes.
4. **Constraints Tab**: Primary keys, foreign key target tables, unique constraints, and check expressions.
5. **Relationship Graph**: Displays interactive nodes and foreign key edges connecting related tables across your database schema.

---

## 10. Module 7: Index Advisor (Schema & Workload Driven)

### 10.1 Purpose
Recommends optimal B-Tree and composite indexes to eliminate slow sequential scans.

### 10.2 Two Modes of Operation
1. **Schema Inspection Mode**:
   - Introspects live foreign key constraints in the database catalog.
   - Discovers any foreign key column that lacks a supporting index.
   - Recommends instant covering indexes to prevent full table locking during parent row deletes.
2. **Workload Query Mode**:
   - Inspects SQL queries from your workload.
   - Identifies equality filters (`status = 'COMPLETED'`) and range filters (`created_at >= ...`).
   - Recommends multi-column composite indexes following the `Equality First, Range Second` rule.
   - Checks if a covering index already exists to avoid redundant indexes.

---

## 11. Module 8: Stored Procedures Static Quality Engine (SP001–SP015)

### 11.1 Purpose
SonarQube-style static code quality and security analysis for PL/pgSQL stored procedures.

### 11.2 Complete Rule Registry (SP001 to SP015)
| Rule ID | Name | Severity | What it Detects & Why it Matters |
| :--- | :--- | :--- | :--- |
| `SP001` | Missing `BEGIN ... END` Block | Critical | Incomplete control flow; causes syntax errors. |
| `SP002` | Unused Declared Variable | Minor | Declared variable is never read or assigned; dead code. |
| `SP003` | Unreachable Code | Major | Statements located directly after unconditional `RETURN` or `RAISE EXCEPTION`. |
| `SP004` | Redundant Boolean Comparison | Minor | `IF (cond) = TRUE THEN`; redundant evaluation. |
| `SP005` | Suspicious Tautology | Major | Constant conditions like `1 = 1` or `col = col`. |
| `SP006` | Unsafe Dynamic SQL (SQL Injection) | Blocker | `EXECUTE '... ' \|\| p_input` with unescaped string concatenation. Use `format()` or `USING`. |
| `SP007` | Swallowed Exception | Critical | `WHEN OTHERS THEN NULL;` silently hides crashes and data corruption. |
| `SP008` | Illegal Transaction in Function | Blocker | `COMMIT` or `ROLLBACK` inside a `FUNCTION`. Only allowed in `PROCEDURE`. |
| `SP009` | Unbounded Loop | Critical | `LOOP` without any `EXIT`, `EXIT WHEN`, or `RETURN`; creates infinite hangs. |
| `SP010` | Invalid NULL Comparison | Major | `v_var = NULL`; always evaluates to NULL. Use `IS NULL`. |
| `SP011` | Redundant Variable Assignment | Minor | Assigning to the same variable twice without an intervening read. |
| `SP012` | Unsafe DML Without WHERE Clause | Blocker | `UPDATE <table>` or `DELETE FROM <table>` without a `WHERE` clause inside routine. |
| `SP013` | High Cyclomatic Complexity | Major | Nesting depth $> 4$ or complexity score $> 10$; hard to maintain and test. |
| `SP014` | Cursor Resource Leak | Critical | `OPEN v_cur;` without a corresponding `CLOSE v_cur;`. |
| `SP015` | Duplicate Branch Condition | Major | Identical condition repeated in an `ELSIF` branch. |

---

## 12. Module 9: Views, Functions, and Triggers Analyzers

### 12.1 Purpose
Specialized static analysis for supplementary database routines:
- **Views Analyzer**: Inspects `SELECT *` inside view definitions, missing table joins, and non-deterministic functions.
- **Functions Analyzer**: Checks `STABLE` vs `VOLATILE` attributes, input argument validation, and return value consistency.
- **Triggers Analyzer**: Checks for missing `RETURN NEW;` in `BEFORE` triggers, unintended recursive trigger loops, and unindexed foreign key lookups in trigger bodies.

---

## 13. Module 10: Performance Benchmarking & Anomaly Telemetry

### 13.1 Purpose
Safe, repeatable query latency benchmarking and anomaly detection.

### 13.2 Safe Benchmark Runner Rules
1. **Read-Only Enforcement**: Only `SELECT` statements can be benchmarked. Destructive statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`) are strictly blocked.
2. **Buffer Warm-Up Run**: When enabled, runs the query once before recording to prime the database buffer cache, eliminating cold-start disk I/O distortion.
3. **5-Iteration Loop**: Executes the query 5 times and calculates:
   - **Minimum Time ($T_{\min}$)**
   - **Maximum Time ($T_{\max}$)**
   - **Average Time ($T_{\text{avg}}$)**
   - **Median Time ($T_{\text{med}}$)**
   - **95th Percentile ($P_{95}$)**
   - **Standard Deviation ($\sigma$)**
4. **Before vs After Comparison**: Run an original query and an optimized query side-by-side to measure the exact speedup multiplier and latency reduction percentage.

### 13.3 Statistical Anomaly Detection
- **Simple Moving Average (SMA)**: Unweighted mean of the previous 5 query executions.
- **Exponential Moving Average (EMA)**: Weighted mean placing higher importance on recent executions.
- **Z-Score Spike Detection**:
  $$Z = \frac{x - \mu}{\sigma}$$
  When $|Z| \ge 2.5$, SQLSense AI triggers an **Anomaly Latency Spike** alert.
- **Isolation Forest Scoring**: Multi-dimensional tree isolation measuring latency, execution cost, and returned row volume. High-dimensional outliers are flagged with anomaly scores between $0.5$ and $1.0$.

---

## 14. Module 11: Lock Contention & Deadlock DFS Graph

### 14.1 Purpose
Real-time lock analysis and deadlock prevention.

### 14.2 How DFS Cycle Detection Works
1. Queries `pg_locks` and `pg_stat_activity` to find all waiting transactions and blocking transactions.
2. Constructs a **Directed Wait-For Graph** where each node is a PostgreSQL process ID (`PID`) and each directed edge ($A \rightarrow B$) indicates that Transaction $A$ is waiting for a lock held by Transaction $B$.
3. Runs a **Depth-First Search (DFS)** cycle detection algorithm.
4. If a circular path is discovered ($A \rightarrow B \rightarrow A$ or $A \rightarrow B \rightarrow C \rightarrow A$), SQLSense AI triggers a **Deadlock Alert** with the involved PIDs and blocking queries.

---

## 15. Module 12: Unified Recommendations Engine & Lifecycle

### 15.1 Purpose
Aggregates findings from all 7 discovery engines into a single actionable inbox.

### 15.2 7 Discovery Sources
1. `SQL_ANALYZER`: Anti-pattern rules `R001`–`R025`.
2. `INDEX_ADVISOR`: Schema and workload index recommendations.
3. `QUERY_OPTIMIZER`: Relational algebra and DP join candidates.
4. `PERFORMANCE`: Latency spikes and execution regressions.
5. `PROCEDURE_ANALYZER`: Stored procedure quality rules `SP001`–`SP015`.
6. `DEADLOCK_DETECTOR`: Circular lock contention cycles.
7. `SCHEMA_EXPLORER`: Cardinality discrepancies and unindexed tables.

### 15.3 Recommendation Lifecycle
Every recommendation transitions through 4 deterministic states:
- **`OPEN`**: Discovered by analysis; awaiting team review.
- **`ACKNOWLEDGED`**: Team has reviewed the finding and queued it for implementation.
- **`RESOLVED`**: Index created or query rewritten; verified as solved.
- **`DISMISSED`**: Team explicitly rejected the recommendation with recorded justification.

---

## 16. Module 13: Database Health & Compliance Scoring

### 16.1 Purpose
A single, defensible 0–100 health score reflecting the overall state of your connected database.

### 16.2 Scoring Formula
$$\text{Health Score} = 0.35 \times \text{Perf} + 0.20 \times \text{Sec} + 0.20 \times \text{Idx} + 0.15 \times \text{Qual} + 0.10 \times \text{Maint}$$

- **Performance Dimension (35%)**: Buffer cache hit ratio ($\ge 99\%$ is optimal), average query execution time, and absence of active deadlocks.
- **Security Dimension (20%)**: Absence of SQL injection risks (`SP006`) and proper read-only guard enforcement.
- **Indexing Dimension (20%)**: Percentage of foreign keys with supporting indexes, plus ratio of index scans to sequential scans.
- **Quality Dimension (15%)**: Stored procedure code quality scores and low cyclomatic complexity.
- **Maintainability Dimension (10%)**: Absence of swallowed exceptions (`SP007`) and dead code (`SP002`).

> **Note on Disconnected State**: When no target database is connected, the health score is displayed as `Disconnected (null)`. SQLSense AI never hallucinates a fake 100% score for an offline database.

---

## 17. Module 14: Query History & Historical Telemetry

### 17.1 Purpose
Audit trail of every analyzed, optimized, and benchmarked SQL statement.

### 17.2 Features
- **Deterministic Fingerprinting**: Replaces literals (`id = 42` and `id = 999`) with parameterized placeholders (`id = ?`) to group queries into canonical fingerprints.
- **Historical Scores**: Preserves the quality score and detected issues at the time of analysis.
- **Filter by Database**: Switch between databases to view historical queries executed against specific systems.

---

## 18. Module 15: RAG Optimization Knowledge Base

### 18.1 Purpose
Retrieval-Augmented Generation (RAG) knowledge repository containing best practices for PostgreSQL, MySQL, Oracle, and SQL Server.

### 18.2 How to Search & Ingest Knowledge
1. **Search**: Enter keywords like `composite index` or `subquery unnesting`. SQLSense AI searches vector chunks and keyword tags to return matching DBA guidelines.
2. **Add Custom Knowledge**:
   - Click **Add Knowledge Chunk**.
   - Select Category (`INDEXING`, `QUERY_REWRITE`, `JOIN_OPTIMIZATION`, `SECURITY`).
   - Enter title, source document, and Markdown text.
   - Click **Ingest Knowledge**. The chunk is immediately available for search and context-grounded AI optimization.
3. **Reindex**: Click **Reindex Knowledge Base** to re-synchronize all knowledge documents.

---

## 19. Module 16: Settings & Administrative Controls

### 19.1 Purpose
Configure application parameters, encryption keys, and active database profiles.

### 19.2 Controls
- **Target Database Settings**: Host, port, credentials, and SSL toggles.
- **Seed Sample Database**: Runs automated seed script to populate sample test data.
- **Security Key Overview**: Displays encryption algorithm status (AES-256-CBC).

---

## 20. Security, Read-Only Guards & Secret Protection

SQLSense AI adheres to strict database security principles:
1. **Read-Only Benchmarking Guard**: Benchmarking is strictly confined to `SELECT` statements. The API rejects any payload containing `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, or `TRUNCATE`.
2. **Credential Masking**: Cleartext database passwords and JWT secrets are never returned in frontend API responses. Passwords are encrypted at rest using AES-256-CBC.
3. **AI Credential Protection**: The Gemini API key resides solely on the backend server. The frontend never receives AI credentials.
4. **SQL Parameterization**: All Prisma ORM queries and catalog introspection queries use parameterized inputs to prevent SQL injection.

---

## 21. Common Errors & Troubleshooting Guide

### 21.1 "No active database connected"
- **Cause**: No database connection is selected, or the selected connection is offline.
- **Fix**: Go to **Databases** (`/databases`), click **Activate** on `SQLSense Test Database`, and confirm the status dot turns green (`ONLINE`).

### 21.2 "Uncaught TypeError: Cannot read properties of undefined (reading 'linesOfCode')"
- **Status**: **RESOLVED** in Version 2.0.0.
- **Cause**: Routine analysis returned flat metric fields rather than nested objects.
- **Resolution**: Defensive property access handles both flat and nested schemas.

### 21.3 "TypeError: recs.filter is not a function"
- **Status**: **RESOLVED** in Version 2.0.0.
- **Cause**: API returned `{ success: true, data: { recommendations: [...] } }` where `data` was an object rather than an array.
- **Resolution**: Added `Array.isArray` fallback normalizers across all feature components.

### 21.4 "Cannot read properties of undefined (reading 'map')"
- **Status**: **RESOLVED** in Version 2.0.0.
- **Cause**: Performance benchmark breakdown expected `rawTimes`, while backend returned `iterations: [{ durationMs }]`.
- **Resolution**: Both `rawTimes` and `iterations` mapping are supported with zero-crash fallbacks.

---

## 22. Step-by-Step Manual Testing Walkthrough

Follow these steps to manually verify every module using the pre-seeded `sqlsense_test` database:

### Test 1: Verify Stored Procedure Analysis
1. Navigate to **Stored Procedures** (`/procedures`).
2. Click **Introspect Procedures (Live DB)**.
3. Select `process_order` from the procedure list.
4. Click **Run Static Analysis**.
5. **Expected Result**: SonarQube-style quality dashboard appears with lines of code, cyclomatic complexity, nesting depth, and quality score.

### Test 2: Verify Index Advisor
1. Navigate to **Index Advisor** (`/index-advisor`).
2. Click **Run Schema Inspection**.
3. **Expected Result**: Discovers unindexed foreign keys in the database schema and displays actionable `CREATE INDEX` SQL statements.

### Test 3: Verify Query Optimizer
1. Navigate to **Query Optimizer** (`/optimizer`).
2. Enter:
   ```sql
   SELECT * FROM customers WHERE 1 = 1 AND id = 10;
   ```
3. Click **Run Optimization Pipeline**.
4. **Expected Result**: Relational algebra candidate eliminates `1 = 1`, Monaco Diff Editor highlights changes, and all 5 validation checks pass.

### Test 4: Verify Performance Benchmarking
1. Navigate to **Performance** (`/performance`).
2. Enter:
   - **Primary SQL**: `SELECT * FROM customers WHERE id = 1;`
   - Check **Before vs After Comparison**.
   - **Alternate SQL**: `SELECT id, first_name, email FROM customers WHERE id = 1;`
   - **Iterations**: `5`
   - Check **Buffer Warm-Up Run**.
3. Click **Start Benchmark Loop**.
4. **Expected Result**: Runs 5 iterations, displays individual iteration latencies, average latency, and speedup comparison without errors.
