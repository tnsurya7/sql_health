export interface IndexCostBenefit {
  estimatedSpeedupPercent: number;
  estimatedStorageBytes: number;
  writeOverheadPenaltyPercent: number;
  benefitRating: "HIGH" | "MEDIUM" | "LOW";
  rationale: string;
}

export class IndexCostBenefitAnalyzer {
  /**
   * Evaluates the net trade-off of creating a candidate index.
   */
  public static evaluate(
    tableRowCount: number,
    tableSizeBytes: number,
    columnSelectivity: number,
    indexedColumnsCount: number
  ): IndexCostBenefit {
    // 1. Estimated Speedup: A low selectivity (e.g. 0.01) yields high index speedup (80-95%)
    let estimatedSpeedupPercent = 0;
    if (columnSelectivity <= 0.01) {
      estimatedSpeedupPercent = 90;
    } else if (columnSelectivity <= 0.05) {
      estimatedSpeedupPercent = 75;
    } else if (columnSelectivity <= 0.2) {
      estimatedSpeedupPercent = 45;
    } else {
      estimatedSpeedupPercent = 15;
    }

    if (tableRowCount < 500) {
      // Small tables benefit less from indexes due to sequential page caching
      estimatedSpeedupPercent = Math.max(10, Math.round(estimatedSpeedupPercent * 0.4));
    }

    // 2. Storage Impact: Roughly 24 bytes per index entry + (indexedColumnsCount * 8 bytes) per row
    const bytesPerRow = 24 + indexedColumnsCount * 8;
    const estimatedStorageBytes = Math.round(tableRowCount * bytesPerRow * 1.3); // 30% page overhead

    // 3. Write Overhead: 2-5% per index on INSERT/UPDATE operations
    const writeOverheadPenaltyPercent = Number((2.5 * indexedColumnsCount).toFixed(1));

    // 4. Benefit Rating
    let benefitRating: "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
    if (estimatedSpeedupPercent >= 70 && tableRowCount >= 1000) {
      benefitRating = "HIGH";
    } else if (estimatedSpeedupPercent < 30 || tableRowCount < 300) {
      benefitRating = "LOW";
    }

    const rationale = `Provides an estimated ${estimatedSpeedupPercent}% query speedup with a modest ${writeOverheadPenaltyPercent}% write overhead and ~${(
      estimatedStorageBytes / 1024
    ).toFixed(1)} KB index storage footprint.`;

    return {
      estimatedSpeedupPercent,
      estimatedStorageBytes,
      writeOverheadPenaltyPercent,
      benefitRating,
      rationale,
    };
  }
}
