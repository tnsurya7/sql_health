export interface DataPointFeatures {
  id: string;
  timestamp: Date | string;
  latencyMs: number;
  rows: number;
  executionCost: number;
  bufferReads?: number;
}

export interface IsolationForestResult {
  hasSufficientData: boolean;
  message?: string;
  totalSamples: number;
  anomaliesDetected: number;
  samples: Array<{
    id: string;
    timestamp: Date | string;
    anomalyScore: number; // 0.0 - 1.0 (score > 0.65 is anomalous)
    isAnomaly: boolean;
    features: {
      latencyMs: number;
      rows: number;
      executionCost: number;
    };
    explanation?: string;
  }>;
}

interface IsolationTreeNode {
  splitFeature?: keyof DataPointFeatures;
  splitValue?: number;
  left?: IsolationTreeNode;
  right?: IsolationTreeNode;
  size?: number;
}

export class IsolationForest {
  private trees: IsolationTreeNode[] = [];
  private numTrees: number;
  private maxDepth: number;

  constructor(numTrees: number = 50, maxSamples: number = 256) {
    this.numTrees = numTrees;
    this.maxDepth = Math.ceil(Math.log2(maxSamples));
  }

  /**
   * Evaluates multi-dimensional anomaly scores using an ensemble of Isolation Trees.
   */
  public static analyze(data: DataPointFeatures[]): IsolationForestResult {
    // Check data threshold (minimum 10 records)
    if (data.length < 10) {
      return {
        hasSufficientData: false,
        message: "Insufficient historical data for Isolation Forest (minimum 10 historical execution points required).",
        totalSamples: data.length,
        anomaliesDetected: 0,
        samples: [],
      };
    }

    const forest = new IsolationForest(40, data.length);
    forest.fit(data);

    const scored = data.map((point) => {
      const score = forest.computeAnomalyScore(point, data.length);
      const isAnomaly = score >= 0.65;
      let explanation: string | undefined;

      if (isAnomaly) {
        explanation = `Multi-variate outlier: Latency=${point.latencyMs}ms, Cost=${point.executionCost}, Rows=${point.rows} isolated significantly earlier than normal clusters.`;
      }

      return {
        id: point.id,
        timestamp: point.timestamp,
        anomalyScore: Number(score.toFixed(3)),
        isAnomaly,
        features: {
          latencyMs: point.latencyMs,
          rows: point.rows,
          executionCost: point.executionCost,
        },
        explanation,
      };
    });

    const anomaliesDetected = scored.filter((s) => s.isAnomaly).length;

    return {
      hasSufficientData: true,
      totalSamples: data.length,
      anomaliesDetected,
      samples: scored,
    };
  }

  public fit(data: DataPointFeatures[]): void {
    this.trees = [];
    const features: Array<keyof DataPointFeatures> = ["latencyMs", "rows", "executionCost"];

    for (let t = 0; t < this.numTrees; t++) {
      this.trees.push(this.buildTree(data, 0, this.maxDepth, features));
    }
  }

  private buildTree(
    data: DataPointFeatures[],
    currentDepth: number,
    maxDepth: number,
    featureKeys: Array<keyof DataPointFeatures>
  ): IsolationTreeNode {
    if (currentDepth >= maxDepth || data.length <= 1) {
      return { size: data.length };
    }

    // Select random feature
    const feat = featureKeys[Math.floor(Math.random() * featureKeys.length)];
    const values = data.map((d) => Number(d[feat] || 0));
    const min = Math.min(...values);
    const max = Math.max(...values);

    if (min === max) {
      return { size: data.length };
    }

    // Select random split value uniformly between min and max
    const splitValue = min + Math.random() * (max - min);

    const leftData = data.filter((d) => Number(d[feat] || 0) < splitValue);
    const rightData = data.filter((d) => Number(d[feat] || 0) >= splitValue);

    return {
      splitFeature: feat,
      splitValue,
      left: this.buildTree(leftData, currentDepth + 1, maxDepth, featureKeys),
      right: this.buildTree(rightData, currentDepth + 1, maxDepth, featureKeys),
    };
  }

  public computeAnomalyScore(point: DataPointFeatures, n: number): number {
    let totalPathLength = 0;
    for (const tree of this.trees) {
      totalPathLength += this.getPathLength(point, tree, 0);
    }
    const avgPathLength = totalPathLength / this.trees.length;
    const cN = IsolationForest.c(n);
    // Anomaly score s = 2^(-E(h(x)) / c(n))
    return Math.pow(2, -avgPathLength / (cN || 1));
  }

  private getPathLength(point: DataPointFeatures, node: IsolationTreeNode, currentDepth: number): number {
    if (!node.left || !node.right || !node.splitFeature || node.splitValue === undefined) {
      return currentDepth + (node.size && node.size > 1 ? IsolationForest.c(node.size) : 0);
    }

    const val = Number(point[node.splitFeature] || 0);
    if (val < node.splitValue) {
      return this.getPathLength(point, node.left, currentDepth + 1);
    } else {
      return this.getPathLength(point, node.right, currentDepth + 1);
    }
  }

  // Average path length of unsuccessful searches in Binary Search Tree: c(n) = 2(ln(n - 1) + 0.5772156649) - (2(n - 1)/n)
  private static c(n: number): number {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    const eulerMascheroni = 0.5772156649;
    return 2 * (Math.log(n - 1) + eulerMascheroni) - (2 * (n - 1)) / n;
  }
}
