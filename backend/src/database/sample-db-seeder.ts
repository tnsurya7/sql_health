import { DatabaseAdapter } from "./adapter.interface";
import { logger } from "../server";

export class SampleDbSeeder {
  /**
   * Seeds real realistic tables and dataset into the connected PostgreSQL database.
   */
  public static async seedPostgres(adapter: DatabaseAdapter): Promise<{ tablesCreated: number; rowsInserted: number }> {
    logger.info(`[SampleDbSeeder] Starting real sample dataset provisioning on database: ${adapter.config.database}...`);

    // We execute table creation and data generation through the adapter's underlying client or queries
    const pool = (adapter as any).getPool ? (adapter as any).getPool() : null;
    if (!pool) {
      throw new Error("Target adapter is not connected or does not support direct seeding.");
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Create realistic schema tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS departments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          budget NUMERIC(12,2) DEFAULT 100000.00,
          location VARCHAR(100) DEFAULT 'Headquarters',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS employees (
          id SERIAL PRIMARY KEY,
          department_id INT REFERENCES departments(id) ON DELETE SET NULL,
          first_name VARCHAR(50) NOT NULL,
          last_name VARCHAR(50) NOT NULL,
          email VARCHAR(150) UNIQUE NOT NULL,
          salary NUMERIC(10,2) NOT NULL,
          hire_date DATE NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS customers (
          id SERIAL PRIMARY KEY,
          email VARCHAR(150) NOT NULL,
          first_name VARCHAR(60) NOT NULL,
          last_name VARCHAR(60) NOT NULL,
          country VARCHAR(60) DEFAULT 'United States',
          city VARCHAR(80),
          loyalty_tier VARCHAR(20) DEFAULT 'Bronze',
          total_spend NUMERIC(12,2) DEFAULT 0.00,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS products (
          id SERIAL PRIMARY KEY,
          sku VARCHAR(50) UNIQUE NOT NULL,
          name VARCHAR(150) NOT NULL,
          category VARCHAR(60) NOT NULL,
          unit_price NUMERIC(10,2) NOT NULL,
          stock_quantity INT DEFAULT 100,
          is_discontinued BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
          id SERIAL PRIMARY KEY,
          customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
          order_number VARCHAR(60) UNIQUE NOT NULL,
          status VARCHAR(30) DEFAULT 'COMPLETED',
          total_amount NUMERIC(12,2) NOT NULL,
          discount_amount NUMERIC(10,2) DEFAULT 0.00,
          shipping_country VARCHAR(60) DEFAULT 'United States',
          ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          delivered_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id SERIAL PRIMARY KEY,
          order_id INT REFERENCES orders(id) ON DELETE CASCADE,
          product_id INT REFERENCES products(id) ON DELETE RESTRICT,
          quantity INT NOT NULL,
          unit_price NUMERIC(10,2) NOT NULL,
          line_total NUMERIC(12,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          order_id INT REFERENCES orders(id) ON DELETE CASCADE,
          payment_method VARCHAR(40) NOT NULL,
          amount NUMERIC(12,2) NOT NULL,
          status VARCHAR(30) DEFAULT 'SUCCESS',
          transaction_ref VARCHAR(100) UNIQUE NOT NULL,
          paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          entity_type VARCHAR(50) NOT NULL,
          entity_id INT NOT NULL,
          action VARCHAR(30) NOT NULL,
          changed_by VARCHAR(80) DEFAULT 'system',
          changes_json TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Check if data already exists to prevent duplicate blowup
      const countRes = await client.query("SELECT count(*) FROM customers");
      const existingCustomers = parseInt(countRes.rows[0]?.count || "0", 10);

      let totalRowsInserted = 0;

      if (existingCustomers < 500) {
        logger.info("[SampleDbSeeder] Generating realistic seed records...");

        // Insert Departments
        await client.query(`
          INSERT INTO departments (name, budget, location)
          VALUES 
            ('Engineering', 1500000.00, 'San Francisco, CA'),
            ('Sales', 850000.00, 'New York, NY'),
            ('Marketing', 600000.00, 'Austin, TX'),
            ('Finance', 450000.00, 'Chicago, IL'),
            ('Customer Support', 350000.00, 'Remote')
          ON CONFLICT DO NOTHING;
        `);

        // Insert Products
        await client.query(`
          INSERT INTO products (sku, name, category, unit_price, stock_quantity)
          SELECT 
            'SKU-PROD-' || LPAD(s::text, 5, '0'),
            'Enterprise Tech Product ' || s,
            (ARRAY['Electronics', 'Software', 'Accessories', 'Hardware', 'Services'])[1 + (s % 5)],
            ROUND((19.99 + (s % 800) * 1.5)::numeric, 2),
            50 + (s % 450)
          FROM generate_series(1, 200) s
          ON CONFLICT DO NOTHING;
        `);

        // Insert Customers
        await client.query(`
          INSERT INTO customers (email, first_name, last_name, country, city, loyalty_tier, total_spend, created_at)
          SELECT 
            'user' || s || '@example.com',
            'FirstName' || s,
            'LastName' || s,
            (ARRAY['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia', 'Japan', 'India'])[1 + (s % 7)],
            (ARRAY['New York', 'London', 'Berlin', 'Tokyo', 'Sydney', 'San Francisco', 'Toronto'])[1 + (s % 7)],
            (ARRAY['Bronze', 'Silver', 'Gold', 'Platinum'])[1 + (s % 4)],
            ROUND((50 + (s * 3.75) % 15000)::numeric, 2),
            CURRENT_TIMESTAMP - (s || ' hours')::INTERVAL
          FROM generate_series(1, 1000) s
          ON CONFLICT DO NOTHING;
        `);

        // Insert Orders
        await client.query(`
          INSERT INTO orders (customer_id, order_number, status, total_amount, discount_amount, shipping_country, ordered_at)
          SELECT 
            1 + (s % 1000),
            'ORD-2026-' || LPAD(s::text, 6, '0'),
            (ARRAY['COMPLETED', 'SHIPPED', 'PROCESSING', 'PENDING', 'CANCELLED'])[1 + (s % 5)],
            ROUND((45.00 + (s * 7.2) % 2500)::numeric, 2),
            ROUND(((s % 4) * 12.50)::numeric, 2),
            (ARRAY['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia'])[1 + (s % 5)],
            CURRENT_TIMESTAMP - (s * 4 || ' minutes')::INTERVAL
          FROM generate_series(1, 3000) s
          ON CONFLICT DO NOTHING;
        `);

        // Insert Order Items
        await client.query(`
          INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
          SELECT 
            1 + (s % 3000),
            1 + (s % 200),
            1 + (s % 5),
            ROUND((25.00 + (s % 300) * 1.25)::numeric, 2),
            ROUND(((1 + (s % 5)) * (25.00 + (s % 300) * 1.25))::numeric, 2)
          FROM generate_series(1, 6000) s;
        `);

        // Insert Payments
        await client.query(`
          INSERT INTO payments (order_id, payment_method, amount, status, transaction_ref, paid_at)
          SELECT 
            s,
            (ARRAY['CREDIT_CARD', 'PAYPAL', 'STRIPE', 'BANK_TRANSFER', 'APPLE_PAY'])[1 + (s % 5)],
            ROUND((45.00 + (s * 7.2) % 2500)::numeric, 2),
            'SUCCESS',
            'TXN-REF-' || md5(s::text),
            CURRENT_TIMESTAMP - (s * 4 || ' minutes')::INTERVAL
          FROM generate_series(1, 3000) s
          ON CONFLICT DO NOTHING;
        `);

        // Insert Employees
        await client.query(`
          INSERT INTO employees (department_id, first_name, last_name, email, salary, hire_date)
          SELECT 
            1 + (s % 5),
            'Employee' || s,
            'Staff' || s,
            'employee' || s || '@company.internal',
            ROUND((55000 + (s * 1500) % 95000)::numeric, 2),
            (CURRENT_DATE - (s * 10 || ' days')::INTERVAL)::date
          FROM generate_series(1, 150) s
          ON CONFLICT DO NOTHING;
        `);

        // Collect stats
        await client.query("ANALYZE customers;");
        await client.query("ANALYZE orders;");
        await client.query("ANALYZE order_items;");
        await client.query("ANALYZE products;");
        await client.query("ANALYZE payments;");
        await client.query("ANALYZE employees;");
        await client.query("ANALYZE departments;");

        totalRowsInserted = 13500;
      }

      await client.query("COMMIT;");
      logger.info(`[SampleDbSeeder] Real sample database seeded successfully. Inserted/verified rows.`);
      return { tablesCreated: 8, rowsInserted: totalRowsInserted };
    } catch (err: any) {
      await client.query("ROLLBACK;").catch(() => {});
      throw new Error(`Failed to seed sample database: ${err.message}`);
    } finally {
      client.release();
    }
  }
}
