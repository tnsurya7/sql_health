export interface JoinRelation {
  name: string;
  alias?: string;
  cardinality: number;
}

export interface JoinPlan {
  relations: string[];
  cost: number;
  cardinality: number;
  orderSql: string;
  left?: JoinPlan;
  right?: JoinPlan;
}

export interface DpJoinOptimizerResult {
  originalOrder: string[];
  optimalOrder: string[];
  estimatedCostOriginal: number;
  estimatedCostOptimal: number;
  costReductionPercent: number;
  optimizedFromClause: string;
  dpStatesEvaluated: number;
}

export class DpJoinOptimizer {
  /**
   * Dynamic Programming Join Order Optimizer.
   *
   * Uses bottom-up DP over relation subsets.
   *
   * For every subset S:
   *
   *   DP[S] = minimum-cost way to join relations in S.
   *
   * Both join orientations are evaluated:
   *
   *   A JOIN B
   *   B JOIN A
   *
   * The cheaper orientation is selected.
   *
   * Explicit join conditions are preserved when supplied.
   *
   * IMPORTANT:
   * The optimizer never generates:
   *
   *   ON 1=1
   *
   * when no explicit join condition exists.
   *
   * For unit-test / condition-less optimization, a CROSS JOIN
   * is used as the SQL representation.
   */

  public static optimizeJoinOrder(
    relations: JoinRelation[],
    joinConditions: Map<string, string> = new Map()
  ): DpJoinOptimizerResult {
    const n = relations.length;

    // ---------------------------------------------------------
    // Single relation
    // ---------------------------------------------------------

    if (n < 2) {
      return {
        originalOrder: relations.map((r) => r.name),
        optimalOrder: relations.map((r) => r.name),
        estimatedCostOriginal: 100,
        estimatedCostOptimal: 100,
        costReductionPercent: 0,
        optimizedFromClause: relations[0]?.name || "",
        dpStatesEvaluated: 1,
      };
    }

    const memo = new Map<string, JoinPlan>();

    let statesEvaluated = 0;

    // ---------------------------------------------------------
    // Convert bitmask to deterministic subset key
    // ---------------------------------------------------------

    const getSubsetKey = (mask: number): string => {
      const names: string[] = [];

      for (let i = 0; i < n; i++) {
        if ((mask & (1 << i)) !== 0) {
          names.push(relations[i].name);
        }
      }

      return names.sort().join("|");
    };

    // ---------------------------------------------------------
    // Normalize join condition map
    // ---------------------------------------------------------

    const normalizedJoinConditions =
      DpJoinOptimizer.normalizeJoinConditions(joinConditions);

    // ---------------------------------------------------------
    // Find explicit join condition between two plans
    // ---------------------------------------------------------

    const findJoinCondition = (
      leftPlan: JoinPlan,
      rightPlan: JoinPlan
    ): string | undefined => {
      for (const leftRelation of leftPlan.relations) {
        for (const rightRelation of rightPlan.relations) {
          const key = [leftRelation, rightRelation]
            .map((value) =>
              DpJoinOptimizer.normalizeRelationName(value)
            )
            .sort()
            .join("|");

          const condition = normalizedJoinConditions.get(key);

          if (condition) {
            return condition;
          }
        }
      }

      return undefined;
    };

    // ---------------------------------------------------------
    // Step 1: Initialize singleton DP states
    // ---------------------------------------------------------

    for (let i = 0; i < n; i++) {
      const relation = relations[i];

      const mask = 1 << i;
      const key = getSubsetKey(mask);

      memo.set(key, {
        relations: [relation.name],
        cost: relation.cardinality,
        cardinality: relation.cardinality,
        orderSql: relation.alias
          ? `${relation.name} ${relation.alias}`
          : relation.name,
      });

      statesEvaluated++;
    }

    // ---------------------------------------------------------
    // Step 2: Bottom-up DP
    // ---------------------------------------------------------

    const totalSubsets = 1 << n;

    for (let size = 2; size <= n; size++) {
      for (let mask = 1; mask < totalSubsets; mask++) {
        if (DpJoinOptimizer.countBits(mask) !== size) {
          continue;
        }

        const currentKey = getSubsetKey(mask);

        let bestPlan: JoinPlan | null = null;

        // -----------------------------------------------------
        // Enumerate all partitions:
        //
        // S = S1 + S2
        // -----------------------------------------------------

        for (
          let sub1 = (mask - 1) & mask;
          sub1 > 0;
          sub1 = (sub1 - 1) & mask
        ) {
          const sub2 = mask ^ sub1;

          if (sub2 === 0) {
            continue;
          }

          // Avoid evaluating symmetric partitions twice.
          if (sub1 > sub2) {
            continue;
          }

          const key1 = getSubsetKey(sub1);
          const key2 = getSubsetKey(sub2);

          const plan1 = memo.get(key1);
          const plan2 = memo.get(key2);

          if (!plan1 || !plan2) {
            continue;
          }

          statesEvaluated++;

          // ---------------------------------------------------
          // Join cardinality estimate
          // ---------------------------------------------------

          const selectivity = 0.05;

          const joinOutputCard = Math.max(
            1,
            Math.round(
              plan1.cardinality *
                plan2.cardinality *
                selectivity
            )
          );

          // ---------------------------------------------------
          // Orientation 1:
          //
          // plan1 LEFT JOIN plan2
          // ---------------------------------------------------

          const costPlan1Left =
            plan1.cost +
            plan2.cost +
            plan1.cardinality * 0.2 +
            plan2.cardinality * 1.0;

          // ---------------------------------------------------
          // Orientation 2:
          //
          // plan2 LEFT JOIN plan1
          // ---------------------------------------------------

          const costPlan2Left =
            plan1.cost +
            plan2.cost +
            plan2.cardinality * 0.2 +
            plan1.cardinality * 1.0;

          // ---------------------------------------------------
          // Select cheaper orientation
          // ---------------------------------------------------

          const plan1IsLeft =
            costPlan1Left <= costPlan2Left;

          const bestOrientationCost = plan1IsLeft
            ? costPlan1Left
            : costPlan2Left;

          const leftPlan = plan1IsLeft ? plan1 : plan2;
          const rightPlan = plan1IsLeft ? plan2 : plan1;

          // ---------------------------------------------------
          // Find actual JOIN condition
          // ---------------------------------------------------

          const joinCondition = findJoinCondition(
            leftPlan,
            rightPlan
          );

          /*
           * If a real JOIN condition exists:
           *
           *   customers INNER JOIN orders ON ...
           *
           * Otherwise:
           *
           *   customers CROSS JOIN orders
           *
           * NEVER:
           *
           *   customers INNER JOIN orders ON 1=1
           *
           * This keeps the generated SQL explicit and avoids
           * the old ON 1=1 problem.
           */
          const orderSql = joinCondition
            ? `${leftPlan.orderSql} INNER JOIN ${rightPlan.orderSql} ${joinCondition}`
            : `${leftPlan.orderSql} CROSS JOIN ${rightPlan.orderSql}`;

          const candidatePlan: JoinPlan = {
            relations: [
              ...leftPlan.relations,
              ...rightPlan.relations,
            ],
            cost: bestOrientationCost,
            cardinality: joinOutputCard,
            orderSql,
            left: leftPlan,
            right: rightPlan,
          };

          // ---------------------------------------------------
          // Keep cheapest plan
          // ---------------------------------------------------

          if (
            !bestPlan ||
            candidatePlan.cost < bestPlan.cost
          ) {
            bestPlan = candidatePlan;
          }
        }

        if (bestPlan) {
          memo.set(currentKey, bestPlan);
        }
      }
    }

    // ---------------------------------------------------------
    // Retrieve optimal plan
    // ---------------------------------------------------------

    const fullMask = (1 << n) - 1;

    const fullKey = getSubsetKey(fullMask);

    const optimalPlan = memo.get(fullKey);

    // ---------------------------------------------------------
    // Calculate original query cost
    // ---------------------------------------------------------

    let originalCost = 0;

    let runningCardinality =
      relations[0].cardinality;

    originalCost += runningCardinality;

    for (let i = 1; i < n; i++) {
      const nextCardinality =
        relations[i].cardinality;

      originalCost +=
        nextCardinality +
        runningCardinality * 0.2 +
        nextCardinality * 1.0;

      runningCardinality = Math.max(
        1,
        Math.round(
          runningCardinality *
            nextCardinality *
            0.05
        )
      );
    }

    // ---------------------------------------------------------
    // Optimal cost
    // ---------------------------------------------------------

    const optimalCost = optimalPlan
      ? optimalPlan.cost
      : originalCost;

    // ---------------------------------------------------------
    // Cost reduction
    // ---------------------------------------------------------

    const costReductionPercent =
      originalCost > 0
        ? Math.max(
            0,
            Math.round(
              ((originalCost - optimalCost) /
                originalCost) *
                100
            )
          )
        : 0;

    // ---------------------------------------------------------
    // Return result
    // ---------------------------------------------------------

    return {
      originalOrder:
        relations.map((r) => r.name),

      optimalOrder:
        optimalPlan
          ? optimalPlan.relations
          : relations.map((r) => r.name),

      estimatedCostOriginal:
        Number(originalCost.toFixed(2)),

      estimatedCostOptimal:
        Number(optimalCost.toFixed(2)),

      costReductionPercent,

      optimizedFromClause:
        optimalPlan
          ? optimalPlan.orderSql
          : relations
              .map((r) =>
                r.alias
                  ? `${r.name} ${r.alias}`
                  : r.name
              )
              .join(" CROSS JOIN "),

      dpStatesEvaluated:
        statesEvaluated,
    };
  }

  // ===========================================================
  // Normalize join condition map
  // ===========================================================

  private static normalizeJoinConditions(
    joinConditions: Map<string, string>
  ): Map<string, string> {
    const normalized = new Map<string, string>();

    for (const [key, condition] of joinConditions.entries()) {
      const parts = key
        .split("-")
        .map((value) =>
          DpJoinOptimizer.normalizeRelationName(value)
        )
        .filter(Boolean);

      if (parts.length !== 2) {
        continue;
      }

      const normalizedKey = parts
        .sort()
        .join("|");

      normalized.set(
        normalizedKey,
        DpJoinOptimizer.normalizeJoinCondition(
          condition
        )
      );
    }

    return normalized;
  }

  // ===========================================================
  // Normalize relation/table name
  // ===========================================================

  private static normalizeRelationName(
    relation: string
  ): string {
    return relation
      .trim()
      .replace(/^["']|["']$/g, "")
      .toLowerCase();
  }

  // ===========================================================
  // Normalize JOIN condition
  // ===========================================================

  private static normalizeJoinCondition(
    condition: string
  ): string {
    const trimmed = condition.trim();

    if (/^on\b/i.test(trimmed)) {
      return trimmed;
    }

    return `ON ${trimmed}`;
  }

  // ===========================================================
  // Count set bits
  // ===========================================================

  private static countBits(
    value: number
  ): number {
    let count = 0;

    while (value > 0) {
      count += value & 1;
      value >>= 1;
    }

    return count;
  }
}