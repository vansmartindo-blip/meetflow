'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Settings,
  Camera,
  Mic,
  Monitor,
  Palette,
  Bell,
  X,
} from 'lucide-react'
import { useMeetingStore } from '@/stores/meeting-store'
import { useUserStore } from '@/stores/user-store'
import { useTheme } from 'next-themes'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface MediaDevice {
  deviceId: string
  label: string
  kind: string
}

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const {
    selectedAudioDevice,
    selectedVideoDevice,
    videoQuality,
    setAudioDevice,
    setVideoDevice,
    setVideoQuality,
  } = useMeetingStore()

  const { user, isAuthenticated } = useUserStore()
  const { theme, setTheme } = useTheme()

  const [audioDevices, setAudioDevices] = useState<MediaDevice[]>([])
  const [videoDevices, setVideoDevices] = useState<MediaDevice[]>([])
  const [displayName, setDisplayName] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const [notificationSettings, setNotificationSettings] = useState({
    chatNotifications: true,
    meetingAlerts: true,
    handRaiseNotifications: true,
  })

  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)

  // Stop any active preview stream via ref (no setState)
  const stopPreviewStream = useCallback(() => {
    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((track) => track.stop())
      previewStreamRef.current = null
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = null
      }
    }
  }, [])

  // Enumerate media devices — called from event handlers, not effects
  const enumerateDevices = useCallback(async () => {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      })
      tempStream.getTracks().forEach((track) => track.stop())

      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(
        (d) => d.kind === 'audioinput' && d.deviceId
      )
      const videoInputs = devices.filter(
        (d) => d.kind === 'videoinput' && d.deviceId
      )

      setAudioDevices(
        audioInputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${audioInputs.indexOf(d) + 1}`,
          kind: d.kind,
        }))
      )
      setVideoDevices(
        videoInputs.map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${videoInputs.indexOf(d) + 1}`,
          kind: d.kind,
        }))
      )
    } catch {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter((d) => d.kind === 'audioinput')
        const videoInputs = devices.filter((d) => d.kind === 'videoinput')

        setAudioDevices(
          audioInputs.map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Microphone ${audioInputs.indexOf(d) + 1}`,
            kind: d.kind,
          }))
        )
        setVideoDevices(
          videoInputs.map((d) => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${videoInputs.indexOf(d) + 1}`,
            kind: d.kind,
          }))
        )
      } catch {
        // Silently fail
      }
    }
  }, [])

  // Start camera preview — called from event handlers
  const startPreview = useCallback(async () => {
    try {
      stopPreviewStream()
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedVideoDevice !== 'default' ? { exact: selectedVideoDevice } : undefined,
          width: videoQuality === 'high' ? 1280 : videoQuality === 'medium' ? 640 : 320,
          height: videoQuality === 'high' ? 720 : videoQuality === 'medium' ? 480 : 240,
        },
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      previewStreamRef.current = stream
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream
      }
      // Use a setTimeout so setState is not called synchronously
      setTimeout(() => setPreviewReady(true), 0)
    } catch {
      previewStreamRef.current = null
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = null
      }
      setTimeout(() => setPreviewReady(false), 0)
    }
  }, [selectedVideoDevice, videoQuality, stopPreviewStream])

  // Handle dialog open/close — all setState happens in event handler context
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        // Opening — set display name and enumerate devices (event handler context)
        setDisplayName(user?.name || '')
        setPreviewReady(false)
        enumerateDevices()
        // Delay preview start to allow dialog animation
        setTimeout(() => {
          startPreview()
        }, 300)
      } else {
        // Closing — stop preview via ref
        stopPreviewStream()
        setPreviewReady(false)
      }
      onOpenChange(nextOpen)
    },
    [user?.name, enumerateDevices, startPreview, stopPreviewStream, onOpenChange]
  )

  // Restart preview when video device or quality changes (only while open)
  useEffect(() => {
    if (open) {
      // Use setTimeout to defer setState out of the synchronous effect body
      const timeout = setTimeout(() => {
        startPreview()
      }, 0)
      return () => clearTimeout(timeout)
    }
  }, [selectedVideoDevice, videoQuality, open, startPreview])

  const handleAudioDeviceChange = (deviceId: string) => {
    setAudioDevice(deviceId)
  }

  const handleVideoDeviceChange = (deviceId: string) => {
    setVideoDevice(deviceId)
  }

  const handleVideoQualityChange = (quality: string) => {
    setVideoQuality(quality as 'low' | 'medium' | 'high')
  }

  const handleDisplayNameChange = (name: string) => {
    setDisplayName(name)
  }

  const handleSaveProfile = () => {
    if (isAuthenticated && displayName.trim()) {
      useUserStore.getState().updateProfile({ name: displayName.trim() })
    }
  }

  // Derive whether preview is active from state (not ref, which can't be accessed during render)
  const hasPreview = previewReady

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700/80 text-zinc-100 sm:max-w-[520px] max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-zinc-100">
            <Settings className="h-5 w-5 text-emerald-400" />
            Settings
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            Configure your meeting preferences
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 pt-4 flex flex-col gap-6">
          {/* Section 1: Audio & Video */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-zinc-800">
                <Mic className="h-4 w-4 text-emerald-400" />
              </div>
              Audio & Video
            </div>

            {/* Audio Input */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-400 font-medium">
                Microphone
              </Label>
              <Select value={selectedAudioDevice} onValueChange={handleAudioDeviceChange}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 text-sm h-9 focus:ring-emerald-500/50 focus:border-emerald-500/50">
                  <SelectValue placeholder="Select microphone" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                  {audioDevices.map((device) => (
                    <SelectItem
                      key={device.deviceId}
                      value={device.deviceId}
                      className="text-sm focus:bg-zinc-700 focus:text-zinc-100"
                    >
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Video Input */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-400 font-medium">
                Camera
              </Label>
              <Select value={selectedVideoDevice} onValueChange={handleVideoDeviceChange}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 text-sm h-9 focus:ring-emerald-500/50 focus:border-emerald-500/50">
                  <SelectValue placeholder="Select camera" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                  {videoDevices.map((device) => (
                    <SelectItem
                      key={device.deviceId}
                      value={device.deviceId}
                      className="text-sm focus:bg-zinc-700 focus:text-zinc-100"
                    >
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Video Quality */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-400 font-medium">
                Video Quality
              </Label>
              <Select value={videoQuality} onValueChange={handleVideoQualityChange}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 text-sm h-9 focus:ring-emerald-500/50 focus:border-emerald-500/50">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                  <SelectItem value="low" className="text-sm focus:bg-zinc-700 focus:text-zinc-100">
                    Low (320p)
                  </SelectItem>
                  <SelectItem value="medium" className="text-sm focus:bg-zinc-700 focus:text-zinc-100">
                    Medium (480p)
                  </SelectItem>
                  <SelectItem value="high" className="text-sm focus:bg-zinc-700 focus:text-zinc-100">
                    High (720p)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Camera Preview */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-400 font-medium">
                Camera Preview
              </Label>
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700">
                {hasPreview ? (
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2">
                    <Camera className="h-8 w-8 text-zinc-600" />
                    <span className="text-xs text-zinc-500">Camera unavailable</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator className="bg-zinc-700/60" />

          {/* Section 2: Appearance */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-zinc-800">
                <Palette className="h-4 w-4 text-emerald-400" />
              </div>
              Appearance
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-400 font-medium">
                Theme
              </Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-200 text-sm h-9 focus:ring-emerald-500/50 focus:border-emerald-500/50">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                  <SelectItem value="light" className="text-sm focus:bg-zinc-700 focus:text-zinc-100">
                    Light
                  </SelectItem>
                  <SelectItem value="dark" className="text-sm focus:bg-zinc-700 focus:text-zinc-100">
                    Dark
                  </SelectItem>
                  <SelectItem value="system" className="text-sm focus:bg-zinc-700 focus:text-zinc-100">
                    System
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator className="bg-zinc-700/60" />

          {/* Section 3: Notifications */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
              <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-zinc-800">
                <Bell className="h-4 w-4 text-emerald-400" />
              </div>
              Notifications
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-sm text-zinc-200 font-medium">Chat Notifications</Label>
                  <span className="text-xs text-zinc-500">Get notified for new chat messages</span>
                </div>
                <Switch
                  checked={notificationSettings.chatNotifications}
                  onCheckedChange={(checked) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      chatNotifications: checked,
                    }))
                  }
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-sm text-zinc-200 font-medium">Meeting Alerts</Label>
                  <span className="text-xs text-zinc-500">Get alerts for meeting events</span>
                </div>
                <Switch
                  checked={notificationSettings.meetingAlerts}
                  onCheckedChange={(checked) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      meetingAlerts: checked,
                    }))
                  }
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-sm text-zinc-200 font-medium">Hand Raise Notifications</Label>
                  <span className="text-xs text-zinc-500">Get notified when someone raises hand</span>
                </div>
                <Switch
                  checked={notificationSettings.handRaiseNotifications}
                  onCheckedChange={(checked) =>
                    setNotificationSettings((prev) => ({
                      ...prev,
                      handRaiseNotifications: checked,
                    }))
                  }
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Profile (if logged in) */}
          {isAuthenticated && user && (
            <>
              <Separator className="bg-zinc-700/60" />
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-zinc-800">
                    <Settings className="h-4 w-4 text-emerald-400" />
                  </div>
                  Profile
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-zinc-400 font-medium">
                      Display Name
                    </Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => handleDisplayNameChange(e.target.value)}
                        className="flex-1 h-9 px-3 rounded-md bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
                        placeholder="Enter your name"
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveProfile}
                        disabled={!displayName.trim() || displayName === user.name}
                        className="h-9 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-zinc-400 font-medium">
                      Email
                    </Label>
                    <div className="h-9 px-3 flex items-center rounded-md bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-500 cursor-not-allowed">
                      {user.email}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
