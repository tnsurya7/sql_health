-- AlterTable
ALTER TABLE "DatabaseConnection" ADD COLUMN     "databaseType" TEXT NOT NULL DEFAULT 'postgresql',
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "lastCheckedAt" TIMESTAMP(3),
ADD COLUMN     "readOnly" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "schema" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "ssl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DISCONNECTED';

-- AlterTable
ALTER TABLE "ColumnMetadata" ADD COLUMN     "distinctValues" INTEGER;

-- AlterTable
ALTER TABLE "IndexMetadata" ADD COLUMN     "indexType" TEXT NOT NULL DEFAULT 'BTREE';

-- AlterTable
ALTER TABLE "SqlQuery" ADD COLUMN     "fingerprint" TEXT;

-- AlterTable
ALTER TABLE "QueryIssue" ADD COLUMN     "affectedColumns" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "affectedTables" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "databaseType" TEXT NOT NULL DEFAULT 'postgresql';

-- AlterTable
ALTER TABLE "ExecutionPlan" ADD COLUMN     "actualRows" DOUBLE PRECISION,
ADD COLUMN     "cardinalityErrorRatio" DOUBLE PRECISION,
ADD COLUMN     "expensiveNodes" TEXT,
ADD COLUMN     "planRows" DOUBLE PRECISION,
ADD COLUMN     "totalCost" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Recommendation" ADD COLUMN     "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'ALGORITHMIC_RULE';

-- AlterTable
ALTER TABLE "PerformanceMetric" ADD COLUMN     "p95TimeMs" DOUBLE PRECISION,
ADD COLUMN     "stdDevMs" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "HealthScore" ADD COLUMN     "dimensions" TEXT;

-- CreateTable
CREATE TABLE "QueryFingerprint" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "normalizedSql" TEXT NOT NULL,
    "databaseType" TEXT NOT NULL DEFAULT 'postgresql',
    "executionCount" INTEGER NOT NULL DEFAULT 1,
    "avgLatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minLatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxLatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "p95LatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "p99LatencyMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueryFingerprint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationRun" (
    "id" TEXT NOT NULL,
    "queryId" TEXT,
    "connectionId" TEXT,
    "originalSql" TEXT NOT NULL,
    "databaseType" TEXT NOT NULL DEFAULT 'postgresql',
    "selectedCandidateId" TEXT,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationCandidateRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "candidateSql" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "estimatedCost" DOUBLE PRECISION,
    "actualLatencyMs" DOUBLE PRECISION,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "validationReport" TEXT,
    "benchmarkImprovement" DOUBLE PRECISION,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationCandidateRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlockLog" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "cycleDetails" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlockLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "databaseType" TEXT NOT NULL DEFAULT 'ALL',
    "source" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "databaseType" TEXT NOT NULL DEFAULT 'ALL',
    "category" TEXT NOT NULL,
    "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    "embedding" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptimizationChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueryFingerprint_fingerprint_key" ON "QueryFingerprint"("fingerprint");

-- AddForeignKey
ALTER TABLE "OptimizationRun" ADD CONSTRAINT "OptimizationRun_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "SqlQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationRun" ADD CONSTRAINT "OptimizationRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DatabaseConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationCandidateRecord" ADD CONSTRAINT "OptimizationCandidateRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "OptimizationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlockLog" ADD CONSTRAINT "DeadlockLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "DatabaseConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationChunk" ADD CONSTRAINT "OptimizationChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "OptimizationDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
