import { LeavesFlowClient } from '@leavesflow/api-client'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'

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
