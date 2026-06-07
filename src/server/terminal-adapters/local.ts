import type { TerminalAdapter, TerminalSession } from '../workspace-targets/types'
import { createTerminalSession, registerAdapterSession } from '../terminal-sessions'

export class LocalTerminalAdapter implements TerminalAdapter {
  readonly kind = 'local' as const

  async open(opts: {
    sessionId: string
    cols: number
    rows: number
    cwd?: string
    command?: Array<string>
    env?: Record<string, string>
  }): Promise<TerminalSession> {
    const session = createTerminalSession({
      command: opts.command,
      cwd: opts.cwd,
      env: opts.env,
      cols: opts.cols,
      rows: opts.rows,
    })
    const wrapped: TerminalSession = { ...session, targetId: 'local' }
    return registerAdapterSession(wrapped, 'local')
  }
}
