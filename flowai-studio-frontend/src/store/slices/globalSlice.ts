import { StateCreator } from 'zustand'

export interface GlobalSlice {
  globalConfig: {
    theme: 'light' | 'dark'
    language: 'zh-CN' | 'en-US'
    sidebarCollapsed: boolean
    autoSave: boolean
  }
  loading: boolean
  message: {
    type: 'success' | 'error' | 'warning' | 'info'
    content: string
    visible: boolean
  }
  
  // Actions
  setGlobalConfig: (config: Partial<GlobalSlice['globalConfig']>) => void
  setLoading: (loading: boolean) => void
  showMessage: (type: 'success' | 'error' | 'warning' | 'info', content: string) => void
  hideMessage: () => void
  toggleSidebar: () => void
}

export const createGlobalSlice: StateCreator<GlobalSlice> = (set, get) => ({
  globalConfig: {
    theme: 'light',
    language: 'zh-CN',
    sidebarCollapsed: false,
    autoSave: true,
  },
  loading: false,
  message: {
    type: 'info',
    content: '',
    visible: false,
  },

  setGlobalConfig: (config) => {
    set({
      globalConfig: {
        ...get().globalConfig,
        ...config,
      },
    })
  },
  
  setLoading: (loading) => set({ loading }),
  
  showMessage: (type, content) => {
    set({
      message: {
        type,
        content,
        visible: true,
      },
    })
    
    // 3秒后自动隐藏
    setTimeout(() => {
      set({ message: { ...get().message, visible: false } })
    }, 3000)
  },
  
  hideMessage: () => set({ message: { ...get().message, visible: false } }),
  
  toggleSidebar: () => {
    set({
      globalConfig: {
        ...get().globalConfig,
        sidebarCollapsed: !get().globalConfig.sidebarCollapsed,
      },
    })
  },
})
