import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

// Zod Schema to validate Gemini output
export const GeminiResponseSchema = z.object({
  summary: z.string(),
  optimizedSql: z.string(),
  issues: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
    category: z.string(),
    evidence: z.string(),
    recommendation: z.string(),
    confidence: z.number()
  })).default([]),
  indexRecommendations: z.array(z.object({
    table: z.string(),
    columns: z.array(z.string()),
    reason: z.string(),
    sql: z.string()
  })).default([]),
  refactoringSuggestions: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  confidence: z.number().default(0.8)
});

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>;

export class GeminiService {
  private static getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    return new GoogleGenerativeAI(apiKey);
  }

  public static async optimizeQuery(
    sql: string,
    dbType: string = "PostgreSQL",
    schemaContext: string = ""
  ): Promise<GeminiResponse> {
    try {
      const genAI = this.getClient();
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `
      You are an expert Database Performance Engineer and AI optimizer.
      Analyze the following SQL query for ${dbType}.
      
      Query:
      \`\`\`sql
      ${sql}
      \`\`\`

      Database Schema Info:
      ${schemaContext || "No schema provided."}

      Provide a structured JSON output with optimization details.
      The JSON must match the following format EXACTLY:
      {
        "summary": "High-level summary of issues and optimization approach",
        "optimizedSql": "The fully optimized SQL query",
        "issues": [
          {
            "id": "RULE-AI-...",
            "title": "Title of the performance/security issue",
            "description": "Why this is an issue",
            "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO",
            "category": "Performance" | "Security" | "Maintainability" | "Design",
            "evidence": "Specific piece of SQL showing the issue",
            "recommendation": "How to resolve the issue",
            "confidence": 0.95
          }
        ],
        "indexRecommendations": [
          {
            "table": "table_name",
            "columns": ["col1", "col2"],
            "reason": "Why this index helps",
            "sql": "CREATE INDEX idx_name ON table_name(col1, col2);"
          }
        ],
        "refactoringSuggestions": ["Suggestion 1", "Suggestion 2"],
        "risks": ["Risk associated with change, if any"],
        "confidence": 0.9
      }
      `;

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const responseText = response.response.text();
      if (!responseText) throw new Error("Empty response from Gemini.");

      const rawJson = JSON.parse(responseText);
      return GeminiResponseSchema.parse(rawJson);
    } catch (error) {
      console.error("Gemini optimization error:", error);
      return {
        summary: "Gemini API unavailable or failed. Using fallback rule-based analysis.",
        optimizedSql: sql,
        issues: [],
        indexRecommendations: [],
        refactoringSuggestions: ["Configure a valid GEMINI_API_KEY in the .env file to enable AI optimization."],
        risks: [],
        confidence: 0.5
      };
    }
  }

  public static async explainQuery(sql: string): Promise<string> {
    try {
      const genAI = this.getClient();
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent(`Explain what this SQL query does in clear plain English: \n\n ${sql}`);
      return response.response.text() || "No explanation returned.";
    } catch {
      return "Gemini API unavailable. Please verify your GEMINI_API_KEY configuration.";
    }
  }
}
