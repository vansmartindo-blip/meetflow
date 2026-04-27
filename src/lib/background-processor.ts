import { ImageSegmenter, FilesetResolver, ImageSegmenterResult } from '@mediapipe/tasks-vision'

export type BackgroundType = 'none' | 'blur' | 'gradient' | 'image'

export interface BackgroundConfig {
  type: BackgroundType
  value: string | null // blur: '4px'|'10px'|'20px', gradient: CSS string, image: data URL
}

export interface BackgroundProcessorStatus {
  isLoading: boolean
  isActive: boolean
  error: string | null
}

type StatusCallback = (status: BackgroundProcessorStatus) => void

// ─── Parse a CSS gradient into canvas-usable color stops ───
function parseGradientColors(gradient: string): { colors: [number, number, number][]; angle: number } {
  const colors: [number, number, number][] = []
  let angle = 135

  const angleMatch = gradient.match(/(\d+)deg/)
  if (angleMatch) angle = parseInt(angleMatch[1], 10)

  const hexColors = gradient.match(/#[0-9a-fA-F]{6}/g)
  if (hexColors) {
    for (const hex of hexColors) {
      colors.push([
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
      ])
    }
  }

  if (colors.length === 0) {
    colors.push([24, 24, 27])
    colors.push([39, 39, 42])
  }

  return { colors, angle }
}

// ─── Pre-compute gradient lookup table ───
function computeGradientLookup(
  colors: [number, number, number][],
  angleDeg: number,
  w: number,
  h: number
): Uint8Array {
  const lookup = new Uint8Array(w * h * 3)
  const angleRad = ((angleDeg - 90) * Math.PI) / 180
  const cosA = Math.cos(angleRad)
  const sinA = Math.sin(angleRad)
  const cx = w / 2
  const cy = h / 2
  const halfDiag = Math.sqrt((w * w + h * h) / 4)
  const x0 = cx - cosA * halfDiag
  const y0 = cy - sinA * halfDiag
  const x1 = cx + cosA * halfDiag
  const y1 = cy + sinA * halfDiag
  const dx = x1 - x0
  const dy = y1 - y0
  const lenSq = dx * dx + dy * dy
  const numColors = colors.length

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let t = 0
      if (lenSq > 0) {
        t = ((x - x0) * dx + (y - y0) * dy) / lenSq
      }
      t = Math.max(0, Math.min(1, t))
      const scaledT = t * (numColors - 1)
      const idx = Math.min(Math.floor(scaledT), numColors - 2)
      const frac = scaledT - idx
      const c0 = colors[idx]
      const c1 = colors[idx + 1]
      const li = (y * w + x) * 3
      lookup[li] = Math.round(c0[0] + (c1[0] - c0[0]) * frac)
      lookup[li + 1] = Math.round(c0[1] + (c1[1] - c0[1]) * frac)
      lookup[li + 2] = Math.round(c0[2] + (c1[2] - c0[2]) * frac)
    }
  }
  return lookup
}

// ─── Simple 3x3 box blur on the mask for edge feathering ───
function smoothMask(maskPixels: Uint8ClampedArray, w: number, h: number, passes: number): void {
  const len = w * h * 4
  const temp = new Uint8ClampedArray(len)

  for (let pass = 0; pass < passes; pass++) {
    // Copy current mask to temp
    temp.set(maskPixels)

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const pi = (y * w + x) * 4
        let sum = 0
        // 3x3 kernel on alpha channel
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += temp[((y + dy) * w + (x + dx)) * 4 + 3]
          }
        }
        // Write smoothed alpha
        maskPixels[pi + 3] = (sum / 9) | 0
      }
    }
  }
}

class BackgroundProcessorSingleton {
  private segmenter: ImageSegmenter | null = null
  private isRunning = false
  private isSegmenting = false
  private sourceVideo: HTMLVideoElement | null = null
  private sourceCanvas: HTMLCanvasElement | null = null
  private sourceCtx: CanvasRenderingContext2D | null = null
  private outputCanvas: HTMLCanvasElement | null = null
  private outputCtx: CanvasRenderingContext2D | null = null
  private blurCanvas: HTMLCanvasElement | null = null
  private blurCtx: CanvasRenderingContext2D | null = null
  private maskCanvas: HTMLCanvasElement | null = null
  private maskCtx: CanvasRenderingContext2D | null = null
  private bgImageCanvas: HTMLCanvasElement | null = null
  private bgImageCtx: CanvasRenderingContext2D | null = null
  private processedStream: MediaStream | null = null
  private canvasCaptureTrack: MediaStreamTrack | null = null
  private originalAudioTracks: MediaStreamTrack[] = []
  private originalVideoTrack: MediaStreamTrack | null = null
  private bgImage: HTMLImageElement | null = null
  private config: BackgroundConfig = { type: 'none', value: null }
  private lastProcessTime = 0
  private readonly frameInterval = 1000 / 15 // ~66ms for 15fps
  private width = 640
  private height = 480
  private isModelLoaded = false
  private gradientLookup: Uint8Array | null = null
  private animFrameId: number = 0
  private statusCallback: StatusCallback | null = null

  private constructor() {}

  static getInstance(): BackgroundProcessorSingleton {
    if (!(globalThis as any).__bgProcessorSingleton) {
      (globalThis as any).__bgProcessorSingleton = new BackgroundProcessorSingleton()
    }
    return (globalThis as any).__bgProcessorSingleton
  }

  onStatusChange(cb: StatusCallback | null): void {
    this.statusCallback = cb
  }

  private emitStatus(): void {
    this.statusCallback?.({
      isLoading: false,
      isActive: this.isRunning,
      error: null,
    })
  }

  async loadModel(): Promise<boolean> {
    if (this.isModelLoaded && this.segmenter) return true

    this.statusCallback?.({ isLoading: true, isActive: false, error: null })
    console.log('[BackgroundProcessor] Loading model...')

    try {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/')
      console.log('[BackgroundProcessor] WASM resolved, creating segmenter...')
      this.segmenter = await ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      })
      this.isModelLoaded = true
      console.log('[BackgroundProcessor] Model loaded (GPU)')
      return true
    } catch (err) {
      console.warn('[BackgroundProcessor] GPU delegate failed, trying CPU:', err)
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/')
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        })
        this.isModelLoaded = true
        console.log('[BackgroundProcessor] Model loaded (CPU fallback)')
        return true
      } catch (cpuErr) {
        console.error('[BackgroundProcessor] Failed to load model:', cpuErr)
        this.statusCallback?.({ isLoading: false, isActive: false, error: 'Failed to load segmentation model' })
        return false
      }
    }
  }

  async start(sourceStream: MediaStream, config: BackgroundConfig): Promise<MediaStream | null> {
    if (this.isRunning) {
      this.stop()
    }

    this.config = config

    const videoTrack = sourceStream.getVideoTracks()[0]
    if (!videoTrack) {
      console.error('[BackgroundProcessor] No video track')
      this.statusCallback?.({ isLoading: false, isActive: false, error: 'No video track available' })
      return null
    }

    const settings = videoTrack.getSettings()
    this.width = settings.width || 640
    this.height = settings.height || 480

    this.statusCallback?.({ isLoading: true, isActive: false, error: null })

    // Load model
    const loaded = await this.loadModel()
    if (!loaded) {
      console.error('[BackgroundProcessor] Model not loaded, aborting start')
      return null
    }

    // Setup source video — hidden element playing the camera feed
    this.sourceVideo = document.createElement('video')
    this.sourceVideo.srcObject = new MediaStream([videoTrack.clone()])
    this.sourceVideo.muted = true
    this.sourceVideo.playsInline = true
    this.sourceVideo.setAttribute('playsinline', '')
    await this.sourceVideo.play()
    console.log(`[BackgroundProcessor] Source video playing (${this.width}x${this.height})`)

    // Setup canvases
    this.sourceCanvas = document.createElement('canvas')
    this.sourceCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true })!
    this.outputCanvas = document.createElement('canvas')
    this.outputCtx = this.outputCanvas.getContext('2d', { willReadFrequently: true })!
    this.maskCanvas = document.createElement('canvas')
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true })!

    this.sourceCanvas.width = this.width
    this.sourceCanvas.height = this.height
    this.outputCanvas.width = this.width
    this.outputCanvas.height = this.height
    this.maskCanvas.width = this.width
    this.maskCanvas.height = this.height

    // Pre-compute gradient lookup if needed
    if (config.type === 'gradient' && config.value) {
      const { colors, angle } = parseGradientColors(config.value)
      this.gradientLookup = computeGradientLookup(colors, angle, this.width, this.height)
    } else {
      this.gradientLookup = null
    }

    // Setup blur canvas
    if (config.type === 'blur') {
      this.blurCanvas = document.createElement('canvas')
      this.blurCanvas.width = this.width
      this.blurCanvas.height = this.height
      this.blurCtx = this.blurCanvas.getContext('2d')!
    } else {
      this.blurCanvas = null
      this.blurCtx = null
    }

    // Setup background image canvas
    if (config.type === 'image' && config.value) {
      this.bgImageCanvas = document.createElement('canvas')
      this.bgImageCanvas.width = this.width
      this.bgImageCanvas.height = this.height
      this.bgImageCtx = this.bgImageCanvas.getContext('2d')!
      await this.loadBackgroundImage(config.value)
    } else {
      this.bgImageCanvas = null
      this.bgImageCtx = null
      this.bgImage = null
    }

    // Save original tracks
    this.originalAudioTracks = sourceStream.getAudioTracks().slice()
    this.originalVideoTrack = videoTrack

    // ─── CRITICAL FIX: Use captureStream(0) for manual frame control ───
    // captureStream(fps) with putImageData is unreliable in many browsers.
    // captureStream(0) gives us manual control via requestFrame().
    const canvasStream = this.outputCanvas.captureStream(0)
    this.canvasCaptureTrack = canvasStream.getVideoTracks()[0]
    for (const audioTrack of this.originalAudioTracks) {
      canvasStream.addTrack(audioTrack.clone())
    }
    this.processedStream = canvasStream

    // ─── CRITICAL FIX: Draw initial frame immediately so user sees camera ───
    // Before segmentation starts, render the raw camera frame to output canvas
    // and request a frame so the stream has content immediately.
    this.outputCtx.drawImage(this.sourceVideo, 0, 0, this.width, this.height)
    if (this.canvasCaptureTrack) {
      ;(this.canvasCaptureTrack as any).requestFrame?.()
    }

    this.isRunning = true
    this.isSegmenting = false
    this.lastProcessTime = 0

    this.statusCallback?.({ isLoading: false, isActive: true, error: null })
    this.emitStatus()

    // Start processing loop
    this.tick()

    console.log(`[BackgroundProcessor] Started — type: ${config.type}, ${this.width}x${this.height}`)
    return this.processedStream
  }

  async updateConfig(config: BackgroundConfig): Promise<void> {
    this.config = config

    if (config.type === 'gradient' && config.value) {
      const { colors, angle } = parseGradientColors(config.value)
      this.gradientLookup = computeGradientLookup(colors, angle, this.width, this.height)
    } else {
      this.gradientLookup = null
    }

    if (config.type === 'blur') {
      if (!this.blurCanvas) {
        this.blurCanvas = document.createElement('canvas')
        this.blurCanvas.width = this.width
        this.blurCanvas.height = this.height
        this.blurCtx = this.blurCanvas.getContext('2d')!
      }
    } else {
      this.blurCanvas = null
      this.blurCtx = null
    }

    if (config.type === 'image' && config.value) {
      if (!this.bgImageCanvas) {
        this.bgImageCanvas = document.createElement('canvas')
        this.bgImageCanvas.width = this.width
        this.bgImageCanvas.height = this.height
        this.bgImageCtx = this.bgImageCanvas.getContext('2d')!
      }
      await this.loadBackgroundImage(config.value)
    } else {
      this.bgImageCanvas = null
      this.bgImageCtx = null
      this.bgImage = null
    }
  }

  stop(): void {
    this.isRunning = false
    this.isSegmenting = false

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = 0
    }

    if (this.sourceVideo) {
      this.sourceVideo.pause()
      this.sourceVideo.srcObject = null
      this.sourceVideo = null
    }

    if (this.processedStream) {
      this.processedStream.getTracks().forEach((t) => t.stop())
      this.processedStream = null
    }
    this.canvasCaptureTrack = null

    this.sourceCanvas = null
    this.sourceCtx = null
    this.outputCanvas = null
    this.outputCtx = null
    this.maskCanvas = null
    this.maskCtx = null
    this.blurCanvas = null
    this.blurCtx = null
    this.bgImageCanvas = null
    this.bgImageCtx = null
    this.bgImage = null
    this.gradientLookup = null
    this.originalAudioTracks = []
    this.originalVideoTrack = null

    this.statusCallback?.({ isLoading: false, isActive: false, error: null })

    console.log('[BackgroundProcessor] Stopped')
  }

  getProcessedStream(): MediaStream | null {
    return this.processedStream
  }

  getOriginalVideoTrack(): MediaStreamTrack | null {
    return this.originalVideoTrack
  }

  isActive(): boolean {
    return this.isRunning
  }

  private targetFPS(): number {
    return 15
  }

  private async loadBackgroundImage(dataUrl: string): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        this.bgImage = img
        this.drawBgImageScaled()
        resolve()
      }
      img.onerror = () => {
        console.error('[BackgroundProcessor] Failed to load background image')
        this.bgImage = null
        resolve()
      }
      img.src = dataUrl
    })
  }

  private drawBgImageScaled(): void {
    if (!this.bgImage || !this.bgImageCtx || !this.bgImageCanvas) return

    const canvas = this.bgImageCanvas
    const ctx = this.bgImageCtx
    const img = this.bgImage

    const canvasRatio = canvas.width / canvas.height
    const imgRatio = img.naturalWidth / img.naturalHeight

    let dw: number, dh: number, dx: number, dy: number

    if (imgRatio > canvasRatio) {
      dh = canvas.height
      dw = dh * imgRatio
      dx = (canvas.width - dw) / 2
      dy = 0
    } else {
      dw = canvas.width
      dh = dw / imgRatio
      dx = 0
      dy = (canvas.height - dh) / 2
    }

    ctx.drawImage(img, dx, dy, dw, dh)
  }

  private tick = (): void => {
    if (!this.isRunning) return

    this.animFrameId = requestAnimationFrame(this.tick)

    const now = performance.now()
    if (now - this.lastProcessTime < this.frameInterval) return
    if (this.isSegmenting) return

    const video = this.sourceVideo
    if (!video || video.readyState < 2) return

    this.lastProcessTime = now
    this.isSegmenting = true

    try {
      this.segmenter!.segmentForVideo(video, now, (result: ImageSegmenterResult) => {
        if (!this.isRunning) {
          this.isSegmenting = false
          return
        }
        try {
          this.compositFrame(result)
        } catch (err) {
          console.warn('[BackgroundProcessor] Frame compositing error:', err)
        }
        this.isSegmenting = false
      })
    } catch (err) {
      console.warn('[BackgroundProcessor] Segment error:', err)
      this.isSegmenting = false
    }
  }

  private compositFrame(result: ImageSegmenterResult): void {
    const catMask = result.categoryMask
    if (!catMask || !this.sourceCtx || !this.outputCtx || !this.maskCtx) return

    // Draw source frame
    this.sourceCtx.drawImage(this.sourceVideo!, 0, 0, this.width, this.height)

    // Draw mask to maskCanvas
    this.maskCtx.drawImage(catMask, 0, 0, this.width, this.height)
    const maskImageData = this.maskCtx.getImageData(0, 0, this.width, this.height)
    const maskPixels = maskImageData.data

    // ─── SMOOTH THE MASK for soft edges (3 passes = ~3px feathering) ───
    smoothMask(maskPixels, this.width, this.height, 3)

    const srcImageData = this.sourceCtx.getImageData(0, 0, this.width, this.height)
    const srcPixels = srcImageData.data

    let outputImageData: ImageData

    switch (this.config.type) {
      case 'blur':
        outputImageData = this.compositBlur(srcPixels, maskPixels)
        break
      case 'gradient':
        outputImageData = this.compositGradient(srcPixels, maskPixels)
        break
      case 'image':
        outputImageData = this.compositImage(srcPixels, maskPixels)
        break
      default:
        outputImageData = this.outputCtx.createImageData(this.width, this.height)
        outputImageData.data.set(srcPixels)
        break
    }

    this.outputCtx.putImageData(outputImageData, 0, 0)

    // ─── CRITICAL FIX: Manually request frame capture ───
    // With captureStream(0), we must explicitly request frames after putImageData
    if (this.canvasCaptureTrack) {
      try {
        ;(this.canvasCaptureTrack as any).requestFrame()
      } catch {
        // Fallback: some browsers expose it differently
      }
    }
  }

  private compositBlur(srcPixels: Uint8ClampedArray, maskPixels: Uint8ClampedArray): ImageData {
    const output = this.outputCtx!.createImageData(this.width, this.height)
    const out = output.data

    if (!this.blurCtx || !this.blurCanvas) return output

    // Draw blurred version of the source
    const blurAmount = parseInt(this.config.value || '10', 10) || 10
    this.blurCtx.filter = `blur(${blurAmount}px)`
    this.blurCtx.drawImage(this.sourceVideo!, 0, 0, this.width, this.height)
    this.blurCtx.filter = 'none'

    const blurredImageData = this.blurCtx.getImageData(0, 0, this.width, this.height)
    const blurPixels = blurredImageData.data

    // Use smooth mask alpha for feathered blending
    for (let i = 0; i < srcPixels.length; i += 4) {
      const mi = i + 3
      // Use smooth alpha (0-255) for feathered edge blending
      const maskAlpha = maskPixels[mi] / 255

      if (maskAlpha >= 0.95) {
        // Fully foreground — use original pixels
        out[i] = srcPixels[i]
        out[i + 1] = srcPixels[i + 1]
        out[i + 2] = srcPixels[i + 2]
        out[i + 3] = srcPixels[i + 3]
      } else if (maskAlpha <= 0.05) {
        // Fully background — use blurred pixels
        out[i] = blurPixels[i]
        out[i + 1] = blurPixels[i + 1]
        out[i + 2] = blurPixels[i + 2]
        out[i + 3] = blurPixels[i + 3]
      } else {
        // Feathered edge — blend between original and blurred
        out[i] = (srcPixels[i] * maskAlpha + blurPixels[i] * (1 - maskAlpha)) | 0
        out[i + 1] = (srcPixels[i + 1] * maskAlpha + blurPixels[i + 1] * (1 - maskAlpha)) | 0
        out[i + 2] = (srcPixels[i + 2] * maskAlpha + blurPixels[i + 2] * (1 - maskAlpha)) | 0
        out[i + 3] = 255
      }
    }

    return output
  }

  private compositGradient(srcPixels: Uint8ClampedArray, maskPixels: Uint8ClampedArray): ImageData {
    const output = this.outputCtx!.createImageData(this.width, this.height)
    const out = output.data
    const lookup = this.gradientLookup

    if (!lookup) {
      out.set(srcPixels)
      return output
    }

    // Use smooth mask alpha for feathered edge blending
    for (let i = 0; i < srcPixels.length; i += 4) {
      const mi = i + 3
      const maskAlpha = maskPixels[mi] / 255

      if (maskAlpha >= 0.95) {
        // Fully foreground
        out[i] = srcPixels[i]
        out[i + 1] = srcPixels[i + 1]
        out[i + 2] = srcPixels[i + 2]
        out[i + 3] = srcPixels[i + 3]
      } else if (maskAlpha <= 0.05) {
        // Fully background — use gradient
        out[i] = lookup[i]
        out[i + 1] = lookup[i + 1]
        out[i + 2] = lookup[i + 2]
        out[i + 3] = 255
      } else {
        // Feathered edge
        out[i] = (srcPixels[i] * maskAlpha + lookup[i] * (1 - maskAlpha)) | 0
        out[i + 1] = (srcPixels[i + 1] * maskAlpha + lookup[i + 1] * (1 - maskAlpha)) | 0
        out[i + 2] = (srcPixels[i + 2] * maskAlpha + lookup[i + 2] * (1 - maskAlpha)) | 0
        out[i + 3] = 255
      }
    }

    return output
  }

  private compositImage(srcPixels: Uint8ClampedArray, maskPixels: Uint8ClampedArray): ImageData {
    const output = this.outputCtx!.createImageData(this.width, this.height)
    const out = output.data

    let bgPixels: Uint8ClampedArray | null = null
    if (this.bgImageCtx && this.bgImageCanvas) {
      const bgImageData = this.bgImageCtx.getImageData(0, 0, this.width, this.height)
      bgPixels = bgImageData.data
    }

    // Use smooth mask alpha for feathered edge blending
    for (let i = 0; i < srcPixels.length; i += 4) {
      const mi = i + 3
      const maskAlpha = maskPixels[mi] / 255

      if (maskAlpha >= 0.95) {
        // Fully foreground
        out[i] = srcPixels[i]
        out[i + 1] = srcPixels[i + 1]
        out[i + 2] = srcPixels[i + 2]
        out[i + 3] = srcPixels[i + 3]
      } else if (maskAlpha <= 0.05) {
        // Fully background
        if (bgPixels) {
          out[i] = bgPixels[i]
          out[i + 1] = bgPixels[i + 1]
          out[i + 2] = bgPixels[i + 2]
          out[i + 3] = bgPixels[i + 3]
        } else {
          out[i] = 0
          out[i + 1] = 0
          out[i + 2] = 0
          out[i + 3] = 255
        }
      } else {
        // Feathered edge
        if (bgPixels) {
          out[i] = (srcPixels[i] * maskAlpha + bgPixels[i] * (1 - maskAlpha)) | 0
          out[i + 1] = (srcPixels[i + 1] * maskAlpha + bgPixels[i + 1] * (1 - maskAlpha)) | 0
          out[i + 2] = (srcPixels[i + 2] * maskAlpha + bgPixels[i + 2] * (1 - maskAlpha)) | 0
          out[i + 3] = 255
        } else {
          out[i] = (srcPixels[i] * maskAlpha) | 0
          out[i + 1] = (srcPixels[i + 1] * maskAlpha) | 0
          out[i + 2] = (srcPixels[i + 2] * maskAlpha) | 0
          out[i + 3] = 255
        }
      }
    }

    return output
  }
}

// Singleton instance
export const BackgroundProcessor = BackgroundProcessorSingleton.getInstance()
