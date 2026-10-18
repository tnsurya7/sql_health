#!/usr/bin/env node
/**
 * SQLSense AI — One-command setup script
 * Usage: npm run setup  (from repository root)
 */
"use strict";

const { spawnSync } = require("child_process");
const fs   = require("fs");
const path = require("path");
const net  = require("net");
const { Client } = require("pg");

const c = {
  reset : "\x1b[0m", bold: "\x1b[1m",
  red   : "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan : "\x1b[36m",
};
const ok   = (msg) => console.log(`${c.green}OK${c.reset}  ${msg}`);
const warn = (msg) => console.log(`${c.yellow}WARN${c.reset}  ${msg}`);
const fail = (msg) => console.error(`${c.red}FAIL${c.reset}  ${msg}`);
const info = (msg) => console.log(`${c.cyan}INFO${c.reset}  ${msg}`);
const step = (msg) => console.log(`\n${c.bold}${c.cyan}>> ${msg}${c.reset}`);

const ROOT    = path.resolve(__dirname, "..");
const BACKEND = path.join(ROOT, "backend");
const ENV_ROOT = path.join(ROOT, ".env");
const ENV_BACK = path.join(BACKEND, ".env");

function parseDotenv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const vars  = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let   val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

// Keep backend/.env synchronized with root .env
if (fs.existsSync(ENV_ROOT)) {
  fs.copyFileSync(ENV_ROOT, ENV_BACK);
}

const envRoot = parseDotenv(ENV_ROOT);
const envBack = parseDotenv(ENV_BACK);
const envVars = { ...envRoot, ...envBack };
for (const [k, v] of Object.entries(envVars)) {
  if (!process.env[k]) process.env[k] = v;
}
if (!process.env.DATABASE_URL && process.env.APP_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.APP_DATABASE_URL;
}
if (!process.env.APP_DATABASE_URL && process.env.DATABASE_URL) {
  process.env.APP_DATABASE_URL = process.env.DATABASE_URL;
}

step("Checking Node.js version");
const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  fail(`Node.js 18+ required. You have v${process.versions.node}.`);
  info("Download from: https://nodejs.org/en/download/");
  process.exit(1);
}
ok(`Node.js v${process.versions.node}`);

step("Checking environment variables");
const REQUIRED = ["DATABASE_URL","JWT_SECRET","ENCRYPTION_KEY"];
let envOk = true;
for (const key of REQUIRED) {
  const val = process.env[key];
  if (!val || val.includes("your_") || val.includes("username:password")) {
    fail(`Missing or placeholder: ${key}`);
    envOk = false;
  } else {
    ok(`${key} is set`);
  }
}
if (!envOk) {
  console.error(`
${c.red}${c.bold}ACTION REQUIRED - Configure your .env file${c.reset}

  Windows PowerShell:
    Copy-Item .env.example .env
    Copy-Item .env backend\\.env

  Then open .env in Notepad and set:
    DATABASE_URL=postgresql://postgres:YourPassword@localhost:5432/sqlsense
    JWT_SECRET=any_long_random_string_32_chars_minimum
    ENCRYPTION_KEY=64_character_hex_eg_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

  Run: npm run setup
`);
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes("your_")) {
  warn("GEMINI_API_KEY not set - AI features will be limited, but the app will still start.");
}

async function checkPostgres() {
  const url = process.env.DATABASE_URL || "";
  let host = "localhost", port = 5432;
  try {
    const m = url.match(/postgresql:\/\/[^@]*@([^:/]+)(?::(\d+))?/);
    if (m) { host = m[1]; port = m[2] ? parseInt(m[2], 10) : 5432; }
  } catch(_) {}
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(5000);
    s.once("connect", () => { s.destroy(); resolve({ ok: true, host, port }); });
    s.once("error",   (e) => { s.destroy(); resolve({ ok: false, host, port, err: e.message }); });
    s.once("timeout", () => { s.destroy(); resolve({ ok: false, host, port, err: "Timed out" }); });
    s.connect(port, host);
  });
}

function getDbNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, "").split("?")[0];
  } catch (_) {
    const m = url.match(/postgresql:\/\/[^/]+\/([^?]+)/);
    return m ? m[1] : null;
  }
}

async function confirmApplicationDatabase(dbUrl) {
  const dbName = getDbNameFromUrl(dbUrl);
  if (!dbName) {
    fail("Could not determine database name from DATABASE_URL.");
    process.exit(1);
  }

  // Attempt direct connection to intended database
  const directClient = new Client({ connectionString: dbUrl });
  try {
    await directClient.connect();
    await directClient.query("SELECT 1;");
    await directClient.end();
    ok(`Confirmed intended application database: "${dbName}"`);
    return dbName;
  } catch (err) {
    // If database does not exist (PostgreSQL error code 3D000)
    if (err.code === "3D000") {
      info(`Database "${dbName}" does not exist yet. Attempting auto-creation...`);
      // Connect to default 'postgres' database
      const rootUrl = dbUrl.replace(/\/[^/?]+(\?.*)?$/, "/postgres$1");
      const rootClient = new Client({ connectionString: rootUrl });
      try {
        await rootClient.connect();
        await rootClient.query(`CREATE DATABASE "${dbName}";`);
        await rootClient.end();
        ok(`Created application database "${dbName}"`);
        return dbName;
      } catch (createErr) {
        fail(`Could not automatically create database "${dbName}": ${createErr.message}`);
        console.error(`Please create it manually: psql -U postgres -c "CREATE DATABASE ${dbName};"`);
        process.exit(1);
      }
    } else {
      fail(`Failed to connect to database "${dbName}": ${err.message}`);
      process.exit(1);
    }
  }
}

const REQUIRED_TABLES = [
  "User",
  "DatabaseConnection",
  "DatabaseMetadata",
  "TableMetadata",
  "ColumnMetadata",
  "IndexMetadata",
  "SqlQuery",
  "QueryFingerprint",
  "QueryAnalysis",
  "QueryIssue",
  "ExecutionPlan",
  "OptimizationResult",
  "OptimizationRun",
  "OptimizationCandidateRecord",
  "Recommendation",
  "PerformanceMetric",
  "HealthScore",
  "DeadlockLog",
  "OptimizationDocument",
  "OptimizationChunk",
  "QueryHistory",
  "AuditLog",
];

async function verifyDatabaseTables(dbUrl) {
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    const res = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    );
    await client.end();
    const existingTables = new Set(res.rows.map((r) => r.table_name));

    const missing = REQUIRED_TABLES.filter((t) => !existingTables.has(t));
    if (missing.length > 0) {
      fail(`Database verification failed: missing required table(s): ${missing.join(", ")}`);
      process.exit(1);
    }
    ok(`All ${REQUIRED_TABLES.length} required application tables verified successfully`);
  } catch (err) {
    fail(`Failed to verify database tables: ${err.message}`);
    process.exit(1);
  }
}

async function main() {
  step("Checking PostgreSQL connectivity");
  const pg = await checkPostgres();
  if (!pg.ok) {
    fail(`Cannot reach PostgreSQL at ${pg.host}:${pg.port} - ${pg.err}`);
    console.error(`
${c.yellow}How to fix on Windows:${c.reset}
  1. Press Win+R, type services.msc, find "postgresql-x64-XX", click Start.
  2. Or in PowerShell (as Administrator):
       Start-Service -Name postgresql-x64-16
  3. Check DATABASE_URL in .env points to the right host:port.
  4. Ensure the database exists:
       psql -U postgres -c "CREATE DATABASE sqlsense;"
`);
    process.exit(1);
  }
  ok(`PostgreSQL reachable at ${pg.host}:${pg.port}`);

  step("Confirming intended application database");
  await confirmApplicationDatabase(process.env.DATABASE_URL);

  step("Checking backend port availability");
  const backendPort = parseInt(process.env.BACKEND_PORT || process.env.PORT || "5001", 10);
  const portInUse = await new Promise((resolve) => {
    const tester = net.createServer()
      .once("error", (err) => {
        if (err.code === "EADDRINUSE") resolve(true);
        else resolve(false);
      })
      .once("listening", () => {
        tester.close(() => resolve(false));
      })
      .listen(backendPort);
  });
  if (portInUse) {
    warn(`Port ${backendPort} is currently occupied.`);
    console.log(`     Another process or previous instance is using port ${backendPort}.`);
    console.log(`     To inspect on Windows: netstat -ano | findstr :${backendPort}`);
    console.log(`     You can change BACKEND_PORT in .env if needed.`);
  } else {
    ok(`Port ${backendPort} is available`);
  }

  step("Ensuring backend/.env exists and is synchronized");
  if (fs.existsSync(ENV_ROOT)) {
    fs.copyFileSync(ENV_ROOT, ENV_BACK);
    ok("backend/.env synchronized with root .env");
  } else {
    warn("No root .env found.");
  }

  step("Generating Prisma Client");
  const gen = spawnSync("npx", ["prisma","generate","--schema=prisma/schema.prisma"],
    { cwd: BACKEND, stdio: "inherit", shell: true, env: process.env });
  if (gen.status !== 0) { fail("Prisma generate failed."); process.exit(1); }
  ok("Prisma Client generated");

  step("Applying pending database migrations (safe - never resets)");
  info("Using 'prisma migrate deploy' - this never drops or resets your data.");
  const migrate = spawnSync("npx", ["prisma","migrate","deploy","--schema=prisma/schema.prisma"],
    { cwd: BACKEND, stdio: "inherit", shell: true, env: process.env });
  if (migrate.status !== 0) {
    fail("Migration failed.");
    console.error(`
${c.yellow}Common causes:${c.reset}
  - Database does not exist: psql -U postgres -c "CREATE DATABASE sqlsense;"
  - Wrong credentials in DATABASE_URL
  - PostgreSQL not running
`);
    process.exit(1);
  }
  ok("Migrations applied");

  step("Seeding default admin user & RAG knowledge base (idempotent - no duplicates)");
  const seed = spawnSync("npx", ["ts-node","prisma/seed.ts"],
    { cwd: BACKEND, stdio: "inherit", shell: true, env: process.env });
  if (seed.status !== 0) { fail("Seed failed."); process.exit(1); }
  ok("Default admin user & RAG knowledge base ready");

  step("Verifying required application database tables");
  await verifyDatabaseTables(process.env.DATABASE_URL);

  console.log(`
${c.green}${c.bold}===================================================
  SQLSense AI setup completed successfully!
===================================================${c.reset}

  Start the application:

    ${c.bold}npm run dev${c.reset}

  Then open your browser:

    Frontend : ${c.cyan}http://localhost:5173${c.reset}
    API      : ${c.cyan}http://localhost:5001/api/health${c.reset}

  Default login:
    Email   : admin@localhost
    Password: admin

  ${c.yellow}Change the admin password after first login!${c.reset}
`);
}

main().catch((err) => {
  fail("Unexpected error during setup: " + err.message);
  process.exit(1);
});
