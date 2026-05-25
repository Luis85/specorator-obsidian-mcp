import { describe, it, expect } from 'vitest'
import { fakeModulePorts } from './fake-ports'

describe('fakeModulePorts', () => {
  it('returns all eight ports + bridge reference', () => {
    const p = fakeModulePorts()
    expect(p.vault).toBeDefined()
    expect(p.metadataCache).toBeDefined()
    expect(p.canvas).toBeDefined()
    expect(p.notification).toBeDefined()
    expect(p.logger).toBeDefined()
    expect(p.settings).toBeDefined()
    expect(p.confirmModal).toBeDefined()
    expect(p.cli).toBeDefined()
    expect(p.bridge).toBeDefined()
  })

  it('vault mutations visible across ports', async () => {
    const p = fakeModulePorts()
    await p.vault.writeFile('a.md', 'hello')
    expect(await p.vault.readFile('a.md')).toBe('hello')
  })
})
