import { TableInfo, ColumnInfo } from "../../database/adapter.interface";

export class SelectivityEstimator {
  /**
   * Estimates the selectivity of a column predicate (fraction of rows returned between 0.0 and 1.0).
   * A lower selectivity value (e.g., 0.001) means high selectivity (very few rows matched -> ideal for index seek).
   */
  public static estimateColumnSelectivity(
    columnName: string,
    tableName: string,
    tables: TableInfo[],
    columns: ColumnInfo[]
  ): { selectivity: number; distinctValues: number; confidence: "HIGH" | "MEDIUM" | "ESTIMATED" } {
    const table = tables.find((t) => t.name.toLowerCase() === tableName.toLowerCase());
    const col = columns.find(
      (c) => c.table.toLowerCase() === tableName.toLowerCase() && c.name.toLowerCase() === columnName.toLowerCase()
    );

    const totalRows = table?.rowCount || 1000;

    if (col && col.distinctValues && col.distinctValues > 0) {
      const distinct = col.distinctValues;
      const selectivity = Number((1 / distinct).toFixed(4));
      return {
        selectivity: Math.min(1.0, Math.max(0.0001, selectivity)),
        distinctValues: distinct,
        confidence: "HIGH",
      };
    }

    if (col && col.isPk) {
      return {
        selectivity: Number((1 / Math.max(1, totalRows)).toFixed(6)),
        distinctValues: totalRows,
        confidence: "HIGH",
      };
    }

    // Default heuristic based on column name patterns
    const nameLower = columnName.toLowerCase();
    if (nameLower.endsWith("_id") || nameLower === "id" || nameLower.includes("uuid")) {
      const distinct = Math.max(10, Math.round(totalRows * 0.8));
      return {
        selectivity: Number((1 / distinct).toFixed(4)),
        distinctValues: distinct,
        confidence: "MEDIUM",
      };
    } else if (nameLower.includes("status") || nameLower.includes("type") || nameLower.includes("tier")) {
      const distinct = 5;
      return {
        selectivity: 0.2,
        distinctValues: distinct,
        confidence: "MEDIUM",
      };
    } else if (nameLower.includes("email") || nameLower.includes("username") || nameLower.includes("sku")) {
      const distinct = Math.max(10, totalRows);
      return {
        selectivity: Number((1 / distinct).toFixed(4)),
        distinctValues: distinct,
        confidence: "HIGH",
      };
    }

    // Conservative default
    const distinct = Math.max(5, Math.round(totalRows * 0.1));
    return {
      selectivity: Number((1 / distinct).toFixed(4)),
      distinctValues: distinct,
      confidence: "ESTIMATED",
    };
  }
}
