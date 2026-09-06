export interface DetailedHealthScore {
  performance: number;
  security: number;
  maintainability: number;
  indexHealth: number;
  schemaQuality: number;
  queryQuality: number;
  overall: number;
}

export class HealthScoreEngine {
  public static calculate(
    metadata: {
      tables: any[];
      viewsCount: number;
      triggersCount: number;
    },
    issues: any[],
    recommendations: any[]
  ): DetailedHealthScore {
    // 1. Performance: impacted by slow queries or missing indexes
    const performanceIssues = issues.filter(i => i.category === "Performance");
    const criticalPerfCount = performanceIssues.filter(i => i.severity === "CRITICAL").length;
    const highPerfCount = performanceIssues.filter(i => i.severity === "HIGH").length;
    const medPerfCount = performanceIssues.filter(i => i.severity === "MEDIUM").length;
    
    let performance = 100 - (criticalPerfCount * 25 + highPerfCount * 15 + medPerfCount * 5);
    performance = Math.max(10, Math.min(100, performance));

    // 2. Security: impacted by SQL Injection, dynamic SQL, update/delete without WHERE, dropping objects
    const securityIssues = issues.filter(i => i.category === "Security");
    const criticalSecCount = securityIssues.filter(i => i.severity === "CRITICAL").length;
    const highSecCount = securityIssues.filter(i => i.severity === "HIGH").length;
    
    let security = 100 - (criticalSecCount * 30 + highSecCount * 15);
    security = Math.max(10, Math.min(100, security));

    // 3. Maintainability: deeply nested queries, cursors, excessive joins, dynamic SQL, triggers
    const maintIssues = issues.filter(i => i.category === "Maintainability");
    const highMaintCount = maintIssues.filter(i => i.severity === "HIGH").length;
    const medMaintCount = maintIssues.filter(i => i.severity === "MEDIUM").length;
    const triggersPen = metadata.triggersCount * 2; // triggers introduce complexity

    let maintainability = 100 - (highMaintCount * 15 + medMaintCount * 5 + triggersPen);
    maintainability = Math.max(10, Math.min(100, maintainability));

    // 4. Index Health: ratio of indexes to tables, and missing index recommendations
    const tablesCount = metadata.tables.length || 1;
    const totalIndexes = metadata.tables.reduce((sum, t) => sum + (t.indexes?.length || 0), 0);
    const indexRatio = totalIndexes / tablesCount; // ideal around 1.5 - 3.0
    
    let indexScore = 80;
    if (indexRatio >= 1.5 && indexRatio <= 3.5) {
      indexScore += 20;
    } else if (indexRatio > 3.5) {
      indexScore -= 10; // Over-indexing penalty
    } else {
      indexScore -= (1.5 - indexRatio) * 30; // Under-indexing penalty
    }

    const indexRecommendations = recommendations.filter(r => r.category === "INDEXES" && r.status === "NEW");
    indexScore -= indexRecommendations.length * 10;
    const indexHealth = Math.max(10, Math.min(100, Math.round(indexScore)));

    // 5. Schema Quality: missing PKs, missing FKs on relation-like names
    let schemaScore = 100;
    let tablesWithPk = 0;
    let totalCols = 0;
    let nullableCols = 0;

    metadata.tables.forEach(t => {
      const hasPk = t.columns?.some((c: any) => c.isPk);
      if (hasPk) tablesWithPk++;
      totalCols += t.columns?.length || 0;
      nullableCols += t.columns?.filter((c: any) => c.isNullable).length || 0;
    });

    const pkPercentage = tablesCount > 0 ? (tablesWithPk / tablesCount) * 100 : 100;
    schemaScore -= (100 - pkPercentage) * 0.5; // Penalty for missing PKs

    // Check if nullable cols are excessive (>50%)
    if (totalCols > 0 && (nullableCols / totalCols) > 0.6) {
      schemaScore -= 10;
    }
    const schemaQuality = Math.max(10, Math.min(100, Math.round(schemaScore)));

    // 6. Query Quality: Average score of analyzed queries
    const queryQualityIssuesCount = issues.length;
    let queryQuality = 100 - queryQualityIssuesCount * 4;
    queryQuality = Math.max(10, Math.min(100, queryQuality));

    const overall = Math.round(
      (performance + security + maintainability + indexHealth + schemaQuality + queryQuality) / 6
    );

    return {
      performance,
      security,
      maintainability,
      indexHealth,
      schemaQuality,
      queryQuality,
      overall
    };
  }
}
