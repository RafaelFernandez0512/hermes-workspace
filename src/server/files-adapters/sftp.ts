import { readFileSync } from 'node:fs'
import path from 'node:path/posix'
import type { FilesAdapter, FileEntry, FilesPermissions, FilesSftpConfig } from '../workspace-targets/types'
import { ensureWithinRoot } from './path-guard'

export class RemoteFilesAdapter implements FilesAdapter {
  readonly kind = 'sftp' as const
  readonly permissions: Required<FilesPermissions>

  private readonly config: FilesSftpConfig

  constructor(config: FilesSftpConfig) {
    this.config = config
    const p = config.permissions ?? {}
    this.permissions = {
      read: p.read ?? true,
      write: p.write ?? true,
      delete: p.delete ?? true,
      upload: p.upload ?? true,
      rename: p.rename ?? true,
      mkdir: p.mkdir ?? true,
    }
  }

  private async withSftp<T>(fn: (sftp: import('ssh2').SFTPWrapper) => Promise<T>): Promise<T> {
    const { Client } = await import('ssh2')
    const client = new Client()
    const connectOptions: Parameters<typeof client.connect>[0] = {
      host: this.config.host,
      port: this.config.port ?? 22,
      username: this.config.user,
      readyTimeout: 10_000,
    }
    if (this.config.keyPath) {
      connectOptions.privateKey = readFileSync(this.config.keyPath)
      if (this.config.passphraseRef) connectOptions.passphrase = this.config.passphraseRef
    }

    return new Promise<T>((resolve, reject) => {
      client.on('ready', () => {
        client.sftp((err, sftp) => {
          if (err) {
            client.end()
            reject(err)
            return
          }
          fn(sftp)
            .then((result) => {
              client.end()
              resolve(result)
            })
            .catch((e) => {
              client.end()
              reject(e)
            })
        })
      })
      client.on('error', reject)
      client.connect(connectOptions)
    })
  }

  private guard(relPath: string): string {
    return ensureWithinRoot(this.config.rootPath, relPath)
  }

  async list(relPath: string): Promise<Array<FileEntry>> {
    const absPath = this.guard(relPath)
    return this.withSftp((sftp) =>
      new Promise<Array<FileEntry>>((resolve, reject) => {
        sftp.readdir(absPath, (err, list) => {
          if (err) { reject(err); return }
          resolve(
            list.map((item) => ({
              name: item.filename,
              path: path.join(absPath, item.filename),
              type: item.attrs.isDirectory()
                ? 'directory'
                : item.attrs.isSymbolicLink()
                  ? 'symlink'
                  : 'file',
              size: item.attrs.size,
              modifiedAt: new Date(item.attrs.mtime * 1000).toISOString(),
              permissions: (item.attrs.mode ?? 0).toString(8),
            })),
          )
        })
      }),
    )
  }

  async read(relPath: string): Promise<{ content: string; encoding: 'utf-8' | 'base64' }> {
    const absPath = this.guard(relPath)
    return this.withSftp((sftp) =>
      new Promise<{ content: string; encoding: 'utf-8' | 'base64' }>((resolve, reject) => {
        const chunks: Buffer[] = []
        const stream = sftp.createReadStream(absPath)
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => {
          const buf = Buffer.concat(chunks)
          try {
            const content = buf.toString('utf-8')
            resolve({ content, encoding: 'utf-8' })
          } catch {
            resolve({ content: buf.toString('base64'), encoding: 'base64' })
          }
        })
        stream.on('error', reject)
      }),
    )
  }

  async write(relPath: string, content: string, encoding: 'utf-8' | 'base64'): Promise<void> {
    if (!this.permissions.write) throw Object.assign(new Error('Write not permitted'), { status: 403 })
    const absPath = this.guard(relPath)
    const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf-8')
    return this.withSftp((sftp) =>
      new Promise<void>((resolve, reject) => {
        const stream = sftp.createWriteStream(absPath)
        stream.on('close', resolve)
        stream.on('error', reject)
        stream.end(buf)
      }),
    )
  }

  async mkdir(relPath: string): Promise<void> {
    if (!this.permissions.mkdir) throw Object.assign(new Error('Mkdir not permitted'), { status: 403 })
    const absPath = this.guard(relPath)
    return this.withSftp((sftp) =>
      new Promise<void>((resolve, reject) => {
        sftp.mkdir(absPath, (err) => (err ? reject(err) : resolve()))
      }),
    )
  }

  async rename(from: string, to: string): Promise<void> {
    if (!this.permissions.rename) throw Object.assign(new Error('Rename not permitted'), { status: 403 })
    const absFrom = this.guard(from)
    const absTo = this.guard(to)
    return this.withSftp((sftp) =>
      new Promise<void>((resolve, reject) => {
        sftp.rename(absFrom, absTo, (err) => (err ? reject(err) : resolve()))
      }),
    )
  }

  async remove(relPath: string): Promise<void> {
    if (!this.permissions.delete) throw Object.assign(new Error('Delete not permitted'), { status: 403 })
    const absPath = this.guard(relPath)
    return this.withSftp((sftp) =>
      new Promise<void>((resolve, reject) => {
        sftp.unlink(absPath, (err) => {
          if (!err) { resolve(); return }
          sftp.rmdir(absPath, (err2) => (err2 ? reject(err2) : resolve()))
        })
      }),
    )
  }

  async stat(relPath: string): Promise<FileEntry> {
    const absPath = this.guard(relPath)
    return this.withSftp((sftp) =>
      new Promise<FileEntry>((resolve, reject) => {
        sftp.stat(absPath, (err, stats) => {
          if (err) { reject(err); return }
          resolve({
            name: path.basename(absPath),
            path: absPath,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modifiedAt: new Date(stats.mtime * 1000).toISOString(),
            permissions: (stats.mode ?? 0).toString(8),
          })
        })
      }),
    )
  }
}
