import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#7c3aed',
          colorLink: '#7c3aed',
          colorSuccess: '#059669',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          borderRadius: 8,
          borderRadiusLG: 12,
          borderRadiusSM: 6,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, 'Helvetica Neue', Arial, 'Noto Sans SC', sans-serif",
          fontSize: 14,
          colorBgContainer: '#ffffff',
          colorBgLayout: '#f7f8fa',
          colorBorder: '#e8eaed',
          colorBorderSecondary: '#f0f2f5',
          colorText: '#1c2433',
          colorTextSecondary: '#6b7a99',
          colorTextTertiary: '#a0adc0',
          boxShadow:
            '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
          boxShadowSecondary:
            '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 36,
          },
          Input: {
            borderRadius: 8,
          },
          Select: {
            borderRadius: 8,
          },
          Card: {
            borderRadius: 16,
          },
          Table: {
            borderRadius: 0,
            headerBg: '#f7f8fa',
          },
          Menu: {
            itemBorderRadius: 8,
            itemSelectedBg: '#f3effe',
            itemSelectedColor: '#7c3aed',
            itemHoverBg: '#f7f8fa',
            itemHoverColor: '#1c2433',
            itemActiveBg: '#f3effe',
          },
          Modal: {
            borderRadius: 20,
          },
          Tag: {
            borderRadius: 999,
          },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
)
