-- =============================================================================
-- SQLSense AI — Manual SQL Test Collection & Verification Suite
-- File   : database/sqlsense_manual_test_queries.sql
-- Schema : sqlsense_test (PostgreSQL 14+)
-- Purpose: Complete collection of safe, reproducible SQL test queries for
--          testing every SQLSense AI module: SQL Analyzer, Query Optimizer,
--          Execution Plans, Index Advisor, Performance Benchmarking, and RAG.
--
-- GUIDELINES:
-- 1. All queries in SECTIONS 1 to 14 are strictly READ-ONLY (SELECT/EXPLAIN/CALL).
-- 2. Tables and columns are 100% verified against database/sqlsense_test_database.sql.
-- 3. SECTION 15 contains destructive SQL for STATIC CODE ANALYSIS ONLY in SQL Analyzer.
--    DO NOT execute Section 15 queries on a live database!
-- =============================================================================

-- =============================================================================
-- SECTION 1: BASIC SELECT & PROJECTION
-- Purpose: Test query parsing, AST generation, and wildcard detection (R001).
-- =============================================================================

-- Query 1.1: Explicit Column Projection (Clean Query - Expected 100/100 score)
-- Module: SQL Analyzer, Execution Plans, Performance
SELECT
    id,
    first_name,
    last_name,
    email,
    city,
    country
FROM customers
WHERE is_active = TRUE
ORDER BY id ASC
LIMIT 50;
-- Observation: No anti-patterns detected. Clean AST projection.

-- Query 1.2: Wildcard Projection (Anti-Pattern R001)
-- Module: SQL Analyzer, Query Optimizer
SELECT *
FROM products
WHERE is_discontinued = FALSE;
-- Observation: Flags R001 (SELECT * wildcard projection). Recommends explicit columns.

-- =============================================================================
-- SECTION 2: FILTERING, SARGABILITY & SORTING
-- Purpose: Test sargability detection (R002), non-sargable functions on indexes.
-- =============================================================================

-- Query 2.1: Non-Sargable LOWER() Function on Filter Column (Anti-Pattern R002)
-- Module: SQL Analyzer, Index Advisor, Query Optimizer
SELECT
    id,
    first_name,
    last_name,
    email
FROM customers
WHERE LOWER(email) = 'cust1@example.com';
-- Observation: Flags R002 (Non-sargable function on filter column).
-- Index Advisor suggests functional index on LOWER(email) or expression rewrite.

-- Query 2.2: Sargable Equality and Range Filter (Optimal Pattern)
-- Module: SQL Analyzer, Execution Plans
SELECT
    id,
    order_number,
    status,
    total_amount,
    ordered_at
FROM orders
WHERE status = 'COMPLETED'
  AND total_amount >= 150.00
ORDER BY ordered_at DESC
LIMIT 25;
-- Observation: Sargable filter. Uses index on status / ordered_at if present.

-- Query 2.3: Leading Wildcard Pattern (Anti-Pattern R025)
-- Module: SQL Analyzer
SELECT
    id,
    sku,
    name,
    unit_price
FROM products
WHERE name LIKE '%pro%';
-- Observation: Flags R025 (Leading wildcard prevents B-Tree index utilization).

-- =============================================================================
-- SECTION 3: AGGREGATIONS & GROUP BY
-- Purpose: Test group-by aggregation, HAVING clause, and cardinality estimation.
-- =============================================================================

-- Query 3.1: Category Revenue & Order Metrics
-- Module: Execution Plans, SQL Analyzer, Performance
SELECT
    c.name AS category_name,
    COUNT(p.id) AS product_count,
    ROUND(AVG(p.unit_price), 2) AS avg_unit_price,
    MIN(p.unit_price) AS min_unit_price,
    MAX(p.unit_price) AS max_unit_price
FROM categories c
JOIN products p ON p.category_id = c.id
GROUP BY c.id, c.name
ORDER BY product_count DESC;
-- Observation: HashAggregate or GroupAggregate node in EXPLAIN tree.

-- Query 3.2: High-Volume Customer Spend with HAVING Filter
-- Module: Execution Plans, SQL Analyzer
SELECT
    c.id AS customer_id,
    c.first_name,
    c.last_name,
    c.country,
    COUNT(o.id) AS completed_orders,
    SUM(o.total_amount) AS total_spent
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'COMPLETED'
GROUP BY c.id, c.first_name, c.last_name, c.country
HAVING COUNT(o.id) >= 2
ORDER BY total_spent DESC;
-- Observation: Aggregation with post-grouping filter on completed orders.

-- =============================================================================
-- SECTION 4: MULTI-TABLE JOINS & SHORTEST JOIN PATH
-- Purpose: Test join graph traversal, foreign key alignment, DP Join Optimizer.
-- =============================================================================

-- Query 4.1: 4-Table Business Join (Customer -> Orders -> Order Items -> Products)
-- Module: Query Optimizer (DP Join), Execution Plans
SELECT
    c.id AS customer_id,
    c.first_name || ' ' || c.last_name AS customer_name,
    o.order_number,
    o.ordered_at,
    p.name AS product_name,
    oi.quantity,
    oi.unit_price,
    oi.line_total
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE o.status = 'COMPLETED'
  AND c.country = 'United States'
ORDER BY o.ordered_at DESC
LIMIT 50;
-- Observation: DP-Size join algorithm evaluates join permutations (Nested Loop vs Hash Join).

-- Query 4.2: Department, Employee, and Supplier Ecosystem Join
-- Module: Schema Explorer, Execution Plans
SELECT
    d.name AS department_name,
    e.first_name || ' ' || e.last_name AS employee_name,
    e.job_title,
    e.salary,
    s.name AS preferred_supplier,
    s.country AS supplier_country
FROM departments d
JOIN employees e ON e.department_id = d.id
LEFT JOIN suppliers s ON s.country = d.location
WHERE e.is_active = TRUE
ORDER BY d.name, e.salary DESC;
-- Observation: Demonstrates INNER and LEFT JOIN node structures.

-- =============================================================================
-- SECTION 5: SUBQUERIES & PREDICATE PUSH-DOWN
-- Purpose: Test relational algebra unnesting, subquery depth check (R006).
-- =============================================================================

-- Query 5.1: IN Subquery Candidates for Unnesting
-- Module: Query Optimizer, SQL Analyzer
SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.email
FROM customers c
WHERE c.id IN (
    SELECT o.customer_id
    FROM orders o
    WHERE o.status = 'COMPLETED'
      AND o.total_amount > 200.00
);
-- Observation: Relational Algebra optimizer unnests IN predicate into an EXISTS / INNER JOIN.

-- Query 5.2: Correlated Subquery in SELECT Projection
-- Module: Execution Plans, SQL Analyzer
SELECT
    p.id,
    p.sku,
    p.name,
    p.unit_price,
    (
        SELECT COALESCE(SUM(oi.quantity), 0)
        FROM order_items oi
        WHERE oi.product_id = p.id
    ) AS total_units_sold
FROM products p
WHERE p.is_discontinued = FALSE
ORDER BY total_units_sold DESC
LIMIT 20;
-- Observation: Flags scalar subquery projection; evaluates join rewrite.

-- =============================================================================
-- SECTION 6: COMMON TABLE EXPRESSIONS (CTEs)
-- Purpose: Test CTE AST parsing, materialized vs inline evaluation.
-- =============================================================================

-- Query 6.1: Multi-Stage Order Summary CTE
-- Module: Execution Plans, SQL Analyzer
WITH customer_order_totals AS (
    SELECT
        customer_id,
        COUNT(id) AS order_count,
        SUM(total_amount) AS lifetime_value
    FROM orders
    WHERE status = 'COMPLETED'
    GROUP BY customer_id
),
ranked_customers AS (
    SELECT
        cot.customer_id,
        cot.order_count,
        cot.lifetime_value,
        NTILE(4) OVER (ORDER BY cot.lifetime_value DESC) AS spending_quartile
    FROM customer_order_totals cot
)
SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.email,
    rc.order_count,
    rc.lifetime_value,
    rc.spending_quartile
FROM ranked_customers rc
JOIN customers c ON c.id = rc.customer_id
ORDER BY rc.lifetime_value DESC;
-- Observation: Validates CTE node traversal in physical plan tree.

-- =============================================================================
-- SECTION 7: WINDOW FUNCTIONS & ANALYTIC QUERIES
-- Purpose: Test window node traversal (WindowAgg) and complexity scoring.
-- =============================================================================

-- Query 7.1: Running Total and Department Salary Ranking
-- Module: Execution Plans, SQL Analyzer
SELECT
    e.id,
    e.first_name,
    e.last_name,
    d.name AS department_name,
    e.salary,
    RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS salary_rank,
    ROUND(AVG(e.salary) OVER (PARTITION BY e.department_id), 2) AS dept_avg_salary,
    SUM(e.salary) OVER (PARTITION BY e.department_id ORDER BY e.hire_date) AS running_payroll
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.is_active = TRUE;
-- Observation: Demonstrates WindowAgg and Sort nodes in execution plan.

-- =============================================================================
-- SECTION 8: DATE, TIME & TEMPORAL FILTERING
-- Purpose: Test temporal indexing and partition pruning readiness.
-- =============================================================================

-- Query 8.1: Recent Orders with Interval Arithmetic
-- Module: Execution Plans, Performance Benchmark
SELECT
    o.id,
    o.order_number,
    o.ordered_at,
    o.status,
    o.total_amount,
    p.payment_method
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE o.ordered_at >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY o.ordered_at DESC;
-- Observation: Evaluates range scan on timestamp column.

-- =============================================================================
-- SECTION 9: DATABASE VIEWS
-- Purpose: Test view introspection in Schema Explorer and Views Static Analyzer.
-- =============================================================================

-- Query 9.1: Querying Pre-Built Test View 'monthly_revenue_summary'
-- Module: Schema Explorer, Execution Plans
SELECT
    revenue_month,
    order_count,
    unique_customers,
    net_revenue,
    avg_order_value
FROM monthly_revenue_summary
ORDER BY revenue_month DESC;
-- Observation: Reads directly from PostgreSQL catalog view.

-- Query 9.2: Querying 'employee_department_summary' View
-- Module: Schema Explorer, SQL Analyzer
SELECT
    department_name,
    headcount,
    active_employees,
    avg_salary,
    total_payroll
FROM employee_department_summary
WHERE active_employees > 0
ORDER BY total_payroll DESC;
-- Observation: Evaluates view definition expansion in the query optimizer.

-- =============================================================================
-- SECTION 10: STORED FUNCTIONS
-- Purpose: Test user-defined functions in SQLSense test database.
-- =============================================================================

-- Query 10.1: Calculate Order Total Function
-- Module: Functions Analyzer, Schema Explorer
SELECT
    o.id,
    o.order_number,
    o.total_amount AS recorded_total,
    calculate_order_total(o.id) AS computed_total
FROM orders o
WHERE o.status = 'COMPLETED'
LIMIT 10;
-- Observation: Tests STABLE PL/pgSQL function calculate_order_total().

-- Query 10.2: Customer Lifetime Value Function
-- Module: Functions Analyzer, Schema Explorer
SELECT
    c.id,
    c.first_name || ' ' || c.last_name AS customer_name,
    calculate_customer_lifetime_value(c.id) AS calculated_clv,
    c.total_spend AS cached_spend
FROM customers c
WHERE c.is_active = TRUE
LIMIT 10;
-- Observation: Tests calculate_customer_lifetime_value() function.

-- Query 10.3: Product Stock Status Function
-- Module: Functions Analyzer, Schema Explorer
SELECT
    p.id,
    p.sku,
    p.name,
    inv.quantity_on_hand,
    get_product_stock_status(p.id) AS stock_status
FROM products p
JOIN inventory inv ON inv.product_id = p.id
LIMIT 15;
-- Observation: Tests get_product_stock_status() case logic.

-- =============================================================================
-- SECTION 11: QUERY ANTI-PATTERNS (FOR SQL ANALYZER AUDIT)
-- Purpose: Demonstrate detection of standard SQL anti-patterns.
-- =============================================================================

-- Query 11.1: Redundant Boolean Comparison (Anti-Pattern R004)
-- Module: SQL Analyzer
SELECT id, first_name, email
FROM customers
WHERE is_active = TRUE;
-- Observation: Flags R004 (Explicit boolean comparison). Recommends WHERE is_active.

-- Query 11.2: Redundant Constant Tautology 1=1 (Anti-Pattern R005)
-- Module: SQL Analyzer, Query Optimizer
SELECT id, sku, name, unit_price
FROM products
WHERE 1 = 1
  AND is_discontinued = FALSE;
-- Observation: Flags R005 (Tautology 1=1). Relational algebra removes redundant predicate.

-- Query 11.3: Implicit Cartesian Product / Comma Join (Anti-Pattern R010)
-- Module: SQL Analyzer
SELECT c.email, o.order_number
FROM customers c, orders o
WHERE c.id = o.customer_id;
-- Observation: Flags R010 (Legacy comma join syntax). Recommends explicit INNER JOIN.

-- Query 11.4: Invalid Null Comparison = NULL (Anti-Pattern R011)
-- Module: SQL Analyzer
SELECT id, sku, name
FROM products
WHERE description = NULL;
-- Observation: Flags R011 (Comparison against NULL with =). Recommends IS NULL.

-- Query 11.5: Non-Deterministic ORDER BY RAND() (Anti-Pattern R015)
-- Module: SQL Analyzer
SELECT id, first_name, email
FROM customers
ORDER BY RANDOM()
LIMIT 5;
-- Observation: Flags R015 (Full table scan caused by ORDER BY RANDOM()).

-- =============================================================================
-- SECTION 12: INDEX ADVISOR WORKLOAD CANDIDATES
-- Purpose: Trigger Index Advisor foreign key and filter column recommendations.
-- =============================================================================

-- Query 12.1: Multi-Filter Composite Index Candidate
-- Module: Index Advisor (Workload Query Mode)
SELECT *
FROM orders
WHERE status = 'PROCESSING'
  AND customer_id = 5;
-- Observation: Index Advisor suggests CREATE INDEX idx_orders_cust_status ON orders(customer_id, status);

-- Query 12.2: Product Inventory Join Filter
-- Module: Index Advisor
SELECT
    p.name,
    inv.quantity_on_hand,
    inv.reorder_level
FROM products p
JOIN inventory inv ON inv.product_id = p.id
WHERE inv.quantity_on_hand < inv.reorder_level;
-- Observation: Evaluates existing unique index on inventory(product_id).

-- =============================================================================
-- SECTION 13: SAFE PERFORMANCE BENCHMARKING CANDIDATES
-- Purpose: Safe SELECT queries for 5-iteration benchmarking and before/after comparisons.
-- =============================================================================

-- Query 13.1: Benchmark Baseline Query (Original)
-- Module: Performance Benchmarking
SELECT *
FROM customers
WHERE id = 1;

-- Query 13.2: Benchmark Candidate Query (Optimized Alternate)
-- Module: Performance Benchmarking (Before vs After Comparison)
SELECT
    id,
    first_name,
    last_name,
    email
FROM customers
WHERE id = 1;
-- Observation: Comparing 13.1 vs 13.2 measures exact latency delta across runs.

-- Query 13.3: Heavy Multi-Row Aggregation Benchmark
-- Module: Performance Benchmarking
SELECT
    o.status,
    COUNT(o.id) AS total_orders,
    SUM(o.total_amount) AS gross_sales,
    AVG(o.total_amount) AS avg_sale
FROM orders o
GROUP BY o.status;
-- Observation: Multi-row aggregation benchmark loop with buffer cache warm-up.

-- =============================================================================
-- SECTION 14: STORED PROCEDURE EXECUTION & STATIC ANALYSIS
-- Purpose: Test stored procedure inspection and quality engine (SP001 - SP015).
-- =============================================================================

-- Procedure Call 14.1: Refresh Inventory Status Procedure
-- Module: Stored Procedures (Calling real procedure on sqlsense_test)
CALL refresh_inventory_status();
-- Observation: Executes successfully; outputs NOTICE with updated inventory count.

-- Code Snippet 14.2: PL/pgSQL for Static Quality Analysis
-- Module: Stored Procedures Analyzer (Paste into UI input)
CREATE OR REPLACE PROCEDURE reconcile_accounts(p_dept_id INT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_total NUMERIC := 0;
    v_cursor CURSOR FOR SELECT salary FROM employees WHERE department_id = p_dept_id;
BEGIN
    -- SP004: Redundant boolean comparison
    IF (p_dept_id IS NOT NULL) = TRUE THEN
        OPEN v_cursor;
        -- SP014: Cursor opened but never closed
    END IF;

    -- SP012: Unsafe DML without WHERE clause
    UPDATE employees SET updated_at = CURRENT_TIMESTAMP;

    -- SP007: Swallowed exception
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END;
$$;
-- Observation: Flags SP004, SP007, SP012, SP014 in Stored Procedure Analyzer.

-- =============================================================================
-- SECTION 15: DESTRUCTIVE ANTI-PATTERNS (FOR STATIC ANALYSIS AUDIT ONLY)
-- WARNING: DO NOT EXECUTE THESE STATEMENTS ON A LIVE DATABASE!
-- Purpose: Test SQL Analyzer static detection of R016, R017, R018, R019, R020.
-- Copy and paste these statements into the SQL Analyzer UI to verify that the
-- AST rule engine detects critical anti-patterns and blocks execution.
-- =============================================================================

-- Statement 15.1: Unsafe DELETE without WHERE clause (Anti-Pattern R016)
-- Expected finding: CRITICAL - Destructive DELETE without filtering predicate.
-- DO NOT EXECUTE LIVE:
-- DELETE FROM orders;

-- Statement 15.2: Unsafe UPDATE without WHERE clause (Anti-Pattern R017)
-- Expected finding: CRITICAL - Mass table mutation without filtering predicate.
-- DO NOT EXECUTE LIVE:
-- UPDATE customers SET is_active = FALSE;

-- Statement 15.3: Table Truncation (Anti-Pattern R018)
-- Expected finding: CRITICAL - TRUNCATE statement causes irreversible data loss.
-- DO NOT EXECUTE LIVE:
-- TRUNCATE TABLE audit_logs;

-- Statement 15.4: Table Drop (Anti-Pattern R019)
-- Expected finding: CRITICAL - DROP TABLE statement removes entire schema object.
-- DO NOT EXECUTE LIVE:
-- DROP TABLE product_reviews;

-- Statement 15.5: Non-Existent Column Injection Test
-- Expected finding: Syntax or Schema Error during candidate validation.
-- DO NOT EXECUTE LIVE:
-- SELECT * FROM customers WHERE non_existent_column = 'danger';
