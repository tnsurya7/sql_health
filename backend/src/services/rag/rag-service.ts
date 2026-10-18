import { prisma, logger } from "../../server";
import { SEED_KNOWLEDGE_DOCS } from "./knowledge-data";

export interface RagSearchResult {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkTitle: string;
  content: string;
  category: string;
  databaseType: string;
  score: number; // Relevance score 0.0 - 1.0
  source: string;
}

export interface RagRetrievalQuery {
  sql?: string;
  databaseType?: string;
  category?: string;
  ruleCodes?: string[];
  keywords?: string[];
  limit?: number;
}

export class RagService {
  /**
   * Initializes the knowledge base with seed optimization documents if empty.
   */
  public static async seedIfEmpty(): Promise<void> {
    try {
      const count = await prisma.optimizationDocument.count();
      if (count === 0) {
        logger.info("[RagService] Seeding RAG knowledge base in PostgreSQL application database...");
        for (const doc of SEED_KNOWLEDGE_DOCS) {
          const createdDoc = await prisma.optimizationDocument.create({
            data: {
              title: doc.title,
              category: doc.category,
              databaseType: doc.databaseType,
              source: doc.source,
              version: doc.version,
            },
          });

          for (const chunk of doc.chunks) {
            await prisma.optimizationChunk.create({
              data: {
                documentId: createdDoc.id,
                title: chunk.title,
                content: chunk.content,
                keywords: chunk.keywords,
                category: chunk.category,
                databaseType: chunk.databaseType,
                retrievalCount: 0,
              },
            });
          }
        }
        logger.info("[RagService] RAG knowledge base seeded successfully with expert optimization guides.");
      }
    } catch (err: any) {
      logger.error(`[RagService] Error during RAG seed check: ${err.message}`);
      throw err;
    }
  }

  /**
   * Hybrid RAG Retrieval: Combines keyword overlap, category filtering, database dialect matching, and rule relevance.
   */
  public static async retrieveRelevantKnowledge(query: RagRetrievalQuery): Promise<RagSearchResult[]> {
    await RagService.seedIfEmpty();

    const dbType = (query.databaseType || "postgresql").toLowerCase();
    const limit = query.limit || 4;

    // Load chunks compatible with database dialect (matching dbType or 'ALL')
    const chunks = await prisma.optimizationChunk.findMany({
      where: {
        OR: [{ databaseType: "ALL" }, { databaseType: dbType }],
      },
      include: {
        document: true,
      },
    });

    if (chunks.length === 0) {
      return [];
    }

    // Build query token set
    const queryTokens = new Set<string>();
    if (query.keywords) {
      query.keywords.forEach((k) => queryTokens.add(k.toLowerCase()));
    }
    if (query.ruleCodes) {
      query.ruleCodes.forEach((r) => queryTokens.add(r.toLowerCase()));
    }
    if (query.sql) {
      // Extract words from SQL
      const words = query.sql
        .toLowerCase()
        .replace(/[^a-zA-Z0-9_]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2);
      words.forEach((w) => queryTokens.add(w));
    }

    // Score each chunk
    const scoredResults: RagSearchResult[] = [];

    for (const chunk of chunks) {
      let score = 0;

      // 1. Keyword overlap
      const chunkKeywords = (chunk.keywords as string[]).map((k: string) => k.toLowerCase());
      for (const kw of chunkKeywords) {
        if (queryTokens.has(kw)) {
          score += 0.25;
        }
        for (const token of queryTokens) {
          if (kw.includes(token) || token.includes(kw)) {
            score += 0.1;
          }
        }
      }

      // 2. Content text match
      const contentLower = chunk.content.toLowerCase();
      for (const token of queryTokens) {
        if (token.length > 3 && contentLower.includes(token)) {
          score += 0.05;
        }
      }

      // 3. Category match bonus
      if (query.category && chunk.category.toUpperCase() === query.category.toUpperCase()) {
        score += 0.3;
      }

      // 4. Exact database match bonus
      if (chunk.databaseType.toLowerCase() === dbType) {
        score += 0.15;
      }

      // Normalize score between 0.1 and 0.99
      const normalizedScore = Number(Math.min(0.99, Math.max(0.1, score)).toFixed(2));

      scoredResults.push({
        id: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        chunkTitle: chunk.title,
        content: chunk.content,
        category: chunk.category,
        databaseType: chunk.databaseType,
        score: normalizedScore,
        source: chunk.document.source,
      });
    }

    // Sort descending by score
    scoredResults.sort((a, b) => b.score - a.score);
    const topResults = scoredResults.slice(0, limit);

    // Increment retrieval counts asynchronously
    for (const res of topResults) {
      prisma.optimizationChunk
        .update({
          where: { id: res.id },
          data: { retrievalCount: { increment: 1 } },
        })
        .catch(() => {});
    }

    return topResults;
  }

  /**
   * Search knowledge base by full-text query.
   */
  public static async search(searchTerm: string, limit: number = 10): Promise<RagSearchResult[]> {
    return await RagService.retrieveRelevantKnowledge({
      keywords: searchTerm.split(/\s+/),
      limit,
    });
  }

  /**
   * Adds a new document with chunks to the knowledge base.
   */
  public static async addDocument(data: {
    title: string;
    category: string;
    databaseType: string;
    source: string;
    content: string;
    keywords?: string[];
  }): Promise<void> {
    const doc = await prisma.optimizationDocument.create({
      data: {
        title: data.title,
        category: data.category,
        databaseType: data.databaseType,
        source: data.source || "User Contributed",
        version: "1.0",
      },
    });

    await prisma.optimizationChunk.create({
      data: {
        documentId: doc.id,
        title: data.title,
        content: data.content,
        keywords: data.keywords || [],
        category: data.category,
        databaseType: data.databaseType,
        retrievalCount: 0,
      },
    });
  }

  /**
   * Deletes a knowledge document and its associated chunks.
   */
  public static async deleteDocument(documentId: string): Promise<void> {
    await prisma.optimizationDocument.delete({
      where: { id: documentId },
    });
  }

  /**
   * Lists all knowledge documents and chunks with statistics.
   */
  public static async listAll(): Promise<any[]> {
    await RagService.seedIfEmpty();
    return await prisma.optimizationDocument.findMany({
      include: {
        chunks: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
