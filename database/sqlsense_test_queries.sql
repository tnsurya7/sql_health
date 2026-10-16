-- =============================================================================
-- SQLSense AI — Test Queries
-- File   : database/sqlsense_test_queries.sql
-- Target : sqlsense_test database
-- Purpose: A collection of safe and interesting SQL queries to demonstrate
--          SQLSense AI features: Query Optimizer, Index Advisor, Schema
--          Explorer, Views, Functions, Procedures, and Triggers.
--
-- HOW TO USE:
--   Copy individual statements into the SQLSense AI SQL Analyzer and click
--   "Analyze" or "Optimize".
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: BASIC SELECT QUERIES
-- ─────────────────────────────────────────────────────────────────────────────

-- 1.1  SELECT * (intentionally broad — demonstrates SELECT * anti-pattern)
SELECT * FROM customers;

-- 1.2  Column-explicit SELECT (best practice)
SELECT id, first_name, last_name, email, loyalty_tier, total_spend
FROM   customers
WHERE  is_active = TRUE
ORDER  BY total_spend DESC
LIMIT  25;

-- 1.3  LIKE pattern — demonstrates non-sargable filter
SELECT id, first_name, last_name, email
FROM   customers
WHERE  email LIKE '%@example.com';

-- 1.4  LIKE with leading wildcard (non-sargable, good Index Advisor test)
SELECT id, first_name, last_name, email
FROM   customers
WHERE  email LIKE '%gmail%';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: MULTI-TABLE JOINS
-- ─────────────────────────────────────────────────────────────────────────────

-- 2.1  Two-table join: orders + customers
SELECT o.order_number, o.status, o.total_amount,
       c.first_name || ' ' || c.last_name AS customer_name,
       c.email
FROM   orders    o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.status = 'COMPLETED'
ORDER  BY o.total_amount DESC
LIMIT  50;

-- 2.2  Three-table join: order_items + products + categories
SELECT oi.id AS line_id, o.order_number, p.name AS product, cat.name AS category,
       oi.quantity, oi.unit_price, oi.line_total
FROM   order_items oi
JOIN   orders    o   ON o.id   = oi.order_id
JOIN   products  p   ON p.id   = oi.product_id
JOIN   categories cat ON cat.id = p.category_id
WHERE  o.status = 'COMPLETED'
  AND  cat.name = 'Electronics'
ORDER  BY oi.line_total DESC
LIMIT  100;

-- 2.3  Five-table join (exercises join optimizer)
SELECT
    c.first_name || ' ' || c.last_name  AS customer,
    o.order_number,
    p.sku, p.name   AS product,
    sup.name        AS supplier,
    oi.quantity, oi.line_total,
    pay.payment_method
FROM   order_items oi
JOIN   orders    o   ON o.id   = oi.order_id
JOIN   customers c   ON c.id   = o.customer_id
JOIN   products  p   ON p.id   = oi.product_id
LEFT JOIN suppliers sup ON sup.id = p.supplier_id
LEFT JOIN payments  pay ON pay.order_id = o.id
WHERE  o.ordered_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
ORDER  BY oi.line_total DESC
LIMIT  200;

-- 2.4  LEFT JOIN to find customers who have never placed an order
SELECT c.id, c.first_name, c.last_name, c.email, c.created_at
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE  o.id IS NULL
ORDER  BY c.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: SUBQUERIES
-- ─────────────────────────────────────────────────────────────────────────────

-- 3.1  Correlated subquery — top-spending customer per country
SELECT c.country, c.first_name, c.last_name, c.total_spend
FROM   customers c
WHERE  c.total_spend = (
    SELECT MAX(c2.total_spend)
    FROM   customers c2
    WHERE  c2.country = c.country
)
ORDER  BY c.total_spend DESC;

-- 3.2  IN subquery — customers with at least one cancelled order
SELECT id, first_name, last_name, email
FROM   customers
WHERE  id IN (
    SELECT DISTINCT customer_id
    FROM   orders
    WHERE  status = 'CANCELLED'
)
ORDER  BY last_name;

-- 3.3  EXISTS subquery (typically faster than IN for large sets)
SELECT c.id, c.first_name, c.last_name, c.email
FROM   customers c
WHERE  EXISTS (
    SELECT 1
    FROM   orders o
    WHERE  o.customer_id = c.id
      AND  o.total_amount > 1000
);

-- 3.4  Scalar subquery in SELECT
SELECT o.order_number, o.total_amount,
       (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
FROM   orders o
WHERE  o.status = 'COMPLETED'
ORDER  BY item_count DESC
LIMIT  20;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: AGGREGATION, GROUP BY, HAVING
-- ─────────────────────────────────────────────────────────────────────────────

-- 4.1  Revenue by country
SELECT o.shipping_country,
       COUNT(*)                AS order_count,
       SUM(o.total_amount)     AS gross_revenue,
       AVG(o.total_amount)     AS avg_order
FROM   orders o
WHERE  o.status = 'COMPLETED'
GROUP  BY o.shipping_country
ORDER  BY gross_revenue DESC;

-- 4.2  HAVING — departments with total payroll > $1M
SELECT d.name AS department, SUM(e.salary) AS total_payroll, COUNT(e.id) AS headcount
FROM   departments d
JOIN   employees   e ON e.department_id = d.id
WHERE  e.is_active = TRUE
GROUP  BY d.name
HAVING SUM(e.salary) > 1000000
ORDER  BY total_payroll DESC;

-- 4.3  Product sales count by category with minimum sales threshold
SELECT cat.name AS category,
       COUNT(DISTINCT p.id)         AS product_count,
       SUM(oi.quantity)             AS units_sold,
       SUM(oi.line_total)           AS category_revenue
FROM   categories  cat
JOIN   products    p   ON p.category_id = cat.id
JOIN   order_items oi  ON oi.product_id = p.id
JOIN   orders      o   ON o.id = oi.order_id AND o.status = 'COMPLETED'
GROUP  BY cat.name
HAVING SUM(oi.quantity) > 100
ORDER  BY category_revenue DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: DATE FILTERING
-- ─────────────────────────────────────────────────────────────────────────────

-- 5.1  Orders in the last 7 days
SELECT id, order_number, status, total_amount, ordered_at
FROM   orders
WHERE  ordered_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
ORDER  BY ordered_at DESC;

-- 5.2  Orders placed in a specific month (sargable: compare against column directly)
SELECT id, order_number, total_amount, ordered_at
FROM   orders
WHERE  ordered_at >= '2025-01-01'
  AND  ordered_at <  '2025-02-01'
ORDER  BY ordered_at;

-- 5.3  Non-sargable date filter (good anti-pattern to demonstrate)
SELECT id, order_number, total_amount, ordered_at
FROM   orders
WHERE  DATE_PART('year', ordered_at) = 2025
  AND  DATE_PART('month', ordered_at) = 6;

-- 5.4  Employees hired in the last 2 years
SELECT id, first_name, last_name, job_title, hire_date
FROM   employees
WHERE  hire_date >= CURRENT_DATE - INTERVAL '2 years'
  AND  is_active = TRUE
ORDER  BY hire_date DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: CTEs (Common Table Expressions)
-- ─────────────────────────────────────────────────────────────────────────────

-- 6.1  Revenue ranking by month using CTE
WITH monthly AS (
    SELECT DATE_TRUNC('month', ordered_at) AS month,
           SUM(total_amount)               AS revenue
    FROM   orders
    WHERE  status = 'COMPLETED'
    GROUP  BY DATE_TRUNC('month', ordered_at)
)
SELECT month,
       revenue,
       LAG(revenue)  OVER (ORDER BY month) AS prev_month_revenue,
       ROUND((revenue - LAG(revenue) OVER (ORDER BY month))
             / NULLIF(LAG(revenue) OVER (ORDER BY month), 0) * 100, 2) AS growth_pct
FROM   monthly
ORDER  BY month DESC;

-- 6.2  Multi-CTE: top products and their inventory status
WITH top_products AS (
    SELECT product_id, SUM(line_total) AS revenue
    FROM   order_items
    GROUP  BY product_id
    ORDER  BY revenue DESC
    LIMIT  10
),
stock AS (
    SELECT product_id, quantity_on_hand, reorder_level
    FROM   inventory
)
SELECT p.sku, p.name, tp.revenue, s.quantity_on_hand, s.reorder_level,
       get_product_stock_status(p.id) AS stock_status
FROM   top_products tp
JOIN   products p ON p.id = tp.product_id
LEFT JOIN stock s ON s.product_id = tp.product_id
ORDER  BY tp.revenue DESC;

-- 6.3  Recursive CTE — generate a date series for the last 12 months
WITH RECURSIVE months(month) AS (
    SELECT DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
    UNION ALL
    SELECT month + INTERVAL '1 month'
    FROM   months
    WHERE  month < DATE_TRUNC('month', CURRENT_DATE)
)
SELECT m.month,
       COALESCE(SUM(o.total_amount), 0) AS revenue
FROM   months m
LEFT JOIN orders o ON DATE_TRUNC('month', o.ordered_at) = m.month
              AND o.status = 'COMPLETED'
GROUP  BY m.month
ORDER  BY m.month;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: WINDOW FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- 7.1  Running total of revenue per customer
SELECT c.first_name || ' ' || c.last_name AS customer,
       o.order_number, o.total_amount, o.ordered_at,
       SUM(o.total_amount) OVER (PARTITION BY o.customer_id ORDER BY o.ordered_at)
           AS cumulative_spend
FROM   orders    o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.status = 'COMPLETED'
ORDER  BY o.customer_id, o.ordered_at
LIMIT  100;

-- 7.2  ROW_NUMBER — rank products by revenue within each category
SELECT cat.name AS category,
       p.name   AS product,
       SUM(oi.line_total) AS revenue,
       ROW_NUMBER() OVER (PARTITION BY cat.id ORDER BY SUM(oi.line_total) DESC) AS rank_in_category
FROM   order_items oi
JOIN   products   p   ON p.id   = oi.product_id
JOIN   categories cat ON cat.id = p.category_id
GROUP  BY cat.id, cat.name, p.id, p.name
ORDER  BY cat.name, rank_in_category;

-- 7.3  NTILE — segment customers into quartiles by spend
SELECT first_name, last_name, total_spend,
       NTILE(4) OVER (ORDER BY total_spend DESC) AS spend_quartile
FROM   customers
WHERE  is_active = TRUE
ORDER  BY total_spend DESC
LIMIT  50;

-- 7.4  LAG/LEAD — month-over-month order count comparison
SELECT
    DATE_TRUNC('month', ordered_at)  AS month,
    COUNT(*)                          AS orders,
    LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', ordered_at)) AS prev_orders
FROM   orders
GROUP  BY DATE_TRUNC('month', ordered_at)
ORDER  BY month DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: USING VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- 8.1  Customer summary view
SELECT * FROM customer_order_summary
ORDER BY lifetime_revenue DESC
LIMIT 20;

-- 8.2  Product sales summary view — low stock items
SELECT product_id, sku, product_name, category_name, stock_qty,
       total_units_sold, total_revenue
FROM   product_sales_summary
WHERE  stock_qty < 50
ORDER  BY stock_qty ASC;

-- 8.3  Employee department summary
SELECT department_name, location, headcount, avg_salary, total_payroll
FROM   employee_department_summary
ORDER  BY total_payroll DESC;

-- 8.4  Monthly revenue summary (last 6 months)
SELECT revenue_month, order_count, unique_customers, net_revenue
FROM   monthly_revenue_summary
LIMIT  6;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: USING FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- 9.1  Calculate order total for order #1
SELECT calculate_order_total(1);

-- 9.2  Customer lifetime value for all Gold-tier customers
SELECT c.id, c.first_name, c.last_name, c.loyalty_tier,
       calculate_customer_lifetime_value(c.id) AS clv
FROM   customers c
WHERE  c.loyalty_tier = 'Gold'
ORDER  BY clv DESC
LIMIT  10;

-- 9.3  Stock status for all products (uses function in SELECT)
SELECT p.id, p.sku, p.name, inv.quantity_on_hand,
       get_product_stock_status(p.id) AS stock_status
FROM   products  p
JOIN   inventory inv ON inv.product_id = p.id
ORDER  BY inv.quantity_on_hand ASC
LIMIT  30;

-- 9.4  Function in WHERE — find all out-of-stock products
SELECT p.id, p.sku, p.name, p.unit_price
FROM   products p
WHERE  get_product_stock_status(p.id) = 'OUT_OF_STOCK';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: INDEX CANDIDATE QUERIES
-- (Queries that might benefit from additional indexes)
-- ─────────────────────────────────────────────────────────────────────────────

-- 10.1  Filter on non-indexed column: customers.city
SELECT id, first_name, last_name, city, loyalty_tier
FROM   customers
WHERE  city = 'London'
  AND  is_active = TRUE;

-- 10.2  Composite filter candidate
SELECT id, order_number, total_amount, status
FROM   orders
WHERE  status = 'COMPLETED'
  AND  ordered_at >= '2025-01-01'
ORDER  BY total_amount DESC;

-- 10.3  Join on potentially unindexed column: suppliers.country
SELECT sup.name, sup.country, COUNT(p.id) AS product_count
FROM   suppliers sup
JOIN   products  p  ON p.supplier_id = sup.id
WHERE  sup.country = 'Germany'
GROUP  BY sup.name, sup.country;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: EXPENSIVE JOIN PATTERNS
-- ─────────────────────────────────────────────────────────────────────────────

-- 11.1  Cartesian product risk — CROSS JOIN (no filter)
SELECT c.first_name, d.name AS department
FROM   customers c
CROSS JOIN departments d
LIMIT  100;

-- 11.2  Nested loop risk — correlated subquery across large table
SELECT o.id, o.order_number, o.total_amount,
       (SELECT SUM(oi.line_total) FROM order_items oi WHERE oi.order_id = o.id) AS items_total
FROM   orders o
WHERE  o.status = 'COMPLETED'
LIMIT  500;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: TRIGGER VERIFICATION QUERIES
-- (Run in a transaction and ROLLBACK — safe, no permanent changes)
-- ─────────────────────────────────────────────────────────────────────────────

-- 12.1  Verify updated_at trigger on departments
BEGIN;
  SELECT id, name, updated_at FROM departments WHERE id = 1;
  UPDATE departments SET budget = budget + 1 WHERE id = 1;
  SELECT id, name, updated_at FROM departments WHERE id = 1;
ROLLBACK;

-- 12.2  Verify inventory deduction trigger
BEGIN;
  SELECT product_id, quantity_on_hand FROM inventory WHERE product_id = 1;
  INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
  VALUES (1, 1, 5, 99.99, 499.95);
  SELECT product_id, quantity_on_hand FROM inventory WHERE product_id = 1;
ROLLBACK;

-- 12.3  Verify order audit trigger
BEGIN;
  SELECT COUNT(*) FROM audit_logs WHERE table_name = 'orders';
  UPDATE orders SET status = 'SHIPPED' WHERE id = 1;
  SELECT COUNT(*) FROM audit_logs WHERE table_name = 'orders';
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13: PROCEDURE VERIFICATION QUERIES
-- (Safe to run — uses ROLLBACK wrapper for the procedural test)
-- ─────────────────────────────────────────────────────────────────────────────

-- 13.1  Test process_order procedure
BEGIN;
  CALL process_order(
    p_customer_id    => 1,
    p_product_ids    => ARRAY[1, 2, 3],
    p_quantities     => ARRAY[2, 1, 1],
    p_payment_method => 'CREDIT_CARD'
  );
  SELECT order_number, status, total_amount FROM orders ORDER BY id DESC LIMIT 1;
ROLLBACK;

-- 13.2  Test refresh_inventory_status procedure (non-destructive)
BEGIN;
  SELECT product_id, quantity_on_hand FROM inventory LIMIT 5;
  CALL refresh_inventory_status();
  SELECT product_id, quantity_on_hand FROM inventory LIMIT 5;
ROLLBACK;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14: DESTRUCTIVE QUERY EXAMPLES
--
-- IMPORTANT: These statements are FOR ANALYSIS ONLY in SQLSense AI.
-- They are commented out and must NEVER be executed automatically.
-- Use them only to understand how SQLSense AI analyzes dangerous patterns.
-- ─────────────────────────────────────────────────────────────────────────────

-- 14.1  UPDATE without WHERE (dangerous — updates every row)
-- UPDATE orders SET status = 'COMPLETED';

-- 14.2  DELETE with WHERE (targeted — safer but still destructive)
-- DELETE FROM audit_logs WHERE changed_at < CURRENT_TIMESTAMP - INTERVAL '90 days';

-- 14.3  DELETE without WHERE (extremely dangerous — wipes entire table)
-- DELETE FROM audit_logs;

-- 14.4  TRUNCATE (fast, non-transactional table wipe)
-- TRUNCATE TABLE audit_logs CASCADE;

-- 14.5  DROP TABLE (irreversible)
-- DROP TABLE audit_logs;
