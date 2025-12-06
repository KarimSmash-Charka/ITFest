import React, { useEffect, useState } from 'react'
import './App.css'

type ScreenId =
  | 'submit'
  | 'conversation'
  | 'operator'
  | 'dashboard'
  | 'email-demo'

type Priority = 'low' | 'medium' | 'high'
type Status = 'new' | 'in-progress' | 'auto-resolved' | 'assigned' | 'closed'

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: number
  role: ChatRole
  text: string
}

interface TicketRow {
  id: string
  source: 'Web' | 'Email' | 'Phone'
  category: string
  priority: Priority
  department: string
  status: Status
  createdAt: string
  assignedTo: string
  summary?: string
  lastText?: string
  answer?: string
  autoResolve?: boolean
  needHuman?: boolean
  language?: 'ru' | 'kk'
  history?: { role: ChatRole; text: string }[]
}

interface RouterResult {
  ticket_id?: string
  category: string
  priority: Priority
  department: string
  auto_resolve: boolean
  need_human: boolean
  answer: string
  summary: string
  language: 'ru' | 'kk'
}

interface Metrics {
  total_tickets: number
  auto_resolved_pct: number
  assigned_to_humans: number
  avg_auto_response_time: string
  avg_resolution_time: string
  by_category: { category: string; count: number }[]
}

const MOCK_TICKETS: TicketRow[] = [
  {
    id: '#1234',
    source: 'Web',
    category: 'Авторизация',
    priority: 'high',
    department: 'Support',
    status: 'assigned',
    createdAt: 'Сегодня, 10:24',
    assignedTo: 'Aruzhan',
  },
  {
    id: '#1233',
    source: 'Email',
    category: 'Платежи',
    priority: 'medium',
    department: 'Billing',
    status: 'auto-resolved',
    createdAt: 'Сегодня, 09:58',
    assignedTo: 'AI Assistant',
  },
  {
    id: '#1227',
    source: 'Phone',
    category: 'Общий вопрос',
    priority: 'low',
    department: 'Support',
    status: 'closed',
    createdAt: 'Вчера, 17:02',
    assignedTo: 'Aset',
  },
]

function priorityClass(priority: Priority) {
  if (priority === 'high') return 'chip chip-pill chip-priority-high'
  if (priority === 'medium') return 'chip chip-pill chip-priority-medium'
  return 'chip chip-pill chip-priority-low'
}

function statusChip(status: Status) {
  if (status === 'auto-resolved') {
    return <span className="chip chip-pill chip-status-auto">Auto-resolved ⚡</span>
  }

  if (status === 'assigned' || status === 'in-progress') {
    return (
      <span className="chip chip-pill chip-status-assigned">
        {status === 'assigned' ? 'Assigned' : 'In progress'}
      </span>
    )
  }

  if (status === 'closed') {
    return <span className="chip chip-pill chip-status-closed">Closed</span>
  }

  return <span className="pill-muted">Новый</span>
}

function App() {
  const [screen, setScreen] = useState<ScreenId>('submit')
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authIsLoading, setAuthIsLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [source, setSource] = useState<'Web' | 'Email' | 'Phone'>('Web')
  const [problem, setProblem] = useState('')
  const [ticketCreated, setTicketCreated] = useState(false)
  const [routerResult, setRouterResult] = useState<RouterResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [ticketsError, setTicketsError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [metricsError, setMetricsError] = useState<string | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null)
  const [conversationInput, setConversationInput] = useState('')
  const [conversationIsLoading, setConversationIsLoading] = useState(false)
  const [conversationError, setConversationError] = useState<string | null>(null)
  const [conversationMessages, setConversationMessages] = useState<ChatMessage[]>([])
  const [inlineSummary, setInlineSummary] = useState<string | null>(null)
  const [isClosingTicket, setIsClosingTicket] = useState(false)

  // Load tickets when entering operator view
  useEffect(() => {
    if (screen !== 'operator') return

    const load = async () => {
      try {
        setTicketsError(null)
        const url =
          currentUserEmail != null && currentUserEmail.trim() !== ''
            ? `http://127.0.0.1:5000/tickets?email=${encodeURIComponent(currentUserEmail)}`
            : 'http://127.0.0.1:5000/tickets'
        const response = await fetch(url)
        if (!response.ok) throw new Error(`Backend error: ${response.status}`)
        const data = (await response.json()) as any[]

        const mapped: TicketRow[] = data.map((t) => ({
          id: t.id ?? '#0',
          source: (t.source as TicketRow['source']) ?? 'Web',
          category: t.category ?? '—',
          priority: (t.priority as Priority) ?? 'medium',
          department: t.department ?? 'Support',
          status: (t.status as Status) ?? 'assigned',
          createdAt: t.created_at ?? '',
          assignedTo: t.assigned_to ?? 'AI Assistant',
          summary: t.summary,
          lastText: t.last_text,
          answer: t.answer,
          autoResolve: t.auto_resolve,
          needHuman: t.need_human,
          language: t.language as 'ru' | 'kk' | undefined,
          history: Array.isArray(t.history)
            ? (t.history as any[]).map((m) => ({
                role: (m.role === 'assistant' ? 'assistant' : 'user') as ChatRole,
                text: (m.text ?? m.content ?? '') as string,
              }))
            : undefined,
        }))

        if (mapped.length) {
          setTickets(mapped)
        }
      } catch (err) {
        console.error(err)
        setTicketsError(
          'Не удалось загрузить тикеты с backend. Показаны локальные мок-данные.',
        )
        setTickets(MOCK_TICKETS)
      }
    }

    void load()
  }, [screen, currentUserEmail])

  // Если пользователь не авторизован, не даём находиться на защищённых экранах
  useEffect(() => {
    if (!currentUserEmail && screen !== 'submit') {
      setScreen('submit')
    }
  }, [currentUserEmail, screen])

  // Сброс локального summary при смене тикета или экрана
  useEffect(() => {
    setInlineSummary(null)
  }, [selectedTicket, screen])

  // Load metrics when entering dashboard view
  useEffect(() => {
    if (screen !== 'dashboard') return

    const load = async () => {
      try {
        setMetricsError(null)
        const response = await fetch('http://127.0.0.1:5000/metrics')
        if (!response.ok) throw new Error(`Backend error: ${response.status}`)
        const data = (await response.json()) as Metrics
        setMetrics(data)
      } catch (err) {
        console.error(err)
        setMetricsError('Не удалось загрузить метрики, показаны мок-значения.')
      }
    }

    void load()
  }, [screen])

  return (
    <div className="app-root">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          <div className="app-brand">
            <div className="app-brand-mark" aria-hidden="true" />
            <div>
              <div className="app-brand-text">HelpDesk AI</div>
              <div className="text-xs text-soft">AI-first Support Platform</div>
            </div>
          </div>

          <nav className="app-nav" aria-label="Primary navigation">
            <button
              type="button"
              className={`app-nav-button ${
                screen === 'submit' ? 'app-nav-button--active' : ''
              }`}
              onClick={() => setScreen('submit')}
            >
              Пользователь
              <span>New ticket</span>
            </button>
            <button
              type="button"
              className={`app-nav-button ${
                screen === 'conversation' ? 'app-nav-button--active' : ''
              }`}
              onClick={() => {
                if (!currentUserEmail) {
                  window.alert(
                    'Чтобы открыть диалог, сначала войдите или зарегистрируйтесь по email на вкладке «Пользователь».',
                  )
                  return
                }
                // При явном переходе на вкладку "Диалог" сбрасываем выбранный тикет,
                // чтобы не "залипать" в режиме просмотра конкретного тикета.
                setSelectedTicket(null)
                setConversationMessages([])
                setConversationInput('')
                setConversationError(null)
                setInlineSummary(null)
                setScreen('conversation')
              }}
            >
              Диалог
              <span>Ticket thread</span>
            </button>
            <button
              type="button"
              className={`app-nav-button ${
                screen === 'operator' ? 'app-nav-button--active' : ''
              }`}
              onClick={() => {
                if (!currentUserEmail) {
                  window.alert(
                    'Чтобы открыть список тикетов, сначала войдите или зарегистрируйтесь по email на вкладке «Пользователь».',
                  )
                  return
                }
                setScreen('operator')
              }}
            >
              Оператор
              <span>Tickets</span>
            </button>
            <button
              type="button"
              className={`app-nav-button ${
                screen === 'dashboard' ? 'app-nav-button--active' : ''
              }`}
              onClick={() => {
                if (!currentUserEmail) {
                  window.alert(
                    'Чтобы открыть дашборд, сначала войдите или зарегистрируйтесь по email на вкладке «Пользователь».',
                  )
                  return
                }
                setScreen('dashboard')
              }}
            >
              Дашборд
              <span>Admin</span>
            </button>
            <button
              type="button"
              className={`app-nav-button ${
                screen === 'email-demo' ? 'app-nav-button--active' : ''
              }`}
              onClick={() => {
                if (!currentUserEmail) {
                  window.alert(
                    'Чтобы открыть email demo, сначала войдите или зарегистрируйтесь по email на вкладке «Пользователь».',
                  )
                  return
                }
                setScreen('email-demo')
              }}
            >
              Email demo
              <span>Integration</span>
            </button>
          </nav>

          <div className="app-user-chip">
            <div className="app-user-avatar">
              {currentUserEmail ? currentUserEmail[0].toUpperCase() : 'G'}
            </div>
            <div className="app-user-name">
              {currentUserEmail || 'Гость'}
            </div>
          </div>
        </div>
      </header>

      <main className="app-shell">
        {screen === 'submit' && (
          <section className="app-page" aria-label="New ticket">
            <div className="page-header">
              <div>
                <h1 className="page-title">Отправить заявку</h1>
                <p className="page-subtitle">
                  Опишите вашу проблему, а ИИ автоматически создаст тикет и
                  предложит решение.
                </p>
              </div>
              <div className="badge-soft">
                Desktop · 1440px
                <span className="chip-dot chip-dot--muted" />
                Public user flow
              </div>
            </div>

            {/* Блок авторизации по email */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <div>
                  <div className="card-title">
                    {currentUserEmail ? 'Вы вошли в систему' : 'Вход / Регистрация'}
                  </div>
                  <div className="card-subtitle">
                    Тикеты и диалоги будут сохраняться отдельно для каждого email.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  maxWidth: 360,
                }}
              >
                <input
                  className="input"
                  type="email"
                  placeholder="your.email@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
                <input
                  className="input"
                  type="password"
                  placeholder="Пароль"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
                {authError && (
                  <div
                    className="text-xs"
                    style={{ color: '#b91c1c', marginTop: 2 }}
                  >
                    {authError}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    className="button button-small"
                    onClick={async () => {
                      const email = authEmail.trim().toLowerCase()
                      if (!email || !authPassword) {
                        setAuthError('Введите email и пароль.')
                        return
                      }
                      setAuthError(null)
                      setAuthIsLoading(true)
                      setAuthMode('login')
                      try {
                        const response = await fetch(
                          'http://127.0.0.1:5000/login',
                          {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              email,
                              password: authPassword,
                            }),
                          },
                        )
                        if (!response.ok) {
                          const data = (await response.json().catch(() => ({}))) as {
                            message?: string
                          }
                          throw new Error(
                            data.message || `Ошибка входа: ${response.status}`,
                          )
                        }
                        setCurrentUserEmail(email)
                      } catch (err) {
                        console.error(err)
                        setAuthError(
                          err instanceof Error
                            ? err.message
                            : 'Не удалось выполнить вход.',
                        )
                      } finally {
                        setAuthIsLoading(false)
                      }
                    }}
                  >
                    {authIsLoading && authMode === 'login' ? 'Вход...' : 'Войти'}
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={async () => {
                      const email = authEmail.trim().toLowerCase()
                      if (!email || !authPassword) {
                        setAuthError('Введите email и пароль.')
                        return
                      }
                      setAuthError(null)
                      setAuthIsLoading(true)
                      setAuthMode('register')
                      try {
                        const response = await fetch(
                          'http://127.0.0.1:5000/register',
                          {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                              email,
                              password: authPassword,
                            }),
                          },
                        )
                        if (!response.ok) {
                          const data = (await response.json().catch(() => ({}))) as {
                            message?: string
                          }
                          throw new Error(
                            data.message ||
                              `Ошибка регистрации: ${response.status}`,
                          )
                        }
                        setCurrentUserEmail(email)
                      } catch (err) {
                        console.error(err)
                        setAuthError(
                          err instanceof Error
                            ? err.message
                            : 'Не удалось выполнить регистрацию.',
                        )
                      } finally {
                        setAuthIsLoading(false)
                      }
                    }}
                  >
                    {authIsLoading && authMode === 'register'
                      ? 'Регистрация...'
                      : 'Зарегистрироваться'}
                  </button>
                  {currentUserEmail && (
                    <button
                      type="button"
                      className="button button-ghost button-small"
                      onClick={() => {
                        setCurrentUserEmail(null)
                      }}
                    >
                      Выйти
                    </button>
                  )}
                </div>
                {currentUserEmail && (
                  <div className="text-xs text-soft">
                    Вы вошли как <span className="text-strong">{currentUserEmail}</span>.
                    Все новые тикеты и эскалации будут привязаны к этому email.
                  </div>
                )}
              </div>
            </div>

            <div className="layout-split">
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Форма обращения</div>
                    <div className="card-subtitle">
                      Минимум полей — максимум автоматизации.
                    </div>
                  </div>
                </div>

                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    if (!problem.trim()) {
                      setError('Пожалуйста, опишите проблему перед отправкой.')
                      return
                    }

                    if (!currentUserEmail) {
                      setError(
                        'Чтобы отправить заявку, сначала войдите или зарегистрируйтесь по email выше.',
                      )
                      return
                    }

                    setError(null)
                    setTicketCreated(false)
                    setIsLoading(true)

                    try {
                      const backendSource =
                        source === 'Web'
                          ? 'web'
                          : source === 'Email'
                          ? 'email'
                          : 'phone'

                      const response = await fetch('http://127.0.0.1:5000/tickets', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          input: {
                            text: problem,
                            source: backendSource,
                            user_email: currentUserEmail,
                          },
                        }),
                      })

                      if (!response.ok) {
                        throw new Error(`Backend error: ${response.status}`)
                      }

                      const data = (await response.json()) as RouterResult
                      setRouterResult(data)
                      setTicketCreated(true)
                    } catch (err) {
                      console.error(err)
                      setError(
                        'Не удалось связаться с HelpDesk AI. Попробуйте позже или проверьте, запущен ли backend на :5000.',
                      )
                      setRouterResult(null)
                      setTicketCreated(false)
                    } finally {
                      setIsLoading(false)
                    }
                  }}
                >
                  <div className="field">
                    <label className="field-label" htmlFor="problem">
                      Опишите вашу проблему
                    </label>
                    <textarea
                      id="problem"
                      className="textarea"
                      placeholder="Например: Не могу войти в личный кабинет, пишет «неверный пароль», хотя я уверен, что он правильный…"
                      value={problem}
                      onChange={(event) => setProblem(event.target.value)}
                    />
                    <div className="field-description">
                      Чем детальнее описание, тем лучше ИИ сможет классифицировать
                      тикет.
                    </div>
                  </div>

                  <div className="field">
                    <label className="field-label" htmlFor="source">
                      Источник
                    </label>
                    <select
                      id="source"
                      className="select"
                      value={source}
                      onChange={(event) =>
                        setSource(event.target.value as 'Web' | 'Email' | 'Phone')
                      }
                    >
                      <option value="Web">Web</option>
                      <option value="Email">Email</option>
                      <option value="Phone">Phone</option>
                    </select>
                  </div>

                  {error && (
                    <div
                      className="text-xs"
                      style={{ color: '#b91c1c', marginTop: 4, marginBottom: 4 }}
                    >
                      {error}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      marginTop: '8px',
                    }}
                  >
                    <span className="text-xs text-soft">
                      Нажимая «Отправить заявку», вы запускаете авто-обработку
                      обращения ИИ.
                    </span>
                    <button type="submit" className="button">
                      {isLoading ? 'Отправка…' : 'Отправить заявку'}
                    </button>
                  </div>
                </form>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Диалог с ИИ</div>
                    <div className="card-subtitle">
                      Ответ ИИ в виде аккуратной чат-ленты после отправки заявки.
                    </div>
                  </div>
                </div>

                <div className="chat-shell">
                  <div className="chat-meta-strip">
                    <div className="chat-meta-main">
                      {routerResult?.ticket_id || 'Ticket #1234'}
                    </div>
                    <div className="chat-meta-divider" />
                    <div className="chip">
                      Category:{' '}
                      <span className="text-strong">
                        {routerResult?.category || 'Login issues'}
                      </span>
                    </div>
                    <div
                      className={priorityClass(routerResult?.priority || 'high')}
                    >
                      {(routerResult?.priority || 'high').toUpperCase()}
                    </div>
                    {statusChip(
                      ticketCreated
                        ? routerResult?.auto_resolve
                          ? 'auto-resolved'
                          : 'assigned'
                        : 'new',
                    )}
                  </div>

                  <div className="chat-stream" aria-label="Ticket conversation">
                    <div className="chat-message chat-message--left">
                      <div className="chat-message-meta">Вы · Сегодня, 10:24</div>
                      <div className="chat-message-body chat-bubble-user">
                        {problem || 'Не могу войти в личный кабинет, пишет ошибку.'}
                      </div>
                    </div>

                    {ticketCreated ? (
                      <>
                        <div className="chat-message chat-message--right">
                          <div className="chat-message-meta">HelpDesk AI · live</div>
                          <div className="chat-message-body chat-bubble-ai">
                            {routerResult?.answer ||
                              'Ответ от HelpDesk AI будет показан здесь.'}
                          </div>
                        </div>
                        {routerResult?.summary && (
                          <div className="chat-message chat-message--right">
                            <div className="chat-message-meta text-xs">
                              Summary · модель
                            </div>
                            <div className="chat-message-body chat-bubble-ai">
                              <div className="text-xs">{routerResult.summary}</div>
                            </div>
                          </div>
                        )}
                        <div
                          style={{
                            marginTop: 8,
                            display: 'flex',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <button
                            type="button"
                            className="button button-secondary button-small"
                            onClick={async () => {
                              if (!routerResult?.ticket_id) {
                                window.alert(
                                  'Сначала отправьте заявку, чтобы появился тикет.',
                                )
                                return
                              }
                              try {
                                const idForApi = encodeURIComponent(
                                  routerResult.ticket_id,
                                )
                                const response = await fetch(
                                  `http://127.0.0.1:5000/tickets/${idForApi}/resolve`,
                                  {
                                    method: 'POST',
                                  },
                                )
                                if (!response.ok) {
                                  throw new Error(
                                    `Backend error: ${response.status}`,
                                  )
                                }
                                setTicketCreated(false)
                                setRouterResult((prev) =>
                                  prev
                                    ? { ...prev, auto_resolve: true }
                                    : prev,
                                )
                                setError(
                                  'Спасибо, что подтвердили решение. Тикет помечен как auto-resolved.',
                                )
                              } catch (err) {
                                console.error(err)
                                setError(
                                  'Не удалось пометить тикет как решённый. Попробуйте позже.',
                                )
                              }
                            }}
                          >
                            Проблема решена
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="chat-message chat-message--right">
                        <div className="chat-message-meta text-xs">
                          HelpDesk AI готов · ждёт описание
                        </div>
                        <div className="chat-message-body chat-bubble-ai">
                          Опишите, пожалуйста, вашу проблему и нажмите
                          «Отправить заявку» — я создам тикет и предложу решение
                          за пару секунд.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {screen === 'conversation' && (
          <section className="app-page" aria-label="Ticket conversation">
            <div className="page-header">
              <div>
                <h1 className="page-title">Диалог по тикету</h1>
                <p className="page-subtitle">
                  Полный контекст общения: пользователь, ИИ и оператор в одной
                  чёткой ленте.
                </p>
                <p className="page-subtitle">
                  Нажмите заново на страницу &laquo;Диалог&raquo;, чтобы открыть новый
                  чат.
                </p>
              </div>
              <div className="badge-soft">
                {selectedTicket?.id || 'Ticket #1234'}
                <span className="chip-dot chip-dot--success" />
                {(selectedTicket?.status === 'auto-resolved'
                  ? 'Auto-resolved'
                  : 'Assigned') || 'Auto-resolved'}
              </div>
            </div>

            <div className="layout-split">
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      {selectedTicket?.id || 'Ticket #1234'}
                    </div>
                    <div className="card-subtitle">
                      {selectedTicket
                        ? `${selectedTicket.category} · ${
                            selectedTicket.priority === 'high'
                              ? 'Высокий приоритет'
                              : selectedTicket.priority === 'medium'
                              ? 'Средний приоритет'
                              : 'Низкий приоритет'
                          }`
                        : 'Авторизация · Высокий приоритет'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <div className="chip">
                      Category:{' '}
                      <span className="text-strong">
                        {selectedTicket?.category || 'Login issues'}
                      </span>
                    </div>
                    <div
                      className={priorityClass(
                        selectedTicket?.priority || 'high',
                      )}
                    >
                      {(selectedTicket?.priority || 'high').toUpperCase()}
                    </div>
                    <span className="chip chip-pill">
                      Department: {selectedTicket?.department || 'Support'}
                    </span>
                    {statusChip(selectedTicket?.status || 'assigned')}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginBottom: 8,
                  }}
                >
                  <button
                    type="button"
                    className="button button-secondary button-small"
                    onClick={() => {
                      // Полный сброс текущего диалога и возврат к новому чату
                      setSelectedTicket(null)
                      setConversationMessages([])
                      setConversationInput('')
                      setConversationError(null)
                      setInlineSummary(null)
                    }}
                  >
                    Начать новый диалог
                  </button>
                </div>

                <div className="chat-shell">
                  <div className="chat-stream">
                    {selectedTicket ? (
                      <>
                        {(selectedTicket.history && selectedTicket.history.length
                          ? selectedTicket.history
                          : [
                              { role: 'user' as ChatRole, text: selectedTicket.lastText || '' },
                              {
                                role: 'assistant' as ChatRole,
                                text:
                                  selectedTicket.answer ||
                                  'Ответ модели по этому тикету будет отображаться здесь.',
                              },
                            ]
                        ).map((msg, index) => (
                          <div
                            key={index}
                            className={`chat-message ${
                              msg.role === 'user'
                                ? 'chat-message--left'
                                : 'chat-message--right'
                            }`}
                          >
                            <div className="chat-message-meta">
                              {msg.role === 'user'
                                ? 'Пользователь'
                                : 'HelpDesk AI · ответ'}
                            </div>
                            <div
                              className={`chat-message-body ${
                                msg.role === 'user'
                                  ? 'chat-bubble-user'
                                  : 'chat-bubble-ai'
                              }`}
                            >
                              {msg.text ||
                                (msg.role === 'user'
                                  ? 'Текст обращения пользователя будет отображаться здесь.'
                                  : 'Ответ модели по этому тикету будет отображаться здесь.')}
                            </div>
                          </div>
                        ))}

                        <div className="chat-note">
                          <div className="chat-note-bubble">
                            <div className="chat-note-tag">internal</div>
                            <div className="text-xs">
                              {selectedTicket.summary ||
                                'Краткое резюме тикета и гипотезы модели появятся здесь.'}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      conversationMessages.length ? (
                        conversationMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`chat-message ${
                              msg.role === 'user'
                                ? 'chat-message--left'
                                : 'chat-message--right'
                            }`}
                          >
                            <div className="chat-message-meta">
                              {msg.role === 'user'
                                ? 'Вы · сообщение'
                                : 'HelpDesk AI · live'}
                            </div>
                            <div
                              className={`chat-message-body ${
                                msg.role === 'user'
                                  ? 'chat-bubble-user'
                                  : 'chat-bubble-ai'
                              }`}
                            >
                              {msg.text}
                            </div>
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="chat-message chat-message--left">
                            <div className="chat-message-meta">
                              Пользователь · 10:24
                            </div>
                            <div className="chat-message-body chat-bubble-user">
                              Не получается войти в аккаунт, пробовал уже несколько
                              раз.
                            </div>
                          </div>

                          <div className="chat-message chat-message--right">
                            <div className="chat-message-meta">
                              HelpDesk AI · 10:24
                            </div>
                            <div className="chat-message-body chat-bubble-ai">
                              Проверил последние попытки авторизации — вижу несколько
                              неуспешных входов с ошибкой «неверный пароль». Я могу:
                              <ul style={{ margin: '6px 0 0 18px' }}>
                                <li>
                                  отправить вам безопасную ссылку для сброса пароля;
                                </li>
                                <li>
                                  очистить активные сессии на других устройствах;
                                </li>
                              </ul>
                              <div style={{ marginTop: 8, fontSize: 12 }}>
                                Ответьте «Да», чтобы продолжить автоматически.
                              </div>
                            </div>
                          </div>

                          <div className="chat-message chat-message--left">
                            <div className="chat-message-meta">
                              Пользователь · 10:25
                            </div>
                            <div className="chat-message-body chat-bubble-user">
                              Да, давайте сбросим пароль.
                            </div>
                          </div>

                          <div className="chat-message chat-message--right">
                            <div className="chat-message-meta">
                              HelpDesk AI · 10:25
                            </div>
                            <div className="chat-message-body chat-bubble-ai">
                              Я отправил вам письмо с ссылкой для сброса пароля. Срок
                              действия: 30 минут.
                            </div>
                          </div>

                          <div className="chat-message chat-message--right">
                            <div className="chat-message-meta">Operator · 10:26</div>
                            <div className="chat-message-body chat-bubble-operator">
                              Если ссылка не придёт в течение 5 минут, пожалуйста,
                              проверьте папку «Спам» или напишите сюда ещё раз.
                            </div>
                          </div>

                          <div className="chat-note">
                            <div className="chat-note-bubble">
                              <div className="chat-note-tag">internal</div>
                              <div className="text-xs">
                                Пользователь часто забывает пароль, можно предложить
                                включить вход по biometrics в следующей версии.
                              </div>
                            </div>
                          </div>
                        </>
                      )
                    )}
                  </div>

                  <div className="chat-input-bar">
                    <div className="chat-input-row">
                      <textarea
                        className="chat-input"
                        placeholder="Написать сообщение"
                        value={conversationInput}
                        onChange={(event) =>
                          setConversationInput(event.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="button button-small"
                        onClick={async () => {
                          const text = conversationInput.trim()
                          if (!text) {
                            setConversationError(
                              'Введите текст сообщения перед отправкой.',
                            )
                            return
                          }

                          if (!currentUserEmail) {
                            setConversationError(
                              'Чтобы писать в чат с ИИ, сначала войдите или зарегистрируйтесь по email на вкладке «Пользователь».',
                            )
                            return
                          }

                          setConversationError(null)
                          setConversationIsLoading(true)

                          const newUserMessage: ChatMessage = {
                            id: Date.now(),
                            role: 'user',
                            text,
                          }

                          const historyToSend = [
                            ...conversationMessages,
                            newUserMessage,
                          ].map((msg) => ({
                            role: msg.role,
                            content: msg.text,
                          }))

                          setConversationMessages((prev) => [
                            ...prev,
                            newUserMessage,
                          ])

                          try {
                            const response = await fetch(
                              'http://127.0.0.1:5000/ask',
                              {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  text,
                                  history: historyToSend,
                                  email: currentUserEmail,
                                }),
                              },
                            )

                            if (!response.ok) {
                              throw new Error(
                                `Backend error: ${response.status}`,
                              )
                            }

                            const data = (await response.json()) as {
                              reply?: string
                            }
                            const aiText = data.reply ?? ''
                            const aiMessage: ChatMessage = {
                              id: Date.now() + 1,
                              role: 'assistant',
                              text: aiText,
                            }
                            setConversationMessages((prev) => [...prev, aiMessage])
                          } catch (err) {
                            console.error(err)
                            setConversationError(
                              'Не удалось получить ответ от бэкенда. Проверьте, что backend запущен на :5000.',
                            )
                          } finally {
                            setConversationIsLoading(false)
                            setConversationInput('')
                          }
                        }}
                      >
                        {conversationIsLoading ? 'Отправка…' : 'Отправить'}
                      </button>
                    </div>
                    {conversationError && (
                      <div
                        className="text-xs"
                        style={{ color: '#b91c1c', marginTop: 4 }}
                      >
                        {conversationError}
                      </div>
                    )}
                    <div className="chat-actions chat-actions-right">
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={async () => {
                          if (!selectedTicket) {
                            window.alert(
                              'Сначала откройте тикет через страницу «Оператор», чтобы сделать summary.',
                            )
                            return
                          }
                          try {
                            setConversationError(null)
                            const response = await fetch(
                              'http://127.0.0.1:5000/summarize',
                              {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  user_text: selectedTicket.lastText || '',
                                  ai_answer: selectedTicket.answer || '',
                                  summary: selectedTicket.summary || '',
                                }),
                              },
                            )
                            if (!response.ok) {
                              throw new Error(
                                `Backend error: ${response.status}`,
                              )
                            }
                            const data = (await response.json()) as {
                              summary?: string
                            }
                            setInlineSummary(
                              data.summary ||
                                selectedTicket.summary ||
                                'Для этого тикета пока нет готового summary от модели.',
                            )
                          } catch (err) {
                            console.error(err)
                            setConversationError(
                              'Не удалось построить summary. Проверьте backend или попробуйте позже.',
                            )
                          }
                        }}
                      >
                        Сделать summary
                      </button>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={async () => {
                          if (!selectedTicket) {
                            window.alert(
                              'Чтобы перевести диалог, сначала откройте тикет через страницу «Оператор».',
                            )
                            return
                          }
                          try {
                            setConversationError(null)
                            const response = await fetch(
                              'http://127.0.0.1:5000/translate',
                              {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  target_language: 'ru',
                                  user_text: selectedTicket.lastText || '',
                                  ai_answer: selectedTicket.answer || '',
                                  summary: selectedTicket.summary || '',
                                }),
                              },
                            )
                            if (!response.ok) {
                              throw new Error(
                                `Backend error: ${response.status}`,
                              )
                            }
                            const data = (await response.json()) as {
                              user_text?: string
                              ai_answer?: string
                              summary?: string
                            }
                            const updated: TicketRow = {
                              ...selectedTicket,
                              lastText: data.user_text ?? selectedTicket.lastText,
                              answer: data.ai_answer ?? selectedTicket.answer,
                              summary: data.summary ?? selectedTicket.summary,
                            }
                            setSelectedTicket(updated)
                            setTickets((prev) =>
                              prev.map((t) => (t.id === updated.id ? updated : t)),
                            )
                            // После перевода просим ИИ заново сделать summary на русском
                            try {
                              const sumResponse = await fetch(
                                'http://127.0.0.1:5000/summarize',
                                {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    user_text: updated.lastText || '',
                                    ai_answer: updated.answer || '',
                                    summary: updated.summary || '',
                                    language: 'ru',
                                  }),
                                },
                              )
                              if (sumResponse.ok) {
                                const sumData = (await sumResponse.json()) as {
                                  summary?: string
                                }
                                setInlineSummary(
                                  sumData.summary ||
                                    updated.summary ||
                                    inlineSummary ||
                                    null,
                                )
                              } else {
                                setInlineSummary(updated.summary ?? inlineSummary ?? null)
                              }
                            } catch {
                              setInlineSummary(updated.summary ?? inlineSummary ?? null)
                            }
                          } catch (err) {
                            console.error(err)
                            setConversationError(
                              'Не удалось перевести диалог на русский. Проверьте backend или попробуйте позже.',
                            )
                          }
                        }}
                      >
                        Перевести на русский
                      </button>
                      <button
                        type="button"
                        className="button button-secondary button-small"
                        onClick={async () => {
                          if (!selectedTicket) {
                            window.alert(
                              'Чтобы перевести диалог, сначала откройте тикет через страницу «Оператор».',
                            )
                            return
                          }
                          try {
                            setConversationError(null)
                            const response = await fetch(
                              'http://127.0.0.1:5000/translate',
                              {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  target_language: 'kk',
                                  user_text: selectedTicket.lastText || '',
                                  ai_answer: selectedTicket.answer || '',
                                  summary: selectedTicket.summary || '',
                                }),
                              },
                            )
                            if (!response.ok) {
                              throw new Error(
                                `Backend error: ${response.status}`,
                              )
                            }
                            const data = (await response.json()) as {
                              user_text?: string
                              ai_answer?: string
                              summary?: string
                            }
                            const updated: TicketRow = {
                              ...selectedTicket,
                              lastText: data.user_text ?? selectedTicket.lastText,
                              answer: data.ai_answer ?? selectedTicket.answer,
                              summary: data.summary ?? selectedTicket.summary,
                            }
                            setSelectedTicket(updated)
                            setTickets((prev) =>
                              prev.map((t) => (t.id === updated.id ? updated : t)),
                            )
                            // После перевода просим ИИ заново сделать summary на казахском
                            try {
                              const sumResponse = await fetch(
                                'http://127.0.0.1:5000/summarize',
                                {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify({
                                    user_text: updated.lastText || '',
                                    ai_answer: updated.answer || '',
                                    summary: updated.summary || '',
                                    language: 'kk',
                                  }),
                                },
                              )
                              if (sumResponse.ok) {
                                const sumData = (await sumResponse.json()) as {
                                  summary?: string
                                }
                                setInlineSummary(
                                  sumData.summary ||
                                    updated.summary ||
                                    inlineSummary ||
                                    null,
                                )
                              } else {
                                setInlineSummary(updated.summary ?? inlineSummary ?? null)
                              }
                            } catch {
                              setInlineSummary(updated.summary ?? inlineSummary ?? null)
                            }
                          } catch (err) {
                            console.error(err)
                            setConversationError(
                              'Не удалось перевести диалог на казахский. Проверьте backend или попробуйте позже.',
                            )
                          }
                        }}
                      >
                        Перевести на казахский
                      </button>
                      <button
                        type="button"
                        className="button button-danger button-small"
                        onClick={async () => {
                          if (!selectedTicket) {
                            window.alert(
                              'Чтобы закрыть тикет, сначала откройте его через страницу «Оператор».',
                            )
                            return
                          }
                          if (
                            !window.confirm(
                              `Вы уверены, что хотите закрыть и удалить тикет ${selectedTicket.id}?`,
                            )
                          ) {
                            return
                          }
                          try {
                            setConversationError(null)
                            setIsClosingTicket(true)
                            const idForApi = encodeURIComponent(selectedTicket.id)
                            const response = await fetch(
                              `http://127.0.0.1:5000/tickets/${idForApi}`,
                              {
                                method: 'DELETE',
                              },
                            )
                            if (!response.ok) {
                              throw new Error(
                                `Backend error: ${response.status}`,
                              )
                            }
                            setTickets((prev) =>
                              prev.filter((t) => t.id !== selectedTicket.id),
                            )
                            setSelectedTicket(null)
                            setInlineSummary(null)
                            setScreen('operator')
                          } catch (err) {
                            console.error(err)
                            setConversationError(
                              'Не удалось закрыть тикет. Проверьте backend или попробуйте позже.',
                            )
                          } finally {
                            setIsClosingTicket(false)
                          }
                        }}
                      >
                        {isClosingTicket ? 'Закрываем...' : 'Закрыть тикет'}
                      </button>
                    </div>
                    {inlineSummary && (
                      <div
                        className="text-xs text-soft"
                        style={{ marginTop: 6, maxWidth: 480 }}
                      >
                        <span className="text-strong">Summary: </span>
                        {inlineSummary}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <aside className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Сводка по тикету</div>
                    <div className="card-subtitle">
                      Метаданные, SLA и автоматические инсайты модели.
                    </div>
                  </div>
                </div>

                <div className="card-section">
                  <div className="card-section-title">Основное</div>
                  <div className="field">
                    <div className="field-label">Category</div>
                    <div className="pill-muted">
                      {selectedTicket?.category || 'Авторизация · Login issues'}
                    </div>
                  </div>
                  <div className="field">
                    <div className="field-label">Priority</div>
                    <div
                      className={priorityClass(
                        selectedTicket?.priority || 'high',
                      )}
                    >
                      {(selectedTicket?.priority || 'high').toUpperCase()}
                    </div>
                  </div>
                  <div className="field">
                    <div className="field-label">Department</div>
                    <div className="pill-muted">
                      {selectedTicket?.department || 'Support'}
                    </div>
                  </div>
                  <div className="field">
                    <div className="field-label">Status</div>
                    {statusChip(selectedTicket?.status || 'assigned')}
                  </div>
                </div>

                <div className="card-section">
                  <div className="card-section-title">AI Insights</div>
                  <ul className="text-small text-soft" style={{ paddingLeft: 16 }}>
                    <li>Вероятность auto-resolve: 82%</li>
                    <li>Предполагаемая причина: забытый пароль</li>
                    <li>Рекомендация: предложить biometric / passkeys</li>
                  </ul>
                </div>
              </aside>
            </div>
          </section>
        )}

        {screen === 'operator' && (
          <section className="app-page" aria-label="Operator tickets list">
            <div className="page-header">
              <div>
                <h1 className="page-title">Тикеты</h1>
                <p className="page-subtitle">
                  Единый список обращений с фильтрами по категории, приоритету и
                  статусу.
                </p>
              </div>
              <div className="badge-soft">
                First line automation
                <span className="chip-dot chip-dot--muted" />
                Operator view
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Фильтры</div>
                  <div className="card-subtitle">
                    Сфокусируйтесь на нужном сегменте тикетов за выбранный период.
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '10px',
                  alignItems: 'center',
                }}
              >
                <select className="select" defaultValue="">
                  <option value="">Category: All</option>
                  <option>Авторизация</option>
                  <option>Платежи</option>
                  <option>Общий вопрос</option>
                </select>
                <select className="select" defaultValue="">
                  <option value="">Priority: All</option>
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
                <select className="select" defaultValue="">
                  <option value="">Status: All</option>
                  <option>Новый</option>
                  <option>В работе</option>
                  <option>Auto-resolved</option>
                  <option>Закрыт</option>
                </select>

                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'inline-flex',
                    padding: 4,
                    borderRadius: 999,
                    background: 'rgba(15, 23, 42, 0.04)',
                    gap: 2,
                  }}
                  aria-label="Time filters"
                >
                  <button
                    type="button"
                    className="button button-ghost button-small"
                    style={{ borderRadius: 999, background: '#ffffff' }}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                  >
                    Last 24h
                  </button>
                  <button
                    type="button"
                    className="button button-ghost button-small"
                  >
                    Last 7 days
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">Список тикетов</div>
                  <div className="card-subtitle">
                    Просмотр и назначение обращений оператору или ИИ.
                  </div>
                </div>
                <div className="text-xs text-soft">
                  Показаны последние {MOCK_TICKETS.length} тикета
                </div>
              </div>

              {ticketsError && (
                <div
                  className="text-xs"
                  style={{ color: '#b91c1c', marginBottom: 8, marginTop: -4 }}
                >
                  {ticketsError}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                {tickets.length === 0 ? (
                  <div className="text-xs text-soft" style={{ padding: 12 }}>
                    Пока нет ни одного тикета. Создайте заявку на вкладке
                    &laquo;Пользователь&raquo;, затем вернитесь сюда.
                  </div>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Source</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Department</th>
                        <th>Status</th>
                        <th>Created_at</th>
                        <th>Assigned_to</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map((ticket) => (
                        <tr key={ticket.id}>
                          <td className="table-cell-mono">{ticket.id}</td>
                          <td>
                            <span className="table-tag">{ticket.source}</span>
                          </td>
                          <td>{ticket.category}</td>
                          <td>
                            <span className={priorityClass(ticket.priority)}>
                              {ticket.priority.toUpperCase()}
                            </span>
                          </td>
                          <td>{ticket.department}</td>
                          <td>{statusChip(ticket.status)}</td>
                          <td>{ticket.createdAt}</td>
                          <td>
                            <div className="chip">
                              <span
                                className="chip-dot chip-dot--muted"
                                aria-hidden="true"
                              />
                              {ticket.assignedTo}
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="button button-ghost button-small"
                              onClick={() => {
                                setSelectedTicket(ticket)
                                setScreen('conversation')
                              }}
                            >
                              Открыть
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        )}

        {screen === 'dashboard' && (
          <section className="app-page" aria-label="Admin dashboard">
            <div className="page-header">
              <div>
                <h1 className="page-title">Dashboard</h1>
                <p className="page-subtitle">
                  Ключевые метрики работы AI HelpDesk и эффективность авто-решений.
                </p>
              </div>
              <div className="badge-soft">
                Last 7 days
                <span className="chip-dot chip-dot--success" />
                {metrics ? 'Live data' : 'Mock'}
              </div>
            </div>

            <div className="layout-tiles-4">
              <div className="card">
                <div className="stat-label">Total tickets</div>
                <div className="stat-number">
                  {metrics ? metrics.total_tickets : '12 480'}
                </div>
                <div className="stat-trend trend-positive">+8.2% WoW</div>
              </div>
              <div className="card">
                <div className="stat-label">Auto-resolved</div>
                <div className="stat-number">
                  {metrics ? `${metrics.auto_resolved_pct}%` : '64%'}
                </div>
                <div className="stat-trend trend-positive">
                  +5.1% — меньше нагрузки на операторов
                </div>
              </div>
              <div className="card">
                <div className="stat-label">Assigned to humans</div>
                <div className="stat-number">
                  {metrics ? metrics.assigned_to_humans : '4 492'}
                </div>
                <div className="stat-trend text-soft">
                  {metrics
                    ? `${metrics.assigned_to_humans || 0} тикетов передано людям`
                    : '36% от всех тикетов'}
                </div>
              </div>
              <div className="card">
                <div className="stat-label">Avg auto-response time</div>
                <div className="stat-number">
                  {metrics?.avg_auto_response_time || '1.4s'}
                </div>
                <div className="stat-trend text-soft">
                  Avg resolution time:{' '}
                  <span className="text-strong">
                    {metrics?.avg_resolution_time || '7m 12s'}
                  </span>
                </div>
              </div>
            </div>

            <div className="layout-columns-2">
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">Tickets per day</div>
                    <div className="card-subtitle">
                      Равномерная загрузка в течение недели с пиками в понедельник.
                    </div>
                  </div>
                  <span className="pill-muted">View: per day</span>
                </div>
                <div className="chart-line" aria-hidden="true">
                  <div className="chart-line-grid" />
                  <div className="chart-line-path" />
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Auto-resolved vs Human-resolved
                    </div>
                    <div className="card-subtitle">
                      Доля обращений, полностью закрытых ИИ, без участия оператора.
                    </div>
                  </div>
                </div>

                <div className="card-section">
                  <div className="chart-pie">
                    <div
                      className="chart-pie-visual"
                      aria-hidden="true"
                      style={
                        metrics
                          ? {
                              background: `conic-gradient(#6366f1 0 ${Math.max(
                                0,
                                Math.min(100, metrics.auto_resolved_pct),
                              )}%, rgba(148, 163, 184, 0.9) ${Math.max(
                                0,
                                Math.min(100, metrics.auto_resolved_pct),
                              )}% 100%)`,
                            }
                          : undefined
                      }
                    />
                    <div className="chart-pie-legend">
                      <div className="chart-pie-legend-item">
                        <span
                          className="chip-dot chip-dot--success"
                          aria-hidden="true"
                        />
                        Auto-resolved ·{' '}
                        {metrics ? `${metrics.auto_resolved_pct}%` : '64%'}
                      </div>
                      <div className="chart-pie-legend-item">
                        <span
                          className="chip-dot chip-dot--muted"
                          aria-hidden="true"
                        />
                        Human-resolved ·{' '}
                        {metrics
                          ? `${100 - Math.min(100, Math.max(0, metrics.auto_resolved_pct))}%`
                          : '36%'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card-section">
                  <div className="card-section-title">Top categories by volume</div>
                  {metricsError && (
                    <div className="text-xs text-soft" style={{ marginBottom: 8 }}>
                      {metricsError}
                    </div>
                  )}
                  <div className="chart-bar" aria-hidden="true">
                    {(metrics?.by_category && metrics.by_category.length
                      ? metrics.by_category
                      : [
                          { category: 'Авторизация', count: 90 },
                          { category: 'Платежи', count: 120 },
                          { category: 'Подписки', count: 70 },
                          { category: 'Общий вопрос', count: 60 },
                        ]
                    ).map((item, index, arr) => {
                      const max =
                        arr.reduce(
                          (acc, x) => (x.count > acc ? x.count : acc),
                          1,
                        ) || 1
                      const height = `${40 + (item.count / max) * 80}px`
                      return (
                        <div key={item.category} className="chart-bar-item">
                          <div
                            className="chart-bar-bar"
                            style={{ height }}
                          />
                          <div className="chart-bar-label">{item.category}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="layout-columns-2">
              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Таблица ошибок маршрутизации (fake data)
                    </div>
                    <div className="card-subtitle">
                      Случаи, когда модель выбрала неверный department или category.
                    </div>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Original category</th>
                        <th>Predicted category</th>
                        <th>Confidence</th>
                        <th>Дата</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="table-cell-mono">#1199</td>
                        <td>Платежи</td>
                        <td>Общий вопрос</td>
                        <td>0.61</td>
                        <td>08.04, 14:10</td>
                      </tr>
                      <tr>
                        <td className="table-cell-mono">#1187</td>
                        <td>Авторизация</td>
                        <td>Подписки</td>
                        <td>0.57</td>
                        <td>07.04, 19:42</td>
                      </tr>
                      <tr>
                        <td className="table-cell-mono">#1181</td>
                        <td>Поддержка</td>
                        <td>Платежи</td>
                        <td>0.54</td>
                        <td>07.04, 10:18</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <div>
                    <div className="card-title">
                      Потенциальные улучшения модели
                    </div>
                    <div className="card-subtitle">
                      Hypothesis backlog, собранный из ошибок и пользовательских
                      паттернов.
                    </div>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Pattern</th>
                        <th>Описание</th>
                        <th>Impact</th>
                        <th>Рекомендация</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="table-cell-mono">login_2fa_sms</td>
                        <td>
                          Пользователи путают 2FA-коды из SMS и email-подтверждение.
                        </td>
                        <td>
                          <span className="chip chip-pill chip-priority-high">
                            high
                          </span>
                        </td>
                        <td>Добавить отдельный intent и явные тексты подсказок.</td>
                      </tr>
                      <tr>
                        <td className="table-cell-mono">billing_refund_delay</td>
                        <td>Вопросы по срокам возврата средств после отмены.</td>
                        <td>
                          <span className="chip chip-pill chip-priority-medium">
                            medium
                          </span>
                        </td>
                        <td>Обучить модель на новых шаблонах писем эквайера.</td>
                      </tr>
                      <tr>
                        <td className="table-cell-mono">general_language_mix</td>
                        <td>Смешанный RU/KZ/EN в одном обращении.</td>
                        <td>
                          <span className="chip chip-pill chip-priority-low">
                            low
                          </span>
                        </td>
                        <td>Добавить language-normalization шаг перед классификацией.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {screen === 'email-demo' && (
          <section className="app-page" aria-label="Email integration demo">
            <div className="page-header">
              <div>
                <h1 className="page-title">Email Integration Demo</h1>
                <p className="page-subtitle">
                  Как входящее письмо автоматически превращается в структурированный
                  тикет.
                </p>
              </div>
              <div className="badge-soft">
                Flow: Email → AI → Ticket
                <span className="chip-dot chip-dot--muted" />
                Demo
              </div>
            </div>

            <div className="email-layout">
              <div className="email-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <div className="card-title" style={{ fontSize: 14 }}>
                    Входящее письмо
                  </div>
                  <span className="email-badge">
                    <span className="chip-dot chip-dot--muted" />
                    Email
                  </span>
                </div>

                <div className="email-header-line">
                  <span>From: user@example.com</span>
                  <span>Сегодня, 09:52</span>
                </div>
                <div className="email-header-line">
                  <span>Subject: Проблема с доступом к аккаунту</span>
                </div>

                <div className="email-body">
                  Здравствуйте! Уже второй день не могу войти в своё приложение.
                  Система пишет, что пароль неверный, хотя я его не менял. Пытался
                  восстановить доступ, но письмо с подтверждением так и не пришло.
                  <br />
                  <br />
                  Можете, пожалуйста, помочь разобраться?
                </div>
              </div>

              <div className="email-arrow">
                <div className="email-arrow-line" aria-hidden="true" />
                <div>ИИ анализирует письмо</div>
                <div className="text-xs text-soft">
                  Extract · Classify · Prioritize · Route
                </div>
              </div>

              <div className="email-card">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <div className="card-title" style={{ fontSize: 14 }}>
                    Сформированный тикет
                  </div>
                  <span className="pill-muted">auto_generate: on</span>
                </div>

                <div className="card-section">
                  <div className="card-section-title">Extracted text</div>
                  <div
                    className="text-small text-mono"
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: 'var(--color-surface-subtle)',
                      border: '1px solid var(--color-border-soft)',
                    }}
                  >
                    &quot;user@example.com&quot; → &quot;Проблема с доступом к
                    аккаунту, письмо для восстановления не приходит&quot;
                  </div>
                </div>

                <div className="card-section">
                  <div className="card-section-title">Classification</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      gap: 10,
                    }}
                  >
                    <div className="field">
                      <div className="field-label">Category</div>
                      <div className="pill-muted">Авторизация · Login issues</div>
                    </div>
                    <div className="field">
                      <div className="field-label">Priority</div>
                      <div className={priorityClass('medium')}>Medium</div>
                    </div>
                    <div className="field">
                      <div className="field-label">Department</div>
                      <div className="pill-muted">Support</div>
                    </div>
                    <div className="field">
                      <div className="field-label">auto_resolve</div>
                      <div className="chip chip-pill chip-status-auto">
                        true
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card-section">
                  <div className="card-section-title">Ticket payload</div>
                  <div
                    className="text-xs text-mono"
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: '#020617',
                      color: '#e5e7eb',
                    }}
                  >
                    {`{
  "source": "email",
  "external_id": "message-id-123",
  "category": "login_issue",
  "priority": "medium",
  "auto_resolve": true
}`}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
