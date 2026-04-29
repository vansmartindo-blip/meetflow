import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'meeting-app-secret-key-change-in-production-2024'

export interface JWTPayload {
  userId: string
  email: string
  name: string
  role: string
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload
  } catch {
    return null
  }
}

export function getTokenFromHeaders(headers: Headers): string | null {
  const auth = headers.get('authorization')
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7)
  }
  return null
}
