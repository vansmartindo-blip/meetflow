/**
 * Creates a demo/simulated video stream using Canvas API.
 * Used when no physical camera is available (e.g., sandbox environments).
 * Generates an animated gradient with the user's name and a "Demo Mode" label.
 */

let demoCanvas: HTMLCanvasElement | null = null
let demoCtx: CanvasRenderingContext2D | null = null
let animationFrameId: number | null = null
let currentDemoStream: MediaStream | null = null

const CANVAS_WIDTH = 640
const CANVAS_HEIGHT = 480
const FPS = 15

/**
 * Create and return a MediaStream from an animated Canvas element.
 * Call `stopDemoStream()` to clean up resources.
 */
export function createDemoStream(userName: string = 'User'): MediaStream {
  // Clean up any existing demo stream
  stopDemoStream()

  // Create canvas
  demoCanvas = document.createElement('canvas')
  demoCanvas.width = CANVAS_WIDTH
  demoCanvas.height = CANVAS_HEIGHT
  demoCtx = demoCanvas.getContext('2d')

  if (!demoCtx) {
    console.error('[DemoStream] Failed to get 2D context')
    return new MediaStream()
  }

  // Create stream from canvas
  currentDemoStream = demoCanvas.captureStream(FPS)

  // Start animation
  const startTime = Date.now()
  const displayName = userName || 'User'

  function drawFrame() {
    if (!demoCtx || !demoCanvas) return

    const ctx = demoCtx
    const w = CANVAS_WIDTH
    const h = CANVAS_HEIGHT
    const elapsed = (Date.now() - startTime) / 1000

    // ─── Animated gradient background ───
    const gradientAngle = elapsed * 0.3
    const x1 = w / 2 + Math.cos(gradientAngle) * w / 2
    const y1 = h / 2 + Math.sin(gradientAngle) * h / 2
    const x2 = w / 2 + Math.cos(gradientAngle + Math.PI) * w / 2
    const y2 = h / 2 + Math.sin(gradientAngle + Math.PI) * h / 2

    const gradient = ctx.createLinearGradient(x1, y1, x2, y2)

    // Smoothly oscillating colors
    const hue1 = (elapsed * 15) % 360
    const hue2 = (hue1 + 40) % 360
    const hue3 = (hue1 + 80) % 360

    gradient.addColorStop(0, `hsl(${hue1}, 30%, 15%)`)
    gradient.addColorStop(0.5, `hsl(${hue2}, 35%, 20%)`)
    gradient.addColorStop(1, `hsl(${hue3}, 30%, 15%)`)

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    // ─── Animated circles (floating orbs) ───
    for (let i = 0; i < 5; i++) {
      const cx = w / 2 + Math.cos(elapsed * (0.2 + i * 0.1) + i * 1.3) * (100 + i * 30)
      const cy = h / 2 + Math.sin(elapsed * (0.15 + i * 0.08) + i * 0.9) * (80 + i * 20)
      const radius = 30 + Math.sin(elapsed * 0.5 + i) * 15
      const orbHue = (hue1 + i * 60) % 360

      const orbGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      orbGradient.addColorStop(0, `hsla(${orbHue}, 60%, 50%, 0.15)`)
      orbGradient.addColorStop(1, `hsla(${orbHue}, 60%, 50%, 0)`)

      ctx.fillStyle = orbGradient
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    // ─── Grid pattern ───
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
    ctx.lineWidth = 1
    const gridSize = 40
    const offsetX = (elapsed * 10) % gridSize
    const offsetY = (elapsed * 8) % gridSize

    for (let x = -gridSize + offsetX; x < w + gridSize; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = -gridSize + offsetY; y < h + gridSize; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    // ─── Center circle with initials ───
    const centerX = w / 2
    const centerY = h / 2 - 20

    // Outer ring pulse
    const pulseRadius = 65 + Math.sin(elapsed * 2) * 5
    ctx.strokeStyle = `hsla(${hue2}, 60%, 60%, ${0.3 + Math.sin(elapsed * 2) * 0.1})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2)
    ctx.stroke()

    // Inner circle
    const innerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 55)
    innerGradient.addColorStop(0, `hsla(${hue1}, 50%, 35%, 0.9)`)
    innerGradient.addColorStop(1, `hsla(${hue2}, 40%, 25%, 0.9)`)
    ctx.fillStyle = innerGradient
    ctx.beginPath()
    ctx.arc(centerX, centerY, 55, 0, Math.PI * 2)
    ctx.fill()

    // Initials
    const initials = displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initials, centerX, centerY)

    // ─── Name label ───
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.font = '500 18px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(displayName, centerX, centerY + 75)

    // ─── "Demo Mode" badge ───
    const badgeWidth = 120
    const badgeHeight = 26
    const badgeX = centerX - badgeWidth / 2
    const badgeY = centerY + 105

    // Badge background
    ctx.fillStyle = 'rgba(245, 158, 11, 0.25)'
    roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 13)
    ctx.fill()

    // Badge border
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)'
    ctx.lineWidth = 1
    roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 13)
    ctx.stroke()

    // Badge text
    ctx.fillStyle = 'rgba(245, 158, 11, 0.9)'
    ctx.font = '600 12px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Demo Mode', centerX, badgeY + badgeHeight / 2)

    // ─── Audio waveform animation (simulated) ───
    const waveformY = h - 40
    const waveformWidth = 200
    const waveformX = centerX - waveformWidth / 2

    ctx.strokeStyle = `hsla(${hue1}, 60%, 60%, 0.4)`
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let i = 0; i <= waveformWidth; i += 2) {
      const progress = i / waveformWidth
      const amplitude = Math.sin(elapsed * 3 + progress * Math.PI * 4) * (8 + progress * 10) * Math.sin(elapsed * 1.5)
      const x = waveformX + i
      const y = waveformY + amplitude
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // ─── Bottom gradient overlay (to match video tile style) ───
    const bottomGradient = ctx.createLinearGradient(0, h - 80, 0, h)
    bottomGradient.addColorStop(0, 'rgba(0, 0, 0, 0)')
    bottomGradient.addColorStop(1, 'rgba(0, 0, 0, 0.5)')
    ctx.fillStyle = bottomGradient
    ctx.fillRect(0, h - 80, w, 80)

    // ─── Time stamp ───
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.font = '400 11px system-ui, -apple-system, sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'bottom'
    const now = new Date()
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    ctx.fillText(timeStr, w - 16, h - 10)

    // Schedule next frame
    animationFrameId = requestAnimationFrame(drawFrame)
  }

  // Start drawing
  drawFrame()

  console.log('[DemoStream] Demo video stream created')
  return currentDemoStream
}

/** Stop the demo stream and release resources */
export function stopDemoStream() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  if (currentDemoStream) {
    currentDemoStream.getTracks().forEach((t) => t.stop())
    currentDemoStream = null
  }

  demoCanvas = null
  demoCtx = null
}

/** Check if demo stream is currently active */
export function isDemoStream(stream: MediaStream | null): boolean {
  if (!stream) return false
  const videoTrack = stream.getVideoTracks()[0]
  if (!videoTrack) return false
  return videoTrack.label.includes('captureStream') || videoTrack.label === ''
}

/** Utility: draw rounded rectangle path */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}
