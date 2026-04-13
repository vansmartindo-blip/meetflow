'use client'

import { motion } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Users,
  X,
  Crown,
  MicOff,
  Hand,
  MoreVertical,
  Shield,
  Mic,
  LogOut,
  UserCog,
} from 'lucide-react'
import { useMeetingStore, Peer } from '@/stores/meeting-store'

export default function ParticipantList({ socket }: { socket: any }) {
  const {
    peers,
    myPeerInfo,
    myRole,
    hostId,
    isRoomLocked,
    isMuted,
    isHandRaised,
    setParticipantListOpen,
  } = useMeetingStore()

  const isHost = myRole === 'host'

  const localPeer: Peer = {
    id: myPeerInfo?.id || 'local',
    socketId: myPeerInfo?.socketId || 'local',
    name: myPeerInfo?.name || 'You',
    avatar: myPeerInfo?.avatar,
    role: myRole,
    isMuted,
    isCameraOff: useMeetingStore.getState().isCameraOff,
    isHandRaised,
    joinedAt: myPeerInfo?.joinedAt || Date.now(),
  }

  const allParticipants = [localPeer, ...peers]

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-emerald-600',
      'bg-amber-600',
      'bg-rose-600',
      'bg-violet-600',
      'bg-cyan-600',
      'bg-pink-600',
      'bg-teal-600',
      'bg-orange-600',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const handleMutePeer = (peerId: string) => {
    if (socket?.connected) {
      socket.emit('host-mute-peer', { peerId })
    }
  }

  const handleKickPeer = (peerId: string) => {
    if (socket?.connected) {
      socket.emit('host-kick-peer', { peerId })
    }
  }

  const handleTransferHost = (peerId: string) => {
    if (socket?.connected) {
      socket.emit('host-transfer', { peerId })
    }
  }

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="flex flex-col w-80 h-full bg-zinc-900 border-l border-zinc-700/50 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/80 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Participants</h2>
          <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-emerald-600/20 text-emerald-400 text-xs font-medium">
            {allParticipants.length}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
          onClick={() => setParticipantListOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Room Info */}
      <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/40">
        <Shield className={`h-3.5 w-3.5 ${isRoomLocked ? 'text-amber-400' : 'text-zinc-500'}`} />
        <span className="text-xs text-zinc-400">
          {isRoomLocked ? 'Meeting is locked' : 'Meeting is open'}
        </span>
      </div>

      <Separator className="bg-zinc-700/50" />

      {/* Participant List */}
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="flex flex-col gap-1">
          {/* You (Local Participant) */}
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-800/40 hover:bg-zinc-800/70 transition-colors">
            <div className="relative shrink-0">
              <Avatar className="h-10 w-10">
                <AvatarFallback
                  className={`${getAvatarColor(localPeer.name)} text-white text-sm font-bold`}
                >
                  {getInitials(localPeer.name)}
                </AvatarFallback>
              </Avatar>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-zinc-100 truncate">
                  {localPeer.name}
                </span>
                {localPeer.role === 'host' && (
                  <Badge className="h-5 px-1.5 text-[10px] font-semibold bg-amber-600/20 text-amber-400 border-amber-600/30 hover:bg-amber-600/30 gap-0.5">
                    <Crown className="h-3 w-3" />
                    Host
                  </Badge>
                )}
                <Badge className="h-5 px-1.5 text-[10px] font-semibold bg-emerald-600/20 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/30">
                  You
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {localPeer.isMuted ? (
                  <MicOff className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Mic className="h-3.5 w-3.5 text-zinc-400" />
                )}
                <span className="text-xs text-zinc-500">
                  {localPeer.isMuted ? 'Muted' : 'In meeting'}
                </span>
              </div>
            </div>

            {localPeer.isHandRaised && (
              <motion.div
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                className="flex items-center justify-center h-7 w-7 rounded-full bg-amber-500/20 shrink-0"
              >
                <Hand className="h-4 w-4 text-amber-400" />
              </motion.div>
            )}
          </div>

          {/* Remote Participants */}
          {peers.map((peer) => (
            <div
              key={peer.socketId}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800/70 transition-colors"
            >
              <div className="relative shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarFallback
                    className={`${getAvatarColor(peer.name)} text-white text-sm font-bold`}
                  >
                    {getInitials(peer.name)}
                  </AvatarFallback>
                </Avatar>
                {/* Online indicator */}
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 border-2 border-zinc-900" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-sm truncate ${
                      peer.id === hostId ? 'font-semibold text-zinc-100' : 'text-zinc-200'
                    }`}
                  >
                    {peer.name}
                  </span>
                  {peer.id === hostId && (
                    <Badge className="h-5 px-1.5 text-[10px] font-semibold bg-amber-600/20 text-amber-400 border-amber-600/30 hover:bg-amber-600/30 gap-0.5">
                      <Crown className="h-3 w-3" />
                      Host
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {peer.isMuted ? (
                    <MicOff className="h-3.5 w-3.5 text-red-400" />
                  ) : (
                    <Mic className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                  <span className="text-xs text-zinc-500">
                    {peer.isMuted ? 'Muted' : 'In meeting'}
                  </span>
                </div>
              </div>

              {/* Hand Raised Indicator */}
              {peer.isHandRaised && (
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex items-center justify-center h-7 w-7 rounded-full bg-amber-500/20 shrink-0"
                >
                  <Hand className="h-4 w-4 text-amber-400" />
                </motion.div>
              )}

              {/* Host Actions Dropdown */}
              {isHost && peer.id !== hostId && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="w-48 bg-zinc-800 border-zinc-700 text-zinc-200"
                  >
                    <DropdownMenuItem
                      onClick={() => handleMutePeer(peer.id)}
                      className="flex items-center gap-2 text-sm text-zinc-300 hover:bg-zinc-700 focus:bg-zinc-700 cursor-pointer"
                    >
                      {peer.isMuted ? (
                        <>
                          <Mic className="h-4 w-4" />
                          <span>Unmute</span>
                        </>
                      ) : (
                        <>
                          <MicOff className="h-4 w-4" />
                          <span>Mute</span>
                        </>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleTransferHost(peer.id)}
                      className="flex items-center gap-2 text-sm text-zinc-300 hover:bg-zinc-700 focus:bg-zinc-700 cursor-pointer"
                    >
                      <Crown className="h-4 w-4" />
                      <span>Make Host</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => handleKickPeer(peer.id)}
                      className="flex items-center gap-2 text-sm text-red-400 hover:bg-red-500/10 focus:bg-red-500/10 cursor-pointer"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Remove from meeting</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      <Separator className="bg-zinc-700/50" />

      {/* Footer */}
      <div className="px-4 py-2.5 bg-zinc-800/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-xs text-zinc-400">
              {allParticipants.length} participant{allParticipants.length !== 1 ? 's' : ''}
            </span>
          </div>
          {isHost && (
            <Badge className="h-5 px-1.5 text-[10px] font-semibold bg-emerald-600/20 text-emerald-400 border-emerald-600/30 hover:bg-emerald-600/30 gap-0.5">
              <UserCog className="h-3 w-3" />
              You are host
            </Badge>
          )}
        </div>
      </div>
    </motion.div>
  )
}
