import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { LoggerPort } from '@/domain/ports'

/**
 * Minimal settings source accepted by the constructor.
 * A full SettingsPort satisfies this interface; raw objects also work for
 * tests that want to pass settings directly without a mock.
 *
 * Called once per `start()` to read the bind port; that value is cached for
 * the lifetime of the running server. A full SettingsPort satisfies this
 * interface.
 */
export interface McpSettingsSource {
  getSettings(): PluginSettings
}

/**
 * Connection config returned to callers that need to know where the server
 * is reachable.
 */
export interface McpConnectionConfig {
  transport: 'http'
  url: string
}

/**
 * In-process loopback MCP server.
 *
 * Binds to `127.0.0.1:<settings.port>`. Each POST /mcp request gets its own
 * fresh `McpServer` + `StreamableHTTPServerTransport` (stateless). The Host
 * header gate rejects any request whose Host is not `127.0.0.1` or `localhost`
 * with HTTP 421 Misdirected Request.
 *
 * Tool registrations are injected via `setToolRegistrar` — this adapter itself
 * registers no tools. The registrar callback is optional; if absent, the bare
 * server still starts and accepts MCP handshakes.
 */
export class ObsidianMcpServerAdapter {
  private readonly settings: McpSettingsSource
  private readonly logger: LoggerPort | undefined
  private httpServer: http.Server | null = null
  private _boundPort: number | null = null
  private toolRegistrar: ((server: McpServer) => void) | undefined

  constructor(settings: McpSettingsSource, logger?: LoggerPort) {
    this.settings = settings
    this.logger = logger
  }

  /**
   * Register a tool-population callback. Called once per request, just after
   * the fresh `McpServer` is constructed. PR4 wires the 7 tool-group
   * registrars here; until then the server advertises zero tools.
   */
  setToolRegistrar(fn: (server: McpServer) => void): void {
    this.toolRegistrar = fn
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async start(): Promise<{ port: number }> {
    if (this.httpServer !== null) {
      throw new Error('MCP server already running — call stop() first')
    }
    const port = this.settings.getSettings().port

    const server = http.createServer((req, res) => {
      const host = (req.headers.host?.split(':')[0] ?? '').toLowerCase()
      if (host !== '127.0.0.1' && host !== 'localhost') {
        res.writeHead(421).end()
        return
      }
      // DNS-rebinding defence: if Origin is present it must be a loopback origin.
      // SDK clients and curl omit Origin entirely; browsers always send it.
      const origin = req.headers.origin?.toLowerCase()
      if (origin && origin !== 'null') {
        const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`]
        if (!allowed.includes(origin)) {
          res.writeHead(421).end()
          return
        }
      }
      if (req.url === '/mcp') {
        void this._handleMcpRequest(req, res).catch((_err) => {
          this.logger?.error('mcp request failed', _err)
          if (!res.headersSent) res.writeHead(500).end()
        })
      } else {
        res.writeHead(404).end()
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })

    this.httpServer = server
    this._boundPort = port
    return { port }
  }

  /**
   * Synchronous socket drain — fire-and-forget counterpart to `stop()`.
   * Called from `onunload()` where Obsidian does not await async work.
   * Safe to call before `start()` (no-op) or after `stop()` (no-op).
   */
  drainSync(): void {
    const server = this.httpServer
    if (server === null) return
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections()
    }
    server.unref()
  }

  async stop(): Promise<void> {
    const server = this.httpServer
    if (server === null) return
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections()
    }
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err !== undefined) reject(err)
        else resolve()
      })
    })
    this.httpServer = null
    this._boundPort = null
  }

  get boundPort(): number | null {
    return this._boundPort
  }

  getConnectionConfig(): McpConnectionConfig {
    if (this._boundPort === null) {
      throw new Error('MCP server not started — call start() first')
    }
    return { transport: 'http', url: `http://127.0.0.1:${this._boundPort}/mcp` }
  }

  // -------------------------------------------------------------------------
  // Per-request handler
  // -------------------------------------------------------------------------

  private async _handleMcpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const mcp = new McpServer({ name: 'specorator-mcp', version: '0.0.1' })

    // Tool registrar seam: PR4+ will call setToolRegistrar() before start()
    // to populate this server with vault/metadata/links/canvas/bases/cli tools.
    this.toolRegistrar?.(mcp)

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcp.connect(transport)
    try {
      await transport.handleRequest(req, res)
    } finally {
      await transport.close()
    }
  }
}
