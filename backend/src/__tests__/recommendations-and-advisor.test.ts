import { IndexAdvisor } from "../services/index-advisor/advisor";
import { TableInfo, ColumnInfo, IndexInfo, ConstraintInfo } from "../database/adapter.interface";

describe("Index Advisor Schema Inspection & Workload Flow", () => {
  const sampleTables: TableInfo[] = [
    { schema: "public", name: "departments", type: "BASE TABLE", rowCount: 10, sizeBytes: 8192, indexSizeBytes: 16384, totalSizeBytes: 24576 },
    { schema: "public", name: "employees", type: "BASE TABLE", rowCount: 1000, sizeBytes: 163840, indexSizeBytes: 32768, totalSizeBytes: 196608 },
    { schema: "public", name: "customers", type: "BASE TABLE", rowCount: 5000, sizeBytes: 819200, indexSizeBytes: 65536, totalSizeBytes: 884736 },
    { schema: "public", name: "orders", type: "BASE TABLE", rowCount: 20000, sizeBytes: 3276800, indexSizeBytes: 131072, totalSizeBytes: 3407872 },
  ];

  const sampleColumns: ColumnInfo[] = [
    { schema: "public", table: "departments", name: "id", dataType: "int", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
    { schema: "public", table: "departments", name: "name", dataType: "varchar", isNullable: false, isPk: false, isFk: false, ordinalPosition: 2 },
    { schema: "public", table: "employees", name: "id", dataType: "int", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
    { schema: "public", table: "employees", name: "department_id", dataType: "int", isNullable: true, isPk: false, isFk: true, fkRefTable: "departments", fkRefColumn: "id", ordinalPosition: 2 },
    { schema: "public", table: "employees", name: "salary", dataType: "numeric", isNullable: false, isPk: false, isFk: false, ordinalPosition: 3 },
    { schema: "public", table: "orders", name: "id", dataType: "int", isNullable: false, isPk: true, isFk: false, ordinalPosition: 1 },
    { schema: "public", table: "orders", name: "customer_id", dataType: "int", isNullable: false, isPk: false, isFk: true, fkRefTable: "customers", fkRefColumn: "id", ordinalPosition: 2 },
    { schema: "public", table: "orders", name: "status", dataType: "varchar", isNullable: false, isPk: false, isFk: false, ordinalPosition: 3 },
  ];

  const existingIndexes: IndexInfo[] = [
    { schema: "public", table: "departments", name: "pk_departments", type: "BTREE", isUnique: true, isPrimary: true, columns: ["id"], sizeBytes: 16384, definition: "CREATE UNIQUE INDEX pk_departments ON departments(id)" },
    { schema: "public", table: "employees", name: "pk_employees", type: "BTREE", isUnique: true, isPrimary: true, columns: ["id"], sizeBytes: 16384, definition: "CREATE UNIQUE INDEX pk_employees ON employees(id)" },
    { schema: "public", table: "customers", name: "pk_customers", type: "BTREE", isUnique: true, isPrimary: true, columns: ["id"], sizeBytes: 32768, definition: "CREATE UNIQUE INDEX pk_customers ON customers(id)" },
    { schema: "public", table: "orders", name: "pk_orders", type: "BTREE", isUnique: true, isPrimary: true, columns: ["id"], sizeBytes: 65536, definition: "CREATE UNIQUE INDEX pk_orders ON orders(id)" },
  ];

  const sampleConstraints: ConstraintInfo[] = [
    { name: "fk_employees_dept", schema: "public", table: "employees", type: "FOREIGN KEY", columns: ["department_id"], refTable: "departments", refColumns: ["id"] },
    { name: "fk_orders_cust", schema: "public", table: "orders", type: "FOREIGN KEY", columns: ["customer_id"], refTable: "customers", refColumns: ["id"] },
  ];

  describe("Schema Inspection Mode (Empty Query Workload)", () => {
    it("should identify unindexed foreign keys even when query history is empty", () => {
      const recs = IndexAdvisor.adviseSchema(sampleTables, sampleColumns, existingIndexes, sampleConstraints, "postgresql");

      expect(recs.length).toBeGreaterThanOrEqual(2);

      const empFk = recs.find((r) => r.table === "employees" && r.columns.includes("department_id"));
      expect(empFk).toBeDefined();
      expect(empFk?.candidateType).toBe("SCHEMA_INSPECTION");
      expect(empFk?.usageContext).toBe("FOREIGN_KEY");
      expect(empFk?.ddl).toContain("idx_employees_department_id");
      expect(empFk?.reason).toContain("Unindexed Foreign Key");
      expect(empFk?.existingIndexesComparison.matchingPrefix).toBe(false);

      const orderFk = recs.find((r) => r.table === "orders" && r.columns.includes("customer_id"));
      expect(orderFk).toBeDefined();
      expect(orderFk?.candidateType).toBe("SCHEMA_INSPECTION");
      expect(orderFk?.potentialWriteOverhead).toBe("LOW");
    });

    it("should NOT recommend index on foreign key if covering index already exists", () => {
      const indexesWithFk: IndexInfo[] = [
        ...existingIndexes,
        {
          schema: "public",
          table: "employees",
          name: "idx_emp_dept",
          type: "BTREE",
          isUnique: false,
          isPrimary: false,
          columns: ["department_id"],
          sizeBytes: 16384,
          definition: "CREATE INDEX idx_emp_dept ON employees(department_id)",
        },
      ];

      const recs = IndexAdvisor.adviseSchema(sampleTables, sampleColumns, indexesWithFk, sampleConstraints, "postgresql");
      const empFk = recs.find((r) => r.table === "employees" && r.columns.includes("department_id"));
      expect(empFk).toBeUndefined(); // Deduplicated!
    });
  });

  describe("Workload-Driven Multi-Query Analysis", () => {
    it("should aggregate workload queries and prioritize composite index columns", () => {
      const workload = [
        { sql: "SELECT * FROM orders WHERE customer_id = 42 AND status = 'COMPLETED'", frequency: 25, avgLatencyMs: 145 },
        { sql: "SELECT * FROM orders WHERE customer_id = 100", frequency: 10, avgLatencyMs: 95 },
      ];

      const recs = IndexAdvisor.adviseWorkloadQueries(workload, sampleTables, sampleColumns, existingIndexes, "postgresql");
      expect(recs.length).toBeGreaterThan(0);

      const rec = recs[0];
      expect(rec.candidateType).toBe("WORKLOAD_DRIVEN");
      expect(rec.table).toBe("orders");
      expect(rec.evidence).toContain("Observed 25 execution(s)");
      expect(rec.evidence).toContain("145.0 ms");
      expect(rec.confidenceCalculation).toContain("Calculated confidence");
      expect(rec.validationStatus).toBe("VALIDATED");
    });
  });
});
