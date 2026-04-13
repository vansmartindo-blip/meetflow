import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyToken, getTokenFromHeaders } from '@/lib/auth'

// GET /api/meetings/[id] - Get meeting info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = getTokenFromHeaders(request.headers)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const meeting = await db.meeting.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: true }
        },
        _count: { select: { participants: true, chatMessages: true, sharedFiles: true } }
      }
    })

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }

    return NextResponse.json({ meeting })
  } catch (error) {
    console.error('Get meeting error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/meetings/[id] - End meeting
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = getTokenFromHeaders(request.headers)
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const meeting = await db.meeting.findUnique({ where: { id } })
    if (!meeting || meeting.hostId !== payload.userId) {
      return NextResponse.json({ error: 'Not authorized or meeting not found' }, { status: 403 })
    }

    await db.meeting.update({
      where: { id },
      data: { status: 'ended', endedAt: new Date() }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('End meeting error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
