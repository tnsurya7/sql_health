import { Pool } from "pg";
import { logger } from "../../server";

export class DemoDbService {
  public static async initializeDemoDb(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
      logger.info("Initializing demo schema tables...");
      
      // 1. Drop existing tables if any
      await client.query(`
        DROP TABLE IF EXISTS payments CASCADE;
        DROP TABLE IF EXISTS order_items CASCADE;
        DROP TABLE IF EXISTS orders CASCADE;
        DROP TABLE IF EXISTS products CASCADE;
        DROP TABLE IF EXISTS customers CASCADE;
        DROP TABLE IF EXISTS employees CASCADE;
        DROP TABLE IF EXISTS departments CASCADE;
        DROP TABLE IF EXISTS demo_users CASCADE;
        DROP TABLE IF EXISTS demo_audit_logs CASCADE;
      `);

      // 2. Create tables
      await client.query(`
        CREATE TABLE departments (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          budget NUMERIC(12,2)
        );

        CREATE TABLE employees (
          id SERIAL PRIMARY KEY,
          department_id INT REFERENCES departments(id),
          first_name VARCHAR(50) NOT NULL,
          last_name VARCHAR(50) NOT NULL,
          email VARCHAR(100) UNIQUE,
          salary NUMERIC(10,2),
          hire_date DATE NOT NULL
        );

        CREATE TABLE customers (
          id SERIAL PRIMARY KEY,
          first_name VARCHAR(50) NOT NULL,
          last_name VARCHAR(50) NOT NULL,
          email VARCHAR(100) UNIQUE,
          phone VARCHAR(20),
          city VARCHAR(50),
          country VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          category VARCHAR(50),
          price NUMERIC(10,2) NOT NULL,
          stock INT NOT NULL
        );

        CREATE TABLE orders (
          id SERIAL PRIMARY KEY,
          customer_id INT, -- Intentionally no FOREIGN KEY constraint in some configurations to test rule engine, or references customers(id)
          status VARCHAR(20) NOT NULL,
          total_amount NUMERIC(10,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE order_items (
          id SERIAL PRIMARY KEY,
          order_id INT,
          product_id INT,
          quantity INT NOT NULL,
          unit_price NUMERIC(10,2) NOT NULL
        );

        CREATE TABLE payments (
          id SERIAL PRIMARY KEY,
          order_id INT,
          amount NUMERIC(10,2) NOT NULL,
          payment_method VARCHAR(50),
          status VARCHAR(20),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE demo_users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) NOT NULL UNIQUE,
          password_hash VARCHAR(100) NOT NULL,
          role VARCHAR(20) NOT NULL,
          last_login TIMESTAMP
        );

        CREATE TABLE demo_audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INT,
          action VARCHAR(100) NOT NULL,
          details TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      logger.info("Demo tables created. Seeding data...");

      // 3. Seed Departments & Products
      await client.query(`
        INSERT INTO departments (name, budget) VALUES 
        ('Engineering', 5000000.00),
        ('Sales', 3000000.00),
        ('Marketing', 1500000.00),
        ('Human Resources', 800000.00),
        ('Finance', 2000000.00);

        INSERT INTO products (name, category, price, stock) VALUES
        ('Laptop Pro 16', 'Electronics', 1999.99, 100),
        ('Smartphone X', 'Electronics', 999.99, 250),
        ('Wireless Earbuds', 'Electronics', 149.99, 500),
        ('Office Chair', 'Furniture', 299.99, 75),
        ('Desk Lamp', 'Furniture', 49.99, 150),
        ('Coffee Mug', 'Kitchen', 12.99, 1000),
        ('Notebook A5', 'Stationery', 4.99, 2000);
      `);

      // 4. Seed Employees
      await client.query(`
        INSERT INTO employees (department_id, first_name, last_name, email, salary, hire_date) VALUES
        (1, 'Alice', 'Smith', 'alice.smith@example.com', 120000.00, '2020-01-15'),
        (1, 'Bob', 'Jones', 'bob.jones@example.com', 95000.00, '2021-03-22'),
        (2, 'Charlie', 'Brown', 'charlie.brown@example.com', 75000.00, '2019-06-10'),
        (3, 'Diana', 'Prince', 'diana.prince@example.com', 85000.00, '2022-08-01'),
        (5, 'Evan', 'Wright', 'evan.wright@example.com', 110000.00, '2018-11-15');
      `);

      // 5. Seed Customers (Bulk loop to generate 1,000 customers for fast loading but realistic volume)
      // Note: Seed sizes in production could be 10k, 50k, 100k, but to prevent timeout and make it extremely fast locally,
      // we generate 1,000 customers, 2,000 orders, and 5,000 order items. This is perfectly sufficient to demonstrate indexes
      // and sequential scan performance differences on local postgres without blocking development.
      logger.info("Seeding 1000 customers...");
      const customerBatch: string[] = [];
      const cities = ["New York", "London", "Paris", "Tokyo", "Berlin", "San Francisco", "Sydney", "Mumbai"];
      const countries = ["USA", "UK", "France", "Japan", "Germany", "USA", "Australia", "India"];
      
      for (let i = 1; i <= 1000; i++) {
        const cityIdx = i % cities.length;
        customerBatch.push(`('First${i}', 'Last${i}', 'cust${i}@example.com', '555-01${i}', '${cities[cityIdx]}', '${countries[cityIdx]}')`);
      }

      await client.query(`
        INSERT INTO customers (first_name, last_name, email, phone, city, country)
        VALUES ${customerBatch.join(",")};
      `);

      // 6. Seed Orders (2,000 orders)
      logger.info("Seeding 2000 orders...");
      const orderBatch: string[] = [];
      const statuses = ["COMPLETED", "PENDING", "SHIPPED", "CANCELLED"];
      for (let i = 1; i <= 2000; i++) {
        const custId = (i % 1000) + 1;
        const status = statuses[i % statuses.length];
        const amount = ((i * 17) % 500) + 15.99;
        orderBatch.push(`(${custId}, '${status}', ${amount}, NOW() - INTERVAL '${i % 30} days')`);
      }
      await client.query(`
        INSERT INTO orders (customer_id, status, total_amount, created_at)
        VALUES ${orderBatch.join(",")};
      `);

      // 7. Seed Order Items (5,000 order items)
      logger.info("Seeding 5000 order items...");
      const itemBatch: string[] = [];
      for (let i = 1; i <= 5000; i++) {
        const orderId = (i % 2000) + 1;
        const prodId = (i % 7) + 1;
        const qty = (i % 5) + 1;
        const price = (prodId * 15) + 9.99;
        itemBatch.push(`(${orderId}, ${prodId}, ${qty}, ${price})`);
      }
      await client.query(`
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES ${itemBatch.join(",")};
      `);

      // 8. Seed Payments (2,000 payments)
      logger.info("Seeding 2000 payments...");
      const paymentBatch: string[] = [];
      const paymentMethods = ["Credit Card", "PayPal", "Bank Transfer", "Stripe"];
      for (let i = 1; i <= 2000; i++) {
        const orderId = i;
        const amount = ((i * 17) % 500) + 15.99;
        const method = paymentMethods[i % paymentMethods.length];
        const status = i % 10 === 0 ? "FAILED" : "SUCCESS";
        paymentBatch.push(`(${orderId}, ${amount}, '${method}', '${status}')`);
      }
      await client.query(`
        INSERT INTO payments (order_id, amount, payment_method, status)
        VALUES ${paymentBatch.join(",")};
      `);

      logger.info("Demo database seeded successfully.");
    } finally {
      client.release();
    }
  }
}
