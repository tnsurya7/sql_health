# SQLSense AI — PostgreSQL Test Database Import Guide

This guide walks Windows 10/11 users through setting up the dedicated `sqlsense_test` target database.

---

## 📌 Architecture Note: Two Separate Databases

SQLSense AI uses two completely separate databases:

| Database | Purpose | Managed By |
|---|---|---|
| `sqlsense` | **Application Metadata** (users, auth, saved connections, query history, RAG documents) | Prisma (`npm run setup`) |
| `sqlsense_test` | **Target Benchmark Database** (tables, customers, orders, views, triggers, procedures to analyze) | Imported using `database/sqlsense_test_database.sql` |

> **IMPORTANT**: Never import test tables into the application metadata database (`sqlsense`), and never run Prisma migrations against `sqlsense_test`.

---

## Step 1: Install PostgreSQL on Windows

If PostgreSQL is not yet installed:
1. Download the PostgreSQL Windows installer from the official site:
   [https://www.postgresql.org/download/windows/](https://www.postgresql.org/download/windows/)
2. Run the installer (PostgreSQL 15 or 16 recommended).
3. Choose an installation directory (e.g. `C:\Program Files\PostgreSQL\16`).
4. Note your **super-user password** during setup.
5. Keep the default port `5432`.
6. Add the PostgreSQL `bin` directory to your Windows `PATH` environment variable:
   - `C:\Program Files\PostgreSQL\16\bin`
   - (Or your installed version path)

---

## Step 2: Verify PostgreSQL is Running

Open **PowerShell** and verify that PostgreSQL service is running:

```powershell
Get-Service -Name postgresql*
```

If the status is `Stopped`, start it (as Administrator):
```powershell
Start-Service -Name postgresql*
```
Or open Windows Services (`Win + R`, type `services.msc`), find **postgresql-x64-16**, and click **Start**.

Verify `psql` command-line tool is available:
```powershell
psql --version
```

---

## Step 3: Create the Dedicated `sqlsense_test` Database

Run the following command in PowerShell. Replace `postgres` with your PostgreSQL username if different:

```powershell
psql -U postgres -c "CREATE DATABASE sqlsense_test;"
```
*(Enter your PostgreSQL password when prompted)*

If you already created it previously, PostgreSQL will simply notify you that the database already exists.

---

## Step 4: Import `sqlsense_test_database.sql`

From the root of the `Ai_sql` project directory, run:

```powershell
psql -U postgres -d sqlsense_test -f database/sqlsense_test_database.sql
```

### Alternative: Import Using pgAdmin 4 (GUI)
1. Open **pgAdmin 4** from your Windows Start Menu.
2. In the left browser tree, expand **Servers** > **PostgreSQL 16**.
3. Right-click **Databases** > **Create** > **Database...**, name it `sqlsense_test`, and click **Save**.
4. Right-click `sqlsense_test` > select **Query Tool**.
5. Click the folder icon (**Open File**), navigate to `database/sqlsense_test_database.sql`, and click **Open**.
6. Click the ▶ (**Execute**) button or press `F5`.

---

## Step 5: Verify Database Objects

Run the verification query in PowerShell:

```powershell
psql -U postgres -d sqlsense_test -c "
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
"
```

You should see 11 tables and 4 views:
- **Tables**: `audit_logs`, `categories`, `customers`, `departments`, `employees`, `inventory`, `order_items`, `orders`, `payments`, `products`, `suppliers`
- **Views**: `customer_order_summary`, `employee_department_summary`, `monthly_revenue_summary`, `product_sales_summary`

Verify Functions and Procedures:
```powershell
psql -U postgres -d sqlsense_test -c "\df"
```
Functions: `calculate_order_total`, `calculate_customer_lifetime_value`, `get_product_stock_status`, `trg_*`  
Procedures: `process_order`, `refresh_inventory_status`

---

## Step 6: Connect SQLSense AI to the Target Database

1. Start SQLSense AI:
   ```powershell
   npm run dev
   ```
2. Open your browser at [http://localhost:5173](http://localhost:5173).
3. Log in with:
   - **Email**: `admin@localhost`
   - **Password**: `admin`
4. In the navigation bar, go to **Database Connections** (or **Settings**).
5. Click **Add Connection** and configure:
   - **Connection Name**: `Local Test DB`
   - **Database Type**: `PostgreSQL`
   - **Host**: `localhost`
   - **Port**: `5432`
   - **Database Name**: `sqlsense_test`
   - **Username**: `postgres` (or your customized username)
   - **Password**: *(your PostgreSQL password)*
   - **SSL**: `Disabled`
6. Click **Test Connection**. Once verified, click **Save Connection**.

---

## Step 7: Explore Features with Test Queries

Open `database/sqlsense_test_queries.sql` in your favorite editor (VS Code, Notepad++, etc.).

1. **SQL Analyzer & Query Optimizer**:
   - Navigate to **SQL Analyzer** in the SQLSense AI UI.
   - Copy queries from Section 1 (Anti-patterns like `SELECT *` or non-sargable `LIKE`), Section 2 (Multi-table joins), or Section 5 (Window functions / CTEs).
   - Click **Analyze** to inspect deterministic AST rules, anti-patterns, and dynamic programming join trees.
   - Click **Optimize** to generate AI-assisted candidates and examine side-by-side cost comparisons.

2. **Index Advisor**:
   - Navigate to **Index Advisor**.
   - Test queries filtering on `customers.loyalty_tier` or composite predicates to inspect B-Tree index recommendations and selectivity estimations.

3. **Schema Explorer**:
   - Navigate to **Schema Explorer**.
   - Browse the tables, column data types, foreign key relationships, and indexes generated by the seed schema.

4. **Views, Stored Procedures, Functions & Triggers**:
   - Use the dedicated sidebar sections (**Views**, **Stored Procedures**, **Functions**, **Triggers**) to inspect the schema definitions, parameter types, and source definitions introspected directly from `sqlsense_test`.

---

## Step 8: Safe Testing of Triggers and Procedures

To safely test procedures and triggers without making permanent changes to your test dataset, execute them inside a rollback transaction block:

```sql
BEGIN;
  CALL process_order(
    p_customer_id    => 1,
    p_product_ids    => ARRAY[1, 2, 3],
    p_quantities     => ARRAY[2, 1, 1],
    p_payment_method => 'CREDIT_CARD'
  );
  SELECT order_number, status, total_amount FROM orders ORDER BY id DESC LIMIT 1;
ROLLBACK;
```

---

## ⚠️ Destructive Queries (For Static Analysis Only)

Section 14 of `database/sqlsense_test_queries.sql` contains queries with `UPDATE` without `WHERE`, `DELETE` without `WHERE`, `TRUNCATE`, and `DROP TABLE`.
- **Do NOT execute these statements directly against the database.**
- Paste them into the SQLSense AI Analyzer to observe how the platform's deterministic safety checks catch unconstrained DML statements and warn of destructive operations.
