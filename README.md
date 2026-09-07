# SQLSense AI - Database Performance & Optimization Platform

SQLSense AI is an intelligent SQL observability, query optimization, and performance analysis platform powered by Gemini AI and automated rule engines.

---

## 🚀 Features

- **Query Performance & Observability**: Real-time insights into SQL latency, throughput, and slow queries.
- **AI-Powered Query Optimization**: Automated SQL refactoring and index recommendations with Gemini AI.
- **Visual Execution Plan**: Interactive explain plan trees and cost analysis.
- **Schema & Index Analyzer**: Database schema introspection, index health, and anti-pattern detection.
- **Stored Procedures & Views Audit**: Static analysis and performance optimization for database objects.
- **Security & Vulnerability Detection**: Detection of SQL injection patterns, missing clauses, and Cartesian joins.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Vite, Lucide Icons, ECharts
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL (`pg`)
- **AI Engine**: Google Gemini API (`@google/generative-ai`)

---

## 📋 Prerequisites & Installation Guide

Before running the project, you must have **Node.js** and **PostgreSQL** installed and running on your system.

### 1. Install Node.js (v18 or higher)
- **Windows**:
  - Download and run the installer from [nodejs.org](https://nodejs.org/) (LTS recommended)
  - Or install via Windows Terminal (winget):
    ```powershell
    winget install OpenJS.NodeJS.LTS
    ```
- **macOS**:
  - Download from [nodejs.org](https://nodejs.org/) or install via Homebrew:
    ```bash
    brew install node
    ```
- **Linux (Ubuntu/Debian)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

Verify installation:
```bash
node -v
npm -v
```

---

### 2. Install & Start PostgreSQL Database

#### 🪟 On Windows:
1. Download PostgreSQL from [EnterpriseDB PostgreSQL Installer](https://www.enterprisedb.com/downloads/postgres-postgresql-downloads).
2. Run the installer and remember the password you choose for the `postgres` superuser (e.g. `postgres` or `admin`).
3. Ensure the PostgreSQL service is running:
   - Press <kbd>Win</kbd> + <kbd>R</kbd>, type `services.msc`, and press **Enter**.
   - Look for `postgresql-x64-XX` and ensure the Status is **Running**.
4. Open **pgAdmin** or **SQL Shell (psql)** and create the database:
   ```sql
   CREATE DATABASE sqlsense;
   ```

#### 🍎 On macOS:
1. Install and start PostgreSQL via Homebrew:
   ```bash
   brew install postgresql@15
   brew services start postgresql@15
   ```
2. Create the database:
   ```bash
   createdb sqlsense
   ```

#### 🐧 On Linux (Ubuntu/Debian):
1. Install PostgreSQL:
   ```bash
   sudo apt update
   sudo apt install postgresql postgresql-contrib
   sudo systemctl start postgresql
   sudo systemctl enable postgresql
   ```
2. Create the database:
   ```bash
   sudo -u postgres createdb sqlsense
   ```

---

## ⚙️ Environment Configuration

Copy the example environment file into `.env`:

### On Windows (PowerShell):
```powershell
Copy-Item .env.example .env
```

### On macOS / Linux:
```bash
cp .env.example .env
```

Open the `.env` file in the root folder and configure:
```env
NODE_ENV=development
BACKEND_PORT=5001
FRONTEND_PORT=5173
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/sqlsense
JWT_SECRET=change_this_secret_key_12345
GEMINI_API_KEY=your_gemini_api_key_here
AI_PROVIDER=gemini
DEMO_MODE=true
```

> **Note**: If you don't have a Gemini API key yet, leave `DEMO_MODE=true`. It allows full access to all analysis, benchmark, and demo features.

---

## 🚀 Step-by-Step Setup & Run Guide

### Step 1: Install Dependencies
Run from the root directory:
```bash
npm install
```

### Step 2: Push Database Schema & Generate Prisma Client
Synchronize the PostgreSQL tables:

```bash
# Push schema to PostgreSQL and generate Prisma client
npm run db:push
npm run db:generate
```

### Step 3: Seed Default Admin User
```bash
npm run db:seed
```

### Step 4: Start the Application (Frontend + Backend)
Start both servers concurrently with a single command:

```bash
npm run dev
```

---

## 🌐 Accessing the Application

Once the development server is running:

- 💻 **Frontend UI**: [http://localhost:5173](http://localhost:5173)
- 🔌 **Backend Health Check**: [http://localhost:5001/api/health](http://localhost:5001/api/health)

---

## 🔑 Demo Login Credentials

You can sign in immediately using the pre-configured Demo Account:

| Field | Value |
| :--- | :--- |
| **Email** | `admin@localhost` |
| **Password** | `admin` |

*(You can also register a new account on the login page anytime)*

---

## 🛠️ Alternative: Running Backend and Frontend in Separate Terminals

If you prefer running services in separate windows for debugging:

### Terminal 1 - Backend:
```bash
# Windows (PowerShell/CMD) or macOS/Linux:
cd backend
npm run dev
```
*(Backend runs on `http://localhost:5001`)*

### Terminal 2 - Frontend:
```bash
# Windows (PowerShell/CMD) or macOS/Linux:
cd frontend
npm run dev
```
*(Frontend runs on `http://localhost:5173`)*

---

## 🔍 Troubleshooting & FAQs

### 1. `Failed to connect to database` or `Prisma migrate failed`
- **Cause**: PostgreSQL service is not running or the password in `.env` is incorrect.
- **Fix**:
  - **Windows**: Check `services.msc` to make sure `postgresql` service is **Running**.
  - **macOS**: Run `brew services restart postgresql`.
  - **Password**: Verify `DATABASE_URL` in `.env` matches your postgres user and password.
  - Run `npm run db:push` instead of `db:migrate` for initial schema synchronization.

### 2. `Cannot connect to backend server / Unexpected token '<'`
- **Cause**: Frontend is running, but backend server is stopped.
- **Fix**: Open [http://localhost:5001/api/health](http://localhost:5001/api/health). If unreachable, start the backend in a separate terminal:
  ```bash
  cd backend
  npm run dev
  ```
  and check the error printed on startup.

### 3. Port 5001 or 5173 Already in Use
- **Windows**:
  ```powershell
  netstat -ano | findstr :5001
  taskkill /PID <PID_NUMBER> /F
  ```
- **macOS/Linux**:
  ```bash
  lsof -ti:5001 | xargs kill -9
  ```

---

## 🔒 Security

Sensitive environment variables and database credentials are parameterized via environment variables (`.env`). Never commit your `.env` file to version control.
