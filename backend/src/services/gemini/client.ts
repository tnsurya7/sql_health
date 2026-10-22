import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { logger } from "../../server";
import { RagSearchResult } from "../rag/rag-service";

/**
 * Structured output returned by Gemini.
 *
 * Gemini is used only as an AI candidate generator.
 * The generated candidate is still validated and evaluated
 * by SQLSense's deterministic optimization pipeline.
 */
export const GeminiCandidateSchema = z.object({
  candidateSql: z.string().default(""),

  summary: z.string().default(""),

  changes: z
    .array(
      z.object({
        type: z.string(),
        description: z.string(),
      })
    )
    .default([]),

  assumptions: z.array(z.string()).default([]),

  risks: z.array(z.string()).default([]),

  confidence: z.number().min(0).max(1).default(0.5),

  status: z
    .enum([
      "SUCCESS",
      "INSUFFICIENT_SCHEMA_INFORMATION",
      "NO_OPTIMIZATION_FOUND",
    ])
    .default("SUCCESS"),
});

export type GeminiCandidateOutput = z.infer<
  typeof GeminiCandidateSchema
>;

export interface GeminiContext {
  sql: string;
  databaseType: string;
  astSummary: string;
  schemaMetadata: string;
  indexes: string;
  detectedIssues: string[];
  ragContext: RagSearchResult[];
  algorithmicCandidates?: string[];
}

export class GeminiService {
  private static genAI: GoogleGenAI | null = null;

  /**
   * Returns the configured Gemini client.
   *
   * The API key is read from the backend environment only.
   * The key is never exposed to the frontend.
   */
  private static getClient(): GoogleGenAI | null {
    const apiKey = process.env.GEMINI_API_KEY;

    if (
      !apiKey ||
      apiKey.trim() === "" ||
      apiKey === "your_gemini_api_key_here"
    ) {
      return null;
    }

    if (!GeminiService.genAI) {
      GeminiService.genAI = new GoogleGenAI({
        apiKey,
      });
    }

    return GeminiService.genAI;
  }

  /**
   * Indicates whether Gemini credentials are configured.
   *
   * Note:
   * This only confirms that an API key exists.
   * Actual model generation is still handled and validated
   * inside generateCandidate().
   */
  public static isAvailable(): boolean {
    const apiKey = process.env.GEMINI_API_KEY;

    return Boolean(
      apiKey &&
        apiKey.trim() !== "" &&
        apiKey !== "your_gemini_api_key_here"
    );
  }

  /**
   * Generates a structured SQL optimization candidate
   * using Gemini + RAG + algorithmic context.
   *
   * Gemini does NOT replace the deterministic optimizer.
   * Its output enters the same downstream validation/CBO
   * pipeline as other candidates.
   */
  public static async generateCandidate(
    ctx: GeminiContext
  ): Promise<GeminiCandidateOutput | null> {
    const client = GeminiService.getClient();

    if (!client) {
      logger.info(
        "[GeminiService] Gemini API key not configured. Using deterministic algorithmic optimizer."
      );

      return null;
    }

    const modelName =
      process.env.GEMINI_MODEL || "gemini-3.8-flash";

    const ragSnippets = ctx.ragContext
      .map(
        (r, i) =>
          `[RAG Doc ${i + 1}] (${r.category} - ${r.source}): ${
            r.chunkTitle
          }\n${r.content}`
      )
      .join("\n\n");

    const algorithmicCandidates =
      ctx.algorithmicCandidates?.length
        ? ctx.algorithmicCandidates.join("\n\n")
        : "None";

    const detectedIssues =
      ctx.detectedIssues.length > 0
        ? ctx.detectedIssues.join("\n")
        : "None";

    const prompt = `
You are a senior Database Performance Architect.

Your task is to generate ONE safe SQL optimization candidate
for the supplied query.

Target Database Dialect:
${ctx.databaseType.toUpperCase()}

IMPORTANT ROLE OF GEMINI:
- Gemini is an AI candidate generator.
- Do NOT assume your candidate is automatically better.
- Do NOT claim a performance improvement without evidence.
- SQLSense will independently validate the candidate.
- SQLSense will independently run EXPLAIN/CBO evaluation.
- Preserve the exact semantic result set.
- Never invent schema objects.

### Original SQL

\`\`\`sql
${ctx.sql}
\`\`\`

### AST Analysis Summary

${ctx.astSummary}

### Database Schema Context

${ctx.schemaMetadata || "No explicit schema provided."}

### Existing Indexes

${ctx.indexes || "No active indexes provided."}

### Detected Anti-Pattern Issues

${detectedIssues}

### Retrieved RAG Optimization Knowledge

${ragSnippets || "No specific RAG guidelines matched."}

### Algorithmic Baseline Candidates

${algorithmicCandidates}

### STRICT SQL SAFETY CONSTRAINTS

1. Do NOT invent tables.

2. Do NOT invent columns.

3. Do NOT invent relationships.

4. Do NOT reference schema objects that are not present
   in the supplied schema metadata.

5. Maintain identical semantic result sets.

6. Do NOT remove required joins.

7. Do NOT remove predicates that affect the result set.

8. Do NOT introduce destructive SQL.

9. Do NOT use INSERT, UPDATE, DELETE, DROP, ALTER,
   TRUNCATE, CREATE, GRANT, REVOKE, or other destructive
   statements as the candidate query.

10. The candidate must remain a SELECT query.

11. If schema information is insufficient to safely
    rewrite the query, return:

    "status": "INSUFFICIENT_SCHEMA_INFORMATION"

12. If there is no meaningful safe optimization,
    return:

    "status": "NO_OPTIMIZATION_FOUND"

13. Do not fabricate cost reductions.

14. Do not fabricate benchmark results.

15. Return ONLY valid JSON.

### REQUIRED JSON STRUCTURE

{
  "candidateSql": "SELECT ...",
  "summary": "Concise 1-2 sentence explanation of the optimization.",
  "changes": [
    {
      "type": "PREDICATE_PUSHDOWN",
      "description": "Details of the transformation."
    }
  ],
  "assumptions": [],
  "risks": [],
  "confidence": 0.95,
  "status": "SUCCESS"
}

### ALLOWED CHANGE TYPES

- PREDICATE_PUSHDOWN
- SARGABLE_REWRITE
- JOIN_OPTIMIZATION
- SUBQUERY_UNNESTING
- CONSTANT_FOLDING
- REDUNDANT_PREDICATE_REMOVAL
- INDEX_ALIGNMENT
- DISTINCT_ELIMINATION
- OTHER

The confidence value must be between 0 and 1.
`;

    try {
      logger.info(
        `[GeminiService] Generating optimization candidate using ${modelName}`
      );

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini API call timed out after 6000ms")), 6000)
      );

      const response = await Promise.race([
        client.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        }),
        timeoutPromise,
      ]);

      const text = response.text;

      if (!text || text.trim() === "") {
        logger.warn(
          "[GeminiService] Gemini returned an empty response."
        );

        return null;
      }

      logger.info(
        "[GeminiService] Gemini returned a structured candidate response."
      );

      let parsedJson: unknown;

      try {
        parsedJson = JSON.parse(text);
      } catch (parseError: any) {
        logger.warn(
          `[GeminiService] Gemini returned invalid JSON: ${parseError.message}`
        );

        return null;
      }

      /**
       * Validate the AI response independently.
       *
       * Gemini output is never trusted directly.
       */
      const validated =
        GeminiCandidateSchema.safeParse(parsedJson);

      if (!validated.success) {
        logger.warn(
          `[GeminiService] Gemini response failed Zod validation: ${validated.error.message}`
        );

        return null;
      }

      /**
       * Do not accept non-success responses as optimization
       * candidates.
       */
      if (validated.data.status !== "SUCCESS") {
        logger.info(
          `[GeminiService] Gemini returned status: ${validated.data.status}`
        );

        return validated.data;
      }

      /**
       * Additional application-level safety check:
       * Gemini candidate must be a SELECT query.
       *
       * The complete SQL validation pipeline will perform
       * deeper syntax, semantic, schema and EXPLAIN checks.
       */
      const candidateSql =
        validated.data.candidateSql.trim();

      if (!/^select\b/i.test(candidateSql)) {
        logger.warn(
          "[GeminiService] Gemini candidate rejected because it is not a SELECT statement."
        );

        return null;
      }

      logger.info(
        `[GeminiService] Gemini candidate accepted for downstream validation. Confidence=${validated.data.confidence}`
      );

      return validated.data;
    } catch (err: any) {
      logger.warn(
        `[GeminiService] Gemini optimization request failed: ${err.message}`
      );

      /**
       * Gemini failure must never bring down SQLSense.
       *
       * Deterministic algorithmic candidates remain available.
       */
      return null;
    }
  }

  /**
   * Generates a natural-language explanation of a SQL query.
   *
   * This is separate from optimization candidate generation.
   */
  public static async generateExplanation(
    sql: string,
    dbType: string = "postgresql",
    ragContext: RagSearchResult[] = []
  ): Promise<string | null> {
    const client = GeminiService.getClient();

    if (!client) {
      return null;
    }

    const modelName =
      process.env.GEMINI_MODEL || "gemini-3.8-flash";

    const ragSnippets = ragContext
      .map(
        (r, i) =>
          `[RAG Doc ${i + 1}] (${r.category} - ${r.source}): ${
            r.chunkTitle
          }\n${r.content}`
      )
      .join("\n\n");

    const prompt = `
You are a database performance expert.

Explain this ${dbType.toUpperCase()} SQL query in clear,
technically accurate language.

Cover:

1. What the query does.
2. Tables involved.
3. Joins and relationships.
4. Filtering predicates.
5. Potential indexing considerations.
6. Important performance considerations.

Do not invent schema information.

SQL:

\`\`\`sql
${sql}
\`\`\`

Relevant RAG knowledge:

${ragSnippets || "No additional RAG context available."}
`;

    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini explanation timed out after 6000ms")), 6000)
      );

      const response = await Promise.race([
        client.models.generateContent({
          model: modelName,
          contents: prompt,
        }),
        timeoutPromise,
      ]);

      return response.text || null;
    } catch (err: any) {
      logger.warn(
        `[GeminiService] Explanation generation failed: ${err.message}`
      );

      return null;
    }
  }
}