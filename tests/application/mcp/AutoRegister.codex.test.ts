import { describe, it, expect, beforeEach } from 'vitest'
import { AutoRegister, SERVER_KEY, wellKnownTargets } from '@/application/mcp/AutoRegister'
import type { AutoRegisterTarget } from '@/application/mcp/AutoRegister'
import { MockFileSystemPort } from '@/infrastructure/mock/MockFileSystemPort'
import { hasTomlBlock, readTomlBlockUrl } from '@/application/mcp/tomlBlock'

const URL = 'http://127.0.0.1:7842/mcp'
const HEADER = `mcp_servers.${SERVER_KEY}`

function codexTarget(): AutoRegisterTarget {
  return { id: 'codex', name: 'Codex CLI', configPath: '/fake/.codex/config.toml', format: 'toml' }
}

describe('AutoRegister codex (toml) register', () => {
  let fs: MockFileSystemPort
  let ar: AutoRegister
  const t = codexTarget()

  beforeEach(() => {
    fs = new MockFileSystemPort()
    ar = new AutoRegister(fs)
  })

  it('writes our [mcp_servers.*] block into a missing file', async () => {
    const results = await ar.register(URL, [t])
    expect(results[0]?.status).toBe('registered')
    const written = fs.files.get(t.configPath)!
    expect(hasTomlBlock(written, HEADER)).toBe(true)
    expect(readTomlBlockUrl(written, HEADER)).toBe(URL)
  })

  it('preserves unrelated tables and comments', async () => {
    fs.files.set(
      t.configPath,
      `# codex config\nmodel = "o3"\n\n[mcp_servers.other]\nurl = "http://other/mcp"\n`,
    )
    await ar.register(URL, [t])
    const written = fs.files.get(t.configPath)!
    expect(written).toContain('# codex config')
    expect(written).toContain('[mcp_servers.other]')
    expect(readTomlBlockUrl(written, HEADER)).toBe(URL)
  })

  it('returns unchanged and does not write when url already matches', async () => {
    fs.files.set(t.configPath, `[${HEADER}]\nurl = "${URL}"\n`)
    const before = fs.writeCallCount
    const results = await ar.register(URL, [t])
    expect(results[0]?.status).toBe('unchanged')
    expect(fs.writeCallCount).toBe(before)
  })

  it('writes a .bak before mutating an existing file', async () => {
    const original = `[${HEADER}]\nurl = "http://old/mcp"\n`
    fs.files.set(t.configPath, original)
    await ar.register(URL, [t])
    expect(fs.files.get(`${t.configPath}.bak`)).toBe(original)
  })

  it('records a sidecar hash after register', async () => {
    await ar.register(URL, [t])
    const { sidecarPath } = await import('@/application/mcp/AutoRegister')
    const sidecar = JSON.parse(fs.files.get(sidecarPath())!)
    expect(sidecar[t.configPath]?.sha256).toHaveLength(64)
  })
})

describe('AutoRegister codex (toml) deregister', () => {
  let fs: MockFileSystemPort
  let ar: AutoRegister
  const t = codexTarget()

  beforeEach(() => {
    fs = new MockFileSystemPort()
    ar = new AutoRegister(fs)
  })

  it('removes only our block, keeping other tables', async () => {
    fs.files.set(
      t.configPath,
      `[${HEADER}]\nurl = "${URL}"\n\n[mcp_servers.other]\nurl = "http://other/mcp"\n`,
    )
    const results = await ar.deregister([t])
    expect(results[0]?.status).toBe('deregistered')
    const written = fs.files.get(t.configPath)!
    expect(hasTomlBlock(written, HEADER)).toBe(false)
    expect(written).toContain('[mcp_servers.other]')
  })

  it('returns unchanged when our block is absent', async () => {
    fs.files.set(t.configPath, `[mcp_servers.other]\nurl = "x"\n`)
    const before = fs.writeCallCount
    const results = await ar.deregister([t])
    expect(results[0]?.status).toBe('unchanged')
    expect(fs.writeCallCount).toBe(before)
  })
})

describe('wellKnownTargets', () => {
  it('includes a codex target using config.toml + toml format', () => {
    const codex = wellKnownTargets().find((x) => x.id === 'codex')
    expect(codex).toBeDefined()
    expect(codex!.format).toBe('toml')
    expect(codex!.configPath.replace(/\\/g, '/')).toMatch(/\.codex\/config\.toml$/)
  })

  it('existing JSON targets default to json format', () => {
    const claude = wellKnownTargets().find((x) => x.id === 'claudeCli')!
    expect(claude.format ?? 'json').toBe('json')
  })
})

describe('AutoRegister codex (toml) supply-chain detection', () => {
  const t: AutoRegisterTarget = {
    id: 'codex',
    name: 'Codex CLI',
    configPath: '/fake/.codex/config.toml',
    format: 'toml',
  }

  function captureLogger(warnings: string[]) {
    return {
      debug: () => {},
      info: () => {},
      warn: (m: string) => warnings.push(m),
      error: () => {},
    }
  }

  it('warns and overwrites when our block is externally mutated (re-register)', async () => {
    const fs = new MockFileSystemPort()
    const warnings: string[] = []
    const ar = new AutoRegister(fs, captureLogger(warnings))
    await ar.register(URL, [t]) // baseline + sidecar hash
    fs.files.set(t.configPath, `[${HEADER}]\nurl = "http://evil/mcp"\n`) // external tamper
    const results = await ar.register(URL, [t])
    expect(results[0]?.status).toBe('registered')
    expect(results[0]?.externallyMutated).toBe(true)
    expect(warnings.some((w) => /modified externally/i.test(w))).toBe(true)
    expect(readTomlBlockUrl(fs.files.get(t.configPath)!, HEADER)).toBe(URL) // restored
  })

  it('warns on deregister when our block was externally mutated', async () => {
    const fs = new MockFileSystemPort()
    const warnings: string[] = []
    const ar = new AutoRegister(fs, captureLogger(warnings))
    await ar.register(URL, [t])
    fs.files.set(t.configPath, `[${HEADER}]\nurl = "http://evil/mcp"\n`)
    await ar.deregister([t])
    expect(warnings.some((w) => /modified externally/i.test(w))).toBe(true)
  })

  it('does NOT warn on deregister when the block has no url key (Fix 1)', async () => {
    const fs = new MockFileSystemPort()
    const warnings: string[] = []
    const ar = new AutoRegister(fs, captureLogger(warnings))
    await ar.register(URL, [t]) // establishes sidecar
    fs.files.set(t.configPath, `[${HEADER}]\ncommand = "npx"\n`) // block present, no url=
    const results = await ar.deregister([t])
    expect(results[0]?.status).toBe('deregistered')
    expect(warnings).toHaveLength(0)
  })

  it('removes the sidecar entry after deregister', async () => {
    const fs = new MockFileSystemPort()
    const ar = new AutoRegister(fs)
    const { sidecarPath } = await import('@/application/mcp/AutoRegister')
    await ar.register(URL, [t])
    expect(JSON.parse(fs.files.get(sidecarPath())!)[t.configPath]).toBeDefined()
    await ar.deregister([t])
    expect(JSON.parse(fs.files.get(sidecarPath())!)[t.configPath]).toBeUndefined()
  })
})
