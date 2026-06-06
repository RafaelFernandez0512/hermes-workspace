'use client'

import { useCallback, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTab, TabsPanel } from '@/components/ui/tabs'
import { useSwarmEvents } from '@/hooks/use-swarm-events'
import { ActivityFeed } from './activity-feed'
import { BlockBanner } from './block-banner'
import { CancelDialog } from './cancel-dialog'
import { FilesChangedTab } from './files-changed-tab'
import { TerminalTab } from './terminal-tab'
import { PlanTab } from './plan-tab'
import type { ActivityLevel } from './types'

type SwarmDetailPanelProps = {
  missionId: string | null
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-emerald-500/20 text-emerald-700 border-emerald-400/40',
  executing: 'bg-blue-500/20 text-blue-700 border-blue-400/40',
  dispatching: 'bg-blue-500/20 text-blue-700 border-blue-400/40',
  blocked: 'bg-amber-500/20 text-amber-700 border-amber-400/40',
  planning: 'bg-slate-500/20 text-slate-700 border-slate-400/40',
  reviewing: 'bg-violet-500/20 text-violet-700 border-violet-400/40',
  cancelled: 'bg-slate-500/20 text-slate-500 border-slate-400/40',
}

async function postAssignmentResponse(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/swarm-assignment-response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Request failed: ${res.status}`)
  }
}

async function cancelMission(missionId: string, graceful: boolean, discardChanges: boolean): Promise<void> {
  const res = await fetch('/api/swarm-missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', missionId, graceful, discardChanges }),
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error ?? `Cancel failed: ${res.status}`)
  }
}

export function SwarmDetailPanel({ missionId, onClose }: SwarmDetailPanelProps) {
  const { events, missionSnapshot, isConnected } = useSwarmEvents(missionId)
  const [activeTab, setActiveTab] = useState('activity')
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('L1')
  const [filterWorkerId, setFilterWorkerId] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const mission = missionSnapshot?.mission ?? null
  const assignments = missionSnapshot?.assignments ?? []

  const workerIds = useMemo(
    () => [...new Set(assignments.map((a) => a.workerId))],
    [assignments],
  )

  const isBlocked = mission?.state === 'blocked' || assignments.some((a) => a.state === 'blocked' || a.state === 'needs_input')

  const blockedAssignment = useMemo(
    () => assignments.find((a) => a.state === 'blocked' || a.state === 'needs_input') ?? null,
    [assignments],
  )

  const filesChangedCount = useMemo(() => {
    const paths = new Set<string>()
    for (const evt of events) {
      if (evt.kind === 'file_edit' && evt.payload.path) paths.add(evt.payload.path as string)
      if (evt.kind === 'checkpoint') {
        const fc = evt.payload.filesChanged as string | undefined
        if (fc && fc !== 'none') fc.split(/[,\n]+/).forEach((p) => paths.add(p.trim()))
      }
    }
    return paths.size
  }, [events])

  const handleApprove = useCallback(async () => {
    if (!missionId || !blockedAssignment) return
    setIsApproving(true)
    try {
      await postAssignmentResponse({
        missionId,
        assignmentId: blockedAssignment.id,
        action: 'approve',
      })
    } catch { /* best effort */ }
    finally { setIsApproving(false) }
  }, [missionId, blockedAssignment])

  const handleReject = useCallback(async (feedback: string, mode: 'retry' | 'skip' | 'terminate') => {
    if (!missionId || !blockedAssignment) return
    setIsRejecting(true)
    try {
      await postAssignmentResponse({
        missionId,
        assignmentId: blockedAssignment.id,
        action: 'reject',
        feedback,
        rejectMode: mode,
      })
    } catch { /* best effort */ }
    finally { setIsRejecting(false) }
  }, [missionId, blockedAssignment])

  const handleCancel = useCallback(async (options: { graceful: boolean; discardChanges: boolean }) => {
    if (!missionId) return
    setIsCancelling(true)
    try {
      await cancelMission(missionId, options.graceful, options.discardChanges)
      setCancelOpen(false)
    } catch { /* best effort */ }
    finally { setIsCancelling(false) }
  }, [missionId])

  const missionState = mission?.state ?? 'planning'
  const statusClass = STATUS_COLORS[missionState] ?? STATUS_COLORS.planning!

  const totalAssignments = assignments.length
  const doneAssignments = assignments.filter((a) => a.state === 'done' || a.state === 'checkpointed').length
  const progress = totalAssignments > 0 ? Math.round((doneAssignments / totalAssignments) * 100) : 0

  return (
    <>
      <Sheet open={Boolean(missionId)} onOpenChange={(open) => { if (!open) onClose() }}>
        <SheetContent>
          <SheetHeader>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <SheetTitle className="truncate max-w-[280px]">
                  {mission?.title ?? missionId ?? 'Mission'}
                </SheetTitle>
                <span className={cn('rounded-full border px-2 py-px text-[10px] font-semibold uppercase tracking-wide', statusClass)}>
                  {missionState}
                </span>
                {!isConnected ? (
                  <span className="rounded-full border border-slate-400/40 bg-slate-500/10 px-2 py-px text-[10px] text-slate-500">offline</span>
                ) : null}
              </div>
              {totalAssignments > 0 ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 max-w-[180px] h-1 rounded-full bg-[var(--theme-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--theme-accent)] transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--theme-muted)]">{doneAssignments}/{totalAssignments}</span>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                disabled={missionState === 'cancelled' || missionState === 'complete'}
                className="rounded-lg border border-[var(--theme-danger-border)] bg-[var(--theme-danger-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-danger)] hover:opacity-80 disabled:opacity-40"
              >
                Cancel
              </button>
              <SheetClose onClick={onClose} />
            </div>
          </SheetHeader>

          {isBlocked && blockedAssignment ? (
            <BlockBanner
              blocker={blockedAssignment.blockerReason}
              missionId={missionId!}
              assignmentId={blockedAssignment.id}
              onApprove={() => void handleApprove()}
              onReject={(feedback, mode) => void handleReject(feedback, mode)}
              isApproving={isApproving}
              isRejecting={isRejecting}
            />
          ) : null}

          <div className="flex flex-1 overflow-hidden">
            {workerIds.length > 1 ? (
              <div className="flex w-[120px] shrink-0 flex-col gap-1 border-r border-[var(--theme-border)] overflow-y-auto px-2 py-2">
                <button
                  type="button"
                  onClick={() => setFilterWorkerId(null)}
                  className={cn(
                    'rounded-lg px-2 py-1.5 text-left text-[11px] font-medium transition-colors',
                    !filterWorkerId
                      ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                      : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
                  )}
                >
                  All agents
                </button>
                {workerIds.map((wId) => (
                  <button
                    key={wId}
                    type="button"
                    onClick={() => setFilterWorkerId(wId === filterWorkerId ? null : wId)}
                    className={cn(
                      'rounded-lg px-2 py-1.5 text-left text-[11px] font-medium transition-colors truncate',
                      filterWorkerId === wId
                        ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                        : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
                    )}
                  >
                    {wId}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="flex flex-1 flex-col overflow-hidden">
              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex flex-1 flex-col overflow-hidden"
              >
                <TabsList className="shrink-0 px-3 pt-2 gap-0 border-b border-[var(--theme-border)] w-full justify-start">
                  <TabsTab value="activity">Activity</TabsTab>
                  <TabsTab value="files">Files{filesChangedCount > 0 ? ` (${filesChangedCount})` : ''}</TabsTab>
                  <TabsTab value="terminal">Terminal</TabsTab>
                  <TabsTab value="plan">Plan</TabsTab>
                  <div className="ml-auto flex items-center gap-1 pb-1">
                    {(['L1', 'L2', 'L3'] as ActivityLevel[]).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setActivityLevel(l)}
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors',
                          activityLevel === l
                            ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent)]'
                            : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
                        )}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </TabsList>

                <TabsPanel value="activity" className="flex flex-col overflow-hidden">
                  <ActivityFeed
                    events={events}
                    level={activityLevel}
                    filterWorkerId={filterWorkerId}
                    className="flex-1"
                  />
                </TabsPanel>

                <TabsPanel value="files" className="flex flex-col overflow-hidden">
                  <FilesChangedTab events={events} className="flex-1" />
                </TabsPanel>

                <TabsPanel value="terminal" className="flex flex-col overflow-hidden">
                  <TerminalTab
                    workerIds={filterWorkerId ? [filterWorkerId] : workerIds}
                    isActive={activeTab === 'terminal'}
                    className="flex-1"
                  />
                </TabsPanel>

                <TabsPanel value="plan" className="flex flex-col overflow-hidden">
                  <PlanTab snapshot={missionSnapshot} className="flex-1" />
                </TabsPanel>
              </Tabs>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <CancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        missionTitle={mission?.title ?? missionId ?? 'mission'}
        agentCount={workerIds.length}
        filesChangedCount={filesChangedCount}
        onConfirm={(opts) => void handleCancel(opts)}
        isLoading={isCancelling}
      />
    </>
  )
}
