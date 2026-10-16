-- =============================================================================
-- SQLSense AI — Test Database
-- File   : database/sqlsense_test_database.sql
-- Target : sqlsense_test  (separate from the application metadata database)
-- Purpose: Realistic multi-table dataset for exploring all SQLSense AI features:
--          Schema Explorer, Index Advisor, Query Optimizer, Views, Functions,
--          Procedures, and Triggers.
--
-- HOW TO RUN (Windows PowerShell):
--   psql -U postgres -d sqlsense_test -f database/sqlsense_test_database.sql
--
-- SAFE TO RE-RUN: all CREATE TABLE / CREATE FUNCTION / CREATE TRIGGER
-- statements use IF NOT EXISTS or CREATE OR REPLACE.
-- Data inserts are skipped if rows already exist (ON CONFLICT DO NOTHING).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Connection notice
-- ─────────────────────────────────────────────────────────────────────────────
\echo '>>> SQLSense AI — Test Database Import Starting...'

-- ─────────────────────────────────────────────────────────────────────────────
-- SCHEMA TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. categories
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(80)  NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. departments
CREATE TABLE IF NOT EXISTS departments (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    budget      NUMERIC(14,2) NOT NULL DEFAULT 100000.00 CHECK (budget >= 0),
    location    VARCHAR(120) NOT NULL DEFAULT 'Headquarters',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. employees
CREATE TABLE IF NOT EXISTS employees (
    id              SERIAL PRIMARY KEY,
    department_id   INT          REFERENCES departments(id) ON DELETE SET NULL,
    first_name      VARCHAR(60)  NOT NULL,
    last_name       VARCHAR(60)  NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    job_title       VARCHAR(100),
    salary          NUMERIC(12,2) NOT NULL CHECK (salary >= 0),
    hire_date       DATE         NOT NULL,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL UNIQUE,
    contact     VARCHAR(100),
    email       VARCHAR(150) UNIQUE,
    phone       VARCHAR(30),
    country     VARCHAR(80)  NOT NULL DEFAULT 'United States',
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. products
CREATE TABLE IF NOT EXISTS products (
    id              SERIAL PRIMARY KEY,
    category_id     INT          NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    supplier_id     INT          REFERENCES suppliers(id) ON DELETE SET NULL,
    sku             VARCHAR(60)  NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    is_discontinued BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. inventory
CREATE TABLE IF NOT EXISTS inventory (
    id              SERIAL PRIMARY KEY,
    product_id      INT          NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    quantity_on_hand INT         NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
    reorder_level   INT          NOT NULL DEFAULT 20 CHECK (reorder_level >= 0),
    reorder_qty     INT          NOT NULL DEFAULT 50 CHECK (reorder_qty > 0),
    last_restocked  TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 7. customers
CREATE TABLE IF NOT EXISTS customers (
    id              SERIAL PRIMARY KEY,
    first_name      VARCHAR(80)  NOT NULL,
    last_name       VARCHAR(80)  NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    phone           VARCHAR(30),
    country         VARCHAR(80)  NOT NULL DEFAULT 'United States',
    city            VARCHAR(100),
    loyalty_tier    VARCHAR(20)  NOT NULL DEFAULT 'Bronze'
                        CHECK (loyalty_tier IN ('Bronze','Silver','Gold','Platinum')),
    total_spend     NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (total_spend >= 0),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. orders
CREATE TABLE IF NOT EXISTS orders (
    id              SERIAL PRIMARY KEY,
    customer_id     INT          NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    order_number    VARCHAR(60)  NOT NULL UNIQUE,
    status          VARCHAR(30)  NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PROCESSING','SHIPPED','COMPLETED','CANCELLED','REFUNDED')),
    total_amount    NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    shipping_country VARCHAR(80) NOT NULL DEFAULT 'United States',
    ordered_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at    TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. order_items
CREATE TABLE IF NOT EXISTS order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INT          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  INT          NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity    INT          NOT NULL CHECK (quantity > 0),
    unit_price  NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
    line_total  NUMERIC(14,2) NOT NULL CHECK (line_total >= 0),
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. payments
CREATE TABLE IF NOT EXISTS payments (
    id              SERIAL PRIMARY KEY,
    order_id        INT          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method  VARCHAR(40)  NOT NULL
                        CHECK (payment_method IN ('CREDIT_CARD','DEBIT_CARD','PAYPAL','STRIPE','BANK_TRANSFER','APPLE_PAY','GOOGLE_PAY')),
    amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    status          VARCHAR(30)  NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
    transaction_ref VARCHAR(120) NOT NULL UNIQUE,
    paid_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 11. audit_logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL   PRIMARY KEY,
    table_name  VARCHAR(80) NOT NULL,
    record_id   INT         NOT NULL,
    action      VARCHAR(20) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    old_data    JSONB,
    new_data    JSONB,
    changed_by  VARCHAR(100) NOT NULL DEFAULT 'system',
    changed_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_employees_dept    ON employees   (department_id);
CREATE INDEX IF NOT EXISTS idx_employees_active  ON employees   (is_active);
CREATE INDEX IF NOT EXISTS idx_employees_email   ON employees   (email);

CREATE INDEX IF NOT EXISTS idx_products_category ON products    (category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products    (supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_sku      ON products    (sku);
CREATE INDEX IF NOT EXISTS idx_products_disc     ON products    (is_discontinued);

CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory   (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_qty     ON inventory   (quantity_on_hand);

CREATE INDEX IF NOT EXISTS idx_customers_email   ON customers   (email);
CREATE INDEX IF NOT EXISTS idx_customers_active  ON customers   (is_active);
CREATE INDEX IF NOT EXISTS idx_customers_tier    ON customers   (loyalty_tier);
CREATE INDEX IF NOT EXISTS idx_customers_country ON customers   (country);

CREATE INDEX IF NOT EXISTS idx_orders_customer   ON orders      (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders      (status);
CREATE INDEX IF NOT EXISTS idx_orders_ordered_at ON orders      (ordered_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order   ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id);

CREATE INDEX IF NOT EXISTS idx_payments_order    ON payments    (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON payments    (status);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at  ON payments    (paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table  ON audit_logs  (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_when   ON audit_logs  (changed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA — wrapped in a DO block so it is idempotent on re-runs
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN

-- categories
INSERT INTO categories (name, description) VALUES
  ('Electronics',     'Computers, smartphones, and electronic gadgets'),
  ('Software',        'Licenses, subscriptions, and digital products'),
  ('Accessories',     'Cables, cases, and peripheral accessories'),
  ('Hardware',        'Physical computing hardware components'),
  ('Services',        'Professional and managed services'),
  ('Networking',      'Routers, switches, and networking equipment'),
  ('Office Supplies', 'Stationery, furniture, and office equipment')
ON CONFLICT DO NOTHING;

-- departments
INSERT INTO departments (name, budget, location) VALUES
  ('Engineering',        1500000.00, 'San Francisco, CA'),
  ('Sales',               850000.00, 'New York, NY'),
  ('Marketing',           600000.00, 'Austin, TX'),
  ('Finance',             450000.00, 'Chicago, IL'),
  ('Customer Support',    350000.00, 'Remote'),
  ('Human Resources',     275000.00, 'Boston, MA'),
  ('Product Management',  400000.00, 'Seattle, WA'),
  ('Data & Analytics',    550000.00, 'San Francisco, CA')
ON CONFLICT DO NOTHING;

-- suppliers
INSERT INTO suppliers (name, contact, email, phone, country) VALUES
  ('TechCore Supplies',    'Alice Nguyen',   'alice@techcore.example',    '+1-415-555-0101', 'United States'),
  ('GlobalParts Inc',      'Bob Whitmore',   'bob@globalparts.example',   '+1-212-555-0202', 'United States'),
  ('EuroDistrib GmbH',     'Petra Mayer',    'petra@eurodistrib.example', '+49-30-555-0303', 'Germany'),
  ('AsiaTech Ltd',         'Kenji Tanaka',   'kenji@asiatech.example',    '+81-3-555-0404',  'Japan'),
  ('CanSoft Solutions',    'Maya Singh',     'maya@cansoft.example',      '+1-416-555-0505', 'Canada'),
  ('SiliconValley OEM',    'Chris Davis',    'chris@svoemg.example',      '+1-650-555-0606', 'United States'),
  ('NetGear Wholesale',    'Sarah Kim',      'sarah@netgearws.example',   '+1-408-555-0707', 'United States')
ON CONFLICT DO NOTHING;

END;
$$;

-- Insert employees (150 rows)
INSERT INTO employees (department_id, first_name, last_name, email, job_title, salary, hire_date)
SELECT
  1 + (s % 8)                                      AS department_id,
  'FirstName' || s                                  AS first_name,
  'LastName'  || s                                  AS last_name,
  'employee'  || s || '@company.internal'           AS email,
  (ARRAY[
    'Software Engineer','Senior Engineer','Product Manager',
    'Sales Representative','Account Executive','Data Analyst',
    'HR Specialist','Financial Analyst','QA Engineer','DevOps Engineer'
  ])[1 + (s % 10)]                                  AS job_title,
  ROUND((52000 + (s * 1237) % 98000)::NUMERIC, 2)   AS salary,
  (CURRENT_DATE - (s * 17 || ' days')::INTERVAL)::DATE AS hire_date
FROM generate_series(1, 150) s
ON CONFLICT DO NOTHING;

-- Insert products (200 rows)
INSERT INTO products (category_id, supplier_id, sku, name, unit_price)
SELECT
  1 + (s % 7)                                         AS category_id,
  1 + (s % 7)                                         AS supplier_id,
  'SKU-' || LPAD(s::TEXT, 6, '0')                     AS sku,
  (ARRAY['Enterprise','Professional','Ultimate','Standard','Premium'])[1+(s%5)]
    || ' '
    || (ARRAY['Laptop','Monitor','Keyboard','Router','License','Cable','Switch',
              'Headset','Webcam','Docking Station'])[1+(s%10)]
    || ' ' || s                                        AS name,
  ROUND((9.99 + (s * 13.7) % 2490)::NUMERIC, 2)       AS unit_price
FROM generate_series(1, 200) s
ON CONFLICT DO NOTHING;

-- Insert inventory (one row per product)
INSERT INTO inventory (product_id, quantity_on_hand, reorder_level, reorder_qty, last_restocked)
SELECT
  s                              AS product_id,
  10  + (s * 7)  % 490          AS quantity_on_hand,
  20  + (s % 30)                AS reorder_level,
  50  + (s % 100)               AS reorder_qty,
  CURRENT_TIMESTAMP - (s * 3   || ' hours')::INTERVAL AS last_restocked
FROM generate_series(1, 200) s
ON CONFLICT DO NOTHING;

-- Insert customers (1 000 rows)
INSERT INTO customers (first_name, last_name, email, phone, country, city, loyalty_tier, total_spend, created_at)
SELECT
  'First'  || s                         AS first_name,
  'Last'   || s                         AS last_name,
  'cust'   || s || '@example.com'       AS email,
  '+1-555-' || LPAD(s::TEXT, 7, '0')   AS phone,
  (ARRAY['United States','Canada','United Kingdom','Germany','Australia',
         'Japan','India','France','Brazil','Singapore'])[1 + (s % 10)] AS country,
  (ARRAY['New York','London','Berlin','Tokyo','Sydney',
         'San Francisco','Toronto','Paris','Mumbai','Singapore'])[1 + (s % 10)] AS city,
  (ARRAY['Bronze','Silver','Gold','Platinum'])[1 + (s % 4)] AS loyalty_tier,
  ROUND((100 + (s * 23.7) % 49900)::NUMERIC, 2) AS total_spend,
  CURRENT_TIMESTAMP - (s * 6 || ' hours')::INTERVAL AS created_at
FROM generate_series(1, 1000) s
ON CONFLICT DO NOTHING;

-- Insert orders (3 000 rows)
INSERT INTO orders (customer_id, order_number, status, total_amount, discount_amount, shipping_country, ordered_at, delivered_at)
SELECT
  1 + (s % 1000)                          AS customer_id,
  'ORD-2025-' || LPAD(s::TEXT, 6, '0')   AS order_number,
  (ARRAY['PENDING','PROCESSING','SHIPPED','COMPLETED','CANCELLED','REFUNDED'])[1+(s%6)] AS status,
  ROUND((29.99 + (s * 9.13) % 4970)::NUMERIC, 2) AS total_amount,
  ROUND(((s % 5) * 15.00)::NUMERIC, 2)   AS discount_amount,
  (ARRAY['United States','Canada','United Kingdom','Germany','Australia'])[1+(s%5)] AS shipping_country,
  CURRENT_TIMESTAMP - (s * 7 || ' minutes')::INTERVAL AS ordered_at,
  CASE WHEN s % 6 IN (3,4) THEN CURRENT_TIMESTAMP - (s * 3 || ' minutes')::INTERVAL ELSE NULL END AS delivered_at
FROM generate_series(1, 3000) s
ON CONFLICT DO NOTHING;

-- Insert order_items (6 000 rows, only if empty to ensure idempotency on re-run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_items LIMIT 1) THEN
    INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
    SELECT
      1 + (s % 3000)                           AS order_id,
      1 + (s % 200)                            AS product_id,
      1 + (s % 5)                              AS quantity,
      ROUND((9.99 + (s * 13.7 % 2490))::NUMERIC, 2) AS unit_price,
      ROUND(((1 + (s % 5)) * (9.99 + (s * 13.7 % 2490)))::NUMERIC, 2) AS line_total
    FROM generate_series(1, 6000) s;
  END IF;
END;
$$;

-- Insert payments (one per order that is COMPLETED/SHIPPED, only if empty)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payments LIMIT 1) THEN
    INSERT INTO payments (order_id, payment_method, amount, status, transaction_ref, paid_at)
    SELECT
      o.id,
      (ARRAY['CREDIT_CARD','DEBIT_CARD','PAYPAL','STRIPE','BANK_TRANSFER','APPLE_PAY','GOOGLE_PAY'])[1+(o.id%7)],
      o.total_amount,
      'SUCCESS',
      'TXN-' || md5(o.id::TEXT || o.order_number),
      o.ordered_at + INTERVAL '2 hours'
    FROM orders o
    WHERE o.status IN ('COMPLETED','SHIPPED')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Collect statistics so the planner has good estimates
ANALYZE categories;
ANALYZE departments;
ANALYZE employees;
ANALYZE suppliers;
ANALYZE products;
ANALYZE inventory;
ANALYZE customers;
ANALYZE orders;
ANALYZE order_items;
ANALYZE payments;

\echo '>>> Tables and seed data created/verified.'

-- =============================================================================
-- VIEWS
-- =============================================================================

-- VIEW 1: customer_order_summary
CREATE OR REPLACE VIEW customer_order_summary AS
SELECT
    c.id                                 AS customer_id,
    c.first_name || ' ' || c.last_name  AS customer_name,
    c.email,
    c.country,
    c.loyalty_tier,
    COUNT(o.id)                          AS total_orders,
    SUM(o.total_amount)                  AS lifetime_revenue,
    AVG(o.total_amount)                  AS avg_order_value,
    MAX(o.ordered_at)                    AS last_order_date,
    SUM(CASE WHEN o.status = 'COMPLETED'  THEN 1 ELSE 0 END) AS completed_orders,
    SUM(CASE WHEN o.status = 'CANCELLED'  THEN 1 ELSE 0 END) AS cancelled_orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.first_name, c.last_name, c.email, c.country, c.loyalty_tier;

-- VIEW 2: product_sales_summary
CREATE OR REPLACE VIEW product_sales_summary AS
SELECT
    p.id                        AS product_id,
    p.sku,
    p.name                      AS product_name,
    cat.name                    AS category_name,
    sup.name                    AS supplier_name,
    p.unit_price,
    COALESCE(inv.quantity_on_hand, 0) AS stock_qty,
    COUNT(oi.id)                AS times_ordered,
    COALESCE(SUM(oi.quantity), 0)        AS total_units_sold,
    COALESCE(SUM(oi.line_total), 0.00)   AS total_revenue,
    p.is_discontinued
FROM products p
JOIN categories  cat ON cat.id = p.category_id
LEFT JOIN suppliers  sup ON sup.id = p.supplier_id
LEFT JOIN inventory  inv ON inv.product_id = p.id
LEFT JOIN order_items oi ON oi.product_id  = p.id
GROUP BY p.id, p.sku, p.name, cat.name, sup.name, p.unit_price,
         inv.quantity_on_hand, p.is_discontinued;

-- VIEW 3: employee_department_summary
CREATE OR REPLACE VIEW employee_department_summary AS
SELECT
    d.id                        AS department_id,
    d.name                      AS department_name,
    d.location,
    d.budget,
    COUNT(e.id)                 AS headcount,
    COUNT(CASE WHEN e.is_active THEN 1 END) AS active_employees,
    ROUND(AVG(e.salary), 2)     AS avg_salary,
    MIN(e.salary)               AS min_salary,
    MAX(e.salary)               AS max_salary,
    SUM(e.salary)               AS total_payroll,
    MIN(e.hire_date)            AS earliest_hire
FROM departments d
LEFT JOIN employees e ON e.department_id = d.id
GROUP BY d.id, d.name, d.location, d.budget;

-- VIEW 4: monthly_revenue_summary
CREATE OR REPLACE VIEW monthly_revenue_summary AS
SELECT
    DATE_TRUNC('month', o.ordered_at)         AS revenue_month,
    COUNT(DISTINCT o.id)                       AS order_count,
    COUNT(DISTINCT o.customer_id)              AS unique_customers,
    SUM(o.total_amount)                        AS gross_revenue,
    SUM(o.discount_amount)                     AS total_discounts,
    SUM(o.total_amount - o.discount_amount)    AS net_revenue,
    AVG(o.total_amount)                        AS avg_order_value,
    SUM(CASE WHEN o.status = 'COMPLETED' THEN o.total_amount ELSE 0 END) AS completed_revenue,
    SUM(CASE WHEN o.status = 'CANCELLED' THEN o.total_amount ELSE 0 END) AS cancelled_revenue
FROM orders o
GROUP BY DATE_TRUNC('month', o.ordered_at)
ORDER BY revenue_month DESC;

\echo '>>> Views created.'

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- FUNCTION 1: calculate_order_total
-- Returns the computed total for an order by summing its line items.
CREATE OR REPLACE FUNCTION calculate_order_total(p_order_id INT)
RETURNS NUMERIC(14,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_total NUMERIC(14,2);
BEGIN
    SELECT COALESCE(SUM(line_total), 0.00)
    INTO   v_total
    FROM   order_items
    WHERE  order_id = p_order_id;

    RETURN v_total;
END;
$$;

-- FUNCTION 2: calculate_customer_lifetime_value
-- Returns the total amount paid across all COMPLETED orders for a customer.
CREATE OR REPLACE FUNCTION calculate_customer_lifetime_value(p_customer_id INT)
RETURNS NUMERIC(14,2)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_clv NUMERIC(14,2);
BEGIN
    SELECT COALESCE(SUM(o.total_amount - o.discount_amount), 0.00)
    INTO   v_clv
    FROM   orders o
    WHERE  o.customer_id = p_customer_id
      AND  o.status       = 'COMPLETED';

    RETURN v_clv;
END;
$$;

-- FUNCTION 3: get_product_stock_status
-- Returns a text label: 'OUT_OF_STOCK', 'LOW', 'OK', or 'HIGH'.
CREATE OR REPLACE FUNCTION get_product_stock_status(p_product_id INT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_qty    INT;
    v_reord  INT;
BEGIN
    SELECT quantity_on_hand, reorder_level
    INTO   v_qty, v_reord
    FROM   inventory
    WHERE  product_id = p_product_id;

    IF NOT FOUND THEN
        RETURN 'NOT_TRACKED';
    END IF;

    RETURN CASE
        WHEN v_qty  = 0                  THEN 'OUT_OF_STOCK'
        WHEN v_qty  < v_reord            THEN 'LOW'
        WHEN v_qty <= v_reord * 3        THEN 'OK'
        ELSE                                  'HIGH'
    END;
END;
$$;

-- Example calls:
-- SELECT calculate_order_total(1);
-- SELECT calculate_customer_lifetime_value(42);
-- SELECT get_product_stock_status(5);

\echo '>>> Functions created.'

-- =============================================================================
-- TRIGGER FUNCTIONS AND TRIGGERS
-- =============================================================================

-- ─── Trigger 1: Maintain updated_at on all main tables ─────────────────────

CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['departments','employees','suppliers','products',
                             'inventory','customers','orders'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'trg_' || t || '_updated_at'
        ) THEN
            EXECUTE format(
                'CREATE TRIGGER trg_%I_updated_at
                 BEFORE UPDATE ON %I
                 FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at()',
                t, t
            );
        END IF;
    END LOOP;
END;
$$;

-- ─── Trigger 2: Deduct inventory when order_items are inserted ─────────────
--  (Only reduces stock; never goes below 0.)

CREATE OR REPLACE FUNCTION trg_deduct_inventory_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE inventory
    SET    quantity_on_hand = GREATEST(0, quantity_on_hand - NEW.quantity),
           updated_at       = CURRENT_TIMESTAMP
    WHERE  product_id = NEW.product_id;

    RETURN NEW;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_order_items_deduct_inventory'
    ) THEN
        CREATE TRIGGER trg_order_items_deduct_inventory
        AFTER INSERT ON order_items
        FOR EACH ROW EXECUTE FUNCTION trg_deduct_inventory_on_order();
    END IF;
END;
$$;

-- ─── Trigger 3: Audit log for orders table ────────────────────────────────

CREATE OR REPLACE FUNCTION trg_audit_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
        VALUES ('orders', NEW.id, 'INSERT', to_jsonb(NEW), current_user);

    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
        VALUES ('orders', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), current_user);

    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_data, changed_by)
        VALUES ('orders', OLD.id, 'DELETE', to_jsonb(OLD), current_user);
    END IF;

    RETURN NULL;   -- AFTER trigger: return value is ignored
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_audit'
    ) THEN
        CREATE TRIGGER trg_orders_audit
        AFTER INSERT OR UPDATE OR DELETE ON orders
        FOR EACH ROW EXECUTE FUNCTION trg_audit_orders();
    END IF;
END;
$$;

-- ─── Trigger 4: Keep customers.total_spend in sync with completed orders ──

CREATE OR REPLACE FUNCTION trg_sync_customer_spend()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_customer_id INT;
BEGIN
    -- Determine affected customer from either new or old row
    v_customer_id := COALESCE(NEW.customer_id, OLD.customer_id);

    UPDATE customers
    SET    total_spend = COALESCE((
               SELECT SUM(total_amount - discount_amount)
               FROM   orders
               WHERE  customer_id = v_customer_id
                 AND  status      = 'COMPLETED'
           ), 0.00),
           updated_at  = CURRENT_TIMESTAMP
    WHERE  id = v_customer_id;

    RETURN NULL;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_orders_sync_customer_spend'
    ) THEN
        CREATE TRIGGER trg_orders_sync_customer_spend
        AFTER INSERT OR UPDATE OR DELETE ON orders
        FOR EACH ROW EXECUTE FUNCTION trg_sync_customer_spend();
    END IF;
END;
$$;

\echo '>>> Triggers created.'

-- =============================================================================
-- STORED PROCEDURES
-- =============================================================================

-- PROCEDURE 1: process_order
-- Creates an order plus its line items in a single atomic transaction.
-- Deducts inventory and records a payment on success.
--
-- Usage:
--   CALL process_order(
--     p_customer_id   => 1,
--     p_product_ids   => ARRAY[1,3,5],
--     p_quantities    => ARRAY[2,1,3],
--     p_payment_method => 'CREDIT_CARD'
--   );
CREATE OR REPLACE PROCEDURE process_order(
    p_customer_id    INT,
    p_product_ids    INT[],
    p_quantities     INT[],
    p_payment_method VARCHAR(40) DEFAULT 'CREDIT_CARD'
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_order_id      INT;
    v_order_number  TEXT;
    v_total         NUMERIC(14,2) := 0;
    v_unit_price    NUMERIC(12,2);
    v_line_total    NUMERIC(14,2);
    i               INT;
BEGIN
    -- Validate array lengths match
    IF array_length(p_product_ids, 1) <> array_length(p_quantities, 1) THEN
        RAISE EXCEPTION 'product_ids and quantities arrays must have the same length';
    END IF;

    -- Generate unique order number
    v_order_number := 'ORD-PROC-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS')
                      || '-' || floor(random() * 9000 + 1000)::INT;

    -- Create order header (will be updated with final total)
    INSERT INTO orders (customer_id, order_number, status, total_amount, shipping_country)
    VALUES (p_customer_id, v_order_number, 'PROCESSING', 0, 'United States')
    RETURNING id INTO v_order_id;

    -- Insert line items
    FOR i IN 1 .. array_length(p_product_ids, 1) LOOP
        SELECT unit_price INTO v_unit_price
        FROM   products
        WHERE  id = p_product_ids[i];

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product ID % not found', p_product_ids[i];
        END IF;

        v_line_total := v_unit_price * p_quantities[i];
        v_total      := v_total + v_line_total;

        INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
        VALUES (v_order_id, p_product_ids[i], p_quantities[i], v_unit_price, v_line_total);
    END LOOP;

    -- Update order total and mark completed
    UPDATE orders
    SET    total_amount = v_total,
           status       = 'COMPLETED',
           delivered_at = CURRENT_TIMESTAMP + INTERVAL '3 days'
    WHERE  id = v_order_id;

    -- Record payment
    INSERT INTO payments (order_id, payment_method, amount, status, transaction_ref)
    VALUES (
        v_order_id,
        p_payment_method,
        v_total,
        'SUCCESS',
        'TXN-PROC-' || md5(v_order_id::TEXT || v_order_number)
    );

    RAISE NOTICE 'Order % created (ID=%) for customer %. Total: $%',
        v_order_number, v_order_id, p_customer_id, v_total;
END;
$$;

-- PROCEDURE 2: refresh_inventory_status
-- Recalculates inventory from all order_items and updates quantity_on_hand.
-- Run periodically or after bulk imports to reconcile stock.
--
-- Usage: CALL refresh_inventory_status();
CREATE OR REPLACE PROCEDURE refresh_inventory_status()
LANGUAGE plpgsql
AS $$
DECLARE
    v_updated INT;
BEGIN
    -- Set each product's quantity to initial stock minus all units ever ordered
    -- (This is a simplification; production would compare receipts vs. shipments)
    WITH units_sold AS (
        SELECT product_id, SUM(quantity)::INT AS sold
        FROM   order_items oi
        JOIN   orders o ON o.id = oi.order_id
        WHERE  o.status IN ('COMPLETED','SHIPPED','PROCESSING')
        GROUP  BY product_id
    )
    UPDATE inventory inv
    SET    quantity_on_hand = GREATEST(0, (500 + (inv.product_id * 3) % 500) - COALESCE(us.sold, 0)),
           updated_at       = CURRENT_TIMESTAMP
    FROM   units_sold us
    WHERE  inv.product_id = us.product_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RAISE NOTICE 'refresh_inventory_status: updated % inventory rows.', v_updated;
END;
$$;

-- How to call procedures:
-- CALL process_order(1, ARRAY[1,2,3], ARRAY[2,1,1], 'STRIPE');
-- CALL refresh_inventory_status();

-- How to list procedures in psql:
-- \df+ process_order
-- \df+ refresh_inventory_status

\echo '>>> Stored procedures created.'
\echo '>>> SQLSense AI test database import complete!'
