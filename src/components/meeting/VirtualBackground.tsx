'use client'

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Camera, X, Check, ImagePlus, Upload, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { BackgroundType } from '@/lib/background-processor'

interface VirtualBackgroundProps {
  isOpen: boolean
  onClose: () => void
  onBackgroundChange: (type: BackgroundType, value: string | null) => void
  currentType: BackgroundType
  currentValue: string | null
  isLoading?: boolean
}

interface BlurOption {
  id: string
  label: string
  value: string
}

interface GradientOption {
  id: string
  label: string
  value: string
}

const BLUR_OPTIONS: BlurOption[] = [
  { id: 'blur-light', label: 'Light', value: '4' },
  { id: 'blur-medium', label: 'Medium', value: '10' },
  { id: 'blur-heavy', label: 'Heavy', value: '20' },
]

const GRADIENT_OPTIONS: GradientOption[] = [
  { id: 'gradient-ocean', label: 'Ocean', value: 'linear-gradient(135deg, #0f172a, #1e3a5f)' },
  { id: 'gradient-forest', label: 'Forest', value: 'linear-gradient(135deg, #064e3b, #065f46)' },
  { id: 'gradient-galaxy', label: 'Galaxy', value: 'linear-gradient(135deg, #1e1b4b, #312e81)' },
  { id: 'gradient-sunset', label: 'Sunset', value: 'linear-gradient(135deg, #7c2d12, #b45309)' },
  { id: 'gradient-studio', label: 'Studio', value: 'linear-gradient(135deg, #18181b, #27272a)' },
  { id: 'gradient-aurora', label: 'Aurora', value: 'linear-gradient(135deg, #042f2e, #0d9488)' },
]

function BlurThumbnail({ value }: { value: string }) {
  return (
    <div className="h-full w-full rounded-md overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, #3f3f46, #52525b, #71717a)',
          filter: `blur(${value}px)`,
        }}
      />
    </div>
  )
}

function GradientThumbnail({ value }: { value: string }) {
  return (
    <div className="h-full w-full rounded-md" style={{ background: value }} />
  )
}

export default function VirtualBackground({
  isOpen,
  onClose,
  onBackgroundChange,
  currentType,
  currentValue,
  isLoading = false,
}: VirtualBackgroundProps) {
  const [uploadedImages, setUploadedImages] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSelectNone = () => {
    onBackgroundChange('none', null)
  }

  const handleSelectBlur = (value: string) => {
    onBackgroundChange('blur', value)
  }

  const handleSelectGradient = (value: string) => {
    onBackgroundChange('gradient', value)
  }

  const handleSelectImage = (dataUrl: string) => {
    onBackgroundChange('image', dataUrl)
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) return // 5MB limit

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setUploadedImages((prev) => {
        const next = [dataUrl, ...prev]
        return next.slice(0, 3) // Keep max 3
      })
    }
    reader.readAsDataURL(file)

    // Reset input
    e.target.value = ''
  }

  const isSelected = (type: BackgroundType, value: string | null) => {
    return currentType === type && currentValue === value
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.95 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="absolute bottom-full left-1/2 z-50 mb-3 w-80 -translate-x-1/2"
        >
          <div className="overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-800 shadow-2xl shadow-black/40">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-700/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Virtual Background
                </h3>
                {isLoading && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading model...</span>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-6 w-6 text-zinc-400 hover:bg-zinc-700/60 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="max-h-72 overflow-y-auto p-3 scrollbar-thin">
              <TooltipProvider delayDuration={300}>

                {/* None */}
                <div className="mb-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    None
                  </p>
                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleSelectNone}
                          className={cn(
                            'group relative flex aspect-video w-[68px] cursor-pointer items-center justify-center rounded-lg border-2 transition-all duration-200',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-800',
                            isSelected('none', null)
                              ? 'border-emerald-500 bg-zinc-700/50'
                              : 'border-transparent hover:border-zinc-600 hover:bg-zinc-700/30'
                          )}
                        >
                          <div className="flex h-full w-full items-center justify-center rounded-md bg-zinc-700/60">
                            <Camera className="h-5 w-5 text-zinc-400" />
                          </div>
                          {isSelected('none', null) && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
                            >
                              <Check className="h-3 w-3 text-white" strokeWidth={3} />
                            </motion.div>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="bg-zinc-900 text-zinc-100 border-zinc-700 text-xs font-medium"
                      >
                        No background
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* Blur */}
                <div className="mb-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Blur
                  </p>
                  <div className="flex gap-2">
                    {BLUR_OPTIONS.map((option) => (
                      <Tooltip key={option.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleSelectBlur(option.value)}
                            className={cn(
                              'group relative flex aspect-video w-[68px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 transition-all duration-200',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-800',
                              isSelected('blur', option.value)
                                ? 'border-emerald-500 bg-zinc-700/50'
                                : 'border-transparent hover:border-zinc-600 hover:bg-zinc-700/30'
                            )}
                          >
                            <div className="relative h-[50px] w-full overflow-hidden rounded-md">
                              <BlurThumbnail value={option.value} />
                            </div>
                            {isSelected('blur', option.value) && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
                              >
                                <Check className="h-3 w-3 text-white" strokeWidth={3} />
                              </motion.div>
                            )}
                            <span className="mt-1.5 text-[10px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">
                              {option.label}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-zinc-900 text-zinc-100 border-zinc-700 text-xs font-medium"
                        >
                          {option.label} ({option.value}px)
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                {/* Colors */}
                <div className="mb-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Colors
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {GRADIENT_OPTIONS.map((option) => (
                      <Tooltip key={option.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleSelectGradient(option.value)}
                            className={cn(
                              'group relative flex aspect-video cursor-pointer flex-col items-center justify-center rounded-lg border-2 transition-all duration-200',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-800',
                              isSelected('gradient', option.value)
                                ? 'border-emerald-500 bg-zinc-700/50'
                                : 'border-transparent hover:border-zinc-600 hover:bg-zinc-700/30'
                            )}
                          >
                            <div className="h-[50px] w-full overflow-hidden rounded-md">
                              <GradientThumbnail value={option.value} />
                            </div>
                            {isSelected('gradient', option.value) && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
                              >
                                <Check className="h-3 w-3 text-white" strokeWidth={3} />
                              </motion.div>
                            )}
                            <span className="mt-1.5 text-[10px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors truncate w-full text-center">
                              {option.label}
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-zinc-900 text-zinc-100 border-zinc-700 text-xs font-medium"
                        >
                          {option.label}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                {/* Image Upload */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Images
                  </p>

                  {/* Upload button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUploadClick}
                    className={cn(
                      'mb-2 w-full justify-start gap-2 border-zinc-700 bg-zinc-700/30 text-zinc-300 hover:bg-zinc-700/60 hover:text-zinc-100'
                    )}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span className="text-xs">Upload Image</span>
                  </Button>

                  {/* Uploaded image thumbnails */}
                  {uploadedImages.length > 0 && (
                    <div className="flex gap-2">
                      {uploadedImages.map((dataUrl, idx) => (
                        <Tooltip key={idx}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleSelectImage(dataUrl)}
                              className={cn(
                                'group relative flex aspect-video w-[68px] cursor-pointer rounded-lg border-2 overflow-hidden transition-all duration-200',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-800',
                                isSelected('image', dataUrl)
                                  ? 'border-emerald-500'
                                  : 'border-transparent hover:border-zinc-600'
                              )}
                            >
                              <img
                                src={dataUrl}
                                alt={`Custom background ${idx + 1}`}
                                className="h-full w-full object-cover rounded-md"
                              />
                              {isSelected('image', dataUrl) && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500"
                                >
                                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                                </motion.div>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="bg-zinc-900 text-zinc-100 border-zinc-700 text-xs font-medium"
                          >
                            Custom {idx + 1}
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  )}

                  {uploadedImages.length === 0 && (
                    <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-700 py-4">
                      <ImagePlus className="h-5 w-5 text-zinc-600" />
                      <span className="ml-2 text-xs text-zinc-600">
                        Upload an image to use as background
                      </span>
                    </div>
                  )}
                </div>

              </TooltipProvider>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
