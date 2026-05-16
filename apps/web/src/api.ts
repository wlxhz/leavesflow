import { LeavesFlowClient } from '@leavesflow/api-client'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1'
const token = import.meta.env.VITE_DEMO_TOKEN ?? 'dev-demo-token'

export const api = new LeavesFlowClient({ baseUrl, token })
