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

function fallbackErrorBody(message: string, code = 'SERVER_RESPONSE_ERROR'): ApiErrorBody {
  return {
    error: {
      code,
      message,
      requestId: '',
      details: null,
    },
  }
}

function parseJsonBody<T>(text: string): T | null {
  const trimmed = text.trim()
  if (!trimmed) {
    return null
  }
  try {
    return JSON.parse(trimmed) as T
  } catch {
    return null
  }
}

function nonJsonErrorMessage(status: number) {
  if (status === 502 || status === 503 || status === 504) {
    return '服务响应超时或暂时不可用，请稍后再试'
  }
  return '服务返回了无法识别的响应，请稍后再试'
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
    const responseText = await response.text()

    if (!response.ok) {
      const body =
        parseJsonBody<ApiErrorBody>(responseText) ??
        fallbackErrorBody(nonJsonErrorMessage(response.status), 'SERVER_NON_JSON_RESPONSE')
      throw new LeavesFlowApiError(body, response.status)
    }
    const body = parseJsonBody<T>(responseText)
    if (body === null) {
      throw new LeavesFlowApiError(
        fallbackErrorBody('服务返回了无法识别的响应，请稍后再试', 'SERVER_NON_JSON_RESPONSE'),
        response.status,
      )
    }
    return body
  }
}
