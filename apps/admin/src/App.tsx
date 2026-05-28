import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  KeyRound,
  Loader2,
  LogOut,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react'

import {
  clearStoredPassword,
  deleteUser,
  getDashboard,
  getStoredPassword,
  searchUser,
  storePassword,
  updateUser,
  type DashboardData,
  type RecentUser,
  type TokenWindow,
  type UserSearchResult,
  type UserWindow,
  type WindowKey,
} from './api'

const windowLabels: Record<WindowKey, string> = {
  oneDay: '1 天',
  sevenDays: '7 天',
  thirtyDays: '30 天',
}

function App() {
  const [password, setPassword] = useState(getStoredPassword)
  const [passwordInput, setPasswordInput] = useState(password)
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [searchResult, setSearchResult] = useState<UserSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState('')

  const isAuthed = password.trim().length > 0

  async function refresh(activePassword = password) {
    if (!activePassword.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      setDashboard(await getDashboard(activePassword))
    } catch (err) {
      setError(errorMessage(err))
      setDashboard(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh(password)
  }, [])

  async function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextPassword = passwordInput.trim()
    if (!nextPassword) {
      setError('请输入后台访问密码')
      return
    }
    storePassword(nextPassword)
    setPassword(nextPassword)
    setNotice('')
    await refresh(nextPassword)
  }

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!query.trim()) {
      return
    }
    setSearching(true)
    setNotice('')
    setError('')
    setSearchResult(null)
    setDeleteConfirm('')
    try {
      setSearchResult(await searchUser(password, query.trim()))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSearching(false)
    }
  }

  async function submitDelete() {
    if (!searchResult) {
      return
    }
    setDeleting(true)
    setError('')
    setNotice('')
    try {
      const result = await deleteUser(password, searchResult.user.id, deleteConfirm.trim())
      setNotice(`已删除用户 ${result.username || result.deletedUserId}`)
      setSearchResult(null)
      setDeleteConfirm('')
      setQuery('')
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  async function submitTableUserUpdate(userId: string, payload: { username: string; displayName: string }) {
    setError('')
    setNotice('')
    try {
      const updated = await updateUser(password, userId, payload)
      setNotice(`已更新用户 ${updated.username || updated.id}`)
      if (searchResult?.user.id === userId) {
        setSearchResult(await searchUser(password, updated.username || updated.id))
      }
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
      throw err
    }
  }

  async function submitTableUserDelete(user: RecentUser, confirm: string) {
    setError('')
    setNotice('')
    try {
      const result = await deleteUser(password, user.id, confirm)
      setNotice(`已删除用户 ${result.username || result.deletedUserId}`)
      if (searchResult?.user.id === user.id) {
        setSearchResult(null)
        setDeleteConfirm('')
        setQuery('')
      }
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
      throw err
    }
  }

  function logout() {
    clearStoredPassword()
    setPassword('')
    setPasswordInput('')
    setDashboard(null)
    setSearchResult(null)
    setNotice('')
    setError('')
  }

  if (!isAuthed) {
    return (
      <main className="login-page">
        <section className="login-panel">
          <div className="brand-mark">
            <KeyRound size={22} />
          </div>
          <div>
            <p className="eyebrow">LeavesFlow Admin</p>
            <h1>后台面板</h1>
          </div>
          <form className="login-form" onSubmit={submitPassword}>
            <label htmlFor="admin-password">访问密码</label>
            <input
              id="admin-password"
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="输入后台访问密码"
              autoComplete="current-password"
            />
            <button type="submit">
              <KeyRound size={17} />
              进入后台
            </button>
          </form>
          {error ? <p className="form-error">{error}</p> : null}
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">LeavesFlow Admin</p>
          <h1>运营反馈面板</h1>
        </div>
        <div className="topbar-actions">
          <button className="ghost-button" type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <RefreshCw size={17} />}
            刷新
          </button>
          <button className="icon-button" type="button" onClick={logout} aria-label="退出后台" title="退出后台">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="alert alert-error">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="alert alert-success">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      ) : null}

      {loading && !dashboard ? (
        <section className="loading-state">
          <Loader2 className="spin" size={28} />
          <span>正在读取后台数据</span>
        </section>
      ) : null}

      {dashboard ? (
        <>
          <SummarySection dashboard={dashboard} />
          <section className="two-column">
            <WindowSection title="用户变化" data={dashboard.userWindows} variant="users" />
            <TokenSection data={dashboard.tokenWindows} />
          </section>
          <section className="two-column align-start">
            <UserSearch
              query={query}
              setQuery={setQuery}
              searching={searching}
              onSubmit={submitSearch}
              result={searchResult}
              deleteConfirm={deleteConfirm}
              setDeleteConfirm={setDeleteConfirm}
              deleting={deleting}
              onDelete={submitDelete}
            />
            <SystemFeedback dashboard={dashboard} />
          </section>
          <UserTable users={dashboard.recentUsers} onEditUser={submitTableUserUpdate} onDeleteUser={submitTableUserDelete} />
          <section className="two-column align-start">
            <RecentGoals dashboard={dashboard} />
            <RecentCheckIns dashboard={dashboard} />
          </section>
        </>
      ) : null}
    </main>
  )
}

function SummarySection({ dashboard }: { dashboard: DashboardData }) {
  const cards = [
    { label: '总用户', value: dashboard.summary.totalUsers, icon: Users },
    { label: '总路径', value: dashboard.summary.totalGoals, icon: Database },
    { label: '任务节点', value: dashboard.summary.totalTasks, icon: Activity },
    { label: '打卡记录', value: dashboard.summary.totalCheckIns, icon: CheckCircle2 },
    { label: '能力标签', value: dashboard.summary.totalSkillTags, icon: Clock3 },
  ]
  return (
    <section className="summary-grid">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article className="metric-card" key={card.label}>
            <div className="metric-icon">
              <Icon size={19} />
            </div>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        )
      })}
    </section>
  )
}

function WindowSection({
  title,
  data,
}: {
  title: string
  data: Record<WindowKey, UserWindow>
  variant: 'users'
}) {
  return (
    <section className="panel">
      <PanelTitle icon={<Users size={18} />} title={title} />
      <div className="window-grid">
        {(Object.keys(windowLabels) as WindowKey[]).map((key) => (
          <article className="window-card" key={key}>
            <span>{windowLabels[key]}</span>
            <strong>{signedNumber(data[key].net)}</strong>
            <div className="mini-line">
              <span>新增 {data[key].created}</span>
              <span>减少 {data[key].deleted}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TokenSection({ data }: { data: Record<WindowKey, TokenWindow> }) {
  return (
    <section className="panel">
      <PanelTitle icon={<Activity size={18} />} title="模型资源使用" />
      <div className="window-grid">
        {(Object.keys(windowLabels) as WindowKey[]).map((key) => (
          <article className="window-card token" key={key}>
            <span>{windowLabels[key]}</span>
            <strong>{formatK(data[key].totalK)}</strong>
            <div className="mini-line">
              <span>路径 {formatK(data[key].generatePlanK)}</span>
              <span>能力 {formatK(data[key].extractSkillsK)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function UserSearch({
  query,
  setQuery,
  searching,
  onSubmit,
  result,
  deleteConfirm,
  setDeleteConfirm,
  deleting,
  onDelete,
}: {
  query: string
  setQuery: (value: string) => void
  searching: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  result: UserSearchResult | null
  deleteConfirm: string
  setDeleteConfirm: (value: string) => void
  deleting: boolean
  onDelete: () => void
}) {
  const canDelete = useMemo(() => {
    if (!result) {
      return false
    }
    return deleteConfirm.trim() === result.user.id || deleteConfirm.trim() === result.user.username
  }, [deleteConfirm, result])

  return (
    <section className="panel search-panel">
      <PanelTitle icon={<Search size={18} />} title="用户定向查询" />
      <form className="search-form" onSubmit={onSubmit}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入用户 ID 或用户名"
        />
        <button type="submit" disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
          查询
        </button>
      </form>

      {result ? (
        <div className="search-result">
          <div className="result-heading">
            <div>
              <strong>{result.user.displayName || result.user.username || '未命名用户'}</strong>
              <span>{result.user.username || result.user.id}</span>
            </div>
          </div>
          <div className="compact-stats">
            <Stat label="路径" value={result.counts.goals} />
            <Stat label="任务" value={result.counts.tasks} />
            <Stat label="打卡" value={result.counts.checkIns} />
            <Stat label="标签" value={result.counts.skillTags} />
          </div>
          <div className="usage-strip">
            <Stat label="1 天 token" value={formatK(result.tokenUsage.oneDayK)} />
            <Stat label="7 天 token" value={formatK(result.tokenUsage.sevenDaysK)} />
            <Stat label="30 天 token" value={formatK(result.tokenUsage.thirtyDaysK)} />
            <Stat label="累计 token" value={formatK(result.tokenUsage.allRecordedK)} />
          </div>
          <div className="mini-table">
            <div className="mini-table-head">
              <span>最近模型调用</span>
              <span>token</span>
              <span>状态</span>
            </div>
            {result.recentAiUsage.length ? (
              result.recentAiUsage.map((row) => (
                <div className="mini-table-row" key={row.id}>
                  <span>{operationLabel(row.operation)}</span>
                  <span>{formatK(row.totalK)}</span>
                  <span className={row.status === 'success' ? 'status-ok' : 'status-bad'}>{row.status}</span>
                </div>
              ))
            ) : (
              <p className="empty-text">暂无模型调用记录</p>
            )}
          </div>
          <div className="delete-box">
            <div className="delete-title">
              <UserMinus size={17} />
              删除注册数据
            </div>
            <input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder="输入用户 ID 或用户名确认"
            />
            <button className="danger-button" type="button" disabled={!canDelete || deleting} onClick={onDelete}>
              {deleting ? <Loader2 className="spin" size={17} /> : <Trash2 size={17} />}
              确认删除
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function SystemFeedback({ dashboard }: { dashboard: DashboardData }) {
  const rows = [
    ['AI 地址', dashboard.systemFeedback.aiBaseUrlConfigured],
    ['AI Key', dashboard.systemFeedback.aiApiKeyConfigured],
    ['Token 记录', dashboard.systemFeedback.tokenUsageTrackingEnabled],
  ] as const
  return (
    <section className="panel">
      <PanelTitle icon={<Database size={18} />} title="系统状态" />
      <div className="status-list">
        {rows.map(([label, ok]) => (
          <div className="status-item" key={label}>
            <span>{label}</span>
            <span className={ok ? 'pill ok' : 'pill warn'}>{ok ? '已配置' : '未配置'}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function UserTable({
  users,
  onEditUser,
  onDeleteUser,
}: {
  users: RecentUser[]
  onEditUser: (userId: string, payload: { username: string; displayName: string }) => Promise<void>
  onDeleteUser: (user: RecentUser, confirm: string) => Promise<void>
}) {
  const [editingUserId, setEditingUserId] = useState('')
  const [deletingUserId, setDeletingUserId] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [rowConfirm, setRowConfirm] = useState('')
  const [rowBusy, setRowBusy] = useState('')

  function openEdit(user: RecentUser) {
    setEditingUserId(user.id)
    setDeletingUserId('')
    setEditUsername(user.username)
    setEditDisplayName(user.displayName)
    setRowConfirm('')
  }

  function openDelete(user: RecentUser) {
    setDeletingUserId(user.id)
    setEditingUserId('')
    setEditUsername('')
    setEditDisplayName('')
    setRowConfirm('')
  }

  async function saveEdit(user: RecentUser) {
    const username = editUsername.trim()
    const displayName = editDisplayName.trim()
    if (!username) {
      return
    }
    setRowBusy(user.id)
    try {
      await onEditUser(user.id, { username, displayName })
      setEditingUserId('')
    } finally {
      setRowBusy('')
    }
  }

  async function confirmDelete(user: RecentUser) {
    setRowBusy(user.id)
    try {
      await onDeleteUser(user, rowConfirm.trim())
      setDeletingUserId('')
      setRowConfirm('')
    } finally {
      setRowBusy('')
    }
  }

  return (
    <section className="panel">
      <PanelTitle icon={<Users size={18} />} title="用户清单" meta="默认最近 10 条" />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>用户</th>
              <th>注册时间</th>
              <th>路径</th>
              <th>任务</th>
              <th>打卡</th>
              <th>标签</th>
              <th>1 天</th>
              <th>7 天</th>
              <th>30 天</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isEditing = editingUserId === user.id
              const isDeleting = deletingUserId === user.id
              const canConfirmDelete = rowConfirm.trim() === user.id || rowConfirm.trim() === user.username
              return (
                <tr key={user.id} className={isEditing || isDeleting ? 'row-expanded' : undefined}>
                  <td>
                    {isEditing ? (
                      <div className="row-edit-form">
                        <label>
                          用户名
                          <input value={editUsername} onChange={(event) => setEditUsername(event.target.value)} />
                        </label>
                        <label>
                          昵称
                          <input value={editDisplayName} onChange={(event) => setEditDisplayName(event.target.value)} />
                        </label>
                      </div>
                    ) : (
                      <div className="user-cell">
                        <strong>{user.displayName || user.username || '未命名用户'}</strong>
                        <span>{user.username || user.id}</span>
                      </div>
                    )}
                  </td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{user.counts.goals}</td>
                  <td>{user.counts.tasks}</td>
                  <td>{user.counts.checkIns}</td>
                  <td>{user.counts.skillTags}</td>
                  <td>{formatK(user.tokenUsage.oneDayK)}</td>
                  <td>{formatK(user.tokenUsage.sevenDaysK)}</td>
                  <td>{formatK(user.tokenUsage.thirtyDaysK)}</td>
                  <td>
                    {isEditing ? (
                      <div className="row-actions wide">
                        <button
                          className="small-button primary"
                          type="button"
                          disabled={rowBusy === user.id || !editUsername.trim()}
                          onClick={() => void saveEdit(user)}
                        >
                          {rowBusy === user.id ? <Loader2 className="spin" size={15} /> : <CheckCircle2 size={15} />}
                          保存
                        </button>
                        <button className="small-button" type="button" onClick={() => setEditingUserId('')}>
                          取消
                        </button>
                      </div>
                    ) : isDeleting ? (
                      <div className="row-delete-form">
                        <input
                          value={rowConfirm}
                          onChange={(event) => setRowConfirm(event.target.value)}
                          placeholder="输入用户 ID 或用户名"
                        />
                        <div className="row-actions wide">
                          <button
                            className="small-button danger"
                            type="button"
                            disabled={rowBusy === user.id || !canConfirmDelete}
                            onClick={() => void confirmDelete(user)}
                          >
                            {rowBusy === user.id ? <Loader2 className="spin" size={15} /> : <Trash2 size={15} />}
                            删除
                          </button>
                          <button className="small-button" type="button" onClick={() => setDeletingUserId('')}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button className="small-icon-button" type="button" onClick={() => openEdit(user)} title="编辑用户">
                          <Pencil size={15} />
                        </button>
                        <button
                          className="small-icon-button danger"
                          type="button"
                          onClick={() => openDelete(user)}
                          title="删除用户"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function RecentGoals({ dashboard }: { dashboard: DashboardData }) {
  return (
    <section className="panel">
      <PanelTitle icon={<Database size={18} />} title="最近路径" />
      <div className="list-stack">
        {dashboard.recentGoals.length ? (
          dashboard.recentGoals.map((goal) => (
            <article className="list-item" key={goal.id}>
              <div>
                <strong>{goal.title}</strong>
                <span>{goal.username || goal.userId}</span>
              </div>
              <div className="right-note">
                <span>{goal.completedTasks}/{goal.totalTasks}</span>
                <span>{formatDate(goal.updatedAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-text">暂无路径数据</p>
        )}
      </div>
    </section>
  )
}

function RecentCheckIns({ dashboard }: { dashboard: DashboardData }) {
  return (
    <section className="panel">
      <PanelTitle icon={<CheckCircle2 size={18} />} title="最近打卡" />
      <div className="list-stack">
        {dashboard.recentCheckIns.length ? (
          dashboard.recentCheckIns.map((checkIn) => (
            <article className="list-item" key={checkIn.id}>
              <div>
                <strong>{checkIn.taskTitle || '未命名任务'}</strong>
                <span>{checkIn.goalTitle || checkIn.goalId}</span>
              </div>
              <div className="right-note">
                <span>{checkIn.username || checkIn.userId}</span>
                <span>{formatDate(checkIn.createdAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-text">暂无打卡数据</p>
        )}
      </div>
    </section>
  )
}

function PanelTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="panel-title">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      {meta ? <span>{meta}</span> : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function signedNumber(value: number) {
  if (value > 0) {
    return `+${value}`
  }
  return String(value)
}

function formatK(value: number | undefined) {
  return `${(value ?? 0).toFixed(1)}K`
}

function formatDate(value: string) {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function operationLabel(value: string) {
  if (value === 'generate_plan') {
    return '路径生成'
  }
  if (value === 'extract_skills') {
    return '能力提炼'
  }
  return value
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : '请求失败'
}

export default App
