'use client'

import { useEffect } from 'react'
import { useMeetingStore } from '@/stores/meeting-store'
import { useUserStore } from '@/stores/user-store'
import { AnimatePresence, motion } from 'framer-motion'
import Dashboard from '@/components/meeting/Dashboard'
import MeetingRoom from '@/components/meeting/MeetingRoom'

export default function Home() {
  const currentView = useMeetingStore((s) => s.currentView)

  // Hydrate user from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token')
      const userStr = localStorage.getItem('user')
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr)
          useUserStore.getState().setAuth(user, token)
        } catch {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
        }
      }
    }
  }, [])

  return (
    <AnimatePresence mode="sync">
      {currentView === 'dashboard' && (
        <motion.div
          key="dashboard"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="min-h-screen"
        >
          <Dashboard />
        </motion.div>
      )}
      {currentView === 'meeting' && (
        <motion.div
          key="meeting"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="min-h-screen"
        >
          <MeetingRoom />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
