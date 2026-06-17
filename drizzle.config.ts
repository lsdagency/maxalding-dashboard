import { defineConfig } from "drizzle-kit";

// Netlify DB injects NETLIFY_DATABASE_URL; fall back to DATABASE_URL for local/dev.
const connectionString =
  process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || "";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
