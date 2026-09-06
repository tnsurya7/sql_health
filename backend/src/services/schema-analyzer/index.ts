import { Pool } from "pg";

export interface SchemaMetadata {
  tables: any[];
  views: any[];
  functions: any[];
  procedures: any[];
  triggers: any[];
}

export class SchemaAnalyzer {
  public static async analyze(pool: Pool): Promise<SchemaMetadata> {
    const client = await pool.connect();
    try {
      // 1. Get Tables & sizes
      const tablesRes = await client.query(`
        SELECT 
          t.table_name AS name,
          coalesce(c.reltuples, 0)::integer AS row_count,
          pg_total_relation_size(quote_ident(t.table_name))::bigint AS size_bytes
        FROM information_schema.tables t
        JOIN pg_catalog.pg_class c ON c.relname = t.table_name
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE';
      `);

      // 2. Get Columns
      const columnsRes = await client.query(`
        SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable = 'YES' AS is_nullable,
          column_default AS default_value,
          EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
          ) AS is_pk,
          EXISTS (
            SELECT 1 FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = c.table_name AND kcu.column_name = c.column_name AND tc.constraint_type = 'FOREIGN KEY'
          ) AS is_fk
        FROM information_schema.columns c
        WHERE table_schema = 'public';
      `);

      // 3. Get Indexes
      const indexesRes = await client.query(`
        SELECT
          tablename AS table_name,
          indexname AS index_name,
          indexdef AS index_def
        FROM pg_indexes
        WHERE schemaname = 'public';
      `);

      // 4. Get Views
      const viewsRes = await client.query(`
        SELECT table_name AS name, view_definition AS definition
        FROM information_schema.views
        WHERE table_schema = 'public';
      `);

      // 5. Get Functions / Procedures
      const routinesRes = await client.query(`
        SELECT 
          routine_name AS name,
          routine_type AS type,
          routine_definition AS definition,
          data_type AS return_type
        FROM information_schema.routines
        WHERE routine_schema = 'public';
      `);

      // 6. Get Triggers
      const triggersRes = await client.query(`
        SELECT 
          trigger_name AS name,
          event_object_table AS table_name,
          action_statement AS definition,
          action_timing AS timing,
          event_manipulation AS event
        FROM information_schema.triggers
        WHERE trigger_schema = 'public';
      `);

      // Map columns and indexes to tables
      const tables = tablesRes.rows.map((t: any) => {
        const cols = columnsRes.rows
          .filter((c: any) => c.table_name === t.name)
          .map((c: any) => ({
            name: c.column_name,
            type: c.data_type,
            isNullable: c.is_nullable,
            isPk: c.is_pk,
            isFk: c.is_fk,
            default: c.default_value
          }));

        const idxs = indexesRes.rows
          .filter((i: any) => i.table_name === t.name)
          .map((i: any) => ({
            name: i.index_name,
            definition: i.index_def
          }));

        return {
          name: t.name,
          rowCount: t.row_count,
          sizeBytes: t.size_bytes,
          columns: cols,
          indexes: idxs
        };
      });

      const views = viewsRes.rows;
      const functions = routinesRes.rows.filter((r: any) => r.type === 'FUNCTION');
      const procedures = routinesRes.rows.filter((r: any) => r.type === 'PROCEDURE');
      const triggers = triggersRes.rows;

      return {
        tables,
        views,
        functions,
        procedures,
        triggers
      };
    } finally {
      client.release();
    }
  }
}
