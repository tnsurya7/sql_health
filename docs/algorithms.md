# SQLSense AI - Implemented Algorithms

This document describes all algorithmic components implemented in the SQLSense AI engine.

---

## 1. SQL AST Parsing & DFS Traversal
- **Purpose**: Parse raw SQL into structured AST nodes and traverse recursively to compute structural complexity metrics.
- **Input**: SQL text (e.g., `SELECT * FROM customers WHERE id = 10`).
- **Output**: Typed AST representation and `TraversalMetrics` (depth, node counts, join count, subquery count).
- **Algorithm**:
  1. Tokenize query by SQL keywords, literals, identifiers, and symbols.
  2. Parse clauses: `SELECT`, `FROM`, `JOIN`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `LIMIT`.
  3. Traverse AST nodes with Depth-First Search (DFS) visitor pattern.
- **Complexity**: $O(N)$ where $N$ is the number of tokens in the SQL query.
- **Where Used**: `backend/src/services/sql-parser/dfs.ts`, `backend/src/services/sql-parser/parser.ts`.

---

## 2. Query Normalization & Fingerprinting
- **Purpose**: Normalize query variants with different literal parameters into a canonical template and generate a deterministic SHA-256 fingerprint for historical aggregation.
- **Input**: Raw SQL query.
- **Output**: Normalized SQL (`WHERE id = ?`) and 64-character SHA-256 hash.
- **Algorithm**:
  1. Replace string and numeric literals with `?`.
  2. Normalize whitespace, remove trailing semicolons, and convert SQL keywords to uppercase.
  3. Compute `SHA256(normalizedSQL)`.
- **Complexity**: $O(N)$ string transformation and hashing.
- **Where Used**: `backend/src/services/sql-parser/normalizer.ts`, `backend/src/services/sql-parser/fingerprint.ts`.

---

## 3. Rule-Based Anti-Pattern Engine (R001 - R025)
- **Purpose**: Identify 25 deterministic SQL anti-patterns with severity and confidence ratings.
- **Input**: AST and raw SQL string.
- **Output**: List of `QueryIssue` objects.
- **Rules Covered**:
  - `R001`: `SELECT *` wildcard projection.
  - `R002`: Function applied to filter/index column (`LOWER(col) = 'val'`).
  - `R003`: Missing index on filter column.
  - `R004`: Sequential scan on large table.
  - `R005`: Correlated subquery.
  - `R006`: Deep nested subquery.
  - `R007`: Redundant `DISTINCT` on unique columns.
  - `R008`: Large `IN` clause (>100 items).
  - `R009`: OR-heavy filtering preventing index usage.
  - `R010`: Implicit type conversion.
  - `R011`: Repeated subquery.
  - `R012`: Cartesian cross join.
  - `R013`: Excessive joins (>6 tables).
  - `R014`: Dynamic SQL / Cursor execution.
  - `R015`: SQL injection vulnerabilities.
  - `R016`: `UPDATE` without `WHERE` clause (CRITICAL).
  - `R017`: `DELETE` without `WHERE` clause (CRITICAL).
  - `R018`: `TRUNCATE` table statement.
  - `R019`: `DROP` database/table statement.
  - `R020`: Unbounded query without `LIMIT`.
  - `R021`: Missing join predicate.
  - `R022`: `ORDER BY` without supporting index.
  - `R023`: `GROUP BY` without index access path.
  - `R024`: Function-based filtering.
  - `R025`: Non-sargable leading wildcard (`LIKE '%val'`).
- **Complexity**: $O(K \cdot N)$ where $K = 25$ rules and $N$ is AST size.
- **Where Used**: `backend/src/services/rule-engine/rules.ts`, `engine.ts`.

---

## 4. Schema Graph & BFS Shortest Join Path
- **Purpose**: Model foreign key relationships as a directed graph and determine the shortest relational join path between arbitrary tables.
- **Input**: Source table name, target table name, and database foreign key metadata.
- **Output**: Array of table names representing the shortest join sequence.
- **Algorithm**: Breadth-First Search (BFS) over the adjacency graph of foreign key references.
- **Complexity**: $O(V + E)$ where $V$ is tables count and $E$ is foreign key constraints count.
- **Where Used**: `backend/src/services/schema-analyzer/schema-graph.ts`.

---

## 5. Execution Plan Tree Traversal & Cardinality Error Ratio
- **Purpose**: Parse physical PostgreSQL JSON execution plans, aggregate cost/time bottlenecks, and detect stale optimizer statistics.
- **Input**: PostgreSQL JSON EXPLAIN output.
- **Output**: Parsed plan tree, expensive nodes list, and Cardinality Error Ratio ($Ratio = Actual / Estimated$).
- **Algorithm**:
  1. Recursive DFS traversal calculating total subtree cost, execution time, and buffer cache hits.
  2. For each node, calculate $Ratio = \frac{\max(ActualRows, 1)}{\max(PlanRows, 1)}$.
  3. Flag discrepancies exceeding $10\times$ (HIGH) or $100\times$ (CRITICAL) as stale statistics requiring `ANALYZE`.
- **Complexity**: $O(M)$ where $M$ is the number of execution plan nodes.
- **Where Used**: `backend/src/services/execution-plan/plan-tree.ts`, `plan-traversal.ts`, `cardinality.ts`.

---

## 6. Index Advisor (Selectivity & Cost-Benefit Analysis)
- **Purpose**: Recommend optimal composite B-Tree indexes based on query predicates, sorting, and join conditions.
- **Input**: Table name, WHERE filter columns, JOIN columns, ORDER BY columns, and existing table indexes.
- **Output**: Non-redundant `CREATE INDEX` DDL with estimated speedup %, storage footprint, and write overhead.
- **Algorithm**:
  1. Estimate column selectivity $S = \frac{DistinctValues}{TotalRows}$.
  2. Order composite index columns: **Equality predicates first**, followed by **Range filters and ORDER BY columns**.
  3. Verify against existing table indexes to prevent duplicate or prefix-redundant indexes.
- **Complexity**: $O(C \log C + I)$ where $C$ is candidate columns and $I$ is existing index count.
- **Where Used**: `backend/src/services/index-advisor/advisor.ts`, `selectivity.ts`, `cost-benefit.ts`.

---

## 7. Relational Algebra Optimizer & Rewriter
- **Purpose**: Deterministically transform queries using algebraic equivalence rules.
- **Input**: Parsed AST or SQL query.
- **Output**: Equivalence-preserving optimized SQL.
- **Transformations**:
  - Predicate Pushdown: Push filter predicates beneath join operations.
  - Constant Folding: Simplify arithmetic and static functions (`24 * 60` $\rightarrow$ `1440`).
  - Redundant Predicate Simplification: Eliminate tautologies (`1=1`, `TRUE AND ...`).
  - Redundant DISTINCT Elimination: Remove `DISTINCT` when grouping or querying primary keys.
  - Subquery Unnesting: Convert non-correlated `IN (SELECT ...)` subqueries to `INNER JOIN`.
- **Where Used**: `backend/src/services/optimizer/relational-algebra.ts`.

---

## 8. Dynamic Programming Join Order Optimizer (DP-Size)
- **Purpose**: Find optimal join order for multi-table queries by evaluating join subsets.
- **Input**: Array of relation names and estimated single-relation cardinality/costs.
- **Output**: Optimal join tree string and estimated cost.
- **Algorithm**:
  1. Base case: $DP[\{R_i\}] = Cost(R_i)$.
  2. For subset sizes $s = 2 \dots N$:
     - For each subset $S$ of size $s$, iterate over disjoint partitions $S_1 \subset S$ and $S_2 = S \setminus S_1$.
     - Calculate $Cost(S_1 \bowtie S_2) = Cost(S_1) + Cost(S_2) + (\text{Join Overhead} \times \text{Rows})$.
     - Update $DP[S] = \min(DP[S], Cost(S_1 \bowtie S_2))$.
- **Complexity**: $O(3^N)$ subset dynamic programming (tractable for $N \le 8$; switches to greedy heuristic for $N > 8$).
- **Where Used**: `backend/src/services/optimizer/dp-join-optimizer.ts`.

---

## 9. Time-Series Telemetry & Anomaly Detection (SMA, EMA, Z-Score, CUSUM)
- **Purpose**: Detect execution latency anomalies, spikes, and performance regressions.
- **Input**: Time-series latency points $[(t_1, v_1), (t_2, v_2), \dots]$.
- **Output**: SMA, EMA, Z-Score anomaly points, and CUSUM change points.
- **Formulas**:
  - $SMA_t = \frac{1}{k} \sum_{i=0}^{k-1} v_{t-i}$
  - $EMA_t = \alpha \cdot v_t + (1 - \alpha) \cdot EMA_{t-1}$
  - $Z_t = \frac{v_t - \mu}{\sigma}$ (Flagged as anomaly when $|Z_t| \ge 2.5$)
  - CUSUM: $S_t^+ = \max(0, S_{t-1}^+ + v_t - \mu - k)$, $S_t^- = \max(0, S_{t-1}^- - v_t + \mu - k)$
- **Where Used**: `backend/src/services/monitoring/time-series.ts`.

---

## 10. Isolation Forest Multi-Feature Anomaly Detector
- **Purpose**: Unsupervised anomaly detection on multidimensional execution telemetry (Latency, Rows, Cost).
- **Input**: Multidimensional feature vectors $\{ (\text{latency}, \text{rows}, \text{cost})_i \}$.
- **Output**: Anomaly score $s \in [0, 1]$ and binary classification.
- **Algorithm**: Build random isolation trees partitioning feature ranges. Shorter average path length $E(h(x))$ indicates an anomaly.
- **Complexity**: $O(T \cdot N \log N)$ where $T$ is trees count (50) and $N$ is sample points count.
- **Where Used**: `backend/src/services/monitoring/isolation-forest.ts`.

---

## 11. Transaction Deadlock Wait-For Graph & DFS Cycle Detection
- **Purpose**: Detect distributed transaction deadlocks from live lock dependency telemetry.
- **Input**: Active lock holders and waiting transaction IDs.
- **Output**: Boolean deadlock status and transaction cycle path (e.g., $T_1 \rightarrow T_2 \rightarrow T_1$).
- **Algorithm**: Build directed graph $G = (V, E)$ where edge $T_a \rightarrow T_b$ indicates $T_a$ is blocked by $T_b$. Run recursive DFS with recursion stack tracking to detect cycles.
- **Complexity**: $O(V + E)$.
- **Where Used**: `backend/src/services/deadlock/deadlock-detector.ts`.

---

## 12. Deterministic Multi-Dimensional Health Scorer
- **Purpose**: Deterministically score overall database health from real telemetry without AI hallucination.
- **Formula**:
  $$\text{Score} = (0.35 \times \text{Perf}) + (0.20 \times \text{Sec}) + (0.20 \times \text{Idx}) + (0.15 \times \text{Qual}) + (0.10 \times \text{Maint})$$
- **Where Used**: `backend/src/services/health/health-calculator.ts`.
