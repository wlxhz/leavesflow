export type SkillLevel = '入门' | '进阶' | '熟练'
export type GoalStatus = 'active' | 'completed'
export type TaskStatus = 'pending' | 'completed'

export interface TagOption {
  id: string
  label: string
  promptText: string
  sortOrder: number
}

export interface TagOptionCategory {
  key:
    | 'identity_tags'
    | 'background_tags'
    | 'level_tags'
    | 'goal_type_tags'
    | 'time_range_tags'
    | 'output_preference_tags'
  name: string
  options: TagOption[]
}

export interface TagOptionsResponse {
  categories: TagOptionCategory[]
}

export interface UserTagProfileIds {
  identityTagIds: string[]
  backgroundTagIds: string[]
  levelTagIds: string[]
  goalTypeTagIds: string[]
  timeRangeTagIds: string[]
  outputPreferenceTagIds: string[]
}

export interface SelectedTag {
  id: string
  label: string
  promptText: string
}

export interface UserTagProfile {
  identityTags: SelectedTag[]
  backgroundTags: SelectedTag[]
  levelTags: SelectedTag[]
  goalTypeTags: SelectedTag[]
  timeRangeTags: SelectedTag[]
  outputPreferenceTags: SelectedTag[]
}

export interface SkillTag {
  id: string
  name: string
  level: SkillLevel
  count: number
  prompt: string
  sourceTaskId: string
  sourceGoalId: string
  evidence: string
  updatedAt: string
}

export interface UserAccount {
  id: string
  username: string
  displayName: string
  createdAt: string
}

export interface ActivePlanResponse extends PlanResponse {
  status: GoalStatus
  completedTasks: number
  totalTasks: number
  isComplete: boolean
}

export interface MeResponse {
  userId: string
  user: UserAccount
  tagProfile: UserTagProfile
  skillTags: SkillTag[]
  activePlan?: ActivePlanResponse | null
}

export interface AuthResponse {
  token: string
  user: UserAccount
  tagProfile: UserTagProfile
}

export interface ToolRecommendation {
  name: string
  usage: string
  url: string
}

export interface ResourceRecommendation {
  title: string
  url: string
  description?: string | null
}

export interface TaskNode {
  id: string
  title: string
  description: string
  contextForAI: string
  vibeCodingPrompt: string
  expectedOutput: string
  pathSteps: string[]
  tools: ToolRecommendation[]
  resources: ResourceRecommendation[]
  completionCriteria: string[]
  predictedSkillTags: string[]
  status: TaskStatus
  sortOrder: number
}

export interface Stage {
  id: string
  title: string
  description: string
  sortOrder: number
  tasks: TaskNode[]
}

export interface PlanResponse {
  goalId: string
  goalTitle: string
  goalSummary: string
  stages: Stage[]
}

export interface CreateGoalResponse {
  id: string
  title: string
  rawInput: string
  status: GoalStatus
  profileSnapshot: UserTagProfile
  createdAt: string
}

export interface CheckInResponse {
  checkInId: string
  taskNodeId: string
  newSkillTags: Array<{
    id: string
    name: string
    level: SkillLevel
    prompt: string
    source: string
    reason: string
  }>
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    requestId: string
    details?: unknown
  }
}
