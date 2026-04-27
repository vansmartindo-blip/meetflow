import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma reads DATABASE_URL from schema.prisma's env("DATABASE_URL") at connection time.
// Do NOT pass datasourceUrl to the constructor — it causes build failures when
// DATABASE_URL is not available at build time (e.g., during next build).
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Helper to test database connection
export async function testDbConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.$connect()
    await db.$queryRaw`SELECT 1`
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  } finally {
    await db.$disconnect()
  }
}
