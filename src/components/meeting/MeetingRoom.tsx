'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { PhoneOff, AlertTriangle, Wifi, WifiOff, SignalMedium, SignalLow, Lock, Download, VideoOff, MicOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getSocket, disconnectSocket } from '@/lib/socket-client'
import { useMeetingStore, type Peer, type ChatMsg, type Reaction } from '@/stores/meeting-store'
import { useUserStore } from '@/stores/user-store'
import VideoGrid from './VideoGrid'
import MeetingControls from './MeetingControls'
import ChatPanel from './ChatPanel'
import ParticipantList from './ParticipantList'
import Whiteboard from './Whiteboard'
import FileSharePanel from './FileSharePanel'
import SettingsDialog from './SettingsDialog'
import VirtualBackground from './VirtualBackground'
import { BackgroundProcessor, type BackgroundType, type BackgroundConfig } from '@/lib/background-processor'
import { toast } from '@/hooks/use-toast'

// ============ WebRTC Configuration ============
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // Free TURN relay servers for NAT traversal fallback
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
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
    isWhiteboardOpen, isFileShareOpen,
    virtualBackgroundType, virtualBackgroundValue,
    addPeer, removePeer, updatePeerMedia, updatePeerHand, setHostId, setPeers,
    toggleWhiteboard, setWhiteboardOpen, toggleFileShare, setFileShareOpen, setVirtualBackgroundType,
    addChatMessage, setMuted, setCameraOff, setScreenSharing, setHandRaised,
    setRoomLocked, setScreenShareEnabled, clearRoom, setView,
    addReaction, removeReaction, setNetworkQuality, isRecording, setRecording,
  } = useMeetingStore()

  // Only subscribe to stable primitives to avoid re-render loops.
  // Previously we used `const user = useUserStore((s) => s.user)` which returns the
  // full user object. Any re-creation of this object (e.g., during hydration) would
  // change its reference, causing the main useEffect to re-run and reset the meeting.
  const userId = useUserStore((s) => s.user?.id)
  const userName = useUserStore((s) => s.user?.name)
  const userAvatar = useUserStore((s) => s.user?.avatar)

  // Refs
  const socketRef = useRef<Socket | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const peerStreamsRef = useRef<Map<string, MediaStream>>(new Map())
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showVirtualBgOpen, setShowVirtualBgOpen] = useState(false)
  const [isBgLoading, setIsBgLoading] = useState(false)
  const processedStreamRef = useRef<MediaStream | null>(null)
  const bgProcessorActiveRef = useRef(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState<{ message: string; allowJoinWithout: boolean } | null>(null)
  const [mediaInitDone, setMediaInitDone] = useState(false)
  const [isJoining, setIsJoining] = useState(true)
  const mediaCancelledRef = useRef(false)
  const joinedRoomRef = useRef(false) // Prevents double setRoom
  const initializedRoomIdRef = useRef<string | null>(null) // Track which room has been initialized
  const pendingOffersRef = useRef<Set<string>>(new Set()) // Track pending offers for glare detection
  const mySocketIdRef = useRef<string | null>(null) // Track our socket ID for polite/impolite determination

  // ─── FIX 1: Track peer streams as reactive state so VideoGrid can access them ───
  const [peerStreamsMap, setPeerStreamsMap] = useState<Map<string, MediaStream>>(new Map())
  const updatePeerStream = useCallback((socketId: string, stream: MediaStream) => {
    setPeerStreamsMap((prev) => {
      const next = new Map(prev)
      next.set(socketId, stream)
      return next
    })
  }, [])

  // ─── FIX 2: Recording with MediaRecorder ───
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const startRecording = useCallback(() => {
    try {
      // Gather all available streams
      const tracks: MediaStreamTrack[] = []
      if (localStreamRef.current) {
        tracks.push(...localStreamRef.current.getTracks())
      }
      peerStreamsRef.current.forEach((stream) => {
        stream.getTracks().forEach((t) => {
          if (!tracks.find((existing) => existing.id === t.id)) {
            tracks.push(t)
          }
        })
      })

      if (tracks.length === 0) {
        console.warn('No tracks to record')
        return
      }

      const combinedStream = new MediaStream(tracks)

      // Try mp4 first, fallback to webm
      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
        ? 'video/mp4;codecs=avc1'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus'
            : 'video/webm'

      const recorder = new MediaRecorder(combinedStream, {
        mimeType,
        videoBitsPerSecond: 2500000,
      })

      recordedChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
        const blob = new Blob(recordedChunksRef.current, { type: mimeType })
        const url = URL.createObjectURL(blob)
        setDownloadUrl(url)
        setRecording(false)

        // Auto download
        const a = document.createElement('a')
        a.href = url
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        a.download = `meeting-${roomId || 'recording'}-${timestamp}.${ext}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        // Cleanup URL after some time
        setTimeout(() => {
          URL.revokeObjectURL(url)
          setDownloadUrl(null)
        }, 60000)
      }

      recorder.start(1000) // collect chunks every 1s
      mediaRecorderRef.current = recorder
      setRecording(true)
      console.log(`Recording started (mimeType: ${mimeType})`)
    } catch (err) {
      console.error('Failed to start recording:', err)
    }
  }, [roomId, setRecording])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    setRecording(false)
  }, [setRecording])

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  // ─── Initialize Media (stable callback — reads mute/camera state from store at call time) ───
  const initLocalMedia = useCallback(async () => {
    // Already have a working stream? Return it.
    if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
      return localStreamRef.current
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setMediaError({ message: 'Camera & microphone are not available in this environment.', allowJoinWithout: true })
      setMediaInitDone(true)
      return null
    }

    // Strategy: try video+audio, then audio-only, then fail gracefully.
    // We use MINIMAL constraints to avoid hardware timeout issues.
    const tryGetUserMedia = async (constraints: MediaStreamConstraints): Promise<MediaStream | null> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (mediaCancelledRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return null
        }
        return stream
      } catch (err) {
        if (mediaCancelledRef.current) return null  // Silently ignore cancelled requests
        const e = err as DOMException
        console.warn(`[Media] getUserMedia failed (${constraints.video ? 'video+audio' : 'audio-only'}): ${e.name}: ${e.message}`)
        return null
      }
    }

    // Attempt 1: video + audio with minimal constraints
    let stream = await tryGetUserMedia({
      audio: true,
      video: true,
    })

    // Attempt 2: video + audio with basic constraints (no ideal values)
    if (!stream && !mediaCancelledRef.current) {
      stream = await tryGetUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: 640, height: 480 },
      })
    }

    // Attempt 3: audio only
    if (!stream && !mediaCancelledRef.current) {
      console.log('[Media] Trying audio-only fallback...')
      stream = await tryGetUserMedia({ audio: true, video: false })
      if (stream) {
        setCameraOff(true)
      }
    }

    if (stream) {
      localStreamRef.current = stream
      setLocalStream(stream)
      setMediaInitDone(true)

      // Apply current mute/camera state from store (not stale closure)
      const { isMuted: muted, isCameraOff: camOff } = useMeetingStore.getState()
      stream.getAudioTracks().forEach((t) => { t.enabled = !muted })
      stream.getVideoTracks().forEach((t) => { t.enabled = !camOff })

      console.log(`[Media] Success — ${stream.getVideoTracks().length ? 'video+audio' : 'audio-only'} (${stream.getTracks().length} tracks)`)
      return stream
    }

    if (!mediaCancelledRef.current) {
      setMediaError({
        message: 'Could not access camera or microphone. Please allow permissions in the browser address bar, ensure no other app is using the camera, then click Retry.',
        allowJoinWithout: true,
      })
      setMediaInitDone(true)
    }
    return null
  }, [setCameraOff])

  // ============ Perfect Negotiation ============
  // Uses socket ID comparison to deterministically assign polite/impolite roles.
  // The peer with the LOWER socket ID is "impolite" (initiator).
  // The peer with the HIGHER socket ID is "polite" (responder, rolls back on glare).
  // This eliminates dual-initiator glare and DTLS role conflicts.
  const isPolitePeer = useCallback((peerSocketId: string): boolean => {
    const myId = mySocketIdRef.current
    if (!myId) return false
    return myId > peerSocketId
  }, [])

  // ============ Renegotiation ============
  // When local media becomes available AFTER peer connections were created,
  // we need to add tracks and re-negotiate the SDP so the remote peer can
  // receive our audio/video.
  const renegotiatePeer = useCallback(async (peerSocketId: string) => {
    const pc = peerConnectionsRef.current.get(peerSocketId)
    const socket = socketRef.current
    if (!pc || !socket) return

    // Don't create offer if not in stable state (another negotiation in progress)
    if (pc.signalingState !== 'stable') {
      console.log(`[WebRTC] Skipping renegotiation for ${peerSocketId} (state: ${pc.signalingState})`)
      return
    }

    try {
      const offer = await pc.createOffer()
      if (offer.sdp) {
        await pc.setLocalDescription(offer)
        pendingOffersRef.current.add(peerSocketId)
        socket.emit('signal', {
          to: peerSocketId,
          from: socket.id,
          signal: offer,
          type: 'offer',
        })
        console.log(`[WebRTC] Renegotiation offer sent to ${peerSocketId}`)
      }
    } catch (err) {
      console.error(`[WebRTC] Renegotiation failed for ${peerSocketId}:`, err)
    }
  }, [])

  // ============ WebRTC Functions ============
  const createPeerConnection = useCallback(async (peerSocketId: string, isInitiator: boolean) => {
    try {
      // Close existing connection if any (e.g., ICE restart fallback)
      const existingPC = peerConnectionsRef.current.get(peerSocketId)
      if (existingPC) {
        try { existingPC.close() } catch {}
        peerConnectionsRef.current.delete(peerSocketId)
      }

      const pc = new RTCPeerConnection(RTC_CONFIG)

      // ─── CRITICAL: Always add recvonly transceivers so media negotiation works ───
      // even when this peer joins without camera/microphone.
      // Without this, the offer SDP has no m=audio/m=video lines, so the remote
      // peer cannot send their media to us at all.
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })

      // Add local tracks (upgrades matching transceivers from recvonly → sendrecv)
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!)
        })
      }

      // ─── Handle negotiationneeded: fires when tracks are added later ───
      let negotiationScheduled = false
      pc.onnegotiationneeded = () => {
        if (negotiationScheduled) return
        negotiationScheduled = true
        setTimeout(() => {
          negotiationScheduled = false
          // Only renegotiate if we have local tracks (avoid premature renegotiation)
          if (localStreamRef.current && localStreamRef.current.getTracks().length > 0) {
            renegotiatePeer(peerSocketId)
          }
        }, 500) // Small delay to batch multiple track additions
      }

      // ─── On incoming track, store stream in BOTH ref AND state ───
      pc.ontrack = (event) => {
        let stream: MediaStream | null = event.streams[0] || null

        if (!stream) {
          stream = new MediaStream()
        }

        if (event.track) {
          if (!stream.getTrackById(event.track.id)) {
            stream.addTrack(event.track)
          }
        }

        peerStreamsRef.current.set(peerSocketId, stream)
        updatePeerStream(peerSocketId, stream)
        console.log(`[WebRTC] Track received from ${peerSocketId}: ${event.track.kind} (enabled: ${event.track.enabled}, state: ${event.track.readyState})`)
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

      // ─── Connection state monitoring with auto ICE restart ───
      let connectionTimeout: ReturnType<typeof setTimeout> | null = null

      const clearConnectionTimeout = () => {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout)
          connectionTimeout = null
        }
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        console.log(`[WebRTC] Connection state with ${peerSocketId}: ${state}`)

        if (state === 'connected' || state === 'completed') {
          clearConnectionTimeout()
          setNetworkQuality('excellent')
        } else if (state === 'disconnected') {
          setNetworkQuality('poor')
          // Don't restart immediately — ICE may recover on its own
        } else if (state === 'failed') {
          console.warn(`[WebRTC] Connection with ${peerSocketId} failed, attempting ICE restart...`)
          clearConnectionTimeout()
          try {
            pc.restartIce()
          } catch (e) {
            console.error('[WebRTC] ICE restart failed:', e)
          }
        } else if (state === 'closed') {
          clearConnectionTimeout()
        }
      }

      pc.oniceconnectionstatechange = () => {
        const iceState = pc.iceConnectionState
        console.log(`[WebRTC] ICE state with ${peerSocketId}: ${iceState}`)

        if (iceState === 'connected' || iceState === 'completed') {
          clearConnectionTimeout()
        } else if (iceState === 'failed') {
          console.warn(`[WebRTC] ICE failed with ${peerSocketId}, restarting...`)
          clearConnectionTimeout()
          try {
            pc.restartIce()
          } catch (e) {
            console.error('[WebRTC] ICE restart failed:', e)
          }
        }
      }

      // Connection timeout: if no connection within 15s, force ICE restart
      connectionTimeout = setTimeout(() => {
        if (pc.connectionState !== 'connected' && pc.connectionState !== 'completed' && pc.connectionState !== 'closed') {
          console.warn(`[WebRTC] Connection timeout with ${peerSocketId} (${pc.connectionState}), restarting ICE...`)
          try {
            pc.restartIce()
          } catch (e) {
            console.error('[WebRTC] ICE restart failed:', e)
          }
        }
      }, 15000)

      // Store connection
      peerConnectionsRef.current.set(peerSocketId, pc)

      // If initiator, create and send offer
      if (isInitiator) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        pendingOffersRef.current.add(peerSocketId)
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
  }, [updatePeerStream, setNetworkQuality, renegotiatePeer])

  const handleSignal = useCallback(async (data: { from: string; signal: any; type: string }) => {
    const { from, signal, type } = data
    let pc = peerConnectionsRef.current.get(from)

    if (type === 'offer') {
      console.log(`[WebRTC] Received offer from ${from} (myId: ${mySocketIdRef.current}, polite: ${isPolitePeer(from)})`)
      if (!pc) {
        pc = await createPeerConnection(from, false)
      }
      if (!pc) return

      try {
        // ─── Perfect Negotiation glare handling ───
        if (pc.signalingState === 'have-local-offer') {
          const polite = isPolitePeer(from)
          if (polite) {
            // Polite peer: roll back our offer, accept the remote one
            console.log(`[WebRTC] Glare detected with ${from} — polite, accepting remote offer`)
          } else {
            // Impolite peer: discard the incoming offer, keep ours
            console.log(`[WebRTC] Glare detected with ${from} — impolite, discarding remote offer`)
            return
          }
        }

        // Also guard against setting offer when already have-remote-offer (shouldn't happen)
        if (pc.signalingState !== 'stable' && pc.signalingState !== 'have-local-offer') {
          console.warn(`[WebRTC] Ignoring offer from ${from} (state: ${pc.signalingState})`)
          return
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal))
        pendingOffersRef.current.delete(from)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socketRef.current?.emit('signal', {
          to: from,
          from: socketRef.current?.id,
          signal: answer,
          type: 'answer',
        })
        console.log(`[WebRTC] Sent answer to ${from}`)
      } catch (err) {
        const errMsg = (err as Error).message || ''
        if (errMsg.includes('SSL role') || errMsg.includes('DTLS') || errMsg.includes('ERROR_CONTENT')) {
          // DTLS/SSL role conflict — close and recreate the connection cleanly
          console.warn(`[WebRTC] DTLS role conflict with ${from}, recreating connection...`)
          try { pc.close() } catch {}
          peerConnectionsRef.current.delete(from)
          pendingOffersRef.current.delete(from)
          // Recreate as responder
          const newPc = await createPeerConnection(from, false)
          if (newPc) {
            try {
              await newPc.setRemoteDescription(new RTCSessionDescription(signal))
              const answer = await newPc.createAnswer()
              await newPc.setLocalDescription(answer)
              socketRef.current?.emit('signal', {
                to: from,
                from: socketRef.current?.id,
                signal: answer,
                type: 'answer',
              })
              console.log(`[WebRTC] Recovery: sent answer to ${from}`)
            } catch (retryErr) {
              console.error(`[WebRTC] Recovery failed for ${from}:`, retryErr)
            }
          }
        } else {
          console.error(`[WebRTC] Error handling offer from ${from}:`, err)
        }
      }
    } else if (type === 'answer') {
      if (!pc) {
        console.warn(`[WebRTC] Received answer from ${from} but no peer connection exists`)
        return
      }
      try {
        // Only set answer if we're in have-local-offer state
        if (pc.signalingState !== 'have-local-offer') {
          console.warn(`[WebRTC] Ignoring stale answer from ${from} (state: ${pc.signalingState})`)
          return
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal))
        pendingOffersRef.current.delete(from)
        console.log(`[WebRTC] Set remote description (answer) from ${from}`)
      } catch (err) {
        const errMsg = (err as Error).message || ''
        if (errMsg.includes('wrong state') || errMsg.includes('stable')) {
          // State already changed (e.g., glare resolved) — safely ignore
          console.warn(`[WebRTC] Ignoring answer from ${from} due to state change`)
        } else {
          console.error(`[WebRTC] Error handling answer from ${from}:`, err)
        }
      }
    } else if (type === 'ice-candidate') {
      if (pc && signal) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal))
        } catch (err) {
          // Ignore candidate errors that occur due to timing (e.g., candidate arrives before SDP)
          if (!(err as Error).message?.includes('Cannot apply') && !(err as Error).message?.includes('wrong state')) {
            console.error(`[WebRTC] Error adding ICE candidate from ${from}:`, err)
          }
        }
      }
    }
  }, [createPeerConnection, isPolitePeer])

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

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender && screenStream.getVideoTracks()[0]) {
            sender.replaceTrack(screenStream.getVideoTracks()[0])
          }
        })

        socketRef.current?.emit('screen-share-start', { peerId: socketRef.current?.id })

        screenStream.getVideoTracks()[0].onended = () => {
          setScreenSharing(false)
          screenStreamRef.current = null
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

  // ============ Cleanup & Leave (must be defined BEFORE initSocketAndJoin to avoid TDZ) ============
  const cleanup = useCallback(() => {
    mediaCancelledRef.current = true

    // Stop background processor
    if (bgProcessorActiveRef.current) {
      BackgroundProcessor.stop()
      bgProcessorActiveRef.current = false
      processedStreamRef.current = null
    }

    // Stop recording if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }

    peerConnectionsRef.current.forEach((pc) => pc.close())
    peerConnectionsRef.current.clear()
    peerStreamsRef.current.clear()
    pendingOffersRef.current.clear()
    mySocketIdRef.current = null // Reset socket ID for clean reconnection

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = null
    }

    setLocalStream(null)
    setPeerStreamsMap(new Map())
  }, [])

  const leaveMeeting = useCallback(() => {
    cleanup()
    disconnectSocket()
    socketRef.current = null
    initializedRoomIdRef.current = null // Allow re-initialization for a new room
    clearRoom()
    setView('dashboard')
  }, [cleanup, clearRoom, setView])

  // ============ Socket & Room Join ============
  // NOTE: No `user` in deps — we read fresh user data via useUserStore.getState()
  // inside the callback to avoid re-creating this function on every user ref change.
  const initSocketAndJoin = useCallback(() => {
    const socket = getSocket()
    socketRef.current = socket

    // Remove all existing listeners to prevent duplicates
    socket.off('room-joined').off('room-locked').off('room-full')
      .off('peer-joined').off('peer-left').off('signal')
      .off('chat-message').off('peer-media-state').off('peer-hand-state')
      .off('reaction').off('reaction-end')
      .off('screen-share-started').off('screen-share-stopped')
      .off('force-mute').off('kicked')
      .off('host-transferred').off('host-changed')
      .off('room-lock-state').off('screen-share-toggle').off('meeting-ended')
      .off('connect')

    // Connect to socket if not already connected
    if (!socket.connected) {
      socket.connect()
    }

    // Emit join-room — read user from store at call time (always fresh)
    const emitJoin = () => {
      const currentUser = useUserStore.getState().user
      const currentRoomId = useMeetingStore.getState().roomId
      if (!socket.connected || !currentRoomId || !currentUser) return
      socket.emit('join-room', {
        roomId: currentRoomId,
        user: { id: currentUser.id, name: currentUser.name, avatar: currentUser.avatar },
      })
    }

    // If already connected, emit immediately
    if (socket.connected) {
      emitJoin()
    }

    // Register connect handler (auto-join on reconnect)
    socket.on('connect', () => {
      const currentRoomId = useMeetingStore.getState().roomId
      console.log('[Socket] Connected, joining room:', currentRoomId)
      emitJoin()
    })

    // ---- Socket Events ----
    socket.on('room-joined', (data: {
      roomId: string; title: string; hostId: string; isLocked: boolean;
      screenShareEnabled: boolean; peers: ExtendedPeerInfo[]; yourRole: 'host' | 'participant';
      yourPeerId: ExtendedPeerInfo;
    }) => {
      console.log('[Socket] Room joined successfully:', data.roomId, 'peers:', data.peers.length)
      // Only update peer info from server — do NOT call setRoom() again
      if (!joinedRoomRef.current) {
        joinedRoomRef.current = true
        useMeetingStore.setState({
          myPeerInfo: {
            id: data.yourPeerId.id,
            socketId: data.yourPeerId.socketId,
            name: data.yourPeerId.name,
            avatar: data.yourPeerId.avatar,
            role: data.yourRole,
            isMuted: false,
            isCameraOff: false,
            isHandRaised: false,
            joinedAt: data.yourPeerId.joinedAt,
          },
          hostId: data.hostId,
          myRole: data.yourRole,
          roomTitle: data.title,
        })
        setRoomLocked(data.isLocked)
        setScreenShareEnabled(data.screenShareEnabled)
        setConnectionError(null)
        setIsJoining(false)
      }

      // Store our socket ID for perfect negotiation
      if (!mySocketIdRef.current) {
        mySocketIdRef.current = socket.id || data.yourPeerId.socketId
        console.log(`[WebRTC] My socket ID: ${mySocketIdRef.current}`)
      }

      // Create peer connections for existing peers
      // Only the impolite (lower ID) peer initiates — the polite peer waits for offers
      data.peers.forEach((peer) => {
        const peerData: Peer = { id: peer.id, socketId: peer.socketId, name: peer.name, avatar: peer.avatar, role: peer.role, isMuted: peer.isMuted, isCameraOff: peer.isCameraOff, isHandRaised: peer.isHandRaised, joinedAt: peer.joinedAt }
        addPeer(peerData)
        // Only impolite peer initiates the connection
        if (!isPolitePeer(peer.socketId) && !peerConnectionsRef.current.has(peer.socketId)) {
          createPeerConnection(peer.socketId, true)
        }
      })
    })

    socket.on('room-locked', () => { setConnectionError('This meeting is locked.'); leaveMeeting() })
    socket.on('room-full', () => { setConnectionError('This meeting is full (max 20 users).'); leaveMeeting() })

    socket.on('peer-joined', (data: { peer: ExtendedPeerInfo }) => {
      const peerData: Peer = { id: data.peer.id, socketId: data.peer.socketId, name: data.peer.name, avatar: data.peer.avatar, role: data.peer.role, isMuted: data.peer.isMuted, isCameraOff: data.peer.isCameraOff, isHandRaised: data.peer.isHandRaised, joinedAt: data.peer.joinedAt }
      addPeer(peerData)
      // Perfect Negotiation: only the impolite (lower socket ID) peer initiates.
      // The polite peer waits for the offer from the impolite side.
      if (!isPolitePeer(data.peer.socketId) && !peerConnectionsRef.current.has(data.peer.socketId)) {
        createPeerConnection(data.peer.socketId, true)
      }
    })

    socket.on('peer-left', (data: { peerId: string; userId: string }) => {
      const pc = peerConnectionsRef.current.get(data.peerId)
      if (pc) { pc.close(); peerConnectionsRef.current.delete(data.peerId) }
      peerStreamsRef.current.delete(data.peerId)
      setPeerStreamsMap((prev) => { const next = new Map(prev); next.delete(data.peerId); return next })
      removePeer(data.peerId)
    })

    socket.on('signal', handleSignal)
    socket.on('chat-message', (msg: ChatMsg) => { addChatMessage(msg) })
    socket.on('peer-media-state', (data: { peerId: string; isMuted: boolean; isCameraOff: boolean }) => { updatePeerMedia(data.peerId, { isMuted: data.isMuted, isCameraOff: data.isCameraOff }) })
    socket.on('peer-hand-state', (data: { peerId: string; isHandRaised: boolean; userName: string }) => { updatePeerHand(data.peerId, data.isHandRaised, data.userName) })
    socket.on('reaction', (reaction: Reaction) => { addReaction(reaction) })
    socket.on('reaction-end', (data: { userId: string; emoji: string }) => { removeReaction(data.userId, data.emoji) })
    socket.on('screen-share-started', (data: { peerId: string }) => { updatePeerMedia(data.peerId, {} as any) })
    socket.on('screen-share-stopped', () => {})
    socket.on('force-mute', () => { setMuted(true); if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = false }) })
    socket.on('kicked', (data: { message: string }) => { setConnectionError(data.message); leaveMeeting() })
    socket.on('host-transferred', (data: { hostId: string }) => { setHostId(data.hostId); useMeetingStore.setState({ myRole: 'host' }) })
    socket.on('host-changed', (data: { hostId: string; hostName: string }) => { setHostId(data.hostId) })
    socket.on('room-lock-state', (data: { isLocked: boolean }) => { setRoomLocked(data.isLocked) })
    socket.on('screen-share-toggle', (data: { enabled: boolean }) => { setScreenShareEnabled(data.enabled) })
    socket.on('meeting-ended', () => { setConnectionError('The host has ended the meeting.'); leaveMeeting() })
  }, [roomId, createPeerConnection, handleSignal, addPeer, removePeer, updatePeerMedia, updatePeerHand, addChatMessage, addReaction, removeReaction, setMuted, setRoomLocked, setScreenShareEnabled, setConnectionError, setHostId, leaveMeeting, renegotiatePeer, isPolitePeer])

  // Retry media init
  const retryMediaInit = useCallback(async () => {
    setMediaError(null)
    setMediaInitDone(false)
    mediaCancelledRef.current = false
    const stream = await initLocalMedia()
    if (stream) {
      initSocketAndJoin()
    }
  }, [initLocalMedia, initSocketAndJoin])

  // Join without media
  const handleJoinWithoutMedia = useCallback(() => {
    setMediaError(null)
    setMuted(true)
    setCameraOff(true)
    setMediaInitDone(true)
    // If not already joined, init socket now
    if (!joinedRoomRef.current) {
      initSocketAndJoin()
    }
  }, [setCameraOff, setMuted, initSocketAndJoin])

  // ============ Initialize Socket & Room ============
  // CRITICAL: Only depend on `roomId` (primitive string), NOT on `user` (object ref).
  // The user object reference can change during hydration/re-renders, which would
  // cause the cleanup to run (closing connections, resetting joinedRoomRef) and
  // the effect to re-initialize — creating a flickering loop.
  useEffect(() => {
    const currentUser = useUserStore.getState().user
    if (!roomId || !currentUser) return

    // Prevent re-initialization for the same room (e.g., user object ref changed)
    if (initializedRoomIdRef.current === roomId) return
    initializedRoomIdRef.current = roomId

    mediaCancelledRef.current = false
    joinedRoomRef.current = false
    setIsJoining(true)

    // Initialize socket IMMEDIATELY (no waiting for media)
    // Socket events handle everything — room-joined sets isJoining=false
    initSocketAndJoin()

    // Initialize media in parallel (non-blocking)
    initLocalMedia().then((stream) => {
      if (!stream) return
      // CRITICAL FIX: After media becomes available, add tracks to any
      // peer connections that were created BEFORE media was ready,
      // then renegotiate so remote peers can receive our audio/video.
      if (peerConnectionsRef.current.size > 0) {
        console.log(`[Media] Adding ${stream.getTracks().length} tracks to ${peerConnectionsRef.current.size} existing peer connections`)
        peerConnectionsRef.current.forEach((pc, peerSocketId) => {
          const existingTrackIds = pc.getSenders().map(s => s.track?.id).filter(Boolean)
          let added = false
          stream.getTracks().forEach(track => {
            if (!existingTrackIds.includes(track.id)) {
              pc.addTrack(track, stream)
              added = true
            }
          })
          if (added) {
            renegotiatePeer(peerSocketId)
          }
        })
      }
    }).catch(() => {}) // Silently ignore errors (handled by initLocalMedia internally)

    // Safety timeout: if still joining after 15s, force show the meeting UI
    const joinTimeout = setTimeout(() => {
      if (useMeetingStore.getState().roomId === roomId) {
        setIsJoining(false)
      }
    }, 15000)

    return () => {
      clearTimeout(joinTimeout)
      mediaCancelledRef.current = true
      joinedRoomRef.current = false
      // Only clean up media/connections, NOT the socket (leaveMeeting handles that)
      cleanup()
    }
  }, [roomId])

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

  // ============ Virtual Background Processor ============
  const handleVirtualBackgroundChange = useCallback(async (type: BackgroundType, value: string | null) => {
    // Update store
    setVirtualBackgroundType(type, value)

    if (!localStreamRef.current) return

    const config: BackgroundConfig = { type, value }

    if (type === 'none') {
      // Stop processor and restore original stream
      if (bgProcessorActiveRef.current) {
        BackgroundProcessor.stop()
        bgProcessorActiveRef.current = false

        // Restore original stream to VideoGrid
        setLocalStream(localStreamRef.current)

        // Replace processed track back to original in peer connections
        const originalTrack = BackgroundProcessor.getOriginalVideoTrack()
        if (originalTrack) {
          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
            if (sender) {
              sender.replaceTrack(originalTrack).catch(() => {})
            }
          })
        }
      }
      processedStreamRef.current = null
      setShowVirtualBgOpen(false)
      return
    }

    // type is 'blur', 'gradient', or 'image'
    setShowVirtualBgOpen(false)
    setIsBgLoading(true)

    // Set up status callback for loading/error feedback
    BackgroundProcessor.onStatusChange((status) => {
      if (!status.isLoading && status.isActive) {
        setIsBgLoading(false)
        const label = type === 'blur' ? `Blur (${value}px)` : type === 'gradient' ? 'Gradient' : 'Image'
        toast({ title: `Background Applied`, description: `${label} virtual background is now active.` })
        BackgroundProcessor.onStatusChange(null)
      } else if (!status.isLoading && status.error) {
        setIsBgLoading(false)
        toast({ title: 'Background Failed', description: status.error, variant: 'destructive' })
        BackgroundProcessor.onStatusChange(null)
      }
    })

    try {
      const stream = await BackgroundProcessor.start(localStreamRef.current, config)
      if (!stream) {
        setIsBgLoading(false)
        toast({ title: 'Background Failed', description: 'Could not start virtual background. The segmentation model may not have loaded.', variant: 'destructive' })
        return
      }

      bgProcessorActiveRef.current = true
      processedStreamRef.current = stream

      // Update the stream that VideoGrid sees
      setLocalStream(stream)

      // Replace video track in all peer connections
      const processedTrack = stream.getVideoTracks()[0]
      if (processedTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) {
            sender.replaceTrack(processedTrack).catch(() => {})
          }
        })
      }
    } catch (err) {
      console.error('[MeetingRoom] Failed to start background processor:', err)
      setIsBgLoading(false)
      toast({ title: 'Background Error', description: 'Failed to start virtual background processor.', variant: 'destructive' })
    }
  }, [setVirtualBackgroundType])

  // Watch for virtual background type changes from store (e.g. clearing on room leave)
  useEffect(() => {
    if (virtualBackgroundType === 'none' && bgProcessorActiveRef.current) {
      BackgroundProcessor.stop()
      bgProcessorActiveRef.current = false
      processedStreamRef.current = null
      if (localStreamRef.current) {
        setLocalStream(localStreamRef.current)
      }
    }
  }, [virtualBackgroundType])

  // ============ Network Quality ============
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

  // Show loading while joining room
  if (isJoining && !mediaError && !connectionError) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <motion.div
          className="w-12 h-12 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-zinc-400 text-sm">Joining meeting...</p>
      </div>
    )
  }

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
      {/* Connection Error Overlay */}
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

      {/* Media Error Overlay */}
      <AnimatePresence>
        {mediaError && mediaInitDone && (
          <motion.div
            className="absolute inset-0 z-50 bg-black/85 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="bg-zinc-900 rounded-2xl p-8 max-w-md text-center space-y-5 border border-zinc-700">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto">
                <VideoOff className="w-8 h-8 text-amber-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">Camera & Microphone Access</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{mediaError.message}</p>
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={retryMediaInit}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                  Retry Camera & Microphone
                </Button>
                {mediaError.allowJoinWithout && (
                  <Button
                    onClick={handleJoinWithoutMedia}
                    variant="outline"
                    className="border-zinc-600 text-zinc-300 hover:bg-zinc-800 w-full"
                  >
                    <MicOff className="w-4 h-4 mr-2" />
                    Join Without Camera
                  </Button>
                )}
                <Button
                  onClick={leaveMeeting}
                  variant="ghost"
                  className="text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 w-full"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Back to Dashboard
                </Button>
              </div>
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
            {isRecording && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/20">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-xs font-medium">REC</span>
              </div>
            )}
            <span className="text-zinc-400 text-sm font-mono">{elapsedTime}</span>
          </div>

          {/* Download Recording */}
          {downloadUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1.5"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = downloadUrl
                  a.download = `meeting-${roomId}-${Date.now()}.webm`
                  a.click()
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="text-xs">Save Recording</span>
              </Button>
            </motion.div>
          )}

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
          {/* Pass peerStreamsMap so VideoGrid can merge streams into peer objects */}
          <VideoGrid localStream={localStream} peerStreams={peerStreamsMap} />

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
              className="w-96 border-l border-zinc-800 shrink-0"
              initial={{ x: 384, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 384, opacity: 0 }}
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

          {isWhiteboardOpen && (
            <motion.div
              key="whiteboard"
              className="w-[480px] border-l border-zinc-800 shrink-0"
              initial={{ x: 480, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 480, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <Whiteboard
                socket={socketRef.current}
                isOpen={isWhiteboardOpen}
                onClose={() => setWhiteboardOpen(false)}
              />
            </motion.div>
          )}

          {isFileShareOpen && (
            <motion.div
              key="fileshare"
              className="w-80 border-l border-zinc-800 shrink-0"
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <FileSharePanel
                socket={socketRef.current}
                isOpen={isFileShareOpen}
                onClose={() => setFileShareOpen(false)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="relative">
        <MeetingControls
          socket={socketRef.current}
          onLeave={leaveMeeting}
          localStream={localStream}
          onToggleScreenShare={handleToggleScreenShare}
          onToggleRecording={handleToggleRecording}
          onSettingsOpen={() => setSettingsOpen(true)}
          onToggleVirtualBackground={() => setShowVirtualBgOpen((p) => !p)}
        />

        {/* Virtual Background Popover */}
        <VirtualBackground
          isOpen={showVirtualBgOpen}
          onClose={() => setShowVirtualBgOpen(false)}
          onBackgroundChange={handleVirtualBackgroundChange}
          currentType={virtualBackgroundType}
          currentValue={virtualBackgroundValue}
          isLoading={isBgLoading}
        />
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </motion.div>
  )
}
