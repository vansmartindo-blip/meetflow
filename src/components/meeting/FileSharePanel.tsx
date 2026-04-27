'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Upload,
  X,
  File,
  FileText,
  Image as ImageIcon,
  Download,
  Paperclip,
} from 'lucide-react'
import { useMeetingStore } from '@/stores/meeting-store'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SharedFile {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  fileData: string // base64
  userId: string
  userName: string
  timestamp: number
}

interface FileSharePanelProps {
  socket: Socket | null
  isOpen: boolean
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const PDF_EXTENSION = 'pdf'
const DOCUMENT_EXTENSIONS = new Set(['txt', 'doc', 'docx', 'xls', 'xlsx'])

function isImageFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

function isPdfFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return ext === PDF_EXTENSION
}

function isDocumentFile(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return DOCUMENT_EXTENSIONS.has(ext)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

// ---------------------------------------------------------------------------
// File type icon component
// ---------------------------------------------------------------------------

function FileTypeIcon({
  fileName,
  size = 'md',
}: {
  fileName: string
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
  const iconDim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  if (isImageFile(fileName)) {
    return (
      <div className={`${dim} rounded-lg bg-violet-500/15 flex items-center justify-center`}>
        <ImageIcon className={`${iconDim} text-violet-400`} />
      </div>
    )
  }
  if (isPdfFile(fileName)) {
    return (
      <div className={`${dim} rounded-lg bg-rose-500/15 flex items-center justify-center`}>
        <FileText className={`${iconDim} text-rose-400`} />
      </div>
    )
  }
  if (isDocumentFile(fileName)) {
    return (
      <div className={`${dim} rounded-lg bg-sky-500/15 flex items-center justify-center`}>
        <FileText className={`${iconDim} text-sky-400`} />
      </div>
    )
  }
  return (
    <div className={`${dim} rounded-lg bg-zinc-500/15 flex items-center justify-center`}>
      <Paperclip className={`${iconDim} text-zinc-400`} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FileSharePanel({ socket, isOpen, onClose }: FileSharePanelProps) {
  const { myPeerInfo } = useMeetingStore()

  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  // -----------------------------------------------------------------------
  // Scroll to bottom when new files arrive
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [sharedFiles.length])

  // -----------------------------------------------------------------------
  // Socket listener – receive files shared by others
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!socket) return

    const handleFileShare = (data: Omit<SharedFile, 'id' | 'timestamp'> & { id?: string; timestamp?: number }) => {
      // Only add files that are not from the current user (to avoid duplicates)
      if (data.userId === (myPeerInfo?.id || 'local')) return

      const file: SharedFile = {
        id: data.id ?? generateId(),
        fileName: data.fileName,
        fileSize: data.fileSize,
        fileType: data.fileType,
        fileData: data.fileData,
        userId: data.userId,
        userName: data.userName,
        timestamp: data.timestamp ?? Date.now(),
      }
      setSharedFiles((prev) => [...prev, file])
    }

    socket.on('file-share', handleFileShare)
    return () => {
      socket.off('file-share', handleFileShare)
    }
  }, [socket, myPeerInfo?.id])

  // -----------------------------------------------------------------------
  // File handling helpers
  // -----------------------------------------------------------------------
  const processFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        alert(`File "${file.name}" exceeds the 10 MB size limit.`)
        return
      }

      const reader = new FileReader()
      reader.onload = () => {
        const base64 = reader.result as string

        const sharedFile: SharedFile = {
          id: generateId(),
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          fileData: base64,
          userId: myPeerInfo?.id || 'local',
          userName: myPeerInfo?.name || 'You',
          timestamp: Date.now(),
        }

        // Add to local list immediately
        setSharedFiles((prev) => [...prev, sharedFile])

        // Emit via socket
        if (socket?.connected) {
          socket.emit('file-share', {
            id: sharedFile.id,
            fileName: sharedFile.fileName,
            fileSize: sharedFile.fileSize,
            fileType: sharedFile.fileType,
            fileData: sharedFile.fileData,
            userId: sharedFile.userId,
            userName: sharedFile.userName,
            timestamp: sharedFile.timestamp,
          })
        }
      }
      reader.readAsDataURL(file)
    },
    [socket, myPeerInfo],
  )

  // -----------------------------------------------------------------------
  // Upload handlers
  // -----------------------------------------------------------------------
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files) return
      Array.from(files).forEach(processFile)
      // Reset so the same file can be re-selected
      e.target.value = ''
    },
    [processFile],
  )

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // -----------------------------------------------------------------------
  // Drag & drop handlers
  // -----------------------------------------------------------------------
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      const files = e.dataTransfer.files
      if (!files) return
      Array.from(files).forEach(processFile)
    },
    [processFile],
  )

  // -----------------------------------------------------------------------
  // Download handler
  // -----------------------------------------------------------------------
  const handleDownload = useCallback((file: SharedFile) => {
    // Decode base64 data-URL into a blob and trigger download
    const byteString = atob(file.fileData.split(',')[1])
    const mimeString = file.fileData.split(',')[0].split(':')[1].split(';')[0]
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i)
    }
    const blob = new Blob([ab], { type: mimeString })
    const url = URL.createObjectURL(blob)

    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, [])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="flex flex-col w-80 h-full bg-zinc-900 border-l border-zinc-700/50 shadow-2xl"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleFileInput}
          />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/80 border-b border-zinc-700/50">
            <div className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-amber-400" />
              <h2 className="text-sm font-semibold text-zinc-100">Files</h2>
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-amber-600/20 text-amber-400 text-xs font-medium">
                {sharedFiles.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700/50"
                onClick={handleUploadClick}
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Drag overlay */}
          <AnimatePresence>
            {isDragOver && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mx-3 mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-500/5 px-4 py-6">
                  <Upload className="h-8 w-8 text-amber-400" />
                  <p className="text-sm font-medium text-amber-300">Drop files here</p>
                  <p className="text-xs text-zinc-400">Max 10 MB per file</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload area (when not dragging) */}
          {!isDragOver && (
            <button
              onClick={handleUploadClick}
              className="mx-3 mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-800/40 px-4 py-6 transition-colors hover:border-zinc-600 hover:bg-zinc-800/70 cursor-pointer"
            >
              <Upload className="h-7 w-7 text-zinc-500" />
              <p className="text-sm font-medium text-zinc-400">
                Click to upload or drag &amp; drop
              </p>
              <p className="text-xs text-zinc-500">Images, PDFs, documents up to 10 MB</p>
            </button>
          )}

          <Separator className="my-3 bg-zinc-700/50" />

          {/* File list */}
          <div
            ref={scrollContainerRef}
            className="flex-1 max-h-[calc(100vh-12rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-600 scrollbar-track-transparent px-3 pb-3"
          >
            {sharedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Paperclip className="h-12 w-12 text-zinc-700" />
                <p className="text-sm font-medium text-zinc-500">No files shared yet</p>
                <p className="text-xs text-zinc-600">
                  Upload a file to share it with everyone
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {sharedFiles.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => handleDownload(file)}
                      className="group flex items-center gap-3 rounded-xl bg-zinc-800/60 p-3 transition-colors hover:bg-zinc-800 cursor-pointer"
                    >
                      {/* Thumbnail for images or file type icon */}
                      {isImageFile(file.fileName) ? (
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-700">
                          <img
                            src={file.fileData}
                            alt={file.fileName}
                            className="h-full w-full object-cover"
                          />
                        </div>
                      ) : (
                        <FileTypeIcon fileName={file.fileName} size="sm" />
                      )}

                      {/* File info */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="truncate text-sm font-medium text-zinc-200 group-hover:text-zinc-100"
                          title={file.fileName}
                        >
                          {file.fileName}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-500">
                            {formatFileSize(file.fileSize)}
                          </span>
                          <span className="text-xs text-zinc-600">·</span>
                          <span className="text-xs text-zinc-500">{file.userName}</span>
                          <span className="text-xs text-zinc-600">·</span>
                          <span className="text-xs text-zinc-500">
                            {formatTime(file.timestamp)}
                          </span>
                        </div>
                      </div>

                      {/* Download icon */}
                      <div className="flex items-center justify-center h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Download className="h-4 w-4 text-zinc-400 group-hover:text-amber-400" />
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
