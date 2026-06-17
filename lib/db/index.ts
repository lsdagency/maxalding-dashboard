import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { getConnectionString } from "@netlify/database";
import * as schema from "./schema";

// Resolution order (matches the PHYT dashboard):
//   explicit DATABASE_URL → NETLIFY_DATABASE_URL env var → Netlify DB's runtime
//   resolver (auto-provisions Neon on Netlify; throws off-platform).
// All three are Neon Postgres on the same driver.
function resolveUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NETLIFY_DATABASE_URL) return process.env.NETLIFY_DATABASE_URL;
  try {
    const cs = getConnectionString();
    if (typeof cs === "string" && cs.length > 0) return cs;
  } catch {
    // Not running on Netlify — no database configured.
  }
  return undefined;
}

const url = resolveUrl();

/** True once a Neon connection string is configured. */
export const dbAvailable = Boolean(url);

/** Drizzle client, or null when no database is configured. */
export const db = url ? drizzle(neon(url), { schema }) : null;

export { schema };
