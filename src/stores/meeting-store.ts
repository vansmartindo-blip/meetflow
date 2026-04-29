import { create } from 'zustand'

export interface Peer {
  id: string
  socketId: string
  name: string
  avatar?: string
  role: 'host' | 'participant'
  isMuted: boolean
  isCameraOff: boolean
  isHandRaised: boolean
  joinedAt: number
  stream?: MediaStream
}

export interface ChatMsg {
  id: string
  userId: string
  userName: string
  content: string
  type: 'text' | 'system' | 'reaction' | 'file'
  fileUrl?: string
  fileName?: string
  timestamp: number
}

export interface Reaction {
  userId: string
  userName: string
  emoji: string
  timestamp: number
}

type ViewType = 'dashboard' | 'meeting' | 'settings'

interface MeetingState {
  // View
  currentView: ViewType
  setView: (view: ViewType) => void

  // Meeting Room
  roomId: string | null
  roomTitle: string | null
  hostId: string | null
  isRoomLocked: boolean
  screenShareEnabled: boolean
  myRole: 'host' | 'participant'
  joinedAt: number | null

  // Peers
  peers: Peer[]
  myPeerInfo: Peer | null

  // Media State
  isMuted: boolean
  isCameraOff: boolean
  isScreenSharing: boolean
  isRecording: boolean
  isHandRaised: boolean

  // Chat
  chatMessages: ChatMsg[]
  isChatOpen: boolean
  unreadMessages: number

  // Participant List
  isParticipantListOpen: boolean

  // Whiteboard
  isWhiteboardOpen: boolean

  // File Share
  isFileShareOpen: boolean

  // Virtual Background
  virtualBackground: string | null
  virtualBackgroundType: 'none' | 'blur' | 'gradient' | 'image'
  virtualBackgroundValue: string | null

  // Reactions
  activeReactions: Reaction[]

  // Settings
  selectedAudioDevice: string
  selectedVideoDevice: string
  videoQuality: 'low' | 'medium' | 'high'

  // Network
  networkQuality: 'excellent' | 'good' | 'poor' | 'unknown'

  // Actions - Room
  setRoom: (roomId: string, title: string, hostId: string, myRole: 'host' | 'participant', myPeer: Peer) => void
  clearRoom: () => void
  setRoomLocked: (locked: boolean) => void
  setScreenShareEnabled: (enabled: boolean) => void

  // Actions - Peers
  addPeer: (peer: Peer) => void
  removePeer: (socketId: string) => void
  updatePeerMedia: (socketId: string, data: Partial<Peer>) => void
  updatePeerHand: (socketId: string, raised: boolean, userName?: string) => void
  setHostId: (hostId: string) => void
  setPeers: (peers: Peer[]) => void

  // Actions - Media
  toggleMute: () => void
  setMuted: (muted: boolean) => void
  toggleCamera: () => void
  setCameraOff: (off: boolean) => void
  setScreenSharing: (sharing: boolean) => void
  setRecording: (recording: boolean) => void
  toggleHand: () => void
  setHandRaised: (raised: boolean) => void

  // Actions - Chat
  addChatMessage: (msg: ChatMsg) => void
  clearChat: () => void
  toggleChat: () => void
  setChatOpen: (open: boolean) => void

  // Actions - Participant List
  toggleParticipantList: () => void
  setParticipantListOpen: (open: boolean) => void

  // Actions - Whiteboard
  toggleWhiteboard: () => void
  setWhiteboardOpen: (open: boolean) => void

  // Actions - File Share
  toggleFileShare: () => void
  setFileShareOpen: (open: boolean) => void

  // Actions - Virtual Background
  setVirtualBackground: (bg: string | null) => void
  setVirtualBackgroundType: (type: 'none' | 'blur' | 'gradient' | 'image', value: string | null) => void

  // Actions - Reactions
  addReaction: (reaction: Reaction) => void
  removeReaction: (userId: string, emoji: string) => void

  // Actions - Settings
  setAudioDevice: (deviceId: string) => void
  setVideoDevice: (deviceId: string) => void
  setVideoQuality: (quality: 'low' | 'medium' | 'high') => void
  setNetworkQuality: (quality: 'excellent' | 'good' | 'poor' | 'unknown') => void
}

export const useMeetingStore = create<MeetingState>((set, get) => ({
  // View
  currentView: 'dashboard',
  setView: (view) => set({ currentView: view }),

  // Meeting Room
  roomId: null,
  roomTitle: null,
  hostId: null,
  isRoomLocked: false,
  screenShareEnabled: true,
  myRole: 'participant',
  joinedAt: null,

  // Peers
  peers: [],
  myPeerInfo: null,

  // Media State
  isMuted: false,
  isCameraOff: false,
  isScreenSharing: false,
  isRecording: false,
  isHandRaised: false,

  // Chat
  chatMessages: [],
  isChatOpen: false,
  unreadMessages: 0,

  // Participant List
  isParticipantListOpen: false,

  // Whiteboard
  isWhiteboardOpen: false,

  // File Share
  isFileShareOpen: false,

  // Virtual Background
  virtualBackground: null,
  virtualBackgroundType: 'none' as const,
  virtualBackgroundValue: null,

  // Reactions
  activeReactions: [],

  // Settings
  selectedAudioDevice: 'default',
  selectedVideoDevice: 'default',
  videoQuality: 'medium',

  // Network
  networkQuality: 'unknown',

  // Actions - Room
  setRoom: (roomId, title, hostId, myRole, myPeer) =>
    set({
      roomId,
      roomTitle: title,
      hostId,
      myRole,
      myPeerInfo: myPeer,
      joinedAt: Date.now(),
      chatMessages: [],
      activeReactions: [],
      unreadMessages: 0,
      isChatOpen: false,
      isParticipantListOpen: false,
      isHandRaised: false,
      isScreenSharing: false,
      isRecording: false,
    }),
  clearRoom: () =>
    set({
      roomId: null,
      roomTitle: null,
      hostId: null,
      myRole: 'participant',
      myPeerInfo: null,
      joinedAt: null,
      peers: [],
      chatMessages: [],
      activeReactions: [],
      unreadMessages: 0,
      isChatOpen: false,
      isParticipantListOpen: false,
      isHandRaised: false,
      isScreenSharing: false,
      isRecording: false,
    }),
  setRoomLocked: (locked) => set({ isRoomLocked: locked }),
  setScreenShareEnabled: (enabled) => set({ screenShareEnabled: enabled }),

  // Actions - Peers
  addPeer: (peer) => set((state) => {
    if (state.peers.find(p => p.socketId === peer.socketId)) return state
    return { peers: [...state.peers, peer] }
  }),
  removePeer: (socketId) => set((state) => ({
    peers: state.peers.filter(p => p.socketId !== socketId)
  })),
  updatePeerMedia: (socketId, data) => set((state) => ({
    peers: state.peers.map(p =>
      p.socketId === socketId ? { ...p, ...data } : p
    )
  })),
  updatePeerHand: (socketId, raised, userName) => set((state) => ({
    peers: state.peers.map(p =>
      p.socketId === socketId ? { ...p, isHandRaised: raised } : p
    )
  })),
  setHostId: (hostId) => set({ hostId }),
  setPeers: (peers) => set({ peers }),

  // Actions - Media
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setMuted: (muted) => set({ isMuted: muted }),
  toggleCamera: () => set((state) => ({ isCameraOff: !state.isCameraOff })),
  setCameraOff: (off) => set({ isCameraOff: off }),
  setScreenSharing: (sharing) => set({ isScreenSharing: sharing }),
  setRecording: (recording) => set({ isRecording: recording }),
  toggleHand: () => {
    const raised = !get().isHandRaised
    set({ isHandRaised: raised })
    return raised
  },
  setHandRaised: (raised) => set({ isHandRaised: raised }),

  // Actions - Chat
  addChatMessage: (msg) => set((state) => {
    // Deduplicate: skip if a message with same userId, content, and similar timestamp already exists
    const isDuplicate = state.chatMessages.some(
      (m) => m.userId === msg.userId && m.content === msg.content && Math.abs(m.timestamp - msg.timestamp) < 2000
    )
    if (isDuplicate) return state
    return {
      chatMessages: [...state.chatMessages, msg],
      unreadMessages: state.isChatOpen ? 0 : state.unreadMessages + 1,
    }
  }),
  clearChat: () => set({ chatMessages: [], unreadMessages: 0 }),
  toggleChat: () => set((state) => ({
    isChatOpen: !state.isChatOpen,
    unreadMessages: state.isChatOpen ? 0 : state.unreadMessages,
    isParticipantListOpen: false,
    isWhiteboardOpen: false,
    isFileShareOpen: false,
  })),
  setChatOpen: (open) => set({
    isChatOpen: open,
    unreadMessages: open ? 0 : undefined as any,
    isWhiteboardOpen: false,
    isFileShareOpen: false,
  }),

  // Actions - Participant List
  toggleParticipantList: () => set((state) => ({
    isParticipantListOpen: !state.isParticipantListOpen,
    isChatOpen: false,
    isWhiteboardOpen: false,
    isFileShareOpen: false,
  })),
  setParticipantListOpen: (open) => set({
    isParticipantListOpen: open,
    isChatOpen: false,
    isWhiteboardOpen: false,
    isFileShareOpen: false,
  }),

  // Actions - Whiteboard
  toggleWhiteboard: () => set((state) => ({
    isWhiteboardOpen: !state.isWhiteboardOpen,
    isChatOpen: false,
    isParticipantListOpen: false,
    isFileShareOpen: false,
  })),
  setWhiteboardOpen: (open) => set({
    isWhiteboardOpen: open,
    isChatOpen: false,
    isParticipantListOpen: false,
    isFileShareOpen: false,
  }),

  // Actions - File Share
  toggleFileShare: () => set((state) => ({
    isFileShareOpen: !state.isFileShareOpen,
    isChatOpen: false,
    isParticipantListOpen: false,
    isWhiteboardOpen: false,
  })),
  setFileShareOpen: (open) => set({
    isFileShareOpen: open,
    isChatOpen: false,
    isParticipantListOpen: false,
    isWhiteboardOpen: false,
  }),

  // Actions - Virtual Background
  setVirtualBackground: (bg) => set({ virtualBackground: bg }),
  setVirtualBackgroundType: (type, value) => set({
    virtualBackgroundType: type,
    virtualBackgroundValue: value,
    virtualBackground: type === 'none' ? null : `${type}:${value || ''}`,
  }),

  // Actions - Reactions
  addReaction: (reaction) => set((state) => ({
    activeReactions: [...state.activeReactions, reaction]
  })),
  removeReaction: (userId, emoji) => set((state) => ({
    activeReactions: state.activeReactions.filter(r => !(r.userId === userId && r.emoji === emoji))
  })),

  // Actions - Settings
  setAudioDevice: (deviceId) => set({ selectedAudioDevice: deviceId }),
  setVideoDevice: (deviceId) => set({ selectedVideoDevice: deviceId }),
  setVideoQuality: (quality) => set({ videoQuality: quality }),
  setNetworkQuality: (quality) => set({ networkQuality: quality }),
}))
