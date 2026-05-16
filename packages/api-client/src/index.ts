import type {
  ActivePlanResponse,
  ApiErrorBody,
  AuthResponse,
  CheckInResponse,
  CreateGoalResponse,
  GoalDetailResponse,
  MeResponse,
  PlanResponse,
  TagOptionsResponse,
  UserTagProfileIds,
  UserTagProfile,
} from '@leavesflow/shared-types'

export class LeavesFlowApiError extends Error {
  code: string
  requestId: string
  details: unknown
  status: number

  constructor(body: ApiErrorBody, status: number) {
    super(body.error.message)
    this.name = 'LeavesFlowApiError'
    this.code = body.error.code
    this.requestId = body.error.requestId
    this.details = body.error.details
    this.status = status
  }
}

export interface LeavesFlowClientOptions {
  baseUrl: string
  token?: string
}

export class LeavesFlowClient {
  private baseUrl: string
  private token: string

  constructor(options: LeavesFlowClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.token = options.token ?? ''
  }

  setToken(token: string) {
    this.token = token
  }

  register(payload: { username: string; password: string; displayName?: string; profile: UserTagProfileIds }) {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      auth: false,
    })
  }

  login(payload: { username: string; password: string }) {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
      auth: false,
    })
  }

  getTagOptions() {
    return this.request<TagOptionsResponse>('/tag-options')
  }

  getMe() {
    return this.request<MeResponse>('/me')
  }

  updateTagProfile(payload: UserTagProfileIds) {
    return this.request<{ tagProfile: UserTagProfile }>('/me/tag-profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  updateMe(payload: { displayName: string }) {
    return this.request<MeResponse>('/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  createGoal(rawInput: string, profileSnapshot?: UserTagProfileIds) {
    return this.request<CreateGoalResponse>('/goals', {
      method: 'POST',
      body: JSON.stringify({ rawInput, profileSnapshot }),
    })
  }

  generatePlan(goalId: string) {
    return this.request<PlanResponse>(`/goals/${goalId}/plan:generate`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
  }

  getPlan(goalId: string) {
    return this.request<PlanResponse>(`/goals/${goalId}/plan`)
  }

  getGoal(goalId: string) {
    return this.request<GoalDetailResponse>(`/goals/${goalId}`)
  }

  getActivePlan() {
    return this.request<ActivePlanResponse>('/me/active-plan')
  }

  createCheckIn(
    taskId: string,
    payload: { whatDone?: string; whatProduced?: string; problems?: string },
  ) {
    return this.request<CheckInResponse>(`/tasks/${taskId}/check-ins`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  private async request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
    const useAuth = init.auth !== false
    const { auth: _auth, ...requestInit } = init
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...requestInit,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(useAuth && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      const body = (await response.json()) as ApiErrorBody
      throw new LeavesFlowApiError(body, response.status)
    }
    return (await response.json()) as T
  }
}
