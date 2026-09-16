import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 requires a driver adapter — there's no more "just pass a
 * connection string to PrismaClient" like in v6. The adapter wraps the
 * `pg` driver's connection pool.
 */
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

/**
 * Next.js dev mode hot-reloads modules, which would otherwise create a new
 * PrismaClient (and a new DB connection pool) on every file save. Caching the
 * instance on `globalThis` avoids that.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
