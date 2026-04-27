import { io, Socket } from 'socket.io-client'

let socketInstance: Socket | null = null

export function getSocket(): Socket {
  if (!socketInstance) {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || '/?XTransformPort=3003'
    socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 15000
    })
  }
  return socketInstance
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}
