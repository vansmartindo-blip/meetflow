import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// In production (Vercel), disable query logging and use connection pooling.
// In development, enable query logging for easier debugging.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : ['error'],
    datasourceUrl: process.env.DATABASE_URL,
    // Connection limits for serverless (Vercel)
    // Each serverless function gets its own connection
    ...(process.env.NODE_ENV === 'production'
      ? {
          // Avoid connection exhaustion in serverless
          datasources: {
            db: {
              url: process.env.DATABASE_URL,
            },
          },
        }
      : {}),
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
