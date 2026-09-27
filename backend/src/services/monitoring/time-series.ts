export interface TimeSeriesPoint {
  timestamp: Date | string;
  value: number;
}

export interface AnomalyReport {
  index: number;
  timestamp: Date | string;
  value: number;
  mean: number;
  stdDev: number;
  zScore: number;
  isAnomaly: boolean;
  type: "LATENCY_SPIKE" | "REGRESSION" | "NORMAL";
}

export interface ChangePoint {
  index: number;
  timestamp: Date | string;
  beforeMean: number;
  afterMean: number;
  shiftDelta: number;
  description: string;
}

export class TimeSeriesAnalyzer {
  /**
   * Computes Simple Moving Average (SMA) over a sliding window.
   */
  public static calculateSma(points: TimeSeriesPoint[], windowSize: number = 5): number[] {
    if (points.length === 0) return [];
    const result: number[] = [];

    for (let i = 0; i < points.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const windowSlice = points.slice(start, i + 1);
      const sum = windowSlice.reduce((acc, p) => acc + p.value, 0);
      result.push(Number((sum / windowSlice.length).toFixed(2)));
    }

    return result;
  }

  /**
   * Computes Exponential Moving Average (EMA) with smoothing factor alpha.
   */
  public static calculateEma(points: TimeSeriesPoint[], alpha: number = 0.3): number[] {
    if (points.length === 0) return [];
    const result: number[] = [points[0].value];

    for (let i = 1; i < points.length; i++) {
      const current = points[i].value;
      const prevEma = result[i - 1];
      const ema = alpha * current + (1 - alpha) * prevEma;
      result.push(Number(ema.toFixed(2)));
    }

    return result;
  }

  /**
   * Computes Z-Scores and identifies statistical latency spikes / regressions (|Z| > 2.5).
   */
  public static detectZScoreAnomalies(
    points: TimeSeriesPoint[],
    threshold: number = 2.5
  ): AnomalyReport[] {
    if (points.length < 3) {
      return points.map((p, i) => ({
        index: i,
        timestamp: p.timestamp,
        value: p.value,
        mean: p.value,
        stdDev: 0,
        zScore: 0,
        isAnomaly: false,
        type: "NORMAL",
      }));
    }

    const values = points.map((p) => p.value);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / values.length;

    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return points.map((p, i) => {
      const zScore = stdDev > 0 ? Number(((p.value - mean) / stdDev).toFixed(2)) : 0;
      const isAnomaly = Math.abs(zScore) >= threshold;
      let type: "LATENCY_SPIKE" | "REGRESSION" | "NORMAL" = "NORMAL";
      if (isAnomaly) {
        type = zScore > 0 ? "LATENCY_SPIKE" : "REGRESSION";
      }

      return {
        index: i,
        timestamp: p.timestamp,
        value: p.value,
        mean: Number(mean.toFixed(2)),
        stdDev: Number(stdDev.toFixed(2)),
        zScore,
        isAnomaly,
        type,
      };
    });
  }

  /**
   * Detects Change-Points (regressions / baseline shifts) using Cumulative Sum (CUSUM).
   */
  public static detectChangePoints(
    points: TimeSeriesPoint[],
    sensitivity: number = 1.5
  ): ChangePoint[] {
    const changePoints: ChangePoint[] = [];
    if (points.length < 10) return changePoints;

    const values = points.map((p) => p.value);
    const windowSize = Math.max(4, Math.floor(points.length / 4));

    for (let i = windowSize; i <= points.length - windowSize; i++) {
      const beforeWindow = values.slice(i - windowSize, i);
      const afterWindow = values.slice(i, i + windowSize);

      const beforeMean = beforeWindow.reduce((a, b) => a + b, 0) / beforeWindow.length;
      const afterMean = afterWindow.reduce((a, b) => a + b, 0) / afterWindow.length;

      const delta = afterMean - beforeMean;
      const pooledStd = Math.sqrt(
        (beforeWindow.reduce((a, b) => a + Math.pow(b - beforeMean, 2), 0) +
          afterWindow.reduce((a, b) => a + Math.pow(b - afterMean, 2), 0)) /
          (2 * windowSize)
      );

      if (pooledStd > 0 && Math.abs(delta) > sensitivity * pooledStd) {
        changePoints.push({
          index: i,
          timestamp: points[i].timestamp,
          beforeMean: Number(beforeMean.toFixed(2)),
          afterMean: Number(afterMean.toFixed(2)),
          shiftDelta: Number(delta.toFixed(2)),
          description:
            delta > 0
              ? `Performance Regression: Mean latency shifted up by +${delta.toFixed(2)}ms.`
              : `Performance Improvement: Mean latency shifted down by ${delta.toFixed(2)}ms.`,
        });
        i += windowSize; // Skip to next non-overlapping segment
      }
    }

    return changePoints;
  }
}
