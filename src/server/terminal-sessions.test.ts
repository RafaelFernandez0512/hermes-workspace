import { describe, expect, it } from 'vitest'
import { buildHostTerminalCommand } from './terminal-sessions'

describe('buildHostTerminalCommand', () => {
  it('wraps the session in a docker chroot to the host filesystem', () => {
    const command = buildHostTerminalCommand({
      sessionId: 'abc123def456',
      command: ['/bin/bash', '-l'],
      cols: 120,
      rows: 40,
      image: 'debian:bookworm-slim',
      home: '/home/winterfell',
      user: 'winterfell',
      cwd: '/home/winterfell/hermes-workspace',
      path: '/home/winterfell/.local/bin:/usr/bin:/bin',
    })

    expect(command[0]).toBe('/bin/sh')
    expect(command[1]).toBe('-lc')
    expect(command[2]).toContain("'docker' 'run'")
    expect(command[2]).toContain("'--volume' '/:/host:rw,rslave'")
    expect(command[2]).toContain(
      "'--volume' '/var/run/docker.sock:/var/run/docker.sock'",
    )
    expect(command[2]).toContain("'--group-add'")
    expect(command[2]).toContain(
      "'--workdir' '/host/home/winterfell/hermes-workspace'",
    )
    expect(command[2]).toContain('chroot')
    expect(command[2]).toContain("'HOME=/home/winterfell'")
    expect(command[2]).toContain(
      "'PATH=/home/winterfell/.local/bin:/usr/bin:/bin'",
    )
    expect(command[2]).toContain('DOCKER_HOST=unix:///var/run/docker.sock')
    expect(command[2]).toContain('/bin/bash')
    expect(command[2]).toContain('-lc')
    expect(command[2]).toContain('exec')
  })
})
