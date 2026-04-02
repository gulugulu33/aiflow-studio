import { StateCreator } from 'zustand'
import { User, LoginForm, RegisterForm } from '../../types'
import request from '../../utils/axios'

// 错误类型定义
interface LoginError {
  type: 'VALIDATION' | 'AUTHENTICATION' | 'NETWORK' | 'SERVER' | 'LOCKED';
  message: string;
  details?: any;
}

export interface UserError {
  type: LoginError['type']
  message: string
  details?: any
}

export interface UserSlice {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  authError: UserError | null
  
  // Actions
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  setIsAuthenticated: (value: boolean) => void
  setAuthError: (error: UserError | null) => void
  clearError: () => void
  login: (data: LoginForm) => Promise<void>
  register: (data: RegisterForm) => Promise<void>
  logout: () => void
  fetchProfile: () => Promise<void>
}

/**
 * 解析错误信息
 */
const parseLoginError = (error: any): LoginError => {
  if (!error.response) {
    // 网络错误
    return {
      type: 'NETWORK',
      message: '网络连接失败，请检查网络设置'
    };
  }

  const { status, data } = error.response;
  
  switch (status) {
    case 400:
      return {
        type: 'VALIDATION',
        message: data.message || '请求参数错误'
      };
    
    case 401:
      // 检查是否为账户锁定
      if (data.message?.includes('锁定')) {
        return {
          type: 'LOCKED',
          message: data.message
        };
      }
      return {
        type: 'AUTHENTICATION',
        message: data.message || '用户名或密码错误'
      };
    
    case 409:
      return {
        type: 'VALIDATION',
        message: data.message || '用户名已存在'
      };
    
    case 500:
      return {
        type: 'SERVER',
        message: '服务器内部错误，请稍后重试'
      };
    
    default:
      return {
        type: 'SERVER',
        message: data.message || '未知错误，请稍后重试'
      };
  }
};

export const createUserSlice: StateCreator<UserSlice> = (set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  authError: null,

  setUser: (user) => set({ user }),
  
  setToken: (token) => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
    set({ token, isAuthenticated: !!token })
  },
  
  setIsAuthenticated: (value) => set({ isAuthenticated: value }),

  setAuthError: (authError) => set({ authError }),

  clearError: () => set({ authError: null }),

  login: async (data) => {
    set({ isLoading: true, authError: null })
    
    try {
      // 前端验证
      if (!data.username?.trim()) {
        throw new Error('请输入用户名')
      }
      
      if (!data.password?.trim()) {
        throw new Error('请输入密码')
      }

      const response = await request.post('/users/login', data)
      const { user, token } = response.data as { user: User; token: string }
      
      // 保存到本地存储
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      
      set({ 
        user, 
        token, 
        isAuthenticated: true, 
        isLoading: false, 
        authError: null 
      })
    } catch (error: any) {
      const loginError = parseLoginError(error)
      
      set({ 
        isLoading: false, 
        authError: loginError 
      })
      
      throw loginError
    }
  },

  register: async (data) => {
    set({ isLoading: true, authError: null })
    
    try {
      // 前端验证
      if (!data.username?.trim()) {
        throw new Error('请输入用户名')
      }
      
      if (data.username.length < 3 || data.username.length > 20) {
        throw new Error('用户名长度必须在3-20个字符之间')
      }
      
      if (!data.password?.trim()) {
        throw new Error('请输入密码')
      }
      
      if (data.password.length < 6) {
        throw new Error('密码长度至少为6个字符')
      }

      await request.post('/users/register', data)
      set({ isLoading: false, authError: null })
    } catch (error: any) {
      const loginError = parseLoginError(error)
      
      set({ 
        isLoading: false, 
        authError: loginError 
      })
      
      throw loginError
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ 
      user: null, 
      token: null, 
      isAuthenticated: false, 
      authError: null 
    })
  },

  fetchProfile: async () => {
    try {
      const response = await request.get('/users/profile') as any
      const user = response.data as User
      localStorage.setItem('user', JSON.stringify(user))
      set({ user })
    } catch (error) {
      get().logout()
      throw error
    }
  },
})
