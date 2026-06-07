import { useEffect, useState } from 'react'
import { useWorkspaceTargetStore } from '@/stores/workspace-target-store'
import type { WorkspaceTarget } from '@/server/workspace-targets/types'
import { testTarget } from '@/lib/workspace-targets-api'
import type { TargetTestResult } from '@/lib/workspace-targets-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

function generateId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63) || `target-${Date.now()}`
  )
}

type TestState = Record<
  string,
  { loading: boolean; result?: TargetTestResult; error?: string }
>

export function WorkspaceTargetsSection() {
  const { targets, activeTargetId, isLoaded, load, setActive, upsert, remove } =
    useWorkspaceTargetStore()
  const [editing, setEditing] = useState<Partial<WorkspaceTarget> | null>(null)
  const [tests, setTests] = useState<TestState>({})

  useEffect(() => {
    if (!isLoaded) load()
  }, [isLoaded, load])

  const handleTest = async (id: string) => {
    setTests((prev) => ({ ...prev, [id]: { loading: true } }))
    try {
      const result = await testTarget(id)
      setTests((prev) => ({ ...prev, [id]: { loading: false, result } }))
    } catch (err) {
      setTests((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }))
    }
  }

  const handleSave = async () => {
    if (!editing) return
    const target: WorkspaceTarget = {
      id: editing.id || generateId(editing.name ?? 'target'),
      name: editing.name ?? 'Unnamed Target',
      description: editing.description,
      hermes: editing.hermes?.gatewayUrl ? editing.hermes : undefined,
      terminal: editing.terminal,
      files: editing.files,
    }
    await upsert(target)
    setEditing(null)
  }

  const probeIcon = (
    r: { ok?: boolean; skipped?: boolean; error?: string } | undefined,
  ) => {
    if (!r) return '○'
    if ('skipped' in r && r.skipped) return '–'
    if (r.ok) return '✓'
    return '✗'
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Workspace Targets</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure remote PCs that Hermes Workspace can connect to for
          Terminal, Files, and Hermes Agent.
        </p>
        {activeTargetId && (
          <p className="text-xs text-amber-400/80 mt-1">
            Active for this profile:{' '}
            <span className="font-medium">
              {targets.find((t) => t.id === activeTargetId)?.name ??
                activeTargetId}
            </span>
          </p>
        )}
      </div>

      {/* Target list */}
      <div className="flex flex-col gap-2">
        {targets.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No targets configured. Add one below.
          </p>
        )}
        {targets.map((t) => (
          <div
            key={t.id}
            className={cn(
              'border rounded-lg p-3 flex flex-col gap-2',
              activeTargetId === t.id
                ? 'border-amber-500/50 bg-amber-950/20'
                : 'border-border',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    activeTargetId === t.id
                      ? 'bg-amber-400'
                      : 'bg-muted-foreground/40',
                  )}
                />
                <span className="font-medium text-sm">{t.name}</span>
                {t.description && (
                  <span className="text-xs text-muted-foreground">
                    {t.description}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setActive(activeTargetId === t.id ? undefined : t.id)
                  }
                >
                  {activeTargetId === t.id ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleTest(t.id)}
                  disabled={tests[t.id]?.loading}
                >
                  {tests[t.id]?.loading ? 'Testing…' : 'Test'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => remove(t.id)}
                >
                  Delete
                </Button>
              </div>
            </div>

            {/* Channel info */}
            <div className="flex gap-4 text-xs text-muted-foreground font-mono">
              <span>hermes: {t.hermes?.gatewayUrl ?? 'default'}</span>
              <span>terminal: {t.terminal?.mode ?? 'default'}</span>
              <span>files: {t.files?.mode ?? 'default'}</span>
            </div>

            {/* Test results */}
            {tests[t.id]?.result && (
              <div className="flex gap-4 text-xs font-mono">
                {(['hermes', 'dashboard', 'ssh', 'sftp'] as const).map((ch) => {
                  const r = tests[t.id]?.result?.[ch]
                  return (
                    <span
                      key={ch}
                      className={cn(
                        r && !('skipped' in r && r.skipped)
                          ? r.ok
                            ? 'text-emerald-400'
                            : 'text-red-400'
                          : 'text-muted-foreground',
                      )}
                    >
                      {probeIcon(r)} {ch}
                    </span>
                  )
                })}
              </div>
            )}
            {tests[t.id]?.error && (
              <p className="text-xs text-red-400">{tests[t.id]?.error}</p>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setEditing({})}
      >
        + Add Target
      </Button>

      {/* Edit form */}
      {editing !== null && (
        <div className="border border-border rounded-lg p-4 flex flex-col gap-4">
          <h3 className="font-medium text-sm">
            {editing.id ? 'Edit Target' : 'New Target'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Name *
              <Input
                value={editing.name ?? ''}
                onChange={(e) =>
                  setEditing((v) => ({ ...v, name: e.target.value }))
                }
                placeholder="My Remote PC"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Description
              <Input
                value={editing.description ?? ''}
                onChange={(e) =>
                  setEditing((v) => ({ ...v, description: e.target.value }))
                }
                placeholder="Optional note"
              />
            </label>
          </div>

          <fieldset className="border border-border/50 rounded p-3 flex flex-col gap-2">
            <legend className="text-xs font-semibold px-1">
              Hermes Agent (optional)
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs">
                Gateway URL
                <Input
                  value={editing.hermes?.gatewayUrl ?? ''}
                  onChange={(e) =>
                    setEditing((v) => ({
                      ...v,
                      hermes: { ...v?.hermes, gatewayUrl: e.target.value },
                    }))
                  }
                  placeholder="http://192.168.1.20:8642"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Dashboard URL
                <Input
                  value={editing.hermes?.dashboardUrl ?? ''}
                  onChange={(e) =>
                    setEditing((v) => ({
                      ...v,
                      hermes: { ...v?.hermes, dashboardUrl: e.target.value },
                    }))
                  }
                  placeholder="http://192.168.1.20:9119"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="border border-border/50 rounded p-3 flex flex-col gap-2">
            <legend className="text-xs font-semibold px-1">Terminal</legend>
            <div className="flex gap-3 items-center text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="terminal-mode"
                  value="local"
                  checked={(editing.terminal?.mode ?? 'local') === 'local'}
                  onChange={() =>
                    setEditing((v) => ({ ...v, terminal: { mode: 'local' } }))
                  }
                />
                Local
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="terminal-mode"
                  value="ssh"
                  checked={editing.terminal?.mode === 'ssh'}
                  onChange={() =>
                    setEditing((v) => ({
                      ...v,
                      terminal: {
                        mode: 'ssh',
                        ssh: v?.terminal?.ssh ?? { host: '', user: '' },
                      },
                    }))
                  }
                />
                SSH
              </label>
            </div>
            {editing.terminal?.mode === 'ssh' && (
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  Host *
                  <Input
                    value={editing.terminal.ssh?.host ?? ''}
                    onChange={(e) =>
                      setEditing((v) => ({
                        ...v,
                        terminal: {
                          mode: 'ssh',
                          ssh: {
                            ...v?.terminal?.ssh,
                            host: e.target.value,
                            user: v?.terminal?.ssh?.user ?? '',
                          },
                        },
                      }))
                    }
                    placeholder="192.168.1.20"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  User *
                  <Input
                    value={editing.terminal.ssh?.user ?? ''}
                    onChange={(e) =>
                      setEditing((v) => ({
                        ...v,
                        terminal: {
                          mode: 'ssh',
                          ssh: {
                            ...v?.terminal?.ssh,
                            user: e.target.value,
                            host: v?.terminal?.ssh?.host ?? '',
                          },
                        },
                      }))
                    }
                    placeholder="winterfell"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Key Path
                  <Input
                    value={editing.terminal.ssh?.keyPath ?? ''}
                    onChange={(e) =>
                      setEditing((v) => ({
                        ...v,
                        terminal: {
                          mode: 'ssh',
                          ssh: {
                            ...v?.terminal?.ssh,
                            keyPath: e.target.value,
                            host: v?.terminal?.ssh?.host ?? '',
                            user: v?.terminal?.ssh?.user ?? '',
                          },
                        },
                      }))
                    }
                    placeholder="~/.ssh/id_rsa"
                  />
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className="border border-border/50 rounded p-3 flex flex-col gap-2">
            <legend className="text-xs font-semibold px-1">Files</legend>
            <div className="flex gap-3 items-center text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="files-mode"
                  value="local"
                  checked={(editing.files?.mode ?? 'local') === 'local'}
                  onChange={() =>
                    setEditing((v) => ({ ...v, files: { mode: 'local' } }))
                  }
                />
                Local
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="files-mode"
                  value="sftp"
                  checked={editing.files?.mode === 'sftp'}
                  onChange={() =>
                    setEditing((v) => ({
                      ...v,
                      files: {
                        mode: 'sftp',
                        sftp: v?.files?.sftp ?? {
                          host: '',
                          user: '',
                          rootPath: '',
                        },
                      },
                    }))
                  }
                />
                SFTP
              </label>
            </div>
            {editing.files?.mode === 'sftp' && (
              <div className="grid grid-cols-3 gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  Host *
                  <Input
                    value={editing.files.sftp?.host ?? ''}
                    onChange={(e) =>
                      setEditing((v) => ({
                        ...v,
                        files: {
                          mode: 'sftp',
                          sftp: {
                            ...v?.files?.sftp,
                            host: e.target.value,
                            user: v?.files?.sftp?.user ?? '',
                            rootPath: v?.files?.sftp?.rootPath ?? '',
                          },
                        },
                      }))
                    }
                    placeholder="192.168.1.20"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  User *
                  <Input
                    value={editing.files.sftp?.user ?? ''}
                    onChange={(e) =>
                      setEditing((v) => ({
                        ...v,
                        files: {
                          mode: 'sftp',
                          sftp: {
                            ...v?.files?.sftp,
                            user: e.target.value,
                            host: v?.files?.sftp?.host ?? '',
                            rootPath: v?.files?.sftp?.rootPath ?? '',
                          },
                        },
                      }))
                    }
                    placeholder="winterfell"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Root Path *
                  <Input
                    value={editing.files.sftp?.rootPath ?? ''}
                    onChange={(e) =>
                      setEditing((v) => ({
                        ...v,
                        files: {
                          mode: 'sftp',
                          sftp: {
                            ...v?.files?.sftp,
                            rootPath: e.target.value,
                            host: v?.files?.sftp?.host ?? '',
                            user: v?.files?.sftp?.user ?? '',
                          },
                        },
                      }))
                    }
                    placeholder="/home/winterfell"
                  />
                </label>
              </div>
            )}
          </fieldset>

          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm">
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
