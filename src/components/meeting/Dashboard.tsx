'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Label } from '@/components/ui/label'
import {
  Video,
  Plus,
  Link2,
  Copy,
  Check,
  Settings,
  LogOut,
  LogIn,
  UserPlus,
  Clock,
  Users,
  Shield,
  Monitor,
  Moon,
  Sun,
  ChevronRight,
} from 'lucide-react'
import { useUserStore } from '@/stores/user-store'
import { useMeetingStore, type Peer } from '@/stores/meeting-store'

// ─── Animation Variants ───────────────────────────────────────────────────────
const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
}

const stagger = {
  animate: {
    transition: { staggerChildren: 0.08 },
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface RecentMeeting {
  id: string
  title: string
  createdAt: string
  _count?: { participants: number }
}

// ─── Dashboard Component ─────────────────────────────────────────────────────
export default function Dashboard() {
  const { theme, setTheme } = useTheme()
  const { user, isAuthenticated, token, setAuth, logout } = useUserStore()
  const { setView, setRoom } = useMeetingStore()

  // ── Auth state ─────────────────────────────────────────────────────────────
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authName, setAuthName] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')

  // ── New meeting state ──────────────────────────────────────────────────────
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [newMeetingPassword, setNewMeetingPassword] = useState('')
  const [creatingMeeting, setCreatingMeeting] = useState(false)

  // ── Join meeting state ─────────────────────────────────────────────────────
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joiningMeeting, setJoiningMeeting] = useState(false)

  // ── Recent meetings state ──────────────────────────────────────────────────
  const [recentMeetings, setRecentMeetings] = useState<RecentMeeting[]>([])
  const [loadingMeetings, setLoadingMeetings] = useState(false)

  // ── Copy state ─────────────────────────────────────────────────────────────
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // ── Theme toggle ───────────────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ── Fetch recent meetings ──────────────────────────────────────────────────
  const fetchRecentMeetings = useCallback(async () => {
    if (!token) return
    setLoadingMeetings(true)
    try {
      const res = await fetch('/api/meetings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        const meetings: RecentMeeting[] = [
          ...(data.hostedMeetings || []).map(
            (m: RecentMeeting & { _count?: { participants: number } }) => ({
              id: m.id,
              title: m.title,
              createdAt: m.createdAt,
              _count: m._count,
            })
          ),
          ...(data.participatedMeetings || [])
            .filter((p: { meeting: RecentMeeting }) => p.meeting)
            .map((p: { meeting: RecentMeeting & { _count?: { participants: number } } }) => ({
              id: p.meeting.id,
              title: p.meeting.title,
              createdAt: p.meeting.createdAt,
              _count: p.meeting._count,
            })),
        ]
        // Deduplicate by id
        const seen = new Set<string>()
        const unique = meetings.filter((m) => {
          if (seen.has(m.id)) return false
          seen.add(m.id)
          return true
        })
        setRecentMeetings(unique.slice(0, 10))
      }
    } catch {
      // Silently fail – recent meetings is a nice-to-have
    } finally {
      setLoadingMeetings(false)
    }
  }, [token])

  useEffect(() => {
    fetchRecentMeetings()
  }, [fetchRecentMeetings])

  // ── Open auth dialog automatically if not authenticated ────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      const t = setTimeout(() => setAuthDialogOpen(true), 600)
      return () => clearTimeout(t)
    }
  }, [isAuthenticated])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAuth = async () => {
    setAuthError('')
    setAuthLoading(true)
    try {
      const body: Record<string, string> = {
        action: authMode,
        email: authEmail,
        password: authPassword,
      }
      if (authMode === 'register') {
        body.name = authName
      }
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed')
        return
      }
      useUserStore.getState().setAuth(data.user, data.token)
      setAuthDialogOpen(false)
      setAuthEmail('')
      setAuthPassword('')
      setAuthName('')
    } catch {
      setAuthError('Something went wrong. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleCreateMeeting = async () => {
    if (!isAuthenticated || !token) {
      setAuthDialogOpen(true)
      return
    }
    setCreatingMeeting(true)
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newMeetingTitle || 'Untitled Meeting',
          password: newMeetingPassword || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return
      }
      const { meeting } = data
      const myPeer: Peer = {
        id: user!.id,
        socketId: '',
        name: user!.name,
        avatar: user!.avatar,
        role: 'host',
        isMuted: false,
        isCameraOff: false,
        isHandRaised: false,
        joinedAt: Date.now(),
      }
      setRoom(meeting.id, meeting.title, meeting.hostId, 'host', myPeer)
      setView('meeting')
      setNewMeetingTitle('')
      setNewMeetingPassword('')
    } catch {
      // Error handled silently – user stays on dashboard
    } finally {
      setCreatingMeeting(false)
    }
  }

  const handleJoinMeeting = async () => {
    const roomId = joinRoomId.trim()
    if (!roomId) return
    if (!isAuthenticated) {
      setAuthDialogOpen(true)
      return
    }
    setJoiningMeeting(true)
    try {
      // Verify meeting exists
      const res = await fetch(`/api/meetings/${roomId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setJoinRoomId('')
        return
      }
      const data = await res.json()
      const meeting = data.meeting
      const myPeer: Peer = {
        id: user!.id,
        socketId: '',
        name: user!.name,
        avatar: user!.avatar,
        role: user!.id === meeting.hostId ? 'host' : 'participant',
        isMuted: false,
        isCameraOff: false,
        isHandRaised: false,
        joinedAt: Date.now(),
      }
      setRoom(meeting.id, meeting.title, meeting.hostId, myPeer.role, myPeer)
      setView('meeting')
      setJoinRoomId('')
    } catch {
      setJoinRoomId('')
    } finally {
      setJoiningMeeting(false)
    }
  }

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return d.toLocaleDateString()
  }

  const getUserInitials = (name?: string | null) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <motion.header
        {...fadeIn}
        transition={{ duration: 0.3 }}
        className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Video className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Meet<span className="text-emerald-600">Flow</span>
            </span>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-9 w-9 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                aria-label="Toggle theme"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {theme === 'dark' ? (
                    <motion.div
                      key="sun"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Sun className="h-4 w-4" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="moon"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Moon className="h-4 w-4" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Button>
            )}

            {isAuthenticated && user ? (
              <>
                <Separator orientation="vertical" className="h-6 mx-1" />
                {/* Settings */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                  onClick={() => setView('settings')}
                  aria-label="Settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
                {/* User Avatar */}
                <Avatar className="h-8 w-8 border-2 border-emerald-200">
                  <AvatarFallback className="bg-emerald-50 text-emerald-700 text-xs font-semibold">
                    {getUserInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                {/* Logout */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500 hover:text-red-600 hover:bg-red-50 ml-1"
                  onClick={logout}
                >
                  <LogOut className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <>
                <Separator orientation="vertical" className="h-6 mx-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
                  onClick={() => {
                    setAuthMode('login')
                    setAuthDialogOpen(true)
                  }}
                >
                  <LogIn className="h-4 w-4 mr-1.5" />
                  <span className="hidden sm:inline">Sign In</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* ─── Main Content ────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
          {/* Hero heading */}
          <motion.div
            {...fadeIn}
            transition={{ duration: 0.35 }}
            className="mb-8 sm:mb-10"
          >
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Video Meetings,{' '}
              <span className="text-emerald-600">Simplified</span>
            </h1>
            <p className="mt-2 text-muted-foreground text-sm sm:text-base max-w-xl">
              Start a meeting instantly or join one with a link. No downloads required.
            </p>
          </motion.div>

          {/* ── Two main action cards ──────────────────────────────────── */}
          <motion.div
            variants={stagger}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
          >
            {/* LEFT: New Meeting */}
            <motion.div {...fadeIn} transition={{ duration: 0.35 }}>
              <Card className="h-full border-2 border-emerald-100 bg-gradient-to-br from-white to-emerald-50/40 shadow-sm hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-gray-900">
                        New Meeting
                      </CardTitle>
                      <CardDescription className="text-xs text-gray-500">
                        Host a new meeting room
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="meeting-title" className="text-sm font-medium text-gray-700">
                      Meeting Title
                    </Label>
                    <Input
                      id="meeting-title"
                      placeholder="e.g. Weekly Standup"
                      value={newMeetingTitle}
                      onChange={(e) => setNewMeetingTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateMeeting()}
                      className="h-10 border-gray-200 focus:border-emerald-400 focus:ring-emerald-400/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="meeting-password" className="text-sm font-medium text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-gray-400" />
                        Password{' '}
                        <span className="text-gray-400 font-normal">(optional)</span>
                      </span>
                    </Label>
                    <Input
                      id="meeting-password"
                      type="password"
                      placeholder="Add meeting password"
                      value={newMeetingPassword}
                      onChange={(e) => setNewMeetingPassword(e.target.value)}
                      className="h-10 border-gray-200 focus:border-emerald-400 focus:ring-emerald-400/20"
                    />
                  </div>
                  <Button
                    onClick={handleCreateMeeting}
                    disabled={creatingMeeting}
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm shadow-emerald-600/20 hover:shadow-md hover:shadow-emerald-600/25 transition-all duration-200"
                  >
                    {creatingMeeting ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="mr-2 h-4 w-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                    ) : (
                      <Video className="mr-2 h-4 w-4" />
                    )}
                    Create Meeting
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* RIGHT: Join Meeting */}
            <motion.div {...fadeIn} transition={{ duration: 0.35, delay: 0.05 }}>
              <Card className="h-full border-2 border-blue-100 bg-gradient-to-br from-white to-blue-50/40 shadow-sm hover:shadow-md transition-shadow duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                      <Link2 className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-gray-900">
                        Join Meeting
                      </CardTitle>
                      <CardDescription className="text-xs text-gray-500">
                        Enter a room ID or link to join
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="room-id" className="text-sm font-medium text-gray-700">
                      Meeting ID / Link
                    </Label>
                    <Input
                      id="room-id"
                      placeholder="e.g. abc123def456"
                      value={joinRoomId}
                      onChange={(e) => setJoinRoomId(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoinMeeting()}
                      className="h-10 border-gray-200 focus:border-blue-400 focus:ring-blue-400/20"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-400 px-1">
                    <Monitor className="h-3.5 w-3.5" />
                    <span>Works on all modern browsers &mdash; no install needed</span>
                  </div>

                  <Button
                    onClick={handleJoinMeeting}
                    disabled={joiningMeeting || !joinRoomId.trim()}
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm shadow-blue-600/20 hover:shadow-md hover:shadow-blue-600/25 transition-all duration-200 disabled:opacity-50"
                  >
                    {joiningMeeting ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="mr-2 h-4 w-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                    ) : (
                      <UserPlus className="mr-2 h-4 w-4" />
                    )}
                    Join Meeting
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>

          {/* ── Recent Meetings ─────────────────────────────────────────── */}
          <motion.section
            {...fadeIn}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="mt-10 sm:mt-14"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="h-5 w-5 text-gray-400" />
                Recent Meetings
              </h2>
              {isAuthenticated && recentMeetings.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={fetchRecentMeetings}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  Refresh
                </Button>
              )}
            </div>

            {!isAuthenticated ? (
              <Card className="border-dashed border-gray-200">
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400 mb-3">
                    <LogIn className="h-5 w-5" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Sign in to view your meeting history</p>
                  <p className="text-xs text-gray-400 mt-1">Your recent meetings will appear here</p>
                </CardContent>
              </Card>
            ) : loadingMeetings ? (
              <Card className="border-dashed border-gray-200">
                <CardContent className="flex items-center justify-center py-10">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="h-6 w-6 border-2 border-gray-200 border-t-emerald-500 rounded-full"
                  />
                </CardContent>
              </Card>
            ) : recentMeetings.length === 0 ? (
              <Card className="border-dashed border-gray-200">
                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 mb-3">
                    <Video className="h-5 w-5" />
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No meetings yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Create your first meeting to get started
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="max-h-96">
                <div className="space-y-2 pr-4">
                  {recentMeetings.map((meeting, i) => (
                    <motion.div
                      key={meeting.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.25 }}
                    >
                      <Card className="group hover:border-emerald-200 hover:shadow-sm transition-all duration-200 cursor-pointer"
                        onClick={() => {
                          if (!user || !token) return
                          const myPeer: Peer = {
                            id: user.id,
                            socketId: '',
                            name: user.name,
                            avatar: user.avatar,
                            role: 'participant',
                            isMuted: false,
                            isCameraOff: false,
                            isHandRaised: false,
                            joinedAt: Date.now(),
                          }
                          setRoom(meeting.id, meeting.title, '', 'participant', myPeer)
                          setView('meeting')
                        }}
                      >
                        <CardContent className="flex items-center justify-between py-3 px-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                              <Video className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {meeting.title}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                <span>{formatDate(meeting.createdAt)}</span>
                                {meeting._count && (
                                  <>
                                    <span className="text-gray-300">&middot;</span>
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3" />
                                      {meeting._count.participants} participant{meeting._count.participants !== 1 ? 's' : ''}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 bg-gray-100 text-gray-500 hidden sm:inline-flex">
                              {meeting.id}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-gray-400 hover:text-emerald-600"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCopyId(meeting.id)
                              }}
                              aria-label="Copy meeting ID"
                            >
                              {copiedId === meeting.id ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </motion.section>
        </div>
      </main>

      {/* ─── Footer ──────────────────────────────────────────────────────── */}
      <motion.footer
        {...fadeIn}
        transition={{ duration: 0.35, delay: 0.2 }}
        className="mt-auto border-t bg-gray-50/60"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400">
            <span>&copy; {new Date().getFullYear()} MeetFlow. Built with love.</span>
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              End-to-end encrypted meetings
            </span>
          </div>
        </div>
      </motion.footer>

      {/* ─── Auth Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={authDialogOpen} onOpenChange={setAuthDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">
              {authMode === 'login' ? 'Welcome back' : 'Create an account'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Toggle auth mode */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => {
                  setAuthMode('login')
                  setAuthError('')
                }}
                className={`flex-1 text-sm font-medium py-2 px-3 rounded-md transition-all duration-200 ${
                  authMode === 'login'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setAuthMode('register')
                  setAuthError('')
                }}
                className={`flex-1 text-sm font-medium py-2 px-3 rounded-md transition-all duration-200 ${
                  authMode === 'register'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Register
              </button>
            </div>

            {/* Error */}
            <AnimatePresence>
              {authError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
                    {authError}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Name (register only) */}
            <AnimatePresence>
              {authMode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  <Label htmlFor="auth-name" className="text-sm font-medium text-gray-700">
                    Full Name
                  </Label>
                  <Input
                    id="auth-name"
                    placeholder="John Doe"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="h-10 border-gray-200 focus:border-emerald-400 focus:ring-emerald-400/20"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="auth-email" className="text-sm font-medium text-gray-700">
                Email
              </Label>
              <Input
                id="auth-email"
                type="email"
                placeholder="you@example.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                className="h-10 border-gray-200 focus:border-emerald-400 focus:ring-emerald-400/20"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <Label htmlFor="auth-password" className="text-sm font-medium text-gray-700">
                Password
              </Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="••••••••"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                className="h-10 border-gray-200 focus:border-emerald-400 focus:ring-emerald-400/20"
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleAuth}
              disabled={authLoading || !authEmail || !authPassword || (authMode === 'register' && !authName)}
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50"
            >
              {authLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="mr-2 h-4 w-4 border-2 border-white/30 border-t-white rounded-full"
                />
              ) : authMode === 'login' ? (
                <LogIn className="mr-2 h-4 w-4" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {authMode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
