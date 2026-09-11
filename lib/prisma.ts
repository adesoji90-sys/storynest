// Prisma Client for the running app — a different setup than what
// migrations use. Prisma 7 removed the built-in query engine binary in
// favor of requiring an explicit "driver adapter": a real database
// driver (here, node-postgres / `pg`) that Prisma's JS query compiler
// talks through, rather than a separate Rust binary. This is mandatory
// in v7, not an optional performance tweak.
//
// This connects via DATABASE_URL — the POOLED connection (port 6543,
// ?pgbouncer=true) — deliberately different from what prisma.config.ts
// uses for migrations (DIRECT_URL, port 5432). The running app makes
// many short-lived concurrent queries across serverless function
// invocations, which is exactly what a connection pooler is for;
// migrations need the direct connection because PgBouncer's transaction
// mode can't support the schema-locking operations Prisma Migrate runs.
//
// Singleton pattern: in Next.js dev mode, every file edit triggers a
// module reload, which would create a brand new PrismaClient (and a
// brand new `pg.Pool`) on every save if this file just did
// `export const prisma = new PrismaClient(...)` directly — quickly
// exhausting Supabase's connection limit. Stashing the instance on
// `globalThis` survives module reloads in dev while still behaving like
// a normal fresh singleton in production (where this module only loads
// once per serverless function cold start anyway).

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set — see .env.example. This must be the POOLED Supabase connection string (port 6543, with ?pgbouncer=true), not the direct one used for migrations."
    );
  }

  const pool = new Pool({
    connectionString,
    // Prisma ORM v7's upgrade guide flags this explicitly: the `pg`
    // driver has no connection timeout by default, unlike Prisma's old
    // built-in engine which used 5s. Set explicitly so a genuinely
    // unreachable database fails fast instead of hanging a serverless
    // function until Vercel's own timeout kills it.
    connectionTimeoutMillis: 5000,
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
