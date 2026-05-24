import { describe, it, expect, afterEach } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { PermissionGate } from '@/application/mcp/PermissionGate'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { registerVaultTools } from '@/infrastructure/obsidian/mcp/registerVaultTools'
import { fakeModulePorts } from '@@/__fakes__/fake-ports'

const TEST_PORT_ALLOW = 17999
const TEST_PORT_DENY = 17998

describe('live MCP client end-to-end', () => {
  let adapter: ObsidianMcpServerAdapter | undefined
  let client: Client | undefined

  afterEach(async () => {
    if (client) await client.close()
    if (adapter) await adapter.stop()
    adapter = undefined
    client = undefined
  })

  it('calls vault.write via real MCP client through loopback HTTP', async () => {
    // Override all toolModes to 'allow' so vault.write goes through without modal.
    const allAllow = Object.fromEntries(
      Object.keys(DEFAULT_SETTINGS.toolModes).map((k) => [k, 'allow' as const]),
    )
    const settings = {
      ...DEFAULT_SETTINGS,
      port: TEST_PORT_ALLOW,
      defaultMode: 'allow' as const,
      toolModes: allAllow,
    }
    const ports = fakeModulePorts()
    const gate = new PermissionGate({ getSettings: () => settings }, ports.confirmModal)
    adapter = new ObsidianMcpServerAdapter({ getSettings: () => settings })
    adapter.setToolRegistrar((server) => {
      registerVaultTools(server, { vault: ports.vault, gate })
    })
    await adapter.start()

    client = new Client({ name: 'e2e-test', version: '0.0.1' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${TEST_PORT_ALLOW}/mcp`),
    )
    await client.connect(transport)

    const result = await client.callTool({
      name: 'vault.write',
      arguments: { path: 'hello.md', content: 'world' },
    })
    expect(result.isError).toBeFalsy()
    expect(await ports.vault.readFile('hello.md')).toBe('world')
  })

  it('returns deny envelope when settings deny vault.write', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      port: TEST_PORT_DENY,
      defaultMode: 'allow' as const,
      toolModes: { ...DEFAULT_SETTINGS.toolModes, 'vault.write': 'deny' as const },
    }
    const ports = fakeModulePorts()
    const gate = new PermissionGate({ getSettings: () => settings }, ports.confirmModal)
    adapter = new ObsidianMcpServerAdapter({ getSettings: () => settings })
    adapter.setToolRegistrar((server) => {
      registerVaultTools(server, { vault: ports.vault, gate })
    })
    await adapter.start()

    client = new Client({ name: 'e2e-test', version: '0.0.1' }, { capabilities: {} })
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${TEST_PORT_DENY}/mcp`),
    )
    await client.connect(transport)

    const result = await client.callTool({
      name: 'vault.write',
      arguments: { path: 'a.md', content: 'x' },
    })
    expect(result.isError).toBe(true)
  })
})
