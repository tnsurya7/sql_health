import { Router, Request, Response } from "express";
import { prisma } from "../server";
import { TimeSeriesAnalyzer, TimeSeriesPoint } from "../services/monitoring/time-series";
import { IsolationForest, DataPointFeatures } from "../services/monitoring/isolation-forest";

const router = Router();

// GET /api/performance/fingerprints - List query fingerprints and historical latency stats
router.get("/fingerprints", async (req: Request, res: Response) => {
  try {
    const fingerprints = await prisma.queryFingerprint.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 50,
    });
    res.status(200).json({ success: true, data: fingerprints });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "FINGERPRINT_FETCH_ERROR", message: error.message },
    });
  }
});

// GET /api/performance/metrics - Time series latency, SMA, EMA, Z-score anomalies, and change points
router.get("/metrics", async (req: Request, res: Response) => {
  try {
    const history = await prisma.performanceMetric.findMany({
      orderBy: { createdAt: "asc" },
      take: 100,
    });

    const timeSeriesPoints: TimeSeriesPoint[] = history.map((h) => ({
      timestamp: h.createdAt,
      value: h.medianTimeMs,
    }));

    const sma = TimeSeriesAnalyzer.calculateSma(timeSeriesPoints, 5);
    const ema = TimeSeriesAnalyzer.calculateEma(timeSeriesPoints, 0.3);
    const zScoreReports = TimeSeriesAnalyzer.detectZScoreAnomalies(timeSeriesPoints, 2.5);
    const changePoints = TimeSeriesAnalyzer.detectChangePoints(timeSeriesPoints, 1.5);

    // Prepare features for Isolation Forest
    const featureData: DataPointFeatures[] = history.map((h) => ({
      id: h.id,
      timestamp: h.createdAt,
      latencyMs: h.medianTimeMs,
      rows: h.rowsProcessed || 10,
      executionCost: h.cost || 10,
    }));

    const isolationForestResult = IsolationForest.analyze(featureData);

    res.status(200).json({
      success: true,
      data: {
        pointsCount: timeSeriesPoints.length,
        points: timeSeriesPoints,
        sma,
        ema,
        zScoreReports,
        changePoints,
        isolationForest: isolationForestResult,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: "METRICS_FETCH_ERROR", message: error.message },
    });
  }
});

export default router;
