'use client'

import { useState } from 'react'
import type { SwarmStatusPayload } from '@/lib/swarm/canonical-state'
import { CTA } from '@/lib/swarm/cta-copy'

interface ActionBarProps {
  status: SwarmStatusPayload
  swarmId: string
}

interface ActionButton {
  label: string
  primary?: boolean
  onClick: () => Promise<unknown> | unknown
}

type LifecycleActionResponse = {
  ok?: boolean
  error?: string
  sweep?: Array<{ workerId: string; action: string; result?: { ok: boolean; error?: string } }>
  [key: string]: unknown
}

async function postLifecycleAction(action: string, workerId?: string): Promise<LifecycleActionResponse> {
  const response = await fetch('/api/swarm-lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, workerId }),
  })

  const data = (await response.json().catch(() => ({}))) as LifecycleActionResponse
  if (!response.ok || data.ok === false) {
    throw new Error(data.error ?? `Request failed (${response.status})`)
  }
  return data
}

function summarizeSweep(sweep: LifecycleActionResponse['sweep']): string | null {
  if (!Array.isArray(sweep) || sweep.length === 0) return null
  const acted = sweep.filter((item) => item.action !== 'none')
  if (acted.length === 0) return 'No runtime action was needed.'
  return acted.map((item) => `${item.workerId} → ${item.action}`).join(' · ')
}

export function ActionBar({ status, swarmId }: ActionBarProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const workerId = status.currentWorkerId ?? swarmId

  const handleAction = async (button: ActionButton) => {
    setLoading(button.label)
    setError(null)
    setNotice(null)
    try {
      const result = await button.onClick()
      if (button.label === CTA.RECOVER_RUNTIME) {
        const recovery = summarizeSweep((result as LifecycleActionResponse | undefined)?.sweep)
        setNotice(recovery ?? 'Recovery request sent.')
      } else {
        setNotice(`${button.label} sent.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(null)
    }
  }

  let primary: ActionButton | null = null
  let secondaries: Array<ActionButton> = []
  let helper: string | null = null

  switch (status.status) {
    case 'not_started':
    case 'paused':
      primary = {
        label: CTA.START_OR_RESUME,
        primary: true,
        onClick: () => postLifecycleAction('start-or-resume', workerId),
      }
      helper = 'Start the swarm or resume the current worker.'
      break

    case 'running':
    case 'starting':
      primary = {
        label: CTA.SEND_GUIDANCE,
        primary: true,
        onClick: () => postLifecycleAction('start-or-resume', workerId),
      }
      secondaries = [
        { label: CTA.PAUSE, onClick: () => postLifecycleAction('pause', workerId) },
      ]
      helper = 'Resume the worker or pause the swarm.'
      break

    case 'blocked':
      primary = {
        label: CTA.SEND_GUIDANCE,
        primary: true,
        onClick: () => postLifecycleAction('start-or-resume', workerId),
      }
      secondaries = [
        { label: CTA.REROUTE, onClick: () => postLifecycleAction('mark-blocked', workerId) },
        { label: CTA.ESCALATE_REVIEW, onClick: () => postLifecycleAction('mark-needs-review', workerId) },
      ]
      helper = 'Route around the blocker or escalate it.'
      break

    case 'needs_review':
      primary = {
        label: CTA.APPROVE_MARK_READY,
        primary: true,
        onClick: () => postLifecycleAction('mark-ready', workerId),
      }
      secondaries = [
        { label: CTA.SEND_GUIDANCE, onClick: () => postLifecycleAction('start-or-resume', workerId) },
      ]
      helper = 'Approve the checkpoint or nudge the worker.'
      break

    case 'ready':
      primary = {
        label: CTA.MARK_COMPLETE,
        primary: true,
        onClick: () => postLifecycleAction('complete', workerId),
      }
      secondaries = [
        { label: CTA.SEND_GUIDANCE, onClick: () => postLifecycleAction('start-or-resume', workerId) },
      ]
      helper = 'Mark the swarm complete or send a final prompt.'
      break

    case 'recovering':
    case 'stale':
      primary = {
        label: CTA.RECOVER_RUNTIME,
        primary: true,
        onClick: () => postLifecycleAction('recover-runtime', workerId),
      }
      secondaries = [
        { label: CTA.REQUEST_HANDOFF, onClick: () => postLifecycleAction('request-handoff', workerId) },
      ]
      helper = 'Recover the worker or request a handoff first.'
      break

    case 'failed':
      primary = {
        label: CTA.RETRY_WORKER,
        primary: true,
        onClick: () => postLifecycleAction('renew', workerId),
      }
      secondaries = [
        { label: CTA.ESCALATE_REVIEW, onClick: () => postLifecycleAction('mark-needs-review', workerId) },
      ]
      helper = 'Retry the worker or send it to review.'
      break

    case 'completed':
      helper = 'No further action required.'
      break

    default:
      helper = 'No action available.'
  }

  const renderButton = (btn: ActionButton, key: string) => (
    <button
      key={key}
      type="button"
      disabled={loading !== null}
      onClick={() => { void handleAction(btn) }}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
        btn.primary
          ? 'bg-[var(--theme-accent,var(--color-accent-500))] text-white hover:bg-[var(--theme-accent-strong,var(--color-accent-600))]'
          : 'border border-[var(--theme-border,var(--color-primary-200))] bg-transparent text-[var(--theme-text,var(--color-ink))] hover:bg-[var(--theme-card,var(--color-primary-50))]',
      ].join(' ')}
    >
      {loading === btn.label ? '…' : btn.label}
    </button>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {primary && renderButton(primary, 'primary')}
        {secondaries.map((btn, i) => renderButton(btn, `secondary-${i}`))}
      </div>

      {helper && (
        <p className="text-xs text-[var(--theme-muted,var(--color-primary-600))]">
          {helper}
        </p>
      )}
      {notice && (
        <p className="text-xs text-emerald-600">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
