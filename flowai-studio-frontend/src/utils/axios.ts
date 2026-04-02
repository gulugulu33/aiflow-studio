import axios from 'axios'

// 创建axios实例
const request = axios.create({
  baseURL: '/api', // 基础URL，与Vite配置对应
  timeout: 15000, // 请求超时时间
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    // 从localStorage获取token
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // 添加请求时间戳，避免缓存
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now()
      }
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    // 只返回data部分
    return response.data
  },
  (error) => {
    // 处理错误响应
    if (error.response) {
      // 服务器返回错误状态码
      const { status, data } = error.response
      
      switch (status) {
        case 400:
          // 请求参数错误
          error.message = data.message || '请求参数错误'
          break
        
        case 401:
          // 未授权，清除token并跳转到登录页
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          
          // 如果不是登录页面，跳转到登录页
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login'
          }
          error.message = data.message || '登录已过期，请重新登录'
          break
        
        case 403:
          // 禁止访问
          error.message = data.message || '没有权限访问该资源'
          break
        
        case 404:
          // 资源不存在
          error.message = data.message || '请求的资源不存在'
          break
        
        case 409:
          // 资源冲突
          error.message = data.message || '资源已存在'
          break
        
        case 429:
          // 请求过于频繁
          error.message = data.message || '请求过于频繁，请稍后重试'
          break
        
        case 500:
          // 服务器内部错误
          error.message = data.message || '服务器内部错误，请稍后重试'
          break
        
        case 502:
          // 网关错误
          error.message = '网关错误，请稍后重试'
          break
        
        case 503:
          // 服务不可用
          error.message = '服务暂时不可用，请稍后重试'
          break
        
        default:
          // 其他错误
          error.message = data.message || `请求失败 (${status})`
      }
    } else if (error.request) {
      // 请求已发出但没有收到响应
      if (error.code === 'ECONNABORTED') {
        error.message = '请求超时，请检查网络连接'
      } else {
        error.message = '网络错误，请检查网络连接'
      }
    } else {
      // 请求配置出错
      error.message = `请求错误: ${error.message}`
    }
    
    // 统一错误格式
    error.response = error.response || {}
    error.response.data = error.response.data || {}
    error.response.data.message = error.message
    
    return Promise.reject(error)
  }
)

// 添加重试机制
const MAX_RETRY_COUNT = 3
const RETRY_DELAY = 1000

const retryRequest = async (config: any, retryCount = 0): Promise<any> => {
  try {
    return await request(config)
  } catch (error: any) {
    // 只在网络错误或服务器错误时重试
    if (retryCount < MAX_RETRY_COUNT && 
        (!error.response || error.response.status >= 500)) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)))
      return retryRequest(config, retryCount + 1)
    }
    throw error
  }
}

// 导出带重试的请求方法
export const requestWithRetry = retryRequest

export default request