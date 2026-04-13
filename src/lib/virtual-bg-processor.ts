/**
 * Virtual Background Processor
 * 
 * Uses MediaPipe Selfie Segmentation to detect the person in real-time
 * and replace their background with blur, images, or colors.
 * 
 * Features:
 * - Real-time segmentation via MediaPipe
 * - Edge smoothing (feathered mask edges)
 * - Temporal smoothing (reduces flicker between frames)
 * - Adaptive performance (auto-adjusts resolution for low-end devices)
 * - Custom image backgrounds
 * - Multiple blur intensity levels
 */

import { ImageSegmenter, FilesetResolver, ImageSegmenterResult } from '@mediapipe/tasks-vision'

export type BackgroundType = 'none' | 'blur' | 'image' | 'color'

export interface VirtualBgConfig {
  type: BackgroundType
  blurAmount?: number        // 1-30 for blur
  imageUrl?: string          // URL or data URL for image background
  color?: string             // CSS color for solid color background
}

// Built-in background presets
export const BLUR_PRESETS = [
  { id: 'blur-light', label: 'Blur Light', type: 'blur' as BackgroundType, blurAmount: 6 },
  { id: 'blur-medium', label: 'Blur Medium', type: 'blur' as BackgroundType, blurAmount: 15 },
  { id: 'blur-heavy', label: 'Blur Heavy', type: 'blur' as BackgroundType, blurAmount: 30 },
]

export const COLOR_PRESETS = [
  { id: 'color-charcoal', label: 'Charcoal', type: 'color' as BackgroundType, color: '#1a1a2e' },
  { id: 'color-navy', label: 'Navy', type: 'color' as BackgroundType, color: '#0a1628' },
  { id: 'color-forest', label: 'Forest', type: 'color' as BackgroundType, color: '#0a2818' },
  { id: 'color-burgundy', label: 'Burgundy', type: 'color' as BackgroundType, color: '#2d0a1b' },
  { id: 'color-slate', label: 'Slate', type: 'color' as BackgroundType, color: '#1e293b' },
  { id: 'color-midnight', label: 'Midnight', type: 'color' as BackgroundType, color: '#0f0f23' },
]

export const GRADIENT_PRESETS = [
  { id: 'gradient-ocean', label: 'Ocean', type: 'image' as BackgroundType, gradient: 'linear-gradient(135deg, #0f172a, #1e3a5f, #0f172a)' },
  { id: 'gradient-sunset', label: 'Sunset', type: 'image' as BackgroundType, gradient: 'linear-gradient(135deg, #1a0a00, #7c2d12, #b45309)' },
  { id: 'gradient-aurora', label: 'Aurora', type: 'image' as BackgroundType, gradient: 'linear-gradient(135deg, #042f2e, #0d9488, #042f2e)' },
  { id: 'gradient-lavender', label: 'Lavender', type: 'image' as BackgroundType, gradient: 'linear-gradient(135deg, #1e1b4b, #4c1d95, #1e1b4b)' },
  { id: 'gradient-emerald', label: 'Emerald', type: 'image' as BackgroundType, gradient: 'linear-gradient(135deg, #022c22, #065f46, #022c22)' },
  { id: 'gradient-studio', label: 'Studio', type: 'image' as BackgroundType, gradient: 'linear-gradient(135deg, #18181b, #3f3f46, #18181b)' },
]

// Performance tiers
type PerfTier = 'high' | 'medium' | 'low'

const PERF_CONFIG: Record<PerfTier, {
  segWidth: number
  segHeight: number
  smoothFactor: number      // Temporal blend: 0 = no smoothing, 1 = max smoothing
  edgeFeather: number        // Pixels to feather at edges
  skipFrames: number         // Process every Nth frame
}> = {
  high: { segWidth: 640, segHeight: 480, smoothFactor: 0.3, edgeFeather: 3, skipFrames: 0 },
  medium: { segWidth: 480, segHeight: 360, smoothFactor: 0.45, edgeFeather: 4, skipFrames: 1 },
  low: { segWidth: 320, segHeight: 240, smoothFactor: 0.55, edgeFeather: 5, skipFrames: 2 },
}

export class VirtualBgProcessor {
  private imageSegmenter: ImageSegmenter | null = null
  private isInitialized = false
  private isRunning = false
  private animationFrameId: number | null = null

  // Canvas elements for processing
  private inputCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
  private outputCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
  private bgCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
  private maskCanvas: OffscreenCanvas | HTMLCanvasElement | null = null
  private inputCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null
  private outputCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null
  private bgCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null
  private maskCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null

  // Temporal smoothing
  private prevMask: Float32Array | null = null
  private currentConfig: VirtualBgConfig = { type: 'none' }
  private perfTier: PerfTier = 'medium'
  private frameCount = 0

  // Background image cache
  private bgImage: HTMLImageElement | null = null
  private bgImageLoading = false

  // Processed stream
  private outputStream: MediaStream | null = null
  private outputVideoEl: HTMLVideoElement | null = null

  // Source
  private sourceVideo: HTMLVideoElement | null = null

  // Performance monitoring
  private fpsHistory: number[] = []
  private lastFrameTime = 0

  constructor() {}

  /**
   * Initialize MediaPipe Selfie Segmentation model
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
      )

      this.imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })

      this.isInitialized = true
      console.log('[VirtualBg] MediaPipe Selfie Segmenter initialized')
      return true
    } catch (err) {
      console.error('[VirtualBg] Failed to initialize:', err)
      // Try with CPU delegate as fallback
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm'
        )
        this.imageSegmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        })
        this.isInitialized = true
        this.perfTier = 'low' // CPU is slower
        console.log('[VirtualBg] Initialized with CPU delegate (fallback)')
        return true
      } catch (err2) {
        console.error('[VirtualBg] CPU fallback also failed:', err2)
        return false
      }
    }
  }

  /**
   * Auto-detect performance tier based on device
   */
  private detectPerformanceTier(): PerfTier {
    // Check hardware concurrency
    const cores = navigator.hardwareConcurrency || 4
    // Check device memory (if available)
    const memory = (navigator as any).deviceMemory || 4 // GB
    // Check screen resolution
    const pixels = window.screen.width * window.screen.height

    if (cores >= 8 && memory >= 8 && pixels < 4000000) return 'high'
    if (cores >= 4 && memory >= 4) return 'medium'
    return 'low'
  }

  /**
   * Create offscreen canvases for processing
   */
  private createCanvases(width: number, height: number) {
    const useOffscreen = typeof OffscreenCanvas !== 'undefined'

    const createCanvas = (w: number, h: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D } => {
      if (useOffscreen) {
        const c = new OffscreenCanvas(w, h)
        const ctx = c.getContext('2d')!
        return { canvas: c, ctx }
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      return { canvas: c, ctx }
    }

    const input = createCanvas(width, height)
    this.inputCanvas = input.canvas
    this.inputCtx = input.ctx

    const output = createCanvas(width, height)
    this.outputCanvas = output.canvas
    this.outputCtx = output.ctx

    const bg = createCanvas(width, height)
    this.bgCanvas = bg.canvas
    this.bgCtx = bg.ctx

    const mask = createCanvas(width, height)
    this.maskCanvas = mask.canvas
    this.maskCtx = mask.ctx
  }

  /**
   * Pre-render the background to bgCanvas
   */
  private renderBackground(config: VirtualBgConfig, width: number, height: number) {
    if (!this.bgCtx) return

    this.bgCtx!.clearRect(0, 0, width, height)

    if (config.type === 'blur') {
      // Draw original frame, then we'll apply blur in compositing
      if (this.sourceVideo) {
        this.bgCtx!.drawImage(this.sourceVideo, 0, 0, width, height)
      }
    } else if (config.type === 'color' && config.color) {
      this.bgCtx!.fillStyle = config.color
      this.bgCtx!.fillRect(0, 0, width, height)
    } else if (config.type === 'image' && config.imageUrl) {
      // Could be a gradient or an actual image
      if (config.imageUrl.startsWith('linear-gradient') || config.imageUrl.startsWith('radial-gradient')) {
        // Render gradient to a temp canvas then draw
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = width
        tempCanvas.height = height
        const tempCtx = tempCanvas.getContext('2d')!
        // Create gradient manually
        this.drawGradientToCanvas(tempCtx, config.imageUrl, width, height)
        this.bgCtx!.drawImage(tempCanvas, 0, 0)
      } else if (this.bgImage && this.bgImage.complete) {
        // Draw image covering the full canvas
        const imgRatio = this.bgImage.width / this.bgImage.height
        const canvasRatio = width / height
        let sx = 0, sy = 0, sw = this.bgImage.width, sh = this.bgImage.height
        if (imgRatio > canvasRatio) {
          sw = sh * canvasRatio
          sx = (this.bgImage.width - sw) / 2
        } else {
          sh = sw / canvasRatio
          sy = (this.bgImage.height - sh) / 2
        }
        this.bgCtx!.drawImage(this.bgImage, sx, sy, sw, sh, 0, 0, width, height)
      } else {
        // Fallback to dark color while loading
        this.bgCtx!.fillStyle = '#1a1a2e'
        this.bgCtx!.fillRect(0, 0, width, height)
      }
    }
  }

  /**
   * Parse CSS gradient and draw to canvas
   */
  private drawGradientToCanvas(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    gradientStr: string,
    width: number,
    height: number
  ) {
    // Simple parser for linear-gradient(135deg, color1, color2, ...)
    const colorMatch = gradientStr.match(/#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|rgb\([^)]+\)/g)
    const angleMatch = gradientStr.match(/(\d+)deg/)

    if (!colorMatch || colorMatch.length < 2) {
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, width, height)
      return
    }

    const angle = angleMatch ? parseInt(angleMatch[1]) : 135
    const rad = (angle * Math.PI) / 180
    const cx = width / 2
    const cy = height / 2
    const len = Math.max(width, height)

    const x1 = cx - Math.cos(rad) * len
    const y1 = cy - Math.sin(rad) * len
    const x2 = cx + Math.cos(rad) * len
    const y2 = cy + Math.sin(rad) * len

    const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
    colorMatch.forEach((color, i) => {
      gradient.addColorStop(i / (colorMatch.length - 1), color)
    })

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
  }

  /**
   * Load a background image from URL
   */
  private async loadBackgroundImage(url: string): Promise<boolean> {
    if (this.bgImage && this.bgImage.src === url && this.bgImage.complete) return true

    this.bgImageLoading = true
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        this.bgImage = img
        this.bgImageLoading = false
        resolve(true)
      }
      img.onerror = () => {
        this.bgImageLoading = false
        console.warn('[VirtualBg] Failed to load background image')
        resolve(false)
      }
      img.src = url
    })
  }

  /**
   * Apply edge feathering to the segmentation mask
   * Uses a simple box blur on the mask edges
   */
  private featherMask(
    maskData: Float32Array,
    width: number,
    height: number,
    feather: number
  ): void {
    if (feather <= 0) return

    // Simple horizontal + vertical pass for box blur approximation
    const temp = new Float32Array(maskData.length)

    // Horizontal pass
    const halfF = Math.floor(feather)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0
        let count = 0
        for (let dx = -halfF; dx <= halfF; dx++) {
          const nx = Math.min(Math.max(x + dx, 0), width - 1)
          sum += maskData[y * width + nx]
          count++
        }
        temp[y * width + x] = sum / count
      }
    }

    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0
        let count = 0
        for (let dy = -halfF; dy <= halfF; dy++) {
          const ny = Math.min(Math.max(y + dy, 0), height - 1)
          sum += temp[ny * width + x]
          count++
        }
        maskData[y * width + x] = sum / count
      }
    }
  }

  /**
   * Temporal smoothing: blend current mask with previous to reduce flicker
   */
  private temporalSmooth(currentMask: Float32Array, factor: number): void {
    if (!this.prevMask || this.prevMask.length !== currentMask.length) {
      this.prevMask = new Float32Array(currentMask)
      return
    }

    const blendFactor = 1 - factor // factor 0.3 means keep 70% current, 30% previous
    for (let i = 0; i < currentMask.length; i++) {
      this.prevMask[i] = currentMask[i] * blendFactor + this.prevMask[i] * factor
    }

    // Copy smoothed result back
    currentMask.set(this.prevMask)
  }

  /**
   * Process a single video frame
   */
  private processFrame(timestamp: number): void {
    if (!this.isRunning || !this.imageSegmenter || !this.sourceVideo || !this.outputCtx || !this.inputCtx) return

    const config = this.perfConfig
    const skip = config.skipFrames

    this.frameCount++
    if (skip > 0 && this.frameCount % (skip + 1) !== 0) {
      // Skip this frame but still render the last processed output
      this.animationFrameId = requestAnimationFrame((t) => this.processFrame(t))
      return
    }

    const width = (this.inputCanvas as any).width
    const height = (this.inputCanvas as any).height

    if (!width || !height) {
      this.animationFrameId = requestAnimationFrame((t) => this.processFrame(t))
      return
    }

    // Draw video frame to input canvas
    this.inputCtx.drawImage(this.sourceVideo, 0, 0, width, height)

    // Run segmentation
    try {
      const result: ImageSegmenterResult = this.imageSegmenter.segmentForVideo(
        this.inputCanvas as HTMLCanvasElement,
        timestamp
      )

      if (result.categoryMask) {
        const maskCanvas = this.maskCanvas as HTMLCanvasElement
        const maskCtx = this.maskCtx as CanvasRenderingContext2D
        
        // Draw mask to maskCanvas and extract pixels
        maskCtx.drawImage(result.categoryMask, 0, 0, width, height)
        const maskImageData = maskCtx.getImageData(0, 0, width, height)

        // Convert to float mask (person = 1.0, background = 0.0)
        const floatMask = new Float32Array(width * height)
        for (let i = 0; i < floatMask.length; i++) {
          // MediaPipe mask: white (255) = person, black (0) = background
          floatMask[i] = maskImageData.data[i * 4] / 255.0
        }

        // Apply edge feathering
        this.featherMask(floatMask, width, height, config.edgeFeather)

        // Apply temporal smoothing (flicker reduction)
        this.temporalSmooth(floatMask, config.smoothFactor)

        // Create RGBA mask for compositing
        const maskRGBA = new Uint8ClampedArray(width * height * 4)
        for (let i = 0; i < floatMask.length; i++) {
          const val = Math.round(floatMask[i] * 255)
          maskRGBA[i * 4] = val     // R
          maskRGBA[i * 4 + 1] = val // G
          maskRGBA[i * 4 + 2] = val // B
          maskRGBA[i * 4 + 3] = 255 // A
        }

        // Render background
        this.renderBackground(this.currentConfig, width, height)

        // Composite: draw background, then overlay person using mask
        const bgImageData = (this.bgCtx as CanvasRenderingContext2D).getImageData(0, 0, width, height)
        const fgImageData = (this.inputCtx as CanvasRenderingContext2D).getImageData(0, 0, width, height)
        const outImageData = this.outputCtx.createImageData(width, height)

        for (let i = 0; i < floatMask.length; i++) {
          const mask = floatMask[i]
          const pi = i * 4
          outImageData.data[pi] = fgImageData.data[pi] * mask + bgImageData.data[pi] * (1 - mask)
          outImageData.data[pi + 1] = fgImageData.data[pi + 1] * mask + bgImageData.data[pi + 1] * (1 - mask)
          outImageData.data[pi + 2] = fgImageData.data[pi + 2] * mask + bgImageData.data[pi + 2] * (1 - mask)
          outImageData.data[pi + 3] = 255
        }

        this.outputCtx.putImageData(outImageData, 0, 0)
      } else {
        // Fallback: just draw the original frame
        this.outputCtx.drawImage(this.sourceVideo, 0, 0, width, height)
      }
    } catch (err) {
      // On error, draw original frame
      this.outputCtx.drawImage(this.sourceVideo, 0, 0, width, height)
    }

    // Monitor FPS for adaptive quality
    this.monitorPerformance()

    this.animationFrameId = requestAnimationFrame((t) => this.processFrame(t))
  }

  /**
   * Monitor FPS and auto-adjust performance tier
   */
  private monitorPerformance() {
    const now = performance.now()
    if (this.lastFrameTime > 0) {
      const fps = 1000 / (now - this.lastFrameTime)
      this.fpsHistory.push(fps)
      if (this.fpsHistory.length > 30) this.fpsHistory.shift()

      const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length

      // Auto-downgrade if FPS drops below 20
      if (avgFps < 20 && this.perfTier !== 'low') {
        console.log(`[VirtualBg] Low FPS detected (${Math.round(avgFps)}), downgrading to ${this.perfTier === 'high' ? 'medium' : 'low'}`)
        this.perfTier = this.perfTier === 'high' ? 'medium' : 'low'
        this.recreateCanvases()
      }
    }
    this.lastFrameTime = now
  }

  private get perfConfig() {
    return PERF_CONFIG[this.perfTier]
  }

  /**
   * Recreate canvases when performance tier changes
   */
  private recreateCanvases() {
    if (this.sourceVideo) {
      const config = this.perfConfig
      // Use a reasonable canvas size based on video aspect ratio
      const vw = this.sourceVideo.videoWidth || 640
      const vh = this.sourceVideo.videoHeight || 480
      const scale = Math.min(config.segWidth / vw, config.segHeight / vh)
      const w = Math.round(vw * scale)
      const h = Math.round(vh * scale)
      this.createCanvases(w, h)
    }
  }

  /**
   * Start processing video stream with virtual background
   * Returns a processed MediaStream
   */
  async start(
    sourceStream: MediaStream,
    config: VirtualBgConfig
  ): Promise<MediaStream | null> {
    if (!this.isInitialized) {
      const success = await this.initialize()
      if (!success) {
        console.error('[VirtualBg] Cannot start: initialization failed')
        return null
      }
    }

    // Detect performance tier
    this.perfTier = this.detectPerformanceTier()
    console.log(`[VirtualBg] Performance tier: ${this.perfTier}`)

    // Stop any existing processing
    this.stop()

    this.currentConfig = config
    this.frameCount = 0
    this.fpsHistory = []
    this.lastFrameTime = 0
    this.prevMask = null

    // Get the video track dimensions
    const videoTrack = sourceStream.getVideoTracks()[0]
    if (!videoTrack) {
      console.error('[VirtualBg] No video track in source stream')
      return null
    }

    const settings = videoTrack.getSettings()
    const videoWidth = settings.width || 640
    const videoHeight = settings.height || 480

    // Create source video element
    this.sourceVideo = document.createElement('video')
    this.sourceVideo.srcObject = sourceStream
    this.sourceVideo.muted = true
    this.sourceVideo.playsInline = true
    try {
      await this.sourceVideo.play()
    } catch (err) {
      // Suppress AbortError from play() when interrupted (e.g. component unmount)
      if ((err as DOMException)?.name !== 'AbortError') {
        console.warn('[VirtualBg] play() failed:', err)
      }
    }

    // Create processing canvases
    const config2 = this.perfConfig
    const scale = Math.min(config2.segWidth / videoWidth, config2.segHeight / videoHeight)
    const processWidth = Math.round(videoWidth * scale)
    const processHeight = Math.round(videoHeight * scale)
    this.createCanvases(processWidth, processHeight)

    // Pre-load background image if needed
    if (config.type === 'image' && config.imageUrl && !config.imageUrl.startsWith('linear-gradient') && !config.imageUrl.startsWith('radial-gradient')) {
      this.loadBackgroundImage(config.imageUrl)
    }

    // Create output stream from canvas
    this.outputStream = new MediaStream()

    // Use canvas captureStream for output
    if (this.outputCanvas instanceof HTMLCanvasElement) {
      const canvasStream = this.outputCanvas.captureStream(30)
      const canvasVideoTrack = canvasStream.getVideoTracks()[0]
      if (canvasVideoTrack) {
        // Clone the track with original constraints
        this.outputStream.addTrack(canvasVideoTrack)
      }
    } else {
      // For OffscreenCanvas, use a visible canvas as bridge
      const bridgeCanvas = document.createElement('canvas')
      bridgeCanvas.width = processWidth
      bridgeCanvas.height = processHeight
      const bridgeCtx = bridgeCanvas.getContext('2d')!
      
      // Override outputCtx to draw to bridge canvas
      this.outputCtx = bridgeCtx
      this.outputCanvas = bridgeCanvas

      const canvasStream = bridgeCanvas.captureStream(30)
      const canvasVideoTrack = canvasStream.getVideoTracks()[0]
      if (canvasVideoTrack) {
        this.outputStream.addTrack(canvasVideoTrack)
      }
    }

    // Copy audio tracks from source stream
    sourceStream.getAudioTracks().forEach((track) => {
      this.outputStream!.addTrack(track.clone())
    })

    // Start processing loop
    this.isRunning = true
    this.animationFrameId = requestAnimationFrame((t) => this.processFrame(t))

    console.log(`[VirtualBg] Started processing (${processWidth}x${processHeight})`)
    return this.outputStream
  }

  /**
   * Update the background configuration in real-time
   */
  async updateConfig(config: VirtualBgConfig): Promise<void> {
    this.currentConfig = config

    // Pre-load new image if needed
    if (config.type === 'image' && config.imageUrl && !config.imageUrl.startsWith('linear-gradient') && !config.imageUrl.startsWith('radial-gradient')) {
      await this.loadBackgroundImage(config.imageUrl)
    }
  }

  /**
   * Stop processing and clean up
   */
  stop(): void {
    this.isRunning = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.sourceVideo) {
      this.sourceVideo.srcObject = null
      this.sourceVideo = null
    }

    if (this.outputStream) {
      this.outputStream.getTracks().forEach((t) => t.stop())
      this.outputStream = null
    }

    this.prevMask = null
    this.bgImage = null
    this.frameCount = 0
    this.fpsHistory = []
    this.lastFrameTime = 0
  }

  /**
   * Get current processed stream
   */
  getOutputStream(): MediaStream | null {
    return this.outputStream
  }

  /**
   * Check if processor is running
   */
  getIsRunning(): boolean {
    return this.isRunning
  }

  /**
   * Get current performance tier
   */
  getPerfTier(): PerfTier {
    return this.perfTier
  }

  /**
   * Generate a preview frame (single frame, for preview panel)
   */
  async generatePreview(
    sourceVideo: HTMLVideoElement,
    config: VirtualBgConfig,
    width: number = 160,
    height: number = 90
  ): Promise<string | null> {
    if (!this.isInitialized) {
      const success = await this.initialize()
      if (!success) return null
    }

    // Pre-load image if needed
    if (config.type === 'image' && config.imageUrl && !config.imageUrl.startsWith('linear-gradient') && !config.imageUrl.startsWith('radial-gradient')) {
      await this.loadBackgroundImage(config.imageUrl)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    // Draw source frame
    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = width
    srcCanvas.height = height
    const srcCtx = srcCanvas.getContext('2d')!
    srcCtx.drawImage(sourceVideo, 0, 0, width, height)

    try {
      const result: ImageSegmenterResult = this.imageSegmenter!.segmentForVideo(
        srcCanvas,
        performance.now()
      )

      if (result.categoryMask) {
        const maskCanvas = document.createElement('canvas')
        maskCanvas.width = width
        maskCanvas.height = height
        const maskCtx = maskCanvas.getContext('2d')!
        maskCtx.drawImage(result.categoryMask, 0, 0, width, height)
        const maskData = maskCtx.getImageData(0, 0, width, height)

        const floatMask = new Float32Array(width * height)
        for (let i = 0; i < floatMask.length; i++) {
          floatMask[i] = maskData.data[i * 4] / 255.0
        }

        // Light feather for preview
        this.featherMask(floatMask, width, height, 2)

        // Render background
        const bgCanvas = document.createElement('canvas')
        bgCanvas.width = width
        bgCanvas.height = height
        const bgCtx = bgCanvas.getContext('2d')!

        if (config.type === 'blur') {
          bgCtx.filter = `blur(${config.blurAmount || 15}px)`
          bgCtx.drawImage(sourceVideo, 0, 0, width, height)
        } else if (config.type === 'color' && config.color) {
          bgCtx.fillStyle = config.color
          bgCtx.fillRect(0, 0, width, height)
        } else if (config.type === 'image' && config.imageUrl) {
          if (config.imageUrl.startsWith('linear-gradient') || config.imageUrl.startsWith('radial-gradient')) {
            this.drawGradientToCanvas(bgCtx, config.imageUrl, width, height)
          } else if (this.bgImage && this.bgImage.complete) {
            bgCtx.drawImage(this.bgImage, 0, 0, width, height)
          } else {
            bgCtx.fillStyle = '#1a1a2e'
            bgCtx.fillRect(0, 0, width, height)
          }
        }

        // Composite
        const bgImageData = bgCtx.getImageData(0, 0, width, height)
        const fgImageData = srcCtx.getImageData(0, 0, width, height)
        const outImageData = ctx.createImageData(width, height)

        for (let i = 0; i < floatMask.length; i++) {
          const mask = floatMask[i]
          const pi = i * 4
          outImageData.data[pi] = fgImageData.data[pi] * mask + bgImageData.data[pi] * (1 - mask)
          outImageData.data[pi + 1] = fgImageData.data[pi + 1] * mask + bgImageData.data[pi + 1] * (1 - mask)
          outImageData.data[pi + 2] = fgImageData.data[pi + 2] * mask + bgImageData.data[pi + 2] * (1 - mask)
          outImageData.data[pi + 3] = 255
        }

        ctx.putImageData(outImageData, 0, 0)
      } else {
        ctx.drawImage(sourceVideo, 0, 0, width, height)
      }
    } catch {
      ctx.drawImage(sourceVideo, 0, 0, width, height)
    }

    return canvas.toDataURL('image/jpeg', 0.8)
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stop()
    if (this.imageSegmenter) {
      this.imageSegmenter.close()
      this.imageSegmenter = null
    }
    this.isInitialized = false
    this.inputCanvas = null
    this.outputCanvas = null
    this.bgCanvas = null
    this.maskCanvas = null
    this.inputCtx = null
    this.outputCtx = null
    this.bgCtx = null
    this.maskCtx = null
  }
}

// Singleton instance
let processorInstance: VirtualBgProcessor | null = null

export function getVirtualBgProcessor(): VirtualBgProcessor {
  if (!processorInstance) {
    processorInstance = new VirtualBgProcessor()
  }
  return processorInstance
}
