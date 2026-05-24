import * as http from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

/**
 * Minimal settings source accepted by the constructor.
 * A full SettingsPort satisfies this interface; raw objects also work for
 * tests that want to pass settings directly without a mock.
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
  private httpServer: http.Server | null = null
  private boundPort: number | null = null
  private toolRegistrar: ((server: McpServer) => void) | undefined

  constructor(settings: McpSettingsSource) {
    this.settings = settings
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
      const host = req.headers.host?.split(':')[0] ?? ''
      if (host !== '127.0.0.1' && host !== 'localhost') {
        res.writeHead(421).end()
        return
      }
      if (req.url === '/mcp') {
        void this._handleMcpRequest(req, res).catch(() => {
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
    this.boundPort = port
    return { port }
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
    this.boundPort = null
  }

  getConnectionConfig(): McpConnectionConfig {
    if (this.boundPort === null) {
      throw new Error('MCP server not started — call start() first')
    }
    return { transport: 'http', url: `http://127.0.0.1:${this.boundPort}/mcp` }
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
