import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migraciones",
  dialect: "postgresql",
  dbCredentials: {
    // Para migraciones usar la URL directa (sin -pooler).
    url: process.env.DATABASE_URL_DIRECTA ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
