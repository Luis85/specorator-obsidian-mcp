// Returns the running MCP server's tool names (bare, without server prefix),
// or null if the server can't be queried. Wiring depends on how the plugin
// exposes its own server handle; this is the single integration point.
export async function getLiveToolNames(
  server: { listTools?: () => Promise<{ name: string }[]> } | null,
): Promise<string[] | null> {
  if (server?.listTools === undefined) return null
  try {
    return (await server.listTools()).map((t) => t.name)
  } catch {
    return null
  }
}
