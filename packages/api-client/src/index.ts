import type {
  ApiErrorBody,
  CheckInResponse,
  CreateGoalResponse,
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

  constructor(body: ApiErrorBody) {
    super(body.error.message)
    this.name = 'LeavesFlowApiError'
    this.code = body.error.code
    this.requestId = body.error.requestId
    this.details = body.error.details
  }
}

export interface LeavesFlowClientOptions {
  baseUrl: string
  token: string
}

export class LeavesFlowClient {
  private baseUrl: string
  private token: string

  constructor(options: LeavesFlowClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.token = options.token
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

  createCheckIn(
    taskId: string,
    payload: { whatDone?: string; whatProduced?: string; problems?: string },
  ) {
    return this.request<CheckInResponse>(`/tasks/${taskId}/check-ins`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      const body = (await response.json()) as ApiErrorBody
      throw new LeavesFlowApiError(body)
    }
    return (await response.json()) as T
  }
}
