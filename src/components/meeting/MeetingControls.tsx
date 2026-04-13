'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  MessageSquare,
  Users,
  Hand,
  Settings,
  Circle,
  Lock,
  Unlock,
  MoreVertical,
  Send,
  ArrowUpFromLine,
  X,
  Crown,
  Shield,
} from 'lucide-react'
import { useMeetingStore } from '@/stores/meeting-store'

interface MeetingControlsProps {
  socket: Socket | null
  onLeave: () => void
  localStream: MediaStream | null
  onToggleScreenShare: () => void
  onToggleRecording: () => void
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥']

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function ControlButton({
  children,
  tooltip,
  active,
  activeColor,
  danger,
  onClick,
  className = '',
  size = 'default',
}: {
  children: React.ReactNode
  tooltip: string
  active?: boolean
  activeColor?: string
  danger?: boolean
  onClick?: () => void
  className?: string
  size?: 'default' | 'lg'
}) {
  const sizeClasses = size === 'lg' ? 'h-12 w-12 rounded-full' : 'h-10 w-10 rounded-full'
  const iconSize = size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          onClick={onClick}
          className={`
            relative flex items-center justify-center text-zinc-200
            hover:bg-zinc-700/60 hover:text-white
            transition-all duration-200 cursor-pointer
            ${sizeClasses}
            ${active && !activeColor ? 'bg-zinc-700/80 text-white' : ''}
            ${activeColor ? activeColor : ''}
            ${danger ? 'hover:bg-red-600 hover:text-white' : ''}
            ${className}
          `}
        >
          <span className={iconSize}>{children}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-zinc-800 text-zinc-100 border-zinc-700 text-xs font-medium"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export default function MeetingControls({
  socket,
  onLeave,
  localStream,
  onToggleScreenShare,
  onToggleRecording,
}: MeetingControlsProps) {
  const {
    isMuted,
    isCameraOff,
    isScreenSharing,
    isRecording,
    isHandRaised,
    isChatOpen,
    isParticipantListOpen,
    unreadMessages,
    peers,
    myRole,
    hostId,
    isRoomLocked,
    screenShareEnabled,
    myPeerInfo,
    joinedAt,
    toggleMute,
    toggleCamera,
    setRecording,
    toggleHand,
    toggleChat,
    toggleParticipantList,
    setRoomLocked,
    setScreenShareEnabled,
  } = useMeetingStore()

  const [elapsedTime, setElapsedTime] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  const isHost = myRole === 'host'
  const participantCount = peers.length + 1 // include self

  // Meeting timer — setState only inside interval callbacks (async), never synchronously in the effect
  const joinedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!joinedAt) return
    joinedAtRef.current = joinedAt
    const tick = () => {
      const joined = joinedAtRef.current
      if (joined) {
        setElapsedTime(Math.floor((Date.now() - joined) / 1000))
      }
    }
    // Use setTimeout for first tick so setState is never called synchronously
    const timeout = setTimeout(tick, 0)
    const interval = setInterval(tick, 1000)
    return () => {
      clearTimeout(timeout)
      clearInterval(interval)
    }
  }, [joinedAt])

  const handleToggleMute = useCallback(() => {
    toggleMute()
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
      }
    }
    if (socket?.connected) {
      socket.emit('media-state', { isMuted: !isMuted })
    }
  }, [toggleMute, localStream, socket, isMuted])

  const handleToggleCamera = useCallback(() => {
    toggleCamera()
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
      }
    }
    if (socket?.connected) {
      socket.emit('media-state', { isCameraOff: !isCameraOff })
    }
  }, [toggleCamera, localStream, socket, isCameraOff])

  const handleToggleRecording = useCallback(() => {
    onToggleRecording()
  }, [onToggleRecording])

  const handleToggleHand = useCallback(() => {
    const raised = toggleHand()
    if (socket?.connected) {
      socket.emit('raise-hand', { raised })
    }
  }, [toggleHand, socket])

  const handleReaction = useCallback(
    (emoji: string) => {
      if (socket?.connected) {
        socket.emit('reaction', {
          emoji,
          userId: myPeerInfo?.id || 'local',
          userName: myPeerInfo?.name || 'You',
          timestamp: Date.now(),
        })
      }
    },
    [socket, myPeerInfo]
  )

  const handleToggleRoomLock = useCallback(() => {
    const newLocked = !isRoomLocked
    setRoomLocked(newLocked)
    if (socket?.connected) {
      socket.emit('host-toggle-lock', { locked: newLocked })
    }
  }, [isRoomLocked, setRoomLocked, socket])

  const handleToggleScreenShareForAll = useCallback(() => {
    setScreenShareEnabled(!screenShareEnabled)
    if (socket?.connected) {
      socket.emit('host-toggle-screen-share', { enabled: !screenShareEnabled })
    }
  }, [screenShareEnabled, setScreenShareEnabled, socket])

  const handleEndMeetingForAll = useCallback(() => {
    if (socket?.connected) {
      socket.emit('host-end-meeting')
    }
    onLeave()
  }, [socket, onLeave])

  return (
    <TooltipProvider delayDuration={300}>
      {/* Floating Meeting Timer */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40"
      >
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/80 backdrop-blur-sm border border-zinc-700/50">
          {isRecording && (
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="h-2 w-2 rounded-full bg-red-500"
            />
          )}
          <span className="text-xs font-mono text-zinc-300 tracking-wider">
            {formatTime(elapsedTime)}
          </span>
        </div>
      </motion.div>

      {/* Main Controls Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <div className="flex items-center gap-1 px-3 py-2 rounded-full bg-zinc-900/90 backdrop-blur-md border border-zinc-700/40 shadow-2xl">
          {/* Left: Leave */}
          <div className="flex items-center gap-1">
            <ControlButton
              tooltip="Leave Meeting"
              danger
              onClick={onLeave}
            >
              <PhoneOff className="h-5 w-5 text-red-400" />
            </ControlButton>
          </div>

          <Separator orientation="vertical" className="h-8 bg-zinc-700/60 mx-1" />

          {/* Center: Main Media Controls */}
          <div className="flex items-center gap-0.5">
            {/* Mic Toggle */}
            <ControlButton
              tooltip={isMuted ? 'Unmute' : 'Mute'}
              active={isMuted}
              activeColor={isMuted ? 'bg-red-600/90 hover:bg-red-500' : 'bg-zinc-700/80'}
              onClick={handleToggleMute}
            >
              {isMuted ? (
                <MicOff className="h-5 w-5 text-red-200" />
              ) : (
                <Mic className="h-5 w-5 text-emerald-400" />
              )}
            </ControlButton>

            {/* Camera Toggle */}
            <ControlButton
              tooltip={isCameraOff ? 'Turn on Camera' : 'Turn off Camera'}
              active={isCameraOff}
              activeColor={isCameraOff ? 'bg-red-600/90 hover:bg-red-500' : 'bg-zinc-700/80'}
              onClick={handleToggleCamera}
            >
              {isCameraOff ? (
                <VideoOff className="h-5 w-5 text-red-200" />
              ) : (
                <Video className="h-5 w-5 text-emerald-400" />
              )}
            </ControlButton>

            {/* Screen Share */}
            <ControlButton
              tooltip={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              active={isScreenSharing}
              activeColor="bg-emerald-600/80 hover:bg-emerald-500"
              onClick={onToggleScreenShare}
            >
              {isScreenSharing ? (
                <ArrowUpFromLine className="h-5 w-5 text-white" />
              ) : (
                <Monitor className="h-5 w-5" />
              )}
            </ControlButton>

            {/* Record */}
            <AnimatePresence mode="wait">
              <ControlButton
                key={isRecording ? 'recording' : 'idle'}
                tooltip={isRecording ? 'Stop Recording' : 'Start Recording'}
                active={isRecording}
                activeColor={isRecording ? 'bg-red-600/80 hover:bg-red-500' : ''}
                onClick={handleToggleRecording}
              >
                {isRecording ? (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  >
                    <Circle className="h-5 w-5 text-red-200 fill-red-200" />
                  </motion.div>
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </ControlButton>
            </AnimatePresence>

            {/* Raise Hand */}
            <ControlButton
              tooltip={isHandRaised ? 'Lower Hand' : 'Raise Hand'}
              active={isHandRaised}
              activeColor="bg-amber-600/80 hover:bg-amber-500"
              onClick={handleToggleHand}
            >
              <motion.div
                animate={isHandRaised ? { y: [0, -3, 0] } : {}}
                transition={{ duration: 0.8, repeat: isHandRaised ? Infinity : 0 }}
              >
                <Hand
                  className={`h-5 w-5 ${isHandRaised ? 'text-amber-200' : ''}`}
                />
              </motion.div>
            </ControlButton>
          </div>

          <Separator orientation="vertical" className="h-8 bg-zinc-700/60 mx-1" />

          {/* Right: Side Panels & More */}
          <div className="flex items-center gap-0.5">
            {/* Chat */}
            <div className="relative">
              <ControlButton
                tooltip="Chat"
                active={isChatOpen}
                onClick={toggleChat}
              >
                <MessageSquare className="h-5 w-5" />
              </ControlButton>
              {unreadMessages > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold leading-none pointer-events-none"
                >
                  {unreadMessages > 99 ? '99+' : unreadMessages}
                </motion.div>
              )}
            </div>

            {/* Participants */}
            <div className="relative">
              <ControlButton
                tooltip="Participants"
                active={isParticipantListOpen}
                onClick={toggleParticipantList}
              >
                <Users className="h-5 w-5" />
              </ControlButton>
              <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-[16px] px-0.5 rounded-full bg-zinc-600 text-zinc-200 text-[9px] font-bold leading-none pointer-events-none">
                {participantCount}
              </div>
            </div>

            {/* Reactions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div>
                  <ControlButton tooltip="Reactions">
                    <span className="text-base leading-none">😂</span>
                  </ControlButton>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                side="top"
                className="bg-zinc-800 border-zinc-700/80 p-1.5 rounded-xl"
              >
                <div className="flex items-center gap-0.5">
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(emoji)}
                      className="flex items-center justify-center h-10 w-10 rounded-lg text-xl hover:bg-zinc-700/60 transition-colors cursor-pointer hover:scale-110 transform duration-150"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* More Options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div>
                  <ControlButton tooltip="More Options">
                    <MoreVertical className="h-5 w-5" />
                  </ControlButton>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                side="top"
                className="bg-zinc-800 border-zinc-700/80 rounded-xl min-w-[200px] p-1"
              >
                {/* Settings */}
                <DropdownMenuItem
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-200 hover:bg-zinc-700/60 cursor-pointer focus:bg-zinc-700/60 focus:text-zinc-200"
                >
                  <Settings className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm">Settings</span>
                </DropdownMenuItem>

                {/* Host-only options */}
                {isHost && (
                  <>
                    <DropdownMenuItem
                      onClick={handleToggleRoomLock}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-200 hover:bg-zinc-700/60 cursor-pointer focus:bg-zinc-700/60 focus:text-zinc-200"
                    >
                      {isRoomLocked ? (
                        <Lock className="h-4 w-4 text-amber-400" />
                      ) : (
                        <Unlock className="h-4 w-4 text-zinc-400" />
                      )}
                      <span className="text-sm">
                        {isRoomLocked ? 'Unlock Room' : 'Lock Room'}
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      onClick={handleToggleScreenShareForAll}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-200 hover:bg-zinc-700/60 cursor-pointer focus:bg-zinc-700/60 focus:text-zinc-200"
                    >
                      <Monitor className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm">
                        {screenShareEnabled
                          ? 'Disable Screen Share'
                          : 'Enable Screen Share'}
                      </span>
                    </DropdownMenuItem>
                  </>
                )}

                {isHost && (
                  <>
                    <Separator className="my-1 bg-zinc-700/60" />
                    <DropdownMenuItem
                      onClick={handleEndMeetingForAll}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-red-400 hover:bg-red-600/20 cursor-pointer focus:bg-red-600/20 focus:text-red-400"
                    >
                      <PhoneOff className="h-4 w-4" />
                      <span className="text-sm font-medium">End Meeting for All</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.div>
    </TooltipProvider>
  )
}
