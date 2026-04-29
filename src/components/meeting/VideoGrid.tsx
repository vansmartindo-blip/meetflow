'use client'

import { useMemo, useEffect, useState } from 'react'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMeetingStore, type Peer } from '@/stores/meeting-store'
import VideoTile from './VideoTile'

interface VideoGridProps {
  localStream: MediaStream | null
  peerStreams?: Map<string, MediaStream>
}

export default function VideoGrid({ localStream, peerStreams }: VideoGridProps) {
  const {
    peers,
    myPeerInfo,
    isMuted,
    isCameraOff,
    isHandRaised,
    isScreenSharing,
  } = useMeetingStore()

  // Build local peer from store state
  const localPeer: Peer = useMemo(
    () => ({
      id: myPeerInfo?.id || 'local',
      socketId: myPeerInfo?.socketId || 'local',
      name: myPeerInfo?.name || 'You',
      avatar: myPeerInfo?.avatar,
      role: myPeerInfo?.role || 'participant',
      isMuted,
      isCameraOff,
      isHandRaised,
      joinedAt: myPeerInfo?.joinedAt || Date.now(),
      stream: localStream,
    }),
    [myPeerInfo, isMuted, isCameraOff, isHandRaised, localStream]
  )

  // Merge remote peer streams from the reactive peerStreams map
  const peersWithStreams = useMemo(() => {
    if (!peerStreams || peerStreams.size === 0) return peers
    return peers.map((peer) => {
      const stream = peerStreams.get(peer.socketId)
      if (stream && stream.getTracks().length > 0) {
        return { ...peer, stream }
      }
      return peer
    })
  }, [peers, peerStreams])

  // Sort peers: host first, then by join time
  const sortedPeers = useMemo(() => {
    return [...peersWithStreams].sort((a, b) => {
      if (a.role === 'host' && b.role !== 'host') return -1
      if (b.role === 'host' && a.role !== 'host') return 1
      return a.joinedAt - b.joinedAt
    })
  }, [peersWithStreams])

  // Determine if local or a remote peer is screen sharing
  const screenSharePeer = useMemo(() => {
    if (isScreenSharing) return localPeer
    const sharingPeer = sortedPeers.find(
      (p) =>
        p.stream &&
        p.stream.getVideoTracks().some((t) => t.label.toLowerCase().includes('screen'))
    )
    return sharingPeer || null
  }, [isScreenSharing, localPeer, sortedPeers])

  const hasScreenShare = !!screenSharePeer

  // All participants including local
  const allParticipants = useMemo(() => {
    return [localPeer, ...sortedPeers]
  }, [localPeer, sortedPeers])

  const effectiveCount = allParticipants.length

  const gridCols = useMemo(() => {
    if (effectiveCount <= 1) return 'grid-cols-1'
    if (effectiveCount <= 4) return 'grid-cols-1 sm:grid-cols-2'
    if (effectiveCount <= 9) return 'grid-cols-2 sm:grid-cols-3'
    return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
  }, [effectiveCount])

  const thumbnailCols = useMemo(() => {
    const count = allParticipants.length
    if (count <= 2) return 'grid-cols-2 sm:grid-cols-2'
    if (count <= 4) return 'grid-cols-2 sm:grid-cols-4'
    if (count <= 6) return 'grid-cols-3 sm:grid-cols-6'
    return 'grid-cols-4 sm:grid-cols-6'
  }, [allParticipants.length])

  if (allParticipants.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950">
        <p className="text-zinc-500">No participants</p>
      </div>
    )
  }

  // Screen sharing layout
  if (hasScreenShare && screenSharePeer) {
    return (
      <LayoutGroup>
        <div className="flex h-full w-full flex-col gap-2 p-2 bg-zinc-950">
          <div className="relative min-h-0 flex-[3]">
            <AnimatePresence mode="popLayout">
              <VideoTile
                key={`screen-${screenSharePeer.socketId}`}
                peer={screenSharePeer}
                isLocal={screenSharePeer.socketId === 'local' || screenSharePeer.socketId === myPeerInfo?.socketId}
                isScreenShare
                isDominant
              />
            </AnimatePresence>
          </div>

          <div className="flex-shrink-0">
            <div className={cn('grid gap-2', thumbnailCols)}>
              <AnimatePresence mode="popLayout">
                {allParticipants.map((participant) => (
                  <motion.div
                    key={participant.socketId}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className="relative aspect-video"
                  >
                    <VideoTile
                      peer={participant}
                      isLocal={participant.socketId === 'local' || participant.socketId === myPeerInfo?.socketId}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </LayoutGroup>
    )
  }

  // Single participant view
  if (allParticipants.length === 1) {
    return (
      <LayoutGroup>
        <div className="flex h-full w-full items-center justify-center bg-zinc-950 p-2">
          <AnimatePresence mode="popLayout">
            <motion.div
              key={allParticipants[0].socketId}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-full max-w-4xl"
            >
              <VideoTile
                peer={allParticipants[0]}
                isLocal={allParticipants[0].socketId === 'local' || allParticipants[0].socketId === myPeerInfo?.socketId}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </LayoutGroup>
    )
  }

  // Normal grid layout
  return (
    <LayoutGroup>
      <div className="flex h-full w-full items-center bg-zinc-950 p-2">
        <div className={cn('grid h-full w-full gap-2', gridCols)}>
          <AnimatePresence mode="popLayout">
            {allParticipants.map((participant) => (
              <motion.div
                key={participant.socketId}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="min-h-0"
              >
                <VideoTile
                  peer={participant}
                  isLocal={participant.socketId === 'local' || participant.socketId === myPeerInfo?.socketId}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </LayoutGroup>
  )
}
