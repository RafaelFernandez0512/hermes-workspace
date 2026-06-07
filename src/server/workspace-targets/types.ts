export type HermesApiTarget = {
  gatewayUrl: string
  dashboardUrl: string
  apiTokenRef?: string
  source: 'profile' | 'default'
  profileId?: string
}

export type TerminalSshConfig = {
  host: string
  port?: number
  user: string
  keyPath?: string
  authRef?: string
  passphraseRef?: string
  cwd?: string
  persistentShell?: boolean
  knownHostsPath?: string
}

export type FilesSftpConfig = {
  host: string
  port?: number
  user: string
  keyPath?: string
  authRef?: string
  passphraseRef?: string
  rootPath: string
  permissions?: FilesPermissions
}

export type FilesPermissions = {
  read?: boolean
  write?: boolean
  delete?: boolean
  upload?: boolean
  rename?: boolean
  mkdir?: boolean
}

export type WorkspaceTarget = {
  id: string
  name: string
  description?: string
  hermes?: {
    gatewayUrl?: string
    dashboardUrl?: string
    apiTokenRef?: string
  }
  terminal?: {
    mode: 'local' | 'ssh'
    ssh?: TerminalSshConfig
  }
  files?: {
    mode: 'local' | 'sftp'
    sftp?: FilesSftpConfig
  }
  status?: {
    enabled: boolean
    lastSelectedAt?: string
  }
}

export type WorkspaceTargetsFile = {
  version: 1
  activeTargetId?: string
  targets: Array<WorkspaceTarget>
}

export interface TerminalSession {
  id: string
  createdAt: number
  emitter: import('node:events').EventEmitter
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
  markDetached: () => void
  markAttached: () => void
  targetId?: string
}

export interface TerminalAdapter {
  readonly kind: 'local' | 'ssh'
  open(opts: {
    sessionId: string
    cols: number
    rows: number
    cwd?: string
    command?: Array<string>
    env?: Record<string, string>
  }): Promise<TerminalSession>
}

export type FileEntry = {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink'
  size?: number
  modifiedAt?: string
  permissions?: string
}

export interface FilesAdapter {
  readonly kind: 'local' | 'sftp'
  readonly permissions: Required<FilesPermissions>
  list(relPath: string): Promise<Array<FileEntry>>
  read(relPath: string): Promise<{ content: string; encoding: 'utf-8' | 'base64' }>
  write(relPath: string, content: string, encoding: 'utf-8' | 'base64'): Promise<void>
  mkdir(relPath: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  remove(relPath: string): Promise<void>
  stat(relPath: string): Promise<FileEntry>
}
