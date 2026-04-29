'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Send, Smile, Paperclip, X, MessageSquare, FileIcon } from 'lucide-react'
import { useMeetingStore, ChatMsg } from '@/stores/meeting-store'
import EmojiPicker from './EmojiPicker'

export default function ChatPanel({ socket }: { socket: any }) {
  const { chatMessages, addChatMessage, setChatOpen, myPeerInfo } = useMeetingStore()
  const [input, setInput] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [fileInputRef] = useState(() => {
    if (typeof document !== 'undefined') {
      const el = document.createElement('input')
      el.type = 'file'
      el.className = 'hidden'
      document.body.appendChild(el)
      return el
    }
    return null
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [chatMessages.length])

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target as Node)
      ) {
        setShowEmojiPicker(false)
      }
    }
    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

  // Focus input when chat opens
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // File input handler
  useEffect(() => {
    if (!fileInputRef) return
    const handleFileSelect = () => {
      const file = fileInputRef.files?.[0]
      if (!file) return

      const fileUrl = URL.createObjectURL(file)
      const msg: ChatMsg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        userId: myPeerInfo?.id || 'local',
        userName: myPeerInfo?.name || 'You',
        content: `Shared a file: ${file.name}`,
        type: 'file',
        fileUrl,
        fileName: file.name,
        timestamp: Date.now(),
      }

      addChatMessage(msg)
      if (socket?.connected) {
        socket.emit('chat-message', {
          ...msg,
          // Can't send blob URLs over socket, send file info only
          fileData: null,
        })
      }

      // Reset file input
      fileInputRef.value = ''
    }

    fileInputRef.addEventListener('change', handleFileSelect)
    return () => fileInputRef.removeEventListener('change', handleFileSelect)
  }, [fileInputRef, socket, myPeerInfo, addChatMessage])

  const sendMessage = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || !socket?.connected) return

    const msg: ChatMsg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId: myPeerInfo?.id || 'local',
      userName: myPeerInfo?.name || 'You',
      content: trimmed,
      type: 'text',
      timestamp: Date.now(),
    }

    addChatMessage(msg)
    socket.emit('chat-message', msg)
    setInput('')
    inputRef.current?.focus()
  }, [input, socket, myPeerInfo, addChatMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const insertEmoji = (emoji: string) => {
    setInput((prev) => prev + emoji)
    inputRef.current?.focus()
  }

  const handleFileClick = () => {
    fileInputRef?.click()
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

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

  const isOwnMessage = (msg: ChatMsg) => msg.userId === (myPeerInfo?.id || 'local')

  const textMessages = chatMessages.filter((m) => m.type !== 'reaction')
  const messageCount = textMessages.length

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="flex flex-col w-96 h-full bg-zinc-900 border-l border-zinc-700/50 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/80 border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Chat</h2>
          <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-emerald-600/20 text-emerald-400 text-xs font-medium">
            {messageCount}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
          onClick={() => setChatOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-3 py-2" ref={scrollRef}>
        <div className="flex flex-col gap-2 pb-4">
          <AnimatePresence initial={false}>
            {textMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex ${
                  msg.type === 'system' ? 'justify-center' : isOwnMessage(msg) ? 'justify-end' : 'justify-start'
                }`}
              >
                {/* System Message */}
                {msg.type === 'system' && (
                  <div className="px-3 py-1.5 rounded-full bg-zinc-800/60 text-zinc-400 text-xs italic">
                    {msg.content}
                  </div>
                )}

                {/* File Message - Own */}
                {msg.type === 'file' && isOwnMessage(msg) && (
                  <div className="flex flex-col items-end gap-1 max-w-[80%]">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span className="font-medium text-zinc-300">{msg.userName}</span>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    <a
                      href={msg.fileUrl}
                      download={msg.fileName}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 transition-colors text-sm max-w-[100%] cursor-pointer"
                    >
                      <FileIcon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{msg.content}</span>
                    </a>
                  </div>
                )}

                {/* File Message - Other */}
                {msg.type === 'file' && !isOwnMessage(msg) && (
                  <div className="flex gap-2 max-w-[80%]">
                    <div
                      className={`flex items-center justify-center h-7 w-7 rounded-full text-white text-xs font-bold shrink-0 ${getAvatarColor(msg.userName)}`}
                    >
                      {getInitials(msg.userName)}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <span className="font-medium text-zinc-300">{msg.userName}</span>
                        <span>{formatTime(msg.timestamp)}</span>
                      </div>
                      <a
                        href={msg.fileUrl || '#'}
                        download={msg.fileName}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors text-sm max-w-[100%] cursor-pointer"
                      >
                        <FileIcon className="h-4 w-4 shrink-0 text-zinc-400" />
                        <span className="truncate">{msg.content}</span>
                      </a>
                    </div>
                  </div>
                )}

                {/* Text Message - Own */}
                {msg.type === 'text' && isOwnMessage(msg) && (
                  <div className="flex flex-col items-end gap-1 max-w-[80%]">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <span className="font-medium text-zinc-300">{msg.userName}</span>
                      <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    <div className="px-3 py-2 rounded-2xl rounded-tr-md bg-emerald-600 text-white text-sm leading-relaxed break-words">
                      {msg.content}
                    </div>
                  </div>
                )}

                {/* Text Message - Other */}
                {msg.type === 'text' && !isOwnMessage(msg) && (
                  <div className="flex gap-2 max-w-[80%]">
                    <div
                      className={`flex items-center justify-center h-7 w-7 rounded-full text-white text-xs font-bold shrink-0 ${getAvatarColor(msg.userName)}`}
                    >
                      {getInitials(msg.userName)}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <span className="font-medium text-zinc-300">{msg.userName}</span>
                        <span>{formatTime(msg.timestamp)}</span>
                      </div>
                      <div className="px-3 py-2 rounded-2xl rounded-tl-md bg-zinc-800 text-zinc-100 text-sm leading-relaxed break-words">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {textMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <MessageSquare className="h-10 w-10 text-zinc-600" />
              <p className="text-sm text-zinc-500">No messages yet</p>
              <p className="text-xs text-zinc-600">Say something to get started</p>
            </div>
          )}
        </div>
      </ScrollArea>

      <Separator className="bg-zinc-700/50" />

      {/* Emoji Picker */}
      <AnimatePresence>
        {showEmojiPicker && (
          <div className="absolute bottom-16 left-3 z-50">
            <EmojiPicker
              onSelect={(emoji) => {
                insertEmoji(emoji)
                setShowEmojiPicker(false)
              }}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Input Bar */}
      <div className="relative flex items-center gap-1.5 px-3 py-2 bg-zinc-900">
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 cursor-pointer"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 cursor-pointer"
            onClick={handleFileClick}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        </div>
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 h-9 bg-zinc-800 border-zinc-700 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50"
        />
        <Button
          size="icon"
          onClick={sendMessage}
          disabled={!input.trim()}
          className="h-8 w-8 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  )
}
