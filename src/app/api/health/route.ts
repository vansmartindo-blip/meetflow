import { NextResponse } from 'next/server'
import { testDbConnection } from '@/lib/db'

// GET /api/health — Check database connectivity
// After deploying to Vercel, visit /api/health to diagnose issues
export async function GET() {
  const hasDbUrl = !!process.env.DATABASE_URL
  const dbUrlPreview = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@').slice(0, 80) + '...'
    : 'NOT SET'

  const dbTest = await testDbConnection()

  return NextResponse.json({
    status: dbTest.ok ? 'ok' : 'error',
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
    database: {
      configured: hasDbUrl,
      urlPreview: dbUrlPreview,
      connected: dbTest.ok,
      error: dbTest.error || null,
    },
    hints: !dbTest.ok ? getHints(dbTest.error) : [],
  }, {
    status: dbTest.ok ? 200 : 503,
  })
}

function getHints(error?: string): string[] {
  const hints: string[] = []

  if (!process.env.DATABASE_URL) {
    hints.push('DATABASE_URL is not set. Go to Vercel > Settings > Environment Variables and add it.')
  }

  if (process.env.DATABASE_URL?.startsWith('file:') || process.env.DATABASE_URL?.startsWith('sqlite:')) {
    hints.push('DATABASE_URL uses SQLite. Vercel requires PostgreSQL. Use Neon (neon.tech) for free PostgreSQL.')
  }

  if (error?.includes('SSL') || error?.includes('ssl')) {
    hints.push('SSL error. Add ?sslmode=require to your DATABASE_URL.')
  }

  if (error?.includes('authentication') || error?.includes('password')) {
    hints.push('Database auth failed. Double-check your DATABASE_URL username and password.')
  }

  if (error?.includes('relation') && error?.includes('does not exist')) {
    hints.push('Tables not found. Run: npx prisma db push')
  }

  if (error?.includes('too many connections') || error?.includes('pool')) {
    hints.push('Connection pool exhausted. For Neon: use the pooled URL (ends with -pooler)')
  }

  if (error?.includes('must start with the protocol')) {
    hints.push('DATABASE_URL format wrong. It must start with postgresql:// or postgres://')
  }

  if (hints.length === 0 && error) {
    hints.push(`Error: ${error}`)
  }

  return hints
}
