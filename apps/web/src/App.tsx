import type {
  CheckInResponse,
  MeResponse,
  PlanResponse,
  SkillTag,
  TagOptionCategory,
  UserTagProfileIds,
} from '@leavesflow/shared-types'
import {
  ArrowLeft,
  BadgeCheck,
  BookOpen,
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
  Map,
  MapPin,
  PenLine,
  Route,
  Sparkles,
  Tags,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { api } from './api'

type ViewKey = 'tags' | 'goal' | 'plan' | 'skills'
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

const quickGoals = ['做一个AI网站', '完成React项目', '学习AI产品设计', '准备互联网面试']

function compactText(value: string, maxLength = 46) {
  const text = value.trim()
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

function getAllTasks(plan: PlanResponse): RouteTask[] {
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

export function App() {
  const [view, setView] = useState<ViewKey>('tags')
  const [tagCategories, setTagCategories] = useState<TagOptionCategory[]>([])
  const [profile, setProfile] = useState<UserTagProfileIds>(emptyProfile)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [rawInput, setRawInput] = useState('做一个AI网站')
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [expandedTags, setExpandedTags] = useState<Record<string, boolean>>({})
  const [checkInTaskId, setCheckInTaskId] = useState<string | null>(null)
  const [checkInText, setCheckInText] = useState({ whatDone: '', whatProduced: '', problems: '' })
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void bootstrap()
  }, [])

  async function bootstrap() {
    setLoading(true)
    try {
      const [tagOptions, meData] = await Promise.all([api.getTagOptions(), api.getMe()])
      setTagCategories(tagOptions.categories)
      setMe(meData)
      setProfile({
        identityTagIds: meData.tagProfile.identityTags.map((tag) => tag.id),
        backgroundTagIds: meData.tagProfile.backgroundTags.map((tag) => tag.id),
        levelTagIds: meData.tagProfile.levelTags.map((tag) => tag.id),
        goalTypeTagIds: meData.tagProfile.goalTypeTags.map((tag) => tag.id),
        timeRangeTagIds: meData.tagProfile.timeRangeTags.map((tag) => tag.id),
        outputPreferenceTagIds: meData.tagProfile.outputPreferenceTags.map((tag) => tag.id),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '初始化失败')
    } finally {
      setLoading(false)
    }
  }

  const completedCount = useMemo(
    () => plan?.stages.flatMap((stage) => stage.tasks).filter((task) => task.status === 'completed').length ?? 0,
    [plan],
  )

  const totalTasks = useMemo(() => plan?.stages.flatMap((stage) => stage.tasks).length ?? 0, [plan])

  function selectTag(category: TagOptionCategory, optionId: string) {
    const field = categoryToField[category.key]
    setProfile((current) => ({
      ...current,
      [field]: current[field][0] === optionId ? [] : [optionId],
    }))
  }

  async function saveProfile() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      await api.updateTagProfile(profile)
      setMe(await api.getMe())
      setMessage('标签封装已保存，接下来可以输入目标。')
      setView('goal')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存标签失败')
    } finally {
      setLoading(false)
    }
  }

  async function createAndGenerateGoal() {
    const text = rawInput.trim()
    if (!text) {
      setError('请先输入一个目标')
      return
    }
    setLoading(true)
    setError('')
    setMessage('LeavesFlow 正在把目标拆成适合 Vibe Coding 的路径。')
    setView('plan')
    try {
      const goal = await api.createGoal(text, profile)
      const generated = await api.generatePlan(goal.id)
      setPlan(generated)
      setActiveTaskId(generated.stages[0]?.tasks[0]?.id ?? null)
      setMessage('任务路径已生成，可以从第一步开始。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成任务路径失败')
    } finally {
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
      if (plan) {
        setPlan(await api.getPlan(plan.goalId))
      }
      setMe(await api.getMe())
      setCheckInTaskId(null)
      setCheckInText({ whatDone: '', whatProduced: '', problems: '' })
      setMessage(`已沉淀 ${result.newSkillTags.length} 张能力 Prompt 卡片。`)
      setView('skills')
    } catch (err) {
      setError(err instanceof Error ? err.message : '打卡失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen pb-28 text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        {(message || error) && (
          <div
            className={`rounded-[20px] border px-4 py-3 text-sm shadow-soft ${
              error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-leaf/20 bg-white/80 text-ink'
            }`}
          >
            {error || message}
          </div>
        )}

        {view === 'tags' && (
          <TagProfilePanel
            categories={tagCategories}
            profile={profile}
            expandedTags={expandedTags}
            onExpand={(id) => setExpandedTags((current) => ({ ...current, [id]: !current[id] }))}
            onSelect={selectTag}
            onSave={saveProfile}
            loading={loading}
          />
        )}

        {view === 'goal' && (
          <GoalPanel
            rawInput={rawInput}
            setRawInput={setRawInput}
            onGenerate={createAndGenerateGoal}
            loading={loading}
          />
        )}

        {view === 'plan' && (
          <PlanPanel
            plan={plan}
            loading={loading}
            activeTaskId={activeTaskId}
            setActiveTaskId={setActiveTaskId}
            checkInTaskId={checkInTaskId}
            setCheckInTaskId={setCheckInTaskId}
            checkInText={checkInText}
            setCheckInText={setCheckInText}
            onCheckIn={submitCheckIn}
          />
        )}

        {view === 'skills' && (
          <SkillPanel
            skills={me?.skillTags ?? []}
            onRefresh={bootstrap}
            loading={loading}
            selectedSkillId={selectedSkillId}
            setSelectedSkillId={setSelectedSkillId}
          />
        )}
      </div>
      <BottomNav view={view} onViewChange={setView} completedCount={completedCount} totalTasks={totalTasks} />
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
  const items: Array<{ key: ViewKey; label: string; icon: typeof Tags }> = [
    { key: 'tags', label: '标签', icon: Tags },
    { key: 'goal', label: '目标', icon: PenLine },
    { key: 'plan', label: '路径', icon: Route },
    { key: 'skills', label: '技能', icon: Sparkles },
  ]
  return (
    <nav className="fixed inset-x-0 bottom-3 z-50 px-3">
      <div className="paper-texture mx-auto w-full max-w-[560px] rounded-[24px] border border-line/90 bg-white/92 p-2 shadow-paper backdrop-blur">
        <div className="grid grid-cols-4 gap-1">
          {items.map((item) => {
            const Icon = item.icon
            const active = view === item.key
            return (
              <button
                key={item.key}
                className={`soft-focus-ring flex min-w-0 items-center justify-center gap-1 rounded-[18px] px-1 py-2 text-[11px] font-black leading-tight transition sm:gap-2 sm:text-sm ${
                  active
                    ? 'bg-ink text-white shadow-soft'
                    : 'text-ink/62 hover:bg-white/80 hover:text-ink'
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

function TagProfilePanel({
  categories,
  profile,
  expandedTags,
  onExpand,
  onSelect,
  onSave,
  loading,
}: {
  categories: TagOptionCategory[]
  profile: UserTagProfileIds
  expandedTags: Record<string, boolean>
  onExpand: (id: string) => void
  onSelect: (category: TagOptionCategory, optionId: string) => void
  onSave: () => void
  loading: boolean
}) {
  const selectedCount = Object.values(profile).reduce((sum, ids) => sum + ids.length, 0)

  return (
    <main className="grid gap-4">
      <section className="rounded-[24px] border border-line bg-white/82 p-4 shadow-paper sm:p-5">
        <BrandMark />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold text-leaf">选择基础画像</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">用几个标签校准任务路径</h1>
          </div>
          <button
            className="soft-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={onSave}
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
            保存并继续
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-ink/64">
          已选择 {selectedCount} 项。点开箭头可查看标签背后的 Prompt，当前版本只查看不编辑。
        </p>
      </section>

      <section className="grid gap-3">
        {categories.map((category) => {
          const field = categoryToField[category.key]
          return (
            <div key={category.key} className="rounded-[22px] border border-line bg-white/78 p-3 shadow-soft sm:p-4">
              <h2 className="mb-3 flex items-center gap-2 text-base font-black">
                <Tags size={18} className="text-leaf" />
                {category.name}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
      </section>
    </main>
  )
}

function GoalPanel({
  rawInput,
  setRawInput,
  onGenerate,
  loading,
}: {
  rawInput: string
  setRawInput: (value: string) => void
  onGenerate: () => void
  loading: boolean
}) {
  return (
    <main className="grid gap-4 lg:grid-cols-[1fr_0.66fr]">
      <section className="rounded-[26px] border border-line bg-white/82 p-4 shadow-paper sm:p-6">
        <BrandMark />
        <h1 className="mt-5 text-3xl font-black sm:text-4xl">今天想完成什么？</h1>
        <p className="mt-2 text-sm leading-6 text-ink/64">直接写事情本身就好，长一点也可以。</p>
        <textarea
          className="soft-focus-ring mt-5 min-h-44 w-full resize-none rounded-[22px] border border-line bg-paper/70 p-5 text-lg leading-8 shadow-inner"
          maxLength={1000}
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder="例如：做一个AI网站"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/58">
          <span>{rawInput.length}/1000</span>
          <span>写清楚想完成的事，LeavesFlow 会拆成可执行步骤。</span>
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
      <aside className="rounded-[26px] border border-line bg-white/74 p-4 shadow-soft sm:p-5">
        <h2 className="flex items-center gap-2 text-lg font-black">
          <BookOpen size={18} className="text-leaf" />
          可以这样写
        </h2>
        <div className="mt-4 grid gap-3">
          {quickGoals.map((goal) => (
            <button
              key={goal}
              className="soft-focus-ring rounded-2xl border border-line bg-paper/70 px-4 py-3 text-left text-sm font-bold hover:border-peach"
              onClick={() => setRawInput(goal)}
            >
              {goal}
            </button>
          ))}
        </div>
      </aside>
    </main>
  )
}

function PlanPanel({
  plan,
  loading,
  activeTaskId,
  setActiveTaskId,
  checkInTaskId,
  setCheckInTaskId,
  checkInText,
  setCheckInText,
  onCheckIn,
}: {
  plan: PlanResponse | null
  loading: boolean
  activeTaskId: string | null
  setActiveTaskId: (id: string) => void
  checkInTaskId: string | null
  setCheckInTaskId: (id: string | null) => void
  checkInText: { whatDone: string; whatProduced: string; problems: string }
  setCheckInText: (value: { whatDone: string; whatProduced: string; problems: string }) => void
  onCheckIn: (taskId: string) => void
}) {
  const allTasks = plan ? getAllTasks(plan) : []
  const activeTask = allTasks.find((task) => task.id === activeTaskId) ?? allTasks[0]
  const activeIndex = activeTask ? allTasks.findIndex((task) => task.id === activeTask.id) : -1

  if (loading && !plan) {
    return (
      <main className="rounded-[28px] border border-line bg-white/80 p-10 text-center shadow-paper">
        <Loader2 className="mx-auto animate-spin text-leaf" size={38} />
        <h2 className="mt-4 text-2xl font-black">正在生成适合 Vibe Coding 的任务路径</h2>
        <p className="mt-2 text-ink/65">系统会把每一步拆到 AI 能完整理解、稳定输出的颗粒度。</p>
      </main>
    )
  }

  if (!plan) {
    return (
      <main className="rounded-[28px] border border-line bg-white/80 p-8 text-center shadow-paper">
        <Map className="mx-auto text-leaf" size={34} />
        <h2 className="mt-4 text-2xl font-black">还没有任务路径</h2>
        <p className="mt-2 text-ink/65">先保存标签并输入目标，LeavesFlow 会生成一条可打卡的路径。</p>
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
                {stage.tasks.map((task) => {
                  const expanded = activeTask?.id === task.id
                  return (
                    <RouteTaskNode
                      key={task.id}
                      task={{ ...task, stageTitle: stage.title }}
                      expanded={expanded}
                      checkInTaskId={checkInTaskId}
                      checkInText={checkInText}
                      loading={loading}
                      setCheckInTaskId={setCheckInTaskId}
                      setCheckInText={setCheckInText}
                      onCheckIn={onCheckIn}
                      onSelect={() => setActiveTaskId(task.id)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>
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
            className="soft-focus-ring min-h-20 resize-none rounded-2xl border border-line bg-white/80 p-3 text-sm"
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
