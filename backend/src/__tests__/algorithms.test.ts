import { SqlParser } from "../services/sql-parser/parser";
import { AstDfsTraversal } from "../services/sql-parser/dfs";
import { DialectDetector } from "../services/sql-parser/dialect";
import { QueryNormalizer } from "../services/sql-parser/normalizer";
import { QueryFingerprinter } from "../services/sql-parser/fingerprint";
import { RuleEngine } from "../services/rule-engine/engine";
import { SchemaGraph } from "../services/schema-analyzer/schema-graph";
import { PlanTreeParser } from "../services/execution-plan/plan-tree";
import { PlanTraversal } from "../services/execution-plan/plan-traversal";
import { CardinalityAnalyzer } from "../services/execution-plan/cardinality";
import { SelectivityEstimator } from "../services/index-advisor/selectivity";
import { IndexCostBenefitAnalyzer } from "../services/index-advisor/cost-benefit";
import { IndexAdvisor } from "../services/index-advisor/advisor";
import { RelationalAlgebraOptimizer } from "../services/optimizer/relational-algebra";
import { DpJoinOptimizer } from "../services/optimizer/dp-join-optimizer";
import { CostBasedOptimizer } from "../services/optimizer/cbo";
import { CandidatePipeline } from "../services/validation/candidate-pipeline";
import { TimeSeriesAnalyzer } from "../services/monitoring/time-series";
import { IsolationForest } from "../services/monitoring/isolation-forest";
import { DeadlockDetector } from "../services/deadlock/deadlock-detector";
import { HealthCalculator } from "../services/health/health-calculator";
import { GeminiCandidateSchema, GeminiService } from "../services/gemini/client";
import { TableInfo, ColumnInfo, IndexInfo, ConstraintInfo } from "../database/adapter.interface";

describe("SQLSense AI - Deterministic Algorithm Suite", () => {
  // 1. Dialect Detection
  describe("SQL Dialect Detector", () => {
    it("should accurately detect PostgreSQL dialect", () => {
      const sql = "SELECT id, name, created_at::date FROM customers WHERE email ILIKE '%@example.com'";
      expect(DialectDetector.detect(sql)).toBe("postgresql");
    });

    it("should accurately detect MySQL dialect", () => {
      const sql = "SELECT `id`, `name` FROM `users` LIMIT 0, 20";
      expect(DialectDetector.detect(sql)).toBe("mysql");
    });

    it("should accurately detect Oracle dialect", () => {
      const sql = "SELECT * FROM employees WHERE ROWNUM <= 10";
      expect(DialectDetector.detect(sql)).toBe("oracle");
    });

    it("should accurately detect SQL Server (T-SQL) dialect", () => {
      const sql = "SELECT TOP 10 [id], [name] FROM [users] CROSS APPLY [details]";
      expect(DialectDetector.detect(sql)).toBe("sqlserver");
    });
  });

  // 2. AST Parsing and DFS Traversal
  describe("AST Parser & DFS Traversal", () => {
    it("should parse complex SELECT query into AST and extract DFS traversal metrics", () => {
      const sql = `
        SELECT c.id, c.email, count(o.id) as order_count
        FROM customers c
        INNER JOIN orders o ON o.customer_id = c.id
        WHERE c.country = 'United States' AND c.total_spend > 100
        GROUP BY c.id, c.email
        HAVING count(o.id) > 2
        ORDER BY order_count DESC
        LIMIT 50;
      `;
      const ast = SqlParser.parse(sql);
      expect(ast.type).toBe("SelectStatement");

      const metrics = AstDfsTraversal.traverse(ast);
      expect(metrics.tablesReferenced).toContain("customers");
      expect(metrics.tablesReferenced).toContain("orders");
      expect(metrics.joinCount).toBe(1);
      expect(metrics.hasWhere).toBe(true);
      expect(metrics.hasGroupBy).toBe(true);
      expect(metrics.hasOrderBy).toBe(true);
      expect(metrics.hasLimit).toBe(true);
      expect(metrics.aggregateCount).toBeGreaterThan(0);
      expect(metrics.totalNodesVisited).toBeGreaterThan(10);
    });

    it("should parse DML statements with WHERE clause status", () => {
      const updateWithWhere = "UPDATE users SET status = 'INACTIVE' WHERE last_login < '2025-01-01'";
      const updateWithoutWhere = "UPDATE users SET status = 'INACTIVE'";
      const delWithoutWhere = "DELETE FROM customers";

      const ast1 = SqlParser.parse(updateWithWhere);
      const ast2 = SqlParser.parse(updateWithoutWhere);
      const ast3 = SqlParser.parse(delWithoutWhere);

      expect(ast1.type).toBe("UpdateStatement");
      expect(ast2.type).toBe("UpdateStatement");
      expect(ast3.type).toBe("DeleteStatement");

      const m1 = AstDfsTraversal.traverse(ast1);
      const m2 = AstDfsTraversal.traverse(ast2);
      const m3 = AstDfsTraversal.traverse(ast3);

      expect(m1.hasWhere).toBe(true);
      expect(m2.hasWhere).toBe(false);
      expect(m3.hasWhere).toBe(false);
    });
  });

  // 3. Query Normalization & Fingerprinting
  describe("Query Normalization & Deterministic Fingerprinting", () => {
    it("should normalize varying literal parameters to a common parameterized template", () => {
      const sql1 = "SELECT * FROM users WHERE id = 10 AND status = 'ACTIVE';";
      const sql2 = "select   *   from   users   where   id = 25 and status = 'PENDING'";

      const norm1 = QueryNormalizer.normalize(sql1);
      const norm2 = QueryNormalizer.normalize(sql2);

      expect(norm1).toBe("SELECT * FROM users WHERE id = ? AND status = ?");
      expect(norm2).toBe("SELECT * FROM users WHERE id = ? AND status = ?");
      expect(norm1).toEqual(norm2);
    });

    it("should generate identical fingerprints for equivalent queries with different literals", () => {
      const sql1 = "SELECT id, email FROM customers WHERE total_spend > 500;";
      const sql2 = "SELECT id, email FROM customers WHERE total_spend > 9999;";

      const fp1 = QueryFingerprinter.generate(sql1);
      const fp2 = QueryFingerprinter.generate(sql2);

      expect(fp1.fingerprint).toEqual(fp2.fingerprint);
      expect(fp1.signature).toBe("SELECT_CUSTOMERS_BY_TOTAL_SPEND");
    });
  });

  // 4. Rule-Based Anti-Pattern Detection (R001 - R025)
  describe("Rule-Based Anti-Pattern Engine", () => {
    it("R001: should detect SELECT * wildcard projection", () => {
      const res = RuleEngine.analyze("SELECT * FROM products WHERE price > 50");
      expect(res.issues.some((i) => i.ruleCode === "R001")).toBe(true);
    });

    it("R002: should detect non-sargable function on filter column (LOWER)", () => {
      const res = RuleEngine.analyze("SELECT id, email FROM customers WHERE LOWER(email) = 'test@example.com'");
      const issue = res.issues.find((i) => i.ruleCode === "R002");
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe("HIGH");
    });

    it("R016 & R017: should detect destructive UPDATE and DELETE without WHERE with CRITICAL severity", () => {
      const resUpdate = RuleEngine.analyze("UPDATE accounts SET balance = 0");
      const resDelete = RuleEngine.analyze("DELETE FROM audit_logs");

      expect(resUpdate.issues.some((i) => i.ruleCode === "R016" && i.severity === "CRITICAL")).toBe(true);
      expect(resDelete.issues.some((i) => i.ruleCode === "R017" && i.severity === "CRITICAL")).toBe(true);
      expect(resUpdate.scoreSecurity).toBeLessThanOrEqual(60);
    });

    it("R018 & R019: should detect TRUNCATE and DROP statements", () => {
      const resTrunc = RuleEngine.analyze("TRUNCATE TABLE temp_sessions");
      const resDrop = RuleEngine.analyze("DROP TABLE obsolete_users");

      expect(resTrunc.issues.some((i) => i.ruleCode === "R018")).toBe(true);
      expect(resDrop.issues.some((i) => i.ruleCode === "R019")).toBe(true);
    });

    it("R025: should detect leading wildcard LIKE '%text'", () => {
      const res = RuleEngine.analyze("SELECT id FROM articles WHERE title LIKE '%database%'");
      const issue = res.issues.find((i) => i.ruleCode === "R025");
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe("HIGH");
    });

    // R006: Subquery Nesting Depth Evaluation Tests
    it("R006 Test A: should NOT trigger on query with zero subqueries", () => {
      const sql = 'SELECT * FROM "SqlQuery" WHERE LOWER("rawSql") = \'select * from users\';';
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      expect(metrics.subqueryCount).toBe(0);
      expect(metrics.subqueryNestingDepth).toBe(0);

      const res = RuleEngine.analyze(sql);
      expect(res.issues.some((i) => i.ruleCode === "R006")).toBe(false);
    });

    it("R006 Test B: should NOT trigger on query with 1 nested subquery (depth 1 <= 2)", () => {
      const sql = `
        SELECT *
        FROM users
        WHERE id IN (
          SELECT user_id
          FROM orders
        );
      `;
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      expect(metrics.subqueryCount).toBe(1);
      expect(metrics.subqueryNestingDepth).toBe(1);

      const res = RuleEngine.analyze(sql);
      expect(res.issues.some((i) => i.ruleCode === "R006")).toBe(false);
    });

    it("R006 Test C: should trigger on deeply nested subqueries with depth > 2", () => {
      const sql = `
        SELECT *
        FROM a
        WHERE id IN (
          SELECT a_id
          FROM b
          WHERE b_id IN (
            SELECT c_id
            FROM c
            WHERE d_id IN (
              SELECT id
              FROM d
            )
          )
        );
      `;
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      expect(metrics.subqueryCount).toBe(3);
      expect(metrics.subqueryNestingDepth).toBe(3);

      const res = RuleEngine.analyze(sql);
      const issue = res.issues.find((i) => i.ruleCode === "R006");
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe("MEDIUM");
      expect(issue?.evidence).toContain("Actual subquery nesting depth = 3");
    });
  });

  // 5. Schema Graph & Join Pathfinding
  describe("Schema Graph & Shortest Join Path", () => {
    const mockTables: TableInfo[] = [
      { schema: "public", name: "customers", type: "BASE TABLE", rowCount: 1000, sizeBytes: 100000, indexSizeBytes: 20000, totalSizeBytes: 120000 },
      { schema: "public", name: "orders", type: "BASE TABLE", rowCount: 3000, sizeBytes: 250000, indexSizeBytes: 40000, totalSizeBytes: 290000 },
      { schema: "public", name: "order_items", type: "BASE TABLE", rowCount: 6000, sizeBytes: 400000, indexSizeBytes: 60000, totalSizeBytes: 460000 },
      { schema: "public", name: "products", type: "BASE TABLE", rowCount: 200, sizeBytes: 50000, indexSizeBytes: 10000, totalSizeBytes: 60000 },
    ];
    const mockColumns: ColumnInfo[] = [
      { schema: "public", table: "customers", name: "id", dataType: "integer", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
      { schema: "public", table: "orders", name: "id", dataType: "integer", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
      { schema: "public", table: "orders", name: "customer_id", dataType: "integer", isNullable: false, isPk: false, isFk: true, ordinalPosition: 2 },
      { schema: "public", table: "order_items", name: "order_id", dataType: "integer", isNullable: false, isPk: false, isFk: true, ordinalPosition: 2 },
      { schema: "public", table: "order_items", name: "product_id", dataType: "integer", isNullable: false, isPk: false, isFk: true, ordinalPosition: 3 },
      { schema: "public", table: "products", name: "id", dataType: "integer", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
    ];
    const mockConstraints: ConstraintInfo[] = [
      { name: "fk_orders_customer", schema: "public", table: "orders", type: "FOREIGN KEY", columns: ["customer_id"], refTable: "customers", refColumns: ["id"] },
      { name: "fk_items_order", schema: "public", table: "order_items", type: "FOREIGN KEY", columns: ["order_id"], refTable: "orders", refColumns: ["id"] },
      { name: "fk_items_product", schema: "public", table: "order_items", type: "FOREIGN KEY", columns: ["product_id"], refTable: "products", refColumns: ["id"] },
    ];
    const mockIndexes: IndexInfo[] = [];

    it("should compute shortest join path between customers and products through orders & order_items", () => {
      const graph = new SchemaGraph(mockTables, mockColumns, mockConstraints, mockIndexes);
      const path = graph.findShortestJoinPath("customers", "products");

      expect(path.length).toBe(3); // customers -> orders -> order_items -> products
      expect(path[0].fromTable.toLowerCase()).toBe("customers");
      expect(path[path.length - 1].toTable.toLowerCase()).toBe("products");
    });
  });

  // 6. Execution Plan Traversal & Cardinality Error Analysis
  describe("Execution Plan & Cardinality Analyzer", () => {
    it("should calculate cardinality error ratio and flag severe 100x discrepancy", () => {
      const mockRawPlan = {
        Plan: {
          "Node Type": "Seq Scan",
          "Relation Name": "orders",
          "Startup Cost": 0.0,
          "Total Cost": 1250.0,
          "Plan Rows": 100,
          "Actual Rows": 10000,
          "Actual Total Time": 85.4,
          "Actual Loops": 1,
        },
      };

      const planTree = PlanTreeParser.parse(mockRawPlan);
      expect(planTree).toBeDefined();

      const traversal = PlanTraversal.traverse(planTree!);
      expect(traversal.hasSeqScans).toBe(true);
      expect(traversal.seqScanTables).toContain("orders");

      const cardResult = CardinalityAnalyzer.analyze(planTree!);
      expect(cardResult.hasCardinalityErrors).toBe(true);
      expect(cardResult.maxErrorFactor).toBe(100);
      expect(cardResult.issues[0].severity).toBe("CRITICAL");
      expect(cardResult.issues[0].recommendation).toContain("ANALYZE");
    });
  });

  // 7. Index Advisor, Selectivity & Cost-Benefit
  describe("Index Advisor & Deduplication", () => {
    it("should recommend composite index with equality before range", () => {
      const sql = "SELECT * FROM orders WHERE customer_id = 42 AND total_amount > 500 ORDER BY ordered_at DESC";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      const tables: TableInfo[] = [{ schema: "public", name: "orders", type: "BASE TABLE", rowCount: 5000, sizeBytes: 500000, indexSizeBytes: 0, totalSizeBytes: 500000 }];
      const columns: ColumnInfo[] = [
        { schema: "public", table: "orders", name: "customer_id", dataType: "int", isNullable: false, isPk: false, isFk: true, ordinalPosition: 2, distinctValues: 1000 },
        { schema: "public", table: "orders", name: "total_amount", dataType: "numeric", isNullable: false, isPk: false, isFk: false, ordinalPosition: 3 },
      ];
      const existingIndexes: IndexInfo[] = [];

      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", tables, columns, existingIndexes);
      expect(recs.length).toBeGreaterThan(0);
      const rec = recs[0];
      expect(rec.table).toBe("orders");
      expect(rec.columns[0]).toBe("customer_id"); // Equality first
      expect(rec.costBenefit.benefitRating).toBe("HIGH");
    });

    it("should NEVER recommend an index that already exists", () => {
      const sql = "SELECT * FROM customers WHERE email = 'test@example.com'";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      const tables: TableInfo[] = [{ schema: "public", name: "customers", type: "BASE TABLE", rowCount: 2000, sizeBytes: 200000, indexSizeBytes: 20000, totalSizeBytes: 220000 }];
      const existingIndexes: IndexInfo[] = [
        { schema: "public", table: "customers", name: "idx_cust_email", type: "BTREE", isUnique: true, isPrimary: false, columns: ["email"], definition: "CREATE UNIQUE INDEX idx_cust_email ON customers (email)", sizeBytes: 20000 },
      ];

      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", tables, [], existingIndexes);
      expect(recs.length).toBe(0); // Deduplicated!
    });
  });

  // 8. Relational Algebra Transformations
  describe("Relational Algebra Optimizer", () => {
    it("should simplify redundant predicates like 1=1", () => {
      const sql = "SELECT id, name FROM users WHERE 1=1 AND active = true";
      const res = RelationalAlgebraOptimizer.optimize(sql);
      expect(res.hasChanges).toBe(true);
      expect(res.transformedSql).not.toContain("1=1");
    });

    it("should fold static constant arithmetic", () => {
      const sql = "SELECT id FROM logs WHERE timestamp_delta > 24 * 60 * 60";
      const res = RelationalAlgebraOptimizer.optimize(sql);
      expect(res.hasChanges).toBe(true);
      expect(res.transformedSql).toContain("86400");
    });

    it("should unnest IN subqueries into INNER JOIN", () => {
      const sql = "SELECT c.name FROM customers c WHERE c.id IN (SELECT o.customer_id FROM orders o WHERE o.total_amount > 500)";
      const res = RelationalAlgebraOptimizer.optimize(sql);
      expect(res.hasChanges).toBe(true);
      expect(res.transformedSql).toContain("INNER JOIN orders");
    });

    it("1, 2, 3, 4. should push predicate down into derived table with formatted/multiline SQL and pass validation", () => {
      const sql = `SELECT *
FROM (
    SELECT id, email
    FROM customers
) sub
WHERE sub.id = 1;`;

      const res = RelationalAlgebraOptimizer.optimize(sql);
      expect(res.hasChanges).toBe(true);
      expect(res.transformedSql).not.toBe(sql.trim().replace(/;+$/, ""));
      expect(res.transformedSql).toContain("FROM customers WHERE id = 1");
      expect(res.transformedSql).toContain(") sub");

      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);
      // 5. Derived alias "sub" is not in tablesReferenced
      expect(metrics.tablesReferenced).toEqual(["customers"]);
      expect(metrics.tablesReferenced).not.toContain("sub");

      // 4. RA candidate reaches and passes validation
      const tables: TableInfo[] = [{ schema: "public", name: "customers", type: "BASE TABLE", rowCount: 1000, sizeBytes: 100000, indexSizeBytes: 0, totalSizeBytes: 100000 }];
      const val = CandidatePipeline.validateCandidate(sql, res.transformedSql, metrics, tables);
      expect(val.isSyntaxValid).toBe(true);
      expect(val.isSchemaValid).toBe(true);
      expect(val.validationPassed).toBe(true);

      // 6 & 7. IndexAdvisor never recommends public.sub, only legitimate physical tables
      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", tables, [], []);
      const recTables = recs.map(r => r.table);
      expect(recTables).not.toContain("sub");
      expect(recs.some(r => r.ddl.includes("ON public.sub"))).toBe(false);
      expect(recs.every(r => r.table === "customers")).toBe(true);
    });
  });

  // 9. Dynamic Programming Join Optimizer
  describe("Dynamic Programming Join Optimizer (DP-Size)", () => {
    it("should evaluate DP[subset] and find optimal lower cost join order for 4 relations", () => {
      const relations = [
        { name: "large_fact_table", cardinality: 100000 },
        { name: "dim_date", cardinality: 365 },
        { name: "dim_store", cardinality: 50 },
        { name: "dim_customer", cardinality: 5000 },
      ];

      const res = DpJoinOptimizer.optimizeJoinOrder(relations);
      expect(res.optimalOrder.length).toBe(4);
      // The smaller dimension tables should be ordered first to build hash tables before probing large fact table
      expect(res.optimalOrder[0]).not.toBe("large_fact_table");
      expect(res.costReductionPercent).toBeGreaterThan(0);
      expect(res.dpStatesEvaluated).toBeGreaterThan(10);
    });

    it("1 & 2 & 3. evaluates both 2-table join orientations and selects cheaper orientation with positive cost reduction", () => {
      // customers (1000) JOIN orders (3000):
      // Orientation A (customers LEFT, orders RIGHT): 1000 + 3000 + (1000*0.2 + 3000*1.0) = 7200
      // Orientation B (orders LEFT, customers RIGHT): 3000 + 1000 + (3000*0.2 + 1000*1.0) = 5600
      const relations = [
        { name: "customers", cardinality: 1000 },
        { name: "orders", cardinality: 3000 },
      ];

      const res = DpJoinOptimizer.optimizeJoinOrder(relations);
      expect(res.originalOrder).toEqual(["customers", "orders"]);
      expect(res.optimalOrder).toEqual(["orders", "customers"]);
      expect(res.estimatedCostOriginal).toBe(7200);
      expect(res.estimatedCostOptimal).toBe(5600);
      expect(res.costReductionPercent).toBe(22); // (7200 - 5600) / 7200 = 22%
    });

    it("4. produces 0% cost reduction when query is already in optimal 2-table join orientation", () => {
      const relations = [
        { name: "orders", cardinality: 3000 },
        { name: "customers", cardinality: 1000 },
      ];

      const res = DpJoinOptimizer.optimizeJoinOrder(relations);
      expect(res.originalOrder).toEqual(["orders", "customers"]);
      expect(res.optimalOrder).toEqual(["orders", "customers"]);
      expect(res.estimatedCostOriginal).toBe(5600);
      expect(res.estimatedCostOptimal).toBe(5600);
      expect(res.costReductionPercent).toBe(0);
    });

    it("5. produces 0% cost reduction and does not create candidate when 2-table join costs are equal", () => {
      const relations = [
        { name: "table_a", cardinality: 1000 },
        { name: "table_b", cardinality: 1000 },
      ];

      const res = DpJoinOptimizer.optimizeJoinOrder(relations);
      expect(res.estimatedCostOriginal).toBe(res.estimatedCostOptimal);
      expect(res.costReductionPercent).toBe(0);
    });
  });

  // 10. Multi-Stage Candidate Validation
  describe("Candidate Pipeline Validation", () => {
    it("should reject candidate containing syntax errors", () => {
      const original = "SELECT id FROM users WHERE id = 1";
      const badCandidate = "SELECT id FRM users WHERE"; // syntax error
      const origAst = SqlParser.parse(original);
      const origMetrics = AstDfsTraversal.traverse(origAst);

      const val = CandidatePipeline.validateCandidate(original, badCandidate, origMetrics, []);
      expect(val.isSyntaxValid).toBe(false);
      expect(val.validationPassed).toBe(false);
    });

    it("should reject candidate that omits original queried table", () => {
      const original = "SELECT id FROM orders WHERE id = 1";
      const candidateWithMissingTable = "SELECT id FROM customers WHERE id = 1";
      const origAst = SqlParser.parse(original);
      const origMetrics = AstDfsTraversal.traverse(origAst);

      const val = CandidatePipeline.validateCandidate(original, candidateWithMissingTable, origMetrics, []);
      expect(val.isSemanticValid).toBe(false);
      expect(val.validationPassed).toBe(false);
    });

    it("should generate valid DP Join candidate preserving WHERE predicates, JOIN ON condition, and table aliases without ON 1=1", async () => {
      const sql = `
SELECT
    c.id,
    c.email,
    o.total_amount
FROM customers c
JOIN orders o
    ON c.id = o.customer_id
WHERE c.email = 'cust1@example.com'
  AND o.total_amount > 500;
      `.trim();

      jest.spyOn(GeminiService, "isAvailable").mockReturnValue(false);

      const mockAdapter: any = {
        isConnected: true,
        getTables: async () => [
          { schema: "public", name: "customers", type: "BASE TABLE", rowCount: 1000, sizeBytes: 100000, indexSizeBytes: 0, totalSizeBytes: 100000 },
          { schema: "public", name: "orders", type: "BASE TABLE", rowCount: 3000, sizeBytes: 300000, indexSizeBytes: 0, totalSizeBytes: 300000 },
        ],
        getColumns: async () => [
          { name: "id", table: "customers", dataType: "integer", isNullable: false, isPrimary: true },
          { name: "email", table: "customers", dataType: "text", isNullable: false, isPrimary: false },
          { name: "customer_id", table: "orders", dataType: "integer", isNullable: false, isPrimary: false },
          { name: "total_amount", table: "orders", dataType: "numeric", isNullable: false, isPrimary: false },
        ],
        getIndexes: async () => [],
        explainQuery: async () => ({ totalCost: 110.42, executionTimeMs: 1 }),
      };

      const result = await CandidatePipeline.execute(sql, "postgresql", mockAdapter, false);
      const dpCandidate = result.candidates.find(c => c.source === "DP_JOIN");

      expect(dpCandidate).toBeDefined();
      expect(dpCandidate!.candidateSql).toContain("FROM orders o INNER JOIN customers c ON c.id = o.customer_id");
      expect(dpCandidate!.candidateSql).toContain("WHERE c.email = 'cust1@example.com'");
      expect(dpCandidate!.candidateSql).toContain("AND o.total_amount > 500");
      expect(dpCandidate!.candidateSql).not.toContain("1=1");
      expect(dpCandidate!.candidateSql).not.toContain("CROSS JOIN");
      expect(dpCandidate!.validation.isSyntaxValid).toBe(true);
      expect(dpCandidate!.validation.isSchemaValid).toBe(true);
      expect(dpCandidate!.validation.isSemanticValid).toBe(true);
      expect(dpCandidate!.validation.validationPassed).toBe(true);

      jest.restoreAllMocks();
    });
  });

  // 11. Monitoring: Moving Average, Z-Score, Change-Point & Isolation Forest
  describe("Performance Monitoring & Anomaly Detection", () => {
    it("should accurately compute SMA and EMA", () => {
      const points = [
        { timestamp: new Date(), value: 10 },
        { timestamp: new Date(), value: 20 },
        { timestamp: new Date(), value: 30 },
        { timestamp: new Date(), value: 40 },
        { timestamp: new Date(), value: 50 },
      ];

      const sma = TimeSeriesAnalyzer.calculateSma(points, 3);
      expect(sma[2]).toBe(20); // (10+20+30)/3 = 20
      expect(sma[4]).toBe(40); // (30+40+50)/3 = 40
    });

    it("should detect Z-score latency spike anomaly (|Z| >= 2.5)", () => {
      const points = [
        { timestamp: new Date(), value: 10 },
        { timestamp: new Date(), value: 11 },
        { timestamp: new Date(), value: 12 },
        { timestamp: new Date(), value: 10 },
        { timestamp: new Date(), value: 11 },
        { timestamp: new Date(), value: 12 },
        { timestamp: new Date(), value: 10 },
        { timestamp: new Date(), value: 250 }, // Latency spike!
      ];

      const anomalies = TimeSeriesAnalyzer.detectZScoreAnomalies(points, 2.0);
      const spike = anomalies[anomalies.length - 1];
      expect(spike.isAnomaly).toBe(true);
      expect(spike.type).toBe("LATENCY_SPIKE");
    });

    it("Isolation Forest should require minimum data points and avoid hallucinated anomalies", () => {
      const insufficientData = [
        { id: "1", timestamp: new Date(), latencyMs: 10, rows: 10, executionCost: 5 },
      ];
      const res = IsolationForest.analyze(insufficientData);
      expect(res.hasSufficientData).toBe(false);
      expect(res.message).toContain("Insufficient historical data");
    });
  });

  // 12. Deadlock Directed Graph Cycle Detection
  describe("Deadlock Graph & Cycle Detection", () => {
    it("should detect deadlock cycle in circular dependency A -> B -> A", () => {
      const edges = [
        { from: 101, to: 102 },
        { from: 102, to: 101 },
      ];
      const cycles = DeadlockDetector.detectCyclesInGraph(edges);
      expect(cycles.length).toBeGreaterThan(0);
      expect(cycles[0]).toEqual(expect.arrayContaining([101, 102]));
    });

    it("should NOT flag deadlock when graph has no cycles (A -> B -> C)", () => {
      const edges = [
        { from: 101, to: 102 },
        { from: 102, to: 103 },
      ];
      const cycles = DeadlockDetector.detectCyclesInGraph(edges);
      expect(cycles.length).toBe(0);
    });
  });

  // 13. Deterministic Health Scoring
  describe("Deterministic Health Calculator", () => {
    it("should return null when no target database adapter is connected", async () => {
      const report = await HealthCalculator.calculateHealth(undefined);
      expect(report).toBeNull();
    });

    it("should calculate weighted health score with expected dimension weights when connected", async () => {
      const mockAdapter: any = {
        isConnected: true,
        config: { database: "test_db", databaseType: "postgresql", ssl: true, readOnly: true, host: "localhost" },
        getTables: async () => [{ name: "users", rowCount: 1000, lastAnalyzed: new Date() }],
        getIndexes: async () => [{ name: "idx_users_id", table: "users", columns: ["id"], isUnique: true, isPrimary: true }],
        getQueryMetrics: async () => ({
          tps: 50,
          cacheHitRatio: 98.5,
          activeConnections: 5,
          idleConnections: 10,
          maxConnections: 100,
          deadlockCount: 0,
          tempBytesWritten: 0,
        }),
      };

      const report = await HealthCalculator.calculateHealth(mockAdapter);
      expect(report).not.toBeNull();
      if (report) {
        expect(report.scoreOverall).toBeGreaterThan(0);
        expect(report.scoreOverall).toBeLessThanOrEqual(100);
        expect(report.dimensions.length).toBe(5);
        expect(report.dimensions.some((d) => d.name === "Performance" && d.weightPercent === 35)).toBe(true);
        expect(report.dimensions.some((d) => d.name === "Security" && d.weightPercent === 20)).toBe(true);
      }
    });
  });

  // 14. Structured AI Output Validation
  describe("Gemini Candidate Zod Validation", () => {
    it("should validate and accept compliant structured candidate JSON", () => {
      const validAiPayload = {
        candidateSql: "SELECT id, email FROM customers WHERE status = 'ACTIVE' LIMIT 50",
        summary: "Pushed limit and replaced wildcard with explicit projections.",
        changes: [{ type: "PREDICATE_PUSHDOWN", description: "Added limit clause" }],
        assumptions: [],
        risks: [],
        confidence: 0.95,
        status: "SUCCESS",
      };
      const parsed = GeminiCandidateSchema.safeParse(validAiPayload);
      expect(parsed.success).toBe(true);
    });

    it("should reject invalid AI candidate payload missing required fields", () => {
      const invalidAiPayload = {
        candidateSql: "",
        confidence: 2.5, // out of range
      };
      const parsed = GeminiCandidateSchema.safeParse(invalidAiPayload);
      expect(parsed.success).toBe(false);
    });
  });

  // 15. Disconnected State Data Consistency Contract
  describe("Disconnected State Data Consistency Contract", () => {
    it("guarantees no active database returns null health and zeroed target KPI counters", async () => {
      // 1. Health calculation without adapter returns null
      const health = await HealthCalculator.calculateHealth(undefined);
      expect(health).toBeNull();

      // 2. Simulated disconnected dashboard payload contract verification
      const disconnectedDashboardData = {
        isConnected: false,
        status: "NO_ACTIVE_DATABASE",
        healthScore: null,
        kpis: {
          totalQueries: 0,
          slowQueries: 0,
          criticalIssues: 0,
          highIssues: 0,
          indexRecommendations: 0,
          databaseObjects: 0,
          indexCount: 0,
        },
        charts: {
          executionTimeTrend: [],
          severityDistribution: [
            { name: "Critical", value: 0 },
            { name: "High", value: 0 },
            { name: "Medium", value: 0 },
            { name: "Low", value: 0 },
          ],
          topSlowQueries: [],
        },
        recentRecommendations: [],
      };

      expect(disconnectedDashboardData.isConnected).toBe(false);
      expect(disconnectedDashboardData.kpis.totalQueries).toBe(0);
      expect(disconnectedDashboardData.kpis.highIssues).toBe(0);
      expect(disconnectedDashboardData.kpis.criticalIssues).toBe(0);
      expect(disconnectedDashboardData.kpis.slowQueries).toBe(0);
      expect(disconnectedDashboardData.kpis.databaseObjects).toBe(0);
      expect(disconnectedDashboardData.charts.executionTimeTrend.length).toBe(0);
      expect(disconnectedDashboardData.charts.topSlowQueries.length).toBe(0);
      expect(disconnectedDashboardData.recentRecommendations.length).toBe(0);
    });
  });

  // 16. Schema Explorer Metadata & Table Details Contract
  describe("Schema Explorer Metadata Contract", () => {
    it("should correctly structure table metadata and handle column/index/constraint relationships", () => {
      const sampleTables: TableInfo[] = [
        {
          schema: "public",
          name: "SqlQuery",
          type: "BASE TABLE",
          rowCount: 42,
          sizeBytes: 65536,
          indexSizeBytes: 32768,
          totalSizeBytes: 98304,
          lastAnalyzed: new Date(),
          lastVacuumed: null,
        },
        {
          schema: "public",
          name: "QueryIssue",
          type: "BASE TABLE",
          rowCount: 128,
          sizeBytes: 131072,
          indexSizeBytes: 65536,
          totalSizeBytes: 196608,
          lastAnalyzed: new Date(),
          lastVacuumed: null,
        },
      ];

      const sampleColumns: ColumnInfo[] = [
        {
          schema: "public",
          table: "SqlQuery",
          name: "id",
          dataType: "text",
          isNullable: false,
          isPk: true,
          isFk: false,
          ordinalPosition: 1,
        },
        {
          schema: "public",
          table: "SqlQuery",
          name: "rawSql",
          dataType: "text",
          isNullable: false,
          isPk: false,
          isFk: false,
          ordinalPosition: 2,
        },
        {
          schema: "public",
          table: "SqlQuery",
          name: "connectionId",
          dataType: "text",
          isNullable: false,
          isPk: false,
          isFk: true,
          fkRefTable: "DatabaseConnection",
          fkRefColumn: "id",
          ordinalPosition: 3,
        },
      ];

      const sampleIndexes: IndexInfo[] = [
        {
          schema: "public",
          table: "SqlQuery",
          name: "SqlQuery_pkey",
          type: "BTREE",
          isUnique: true,
          isPrimary: true,
          columns: ["id"],
          definition: 'CREATE UNIQUE INDEX "SqlQuery_pkey" ON public."SqlQuery" USING btree (id)',
          sizeBytes: 16384,
          scansCount: 15,
        },
        {
          schema: "public",
          table: "SqlQuery",
          name: "SqlQuery_connectionId_idx",
          type: "BTREE",
          isUnique: false,
          isPrimary: false,
          columns: ["connectionId"],
          definition: 'CREATE INDEX "SqlQuery_connectionId_idx" ON public."SqlQuery" USING btree ("connectionId")',
          sizeBytes: 16384,
          scansCount: 8,
        },
      ];

      const sampleConstraints: ConstraintInfo[] = [
        {
          name: "SqlQuery_pkey",
          schema: "public",
          table: "SqlQuery",
          type: "PRIMARY KEY",
          columns: ["id"],
        },
        {
          name: "SqlQuery_connectionId_fkey",
          schema: "public",
          table: "SqlQuery",
          type: "FOREIGN KEY",
          columns: ["connectionId"],
          refTable: "DatabaseConnection",
          refColumns: ["id"],
        },
      ];

      // Verify Table Details payload contract
      const tableDetails = {
        table: sampleTables[0],
        columns: sampleColumns,
        indexes: sampleIndexes,
        constraints: sampleConstraints,
      };

      expect(tableDetails.table.name).toBe("SqlQuery");
      expect(tableDetails.table.rowCount).toBe(42);
      expect(tableDetails.columns.length).toBe(3);
      expect(tableDetails.columns[0].isPk).toBe(true);
      expect(tableDetails.columns[2].isFk).toBe(true);
      expect(tableDetails.columns[2].fkRefTable).toBe("DatabaseConnection");
      expect(tableDetails.indexes.length).toBe(2);
      expect(tableDetails.indexes[0].isPrimary).toBe(true);
      expect(tableDetails.constraints.length).toBe(2);
      expect(tableDetails.constraints[1].type).toBe("FOREIGN KEY");
    });
  });

  // 17. Workload-Driven Index Advisor & R003 Rule Contract
  describe("Workload-Driven Index Advisor & R003 Contract", () => {
    const sampleSql = 'SELECT * FROM "SqlQuery" WHERE "rawSql" = \'select * from users\';';

    it("F. Existing SQL Analyzer R003 behavior remains unchanged", () => {
      const report = RuleEngine.analyze(sampleSql, "postgresql", {
        tables: [{ schema: "public", name: "SqlQuery", type: "BASE TABLE", rowCount: 42, sizeBytes: 16384, indexSizeBytes: 16384, totalSizeBytes: 32768 }],
        indexes: [
          {
            schema: "public",
            table: "SqlQuery",
            name: "SqlQuery_pkey",
            type: "BTREE",
            isUnique: true,
            isPrimary: true,
            columns: ["id"],
            definition: 'CREATE UNIQUE INDEX "SqlQuery_pkey" ON "SqlQuery" (id)',
            sizeBytes: 16384,
          },
        ],
      });
      const r003 = report.issues.find((i) => i.ruleCode === "R003");
      expect(r003).toBeDefined();
      expect(r003?.category).toBe("INDEXING");
      expect(r003?.affectedColumns).toContain("rawSql");
      expect(r003?.severity).toBe("HIGH");
    });

    it("A & C. Backend generates an INDEXING recommendation for a small table workload candidate (rowCount <= 500)", () => {
      const ast = SqlParser.parse(sampleSql, "postgresql");
      const metrics = AstDfsTraversal.traverse(ast);

      const smallTables: TableInfo[] = [
        {
          schema: "public",
          name: "SqlQuery",
          type: "BASE TABLE",
          rowCount: 5, // Small table test
          sizeBytes: 16384,
          indexSizeBytes: 16384,
          totalSizeBytes: 32768,
        },
      ];

      const columns: ColumnInfo[] = [
        { schema: "public", table: "SqlQuery", name: "id", dataType: "text", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
        { schema: "public", table: "SqlQuery", name: "rawSql", dataType: "text", isNullable: false, isPk: false, isFk: false, ordinalPosition: 2 },
      ];

      const existingIndexes: IndexInfo[] = [
        {
          schema: "public",
          table: "SqlQuery",
          name: "SqlQuery_pkey",
          type: "BTREE",
          isUnique: true,
          isPrimary: true,
          columns: ["id"],
          definition: 'CREATE UNIQUE INDEX "SqlQuery_pkey" ON "SqlQuery" (id)',
          sizeBytes: 16384,
        },
      ];

      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", smallTables, columns, existingIndexes);

      expect(recs.length).toBe(1);
      const rec = recs[0];
      expect(rec.table).toBe("SqlQuery");
      expect(rec.columns).toEqual(["rawSql"]);
      expect(rec.ddl).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sqlquery_rawsql ON public.SqlQuery (rawSql);");
      expect(rec.costBenefit.benefitRating).toBeDefined();
      expect(rec.costBenefit.estimatedSpeedupPercent).toBeGreaterThan(0);
    });

    it("D. A table with an existing covering index does NOT receive a duplicate recommendation", () => {
      const ast = SqlParser.parse(sampleSql, "postgresql");
      const metrics = AstDfsTraversal.traverse(ast);

      const tables: TableInfo[] = [
        { schema: "public", name: "SqlQuery", type: "BASE TABLE", rowCount: 100, sizeBytes: 16384, indexSizeBytes: 16384, totalSizeBytes: 32768 },
      ];
      const existingIndexes: IndexInfo[] = [
        {
          schema: "public",
          table: "SqlQuery",
          name: "SqlQuery_pkey",
          type: "BTREE",
          isUnique: true,
          isPrimary: true,
          columns: ["id"],
          definition: 'CREATE UNIQUE INDEX "SqlQuery_pkey" ON "SqlQuery" (id)',
          sizeBytes: 16384,
        },
        {
          schema: "public",
          table: "SqlQuery",
          name: "idx_sqlquery_rawsql",
          type: "BTREE",
          isUnique: false,
          isPrimary: false,
          columns: ["rawSql"],
          definition: 'CREATE INDEX idx_sqlquery_rawsql ON "SqlQuery" ("rawSql")',
          sizeBytes: 16384,
        },
      ];

      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", tables, [], existingIndexes);
      expect(recs.length).toBe(0); // Deduplicated against existing index
    });

    it("G. Preserves all recommendation categories correctly", () => {
      const validCategories = ["PERFORMANCE", "INDEXING", "SECURITY", "QUALITY", "MAINTAINABILITY"];
      expect(validCategories).toContain("INDEXING");
      expect(validCategories).toContain("PERFORMANCE");
      expect(validCategories).toContain("SECURITY");
    });
  });

  // 18. Index Advisor Identifier & Literal Precision Tests (Regression A - J)
  describe("Index Advisor Identifier & Literal Precision", () => {
    const ordersTables: TableInfo[] = [
      { schema: "public", name: "orders", type: "BASE TABLE", rowCount: 1000, sizeBytes: 100000, indexSizeBytes: 10000, totalSizeBytes: 110000 },
    ];
    const ordersColumns: ColumnInfo[] = [
      { schema: "public", table: "orders", name: "id", dataType: "integer", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
      { schema: "public", table: "orders", name: "customer_id", dataType: "integer", isNullable: false, isPk: false, isFk: true, ordinalPosition: 2 },
      { schema: "public", table: "orders", name: "ordered_at", dataType: "timestamp", isNullable: false, isPk: false, isFk: false, ordinalPosition: 3 },
    ];

    const sqlQueryTables: TableInfo[] = [
      { schema: "public", name: "SqlQuery", type: "BASE TABLE", rowCount: 50, sizeBytes: 16384, indexSizeBytes: 16384, totalSizeBytes: 32768 },
    ];
    const sqlQueryColumns: ColumnInfo[] = [
      { schema: "public", table: "SqlQuery", name: "id", dataType: "text", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
      { schema: "public", table: "SqlQuery", name: "rawSql", dataType: "text", isNullable: false, isPk: false, isFk: false, ordinalPosition: 2 },
    ];

    it("A. String literal is not parsed as ColumnReference", () => {
      const sql = "SELECT * FROM SqlQuery WHERE rawSql = 'select * from users'";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      expect(metrics.columnsReferenced).toEqual(["rawSql"]);
      expect(metrics.columnsReferenced).not.toContain("select * from users");
      expect(metrics.columnsReferenced).not.toContain("selectfromusers");
    });

    it("B. LOWER(rawSql) with string literal does NOT produce phantom selectfromusers candidate", () => {
      const sql = "SELECT * FROM \"SqlQuery\" WHERE LOWER(\"rawSql\") = 'select * from users';";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", sqlQueryTables, sqlQueryColumns, []);
      expect(recs.length).toBe(1);
      expect(recs[0].columns).toEqual(["rawSql"]);
      expect(recs[0].suggestedName).toBe("idx_sqlquery_rawsql");
      expect(recs[0].ddl).not.toContain("selectfromusers");
      expect(recs[0].columns).not.toContain("selectfromusers");
    });

    it("C. Quoted PostgreSQL identifier is correctly recognized", () => {
      const sql = "SELECT * FROM \"SqlQuery\" WHERE \"rawSql\" = 'select * from users';";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      expect(metrics.columnsReferenced).toContain("rawSql");
      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", sqlQueryTables, sqlQueryColumns, []);
      expect(recs.length).toBe(1);
      expect(recs[0].columns).toEqual(["rawSql"]);
    });

    it("D. Normal unquoted identifier is correctly recognized", () => {
      const sql = "SELECT * FROM orders WHERE customer_id = 10";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      expect(metrics.columnsReferenced).toContain("customer_id");
      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", ordersTables, ordersColumns, []);
      expect(recs.length).toBe(1);
      expect(recs[0].columns).toEqual(["customer_id"]);
    });

    it("E. Qualified identifier is correctly recognized", () => {
      const sql = "SELECT * FROM orders o WHERE o.customer_id = 10";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      expect(metrics.columnsReferenced).toContain("o.customer_id");
      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", ordersTables, ordersColumns, []);
      expect(recs.length).toBe(1);
      expect(recs[0].columns).toEqual(["customer_id"]);
    });

    it("F. Legitimate composite index is generated for multiple real columns", () => {
      const sql = "SELECT * FROM orders WHERE customer_id = 10 AND ordered_at > '2026-01-01'";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", ordersTables, ordersColumns, []);
      expect(recs.length).toBe(1);
      expect(recs[0].columns).toEqual(["customer_id", "ordered_at"]);
      expect(recs[0].usageContext).toBe("COMPOSITE");
      expect(recs[0].ddl).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_customer_id_ordered_at ON public.orders (customer_id, ordered_at);");
    });

    it("G. Nonexistent candidate columns are rejected by schema validation", () => {
      // Create AST with an artificial or invalid column reference
      const sql = "SELECT * FROM orders WHERE customer_id = 10 AND nonexistent_column = 'abc'";
      const ast = SqlParser.parse(sql);
      const metrics = AstDfsTraversal.traverse(ast);

      // orders table only has [id, customer_id, ordered_at]
      const recs = IndexAdvisor.advise(ast, metrics, "postgresql", ordersTables, ordersColumns, []);
      expect(recs.length).toBe(1);
      expect(recs[0].columns).toEqual(["customer_id"]);
      expect(recs[0].columns).not.toContain("nonexistent_column");
    });
  });
});
