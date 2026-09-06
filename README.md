# SQLSense AI - Database Performance & Optimization Platform

SQLSense AI is an intelligent SQL observability, query optimization, and performance analysis platform powered by Gemini AI and automated rule engines.

## 🚀 Features

- **Query Performance & Observability**: Real-time insights into SQL latency, throughput, and slow queries.
- **AI-Powered Query Optimization**: Automated SQL refactoring and index recommendations with Gemini AI.
- **Visual Execution Plan**: Interactive explain plan trees and cost analysis.
- **Schema & Index Analyzer**: Database schema introspection, index health, and anti-pattern detection.
- **Stored Procedures & Views Audit**: Static analysis and performance optimization for database objects.
- **Security & Vulnerability Detection**: Detection of SQL injection patterns, missing clauses, and Cartesian joins.

---

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite, Lucide Icons, ECharts
- **Backend**: Node.js, Express, TypeScript, Prisma ORM, PostgreSQL (`pg`)
- **AI Engine**: Google Gemini API (`@google/generative-ai`)

---

## ⚙️ Getting Started

### 1. Prerequisites
- Node.js 18+
- PostgreSQL database
- Gemini API Key (optional, for AI features)

### 2. Setup Environment Variables

Copy the example environment file and fill in your configuration:

```bash
cp .env.example .env
```

Edit `.env` with your database credentials and API key:
```env
NODE_ENV=development
BACKEND_PORT=5001
FRONTEND_PORT=5173
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/<database>
JWT_SECRET=<your-random-jwt-secret>
GEMINI_API_KEY=<your-gemini-api-key>
AI_PROVIDER=gemini
DEMO_MODE=true
```

### 3. Install Dependencies

```bash
npm run install:all
```

### 4. Setup Database & Prisma

```bash
cd backend
npx prisma migrate dev
npx prisma generate
cd ..
```

### 5. Run Development Servers

```bash
npm run dev
```

The application will be accessible at:
- **Frontend**: `http://localhost:5173`
- **Backend API**: `http://localhost:5001`

---

## 🔒 Security

Sensitive environment variables, secrets, and database credentials should never be committed to git. All credentials are parameterized via environment variables (`.env`).
