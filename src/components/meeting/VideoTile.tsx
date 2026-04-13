'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Hand } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Peer } from '@/stores/meeting-store'

interface VideoTileProps {
  peer: Peer
  isLocal: boolean
  isScreenShare?: boolean
  isDominant?: boolean
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Derive hasVideoTrack synchronously from peer data (no setState in effect)
function useHasVideoTrack(stream: MediaStream | null, isCameraOff: boolean): boolean {
  if (isCameraOff || !stream) return false
  const videoTracks = stream.getVideoTracks()
  return videoTracks.some((t) => t.enabled && t.readyState !== 'ended')
}

export default function VideoTile({
  peer,
  isLocal,
  isScreenShare = false,
  isDominant = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isHovering, setIsHovering] = useState(false)
  const [streamVersion, setStreamVersion] = useState(0)

  const hasVideoTrack = useHasVideoTrack(peer.stream, peer.isCameraOff)

  // Attach stream to video/audio elements whenever stream changes
  useEffect(() => {
    const videoEl = videoRef.current
    const audioEl = audioRef.current
    if (!peer.stream) return

    // Attach video
    if (videoEl) {
      videoEl.srcObject = peer.stream
      videoEl.play().catch(() => {
        videoEl.muted = true
        videoEl.play().catch(() => {})
      })
    }

    // Attach audio for remote peers
    if (!isLocal && audioEl) {
      audioEl.srcObject = peer.stream
      audioEl.play().catch(() => {})
    }

    // Listen for track changes to trigger re-evaluation
    const onTrackChange = () => setStreamVersion((v) => v + 1)
    peer.stream.getTracks().forEach((track) => {
      track.addEventListener('ended', onTrackChange)
      track.addEventListener('enabled', onTrackChange)
    })
    peer.stream.addEventListener('addtrack', onTrackChange)
    peer.stream.addEventListener('removetrack', onTrackChange)

    return () => {
      peer.stream!.getTracks().forEach((track) => {
        track.removeEventListener('ended', onTrackChange)
        track.removeEventListener('enabled', onTrackChange)
      })
      peer.stream!.removeEventListener('addtrack', onTrackChange)
      peer.stream!.removeEventListener('removetrack', onTrackChange)
    }
  }, [peer.stream, isLocal])

  // streamVersion is intentionally used to avoid the unused-var lint issue
  // and to ensure re-renders happen when tracks change
  void streamVersion

  const showAvatar = !hasVideoTrack

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'relative overflow-hidden rounded-xl bg-zinc-900',
        'aspect-video w-full',
        'group'
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Video Element */}
      {peer.stream && (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            showAvatar ? 'opacity-0 pointer-events-none' : 'opacity-100'
          )}
        />
      )}

      {/* Audio Element for remote peers */}
      {!isLocal && (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      )}

      {/* Avatar fallback when camera is off or no video track */}
      {showAvatar && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-800">
          {peer.avatar ? (
            <Avatar className={cn(isDominant ? 'h-24 w-24' : 'h-16 w-16')}>
              <AvatarImage src={peer.avatar} alt={peer.name} />
              <AvatarFallback className="bg-zinc-700 text-lg font-semibold text-zinc-200">
                {getInitials(peer.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div
              className={cn(
                'flex items-center justify-center rounded-full bg-zinc-700 text-zinc-200 font-semibold',
                isDominant ? 'h-24 w-24 text-2xl' : 'h-16 w-16 text-lg'
              )}
            >
              {getInitials(peer.name)}
            </div>
          )}
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Name label & indicators */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-white drop-shadow-md">
            {peer.name}
            {isLocal && (
              <span className="ml-1 text-xs text-zinc-400">(You)</span>
            )}
          </span>
          {peer.role === 'host' && (
            <Badge
              variant="secondary"
              className="border-amber-500/50 bg-amber-500/20 text-[10px] font-semibold text-amber-300 uppercase tracking-wider"
            >
              Host
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {peer.isMuted ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/80">
              <MicOff className="h-3.5 w-3.5 text-white" />
            </div>
          ) : (
            <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/60 backdrop-blur-sm">
              <Mic className="h-3.5 w-3.5 text-white" />
              <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
          )}

          {peer.isHandRaised && (
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/80"
            >
              <Hand className="h-3.5 w-3.5 text-white" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Hover overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovering ? 1 : 0 }}
        transition={{ duration: 0.15 }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20"
      >
        {showAvatar && (
          <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
              <path d="M10.513 4.856 13.12 2.24a.5.5 0 0 1 .846.36v4.87a.5.5 0 0 1-.754.433L11.02 6.67a.5.5 0 0 0-.754.433v1.794a.5.5 0 0 1-.754.433l-2.19-1.237a.5.5 0 0 0-.746.434v8.758a.5.5 0 0 0 .746.434l2.19-1.237a.5.5 0 0 1 .754.433v1.794a.5.5 0 0 0 .754.433l2.19-1.237a.5.5 0 0 1 .754.433v4.87a.5.5 0 0 1-.846.36L3.24 17.38a2 2 0 0 1-.744-1.56V6.18a2 2 0 0 1 .744-1.56z" />
              <path d="M15.6 8.4h3.8" /><path d="m17 7 1.5 1.5L17 10" /><path d="m17 10 1.5 1.5L17 13" />
            </svg>
            <span className="text-xs font-medium text-white">Camera off</span>
          </div>
        )}
      </motion.div>

      {/* Pin indicator for dominant */}
      {isDominant && !isScreenShare && (
        <div className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
          </svg>
        </div>
      )}

      {/* Screen share indicator */}
      {isScreenShare && (
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 backdrop-blur-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <path d="M12 2H2v10l9.29-9.29c.63-.63 1.71-.18 1.71.71v6.58" />
            <path d="M18 14h-4v4" /><path d="m22 14-4 4" /><path d="m22 18-4-4" /><path d="M12 22h10V12" />
          </svg>
          <span className="text-xs font-medium text-white">{peer.name}&apos;s Screen</span>
        </div>
      )}
    </motion.div>
  )
}
