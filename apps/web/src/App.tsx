import type {
  CheckInResponse,
  MeResponse,
  PlanResponse,
  SkillTag,
  TagOptionCategory,
  UserTagProfileIds,
} from '@leavesflow/shared-types'
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Circle,
  Leaf,
  Loader2,
  Map,
  PenLine,
  Route,
  Sparkles,
  Tags,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from './api'

type ViewKey = 'tags' | 'goal' | 'plan' | 'skills'

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
    <div className="min-h-screen text-ink">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <Header view={view} onViewChange={setView} completedCount={completedCount} totalTasks={totalTasks} />
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

        {view === 'skills' && <SkillPanel skills={me?.skillTags ?? []} onRefresh={bootstrap} loading={loading} />}
      </div>
    </div>
  )
}

function Header({
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
    { key: 'tags', label: '标签选择', icon: Tags },
    { key: 'goal', label: '目标输入', icon: PenLine },
    { key: 'plan', label: '任务路径', icon: Route },
    { key: 'skills', label: '我的技能标签', icon: Sparkles },
  ]
  return (
    <header className="paper-texture rounded-[28px] border border-line/80 p-4 shadow-paper">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint text-leaf shadow-soft">
            <Leaf size={26} />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-leaf">LeavesFlow</p>
            <h1 className="text-2xl font-black tracking-normal sm:text-3xl">把小目标养成可复用的能力 Prompt</h1>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {items.map((item) => {
            const Icon = item.icon
            const active = view === item.key
            return (
              <button
                key={item.key}
                className={`soft-focus-ring flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-sm font-bold transition ${
                  active
                    ? 'border-peach bg-peach/25 text-ink shadow-soft'
                    : 'border-line bg-white/70 text-ink/70 hover:border-leaf/40 hover:text-ink'
                }`}
                onClick={() => onViewChange(item.key)}
              >
                <Icon size={17} />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/80">
        <div
          className="h-full rounded-full bg-leaf transition-all"
          style={{ width: totalTasks ? `${Math.round((completedCount / totalTasks) * 100)}%` : '8%' }}
        />
      </div>
    </header>
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
  return (
    <main className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
      <section className="rounded-[24px] border border-line bg-white/78 p-6 shadow-paper">
        <p className="text-sm font-bold text-leaf">标签不是几个字</p>
        <h2 className="mt-2 text-3xl font-black">选择你的 Prompt 封装</h2>
        <p className="mt-3 leading-7 text-ink/70">
          每个标签背后都有一段可展开的上下文。AI 会用这些封装来理解你的背景、节奏和交付偏好。
        </p>
        <button
          className="soft-focus-ring mt-6 inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-soft disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={onSave}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          保存标签
        </button>
      </section>

      <section className="grid gap-4">
        {categories.map((category) => {
          const field = categoryToField[category.key]
          return (
            <div key={category.key} className="rounded-[24px] border border-line bg-white/78 p-5 shadow-soft">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-black">
                <Tags size={18} className="text-leaf" />
                {category.name}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {category.options.map((option) => {
                  const selected = profile[field].includes(option.id)
                  const expanded = expandedTags[option.id]
                  return (
                    <div
                      key={option.id}
                      className={`rounded-[18px] border p-3 transition ${
                        selected ? 'border-leaf bg-mint/70' : 'border-line bg-paper/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          className="soft-focus-ring flex flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-black"
                          onClick={() => onSelect(category, option.id)}
                          aria-pressed={selected}
                        >
                          {selected ? (
                            <CheckCircle2 className="shrink-0 text-leaf" size={17} />
                          ) : (
                            <Circle className="shrink-0 text-ink/30" size={17} />
                          )}
                          {option.label}
                        </button>
                        <button
                          className="soft-focus-ring rounded-xl p-2 text-ink/60 hover:bg-white"
                          onClick={() => onExpand(option.id)}
                          aria-label="展开标签封装"
                        >
                          <ChevronDown className={expanded ? 'rotate-180 transition' : 'transition'} size={17} />
                        </button>
                      </div>
                      <button
                        className="soft-focus-ring mt-2 w-full rounded-xl px-2 py-2 text-left text-xs font-bold text-ink/58 hover:bg-white/70"
                        onClick={() => onSelect(category, option.id)}
                        aria-label={`选择${option.label}`}
                      >
                        {selected ? '已选中，点击可取消' : '点击选择这个标签'}
                      </button>
                      {expanded && <p className="mt-3 text-sm leading-6 text-ink/72">{option.promptText}</p>}
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
    <main className="grid gap-5 lg:grid-cols-[1fr_0.72fr]">
      <section className="rounded-[28px] border border-line bg-white/80 p-6 shadow-paper">
        <div className="flex items-center gap-2 text-sm font-bold text-leaf">
          <PenLine size={17} />
          短目标优先，长目标也能处理
        </div>
        <h2 className="mt-3 text-3xl font-black">写下今天想推进的目标</h2>
        <textarea
          className="soft-focus-ring mt-5 min-h-44 w-full resize-none rounded-[22px] border border-line bg-paper/70 p-5 text-lg leading-8 shadow-inner"
          maxLength={1000}
          value={rawInput}
          onChange={(event) => setRawInput(event.target.value)}
          placeholder="例如：做一个AI网站"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink/60">
          <span>{rawInput.length}/1000</span>
          <span>主场景仍为 15 字以内短目标，系统会自动补足拆解上下文。</span>
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
      <aside className="rounded-[28px] border border-line bg-white/72 p-6 shadow-soft">
        <h3 className="flex items-center gap-2 text-lg font-black">
          <BookOpen size={18} className="text-leaf" />
          示例目标
        </h3>
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
  const activeTask = plan?.stages.flatMap((stage) => stage.tasks).find((task) => task.id === activeTaskId)

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
    <main className="grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
      <section className="rounded-[28px] border border-line bg-white/78 p-5 shadow-paper">
        <p className="text-sm font-bold text-leaf">{plan.goalTitle}</p>
        <h2 className="mt-2 text-2xl font-black">今日计划</h2>
        <p className="mt-3 text-sm leading-6 text-ink/70">{plan.goalSummary}</p>
        <div className="mt-6 grid gap-4">
          {plan.stages.map((stage) => (
            <div key={stage.id}>
              <h3 className="mb-3 text-sm font-black text-ink/75">{stage.title}</h3>
              <div className="grid gap-2">
                {stage.tasks.map((task) => (
                  <button
                    key={task.id}
                    className={`soft-focus-ring rounded-2xl border px-4 py-3 text-left transition ${
                      activeTaskId === task.id
                        ? 'border-leaf bg-mint/70'
                        : 'border-line bg-paper/70 hover:border-peach'
                    }`}
                    onClick={() => setActiveTaskId(task.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black">{task.title}</span>
                      {task.status === 'completed' && <CheckCircle2 className="text-leaf" size={18} />}
                    </div>
                    <p className="mt-1 text-sm text-ink/62">{task.expectedOutput}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-line bg-white/82 p-6 shadow-paper">
        {activeTask && (
          <div className="grid gap-5">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {activeTask.predictedSkillTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-butter/55 px-3 py-1 text-xs font-black text-ink/72">
                    {tag}
                  </span>
                ))}
              </div>
              <h2 className="mt-3 text-3xl font-black">{activeTask.title}</h2>
              <p className="mt-3 leading-7 text-ink/70">{activeTask.description}</p>
            </div>
            <InfoBlock title="给 AI 的上下文" content={activeTask.contextForAI} />
            <InfoBlock title="可复制 Prompt" content={activeTask.vibeCodingPrompt} copyable />
            <InfoBlock title="预期产出" content={activeTask.expectedOutput} />
            <ListBlock title="执行路径" items={activeTask.pathSteps} />
            <ListBlock title="完成标准" items={activeTask.completionCriteria} />
            <div className="grid gap-3 sm:grid-cols-2">
              {activeTask.tools.map((tool) => (
                <a
                  key={tool.name}
                  className="rounded-2xl border border-line bg-paper/70 p-4 text-sm hover:border-leaf"
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <b>{tool.name}</b>
                  <p className="mt-1 text-ink/65">{tool.usage}</p>
                </a>
              ))}
              {activeTask.resources.map((resource) => (
                <a
                  key={resource.title}
                  className="rounded-2xl border border-line bg-paper/70 p-4 text-sm hover:border-leaf"
                  href={resource.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <b>{resource.title}</b>
                  <p className="mt-1 text-ink/65">{resource.description ?? '推荐资源'}</p>
                </a>
              ))}
            </div>
            {activeTask.status === 'completed' ? (
              <div className="rounded-2xl bg-mint/70 p-4 font-black text-leaf">这个任务已经完成打卡。</div>
            ) : checkInTaskId === activeTask.id ? (
              <CheckInForm
                value={checkInText}
                setValue={setCheckInText}
                onCancel={() => setCheckInTaskId(null)}
                onSubmit={() => onCheckIn(activeTask.id)}
                loading={loading}
              />
            ) : (
              <button
                className="soft-focus-ring inline-flex w-fit items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-soft"
                onClick={() => setCheckInTaskId(activeTask.id)}
              >
                <CheckCircle2 size={18} />
                打卡完成
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  )
}

function InfoBlock({ title, content, copyable = false }: { title: string; content: string; copyable?: boolean }) {
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
      <p className="whitespace-pre-wrap text-sm leading-7 text-ink/72">{content}</p>
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

function SkillPanel({ skills, onRefresh, loading }: { skills: SkillTag[]; onRefresh: () => void; loading: boolean }) {
  return (
    <main className="rounded-[28px] border border-line bg-white/78 p-6 shadow-paper">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-leaf">能力资产库</p>
          <h2 className="mt-2 text-3xl font-black">我的技能标签</h2>
        </div>
        <button
          className="soft-focus-ring inline-flex items-center gap-2 rounded-2xl border border-line bg-paper px-4 py-2 text-sm font-black"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
          刷新
        </button>
      </div>
      {skills.length === 0 ? (
        <div className="mt-8 rounded-[24px] bg-paper/80 p-8 text-center">
          <Sparkles className="mx-auto text-peach" size={34} />
          <h3 className="mt-3 text-xl font-black">还没有沉淀能力 Prompt</h3>
          <p className="mt-2 text-ink/65">完成一次任务打卡后，这里会出现可复用的能力卡片。</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {skills.map((skill) => (
            <div key={skill.id} className="rounded-[24px] border border-line bg-paper/76 p-5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-black">{skill.name}</h3>
                <div className="flex gap-2">
                  <span className="rounded-full bg-mint px-3 py-1 text-xs font-black text-leaf">{skill.level}</span>
                  <span className="rounded-full bg-butter/60 px-3 py-1 text-xs font-black text-ink/70">
                    x{skill.count}
                  </span>
                </div>
              </div>
              <InfoBlock title="能力 Prompt" content={skill.prompt} copyable />
              <p className="mt-4 text-sm leading-6 text-ink/65">{skill.evidence}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
