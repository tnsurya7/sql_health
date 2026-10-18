import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import path from "path";
import { SEED_KNOWLEDGE_DOCS } from "../src/services/rag/knowledge-data";

// Load environment variables reliably across cross-platform paths
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // 1. Seed default admin user idempotently
  const email = "admin@localhost";
  const password = "admin";
  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {}, // Preserve existing admin user data without overwriting passwords
    create: {
      email,
      password: hashedPassword,
    },
  });

  console.log(`✅ Default admin user verified: ${user.email} (password: admin)`);

  // 2. Seed RAG knowledge base documents idempotently
  const docCount = await prisma.optimizationDocument.count();
  if (docCount === 0) {
    console.log("📚 Seeding RAG knowledge base with expert optimization guides...");
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
    console.log(`✅ RAG knowledge base seeded successfully with ${SEED_KNOWLEDGE_DOCS.length} expert guides.`);
  } else {
    console.log(`✅ RAG knowledge base already initialized (${docCount} document(s) present).`);
  }
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
