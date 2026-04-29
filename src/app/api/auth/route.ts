import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/auth'

function getErrorDetails(error: unknown): { message: string; code?: string } {
  if (error instanceof Error) {
    const msg = error.message
    // Common Prisma/DB errors
    if (msg.includes("Can't reach database server") || msg.includes('connect ETIMEDOUT') || msg.includes('ECONNREFUSED')) {
      return { message: 'Database connection failed. Check DATABASE_URL in Vercel env vars.', code: 'DB_CONNECTION' }
    }
    if (msg.includes('relation') && msg.includes('does not exist')) {
      return { message: 'Database tables not found. Run "prisma db push" on your PostgreSQL database.', code: 'DB_MIGRATION' }
    }
    if (msg.includes('SSL') || msg.includes('self-signed')) {
      return { message: 'Database SSL error. Add ?sslmode=require to your DATABASE_URL.', code: 'DB_SSL' }
    }
    if (msg.includes('authentication failed') || msg.includes('password authentication')) {
      return { message: 'Database auth failed. Check DATABASE_URL credentials.', code: 'DB_AUTH' }
    }
    if (msg.includes('too many connections') || msg.includes('connection_limit')) {
      return { message: 'Too many DB connections. Use pooled URL (Neon: add -pooler to hostname).', code: 'DB_POOL' }
    }
    // In production, hide details; in dev, show them
    if (process.env.NODE_ENV === 'development') {
      return { message: msg }
    }
    return { message: 'Internal server error' }
  }
  return { message: 'Internal server error' }
}

// POST /api/auth
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, email, password, name } = body

    if (action === 'register') {
      if (!email || !password || !name) {
        return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 })
      }

      const existing = await db.user.findUnique({ where: { email } })
      if (existing) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
      }

      const hashedPassword = await bcrypt.hash(password, 10)
      const user = await db.user.create({
        data: { email, password: hashedPassword, name }
      })

      const token = generateToken({ userId: user.id, email: user.email, name: user.name, role: user.role })
      return NextResponse.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } })
    }

    if (action === 'login') {
      if (!email || !password) {
        return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
      }

      const user = await db.user.findUnique({ where: { email } })
      if (!user) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      const isValid = await bcrypt.compare(password, user.password)
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      const token = generateToken({ userId: user.id, email: user.email, name: user.name, role: user.role })
      return NextResponse.json({ token, user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar } })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Auth error:', error)
    const details = getErrorDetails(error)
    return NextResponse.json(
      { error: details.message, code: details.code },
      { status: 500 }
    )
  }
}
