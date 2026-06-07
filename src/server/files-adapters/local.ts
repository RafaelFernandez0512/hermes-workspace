import path from 'node:path'
import fs from 'node:fs/promises'
import type { FilesAdapter, FileEntry, FilesPermissions } from '../workspace-targets/types'

export class LocalFilesAdapter implements FilesAdapter {
  readonly kind = 'local' as const
  readonly permissions: Required<FilesPermissions> = {
    read: true,
    write: true,
    delete: true,
    upload: true,
    rename: true,
    mkdir: true,
  }

  async list(absPath: string): Promise<Array<FileEntry>> {
    const entries = await fs.readdir(absPath, { withFileTypes: true })
    const result: Array<FileEntry> = []
    for (const entry of entries) {
      const entryPath = path.join(absPath, entry.name)
      const stat = await fs.stat(entryPath).catch(() => null)
      result.push({
        name: entry.name,
        path: entryPath,
        type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
        size: stat?.size,
        modifiedAt: stat?.mtime.toISOString(),
      })
    }
    return result
  }

  async read(absPath: string): Promise<{ content: string; encoding: 'utf-8' | 'base64' }> {
    try {
      const content = await fs.readFile(absPath, 'utf-8')
      return { content, encoding: 'utf-8' }
    } catch {
      const buf = await fs.readFile(absPath)
      return { content: buf.toString('base64'), encoding: 'base64' }
    }
  }

  async write(absPath: string, content: string, encoding: 'utf-8' | 'base64'): Promise<void> {
    const buf = encoding === 'base64' ? Buffer.from(content, 'base64') : content
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    await fs.writeFile(absPath, buf)
  }

  async mkdir(absPath: string): Promise<void> {
    await fs.mkdir(absPath, { recursive: true })
  }

  async rename(from: string, to: string): Promise<void> {
    await fs.rename(from, to)
  }

  async remove(absPath: string): Promise<void> {
    const stat = await fs.stat(absPath)
    if (stat.isDirectory()) {
      await fs.rm(absPath, { recursive: true, force: true })
    } else {
      await fs.unlink(absPath)
    }
  }

  async stat(absPath: string): Promise<FileEntry> {
    const stat = await fs.stat(absPath)
    const name = path.basename(absPath)
    return {
      name,
      path: absPath,
      type: stat.isDirectory() ? 'directory' : 'file',
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    }
  }
}
