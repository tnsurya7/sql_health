import { ProcedureAnalyzer } from "../services/procedure-analyzer/engine";

describe("SonarQube-Style Stored Procedure Static Analysis Suite", () => {
  describe("SP001: Unused Local Variables", () => {
    it("should flag an unused variable declared in DECLARE block", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        DECLARE
            v_unused INT;
            v_used INT := 10;
        BEGIN
            RAISE NOTICE 'Value: %', v_used;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP001");
      expect(finding).toBeDefined();
      expect(finding?.title).toContain("v_unused");
      expect(finding?.category).toBe("Maintainability");
      expect(finding?.severity).toBe("LOW");
    });

    it("should NOT trigger false positive when variable is used in body", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        DECLARE
            v_used INT := 10;
        BEGIN
            v_used := v_used + 5;
            RAISE NOTICE 'Value: %', v_used;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP001");
      expect(finding).toBeUndefined();
    });

    it("should NOT trigger false positive if variable is only referenced in comments or strings", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        DECLARE
            v_ghost INT;
        BEGIN
            -- This is a comment mentioning v_ghost
            RAISE NOTICE 'String literal containing v_ghost';
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      // Because tokenizer strips comments before checking statement text, v_ghost in comments is not treated as code usage
      const finding = report.findings.find((f) => f.ruleId === "SP001");
      expect(finding).toBeDefined();
    });
  });

  describe("SP002: Dead Store (Assigned but Never Read)", () => {
    it("should flag variable assigned via := that is never read afterwards", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        DECLARE
            v_dead INT;
        BEGIN
            v_dead := 42;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP002");
      expect(finding).toBeDefined();
      expect(finding?.title).toContain("v_dead");
    });

    it("should NOT flag variable when it is read after assignment", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        DECLARE
            v_active INT;
        BEGIN
            v_active := 42;
            RAISE NOTICE 'Result: %', v_active;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP002");
      expect(finding).toBeUndefined();
    });
  });

  describe("SP003: Unreachable Code", () => {
    it("should flag statements immediately after unconditional RETURN", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION test_func() RETURNS INT
        LANGUAGE plpgsql AS $$
        BEGIN
            RETURN 100;
            RAISE NOTICE 'This can never execute';
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP003");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("HIGH");
      expect(finding?.snippet).toContain("RAISE NOTICE");
    });

    it("should flag statements after unconditional RAISE EXCEPTION", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'Fatal abort';
            UPDATE orders SET status = 'CANCELLED' WHERE id = 1;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP003");
      expect(finding).toBeDefined();
    });
  });

  describe("SP004: Redundant Boolean Comparison", () => {
    it("should flag explicit comparisons against TRUE or FALSE", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            IF is_active = TRUE THEN
                RAISE NOTICE 'Active';
            END IF;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP004");
      expect(finding).toBeDefined();
      expect(finding?.title).toContain("is_active = TRUE");
    });

    it("should NOT flag clean boolean conditions", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            IF is_active THEN
                RAISE NOTICE 'Active';
            END IF;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP004");
      expect(finding).toBeUndefined();
    });
  });

  describe("SP005: Suspicious Tautologies", () => {
    it("should flag constant true tautologies such as 1 = 1", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            SELECT * FROM employees WHERE 1 = 1;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP005");
      expect(finding).toBeDefined();
      expect(finding?.explanation).toContain("1 = 1");
    });
  });

  describe("SP006: Unsafe Dynamic SQL (SQL Injection)", () => {
    it("should flag EXECUTE with unescaped string concatenation", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE search_data(p_user_input TEXT)
        LANGUAGE plpgsql AS $$
        BEGIN
            EXECUTE 'SELECT * FROM users WHERE name = ' || p_user_input;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP006");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("CRITICAL");
      expect(finding?.category).toBe("Security");
    });

    it("should NOT flag safe dynamic SQL using format() or USING clause", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE search_data(p_table TEXT, p_id INT)
        LANGUAGE plpgsql AS $$
        BEGIN
            EXECUTE format('SELECT * FROM %I WHERE id = $1', p_table) USING p_id;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP006");
      expect(finding).toBeUndefined();
    });
  });

  describe("SP007: Swallowed Exceptions", () => {
    it("should flag WHEN OTHERS THEN NULL; empty error handler", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE accounts SET balance = balance - 100 WHERE id = 1;
        EXCEPTION
            WHEN OTHERS THEN NULL;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP007");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("HIGH");
    });
  });

  describe("SP008: Illegal Transaction in Function Context", () => {
    it("should flag explicit COMMIT inside a FUNCTION", () => {
      const sql = `
        CREATE OR REPLACE FUNCTION bad_func() RETURNS VOID
        LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE orders SET status = 'DONE';
            COMMIT;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP008");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("CRITICAL");
    });

    it("should NOT flag COMMIT inside a PROCEDURE", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE good_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE orders SET status = 'DONE' WHERE id = 1;
            COMMIT;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP008");
      expect(finding).toBeUndefined();
    });
  });

  describe("SP009: Unbounded Loop", () => {
    it("should flag LOOP without any EXIT condition", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE infinite_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            LOOP
                RAISE NOTICE 'Spinning...';
            END LOOP;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP009");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("HIGH");
    });

    it("should NOT flag loop with explicit EXIT WHEN condition", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE safe_proc()
        LANGUAGE plpgsql AS $$
        DECLARE
            i INT := 0;
        BEGIN
            LOOP
                i := i + 1;
                EXIT WHEN i > 10;
            END LOOP;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP009");
      expect(finding).toBeUndefined();
    });
  });

  describe("SP010: Invalid NULL Comparison", () => {
    it("should flag = NULL in predicates", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE customers SET loyalty_tier = 'Standard' WHERE total_spend = NULL;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP010");
      expect(finding).toBeDefined();
      expect(finding?.snippet).toContain("total_spend = NULL");
    });
  });

  describe("SP011: Redundant Consecutive Variable Assignment", () => {
    it("should flag consecutive assignments to the same variable without reading", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE test_proc()
        LANGUAGE plpgsql AS $$
        DECLARE
            v_val INT;
        BEGIN
            v_val := 10;
            v_val := 20;
            RAISE NOTICE 'Val: %', v_val;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP011");
      expect(finding).toBeDefined();
      expect(finding?.title).toContain("v_val");
    });
  });

  describe("SP012: Unsafe DML Without WHERE Clause", () => {
    it("should flag UPDATE without WHERE clause", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE wipe_salaries()
        LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE employees SET salary = 0;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP012");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("CRITICAL");
    });

    it("should flag DELETE FROM without WHERE clause", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE purge_orders()
        LANGUAGE plpgsql AS $$
        BEGIN
            DELETE FROM orders;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP012");
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe("CRITICAL");
    });

    it("should NOT flag UPDATE with a valid WHERE clause", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE update_one(p_id INT)
        LANGUAGE plpgsql AS $$
        BEGIN
            UPDATE employees SET salary = 50000 WHERE id = p_id;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP012");
      expect(finding).toBeUndefined();
    });
  });

  describe("SP013: High Cyclomatic Complexity", () => {
    it("should flag procedures with deeply nested control flow and high complexity", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE complex_proc(a INT, b INT, c INT, d INT, e INT)
        LANGUAGE plpgsql AS $$
        BEGIN
            IF a = 1 THEN
                IF b = 2 THEN
                    IF c = 3 THEN
                        IF d = 4 THEN
                            IF e = 5 THEN
                                RAISE NOTICE 'Deep';
                            END IF;
                        END IF;
                    END IF;
                END IF;
            END IF;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP013");
      expect(finding).toBeDefined();
      expect(report.cyclomaticComplexity).toBeGreaterThanOrEqual(5);
    });
  });

  describe("SP014: Cursor Resource Leak", () => {
    it("should flag cursor that is OPENed but never CLOSEd", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE leak_cursor()
        LANGUAGE plpgsql AS $$
        DECLARE
            c_emp CURSOR FOR SELECT * FROM employees;
            r_emp RECORD;
        BEGIN
            OPEN c_emp;
            FETCH c_emp INTO r_emp;
            -- Forgot CLOSE c_emp;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP014");
      expect(finding).toBeDefined();
      expect(finding?.title).toContain("c_emp");
    });

    it("should NOT flag cursor that is properly closed", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE clean_cursor()
        LANGUAGE plpgsql AS $$
        DECLARE
            c_emp CURSOR FOR SELECT * FROM employees;
            r_emp RECORD;
        BEGIN
            OPEN c_emp;
            FETCH c_emp INTO r_emp;
            CLOSE c_emp;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP014");
      expect(finding).toBeUndefined();
    });
  });

  describe("SP015: Duplicate Branch Condition in IF-ELSIF", () => {
    it("should flag identical condition in ELSIF branch", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE branch_test(p_status INT)
        LANGUAGE plpgsql AS $$
        BEGIN
            IF p_status = 1 THEN
                RAISE NOTICE 'First';
            ELSIF p_status = 1 THEN
                RAISE NOTICE 'Duplicate dead branch';
            END IF;
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      const finding = report.findings.find((f) => f.ruleId === "SP015");
      expect(finding).toBeDefined();
      expect(finding?.title).toContain("p_status = 1");
    });
  });

  describe("Real Test Database Procedures", () => {
    it("should analyze process_order from sqlsense_test without throwing", () => {
      const sql = `
        CREATE OR REPLACE PROCEDURE process_order(
            p_customer_id    INT,
            p_product_ids    INT[],
            p_quantities     INT[],
            p_payment_method VARCHAR(40) DEFAULT 'CREDIT_CARD'
        )
        LANGUAGE plpgsql
        AS $$
        DECLARE
            v_order_id      INT;
            v_order_number  TEXT;
            v_total         NUMERIC(14,2) := 0;
            v_unit_price    NUMERIC(12,2);
            v_line_total    NUMERIC(14,2);
            i               INT;
        BEGIN
            IF array_length(p_product_ids, 1) <> array_length(p_quantities, 1) THEN
                RAISE EXCEPTION 'product_ids and quantities arrays must have the same length';
            END IF;

            v_order_number := 'ORD-PROC-' || to_char(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS');

            INSERT INTO orders (customer_id, order_number, status, total_amount, shipping_country)
            VALUES (p_customer_id, v_order_number, 'PROCESSING', 0, 'United States')
            RETURNING id INTO v_order_id;

            FOR i IN 1 .. array_length(p_product_ids, 1) LOOP
                SELECT unit_price INTO v_unit_price
                FROM   products
                WHERE  id = p_product_ids[i];

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Product ID % not found', p_product_ids[i];
                END IF;

                v_line_total := v_unit_price * p_quantities[i];
                v_total      := v_total + v_line_total;

                INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
                VALUES (v_order_id, p_product_ids[i], p_quantities[i], v_unit_price, v_line_total);
            END LOOP;

            UPDATE orders
            SET    total_amount = v_total,
                   status       = 'COMPLETED'
            WHERE  id = v_order_id;

            INSERT INTO payments (order_id, payment_method, amount, status)
            VALUES (v_order_id, p_payment_method, v_total, 'SUCCESS');
        END;
        $$;
      `;
      const report = ProcedureAnalyzer.analyzeProcedure(sql);
      expect(report.procedureName).toBe("process_order");
      expect(report.linesOfCode).toBeGreaterThan(20);
      expect(report.scores.overall).toBeGreaterThanOrEqual(70);
    });
  });
});
