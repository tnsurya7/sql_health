import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pino from "pino";
import pinoPretty from "pino-pretty";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Robust cross-platform environment variable resolution
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const logger = pino(
  pinoPretty({
    colorize: true,
    translateTime: "SYS:standard",
  })
);

export const prisma = new PrismaClient();

const app = express();
const PORT = process.env.BACKEND_PORT || 5001;

// Security Middleware
app.use(helmet());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true,
  })
);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, status: "OK", timestamp: new Date() });
});

// Import Routers
import authRouter from "./routes/auth";
import dbRouter from "./routes/db";
import sqlRouter from "./routes/sql";
import schemaRouter from "./routes/schema";
import dashboardRouter from "./routes/dashboard";
import queriesRouter from "./routes/queries";
import analysisRouter from "./routes/analysis";
import recommendationsRouter from "./routes/recommendations";
import performanceRouter from "./routes/performance";
import searchRouter from "./routes/search";

// Register Routers
app.use("/api/auth", authRouter);
app.use("/api/databases", dbRouter);
app.use("/api/sql", sqlRouter);
app.use("/api/schema", schemaRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/queries", queriesRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/performance", performanceRouter);
app.use("/api/search", searchRouter);
app.use("/api/procedures", analysisRouter);
app.use("/api/views", analysisRouter);
app.use("/api/functions", analysisRouter);
app.use("/api/triggers", analysisRouter);

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(err);
  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || "INTERNAL_SERVER_ERROR",
      message: err.message || "An unexpected error occurred.",
    },
  });
});

async function main() {
  try {
    await prisma.$connect();
    logger.info("Connected to PostgreSQL via Prisma successfully.");

    app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error("❌ Failed to connect to PostgreSQL database:");
    logger.error(error);
    console.error("\n👉 TROUBLESHOOTING GUIDANCE:");
    console.error("1. Ensure PostgreSQL service is running:");
    console.error("   - Windows: Open 'services.msc' -> postgresql service -> click Start");
    console.error("   - Mac: brew services start postgresql");
    console.error("2. Check DATABASE_URL in your .env file matches your PostgreSQL credentials.");
    console.error("3. Run 'npm run db:push' to synchronize your database tables.\n");
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  main();
}

export default app;
export { logger };
