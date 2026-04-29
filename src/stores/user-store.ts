import { create } from 'zustand'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  role: string
}

interface UserState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  setAuth: (user: User, token: string) => void
  logout: () => void
  updateProfile: (data: Partial<User>) => void
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  setAuth: (user, token) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
    }
    set({ user, token, isAuthenticated: true })
  },
  logout: () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
    }
    set({ user: null, token: null, isAuthenticated: false })
  },
  updateProfile: (data) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...data } : null
    }))
}))
