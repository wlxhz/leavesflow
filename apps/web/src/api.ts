import { LeavesFlowClient } from '@leavesflow/api-client'
import { Capacitor } from '@capacitor/core'

const devBaseUrl = 'http://127.0.0.1:8000/api/v1'
const productionBaseUrl = '/api/v1'
const nativeBaseUrl = 'https://leavesflow.syt.huickathon.cn/api/v1'
const baseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (Capacitor.isNativePlatform() ? nativeBaseUrl : import.meta.env.DEV ? devBaseUrl : productionBaseUrl)

export const AUTH_TOKEN_STORAGE_KEY = 'leavesflow.authToken.v12'
export const api = new LeavesFlowClient({
  baseUrl,
  token: localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? undefined,
})

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  api.setToken(token)
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  api.setToken('')
}
