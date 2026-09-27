import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// ============================================================
// Gemini Response Schema
// ============================================================

export const GeminiResponseSchema = z.object({
  summary: z.string(),

  optimizedSql: z.string(),

  issues: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),

        severity: z.enum([
          "CRITICAL",
          "HIGH",
          "MEDIUM",
          "LOW",
          "INFO",
        ]),

        category: z.string(),
        evidence: z.string(),
        recommendation: z.string(),
        confidence: z.number().min(0).max(1),
      })
    )
    .default([]),

  indexRecommendations: z
    .array(
      z.object({
        table: z.string(),
        columns: z.array(z.string()),
        reason: z.string(),
        sql: z.string(),
      })
    )
    .default([]),

  refactoringSuggestions: z.array(z.string()).default([]),

  risks: z.array(z.string()).default([]),

  confidence: z
    .number()
    .min(0)
    .max(1)
    .default(0.8),
});

export type GeminiResponse = z.infer<
  typeof GeminiResponseSchema
>;

// ============================================================
// Gemini Service
// ============================================================

export class GeminiService {
  // ----------------------------------------------------------
  // Get Gemini Client
  // ----------------------------------------------------------

  private static getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;

    if (
      !apiKey ||
      apiKey.trim() === "" ||
      apiKey === "your_gemini_api_key_here"
    ) {
      throw new Error(
        "GEMINI_API_KEY is not configured."
      );
    }

    return new GoogleGenAI({
      apiKey,
    });
  }

  // ----------------------------------------------------------
  // Get Configured Model
  // ----------------------------------------------------------

  private static getModelName(): string {
    return (
      process.env.GEMINI_MODEL ||
      "gemini-3.8-flash"
    );
  }

  // ----------------------------------------------------------
  // Check Gemini Availability
  // ----------------------------------------------------------

  public static isAvailable(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;

    return Boolean(
      apiKey &&
        apiKey.trim() !== "" &&
        apiKey !== "your_gemini_api_key_here"
    );
  }

  // ==========================================================
  // Optimize SQL Query
  // ==========================================================

  public static async optimizeQuery(
    sql: string,
    dbType: string = "PostgreSQL",
    schemaContext: string = ""
  ): Promise<GeminiResponse> {
    try {
      const ai = GeminiService.getClient();
      const model = GeminiService.getModelName();

      // ------------------------------------------------------
      // Gemini Prompt
      // ------------------------------------------------------

      const prompt = `
You are an expert Database Performance Engineer
and SQL optimization assistant.

Analyze the following SQL query for ${dbType}.

IMPORTANT ROLE OF GEMINI:

Gemini is an AI candidate generator.

SQLSense will independently:

1. Parse the SQL.
2. Analyze the AST.
3. Apply deterministic optimization rules.
4. Apply relational algebra transformations.
5. Analyze indexes.
6. Analyze execution plans.
7. Perform cost-based optimization.
8. Validate semantic correctness.
9. Run EXPLAIN validation.
10. Compare candidate costs.

Therefore:

- Do NOT claim that an optimization is definitely faster.
- Do NOT fabricate benchmark results.
- Do NOT fabricate execution costs.
- Do NOT invent database objects.
- Do NOT invent tables.
- Do NOT invent columns.
- Do NOT invent relationships.
- Preserve the semantic result of the original query.
- Generate only a safe SELECT candidate.
- Do not execute SQL.
- Do not generate destructive SQL.

============================================================
ORIGINAL SQL
============================================================

\`\`\`sql
${sql}
\`\`\`

============================================================
DATABASE TYPE
============================================================

${dbType}

============================================================
DATABASE SCHEMA INFORMATION
============================================================

${schemaContext || "No schema information provided."}

============================================================
OPTIMIZATION REQUIREMENTS
============================================================

Look for safe opportunities such as:

- Predicate pushdown
- Sargable predicate transformation
- Subquery unnesting
- Redundant predicate removal
- Constant folding
- Join optimization
- DISTINCT elimination where provably safe
- Index alignment
- Query simplification
- Other semantics-preserving transformations

Do NOT make assumptions that are not supported by
the supplied schema.

If there is no meaningful safe optimization,
return the original SQL.

============================================================
SQL SAFETY
============================================================

The optimizedSql MUST:

- Be a SELECT statement.
- Not contain INSERT.
- Not contain UPDATE.
- Not contain DELETE.
- Not contain DROP.
- Not contain ALTER.
- Not contain TRUNCATE.
- Not contain CREATE.
- Not contain GRANT.
- Not contain REVOKE.
- Not contain destructive statements.
- Not invent schema objects.

============================================================
OUTPUT
============================================================

Return ONLY valid JSON.

The JSON must have exactly this structure:

{
  "summary": "High-level summary of the optimization.",
  "optimizedSql": "SELECT ...",

  "issues": [
    {
      "id": "RULE-AI-001",
      "title": "Issue title",
      "description": "Why this may be an issue",
      "severity": "HIGH",
      "category": "Performance",
      "evidence": "Relevant SQL fragment",
      "recommendation": "Recommended action",
      "confidence": 0.95
    }
  ],

  "indexRecommendations": [
    {
      "table": "table_name",
      "columns": ["column_name"],
      "reason": "Why the index may help",
      "sql": "CREATE INDEX ..."
    }
  ],

  "refactoringSuggestions": [
    "Suggestion"
  ],

  "risks": [
    "Potential risk"
  ],

  "confidence": 0.90
}

The confidence values must be between 0 and 1.

The optimizedSql MUST be a SELECT statement.
`;

      // ------------------------------------------------------
      // Gemini Request
      // ------------------------------------------------------

      console.log(
        `[GeminiService] Generating SQL optimization using ${model}`
      );

      const response =
        await ai.models.generateContent({
          model,
          contents: prompt,

          config: {
            responseMimeType: "application/json",
          },
        });

      // ------------------------------------------------------
      // Read Response
      // ------------------------------------------------------

      const responseText =
        response.text?.trim();

      if (!responseText) {
        throw new Error(
          "Empty response returned from Gemini."
        );
      }

      console.log(
        "[GeminiService] Gemini response received."
      );

      // ------------------------------------------------------
      // Parse JSON
      // ------------------------------------------------------

      let rawJson: unknown;

      try {
        rawJson = JSON.parse(responseText);
      } catch (parseError: any) {
        throw new Error(
          `Gemini returned invalid JSON: ${parseError.message}`
        );
      }

      // ------------------------------------------------------
      // Validate with Zod
      // ------------------------------------------------------

      const validated =
        GeminiResponseSchema.safeParse(
          rawJson
        );

      if (!validated.success) {
        throw new Error(
          `Gemini response failed schema validation: ${validated.error.message}`
        );
      }

      // ------------------------------------------------------
      // Validate SQL
      // ------------------------------------------------------

      const optimizedSql =
        validated.data.optimizedSql.trim();

      if (
        !/^select\b/i.test(
          optimizedSql
        )
      ) {
        throw new Error(
          "Gemini returned a non-SELECT SQL statement."
        );
      }

      // ------------------------------------------------------
      // Additional destructive SQL protection
      // ------------------------------------------------------

      const forbiddenStatements =
        /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

      if (
        forbiddenStatements.test(
          optimizedSql
        )
      ) {
        throw new Error(
          "Gemini candidate contains a forbidden SQL operation."
        );
      }

      // ------------------------------------------------------
      // Return validated result
      // ------------------------------------------------------

      return {
        ...validated.data,
        optimizedSql,
      };
    } catch (error: any) {
      // ------------------------------------------------------
      // Deterministic Fallback
      // ------------------------------------------------------

      console.error(
        "[GeminiService] Optimization failed:",
        error?.message || error
      );

      return {
        summary:
          "Gemini API unavailable or failed. SQLSense will use its deterministic optimization pipeline.",

        optimizedSql: sql,

        issues: [],

        indexRecommendations: [],

        refactoringSuggestions: [
          "Verify GEMINI_API_KEY and GEMINI_MODEL configuration.",
        ],

        risks: [],

        confidence: 0.5,
      };
    }
  }

  // ==========================================================
  // Explain SQL Query
  // ==========================================================

  public static async explainQuery(
    sql: string
  ): Promise<string> {
    try {
      const ai = GeminiService.getClient();
      const model = GeminiService.getModelName();

      const prompt = `
You are a senior database performance engineer.

Explain the following SQL query clearly.

Explain:

1. What the query does.
2. Tables involved.
3. Columns involved.
4. Joins.
5. Filtering conditions.
6. Indexing considerations.
7. Potential performance considerations.

Do not invent schema information.

Do not claim benchmark results.

Do not fabricate execution plans.

SQL:

\`\`\`sql
${sql}
\`\`\`
`;

      console.log(
        `[GeminiService] Generating SQL explanation using ${model}`
      );

      const response =
        await ai.models.generateContent({
          model,
          contents: prompt,
        });

      const text =
        response.text?.trim();

      return (
        text ||
        "No explanation returned from Gemini."
      );
    } catch (error: any) {
      console.error(
        "[GeminiService] Explanation failed:",
        error?.message || error
      );

      return (
        "Gemini API unavailable. Please verify your GEMINI_API_KEY and GEMINI_MODEL configuration."
      );
    }
  }
}