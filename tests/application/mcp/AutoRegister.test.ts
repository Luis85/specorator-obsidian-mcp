import { describe, it, expect, beforeEach } from 'vitest'
import { AutoRegister, SERVER_KEY, sidecarPath } from '@/application/mcp/AutoRegister'
import type { AutoRegisterTarget } from '@/application/mcp/AutoRegister'
import { MockFileSystemPort } from '@/infrastructure/mock/MockFileSystemPort'

const URL = 'http://127.0.0.1:7842/mcp'

function makeTarget(id: AutoRegisterTarget['id'] = 'claudeCli'): AutoRegisterTarget {
  return { id, name: 'Test Client', configPath: '/fake/path/config.json' }
}

describe('AutoRegister.register', () => {
  let mockFs: MockFileSystemPort
  let ar: AutoRegister
  const target = makeTarget()

  beforeEach(() => {
    mockFs = new MockFileSystemPort()
    ar = new AutoRegister(mockFs)
  })

  it('creates config with mcpServers when file is missing', async () => {
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('registered')
    const written = mockFs.files.get(target.configPath)
    expect(written).toBeDefined()
    const parsed = JSON.parse(written!)
    expect(parsed.mcpServers[SERVER_KEY]).toEqual({ type: 'http', url: URL })
  })

  it('merges our entry into existing config, preserving other mcpServers entries', async () => {
    const existing = JSON.stringify({
      mcpServers: { 'other-server': { type: 'http', url: 'http://example.com/mcp' } },
    })
    mockFs.files.set(target.configPath, existing)

    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('registered')
    const parsed = JSON.parse(mockFs.files.get(target.configPath)!)
    expect(parsed.mcpServers['other-server']).toEqual({
      type: 'http',
      url: 'http://example.com/mcp',
    })
    expect(parsed.mcpServers[SERVER_KEY]).toEqual({ type: 'http', url: URL })
  })

  it('merges into file that has no mcpServers key yet', async () => {
    mockFs.files.set(target.configPath, JSON.stringify({ someOtherKey: true }))
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('registered')
    const parsed = JSON.parse(mockFs.files.get(target.configPath)!)
    expect(parsed.someOtherKey).toBe(true)
    expect(parsed.mcpServers[SERVER_KEY]).toEqual({ type: 'http', url: URL })
  })

  it('returns skipped and does NOT write when JSON is unparseable', async () => {
    mockFs.files.set(target.configPath, '{ invalid json !!!')
    const writesBefore = mockFs.writeCallCount
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('skipped')
    expect(results[0]?.reason).toMatch(/unparseable/i)
    expect(mockFs.writeCallCount).toBe(writesBefore)
  })

  it('returns skipped when config root is an array', async () => {
    mockFs.files.set(target.configPath, JSON.stringify([]))
    const writesBefore = mockFs.writeCallCount
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('skipped')
    expect(results[0]?.reason).toMatch(/not an object/i)
    expect(mockFs.writeCallCount).toBe(writesBefore)
  })

  it('returns unchanged and does NOT write when same URL already present', async () => {
    mockFs.files.set(
      target.configPath,
      JSON.stringify({ mcpServers: { [SERVER_KEY]: { type: 'http', url: URL } } }),
    )
    const writesBefore = mockFs.writeCallCount
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('unchanged')
    expect(mockFs.writeCallCount).toBe(writesBefore)
  })

  it('updates entry when same key has a different URL', async () => {
    const oldUrl = 'http://127.0.0.1:9999/mcp'
    mockFs.files.set(
      target.configPath,
      JSON.stringify({ mcpServers: { [SERVER_KEY]: { type: 'http', url: oldUrl } } }),
    )
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('registered')
    const parsed = JSON.parse(mockFs.files.get(target.configPath)!)
    expect(parsed.mcpServers[SERVER_KEY].url).toBe(URL)
  })

  it('returns failed with reason when writeText throws', async () => {
    // Make writeText throw
    const throwingFs = new MockFileSystemPort()
    throwingFs.writeText = async () => {
      throw new Error('disk full')
    }
    const arThrow = new AutoRegister(throwingFs)
    const results = await arThrow.register(URL, [target])
    expect(results[0]?.status).toBe('failed')
    expect(results[0]?.reason).toBe('disk full')
  })

  it('processes multiple targets independently', async () => {
    const t1: AutoRegisterTarget = { id: 'claudeCli', name: 'CLI', configPath: '/a/cli.json' }
    const t2: AutoRegisterTarget = { id: 'cursor', name: 'Cursor', configPath: '/b/cursor.json' }
    // t2 has bad JSON
    mockFs.files.set(t2.configPath, '{{bad}}')
    const results = await ar.register(URL, [t1, t2])
    expect(results[0]?.status).toBe('registered')
    expect(results[1]?.status).toBe('skipped')
  })

  it('output JSON uses 2-space indent and trailing newline', async () => {
    await ar.register(URL, [target])
    const written = mockFs.files.get(target.configPath)!
    expect(written.endsWith('\n')).toBe(true)
    // first line should have 2-space indent for mcpServers
    const lines = written.split('\n')
    expect(lines[1]).toMatch(/^ {2}"mcpServers"/)
  })

  describe('.bak rotation', () => {
    it('writes .bak with original content before mutating', async () => {
      const original = JSON.stringify({ mcpServers: {} })
      mockFs.files.set(target.configPath, original)
      await ar.register(URL, [target])
      const bak = mockFs.files.get(`${target.configPath}.bak`)
      expect(bak).toBe(original)
    })

    it('does NOT write .bak when file did not exist', async () => {
      // file does not exist in mockFs
      const writesBefore = mockFs.writeCallCount
      await ar.register(URL, [target])
      // 2 writes: the config itself + the sidecar (Fix 2); no .bak write
      const bak = mockFs.files.get(`${target.configPath}.bak`)
      expect(bak).toBeUndefined()
      expect(mockFs.writeCallCount).toBe(writesBefore + 2)
    })

    it('does NOT write .bak when URL is unchanged (skips write)', async () => {
      mockFs.files.set(
        target.configPath,
        JSON.stringify({ mcpServers: { [SERVER_KEY]: { type: 'http', url: URL } } }),
      )
      const writesBefore = mockFs.writeCallCount
      await ar.register(URL, [target])
      expect(mockFs.writeCallCount).toBe(writesBefore)
      expect(mockFs.files.get(`${target.configPath}.bak`)).toBeUndefined()
    })
  })
})

// WS-Z2 Fix 2: supply-chain detection via last-written hash sidecar
describe('AutoRegister supply-chain detection', () => {
  let mockFs: MockFileSystemPort
  const target = makeTarget()
  const SIDECAR = sidecarPath()

  beforeEach(() => {
    mockFs = new MockFileSystemPort()
  })

  it('writes a sidecar entry after register', async () => {
    const ar = new AutoRegister(mockFs)
    await ar.register(URL, [target])
    const sidecar = JSON.parse(mockFs.files.get(SIDECAR)!)
    expect(sidecar[target.configPath]).toBeDefined()
    expect(typeof sidecar[target.configPath].sha256).toBe('string')
    expect(sidecar[target.configPath].sha256).toHaveLength(64)
  })

  it('warns and overwrites when external actor mutates our entry', async () => {
    const warnings: string[] = []
    const ar = new AutoRegister(mockFs, (m) => warnings.push(m))

    // First registration — establish baseline
    await ar.register(URL, [target])

    // External actor tampers with the entry (different URL)
    const config = JSON.parse(mockFs.files.get(target.configPath)!)
    config.mcpServers[SERVER_KEY] = { type: 'http', url: 'http://evil.example.com/mcp' }
    mockFs.files.set(target.configPath, JSON.stringify(config))

    // Re-register — should detect mutation and warn
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('registered')
    expect(results[0]?.externallyMutated).toBe(true)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/modified externally/i)

    // Confirm our correct entry is restored
    const restored = JSON.parse(mockFs.files.get(target.configPath)!)
    expect(restored.mcpServers[SERVER_KEY].url).toBe(URL)
  })

  it('removes sidecar entry after deregister', async () => {
    const ar = new AutoRegister(mockFs)
    await ar.register(URL, [target])
    expect(JSON.parse(mockFs.files.get(SIDECAR)!)[target.configPath]).toBeDefined()

    await ar.deregister([target])
    const sidecar = JSON.parse(mockFs.files.get(SIDECAR)!)
    expect(sidecar[target.configPath]).toBeUndefined()
  })

  it('warns on deregister when entry was externally mutated', async () => {
    const warnings: string[] = []
    const ar = new AutoRegister(mockFs, (m) => warnings.push(m))

    await ar.register(URL, [target])

    // External mutation before deregister
    const config = JSON.parse(mockFs.files.get(target.configPath)!)
    config.mcpServers[SERVER_KEY] = { type: 'http', url: 'http://attacker.example/mcp' }
    mockFs.files.set(target.configPath, JSON.stringify(config))

    await ar.deregister([target])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatch(/modified externally/i)
  })

  it('does not warn when entry is unchanged between registrations', async () => {
    const warnings: string[] = []
    const ar = new AutoRegister(mockFs, (m) => warnings.push(m))
    await ar.register(URL, [target])
    // Re-register without any tampering — prior entry has same URL so returns unchanged
    const results = await ar.register(URL, [target])
    expect(results[0]?.status).toBe('unchanged')
    expect(warnings).toHaveLength(0)
  })
})

describe('AutoRegister.deregister', () => {
  let mockFs: MockFileSystemPort
  let ar: AutoRegister
  const target = makeTarget()

  beforeEach(() => {
    mockFs = new MockFileSystemPort()
    ar = new AutoRegister(mockFs)
  })

  it('removes only our entry, preserving other mcpServers entries', async () => {
    mockFs.files.set(
      target.configPath,
      JSON.stringify({
        mcpServers: {
          [SERVER_KEY]: { type: 'http', url: URL },
          'other-server': { type: 'http', url: 'http://example.com/mcp' },
        },
      }),
    )
    const results = await ar.deregister([target])
    expect(results[0]?.status).toBe('deregistered')
    const parsed = JSON.parse(mockFs.files.get(target.configPath)!)
    expect(SERVER_KEY in parsed.mcpServers).toBe(false)
    expect(parsed.mcpServers['other-server']).toBeDefined()
  })

  it('preserves an empty mcpServers object after removing our entry', async () => {
    mockFs.files.set(
      target.configPath,
      JSON.stringify({ mcpServers: { [SERVER_KEY]: { type: 'http', url: URL } } }),
    )
    await ar.deregister([target])
    const parsed = JSON.parse(mockFs.files.get(target.configPath)!)
    expect(parsed.mcpServers).toBeDefined()
    expect(Object.keys(parsed.mcpServers)).toHaveLength(0)
  })

  it('returns unchanged when config file is missing', async () => {
    const results = await ar.deregister([target])
    expect(results[0]?.status).toBe('unchanged')
  })

  it('returns unchanged when our key is absent from mcpServers', async () => {
    mockFs.files.set(
      target.configPath,
      JSON.stringify({ mcpServers: { 'other-server': { type: 'http', url: 'http://x.com/mcp' } } }),
    )
    const writesBefore = mockFs.writeCallCount
    const results = await ar.deregister([target])
    expect(results[0]?.status).toBe('unchanged')
    expect(mockFs.writeCallCount).toBe(writesBefore)
  })

  it('returns unchanged when mcpServers key is absent', async () => {
    mockFs.files.set(target.configPath, JSON.stringify({ someKey: 1 }))
    const writesBefore = mockFs.writeCallCount
    const results = await ar.deregister([target])
    expect(results[0]?.status).toBe('unchanged')
    expect(mockFs.writeCallCount).toBe(writesBefore)
  })

  it('returns skipped when JSON is unparseable', async () => {
    mockFs.files.set(target.configPath, 'not valid json')
    const writesBefore = mockFs.writeCallCount
    const results = await ar.deregister([target])
    expect(results[0]?.status).toBe('skipped')
    expect(mockFs.writeCallCount).toBe(writesBefore)
  })

  it('returns failed with reason when writeText throws', async () => {
    mockFs.files.set(
      target.configPath,
      JSON.stringify({ mcpServers: { [SERVER_KEY]: { type: 'http', url: URL } } }),
    )
    const throwingFs = new MockFileSystemPort({
      [target.configPath]: mockFs.files.get(target.configPath)!,
    })
    throwingFs.writeText = async () => {
      throw new Error('permission denied')
    }
    const arThrow = new AutoRegister(throwingFs)
    const results = await arThrow.deregister([target])
    expect(results[0]?.status).toBe('failed')
    expect(results[0]?.reason).toBe('permission denied')
  })

  it('returns deregistered status on successful removal', async () => {
    mockFs.files.set(
      target.configPath,
      JSON.stringify({ mcpServers: { [SERVER_KEY]: { type: 'http', url: URL } } }),
    )
    const results = await ar.deregister([target])
    expect(results[0]?.status).toBe('deregistered')
    expect(results[0]?.reason).toBeUndefined()
  })

  it('writes .bak with original content before deregistering', async () => {
    const original = JSON.stringify({
      mcpServers: { [SERVER_KEY]: { type: 'http', url: URL } },
    })
    mockFs.files.set(target.configPath, original)
    await ar.deregister([target])
    const bak = mockFs.files.get(`${target.configPath}.bak`)
    expect(bak).toBe(original)
  })
})
