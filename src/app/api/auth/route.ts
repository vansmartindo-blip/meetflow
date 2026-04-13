import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { generateToken } from '@/lib/auth'

// POST /api/auth/register
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, email, password, name } = body

    if (action === 'register') {
      // Register
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
      // Login
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
