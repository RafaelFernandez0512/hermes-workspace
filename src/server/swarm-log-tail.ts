import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { publishSwarmEvent, subscriberCount } from './swarm-event-bus'
import type { SwarmMission } from './swarm-missions'

const POLL_INTERVAL_MS = 1_500
const TMUX_BIN_CANDIDATES = [
  process.env.HERMES_TMUX_BIN,
  process.env.CLAUDE_TMUX_BIN,
  process.env.TMUX_BIN,
  join(homedir(), '.local', 'bin', 'tmux'),
  '/usr/bin/tmux',
  '/usr/local/bin/tmux',
  '/opt/homebrew/bin/tmux',
  'tmux',
].filter((value): value is string => Boolean(value))

function resolveTmuxBin(): string | null {
  for (const candidate of TMUX_BIN_CANDIDATES) {
    if (candidate.includes('/')) {
      if (existsSync(candidate)) return candidate
    } else {
      return candidate
    }
  }
  return null
}

function capturePaneAsync(tmuxBin: string, sessionName: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(tmuxBin, ['capture-pane', '-p', '-t', sessionName, '-S', '-200'], { timeout: 5_000 }, (err, stdout) => {
      resolve(err ? '' : (stdout || '').toString())
    })
  })
}

const LOG_KEY = '__hermesSwarmLogTailState__' as const

interface TailState {
  pollers: Map<string, ReturnType<typeof setInterval>>
  lastLines: Map<string, Map<string, string>>
}

function getTailState(): TailState {
  if (!(globalThis as Record<string, unknown>)[LOG_KEY]) {
    ;(globalThis as Record<string, unknown>)[LOG_KEY] = {
      pollers: new Map(),
      lastLines: new Map(),
    }
  }
  return (globalThis as Record<string, unknown>)[LOG_KEY] as TailState
}

export function startLogTailForMission(mission: SwarmMission): void {
  const state = getTailState()
  if (state.pollers.has(mission.id)) return

  const tmuxBin = resolveTmuxBin()
  if (!tmuxBin) return

  const workerIds = [...new Set(mission.assignments.map((a) => a.workerId))]
  const workerLastLines = new Map<string, string>()
  state.lastLines.set(mission.id, workerLastLines)

  const interval = setInterval(() => {
    if (subscriberCount(mission.id) === 0) {
      stopLogTailForMission(mission.id)
      return
    }
    for (const workerId of workerIds) {
      const sessionName = `swarm-${workerId}`
      void capturePaneAsync(tmuxBin, sessionName).then((output) => {
        if (!output) return
        const prev = workerLastLines.get(workerId) ?? ''
        if (output === prev) return
        workerLastLines.set(workerId, output)
        const prevLines = prev.split('\n')
        const newLines = output.split('\n')
        const newContent = newLines.slice(prevLines.length - 1).join('\n').trim()
        if (!newContent) return
        publishSwarmEvent({
          kind: 'log_tail',
          missionId: mission.id,
          workerId,
          ts: Date.now(),
          payload: { lines: newContent, sessionName },
        })
      })
    }
  }, POLL_INTERVAL_MS)

  if (typeof interval.unref === 'function') interval.unref()
  state.pollers.set(mission.id, interval)
}

export function stopLogTailForMission(missionId: string): void {
  const state = getTailState()
  const interval = state.pollers.get(missionId)
  if (interval) {
    clearInterval(interval)
    state.pollers.delete(missionId)
  }
  state.lastLines.delete(missionId)
}
