'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { SwarmDetailPanel } from './detail/swarm-detail-panel'

type KanbanLane = 'backlog' | 'ready' | 'running' | 'review' | 'blocked' | 'done'

type SwarmKanbanLatestRun = {
  summary?: string | null
  outcome?: string | null
  status?: string | null
  error?: string | null
  metadata?: Record<string, unknown> | null
  profile?: string | null
  startedAt?: number | null
  endedAt?: number | null
}

type SwarmKanbanCard = {
  id: string
  title: string
  spec: string
  acceptanceCriteria: Array<string>
  assignedWorker: string | null
  reviewer: string | null
  status: KanbanLane
  missionId: string | null
  reportPath: string | null
  createdBy: string
  createdAt: number
  updatedAt: number
  latestRun?: SwarmKanbanLatestRun | null
}

type KanbanWorker = {
  id: string
  displayName?: string | null
  role?: string | null
}

type KanbanBackendMeta = {
  id: 'local' | 'claude' | 'hermes-proxy'
  label: string
  detected: boolean
  writable: boolean
  details?: string | null
  path?: string | null
}

type KanbanResponse = {
  cards?: Array<SwarmKanbanCard>
  backend?: KanbanBackendMeta
}

type KanbanTaskResponse = {
  ok?: boolean
  card?: SwarmKanbanCard
  backend?: KanbanBackendMeta
  error?: string
}

type Swarm2KanbanBoardProps = {
  workers: Array<KanbanWorker>
  latestMission?: { id: string; title: string; state: string } | null
  selectedWorkerId?: string | null
  onSelectWorker?: (workerId: string) => void
  onOpenRouter?: () => void
  className?: string
}

type KanbanBackendPresentation = {
  badgeLabel: string
  badgeTone: 'hermes-proxy' | 'claude' | 'local' | 'unknown'
  toastTitle: string
  toastBody: string
  title: string | undefined
  /** When set, the badge becomes a deep-link to a dashboard that is safe/reachable from the current browser. */
  dashboardUrl?: string
}

function isLoopbackDashboardUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const url = new URL(value)
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

export function getKanbanBackendPresentation(backend: KanbanBackendMeta | null | undefined): KanbanBackendPresentation {
  if (!backend) {
    return {
      badgeLabel: 'Detecting board',
      badgeTone: 'unknown',
      toastTitle: 'Detecting Swarm Board backend',
      toastBody: 'Checking Hermes Kanban before falling back locally.',
      title: undefined,
    }
  }
  if (backend.id === 'hermes-proxy' && backend.detected) {
    // Backend.path is the dashboard origin. Do not deep-link to loopback
    // origins (127.0.0.1/localhost): in a remote browser that points at the
    // user's own device, not the VPS. The board still syncs via Workspace's
    // server-side proxy, so the safe UI is to show a non-clickable status.
    const dashboardUrl =
      typeof backend.path === 'string' &&
      backend.path.startsWith('http') &&
      !isLoopbackDashboardUrl(backend.path)
        ? `${backend.path.replace(/\/+$/, '')}/kanban`
        : undefined
    return {
      badgeLabel: 'Synced • Hermes',
      badgeTone: 'hermes-proxy',
      toastTitle: 'Synced with Hermes Dashboard',
      toastBody:
        'Cards and status changes round-trip through the Hermes Dashboard kanban plugin. Single source of truth, dispatcher-aware.',
      title:
        backend.details ??
        backend.path ??
        'Hermes Dashboard kanban plugin detected',
      dashboardUrl,
    }
  }
  if (backend.id === 'claude' && backend.detected) {
    return {
      badgeLabel: 'Shared board',
      badgeTone: 'claude',
      toastTitle: 'Board connected',
      toastBody: 'Cards and status changes are using the canonical Kanban store.',
      title: backend.details ?? backend.path ?? 'Canonical Kanban store detected',
    }
  }
  return {
    badgeLabel: 'Local fallback',
    badgeTone: 'local',
    toastTitle: 'Using local Swarm Board',
    toastBody: backend.details || 'Hermes Kanban is not available yet. Cards stay local and the board will switch automatically when Hermes storage is detected.',
    title: backend.details ?? backend.path ?? 'Local Swarm Board fallback',
  }
}

const LANES: Array<{ id: KanbanLane; label: string; hint: string }> = [
  { id: 'backlog', label: 'Backlog', hint: 'Captured, not committed' },
  { id: 'ready', label: 'Ready', hint: 'Spec clear, safe to dispatch' },
  { id: 'running', label: 'Running', hint: 'Worker executing' },
  { id: 'review', label: 'Review', hint: 'Needs peer/human check' },
  { id: 'blocked', label: 'Blocked', hint: 'Needs input or dependency' },
  { id: 'done', label: 'Done', hint: 'Accepted / archived' },
]

const LANE_TONE: Record<KanbanLane, string> = {
  backlog: 'border-slate-400/40 bg-slate-500/10 text-slate-700',
  ready: 'border-blue-400/40 bg-blue-500/10 text-blue-700',
  running: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700',
  review: 'border-violet-400/40 bg-violet-500/10 text-violet-700',
  blocked: 'border-red-400/40 bg-red-500/10 text-red-700',
  done: 'border-green-400/40 bg-green-500/10 text-green-700',
}

async function fetchKanbanCards(): Promise<{ cards: Array<SwarmKanbanCard>; backend: KanbanBackendMeta | null }> {
  const res = await fetch('/api/swarm-kanban')
  if (!res.ok) throw new Error(`Kanban request failed: ${res.status}`)
  const data = (await res.json()) as KanbanResponse
  return {
    cards: Array.isArray(data.cards) ? data.cards : [],
    backend: data.backend ?? null,
  }
}

async function createKanbanCard(input: {
  title: string
  spec: string
  acceptanceCriteria: Array<string>
  assignedWorker: string | null
  reviewer: string | null
  status: KanbanLane
  missionId: string | null
}): Promise<SwarmKanbanCard> {
  const res = await fetch('/api/swarm-kanban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `Kanban create failed: ${res.status}`)
  return data.card
}

async function updateKanbanCard(id: string, updates: Partial<SwarmKanbanCard>): Promise<SwarmKanbanCard> {
  const res = await fetch('/api/swarm-kanban', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.ok === false) throw new Error(data?.error || `Kanban update failed: ${res.status}`)
  return data.card
}

async function fetchKanbanCard(taskId: string): Promise<SwarmKanbanCard> {
  const res = await fetch(`/api/swarm-kanban?taskId=${encodeURIComponent(taskId)}`)
  const data = (await res.json().catch(() => ({}))) as KanbanTaskResponse
  if (!res.ok || data.ok === false || !data.card) {
    throw new Error(data.error || `Kanban task fetch failed: ${res.status}`)
  }
  return data.card
}

function splitCriteria(value: string): Array<string> {
  return value
    .split('\n')
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
}

function workerLabel(workers: Array<KanbanWorker>, workerId: string | null): string {
  if (!workerId) return 'Unassigned'
  const worker = workers.find((item) => item.id === workerId)
  return worker?.displayName || workerId
}

function humanizeKey(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatRunTimestamp(ts: number | null | undefined): string | null {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return null
  const normalized = ts > 1_000_000_000_000 ? ts : ts * 1000
  return new Date(normalized).toLocaleString()
}

function renderRunValue(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    return (
      <ul className="mt-1 space-y-1 pl-4 text-[11px] text-[var(--theme-text)]">
        {value.map((item, index) => (
          <li key={index} className="list-disc break-words text-[var(--theme-muted-2)]">
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    )
  }
  if (value && typeof value === 'object') {
    return <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 text-[11px] text-[var(--theme-text)]">{JSON.stringify(value, null, 2)}</pre>
  }
  return <span className="text-[var(--theme-muted-2)]">{String(value)}</span>
}

export function Swarm2KanbanBoard({
  workers,
  latestMission,
  selectedWorkerId,
  onSelectWorker,
  onOpenRouter,
  className,
}: Swarm2KanbanBoardProps) {
  const queryClient = useQueryClient()
  const [composerOpen, setComposerOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftSpec, setDraftSpec] = useState('')
  const [draftCriteria, setDraftCriteria] = useState('')
  const [draftWorker, setDraftWorker] = useState(selectedWorkerId ?? '')
  const [draftReviewer, setDraftReviewer] = useState('')
  const [draftStatus, setDraftStatus] = useState<KanbanLane>('backlog')
  const [linkLatestMission, setLinkLatestMission] = useState(Boolean(latestMission))
  const [backendToast, setBackendToast] = useState<KanbanBackendPresentation | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [detailMissionId, setDetailMissionId] = useState<string | null>(null)
  const lastToastedBackendKey = useRef<string | null>(null)

  // Poll every 5s so cards added/moved on the Hermes Dashboard appear here
  // without a manual refresh. The Hermes plugin also exposes a WebSocket
  // (/api/plugins/kanban/events) for true live updates; wiring that in is
  // the next step on the v2.3.0 kanban roadmap.
  const query = useQuery({
    queryKey: ['swarm2', 'kanban'],
    queryFn: fetchKanbanCards,
    refetchInterval: 5_000,
    staleTime: 2_000,
  })

  const backend = query.data?.backend ?? null
  const backendPresentation = useMemo(() => getKanbanBackendPresentation(backend), [backend])

  useEffect(() => {
    if (!backend) return
    const backendKey = `${backend.id}:${backend.detected ? 'detected' : 'fallback'}:${backend.path ?? ''}`
    if (lastToastedBackendKey.current === backendKey) return
    lastToastedBackendKey.current = backendKey

    const storageKey = 'swarm2-kanban-backend-toast'
    if (typeof window !== 'undefined') {
      const lastSessionToast = window.sessionStorage.getItem(storageKey)
      if (lastSessionToast === backendKey) return
      window.sessionStorage.setItem(storageKey, backendKey)
    }

    const nextToast = getKanbanBackendPresentation(backend)
    setBackendToast(nextToast)
    const timeout = window.setTimeout(() => setBackendToast(null), 4_500)
    return () => window.clearTimeout(timeout)
  }, [backend])

  useEffect(() => {
    if (!selectedCardId) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSelectedCardId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedCardId])

  const createMutation = useMutation({
    mutationFn: () => createKanbanCard({
      title: draftTitle.trim(),
      spec: draftSpec.trim(),
      acceptanceCriteria: splitCriteria(draftCriteria),
      assignedWorker: draftWorker || null,
      reviewer: draftReviewer || null,
      status: draftStatus,
      missionId: linkLatestMission ? latestMission?.id ?? null : null,
    }),
    onSuccess: async () => {
      setDraftTitle('')
      setDraftSpec('')
      setDraftCriteria('')
      setDraftWorker(selectedWorkerId ?? '')
      setDraftReviewer('')
      setDraftStatus('backlog')
      setComposerOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['swarm2', 'kanban'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<SwarmKanbanCard> }) => updateKanbanCard(id, updates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['swarm2', 'kanban'] })
    },
  })

  const cardsByLane = useMemo(() => {
    const map = new Map<KanbanLane, Array<SwarmKanbanCard>>()
    for (const lane of LANES) map.set(lane.id, [])
    for (const card of query.data?.cards ?? []) {
      const bucket = map.get(card.status) ?? map.get('backlog')!
      bucket.push(card)
    }
    return map
  }, [query.data])

  const selectedCardFromList = useMemo(
    () => (query.data?.cards ?? []).find((card) => card.id === selectedCardId) ?? null,
    [query.data?.cards, selectedCardId],
  )

  const selectedCardQuery = useQuery({
    queryKey: ['swarm2', 'kanban', 'task', selectedCardId],
    queryFn: () => fetchKanbanCard(selectedCardId ?? ''),
    enabled: Boolean(selectedCardId),
    staleTime: 0,
    placeholderData: selectedCardFromList ?? undefined,
  })

  const selectedCard = selectedCardQuery.data ?? selectedCardFromList

  const total = query.data?.cards.length ?? 0
  const reviewCount = cardsByLane.get('review')?.length ?? 0
  const blockedCount = cardsByLane.get('blocked')?.length ?? 0

  return (
    <section className={cn('rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-[0_24px_80px_var(--theme-shadow)]', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Manual planning</div>
          <h2 className="mt-1 text-lg font-semibold text-[var(--theme-text)]">Swarm Board</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--theme-muted-2)]">
            Auto-detects the shared Kanban store by default; if it is unavailable, cards stay in a local fallback. Dispatch stays explicit through Router.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--theme-muted)]">
          <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1">{total} cards</span>
          {backendPresentation.dashboardUrl ? (
            <a
              href={backendPresentation.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-medium transition-colors',
                'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20',
              )}
              title={`${backendPresentation.title ?? ''}\nOpen in Hermes Dashboard ↗`}
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {backendPresentation.badgeLabel}
              <span className="opacity-60" aria-hidden="true">
                ↗
              </span>
            </a>
          ) : (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 font-medium',
                backendPresentation.badgeTone === 'hermes-proxy'
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700'
                  : backendPresentation.badgeTone === 'claude'
                    ? 'border-violet-400/40 bg-violet-500/10 text-violet-700'
                    : backendPresentation.badgeTone === 'local'
                      ? 'border-amber-400/40 bg-amber-500/10 text-amber-700'
                      : 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-muted)]',
              )}
              title={backendPresentation.title}
              aria-live="polite"
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  backendPresentation.badgeTone === 'hermes-proxy'
                    ? 'bg-emerald-500'
                    : backendPresentation.badgeTone === 'claude'
                      ? 'bg-violet-500'
                      : backendPresentation.badgeTone === 'local'
                        ? 'bg-amber-500'
                        : 'bg-[var(--theme-muted)]',
                )}
              />
              {backendPresentation.badgeLabel}
            </span>
          )}
          <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1">{reviewCount} review</span>
          <span className="rounded-full border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1">{blockedCount} blocked</span>
          <button
            type="button"
            onClick={() => {
              setDraftWorker(selectedWorkerId ?? '')
              setLinkLatestMission(Boolean(latestMission))
              setComposerOpen((open) => !open)
            }}
            className="rounded-full bg-[var(--theme-accent)] px-3 py-1.5 font-semibold text-primary-950 hover:bg-[var(--theme-accent-strong)]"
          >
            New card
          </button>
        </div>
      </div>

      {backendToast ? (
        <div className="fixed right-4 top-4 z-50 max-w-sm rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-sm text-[var(--theme-text)] shadow-[0_18px_60px_var(--theme-shadow)]" role="status" aria-live="polite">
          <div className="flex items-start gap-3">
            <span className={cn(
              'mt-1 h-2 w-2 shrink-0 rounded-full',
              backendToast.badgeTone === 'claude' ? 'bg-violet-500' : backendToast.badgeTone === 'local' ? 'bg-amber-500' : 'bg-[var(--theme-muted)]',
            )} />
            <div>
              <div className="font-semibold">{backendToast.toastTitle}</div>
              <div className="mt-1 text-xs leading-relaxed text-[var(--theme-muted-2)]">{backendToast.toastBody}</div>
            </div>
            <button type="button" onClick={() => setBackendToast(null)} className="ml-1 rounded-full px-1.5 text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]" aria-label="Dismiss backend notice">×</button>
          </div>
        </div>
      ) : null}

      {composerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_30px_100px_var(--theme-shadow)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Manual planning</div>
                <h3 className="mt-1 text-lg font-semibold text-[var(--theme-text)]">New board card</h3>
                <p className="mt-1 text-xs text-[var(--theme-muted-2)]">Spec work before routing it to an agent. Dispatch stays explicit through Router.</p>
              </div>
              <button type="button" onClick={() => setComposerOpen(false)} className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-sm text-[var(--theme-muted)] hover:text-[var(--theme-text)]">Close</button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs md:col-span-2">
                <span className="mb-1 block font-semibold text-[var(--theme-muted)]">Title</span>
                <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="e.g. Review board UX safety" className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none" />
              </label>
              <label className="block text-xs md:col-span-2">
                <span className="mb-1 block font-semibold text-[var(--theme-muted)]">Spec</span>
                <textarea value={draftSpec} onChange={(event) => setDraftSpec(event.target.value)} rows={4} placeholder="Short task spec / context" className="w-full resize-none rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none" />
              </label>
              <label className="block text-xs md:col-span-2">
                <span className="mb-1 block font-semibold text-[var(--theme-muted)]">Acceptance criteria</span>
                <textarea value={draftCriteria} onChange={(event) => setDraftCriteria(event.target.value)} rows={3} placeholder="One per line" className="w-full resize-none rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-[var(--theme-muted)]">Assigned worker</span>
                <select value={draftWorker} onChange={(event) => setDraftWorker(event.target.value)} className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none">
                  <option value="">Unassigned</option>
                  {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName || worker.id}</option>)}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-[var(--theme-muted)]">Reviewer</span>
                <select value={draftReviewer} onChange={(event) => setDraftReviewer(event.target.value)} className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none">
                  <option value="">Unassigned</option>
                  {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.displayName || worker.id}</option>)}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-semibold text-[var(--theme-muted)]">Status</span>
                <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as KanbanLane)} className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none">
                  {LANES.map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-3 py-2 text-xs text-[var(--theme-muted)]">
                <input type="checkbox" checked={linkLatestMission} disabled={!latestMission} onChange={(event) => setLinkLatestMission(event.target.checked)} />
                Link latest mission{latestMission ? `: ${latestMission.title}` : ''}
              </label>
              {createMutation.error ? <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 md:col-span-2">{createMutation.error.message}</div> : null}
              <div className="flex justify-end gap-2 md:col-span-2">
                <button type="button" onClick={() => setComposerOpen(false)} className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-xs font-semibold text-[var(--theme-muted)] hover:bg-[var(--theme-card2)]">Cancel</button>
                <button type="button" disabled={!draftTitle.trim() || createMutation.isPending} onClick={() => void createMutation.mutateAsync()} className="rounded-xl bg-[var(--theme-accent)] px-3 py-2 text-xs font-semibold text-primary-950 disabled:opacity-50">{createMutation.isPending ? 'Saving…' : 'Create card'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {query.isError ? (
        <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">Kanban failed to load: {query.error.message}</div>
      ) : query.isPending ? (
        <div className="mb-3 rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-muted)]">
          Loading board cards and backend source…
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 2xl:grid-cols-6">
        {LANES.map((lane) => {
          const laneCards = cardsByLane.get(lane.id) ?? []
          return (
            <div key={lane.id} className="min-h-64 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]', LANE_TONE[lane.id])}>{lane.label}</span>
                    <span className="text-[10px] text-[var(--theme-muted)]">{laneCards.length}</span>
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--theme-muted)]">{lane.hint}</div>
                </div>
              </div>
              <div className="space-y-2">
                {query.isPending ? (
                  <div className="rounded-xl border border-dashed border-[var(--theme-border)] p-3 text-xs text-[var(--theme-muted)]">Waiting for source…</div>
                ) : laneCards.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--theme-border)] p-3 text-xs text-[var(--theme-muted)]">Empty</div>
                ) : laneCards.map((card) => (
                  <article
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open details for ${card.title}`}
                    onClick={() => {
                      if (card.missionId) {
                        setDetailMissionId(card.missionId)
                      } else {
                        setSelectedCardId(card.id)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        if (card.missionId) {
                          setDetailMissionId(card.missionId)
                        } else {
                          setSelectedCardId(card.id)
                        }
                      }
                    }}
                    className={cn(
                      'rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3 text-left shadow-sm transition-colors',
                      'cursor-pointer hover:border-[var(--theme-accent)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40',
                      selectedCardId === card.id && 'border-[var(--theme-accent)] ring-1 ring-[var(--theme-accent)]/30',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-sm font-semibold leading-snug text-[var(--theme-text)]">{card.title}</div>
                      {card.status === 'blocked' ? (
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                        </span>
                      ) : null}
                    </div>
                    {card.spec ? <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--theme-muted-2)]">{card.spec}</p> : null}
                    {card.latestRun?.summary ? (
                      <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[var(--theme-text)]">
                        <span className="font-semibold text-[var(--theme-muted)]">Result:</span> {card.latestRun.summary}
                      </p>
                    ) : null}
                    {card.acceptanceCriteria.length ? (
                      <ul className="mt-2 space-y-1 text-[11px] text-[var(--theme-muted)]">
                        {card.acceptanceCriteria.slice(0, 3).map((item, index) => <li key={`${card.id}-ac-${index}`}>✓ {item}</li>)}
                        {card.acceptanceCriteria.length > 3 ? <li>+{card.acceptanceCriteria.length - 3} more</li> : null}
                      </ul>
                    ) : null}
                    <div className="mt-3 space-y-1 text-[10px] text-[var(--theme-muted)]">
                      <div>Owner: <span className="font-semibold text-[var(--theme-text)]">{workerLabel(workers, card.assignedWorker)}</span></div>
                      <div>Reviewer: <span className="font-semibold text-[var(--theme-text)]">{workerLabel(workers, card.reviewer)}</span></div>
                      {card.missionId ? <div className="truncate" title={card.missionId}>Mission: {card.missionId}</div> : null}
                      {card.reportPath ? <div className="truncate" title={card.reportPath}>Report: {card.reportPath}</div> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {card.assignedWorker ? (
                        <button type="button" onClick={(event) => { event.stopPropagation(); onSelectWorker?.(card.assignedWorker!) }} className="rounded-full border border-[var(--theme-border)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]">Open worker</button>
                      ) : null}
                      {card.status !== 'running' ? <button type="button" onClick={(event) => { event.stopPropagation(); updateMutation.mutate({ id: card.id, updates: { status: 'running' } }) }} className="rounded-full border border-[var(--theme-border)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]">Run</button> : null}
                      {card.status !== 'review' ? <button type="button" onClick={(event) => { event.stopPropagation(); updateMutation.mutate({ id: card.id, updates: { status: 'review' } }) }} className="rounded-full border border-[var(--theme-border)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]">Review</button> : null}
                      {card.status !== 'done' ? <button type="button" onClick={(event) => { event.stopPropagation(); updateMutation.mutate({ id: card.id, updates: { status: 'done' } }) }} className="rounded-full border border-[var(--theme-border)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-muted)] hover:bg-[var(--theme-card2)] hover:text-[var(--theme-text)]">Done</button> : null}
                      {onOpenRouter ? <button type="button" onClick={(event) => { event.stopPropagation(); onOpenRouter() }} className="rounded-full border border-[var(--theme-accent)] bg-[var(--theme-accent-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--theme-accent-strong)]">Router</button> : null}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <SwarmDetailPanel
        missionId={detailMissionId}
        onClose={() => setDetailMissionId(null)}
      />

      {selectedCardId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedCardId(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[var(--theme-border2)] bg-[var(--theme-card)] p-5 shadow-[0_30px_100px_var(--theme-shadow)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-muted)]">Task detail</div>
                <h3 className="mt-1 text-lg font-semibold text-[var(--theme-text)]">
                  {selectedCard?.title ?? 'Loading task details…'}
                </h3>
                {selectedCard?.spec ? (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--theme-muted-2)]">
                    {selectedCard.spec}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCardId(null)}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card2)] px-3 py-1.5 text-sm text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
              >
                Close
              </button>
            </div>

            {selectedCardQuery.isError ? (
              <div className="mb-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-700">
                {selectedCardQuery.error.message}
              </div>
            ) : null}

            {selectedCardQuery.isPending && !selectedCard ? (
              <div className="mb-4 rounded-2xl border border-dashed border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-muted)]">
                Loading task details…
              </div>
            ) : null}

            {selectedCard ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Current state</div>
                    <div className="mt-2 space-y-1 text-sm text-[var(--theme-text)]">
                      <div>Status: <span className="font-semibold">{selectedCard.status}</span></div>
                      <div>Owner: <span className="font-semibold">{workerLabel(workers, selectedCard.assignedWorker)}</span></div>
                      <div>Reviewer: <span className="font-semibold">{workerLabel(workers, selectedCard.reviewer)}</span></div>
                      {selectedCard.missionId ? <div className="truncate" title={selectedCard.missionId}>Mission: {selectedCard.missionId}</div> : null}
                      {selectedCard.reportPath ? <div className="truncate" title={selectedCard.reportPath}>Report: {selectedCard.reportPath}</div> : null}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Run recap</div>
                    <div className="mt-2 space-y-1 text-sm text-[var(--theme-text)]">
                      <div>Outcome: <span className="font-semibold">{selectedCard.latestRun?.outcome ?? selectedCard.status}</span></div>
                      {selectedCard.latestRun?.profile ? <div>Profile: <span className="font-semibold">{selectedCard.latestRun.profile}</span></div> : null}
                      {formatRunTimestamp(selectedCard.latestRun?.startedAt) ? <div>Started: <span className="font-semibold">{formatRunTimestamp(selectedCard.latestRun?.startedAt)}</span></div> : null}
                      {formatRunTimestamp(selectedCard.latestRun?.endedAt) ? <div>Ended: <span className="font-semibold">{formatRunTimestamp(selectedCard.latestRun?.endedAt)}</span></div> : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Final result</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--theme-text)]">
                    {selectedCard.latestRun?.summary ?? 'No final summary recorded for this task.'}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--theme-muted)]">Activities</div>
                  <div className="mt-3 space-y-3 text-sm text-[var(--theme-text)]">
                    {selectedCard.latestRun?.metadata && Object.keys(selectedCard.latestRun.metadata).length > 0 ? (
                      Object.entries(selectedCard.latestRun.metadata).map(([key, value]) => (
                        <div key={key} className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-muted)]">
                            {humanizeKey(key)}
                          </div>
                          {renderRunValue(value)}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-[var(--theme-border)] p-3 text-sm text-[var(--theme-muted)]">
                        No structured activities captured on the latest run.
                      </div>
                    )}
                  </div>
                </div>

                {selectedCard.latestRun?.error ? (
                  <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-700">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">Run error</div>
                    <p className="mt-2 whitespace-pre-wrap">{selectedCard.latestRun.error}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
