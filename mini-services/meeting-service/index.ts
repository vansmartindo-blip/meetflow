import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

// ============ Types ============
interface PeerInfo {
  id: string
  socketId: string
  name: string
  avatar?: string
  role: 'host' | 'participant'
  isMuted: boolean
  isCameraOff: boolean
  isHandRaised: boolean
  joinedAt: number
}

interface RoomInfo {
  id: string
  title: string
  hostId: string
  isLocked: boolean
  password?: string
  screenShareEnabled: boolean
  peers: Map<string, PeerInfo>
}

interface ChatMessage {
  id: string
  userId: string
  userName: string
  content: string
  type: 'text' | 'system' | 'reaction' | 'file'
  fileUrl?: string
  fileName?: string
  timestamp: number
}

interface Reaction {
  userId: string
  userName: string
  emoji: string
  timestamp: number
}

// ============ State ============
const rooms = new Map<string, RoomInfo>()
const userRooms = new Map<string, string>() // socketId -> roomId

const genId = () => Math.random().toString(36).substr(2, 12)

// ============ Helper Functions ============
function getRoom(roomId: string): RoomInfo | undefined {
  return rooms.get(roomId)
}

function getPeerList(roomId: string): PeerInfo[] {
  const room = rooms.get(roomId)
  return room ? Array.from(room.peers.values()) : []
}

function broadcastToRoom(roomId: string, event: string, data: any, exclude?: string) {
  const room = rooms.get(roomId)
  if (!room) return
  room.peers.forEach((peer) => {
    if (exclude && peer.socketId === exclude) return
    io.to(peer.socketId).emit(event, data)
  })
}

function sendSystemMessage(roomId: string, content: string) {
  const msg: ChatMessage = {
    id: genId(),
    userId: 'system',
    userName: 'System',
    content,
    type: 'system',
    timestamp: Date.now()
  }
  broadcastToRoom(roomId, 'chat-message', msg)
}

// ============ Socket Handlers ============
io.on('connection', (socket) => {
  console.log(`[Meeting] User connected: ${socket.id}`)

  // ---- Join Room ----
  socket.on('join-room', (data: { roomId: string; user: { id: string; name: string; avatar?: string } }) => {
    const { roomId, user } = data

    // Check if room exists, create if not
    let room = rooms.get(roomId)
    if (!room) {
      room = {
        id: roomId,
        title: `Meeting ${roomId.slice(0, 6)}`,
        hostId: user.id,
        isLocked: false,
        screenShareEnabled: true,
        peers: new Map()
      }
      rooms.set(roomId, room)
    }

    // Check if room is locked
    if (room.isLocked) {
      socket.emit('room-locked', { roomId, message: 'This meeting is locked.' })
      return
    }

    // Check max users
    if (room.peers.size >= 20) {
      socket.emit('room-full', { roomId, message: 'This meeting is full (max 20 users).' })
      return
    }

    // Determine role
    const isFirstUser = room.peers.size === 0
    const role = isFirstUser ? 'host' : 'participant'
    if (isFirstUser) {
      room.hostId = user.id
    }

    // Add peer
    const peer: PeerInfo = {
      id: user.id,
      socketId: socket.id,
      name: user.name,
      avatar: user.avatar,
      role,
      isMuted: false,
      isCameraOff: false,
      isHandRaised: false,
      joinedAt: Date.now()
    }

    room.peers.set(socket.id, peer)
    userRooms.set(socket.id, roomId)
    socket.join(roomId)

    // Send room info to the joining user
    const existingPeers = getPeerList(roomId).filter(p => p.socketId !== socket.id)
    socket.emit('room-joined', {
      roomId,
      title: room.title,
      hostId: room.hostId,
      isLocked: room.isLocked,
      screenShareEnabled: room.screenShareEnabled,
      peers: existingPeers,
      yourRole: role,
      yourPeerId: peer
    })

    // Notify others
    broadcastToRoom(roomId, 'peer-joined', { peer }, socket.id)
    sendSystemMessage(roomId, `${user.name} joined the meeting`)

    console.log(`[Meeting] ${user.name} joined room ${roomId} as ${role}. Total: ${room.peers.size}`)
  })

  // ---- WebRTC Signaling ----
  socket.on('signal', (data: { to: string; from: string; signal: any; type: string }) => {
    const { to, from, signal, type } = data
    io.to(to).emit('signal', { from, signal, type })
  })

  // ---- Chat ----
  socket.on('chat-message', (data: { content: string; type?: string; fileUrl?: string; fileName?: string }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const peer = room.peers.get(socket.id)
    if (!peer) return

    const msg: ChatMessage = {
      id: genId(),
      userId: peer.id,
      userName: peer.name,
      content: data.content,
      type: (data.type as any) || 'text',
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      timestamp: Date.now()
    }

    broadcastToRoom(roomId, 'chat-message', msg)
  })

  // ---- Media State ----
  socket.on('media-state', (data: { isMuted?: boolean; isCameraOff?: boolean }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const peer = room.peers.get(socket.id)
    if (!peer) return

    if (data.isMuted !== undefined) peer.isMuted = data.isMuted
    if (data.isCameraOff !== undefined) peer.isCameraOff = data.isCameraOff

    broadcastToRoom(roomId, 'peer-media-state', {
      peerId: socket.id,
      isMuted: peer.isMuted,
      isCameraOff: peer.isCameraOff
    })
  })

  // ---- Screen Share ----
  socket.on('screen-share-start', (data: { peerId: string }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return
    broadcastToRoom(roomId, 'screen-share-started', { peerId: socket.id }, socket.id)
  })

  socket.on('screen-share-stop', () => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return
    broadcastToRoom(roomId, 'screen-share-stopped', { peerId: socket.id }, socket.id)
  })

  // ---- Hand Raise ----
  socket.on('raise-hand', (data: { raised: boolean }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const peer = room.peers.get(socket.id)
    if (!peer) return

    peer.isHandRaised = data.raised
    broadcastToRoom(roomId, 'peer-hand-state', {
      peerId: socket.id,
      isHandRaised: data.raised,
      userName: peer.name
    })
  })

  // ---- Reactions ----
  socket.on('reaction', (data: { emoji: string }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const peer = room.peers.get(socket.id)
    if (!peer) return

    const reaction: Reaction = {
      userId: peer.id,
      userName: peer.name,
      emoji: data.emoji,
      timestamp: Date.now()
    }

    broadcastToRoom(roomId, 'reaction', reaction)

    // Auto-remove after 3 seconds
    setTimeout(() => {
      broadcastToRoom(roomId, 'reaction-end', { userId: peer.id, emoji: data.emoji })
    }, 3000)
  })

  // ---- Host Controls ----
  socket.on('host-mute-peer', (data: { peerId: string }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    // Verify host
    const hostPeer = room.peers.get(socket.id)
    if (!hostPeer || hostPeer.id !== room.hostId) return

    const targetPeer = room.peers.get(data.peerId)
    if (!targetPeer) return

    targetPeer.isMuted = true
    io.to(data.peerId).emit('force-mute')
    broadcastToRoom(roomId, 'peer-media-state', {
      peerId: data.peerId,
      isMuted: true,
      isCameraOff: targetPeer.isCameraOff
    })
    sendSystemMessage(roomId, `${hostPeer.name} muted ${targetPeer.name}`)
  })

  socket.on('host-kick-peer', (data: { peerId: string }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const hostPeer = room.peers.get(socket.id)
    if (!hostPeer || hostPeer.id !== room.hostId) return

    const targetPeer = room.peers.get(data.peerId)
    if (!targetPeer) return

    io.to(data.peerId).emit('kicked', { message: 'You have been removed from the meeting.' })
    room.peers.delete(data.peerId)
    userRooms.delete(data.peerId)
    io.socketsLeave(data.peerId)
    sendSystemMessage(roomId, `${hostPeer.name} removed ${targetPeer.name} from the meeting`)
  })

  socket.on('host-lock-room', (data: { locked: boolean }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const hostPeer = room.peers.get(socket.id)
    if (!hostPeer || hostPeer.id !== room.hostId) return

    room.isLocked = data.locked
    broadcastToRoom(roomId, 'room-lock-state', { isLocked: data.locked })
    sendSystemMessage(roomId, data.locked ? `${hostPeer.name} locked the meeting` : `${hostPeer.name} unlocked the meeting`)
  })

  socket.on('host-toggle-screen-share', (data: { enabled: boolean }) => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const hostPeer = room.peers.get(socket.id)
    if (!hostPeer || hostPeer.id !== room.hostId) return

    room.screenShareEnabled = data.enabled
    broadcastToRoom(roomId, 'screen-share-toggle', { enabled: data.enabled })
  })

  socket.on('host-end-meeting', () => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const hostPeer = room.peers.get(socket.id)
    if (!hostPeer || hostPeer.id !== room.hostId) return

    broadcastToRoom(roomId, 'meeting-ended', { message: 'The host has ended the meeting.' }, socket.id)
    
    // Clean up all peers
    room.peers.forEach((peer) => {
      userRooms.delete(peer.socketId)
    })
    room.peers.clear()
    rooms.delete(roomId)
  })

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    const roomId = userRooms.get(socket.id)
    if (!roomId) return

    const room = rooms.get(roomId)
    if (!room) return

    const peer = room.peers.get(socket.id)
    if (!peer) return

    room.peers.delete(socket.id)
    userRooms.delete(socket.id)
    socket.leave(roomId)

    sendSystemMessage(roomId, `${peer.name} left the meeting`)
    broadcastToRoom(roomId, 'peer-left', { peerId: socket.id, userId: peer.id })

    // If host left, assign host to next peer
    if (peer.id === room.hostId && room.peers.size > 0) {
      const nextHost = room.peers.values().next().value
      if (nextHost) {
        room.hostId = nextHost.id
        nextHost.role = 'host'
        io.to(nextHost.socketId).emit('host-transferred', { hostId: nextHost.id })
        broadcastToRoom(roomId, 'host-changed', { hostId: nextHost.id, hostName: nextHost.name })
        sendSystemMessage(roomId, `${nextHost.name} is now the host`)
      }
    }

    // Clean up empty rooms
    if (room.peers.size === 0) {
      rooms.delete(roomId)
    }

    console.log(`[Meeting] ${peer.name} disconnected from room ${roomId}. Remaining: ${room.peers.size}`)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[Meeting Service] Signaling server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[Meeting Service] Shutting down...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[Meeting Service] Shutting down...')
  httpServer.close(() => process.exit(0))
})
