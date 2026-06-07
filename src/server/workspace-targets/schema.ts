import { z } from 'zod'

const TerminalSshConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(1),
  keyPath: z.string().optional(),
  authRef: z.string().optional(),
  passphraseRef: z.string().optional(),
  cwd: z.string().optional(),
  persistentShell: z.boolean().optional(),
  knownHostsPath: z.string().optional(),
})

const FilesSftpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().min(1),
  keyPath: z.string().optional(),
  authRef: z.string().optional(),
  passphraseRef: z.string().optional(),
  rootPath: z.string().min(1),
  permissions: z
    .object({
      read: z.boolean().optional(),
      write: z.boolean().optional(),
      delete: z.boolean().optional(),
      upload: z.boolean().optional(),
      rename: z.boolean().optional(),
      mkdir: z.boolean().optional(),
    })
    .optional(),
})

export const WorkspaceTargetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    name: z.string().min(1).max(64),
    description: z.string().max(256).optional(),
    hermes: z
      .object({
        gatewayUrl: z.string().url().optional(),
        dashboardUrl: z.string().url().optional(),
        apiTokenRef: z.string().optional(),
      })
      .optional(),
    terminal: z
      .object({
        mode: z.enum(['local', 'ssh']),
        ssh: TerminalSshConfigSchema.optional(),
      })
      .optional(),
    files: z
      .object({
        mode: z.enum(['local', 'sftp']),
        sftp: FilesSftpConfigSchema.optional(),
      })
      .optional(),
    status: z
      .object({
        enabled: z.boolean(),
        lastSelectedAt: z.string().datetime().optional(),
      })
      .optional(),
  })
  .superRefine((t, ctx) => {
    if (t.terminal?.mode === 'ssh' && !t.terminal.ssh) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'terminal.ssh is required when terminal.mode is "ssh"',
        path: ['terminal', 'ssh'],
      })
    }
    if (t.files?.mode === 'sftp' && !t.files.sftp?.rootPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'files.sftp.rootPath is required when files.mode is "sftp"',
        path: ['files', 'sftp', 'rootPath'],
      })
    }
  })

export const WorkspaceTargetsFileSchema = z.object({
  version: z.literal(1),
  activeTargetId: z.string().optional(),
  targets: z.array(WorkspaceTargetSchema),
})

export type WorkspaceTargetInput = z.infer<typeof WorkspaceTargetSchema>
