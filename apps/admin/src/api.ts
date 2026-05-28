const ADMIN_PASSWORD_KEY = 'leavesflow.admin.password'
const API_BASE = import.meta.env.VITE_ADMIN_API_BASE_URL || '/api/v1/admin'

export type WindowKey = 'oneDay' | 'sevenDays' | 'thirtyDays'

export type Summary = {
  totalUsers: number
  totalGoals: number
  totalTasks: number
  totalCheckIns: number
  totalSkillTags: number
}

export type UserWindow = {
  created: number
  deleted: number
  net: number
}

export type TokenWindow = {
  totalK: number
  generatePlanK: number
  extractSkillsK: number
}

export type UserCounts = {
  goals: number
  tasks: number
  checkIns: number
  skillTags: number
}

export type UserTokenUsage = {
  oneDayK: number
  sevenDaysK: number
  thirtyDaysK: number
  allRecordedK?: number
}

export type RecentUser = {
  id: string
  username: string
  displayName: string
  createdAt: string
  updatedAt: string
  counts: UserCounts
  tokenUsage: UserTokenUsage
}

export type RecentGoal = {
  id: string
  title: string
  status: string
  userId: string
  username: string
  createdAt: string
  updatedAt: string
  totalTasks: number
  completedTasks: number
}

export type RecentCheckIn = {
  id: string
  createdAt: string
  userId: string
  username: string
  goalId: string
  goalTitle: string
  taskNodeId: string
  taskTitle: string
}

export type DashboardData = {
  summary: Summary
  userWindows: Record<WindowKey, UserWindow>
  tokenWindows: Record<WindowKey, TokenWindow>
  recentUsers: RecentUser[]
  recentGoals: RecentGoal[]
  recentCheckIns: RecentCheckIn[]
  systemFeedback: {
    aiBaseUrlConfigured: boolean
    aiApiKeyConfigured: boolean
    tokenUsageTrackingEnabled: boolean
  }
}

export type UserSearchResult = {
  user: {
    id: string
    username: string
    displayName: string
    createdAt: string
    updatedAt: string
  }
  counts: UserCounts
  tokenUsage: Required<UserTokenUsage>
  recentAiUsage: Array<{
    id: string
    createdAt: string
    operation: string
    model: string
    totalK: number
    status: string
    errorCode: string | null
    latencyMs: number | null
  }>
}

export type DeleteUserResult = {
  deletedUserId: string
  username: string
  mode: string
  deletedAt: string
  counts: UserCounts
}

export type UpdateUserPayload = {
  username: string
  displayName: string
}

type ApiErrorBody = {
  error?: {
    code?: string
    message?: string
  }
}

export function getStoredPassword() {
  return sessionStorage.getItem(ADMIN_PASSWORD_KEY) || ''
}

export function storePassword(password: string) {
  sessionStorage.setItem(ADMIN_PASSWORD_KEY, password)
}

export function clearStoredPassword() {
  sessionStorage.removeItem(ADMIN_PASSWORD_KEY)
}

export async function getDashboard(password: string): Promise<DashboardData> {
  return request<DashboardData>('/dashboard', { password })
}

export async function searchUser(password: string, query: string): Promise<UserSearchResult> {
  return request<UserSearchResult>(`/users/search?query=${encodeURIComponent(query)}`, { password })
}

export async function deleteUser(password: string, userId: string, confirm: string): Promise<DeleteUserResult> {
  return request<DeleteUserResult>(`/users/${encodeURIComponent(userId)}`, {
    password,
    method: 'DELETE',
    body: { confirm, mode: 'hard' },
  })
}

export async function updateUser(
  password: string,
  userId: string,
  payload: UpdateUserPayload,
): Promise<RecentUser> {
  return request<RecentUser>(`/users/${encodeURIComponent(userId)}`, {
    password,
    method: 'PATCH',
    body: payload,
  })
}

async function request<T>(
  path: string,
  options: {
    password: string
    method?: string
    body?: unknown
  },
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Password': options.password,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  if (!response.ok) {
    let message = `请求失败：HTTP ${response.status}`
    try {
      const body = (await response.json()) as ApiErrorBody
      message = body.error?.message || body.error?.code || message
    } catch {
      // Keep the HTTP fallback.
    }
    throw new Error(message)
  }
  return response.json() as Promise<T>
}
