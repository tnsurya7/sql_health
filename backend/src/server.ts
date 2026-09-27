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
const PORT = process.env.BACKEND_PORT || process.env.PORT || 5001;

// Security Middleware
app.use(helmet());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    credentials: true,
  })
);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,
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

// Import Routers
import authRouter from "./routes/auth";
import dbRouter from "./routes/db";
import sqlRouter from "./routes/sql";
import schemaRouter from "./routes/schema";
import dashboardRouter from "./routes/dashboard";
import queriesRouter from "./routes/queries";
import analysisRouter, {
  proceduresRouter,
  viewsRouter,
  functionsRouter,
  triggersRouter,
} from "./routes/analysis";
import recommendationsRouter from "./routes/recommendations";
import performanceRouter from "./routes/performance";
import indexAdvisorRouter from "./routes/index-advisor";
import deadlocksRouter from "./routes/deadlocks";
import healthRouter from "./routes/health";
import ragRouter from "./routes/rag";
import searchRouter from "./routes/search";

import { connectionManager } from "./database/connection-manager";
import { RagService } from "./services/rag/rag-service";

// Register Routers
app.use("/api/auth", authRouter);
app.use("/api/databases", dbRouter);
app.use("/api/sql", sqlRouter);
app.use("/api/schema", schemaRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/queries", queriesRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/performance", performanceRouter);
app.use("/api/index-advisor", indexAdvisorRouter);
app.use("/api/deadlocks", deadlocksRouter);
app.use("/api/health", healthRouter);
app.use("/api/rag", ragRouter);
app.use("/api/search", searchRouter);
app.use("/api/procedures", proceduresRouter);
app.use("/api/views", viewsRouter);
app.use("/api/functions", functionsRouter);
app.use("/api/triggers", triggersRouter);
app.use("/api", analysisRouter);

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
    logger.info("Connected to PostgreSQL application database via Prisma successfully.");

    // Initialize configured database connections and RAG knowledge store
    await connectionManager.initializeConnections();
    await RagService.seedIfEmpty();

    app.listen(PORT, () => {
      logger.info(`SQLSense AI Backend running on http://localhost:${PORT}`);
    });
  } catch (error: any) {
    logger.error("Failed to connect to application PostgreSQL database:", error.message);
    console.error("\nTROUBLESHOOTING GUIDANCE:");
    console.error("1. Ensure PostgreSQL is running locally.");
    console.error("2. Check APP_DATABASE_URL or DATABASE_URL in your .env file.");
    console.error("3. Run 'npm run db:push' to sync application schema.\n");
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== "test") {
  main();
}

export default app;
export { logger };
