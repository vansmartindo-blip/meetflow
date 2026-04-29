import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromHeaders } from '@/lib/auth'
import { randomUUID } from 'crypto'

// GET /api/meetings - Get user's meetings history
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request.headers)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get hosted meetings
    const hostedMeetings = await db.meeting.findMany({
      where: { hostId: payload.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        _count: { select: { participants: true } }
      }
    })

    // Get participated meetings
    const participatedMeetings = await db.meetingParticipant.findMany({
      where: { userId: payload.userId },
      orderBy: { joinedAt: 'desc' },
      take: 20,
      include: {
        meeting: {
          include: {
            _count: { select: { participants: true } }
          }
        }
      }
    })

    return NextResponse.json({ hostedMeetings, participatedMeetings })
  } catch (error) {
    console.error('Get meetings error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/meetings - Create meeting
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromHeaders(request.headers)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const body = await request.json()
    const { title, password } = body

    const meetingId = randomUUID().replace(/-/g, '').slice(0, 12)

    const meeting = await db.meeting.create({
      data: {
        id: meetingId,
        title: title || `Meeting ${meetingId.slice(0, 6)}`,
        hostId: payload.userId,
        password: password || null,
      }
    })

    return NextResponse.json({
      meeting: {
        id: meeting.id,
        title: meeting.title,
        hostId: meeting.hostId,
        createdAt: meeting.createdAt
      }
    })
  } catch (error) {
    console.error('Create meeting error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
