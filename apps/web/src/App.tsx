import type {
  ActivePlanResponse,
  CheckInResponse,
  GoalDetailResponse,
  GoalHistoryItem,
  MeResponse,
  PlanResponse,
  SkillTag,
  TagOptionCategory,
  UserTagProfileIds,
} from '@leavesflow/shared-types'
import { LeavesFlowApiError } from '@leavesflow/api-client'
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  Flag,
  Leaf,
  Loader2,
  LogOut,
  Map,
  MapPin,
  PenLine,
  Route,
  Settings,
  Sparkles,
  Tags,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { AUTH_TOKEN_STORAGE_KEY, api, clearAuthToken, setAuthToken } from './api'

type ViewKey = 'goal' | 'plan' | 'skills' | 'user' | 'history'
type AuthMode = 'login' | 'register'
type RouteTask = PlanResponse['stages'][number]['tasks'][number] & { stageTitle: string }
type RecommendationKind = 'tool' | 'resource' | 'collaborator'

declare global {
  interface Window {
    LeavesFlowNative?: {
      openExternalUrl?: (payload: { url: string; title?: string; kind?: RecommendationKind }) => void
    }
  }
}

const emptyProfile: UserTagProfileIds = {
  identityTagIds: [],
  backgroundTagIds: [],
  levelTagIds: [],
  goalTypeTagIds: [],
  timeRangeTagIds: [],
  outputPreferenceTagIds: [],
}

const categoryToField: Record<TagOptionCategory['key'], keyof UserTagProfileIds> = {
  identity_tags: 'identityTagIds',
  background_tags: 'backgroundTagIds',
  level_tags: 'levelTagIds',
  goal_type_tags: 'goalTypeTagIds',
  time_range_tags: 'timeRangeTagIds',
  output_preference_tags: 'outputPreferenceTagIds',
}

const baseCategoryKeys: TagOptionCategory['key'][] = ['identity_tags', 'background_tags', 'level_tags']
const goalCategoryKeys: TagOptionCategory['key'][] = [
  'goal_type_tags',
  'time_range_tags',
  'output_preference_tags',
]

const inputGuidance = '写下你真正想推进的事。可以很短，也可以补充背景、交付物或截止时间。'
const historyDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function errorMessage(err: unknown, fallback: string) {
  if (err instanceof LeavesFlowApiError) {
    const details = err.details as { upstreamStatus?: number; upstreamBody?: string } | undefined
    const upstream = details?.upstreamStatus ? `（上游 HTTP ${details.upstreamStatus}）` : ''
    return `${err.message}${upstream}`
  }
  return err instanceof Error ? err.message : fallback
}

function compactText(value: string, maxLength = 46) {
  const text = value.trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function formatDateTime(value: string) {
  try {
    return historyDateFormatter.format(new Date(value))
  } catch {
    return value
  }
}

function getAllTasks(plan: PlanResponse | ActivePlanResponse): RouteTask[] {
  return plan.stages.flatMap((stage) => stage.tasks.map((task) => ({ ...task, stageTitle: stage.title })))
}

function isValidHttpUrl(url: string) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function openRecommendationUrl(url: string, title: string, kind: RecommendationKind) {
  if (!isValidHttpUrl(url)) {
    return
  }

  const mobileBridge = window.LeavesFlowNative?.openExternalUrl
  if (mobileBridge) {
    mobileBridge({ url, title, kind })
    return
  }

  window.location.assign(url)
}

function profileFromMe(meData: MeResponse): UserTagProfileIds {
  return {
    identityTagIds: meData.tagProfile.identityTags.map((tag) => tag.id),
    backgroundTagIds: meData.tagProfile.backgroundTags.map((tag) => tag.id),
    levelTagIds: meData.tagProfile.levelTags.map((tag) => tag.id),
    goalTypeTagIds: meData.tagProfile.goalTypeTags.map((tag) => tag.id),
    timeRangeTagIds: meData.tagProfile.timeRangeTags.map((tag) => tag.id),
    outputPreferenceTagIds: meData.tagProfile.outputPreferenceTags.map((tag) => tag.id),
  }
}

function selectedCount(profile: UserTagProfileIds, keys: TagOptionCategory['key'][] = Object.keys(categoryToField) as TagOptionCategory['key'][]) {
  return keys.reduce((sum, key) => sum + profile[categoryToField[key]].length, 0)
}

function mergeGoalProfile(baseProfile: UserTagProfileIds, goalProfile: UserTagProfileIds): UserTagProfileIds {
  return {
    identityTagIds: baseProfile.identityTagIds,
    backgroundTagIds: baseProfile.backgroundTagIds,
    levelTagIds: baseProfile.levelTagIds,
    goalTypeTagIds: goalProfile.goalTypeTagIds,
    timeRangeTagIds: goalProfile.timeRangeTagIds,
    outputPreferenceTagIds: goalProfile.outputPreferenceTagIds,
  }
}

export function App() {
  const [view, setView] = useState<ViewKey>('goal')
  const [authMode, setAuthMode] = useState<AuthMode>('register')
  const [tagCategories, setTagCategories] = useState<TagOptionCategory[]>([])
  const [baseProfile, setBaseProfile] = useState<UserTagProfileIds>(emptyProfile)
  const [goalProfile, setGoalProfile] = useState<UserTagProfileIds>(emptyProfile)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [rawInput, setRawInput] = useState('')
  const [plan, setPlan] = useState<ActivePlanResponse | PlanResponse | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({})
  const [checkInTaskId, setCheckInTaskId] = useState<string | null>(null)
  const [checkInText, setCheckInText] = useState({ whatDone: '', whatProduced: '', problems: '' })
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [generatingPlan, setGeneratingPlan] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [historyItems, setHistoryItems] = useState<GoalHistoryItem[]>([])
  const [historyDetail, setHistoryDetail] = useState<GoalDetailResponse | null>(null)
  const [historyLoadingGoalId, setHistoryLoadingGoalId] = useState<string | null>(null)
  const [historyExpandedGoalId, setHistoryExpandedGoalId] = useState<string | null>(null)

  useEffect(() => {
    void bootstrap()
  }, [])

  async function bootstrap() {
    setLoading(true)
    setError('')
    try {
      const tagOptions = await api.getTagOptions()
      setTagCategories(tagOptions.categories)
      if (!localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)) {
        setMe(null)
        setPlan(null)
        return
      }
      const meData = await api.getMe()
      applyMeState(meData)
    } catch {
      try {
        const tagOptions = await api.getTagOptions()
        setTagCategories(tagOptions.categories)
      } catch {
        setTagCategories([])
      }
      setMe(null)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  function applyMeState(meData: MeResponse, options: { preserveView?: boolean } = {}) {
    const profile = profileFromMe(meData)
    setMe(meData)
    setBaseProfile(profile)
    setGoalProfile(profile)
    setHistoryItems(meData.goalHistory ?? [])
    if (meData.activePlan) {
      setPlan(meData.activePlan)
      if (!options.preserveView) {
        setView('plan')
      }
      const firstPending = getAllTasks(meData.activePlan).find((task) => task.status !== 'completed')
      setActiveTaskId(firstPending?.id ?? meData.activePlan.stages[0]?.tasks[0]?.id ?? null)
    }
  }

  const completedCount = useMemo(
    () => plan?.stages.flatMap((stage) => stage.tasks).filter((task) => task.status === 'completed').length ?? 0,
    [plan],
  )
  const totalTasks = useMemo(() => plan?.stages.flatMap((stage) => stage.tasks).length ?? 0, [plan])
  const baseCategories = useMemo(
    () => tagCategories.filter((category) => baseCategoryKeys.includes(category.key)),
    [tagCategories],
  )
  const goalCategories = useMemo(
    () => tagCategories.filter((category) => goalCategoryKeys.includes(category.key)),
    [tagCategories],
  )

  function selectTag(
    target: 'base' | 'goal',
    category: TagOptionCategory,
    optionId: string,
  ) {
    const field = categoryToField[category.key]
    const setter = target === 'base' ? setBaseProfile : setGoalProfile
    setter((current) => ({
      ...current,
      [field]: current[field][0] === optionId ? [] : [optionId],
    }))
  }

  async function handleAuth(payload: {
    mode: AuthMode
    username: string
    password: string
    displayName?: string
  }) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result =
        payload.mode === 'register'
          ? await api.register({
              username: payload.username,
              password: payload.password,
              displayName: payload.displayName,
              profile: baseProfile,
            })
          : await api.login({ username: payload.username, password: payload.password })
      setAuthToken(result.token)
      const meData = await api.getMe()
      applyMeState(meData)
      setMessage(payload.mode === 'register' ? '注册完成，账号和画像已保存。' : '欢迎回来，已恢复你的任务状态。')
      setView(meData.activePlan ? 'plan' : 'goal')
    } catch (err) {
      setError(errorMessage(err, '账号操作失败'))
    } finally {
      setLoading(false)
    }
  }

  async function saveBaseProfile() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.updateTagProfile(baseProfile)
      const meData = await api.getMe()
      applyMeState(meData)
      setMessage('基础画像已更新，后续任务会沿用这些信息。')
    } catch (err) {
      setError(errorMessage(err, '保存画像失败'))
    } finally {
      setLoading(false)
    }
  }

  async function updateDisplayName(displayName: string) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const meData = await api.updateMe({ displayName })
      applyMeState(meData)
      setMessage('账号信息已保存。')
    } catch (err) {
      setError(errorMessage(err, '保存账号信息失败'))
    } finally {
      setLoading(false)
    }
  }

  async function refreshActivePlan() {
    setLoading(true)
    setError('')
    try {
      const activePlan = await api.getActivePlan()
      setPlan(activePlan)
      const firstPending = getAllTasks(activePlan).find((task) => task.status !== 'completed')
      setActiveTaskId(firstPending?.id ?? activePlan.stages[0]?.tasks[0]?.id ?? null)
      setView('plan')
    } catch (err) {
      setPlan(null)
      setMessage(errorMessage(err, '当前没有未完成任务路径。'))
    } finally {
      setLoading(false)
    }
  }

  async function refreshHistory() {
    setLoading(true)
    setError('')
    try {
      const meData = await api.getMe()
      applyMeState(meData, { preserveView: true })
      setMessage('历史路径已更新。')
    } catch (err) {
      setError(errorMessage(err, '刷新历史路径失败'))
    } finally {
      setLoading(false)
    }
  }

  async function openHistoryGoal(goalId: string) {
    setHistoryLoadingGoalId(goalId)
    setError('')
    try {
      const detail = await api.getGoal(goalId)
      setHistoryDetail(detail)
      setHistoryExpandedGoalId(goalId)
      setView('history')
    } catch (err) {
      setError(errorMessage(err, '加载路径历史失败'))
    } finally {
      setHistoryLoadingGoalId(null)
    }
  }

  function closeHistoryDetail() {
    setHistoryDetail(null)
    setHistoryExpandedGoalId(null)
  }

  function openHistoryList() {
    setHistoryDetail(null)
    setHistoryExpandedGoalId(null)
    setView('history')
  }

  function backToUserFromHistory() {
    setHistoryDetail(null)
    setHistoryExpandedGoalId(null)
    setView('user')
  }

  async function createAndGenerateGoal() {
    const text = rawInput.trim()
    if (!text) {
      setError('请先输入一个目标')
      return
    }
    if (selectedCount(goalProfile, goalCategoryKeys) !== goalCategoryKeys.length) {
      setError('请先选择目标类型、时间周期和输出偏好')
      return
    }
    setLoading(true)
    setGeneratingPlan(true)
    setError('')
    setMessage('LeavesFlow 正在把目标拆成适合 Vibe Coding 的路径。')
    setPlan(null)
    setActiveTaskId(null)
    setView('plan')
    try {
      const snapshot = mergeGoalProfile(baseProfile, goalProfile)
      const goal = await api.createGoal(text, snapshot)
      const generated = await api.generatePlan(goal.id)
      setPlan(generated)
      setActiveTaskId(generated.stages[0]?.tasks[0]?.id ?? null)
      setMessage('任务路径已生成，可以从第一步开始。')
      const meData = await api.getMe()
      applyMeState(meData)
    } catch (err) {
      setError(errorMessage(err, '生成任务路径失败'))
    } finally {
      setGeneratingPlan(false)
      setLoading(false)
    }
  }

  async function submitCheckIn(taskId: string) {
    setLoading(true)
    setError('')
    try {
      const result: CheckInResponse = await api.createCheckIn(taskId, {
        whatDone: checkInText.whatDone || undefined,
        whatProduced: checkInText.whatProduced || undefined,
        problems: checkInText.problems || undefined,
      })
      const refreshedPlan = plan ? await api.getPlan(plan.goalId) : null
      if (refreshedPlan) {
        setPlan(refreshedPlan)
        const nextPending = getAllTasks(refreshedPlan).find((task) => task.status !== 'completed')
        setActiveTaskId(nextPending?.id ?? taskId)
      }
      const meData = await api.getMe()
      applyMeState(meData)
      setCheckInTaskId(null)
      setCheckInText({ whatDone: '', whatProduced: '', problems: '' })
      setMessage(`已沉淀 ${result.newSkillTags.length} 张能力 Prompt 卡片。`)
    } catch (err) {
      setError(errorMessage(err, '打卡失败'))
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    clearAuthToken()
      setMe(null)
      setPlan(null)
      setHistoryItems([])
      setHistoryDetail(null)
      setHistoryExpandedGoalId(null)
      setRawInput('')
      setMessage('已退出登录。')
      setError('')
      setView('goal')
    }

  if (!me) {
    return (
      <div className="min-h-screen pb-8 text-ink">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
          {(message || error) && <Notice message={message} error={error} />}
          <AuthPanel
            mode={authMode}
            setMode={setAuthMode}
            categories={baseCategories}
            profile={baseProfile}
            expandedTags={expandedTags}
            onExpand={(id) => setExpandedTags((current) => ({ ...current, [id]: !current[id] }))}
            onSelect={(category, optionId) => selectTag('base', category, optionId)}
            onSubmit={handleAuth}
            loading={loading}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-28 text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        {(message || error) && <Notice message={message} error={error} />}

        {view === 'goal' && (
          <GoalPanel
            categories={goalCategories}
            profile={goalProfile}
            expandedTags={expandedTags}
            rawInput={rawInput}
            setRawInput={setRawInput}
            onExpand={(id) => setExpandedTags((current) => ({ ...current, [id]: !current[id] }))}
            onSelect={(category, optionId) => selectTag('goal', category, optionId)}
            onGenerate={createAndGenerateGoal}
            loading={loading}
          />
        )}

        {view === 'plan' && (
          <PlanPanel
            plan={plan}
            loading={loading}
            generatingPlan={generatingPlan}
            activeTaskId={activeTaskId}
            setActiveTaskId={setActiveTaskId}
            checkInTaskId={checkInTaskId}
            setCheckInTaskId={setCheckInTaskId}
            checkInText={checkInText}
            setCheckInText={setCheckInText}
            onCheckIn={submitCheckIn}
            onRefresh={refreshActivePlan}
          />
        )}

        {view === 'skills' && (
          <SkillPanel
            skills={me.skillTags}
            onRefresh={bootstrap}
            loading={loading}
            selectedSkillId={selectedSkillId}
            setSelectedSkillId={setSelectedSkillId}
          />
        )}

        {view === 'user' && (
          <UserPanel
            me={me}
            categories={baseCategories}
            profile={baseProfile}
            expandedTags={expandedTags}
            historyItems={historyItems}
            historyDetail={historyDetail}
            historyExpandedGoalId={historyExpandedGoalId}
            historyLoadingGoalId={historyLoadingGoalId}
            loading={loading}
            onExpand={(id) => setExpandedTags((current) => ({ ...current, [id]: !current[id] }))}
            onSelect={(category, optionId) => selectTag('base', category, optionId)}
            onSaveProfile={saveBaseProfile}
            onRefreshHistory={refreshHistory}
            onOpenHistoryGoal={openHistoryGoal}
            onCloseHistoryDetail={closeHistoryDetail}
            onViewAllHistory={openHistoryList}
            onLogout={logout}
          />
        )}

        {view === 'history' && (
          <HistoryPage
            historyItems={historyItems}
            historyDetail={historyDetail}
            historyExpandedGoalId={historyExpandedGoalId}
            historyLoadingGoalId={historyLoadingGoalId}
            loading={loading}
            onRefreshHistory={refreshHistory}
            onOpenHistoryGoal={openHistoryGoal}
            onCloseHistoryDetail={closeHistoryDetail}
            onBackToUser={backToUserFromHistory}
          />
        )}
      </div>
      <BottomNav view={view} onViewChange={setView} completedCount={completedCount} totalTasks={totalTasks} />
    </div>
  )
}

function Notice({ message, error }: { message: string; error: string }) {
  return (
    <div
      className={`rounded-[20px] border px-4 py-3 text-sm shadow-soft ${
        error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-leaf/20 bg-white/80 text-ink'
      }`}
    >
      {error || message}
    </div>
  )
}

function BottomNav({
  view,
  onViewChange,
  completedCount,
  totalTasks,
}: {
  view: ViewKey
  onViewChange: (view: ViewKey) => void
  completedCount: number
  totalTasks: number
}) {
  const navView = view === 'history' ? 'user' : view
  const items: Array<{ key: Exclude<ViewKey, 'history'>; label: string; icon: typeof PenLine }> = [
    { key: 'goal', label: '目标', icon: PenLine },
    { key: 'plan', label: '路径', icon: Route },
    { key: 'skills', label: '技能', icon: Sparkles },
    { key: 'user', label: '用户', icon: UserRound },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-3 z-50 px-3">
      <div className="paper-texture mx-auto w-full max-w-[560px] rounded-[24px] border border-line/90 bg-white/92 p-2 shadow-paper backdrop-blur">
        <div className="grid grid-cols-4 gap-1">
          {items.map((item) => {
            const Icon = item.icon
            const active = navView === item.key
            return (
              <button
                key={item.key}
                className={`soft-focus-ring flex min-w-0 items-center justify-center gap-1 rounded-[18px] px-1 py-2 text-[11px] font-black leading-tight transition sm:gap-2 sm:text-sm ${
                  active ? 'bg-ink text-white shadow-soft' : 'text-ink/62 hover:bg-white/80 hover:text-ink'
                }`}
                onClick={() => onViewChange(item.key)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/85">
          <div
            className="h-full rounded-full bg-leaf transition-all"
            style={{ width: totalTasks ? `${Math.round((completedCount / totalTasks) * 100)}%` : '8%' }}
          />
        </div>
      </div>
    </nav>
  )
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2 text-leaf">
      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-mint">
        <Leaf size={20} />
      </div>
      <span className="text-xs font-black uppercase tracking-[0.18em]">LeavesFlow</span>
    </div>
  )
}

function AuthPanel({
  mode,
  setMode,
  categories,
  profile,
  expandedTags,
  onExpand,
  onSelect,
  onSubmit,
  loading,
}: {
  mode: AuthMode
  setMode: (mode: AuthMode) => void
  categories: TagOptionCategory[]
  profile: UserTagProfileIds
  expandedTags: Record<string, boolean>
  onExpand: (id: string) => void
  onSelect: (category: TagOptionCategory, optionId: string) => void
  onSubmit: (payload: { mode: AuthMode; username: string; password: string; displayName?: string }) => void
  loading: boolean
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const registerReady = selectedCount(profile, baseCategoryKeys) === baseCategoryKeys.length

  return (
    <main className="grid gap-4 lg:grid-cols-[0.84fr_1.16fr]">
      <section className="rounded-[26px] border border-line bg-white/84 p-5 shadow-paper sm:p-6">
        <BrandMark />
        <h1 className="mt-6 text-3xl font-black sm:text-4xl">{mode === 'register' ? '创建你的任务资产库' : '回到你的任务路径'}</h1>
        <p className="mt-3 text-sm leading-6 text-ink/64">
          注册后，画像、任务路径、打卡记录和能力 Prompt 都会保存在本地数据库里。
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-2xl border border-line bg-paper/70 p-1">
          {(['login', 'register'] as AuthMode[]).map((item) => (
            <button
              key={item}
              className={`soft-focus-ring rounded-xl px-4 py-2 text-sm font-black ${
                mode === item ? 'bg-ink text-white shadow-soft' : 'text-ink/62 hover:bg-white/70'
              }`}
              onClick={() => setMode(item)}
            >
              {item === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-3">
          {mode === 'register' && (
            <input
              className="soft-focus-ring rounded-2xl border border-line bg-paper/70 px-4 py-3 text-sm"
              placeholder="昵称"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          )}
          <input
            className="soft-focus-ring rounded-2xl border border-line bg-paper/70 px-4 py-3 text-sm"
            placeholder="用户名：英文、数字、_ 或 -"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <input
            className="soft-focus-ring rounded-2xl border border-line bg-paper/70 px-4 py-3 text-sm"
            placeholder="密码，至少 6 位"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <button
          className="soft-focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading || !username.trim() || !password.trim() || (mode === 'register' && !registerReady)}
          onClick={() => onSubmit({ mode, username, password, displayName })}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {mode === 'register' ? '注册并进入' : '登录'}
        </button>
      </section>

      {mode === 'register' && (
        <section className="rounded-[26px] border border-line bg-white/78 p-4 shadow-paper sm:p-5">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Tags size={18} className="text-leaf" />
            注册时选择基础画像
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink/64">
            身份、专业背景、能力阶段只在用户层保存，后续任务会自动沿用。
          </p>
          <TagCategoryList
            categories={categories}
            profile={profile}
            expandedTags={expandedTags}
            onExpand={onExpand}
            onSelect={onSelect}
          />
        </section>
      )}
    </main>
  )
}

function TagCategoryList({
  categories,
  profile,
  expandedTags,
  onExpand,
  onSelect,
  compact = false,
}: {
  categories: TagOptionCategory[]
  profile: UserTagProfileIds
  expandedTags: Record<string, boolean>
  onExpand: (id: string) => void
  onSelect: (category: TagOptionCategory, optionId: string) => void
  compact?: boolean
}) {
  return (
    <div className="mt-4 grid gap-3">
      {categories.map((category) => {
        const field = categoryToField[category.key]
        return (
          <div key={category.key} className="rounded-[22px] border border-line bg-white/66 p-3">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-black">
              <Tags size={16} className="text-leaf" />
              {category.name}
            </h3>
            <div className={`grid gap-2 ${compact ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
              {category.options.map((option) => {
                const selected = profile[field].includes(option.id)
                const expanded = expandedTags[option.id]
                return (
                  <div
                    key={option.id}
                    className={`overflow-hidden rounded-2xl border transition ${
                      selected ? 'border-leaf bg-mint/72 shadow-soft' : 'border-line bg-paper/70 hover:border-leaf/45'
                    }`}
                  >
                    <div className="flex min-h-[46px] items-center gap-1 px-2 py-1.5">
                      <button
                        className="soft-focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-black"
                        onClick={() => onSelect(category, option.id)}
                        aria-pressed={selected}
                        aria-label={`${selected ? '取消选择' : '选择'}${option.label}`}
                      >
                        {selected ? (
                          <CheckCircle2 className="shrink-0 text-leaf" size={17} />
                        ) : (
                          <Circle className="shrink-0 text-ink/30" size={17} />
                        )}
                        <span className="truncate">{option.label}</span>
                      </button>
                      <button
                        className="soft-focus-ring shrink-0 rounded-xl p-2 text-ink/55 hover:bg-white/85"
                        onClick={() => onExpand(option.id)}
                        aria-label="展开标签封装"
                      >
                        <ChevronDown className={expanded ? 'rotate-180 transition' : 'transition'} size={17} />
                      </button>
                    </div>
                    {expanded && (
                      <p className="border-t border-line/70 bg-white/62 px-3 py-3 text-xs leading-5 text-ink/70">
                        {option.promptText}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function GoalPanel({
  categories,
  profile,
  expandedTags,
  rawInput,
  setRawInput,
  onExpand,
  onSelect,
  onGenerate,
  loading,
}: {
  categories: TagOptionCategory[]
  profile: UserTagProfileIds
  expandedTags: Record<string, boolean>
  rawInput: string
  setRawInput: (value: string) => void
  onExpand: (id: string) => void
  onSelect: (category: TagOptionCategory, optionId: string) => void
  onGenerate: () => void
  loading: boolean
}) {
  return (
    <main className="grid gap-4">
      <section className="rounded-[26px] border border-line bg-white/82 p-4 shadow-paper sm:p-6">
        <BrandMark />
        <h1 className="mt-5 text-3xl font-black sm:text-4xl">今天想完成什么？</h1>
        <p className="mt-2 text-sm leading-6 text-ink/64">直接写事情本身就好，长一点也可以。</p>
        <textarea
          className="soft-focus-ring mt-5 min-h-56 w-full resize-none rounded-[22px] border border-line bg-paper/70 p-5 text-lg leading-8 text-ink placeholder:text-ink/34 shadow-inner"
          maxLength={1000}
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder={inputGuidance}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/58">
          <span>{rawInput.length}/1000</span>
          <span>写清楚想完成的事，LeavesFlow 会拆成可执行步骤。</span>
        </div>
        <div className="mt-5 rounded-[24px] border border-line bg-white/68 p-4">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Settings size={18} className="text-leaf" />
            本次任务设置
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink/64">选择本次目标的类型、时间和输出偏好，基础画像会自动带入。</p>
          <TagCategoryList
            categories={categories}
            profile={profile}
            expandedTags={expandedTags}
            onExpand={onExpand}
            onSelect={onSelect}
            compact
          />
        </div>
        <button
          className="soft-focus-ring mt-6 inline-flex items-center gap-2 rounded-2xl bg-peach px-6 py-3 text-sm font-black text-ink shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onGenerate}
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          生成任务路径
        </button>
      </section>
    </main>
  )
}

function PlanPanel({
  plan,
  loading,
  generatingPlan,
  activeTaskId,
  setActiveTaskId,
  checkInTaskId,
  setCheckInTaskId,
  checkInText,
  setCheckInText,
  onCheckIn,
  onRefresh,
}: {
  plan: PlanResponse | ActivePlanResponse | null
  loading: boolean
  generatingPlan: boolean
  activeTaskId: string | null
  setActiveTaskId: (id: string) => void
  checkInTaskId: string | null
  setCheckInTaskId: (id: string | null) => void
  checkInText: { whatDone: string; whatProduced: string; problems: string }
  setCheckInText: (value: { whatDone: string; whatProduced: string; problems: string }) => void
  onCheckIn: (taskId: string) => void
  onRefresh: () => void
}) {
  const allTasks = plan ? getAllTasks(plan) : []
  const activeTask = allTasks.find((task) => task.id === activeTaskId) ?? allTasks.find((task) => task.status !== 'completed') ?? allTasks[0]
  const activeIndex = activeTask ? allTasks.findIndex((task) => task.id === activeTask.id) : -1

  if (generatingPlan) {
    return <GeneratingPlanPanel />
  }

  if (!plan) {
    return (
      <main className="rounded-[28px] border border-line bg-white/80 p-8 text-center shadow-paper">
        <Map className="mx-auto text-leaf" size={34} />
        <h2 className="mt-4 text-2xl font-black">还没有未完成任务路径</h2>
        <p className="mt-2 text-ink/65">生成路径后会持久化保存；刷新页面也会自动恢复未完成内容。</p>
        <button
          className="soft-focus-ring mt-5 inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-5 py-3 text-sm font-black"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" size={17} /> : <Route size={17} />}
          恢复未完成路径
        </button>
      </main>
    )
  }

  return (
    <main className="grid gap-4">
      <section className="rounded-[26px] border border-line bg-white/82 p-4 shadow-paper sm:p-6">
        <BrandMark />
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-leaf">{plan.goalTitle}</p>
            <h1 className="mt-1 text-2xl font-black">任务导航</h1>
          </div>
          <span className="rounded-full bg-mint px-3 py-1 text-xs font-black text-leaf">
            {activeIndex + 1 > 0 ? `${activeIndex + 1}/${allTasks.length}` : `0/${allTasks.length}`}
          </span>
        </div>
        <p className="mt-3 max-w-4xl text-base leading-8 text-ink/72">{compactText(plan.goalSummary, 140)}</p>
        <div className="mt-6 grid gap-6">
          {plan.stages.map((stage) => (
            <div key={stage.id} className="relative">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-ink/72">
                <Flag size={15} className="text-leaf" />
                {stage.title}
              </h2>
              <div className="relative grid gap-4 pl-8 before:absolute before:left-[15px] before:top-2 before:h-[calc(100%-8px)] before:w-px before:bg-leaf/24">
                {stage.tasks.map((task) => (
                  <RouteTaskNode
                    key={task.id}
                    task={{ ...task, stageTitle: stage.title }}
                    expanded={activeTask?.id === task.id}
                    checkInTaskId={checkInTaskId}
                    checkInText={checkInText}
                    loading={loading}
                    setCheckInTaskId={setCheckInTaskId}
                    setCheckInText={setCheckInText}
                    onCheckIn={onCheckIn}
                    onSelect={() => setActiveTaskId(task.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

function GeneratingPlanPanel() {
  const steps = ['读取目标', '注入画像', '拆解阶段', '生成节点']

  return (
    <main className="rounded-[28px] border border-line bg-white/80 p-6 text-center shadow-paper sm:p-10">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border border-leaf/30 bg-mint/70 shadow-soft">
        <Loader2 className="animate-spin text-leaf" size={38} />
      </div>
      <h2 className="mt-5 text-2xl font-black">正在生成适合 Vibe Coding 的任务路径</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/65">
        LeavesFlow 正在把你的目标、基础画像和本次任务设置转成可执行、可打卡、可验证的任务导航。
      </p>
      <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step}
            className="generation-step rounded-2xl border border-line bg-paper/70 px-3 py-4 text-sm font-black text-ink/72"
            style={{ animationDelay: `${index * 180}ms` }}
          >
            <span className="mx-auto mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-mint text-xs text-leaf">
              {index + 1}
            </span>
            {step}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-6 h-2 max-w-lg overflow-hidden rounded-full bg-line/70">
        <div className="generation-bar h-full rounded-full bg-leaf" />
      </div>
    </main>
  )
}

function RouteTaskNode({
  task,
  expanded,
  checkInTaskId,
  checkInText,
  loading,
  setCheckInTaskId,
  setCheckInText,
  onCheckIn,
  onSelect,
}: {
  task: RouteTask
  expanded: boolean
  checkInTaskId: string | null
  checkInText: { whatDone: string; whatProduced: string; problems: string }
  loading: boolean
  setCheckInTaskId: (id: string | null) => void
  setCheckInText: (value: { whatDone: string; whatProduced: string; problems: string }) => void
  onCheckIn: (taskId: string) => void
  onSelect: () => void
}) {
  return (
    <article className="relative">
      <span
        className={`absolute -left-[38px] top-4 flex h-9 w-9 items-center justify-center rounded-[18px] border shadow-soft ${
          task.status === 'completed'
            ? 'border-leaf bg-leaf text-white'
            : expanded
              ? 'border-leaf bg-white text-leaf'
              : 'border-line bg-white text-ink/45'
        }`}
      >
        {task.status === 'completed' ? <CheckCircle2 size={17} /> : <Leaf size={17} />}
      </span>

      <div
        className={`rounded-[24px] border transition ${
          expanded ? 'border-leaf bg-white/90 shadow-paper' : 'border-line bg-paper/70 hover:border-leaf/45'
        }`}
      >
        <button
          className="soft-focus-ring flex w-full items-start justify-between gap-3 rounded-[24px] px-4 py-4 text-left sm:px-5"
          onClick={onSelect}
          aria-label={expanded ? `当前节点：${task.title}` : `查看${task.title}`}
          aria-expanded={expanded}
        >
          <span className="min-w-0">
            <span className="block text-lg font-black leading-7">{task.title}</span>
            <span className="mt-1 block text-sm leading-6 text-ink/66">
              {expanded ? compactText(task.description || task.expectedOutput, 96) : compactText(task.expectedOutput, 64)}
            </span>
          </span>
          <MapPin className="mt-1 shrink-0 text-leaf/72" size={18} />
        </button>

        {expanded && (
          <div className="grid gap-4 border-t border-line/70 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black">
              <span className="rounded-full bg-mint px-3 py-1 text-leaf">{task.stageTitle}</span>
              {task.predictedSkillTags.map((tag) => (
                <span key={tag} className="rounded-full bg-butter/55 px-3 py-1 text-ink/72">
                  {tag}
                </span>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
              <InfoBlock title="这一站要产出" content={task.expectedOutput} />
              <InfoBlock title="可复制给 AI" content={task.vibeCodingPrompt} copyable compact />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <ListBlock title="路线动作" items={task.pathSteps.slice(0, 4)} />
              <ListBlock title="完成标准" items={task.completionCriteria} />
            </div>

            {(task.tools.length > 0 || task.resources.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {task.tools.map((tool) => (
                  <RecommendationLink
                    key={tool.name}
                    title={tool.name}
                    description={tool.usage}
                    url={tool.url}
                    kind="tool"
                  />
                ))}
                {task.resources.map((resource) => (
                  <RecommendationLink
                    key={resource.title}
                    title={resource.title}
                    description={resource.description ?? '推荐资源'}
                    url={resource.url}
                    kind="resource"
                  />
                ))}
              </div>
            )}

            {task.status === 'completed' ? (
              <div className="rounded-2xl bg-mint/70 p-4 font-black text-leaf">这个节点已经完成打卡。</div>
            ) : checkInTaskId === task.id ? (
              <CheckInForm
                value={checkInText}
                setValue={setCheckInText}
                onCancel={() => setCheckInTaskId(null)}
                onSubmit={() => onCheckIn(task.id)}
                loading={loading}
              />
            ) : (
              <button
                className="soft-focus-ring inline-flex w-fit items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-soft"
                onClick={() => setCheckInTaskId(task.id)}
              >
                <CheckCircle2 size={18} />
                打卡完成
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function RecommendationLink({
  title,
  description,
  url,
  kind,
}: {
  title: string
  description: string
  url: string
  kind: RecommendationKind
}) {
  const validUrl = isValidHttpUrl(url)

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (!validUrl) {
      event.preventDefault()
      return
    }

    if (window.LeavesFlowNative?.openExternalUrl) {
      event.preventDefault()
      openRecommendationUrl(url, title, kind)
    }
  }

  return (
    <a
      className={`soft-focus-ring group flex min-h-[84px] items-start justify-between gap-3 rounded-2xl border p-3 text-sm transition ${
        validUrl
          ? 'border-line bg-paper/70 hover:border-leaf hover:bg-white/82'
          : 'pointer-events-none border-line/70 bg-paper/45 text-ink/45'
      }`}
      href={validUrl ? url : '#'}
      onClick={handleClick}
      aria-disabled={!validUrl}
      data-recommendation-kind={kind}
      data-open-mode="in-app-or-native-browser"
    >
      <span className="min-w-0">
        <span className="block font-black text-ink">{title}</span>
        <span className="mt-1 block leading-5 text-ink/65">{compactText(description, 58)}</span>
      </span>
      <ExternalLink className="mt-0.5 shrink-0 text-leaf/75 transition group-hover:translate-x-0.5" size={17} />
    </a>
  )
}

function InfoBlock({
  title,
  content,
  copyable = false,
  compact = false,
}: {
  title: string
  content: string
  copyable?: boolean
  compact?: boolean
}) {
  async function copy() {
    await navigator.clipboard.writeText(content)
  }
  return (
    <div className="rounded-[20px] border border-line bg-paper/72 p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="font-black">{title}</h3>
        {copyable && (
          <button className="soft-focus-ring rounded-xl p-2 hover:bg-white" onClick={copy} aria-label="复制内容">
            <Clipboard size={17} />
          </button>
        )}
      </div>
      <p className={`whitespace-pre-wrap text-sm text-ink/72 ${compact ? 'line-clamp-6 leading-6' : 'leading-7'}`}>
        {content}
      </p>
    </div>
  )
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-[20px] border border-line bg-white/68 p-4">
      <h3 className="font-black">{title}</h3>
      <ol className="mt-3 grid gap-2">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="flex gap-3 text-sm leading-6 text-ink/72">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint text-xs font-black text-leaf">
              {index + 1}
            </span>
            {item}
          </li>
        ))}
      </ol>
    </div>
  )
}

function CheckInForm({
  value,
  setValue,
  onCancel,
  onSubmit,
  loading,
}: {
  value: { whatDone: string; whatProduced: string; problems: string }
  setValue: (value: { whatDone: string; whatProduced: string; problems: string }) => void
  onCancel: () => void
  onSubmit: () => void
  loading: boolean
}) {
  return (
    <div className="rounded-[22px] border border-peach/60 bg-peach/12 p-4">
      <div className="grid gap-3">
        {[
          ['whatDone', '我完成了什么？'],
          ['whatProduced', '我产出了什么？'],
          ['problems', '遇到了什么问题？'],
        ].map(([key, label]) => (
          <textarea
            key={key}
            className="soft-focus-ring min-h-20 resize-none rounded-2xl border border-line bg-white/80 p-3 text-sm placeholder:text-ink/35"
            placeholder={label}
            value={value[key as keyof typeof value]}
            onChange={(event) => setValue({ ...value, [key]: event.target.value })}
          />
        ))}
      </div>
      <div className="mt-4 flex gap-3">
        <button className="rounded-2xl border border-line bg-white px-4 py-2 text-sm font-black" onClick={onCancel}>
          取消
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2 text-sm font-black text-white"
          onClick={onSubmit}
          disabled={loading}
        >
          {loading && <Loader2 className="animate-spin" size={16} />}
          提交打卡
        </button>
      </div>
    </div>
  )
}

function SkillPanel({
  skills,
  onRefresh,
  loading,
  selectedSkillId,
  setSelectedSkillId,
}: {
  skills: SkillTag[]
  onRefresh: () => void
  loading: boolean
  selectedSkillId: string | null
  setSelectedSkillId: (id: string | null) => void
}) {
  const selectedSkill = skills.find((skill) => skill.id === selectedSkillId)

  if (selectedSkill) {
    return <SkillDetailPanel skill={selectedSkill} onBack={() => setSelectedSkillId(null)} />
  }

  return (
    <main className="grid gap-4">
      <section className="rounded-[26px] border border-line bg-white/82 p-4 shadow-paper sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <BrandMark />
            <p className="mt-5 text-sm font-bold text-leaf">能力资产库</p>
            <h1 className="mt-1 text-3xl font-black">我的技能标签</h1>
            <p className="mt-2 text-sm leading-6 text-ink/64">
              共 {skills.length} 个能力标签。点击标签可查看能力 Prompt 和来源说明。
            </p>
          </div>
          <button
            className="soft-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
            刷新
          </button>
        </div>
      </section>
      {skills.length === 0 ? (
        <section className="rounded-[24px] border border-line bg-white/74 p-8 text-center shadow-soft">
          <Sparkles className="mx-auto text-peach" size={34} />
          <h3 className="mt-3 text-xl font-black">还没有沉淀能力 Prompt</h3>
          <p className="mt-2 text-ink/65">完成一次任务打卡后，这里会出现可复用的能力卡片。</p>
        </section>
      ) : (
        <section className="rounded-[26px] border border-line bg-white/78 p-4 shadow-paper sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <UserRound size={18} className="text-leaf" />
              标签列表
            </h2>
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-black text-leaf">{skills.length} 项</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <button
                key={skill.id}
                className="soft-focus-ring flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border border-line bg-paper/74 p-4 text-left shadow-soft transition hover:border-leaf/55 hover:bg-white/82"
                onClick={() => setSelectedSkillId(skill.id)}
              >
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black">{skill.name}</h3>
                  <p className="mt-1 text-xs font-bold text-ink/56">{skill.level} · 使用 {skill.count} 次</p>
                </div>
                <Eye className="shrink-0 text-leaf" size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function SkillDetailPanel({ skill, onBack }: { skill: SkillTag; onBack: () => void }) {
  async function copyPrompt() {
    await navigator.clipboard.writeText(skill.prompt)
  }

  return (
    <main className="grid gap-4">
      <section className="rounded-[26px] border border-line bg-white/84 p-4 shadow-paper sm:p-6">
        <button
          className="soft-focus-ring inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black"
          onClick={onBack}
        >
          <ArrowLeft size={17} />
          返回标签列表
        </button>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-leaf">
              <BadgeCheck size={17} />
              能力详情
            </p>
            <h1 className="mt-2 text-3xl font-black">{skill.name}</h1>
          </div>
          <div className="flex gap-2">
            <span className="rounded-full bg-mint px-3 py-1 text-xs font-black text-leaf">{skill.level}</span>
            <span className="rounded-full bg-butter/60 px-3 py-1 text-xs font-black text-ink/70">x{skill.count}</span>
          </div>
        </div>
      </section>

      <section className="rounded-[26px] border border-line bg-white/78 p-4 shadow-paper sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">能力 Prompt</h2>
          <button className="soft-focus-ring rounded-xl p-2 hover:bg-white" onClick={copyPrompt} aria-label="复制能力 Prompt">
            <Copy size={17} />
          </button>
        </div>
        <p className="mt-3 whitespace-pre-wrap rounded-[20px] border border-line bg-paper/74 p-4 text-sm leading-7 text-ink/74">
          {skill.prompt}
        </p>
      </section>

      <section className="rounded-[26px] border border-line bg-white/78 p-4 shadow-soft sm:p-5">
        <h2 className="text-lg font-black">来源说明</h2>
        <p className="mt-3 text-sm leading-7 text-ink/68">{skill.evidence}</p>
      </section>
    </main>
  )
}

function UserPanel({
  me,
  categories,
  profile,
  expandedTags,
  historyItems,
  historyDetail,
  historyExpandedGoalId,
  historyLoadingGoalId,
  loading,
  onExpand,
  onSelect,
  onSaveProfile,
  onRefreshHistory,
  onOpenHistoryGoal,
  onCloseHistoryDetail,
  onViewAllHistory,
  onLogout,
}: {
  me: MeResponse
  categories: TagOptionCategory[]
  profile: UserTagProfileIds
  expandedTags: Record<string, boolean>
  historyItems: GoalHistoryItem[]
  historyDetail: GoalDetailResponse | null
  historyExpandedGoalId: string | null
  historyLoadingGoalId: string | null
  loading: boolean
  onExpand: (id: string) => void
  onSelect: (category: TagOptionCategory, optionId: string) => void
  onSaveProfile: () => void
  onRefreshHistory: () => void
  onOpenHistoryGoal: (goalId: string) => void
  onCloseHistoryDetail: () => void
  onViewAllHistory: () => void
  onLogout: () => void
}) {
  const activeHistoryCount = historyItems.filter((item) => item.status === 'active').length
  const completedHistoryCount = historyItems.filter((item) => item.status === 'completed').length
  const recentHistoryItems = historyItems.slice(0, 3)
  const hasMoreHistory = historyItems.length > recentHistoryItems.length

  return (
    <main className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="rounded-[26px] border border-line bg-white/82 p-4 shadow-paper sm:p-6">
        <BrandMark />
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-leaf">账号中心</p>
            <h1 className="mt-1 text-3xl font-black">{me.user.displayName}</h1>
            <p className="mt-2 text-sm leading-6 text-ink/64">@{me.user.username} · 账号数据已持久化保存</p>
          </div>
          <button
            className="soft-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black"
            onClick={onLogout}
          >
            <LogOut size={17} />
            退出登录
          </button>
        </div>
      </section>

      <section className="rounded-[26px] border border-line bg-white/78 p-4 shadow-paper sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Route size={18} className="text-leaf" />
              路径历史
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/64">
              点开任意历史卡片，可以查看当时生成的完整路径，以及每个节点打卡时你写下的内容。
            </p>
          </div>
          <button
            className="soft-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black"
            onClick={onRefreshHistory}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
            刷新历史
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-ink/60">
          <span className="rounded-full bg-mint px-3 py-1 text-leaf">{historyItems.length} 条路径</span>
          <span className="rounded-full bg-paper px-3 py-1">进行中 {activeHistoryCount}</span>
          <span className="rounded-full bg-butter/70 px-3 py-1">已归档 {completedHistoryCount}</span>
        </div>

        {historyItems.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-line bg-paper/72 p-6 text-center">
            <Map className="mx-auto text-leaf" size={32} />
            <h3 className="mt-3 text-lg font-black">还没有路径历史</h3>
            <p className="mt-2 text-sm leading-6 text-ink/64">完成一次目标生成并打卡后，这里会自动出现路径卡片。</p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3">
              {recentHistoryItems.map((item) => (
                <HistoryGoalCard
                  key={item.id}
                  item={item}
                  loading={historyLoadingGoalId === item.id}
                  active={historyExpandedGoalId === item.id}
                  onOpen={() => onOpenHistoryGoal(item.id)}
                />
              ))}
            </div>
            <button
              className="soft-focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-4 py-3 text-sm font-black hover:bg-white/82"
              onClick={onViewAllHistory}
            >
              <ExternalLink size={17} />
              查看全部路径历史
              {hasMoreHistory && <span className="rounded-full bg-mint px-2 py-0.5 text-xs text-leaf">剩余 {historyItems.length - recentHistoryItems.length}</span>}
            </button>
          </>
        )}
      </section>

      <section className="rounded-[26px] border border-line bg-white/78 p-4 shadow-paper sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Tags size={18} className="text-leaf" />
              基础画像
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink/64">身份、专业背景、能力阶段只保存在用户层，后续任务会自动继承。</p>
          </div>
          <button
            className="soft-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-peach px-5 py-3 text-sm font-black text-ink shadow-soft disabled:opacity-60"
            disabled={loading}
            onClick={onSaveProfile}
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
            保存画像
          </button>
        </div>
        <TagCategoryList
          categories={categories}
          profile={profile}
          expandedTags={expandedTags}
          onExpand={onExpand}
          onSelect={onSelect}
        />
      </section>
    </main>
  )
}

function HistoryGoalCard({
  item,
  loading,
  active,
  onOpen,
}: {
  item: GoalHistoryItem
  loading: boolean
  active: boolean
  onOpen: () => void
}) {
  const progress = item.totalTasks > 0 ? Math.round((item.completedTasks / item.totalTasks) * 100) : 0

  return (
    <button
      className={`soft-focus-ring group flex min-h-[150px] flex-col rounded-[22px] border p-4 text-left transition ${
        active ? 'border-leaf bg-white shadow-paper' : 'border-line bg-paper/70 hover:border-leaf/45 hover:bg-white/82'
      }`}
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${item.status === 'completed' ? 'bg-mint text-leaf' : 'bg-butter/70 text-ink/72'}`}>
              {item.status === 'completed' ? '已完成' : '进行中'}
            </span>
            {item.hasPlan && <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-black text-ink/60">已生成路径</span>}
          </div>
          <h3 className="mt-3 line-clamp-2 text-lg font-black leading-7">{item.title}</h3>
        </div>
        {loading ? <Loader2 className="mt-1 animate-spin text-leaf" size={18} /> : <Route className="mt-1 text-leaf/75 transition group-hover:translate-x-0.5" size={18} />}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink/62">{item.goalSummary || item.rawInput}</p>
      <div className="mt-auto pt-4">
        <div className="flex items-center justify-between text-xs font-black text-ink/58">
          <span>
            {item.completedTasks}/{item.totalTasks || 0} 节点
          </span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-leaf transition-all" style={{ width: `${Math.max(progress, item.totalTasks ? 6 : 0)}%` }} />
        </div>
      </div>
    </button>
  )
}

function HistoryPage({
  historyItems,
  historyDetail,
  historyExpandedGoalId,
  historyLoadingGoalId,
  loading,
  onRefreshHistory,
  onOpenHistoryGoal,
  onCloseHistoryDetail,
  onBackToUser,
}: {
  historyItems: GoalHistoryItem[]
  historyDetail: GoalDetailResponse | null
  historyExpandedGoalId: string | null
  historyLoadingGoalId: string | null
  loading: boolean
  onRefreshHistory: () => void
  onOpenHistoryGoal: (goalId: string) => void
  onCloseHistoryDetail: () => void
  onBackToUser: () => void
}) {
  const activeHistoryCount = historyItems.filter((item) => item.status === 'active').length
  const completedHistoryCount = historyItems.filter((item) => item.status === 'completed').length

  return (
    <main className="grid gap-4">
      <section className="rounded-[26px] border border-line bg-white/82 p-4 shadow-paper sm:p-6">
        <BrandMark />
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <button className="soft-focus-ring inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black" onClick={onBackToUser}>
              <ArrowLeft size={17} />
              返回用户页
            </button>
            <h1 className="mt-4 flex items-center gap-2 text-3xl font-black">
              <Route size={26} className="text-leaf" />
              全部路径历史
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink/64">
              在这里查看所有生成过的任务路径。点开任意卡片，可以进入完整路径内容，查看每个节点的打卡记录。
            </p>
          </div>
          <button
            className="soft-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black"
            onClick={onRefreshHistory}
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
            刷新历史
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 text-xs font-black text-ink/60">
          <span className="rounded-full bg-mint px-3 py-1 text-leaf">{historyItems.length} 条路径</span>
          <span className="rounded-full bg-paper px-3 py-1">进行中 {activeHistoryCount}</span>
          <span className="rounded-full bg-butter/70 px-3 py-1">已归档 {completedHistoryCount}</span>
        </div>
      </section>

      <section className="rounded-[26px] border border-line bg-white/78 p-4 shadow-paper sm:p-5">
        {!historyDetail ? (
          historyItems.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-line bg-paper/72 p-8 text-center">
              <Map className="mx-auto text-leaf" size={34} />
              <h2 className="mt-3 text-xl font-black">还没有路径历史</h2>
              <p className="mt-2 text-sm leading-6 text-ink/64">完成一次目标生成并打卡后，这里会自动出现路径卡片。</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {historyItems.map((item) => (
                <HistoryGoalCard
                  key={item.id}
                  item={item}
                  loading={historyLoadingGoalId === item.id}
                  active={historyExpandedGoalId === item.id}
                  onOpen={() => onOpenHistoryGoal(item.id)}
                />
              ))}
            </div>
          )
        ) : (
          <HistoryDetailPanel detail={historyDetail} loading={loading} onBack={onCloseHistoryDetail} />
        )}
      </section>
    </main>
  )
}

function HistoryDetailPanel({
  detail,
  loading,
  onBack,
}: {
  detail: GoalDetailResponse
  loading: boolean
  onBack: () => void
}) {
  const stages = detail.plan?.stages ?? []
  const tasks = stages.flatMap((stage) => stage.tasks)
  const completedCount = tasks.filter((task) => task.status === 'completed').length

  return (
    <div className="mt-4 grid gap-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-line bg-white/78 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="min-w-0">
          <button className="soft-focus-ring inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black" onClick={onBack}>
            <ArrowLeft size={17} />
            返回历史卡片
          </button>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black text-ink/60">
            <span className="rounded-full bg-mint px-3 py-1 text-leaf">{detail.status === 'completed' ? '已完成' : '进行中'}</span>
            <span className="rounded-full bg-paper px-3 py-1">{formatDateTime(detail.createdAt)}</span>
            <span className="rounded-full bg-butter/70 px-3 py-1">{completedCount}/{tasks.length || 0} 节点</span>
          </div>
          <h3 className="mt-4 text-2xl font-black sm:text-3xl">{detail.title}</h3>
          <p className="mt-2 max-w-4xl text-sm leading-7 text-ink/68">{detail.goalSummary || detail.rawInput}</p>
        </div>
        <div className="rounded-[22px] border border-line bg-paper/72 p-4 text-sm text-ink/70 sm:min-w-[220px]">
          <p className="font-black text-ink">路径概览</p>
          <div className="mt-3 grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span>阶段数</span>
              <span className="font-black text-ink">{stages.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>节点数</span>
              <span className="font-black text-ink">{tasks.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>完成节点</span>
              <span className="font-black text-ink">{completedCount}</span>
            </div>
          </div>
        </div>
      </div>

      {loading && <div className="rounded-[22px] border border-line bg-white/78 p-4 text-sm text-ink/60">正在加载历史路径详情...</div>}

      <div className="grid gap-4">
        {stages.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-line bg-paper/72 p-8 text-center text-sm text-ink/62">
            这条路径还没有生成阶段内容。
          </div>
        ) : (
          stages.map((stage) => (
            <section key={stage.id} className="rounded-[24px] border border-line bg-white/82 p-4 shadow-paper sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-leaf">阶段 {stage.sortOrder + 1}</p>
                  <h4 className="mt-1 text-xl font-black">{stage.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-ink/64">{stage.description}</p>
                </div>
                <span className="rounded-full bg-mint px-3 py-1 text-xs font-black text-leaf">{stage.tasks.length} 个节点</span>
              </div>

              <div className="mt-4 grid gap-4">
                {stage.tasks.map((task) => (
                  <HistoryTaskNode key={task.id} task={task} stageTitle={stage.title} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

function HistoryTaskNode({
  task,
  stageTitle,
}: {
  task: PlanResponse['stages'][number]['tasks'][number] & { stageTitle?: string }
  stageTitle: string
}) {
  const checkIn = task.checkIn
  return (
    <article className="rounded-[22px] border border-line bg-paper/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-full bg-white px-3 py-1 text-leaf">{stageTitle}</span>
            <span className={`rounded-full px-3 py-1 ${task.status === 'completed' ? 'bg-mint text-leaf' : 'bg-butter/70 text-ink/70'}`}>
              {task.status === 'completed' ? '已打卡' : '未打卡'}
            </span>
          </div>
          <h5 className="mt-3 text-lg font-black">{task.title}</h5>
          <p className="mt-2 text-sm leading-7 text-ink/68">{task.description}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <InfoBlock title="这一站要产出" content={task.expectedOutput} />
        <InfoBlock title="可复制给 AI" content={task.vibeCodingPrompt} copyable compact />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <ListBlock title="路线动作" items={task.pathSteps.slice(0, 6)} />
        <ListBlock title="完成标准" items={task.completionCriteria} />
      </div>

      {(task.tools.length > 0 || task.resources.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {task.tools.map((tool) => (
            <RecommendationLink
              key={`${task.id}-${tool.name}`}
              title={tool.name}
              description={tool.usage}
              url={tool.url}
              kind="tool"
            />
          ))}
          {task.resources.map((resource) => (
            <RecommendationLink
              key={`${task.id}-${resource.title}`}
              title={resource.title}
              description={resource.description ?? '推荐资源'}
              url={resource.url}
              kind="resource"
            />
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <HistoryNoteBlock title="完成了什么" content={checkIn?.whatDone} />
        <HistoryNoteBlock title="产出了什么" content={checkIn?.whatProduced} />
        <HistoryNoteBlock title="遇到了什么问题" content={checkIn?.problems} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black text-ink/56">
        <span className="rounded-full bg-white px-3 py-1">预测能力：{task.predictedSkillTags.join(' · ') || '无'}</span>
        {checkIn?.createdAt && <span className="rounded-full bg-white px-3 py-1">打卡时间：{formatDateTime(checkIn.createdAt)}</span>}
      </div>
    </article>
  )
}

function HistoryNoteBlock({ title, content }: { title: string; content?: string | null }) {
  return (
    <div className="rounded-[20px] border border-line bg-white/78 p-4">
      <h6 className="text-sm font-black">{title}</h6>
      <p className="mt-2 min-h-16 whitespace-pre-wrap text-sm leading-6 text-ink/72">
        {content?.trim() || '未填写'}
      </p>
    </div>
  )
}
