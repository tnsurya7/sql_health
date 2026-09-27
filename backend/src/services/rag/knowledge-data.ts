export interface SeedKnowledgeDoc {
  title: string;
  category: "INDEXING" | "SARGABILITY" | "JOINS" | "CARDINALITY" | "REWRITE" | "SECURITY" | "PERFORMANCE";
  databaseType: "ALL" | "postgresql" | "mysql" | "oracle" | "sqlserver";
  source: string;
  version: string;
  chunks: Array<{
    title: string;
    content: string;
    keywords: string[];
    category: string;
    databaseType: string;
  }>;
}

export const SEED_KNOWLEDGE_DOCS: SeedKnowledgeDoc[] = [
  {
    title: "PostgreSQL B-Tree Indexing and Multi-Column Index Optimization",
    category: "INDEXING",
    databaseType: "postgresql",
    source: "PostgreSQL 16 Documentation & High Performance Postgres Manual",
    version: "16.2",
    chunks: [
      {
        title: "Composite Index Ordering (Equality Before Range)",
        content:
          "In PostgreSQL B-Tree indexes, column order is paramount. Place all equality filter columns (=, IS NULL) first in the index definition, followed by range or inequality filters (<, >, BETWEEN, LIKE), and finally sort/ORDER BY columns. This allows index seek to navigate directly to the target leaf page.",
        keywords: ["btree", "composite index", "index ordering", "equality first", "range scan", "postgresql"],
        category: "INDEXING",
        databaseType: "postgresql",
      },
      {
        title: "Covering Indexes and Index-Only Scans with INCLUDE",
        content:
          "PostgreSQL supports covering indexes using the INCLUDE clause (e.g. CREATE INDEX idx_orders_cust ON orders (customer_id) INCLUDE (total_amount, status);). Payload columns in INCLUDE are stored only at leaf levels and are not part of the B-Tree search keys, enabling zero-heap-fetch Index-Only Scans while minimizing index write bloat.",
        keywords: ["covering index", "include clause", "index only scan", "heap fetch", "postgresql"],
        category: "INDEXING",
        databaseType: "postgresql",
      },
      {
        title: "Expression and Functional Indexes for Non-Sargable Filters",
        content:
          "When queries must filter by transformed values (e.g. LOWER(email) or DATE_TRUNC('month', created_at)), PostgreSQL standard B-Tree indexes cannot be used. Creating an expression index: CREATE INDEX idx_lower_email ON customers (LOWER(email)); allows the optimizer to perform an Index Scan directly matching the expression.",
        keywords: ["expression index", "functional index", "lower", "date_trunc", "sargable", "postgresql"],
        category: "INDEXING",
        databaseType: "postgresql",
      },
    ],
  },
  {
    title: "Query Sargability and Anti-Pattern Mitigation",
    category: "SARGABILITY",
    databaseType: "ALL",
    source: "Relational Query Optimization Best Practices & SQL Performance Explained",
    version: "2.0",
    chunks: [
      {
        title: "Eliminating Function Wrappers in Predicates",
        content:
          "SARGable stands for 'Search ARGument Able'. An expression is non-sargable when an indexed column is wrapped in a scalar function (e.g., WHERE YEAR(order_date) = 2026). The database engine must evaluate the function on every row. Rewrite to explicit range bounds: WHERE order_date >= '2026-01-01' AND order_date < '2027-01-01'.",
        keywords: ["sargable", "function wrapping", "year", "date range", "full scan", "predicate"],
        category: "SARGABILITY",
        databaseType: "ALL",
      },
      {
        title: "Leading Wildcard in LIKE / ILIKE Predicates",
        content:
          "Queries using LIKE '%substring' cannot use standard B-Tree index traversal because the starting prefix is unknown. For PostgreSQL, create a trigram GIN index using the pg_trgm extension: CREATE INDEX idx_trgm ON table USING gin (column gin_trgm_ops); to accelerate arbitrary wildcard and substring searches.",
        keywords: ["like", "wildcard", "gin index", "pg_trgm", "trigram", "substring search"],
        category: "SARGABILITY",
        databaseType: "postgresql",
      },
      {
        title: "Implicit Type Conversion and Cast Penalty",
        content:
          "Comparing a VARCHAR column with an unquoted integer (e.g., WHERE phone_number = 1234567890) forces the engine to apply CAST(phone_number AS BIGINT) to every table row, discarding the index on phone_number. Always match literal data types to column schema definitions.",
        keywords: ["implicit conversion", "type casting", "data type mismatch", "unquoted literals"],
        category: "SARGABILITY",
        databaseType: "ALL",
      },
    ],
  },
  {
    title: "Join Optimization and Subquery Elimination",
    category: "JOINS",
    databaseType: "ALL",
    source: "Database Engine Architecture & Query Execution Internals",
    version: "3.1",
    chunks: [
      {
        title: "Unnesting Correlated Subqueries into Joins",
        content:
          "Correlated subqueries in WHERE clauses (WHERE x.id IN (SELECT y.id FROM y WHERE y.val = x.val)) often incur O(N*M) execution time. Unnesting them into an explicit INNER JOIN or Common Table Expression (CTE) allows the optimizer to utilize Hash Join or Merge Join algorithms with O(N+M) complexity.",
        keywords: ["correlated subquery", "unnesting", "inner join", "hash join", "merge join"],
        category: "JOINS",
        databaseType: "ALL",
      },
      {
        title: "Join Order and Dynamic Programming Strategy",
        content:
          "When joining multiple tables, the query optimizer must evaluate join trees (left-deep vs bushy). Placing the most selective table first as the build relation in a Hash Join minimizes intermediate working memory (work_mem) footprint and prevents expensive disk spills during hash joins.",
        keywords: ["join order", "dynamic programming", "hash join", "work_mem", "disk spill"],
        category: "JOINS",
        databaseType: "ALL",
      },
      {
        title: "Cartesian Cross Join Hazards and Prevention",
        content:
          "A Cartesian product occurs when tables are combined without an ON join predicate. For tables of 10,000 and 20,000 rows, this generates 200,000,000 intermediate records, causing high CPU usage and out-of-memory errors. Always supply explicit foreign key join conditions.",
        keywords: ["cartesian join", "cross join", "missing on", "memory explosion"],
        category: "JOINS",
        databaseType: "ALL",
      },
    ],
  },
  {
    title: "PostgreSQL Execution Plan Diagnostics and Cardinality Errors",
    category: "CARDINALITY",
    databaseType: "postgresql",
    source: "PostgreSQL Query Planner Internals & Vacuum Maintenance",
    version: "16.0",
    chunks: [
      {
        title: "Root Causes of Cardinality Estimation Mismatch",
        content:
          "A high Cardinality Error Ratio (Actual Rows / Plan Rows > 10x) indicates stale planner statistics in pg_statistic or cross-column correlations. A severe underestimation causes the optimizer to choose Nested Loop scans instead of Hash/Merge joins. Fix with 'ANALYZE table_name;' or 'CREATE STATISTICS s_name (dependencies) ON col1, col2 FROM table_name;'.",
        keywords: ["cardinality error", "actual rows", "plan rows", "analyze", "create statistics", "nested loop"],
        category: "CARDINALITY",
        databaseType: "postgresql",
      },
      {
        title: "Sequential Scan vs Index Scan Cost Thresholds",
        content:
          "PostgreSQL cost formula uses random_page_cost (default 4.0) vs seq_page_cost (default 1.0). On modern SSD/NVMe NVRAM storage, reduce random_page_cost to 1.1 - 1.5 in postgresql.conf to encourage index scans on medium-sized tables.",
        keywords: ["seq scan", "random_page_cost", "seq_page_cost", "ssd", "index scan"],
        category: "CARDINALITY",
        databaseType: "postgresql",
      },
    ],
  },
  {
    title: "Database Lock Management and Deadlock Resolution",
    category: "SECURITY",
    databaseType: "ALL",
    source: "Concurrency Control and Lock Graph Analysis Guidelines",
    version: "2.4",
    chunks: [
      {
        title: "Deadlock Detection via Directed Wait-For Graphs",
        content:
          "Deadlocks occur when two or more transactions hold locks that each other requires, creating a cycle in the directed wait-for graph (e.g. Tx1 -> Tx2 -> Tx1). Prevent deadlocks by always acquiring locks on tables and rows in a consistent alphabetical or primary key order across all application transactions.",
        keywords: ["deadlock", "wait-for graph", "lock contention", "transaction cycle", "locking order"],
        category: "SECURITY",
        databaseType: "ALL",
      },
      {
        title: "Read-Only Transaction Isolation and Safe Benchmarking",
        content:
          "Always wrap query performance evaluations in 'SET TRANSACTION READ ONLY;' with strict statement timeouts (e.g., 'SET statement_timeout = 5000;') to prevent rogue long-running queries from blocking production replication streams or holding shared table locks.",
        keywords: ["read only", "statement timeout", "safe execution", "transaction isolation"],
        category: "SECURITY",
        databaseType: "ALL",
      },
    ],
  },
];
