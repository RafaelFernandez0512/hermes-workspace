import { useWorkspaceTargetStore } from '@/stores/workspace-target-store'

type RemoteModeBannerProps = {
  channel: 'terminal' | 'files'
}

export function RemoteModeBanner({ channel }: RemoteModeBannerProps) {
  const { targets, activeTargetId } = useWorkspaceTargetStore()

  if (!activeTargetId) return null

  const target = targets.find((t) => t.id === activeTargetId)
  if (!target) return null

  const isRemote =
    (channel === 'terminal' && target.terminal?.mode === 'ssh') ||
    (channel === 'files' && target.files?.mode === 'sftp')

  if (!isRemote) return null

  const sshConfig = channel === 'terminal' ? target.terminal?.ssh : target.files?.sftp
  const host = sshConfig?.host ?? '?'
  const user = (sshConfig as { user?: string })?.user

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-amber-950/30 border-b border-amber-700/40 text-amber-400 text-xs font-mono">
      <span className="opacity-60">remote</span>
      <span className="font-semibold">{target.name}</span>
      <span className="opacity-60">
        ({user ? `${user}@` : ''}{host})
      </span>
    </div>
  )
}
