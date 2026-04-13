'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { PhoneOff, AlertTriangle, Wifi, WifiOff, SignalMedium, SignalLow, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getSocket, disconnectSocket } from '@/lib/socket-client'
import { useMeetingStore, type Peer, type ChatMsg, type Reaction } from '@/stores/meeting-store'
import { useUserStore } from '@/stores/user-store'
import VideoGrid from './VideoGrid'
import MeetingControls from './MeetingControls'
import ChatPanel from './ChatPanel'
import ParticipantList from './ParticipantList'
import SettingsDialog from './SettingsDialog'

// ============ WebRTC Configuration ============
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

interface ExtendedPeerInfo {
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

export default function MeetingRoom() {
  // Store
  const {
    roomId, roomTitle, hostId, myRole, myPeerInfo, joinedAt,
    peers, isMuted, isCameraOff, isScreenSharing, isChatOpen, isParticipantListOpen,
    addPeer, removePeer, updatePeerMedia, updatePeerHand, setHostId, setPeers,
    addChatMessage, setMuted, setCameraOff, setScreenSharing, setHandRaised,
    setRoomLocked, setScreenShareEnabled, clearRoom, setView,
    addReaction, removeReaction, setNetworkQuality,
  } = useMeetingStore()

  const user = useUserStore((s) => s.user)

  // Refs
  const socketRef = useRef<Socket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  // ============ Initialize Media ============
  const initLocalMedia = useCallback(async () => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      localStreamRef.current = stream
      setLocalStream(stream)

      // Set initial mute/camera state based on tracks
      const audioTrack = stream.getAudioTracks()[0]
      const videoTrack = stream.getVideoTracks()[0]
      if (audioTrack) audioTrack.enabled = !isMuted
      if (videoTrack) videoTrack.enabled = !isCameraOff

      return stream
    } catch (err) {
      console.error('Failed to get media devices:', err)
      // Try audio only
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        localStreamRef.current = stream
        setLocalStream(stream)
        setCameraOff(true)
        return stream
      } catch (err2) {
        console.error('Failed to get audio:', err2)
        setConnectionError('Unable to access camera and microphone. Please check your permissions.')
        return null
      }
    }
  }, [isMuted, isCameraOff, setCameraOff])

  // ============ WebRTC Functions ============
  const createPeerConnection = useCallback(async (peerSocketId: string, isInitiator: boolean) => {
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG)

      // Add local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!)
        })
      }

      // Handle incoming tracks
      pc.ontrack = (event) => {
        const stream = event.streams[0] || new MediaStream()
        if (event.track) {
          stream.addTrack(event.track)
        }
        peerStreamsRef.current.set(peerSocketId, stream)
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('signal', {
            to: peerSocketId,
            from: socketRef.current.id,
            signal: event.candidate,
            type: 'ice-candidate',
          })
        }
      }

      // Handle connection state
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'connected') setNetworkQuality('excellent')
        else if (state === 'disconnected') setNetworkQuality('poor')
        else if (state === 'connecting') setNetworkQuality('good')
      }

      // Store connection
      peerConnectionsRef.current.set(peerSocketId, pc)

      // If initiator, create and send offer
      if (isInitiator) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        socketRef.current?.emit('signal', {
          to: peerSocketId,
          from: socketRef.current?.id,
          signal: offer,
          type: 'offer',
        })
      }

      return pc
    } catch (err) {
      console.error('Failed to create peer connection:', err)
      return null
    }
  }, [])

  const handleSignal = useCallback(async (data: { from: string; signal: any; type: string }) => {
    const { from, signal, type } = data
    let pc = peerConnectionsRef.current.get(from)

    if (type === 'offer') {
      if (!pc) {
        pc = await createPeerConnection(from, false)
      }
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socketRef.current?.emit('signal', {
          to: from,
          from: socketRef.current?.id,
          signal: answer,
          type: 'answer',
        })
      }
    } else if (type === 'answer') {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal))
      }
    } else if (type === 'ice-candidate') {
      if (pc && signal) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal))
        } catch (err) {
          console.error('Error adding ICE candidate:', err)
        }
      }
    }
  }, [createPeerConnection])

  // ============ Screen Share ============
  const handleToggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as MediaTrackConstraints,
          audio: false,
        })
        screenStreamRef.current = screenStream
        setScreenSharing(true)

        // Send screen share tracks to all peers
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender && screenStream.getVideoTracks()[0]) {
            sender.replaceTrack(screenStream.getVideoTracks()[0])
          }
        })

        socketRef.current?.emit('screen-share-start', { peerId: socketRef.current?.id })

        // Handle screen share stop
        screenStream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false)
          screenStreamRef.current = null
          // Restore camera
          if (localStreamRef.current) {
            const videoTrack = localStreamRef.current.getVideoTracks()[0]
            if (videoTrack) {
              peerConnectionsRef.current.forEach((pc) => {
                const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
                if (sender) sender.replaceTrack(videoTrack)
              })
            }
          }
          socketRef.current?.emit('screen-share-stop')
        }
      } else {
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((t) => t.stop())
          screenStreamRef.current = null
        }
        setScreenSharing(false)

        // Restore camera tracks
        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0]
          if (videoTrack) {
            peerConnectionsRef.current.forEach((pc) => {
              const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
              if (sender) sender.replaceTrack(videoTrack)
            })
          }
        }

        socketRef.current?.emit('screen-share-stop')
      }
    } catch (err) {
      console.error('Screen share error:', err)
    }
  }, [isScreenSharing, setScreenSharing])

  // ============ Initialize Socket & Room ============
  useEffect(() => {
    if (!roomId || !user) return

    const init = async () => {
      // Initialize media first
      const stream = await initLocalMedia()
      if (!stream) return

      // Connect socket
      const socket = getSocket()
      socketRef.current = socket

      if (!socket.connected) {
        socket.connect()
      }

      // Wait for connection
      const waitForConnection = () => {
        return new Promise<void>((resolve) => {
          if (socket.connected) {
            resolve()
            return
          }
          socket.on('connect', () => resolve())
        })
      }

      await waitForConnection()

      // Join room
      socket.emit('join-room', {
        roomId,
        user: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
        },
      })

      // ---- Socket Events ----
      socket.on('room-joined', (data: {
        roomId: string; title: string; hostId: string; isLocked: boolean;
        screenShareEnabled: boolean; peers: ExtendedPeerInfo[]; yourRole: 'host' | 'participant';
        yourPeerId: ExtendedPeerInfo;
      }) => {
        // Update store
        useMeetingStore.getState().setRoom(
          data.roomId,
          data.title,
          data.hostId,
          data.yourRole,
          {
            id: data.yourPeerId.id,
            socketId: data.yourPeerId.socketId,
            name: data.yourPeerId.name,
            avatar: data.yourPeerId.avatar,
            role: data.yourRole,
            isMuted: false,
            isCameraOff: false,
            isHandRaised: false,
            joinedAt: data.yourPeerId.joinedAt,
          }
        )

        setRoomLocked(data.isLocked)
        setScreenShareEnabled(data.screenShareEnabled)
        setConnectionError(null)

        // Create peer connections for existing peers
        data.peers.forEach(async (peer) => {
          const peerData: Peer = {
            id: peer.id,
            socketId: peer.socketId,
            name: peer.name,
            avatar: peer.avatar,
            role: peer.role,
            isMuted: peer.isMuted,
            isCameraOff: peer.isCameraOff,
            isHandRaised: peer.isHandRaised,
            joinedAt: peer.joinedAt,
          }
          addPeer(peerData)
          await createPeerConnection(peer.socketId, true)
        })
      })

      socket.on('room-locked', () => {
        setConnectionError('This meeting is locked.')
        leaveMeeting()
      })

      socket.on('room-full', () => {
        setConnectionError('This meeting is full (max 20 users).')
        leaveMeeting()
      })

      socket.on('peer-joined', async (data: { peer: ExtendedPeerInfo }) => {
        const peerData: Peer = {
          id: data.peer.id,
          socketId: data.peer.socketId,
          name: data.peer.name,
          avatar: data.peer.avatar,
          role: data.peer.role,
          isMuted: data.peer.isMuted,
          isCameraOff: data.peer.isCameraOff,
          isHandRaised: data.peer.isHandRaised,
          joinedAt: data.peer.joinedAt,
        }
        addPeer(peerData)
      })

      socket.on('peer-left', (data: { peerId: string; userId: string }) => {
        // Close peer connection
        const pc = peerConnectionsRef.current.get(data.peerId)
        if (pc) {
          pc.close()
          peerConnectionsRef.current.delete(data.peerId)
        }
        peerStreamsRef.current.delete(data.peerId)
        removePeer(data.peerId)
      })

      socket.on('signal', handleSignal)

      socket.on('chat-message', (msg: ChatMsg) => {
        addChatMessage(msg)
      })

      socket.on('peer-media-state', (data: { peerId: string; isMuted: boolean; isCameraOff: boolean }) => {
        updatePeerMedia(data.peerId, { isMuted: data.isMuted, isCameraOff: data.isCameraOff })
      })

      socket.on('peer-hand-state', (data: { peerId: string; isHandRaised: boolean; userName: string }) => {
        updatePeerHand(data.peerId, data.isHandRaised, data.userName)
      })

      socket.on('reaction', (reaction: Reaction) => {
        addReaction(reaction)
      })

      socket.on('reaction-end', (data: { userId: string; emoji: string }) => {
        removeReaction(data.userId, data.emoji)
      })

      socket.on('screen-share-started', (data: { peerId: string }) => {
        // Update peer to indicate screen sharing
        updatePeerMedia(data.peerId, {} as any)
      })

      socket.on('screen-share-stopped', () => {
        // Handle screen share stopped
      })

      socket.on('force-mute', () => {
        setMuted(true)
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = false })
        }
      })

      socket.on('kicked', (data: { message: string }) => {
        setConnectionError(data.message)
        leaveMeeting()
      })

      socket.on('host-transferred', (data: { hostId: string }) => {
        setHostId(data.hostId)
        useMeetingStore.setState({ myRole: 'host' })
      })

      socket.on('host-changed', (data: { hostId: string; hostName: string }) => {
        setHostId(data.hostId)
      })

      socket.on('room-lock-state', (data: { isLocked: boolean }) => {
        setRoomLocked(data.isLocked)
      })

      socket.on('screen-share-toggle', (data: { enabled: boolean }) => {
        setScreenShareEnabled(data.enabled)
      })

      socket.on('meeting-ended', () => {
        setConnectionError('The host has ended the meeting.')
        leaveMeeting()
      })
    }

    init()

    return () => {
      // Cleanup on unmount
      cleanup()
    }
  }, [roomId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ============ Media Toggle Effects ============
  useEffect(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !isMuted })
    }
  }, [isMuted])

  useEffect(() => {
    if (localStreamRef.current && !isScreenSharing) {
      localStreamRef.current.getVideoTracks().forEach((t) => { t.enabled = !isCameraOff })
    }
  }, [isCameraOff, isScreenSharing])

  // ============ Cleanup ============
  const cleanup = useCallback(() => {
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc) => pc.close())
    peerConnectionsRef.current.clear()
    peerStreamsRef.current.clear()

    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }

    // Stop screen stream
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }

    setLocalStream(null)
  }, [])

  // ============ Leave Meeting ============
  const leaveMeeting = useCallback(() => {
    cleanup()
    disconnectSocket()
    socketRef.current = null
    clearRoom()
    setView('dashboard')
  }, [cleanup, clearRoom, setView])

  // ============ Network Quality Simulation ============
  useEffect(() => {
    if (!roomId) return
    const interval = setInterval(() => {
      const quality = ['excellent', 'good', 'good', 'excellent'][Math.floor(Math.random() * 4)] as 'excellent' | 'good' | 'poor' | 'unknown'
      setNetworkQuality(quality)
    }, 10000)
    return () => clearInterval(interval)
  }, [roomId, setNetworkQuality])

  // ============ Meeting Timer ============
  const [elapsedTime, setElapsedTime] = useState('00:00:00')
  useEffect(() => {
    if (!joinedAt) return
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - joinedAt) / 1000)
      const h = Math.floor(diff / 3600).toString().padStart(2, '0')
      const m = Math.floor((diff % 3600) / 60).toString().padStart(2, '0')
      const s = (diff % 60).toString().padStart(2, '0')
      setElapsedTime(`${h}:${m}:${s}`)
    }, 1000)
    return () => clearInterval(interval)
  }, [joinedAt])

  // ============ Render ============
  if (!roomId) return null

  const networkQualityIcon = () => {
    const q = useMeetingStore.getState().networkQuality
    if (q === 'excellent') return <Wifi className="w-4 h-4 text-emerald-400" />
    if (q === 'good') return <SignalMedium className="w-4 h-4 text-yellow-400" />
    if (q === 'poor') return <SignalLow className="w-4 h-4 text-red-400" />
    return <WifiOff className="w-4 h-4 text-zinc-500" />
  }

  return (
    <motion.div
      className="fixed inset-0 bg-zinc-950 flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Error Overlay */}
      <AnimatePresence>
        {connectionError && (
          <motion.div
            className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="bg-zinc-900 rounded-2xl p-8 max-w-md text-center space-y-4">
              <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
              <h3 className="text-xl font-semibold text-white">{connectionError}</h3>
              <Button onClick={leaveMeeting} className="bg-red-600 hover:bg-red-700 text-white">
                <PhoneOff className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div>
              <h1 className="text-white text-sm font-semibold">{roomTitle || `Meeting ${roomId?.slice(0, 6)}`}</h1>
              <p className="text-zinc-400 text-xs">{roomId}</p>
            </div>
          </div>
          {useMeetingStore.getState().isRoomLocked && (
            <Badge variant="secondary" className="bg-amber-500/20 text-amber-400 text-xs">
              <Lock className="w-3 h-3 mr-1" />
              Locked
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Timer & Recording */}
          <div className="flex items-center gap-2">
            {useMeetingStore.getState().isRecording && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-xs font-medium">REC</span>
              </div>
            )}
            <span className="text-zinc-400 text-sm font-mono">{elapsedTime}</span>
          </div>

          {/* Network Quality */}
          <div className="flex items-center gap-1" title="Network Quality">
            {networkQualityIcon()}
          </div>

          {/* Participants Count */}
          <div className="flex items-center gap-1 text-zinc-400 text-sm">
            <span>{(peers?.length || 0) + 1}</span>
            <span className="hidden sm:inline">participants</span>
          </div>

          {/* Leave */}
          <Button
            variant="destructive"
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white rounded-full px-4"
            onClick={leaveMeeting}
          >
            <PhoneOff className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Area */}
        <div className="flex-1 relative">
          <VideoGrid localStream={localStream} />

          {/* Floating Reactions */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-2 z-10 pointer-events-none">
            <AnimatePresence>
              {useMeetingStore.getState().activeReactions.map((r) => (
                <motion.div
                  key={`${r.userId}-${r.emoji}-${r.timestamp}`}
                  className="text-4xl"
                  initial={{ opacity: 0, y: 20, scale: 0.5 }}
                  animate={{ opacity: 1, y: -40, scale: 1.2 }}
                  exit={{ opacity: 0, y: -80, scale: 0.8 }}
                  transition={{ duration: 1.5 }}
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Sidebar Panels */}
        <AnimatePresence mode="wait">
          {isChatOpen && (
            <motion.div
              key="chat"
              className="w-80 border-l border-zinc-800 shrink-0"
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <ChatPanel socket={socketRef.current} />
            </motion.div>
          )}

          {isParticipantListOpen && (
            <motion.div
              key="participants"
              className="w-80 border-l border-zinc-800 shrink-0"
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <ParticipantList socket={socketRef.current} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <MeetingControls
        socket={socketRef.current}
        onLeave={leaveMeeting}
        localStream={localStream}
        onToggleScreenShare={handleToggleScreenShare}
      />

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </motion.div>
  )
}


