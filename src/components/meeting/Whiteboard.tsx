'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Socket } from 'socket.io-client'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Pencil,
  Minus,
  Square,
  Circle,
  Eraser,
  Type,
  Trash2,
  Undo2,
  X,
  Presentation,
} from 'lucide-react'

// ============ Types ============
export interface DrawingStroke {
  tool: 'pen' | 'line' | 'rectangle' | 'circle' | 'eraser' | 'text'
  color: string
  width: number
  points: { x: number; y: number }[]
  startX?: number
  startY?: number
  endX?: number
  endY?: number
  text?: string
}

type ToolType = DrawingStroke['tool']

interface WhiteboardProps {
  socket: Socket | null
  isOpen: boolean
  onClose: () => void
}

// ============ Constants ============
const PRESET_COLORS = [
  { name: 'White', value: '#ffffff' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
]

const TOOLS: { type: ToolType; icon: typeof Pencil; label: string }[] = [
  { type: 'pen', icon: Pencil, label: 'Pen' },
  { type: 'line', icon: Minus, label: 'Line' },
  { type: 'rectangle', icon: Square, label: 'Rectangle' },
  { type: 'circle', icon: Circle, label: 'Circle' },
  { type: 'eraser', icon: Eraser, label: 'Eraser' },
  { type: 'text', icon: Type, label: 'Text' },
]

const GRID_SIZE = 24
const GRID_COLOR = 'rgba(255, 255, 255, 0.04)'

// ============ Drawing Helpers ============

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#18181b' // zinc-900
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = GRID_COLOR
  ctx.lineWidth = 1

  for (let x = 0; x <= width; x += GRID_SIZE) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, height)
    ctx.stroke()
  }

  for (let y = 0; y <= height; y += GRID_SIZE) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(width, y + 0.5)
    ctx.stroke()
  }
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawingStroke, scale: number = 1) {
  const { tool, color, width, points } = stroke

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = width * scale

  if (tool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.strokeStyle = 'rgba(0,0,0,1)'
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = color
    ctx.fillStyle = color
  }

  switch (tool) {
    case 'pen':
    case 'eraser': {
      if (points.length < 2) break
      ctx.beginPath()
      ctx.moveTo(points[0].x * scale, points[0].y * scale)
      for (let i = 1; i < points.length; i++) {
        // Smooth curve through midpoints
        const prev = points[i - 1]
        const curr = points[i]
        const midX = ((prev.x + curr.x) / 2) * scale
        const midY = ((prev.y + curr.y) / 2) * scale
        ctx.quadraticCurveTo(prev.x * scale, prev.y * scale, midX, midY)
      }
      // Draw to the last point
      const last = points[points.length - 1]
      ctx.lineTo(last.x * scale, last.y * scale)
      ctx.stroke()
      break
    }

    case 'line': {
      if (stroke.startX == null || stroke.startY == null || stroke.endX == null || stroke.endY == null) break
      ctx.beginPath()
      ctx.moveTo(stroke.startX * scale, stroke.startY * scale)
      ctx.lineTo(stroke.endX * scale, stroke.endY * scale)
      ctx.stroke()
      break
    }

    case 'rectangle': {
      if (stroke.startX == null || stroke.startY == null || stroke.endX == null || stroke.endY == null) break
      const rx = Math.min(stroke.startX, stroke.endX) * scale
      const ry = Math.min(stroke.startY, stroke.endY) * scale
      const rw = Math.abs(stroke.endX - stroke.startX) * scale
      const rh = Math.abs(stroke.endY - stroke.startY) * scale
      ctx.beginPath()
      ctx.rect(rx, ry, rw, rh)
      ctx.stroke()
      break
    }

    case 'circle': {
      if (stroke.startX == null || stroke.startY == null || stroke.endX == null || stroke.endY == null) break
      const cx = ((stroke.startX + stroke.endX) / 2) * scale
      const cy = ((stroke.startY + stroke.endY) / 2) * scale
      const radiusX = Math.abs(stroke.endX - stroke.startX) / 2 * scale
      const radiusY = Math.abs(stroke.endY - stroke.startY) / 2 * scale
      ctx.beginPath()
      ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2)
      ctx.stroke()
      break
    }

    case 'text': {
      if (!stroke.text || stroke.startX == null || stroke.startY == null) break
      const fontSize = Math.max(12, width * 3) * scale
      ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
      ctx.textBaseline = 'top'
      ctx.fillText(stroke.text, stroke.startX * scale, stroke.startY * scale)
      break
    }
  }

  ctx.restore()
}

function redrawCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: DrawingStroke[],
  canvasWidth: number,
  canvasHeight: number,
  dpr: number
) {
  // Clear and draw grid
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)
  drawGrid(ctx, canvasWidth, canvasHeight)

  // Draw all strokes
  const scale = 1 / dpr
  for (const stroke of strokes) {
    drawStroke(ctx, stroke, scale)
  }
}

// ============ Component ============

export default function Whiteboard({ socket, isOpen, onClose }: WhiteboardProps) {
  // Drawing state
  const [activeTool, setActiveTool] = useState<ToolType>('pen')
  const [activeColor, setActiveColor] = useState('#ffffff')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [customColor, setCustomColor] = useState('#ffffff')
  const [isDrawing, setIsDrawing] = useState(false)
  const [textMode, setTextMode] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null)

  // Strokes
  const strokesRef = useRef<DrawingStroke[]>([])
  const currentStrokeRef = useRef<DrawingStroke | null>(null)

  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dprRef = useRef<number>(1)

  // Animation frame ID for debounced redraws
  const rafRef = useRef<number>(0)

  // ============ Canvas Setup ============
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    redrawCanvas(
      ctx,
      strokesRef.current,
      rect.width,
      rect.height,
      dpr
    )
  }, [])

  // ============ Resize ============
  useEffect(() => {
    if (!isOpen) return

    // Setup on mount and resize
    setupCanvas()

    const handleResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(setupCanvas)
    }

    window.addEventListener('resize', handleResize)
    // Also observe the container
    const resizeObserver = new ResizeObserver(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(setupCanvas)
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [isOpen, setupCanvas])

  // ============ Request Redraw ============
  const requestRedraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = dprRef.current

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      redrawCanvas(
        ctx,
        strokesRef.current,
        rect.width,
        rect.height,
        dpr
      )
    })
  }, [])

  // ============ Socket Events ============
  useEffect(() => {
    if (!socket || !isOpen) return

    const handleDraw = (data: { type: string; stroke?: DrawingStroke; from?: string }) => {
      if (data.from === socket.id) return

      if (data.type === 'draw' && data.stroke) {
        strokesRef.current.push(data.stroke)
        requestRedraw()
      } else if (data.type === 'clear') {
        strokesRef.current = []
        requestRedraw()
      } else if (data.type === 'undo') {
        if (strokesRef.current.length > 0) {
          strokesRef.current.pop()
          requestRedraw()
        }
      }
    }

    const handleSync = (data: { strokes: DrawingStroke[] }) => {
      strokesRef.current = data.strokes || []
      requestRedraw()
    }

    socket.on('whiteboard-draw', handleDraw)
    socket.on('whiteboard-sync', handleSync)

    // Request sync on open
    socket.emit('whiteboard-sync')

    return () => {
      socket.off('whiteboard-draw', handleDraw)
      socket.off('whiteboard-sync', handleSync)
    }
  }, [socket, isOpen, requestRedraw])

  // ============ Mouse Position Helper ============
  const getCanvasPos = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  // ============ Drawing Handlers ============
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (textMode) return

    const pos = getCanvasPos(e)

    // Start a new stroke
    const stroke: DrawingStroke = {
      tool: activeTool,
      color: activeColor,
      width: strokeWidth,
      points: [pos],
      startX: pos.x,
      startY: pos.y,
    }

    currentStrokeRef.current = stroke
    setIsDrawing(true)
  }, [activeTool, activeColor, strokeWidth, getCanvasPos, textMode])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentStrokeRef.current) return

    const pos = getCanvasPos(e)
    const stroke = currentStrokeRef.current
    const tool = stroke.tool

    if (tool === 'pen' || tool === 'eraser') {
      stroke.points.push(pos)
    } else if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      stroke.endX = pos.x
      stroke.endY = pos.y
    }

    // Live preview: redraw everything + current stroke
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const dpr = dprRef.current

    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      redrawCanvas(ctx, strokesRef.current, rect.width, rect.height, dpr)
      drawStroke(ctx, stroke, 1 / dpr)
    })
  }, [isDrawing, getCanvasPos])

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !currentStrokeRef.current) return

    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    setIsDrawing(false)

    // Only add stroke if it has meaningful data
    const hasData =
      (stroke.tool === 'pen' || stroke.tool === 'eraser')
        ? stroke.points.length >= 2
        : stroke.tool === 'text'
          ? !!stroke.text
          : stroke.startX !== stroke.endX || stroke.startY !== stroke.endY

    if (hasData) {
      strokesRef.current.push(stroke)
      requestRedraw()

      // Emit to socket
      if (socket?.connected) {
        socket.emit('whiteboard-draw', {
          type: 'draw',
          stroke,
        })
      }
    }
  }, [isDrawing, socket, requestRedraw])

  const handleMouseLeave = useCallback(() => {
    if (isDrawing) {
      handleMouseUp()
    }
  }, [isDrawing, handleMouseUp])

  // ============ Canvas Click for Text ============
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool !== 'text') {
      setTextMode(false)
      setTextInput('')
      setTextPosition(null)
      return
    }

    const pos = getCanvasPos(e)
    setTextMode(true)
    setTextPosition(pos)
    setTextInput('')

    // Focus the text input after a tick
    setTimeout(() => {
      const input = document.getElementById('whiteboard-text-input')
      if (input) input.focus()
    }, 50)
  }, [activeTool, getCanvasPos])

  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim() || !textPosition) {
      setTextMode(false)
      setTextInput('')
      setTextPosition(null)
      return
    }

    const stroke: DrawingStroke = {
      tool: 'text',
      color: activeColor,
      width: strokeWidth,
      points: [],
      startX: textPosition.x,
      startY: textPosition.y,
      text: textInput.trim(),
    }

    strokesRef.current.push(stroke)
    requestRedraw()

    if (socket?.connected) {
      socket.emit('whiteboard-draw', {
        type: 'draw',
        stroke,
      })
    }

    setTextMode(false)
    setTextInput('')
    setTextPosition(null)
  }, [textInput, textPosition, activeColor, strokeWidth, socket, requestRedraw])

  const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    } else if (e.key === 'Escape') {
      setTextMode(false)
      setTextInput('')
      setTextPosition(null)
    }
  }, [handleTextSubmit])

  // ============ Actions ============
  const handleClear = useCallback(() => {
    strokesRef.current = []
    requestRedraw()

    if (socket?.connected) {
      socket.emit('whiteboard-draw', { type: 'clear' })
    }
  }, [socket, requestRedraw])

  const handleUndo = useCallback(() => {
    if (strokesRef.current.length === 0) return

    strokesRef.current.pop()
    requestRedraw()

    if (socket?.connected) {
      socket.emit('whiteboard-draw', { type: 'undo' })
    }
  }, [socket, requestRedraw])

  const handleToolSelect = useCallback((tool: ToolType) => {
    setActiveTool(tool)
    setTextMode(false)
    setTextInput('')
    setTextPosition(null)

    // Update cursor
    const canvas = canvasRef.current
    if (canvas) {
      if (tool === 'text') {
        canvas.style.cursor = 'text'
      } else if (tool === 'eraser') {
        canvas.style.cursor = 'cell'
      } else {
        canvas.style.cursor = 'crosshair'
      }
    }
  }, [])

  const handleColorSelect = useCallback((color: string) => {
    setActiveColor(color)
  }, [])

  const handleCustomColorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCustomColor(val)
    setActiveColor(val)
  }, [])

  // ============ Set default cursor on mount ============
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.cursor = 'crosshair'
    }
  }, [isOpen])

  // ============ Render ============
  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="flex flex-col w-[480px] h-full bg-zinc-900 border-l border-zinc-700/50 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/80 border-b border-zinc-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <Presentation className="h-5 w-5 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">Whiteboard</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="px-3 py-2 bg-zinc-800/40 border-b border-zinc-700/30 shrink-0">
        {/* Tool Buttons */}
        <div className="flex items-center gap-0.5">
          {TOOLS.map(({ type, icon: Icon, label }) => (
            <Tooltip key={type}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 shrink-0 cursor-pointer ${
                    activeTool === type
                      ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 hover:text-emerald-400'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50'
                  }`}
                  onClick={() => handleToolSelect(type)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {label}
              </TooltipContent>
            </Tooltip>
          ))}

          <div className="w-px h-5 bg-zinc-700/60 mx-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/50 cursor-pointer"
                onClick={handleUndo}
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Undo
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-zinc-400 hover:text-red-400 hover:bg-red-600/10 cursor-pointer"
                onClick={handleClear}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              Clear All
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Color & Stroke Width */}
      <div className="px-3 py-2 bg-zinc-800/20 border-b border-zinc-700/30 shrink-0 space-y-2">
        {/* Color Swatches */}
        <div className="flex items-center gap-1.5">
          {PRESET_COLORS.map(({ name, value }) => (
            <button
              key={value}
              title={name}
              onClick={() => handleColorSelect(value)}
              className={`h-5 w-5 rounded-full shrink-0 cursor-pointer border-2 transition-all hover:scale-110 ${
                activeColor === value
                  ? 'border-zinc-100 ring-1 ring-zinc-100/50 scale-110'
                  : 'border-zinc-600 hover:border-zinc-400'
              }`}
              style={{ backgroundColor: value }}
            />
          ))}
          {/* Custom color picker */}
          <div className="relative ml-0.5">
            <input
              type="color"
              value={customColor}
              onChange={handleCustomColorChange}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              title="Custom Color"
            />
            <div
              className="h-5 w-5 rounded-full border-2 border-dashed border-zinc-500 shrink-0 cursor-pointer flex items-center justify-center"
              style={{ backgroundColor: customColor }}
            >
              <span className="text-[8px] text-zinc-900 font-bold">+</span>
            </div>
          </div>
        </div>

        {/* Stroke Width */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium shrink-0">
            Width
          </span>
          <Slider
            value={[strokeWidth]}
            onValueChange={([val]) => setStrokeWidth(val)}
            min={1}
            max={20}
            step={1}
            className="flex-1"
          />
          <span className="text-xs text-zinc-400 w-6 text-right tabular-nums font-medium">
            {strokeWidth}
          </span>
        </div>
      </div>

      {/* Canvas Area */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onClick={handleCanvasClick}
        />

        {/* Text Input Overlay */}
        {textMode && textPosition && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute"
            style={{
              left: textPosition.x,
              top: textPosition.y,
              zIndex: 20,
            }}
          >
            <input
              id="whiteboard-text-input"
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={handleTextKeyDown}
              onBlur={handleTextSubmit}
              placeholder="Type text..."
              className="bg-zinc-800/90 backdrop-blur-sm border border-zinc-600 text-zinc-100 text-sm px-2 py-1 rounded-md min-w-[120px] max-w-[240px] outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 placeholder:text-zinc-500"
              style={{ color: activeColor }}
            />
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}
