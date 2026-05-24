import * as http from 'node:http'
import { describe, it, expect, afterEach } from 'vitest'
import { ObsidianMcpServerAdapter } from '@/infrastructure/obsidian/ObsidianMcpServerAdapter'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

/**
 * Send a raw HTTP POST with a custom Host header bypassing the Fetch API's
 * forbidden-header restriction. Node's `fetch` silently overrides `Host` to
 * the connection target, so we use `http.request` directly for the gate test.
 */
function rawPost(port: number, host: string, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, 'utf8')
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: host,
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
        },
      },
      (res) => {
        res.resume() // drain so the socket closes
        resolve(res.statusCode ?? 0)
      },
    )
    req.on('error', reject)
    req.end(bodyBuf)
  })
}

/**
 * Like rawPost but also sets an Origin header to test the DNS-rebinding gate.
 */
function rawPostWithOrigin(port: number, origin: string, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, 'utf8')
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          Host: '127.0.0.1',
          Origin: origin,
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
        },
      },
      (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      },
    )
    req.on('error', reject)
    req.end(bodyBuf)
  })
}

const TEST_PORT = 17842 // ephemeral test port; collision-unlikely

function makeAdapter(overrides: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const settings = { ...DEFAULT_SETTINGS, port: TEST_PORT, ...overrides }
  const getSettings = () => settings
  return new ObsidianMcpServerAdapter({ getSettings })
}

describe('ObsidianMcpServerAdapter', () => {
  let adapter: ObsidianMcpServerAdapter | undefined

  afterEach(async () => {
    if (adapter) await adapter.stop()
    adapter = undefined
  })

  it('starts on configured port', async () => {
    adapter = makeAdapter()
    const { port } = await adapter.start()
    expect(port).toBe(TEST_PORT)
  })

  it('rejects non-loopback Host header with 421', async () => {
    adapter = makeAdapter()
    await adapter.start()
    // Node's fetch() forbids setting the Host header (Fetch spec §forbidden headers).
    // Use raw http.request to inject an arbitrary Host value and exercise the gate.
    const status = await rawPost(
      TEST_PORT,
      'evil.example.com',
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    )
    expect(status).toBe(421)
  })

  it('getConnectionConfig returns http URL on configured port', async () => {
    adapter = makeAdapter()
    await adapter.start()
    expect(adapter.getConnectionConfig()).toEqual({
      transport: 'http',
      url: `http://127.0.0.1:${TEST_PORT}/mcp`,
    })
  })

  it('stop is idempotent', async () => {
    adapter = makeAdapter()
    await adapter.start()
    await adapter.stop()
    await adapter.stop() // must not throw
  })

  it('surfaces EADDRINUSE on port conflict', async () => {
    adapter = makeAdapter()
    await adapter.start()
    const second = makeAdapter() // same port
    await expect(second.start()).rejects.toThrow(/EADDRINUSE/i)
  })

  it('accepts uppercase LOCALHOST as a loopback Host', async () => {
    adapter = makeAdapter()
    await adapter.start()
    // The gate lowercases the Host header before comparison, so LOCALHOST must
    // be treated as loopback. If the MCP SDK subsequently resets the connection
    // (ECONNRESET) that still means the gate passed — only a 421 means rejection.
    let status: number | undefined
    try {
      status = await rawPost(
        TEST_PORT,
        'LOCALHOST',
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      )
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ECONNRESET' || code === 'ECONNREFUSED') {
        // Connection was accepted by the gate and then closed by the SDK — not 421.
        return
      }
      throw err
    }
    expect(status).not.toBe(421)
  })

  it('getConnectionConfig throws before start', () => {
    const a = makeAdapter()
    expect(() => a.getConnectionConfig()).toThrow(/not started/i)
  })

  it('stop before start is a no-op', async () => {
    const a = makeAdapter()
    await expect(a.stop()).resolves.toBeUndefined()
  })

  it('throws on double-start without intervening stop', async () => {
    adapter = makeAdapter()
    await adapter.start()
    await expect(adapter.start()).rejects.toThrow(/already running/i)
  })

  describe('Origin header gate (DNS-rebinding defence)', () => {
    it('rejects cross-origin request with 421', async () => {
      adapter = makeAdapter()
      await adapter.start()
      const status = await rawPostWithOrigin(
        TEST_PORT,
        'https://evil.com',
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
      )
      expect(status).toBe(421)
    })

    it('accepts loopback origin http://127.0.0.1:<port>', async () => {
      adapter = makeAdapter()
      await adapter.start()
      let status: number | undefined
      try {
        status = await rawPostWithOrigin(
          TEST_PORT,
          `http://127.0.0.1:${TEST_PORT}`,
          JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
        )
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ECONNRESET' || code === 'ECONNREFUSED') return
        throw err
      }
      expect(status).not.toBe(421)
    })

    it('accepts requests with no Origin header (SDK / curl clients)', async () => {
      adapter = makeAdapter()
      await adapter.start()
      // rawPost sends no Origin header — should not be blocked
      let status: number | undefined
      try {
        status = await rawPost(
          TEST_PORT,
          '127.0.0.1',
          JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
        )
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ECONNRESET' || code === 'ECONNREFUSED') return
        throw err
      }
      expect(status).not.toBe(421)
    })
  })

  describe('drainSync', () => {
    it('is a no-op when the server has never been started', () => {
      const a = makeAdapter()
      expect(() => a.drainSync()).not.toThrow()
    })

    it('can be called before stop without throwing', async () => {
      adapter = makeAdapter()
      await adapter.start()
      expect(() => adapter!.drainSync()).not.toThrow()
    })
  })
})
