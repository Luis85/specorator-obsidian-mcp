import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { VaultPort } from '@/domain/ports'
import { joinVaultPath, ok } from './shared'

export function registerVaultTools(server: McpServer, deps: { vault: VaultPort }): void {
  const { vault } = deps

  server.registerTool(
    'vault.read',
    {
      description: 'Read the full content of a vault file',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ content: await vault.readFile(path) }),
  )

  server.registerTool(
    'vault.list',
    {
      description: 'List files and immediate subfolders in a vault folder',
      inputSchema: { folder: z.string().describe('Vault-relative folder path') },
    },
    async ({ folder }) => {
      const [files, subfolderNames] = await Promise.all([
        vault.listFiles(folder),
        vault.listFolders(folder),
      ])
      const folders = subfolderNames.map((sub) => joinVaultPath(folder, sub))
      return ok({ files, folders })
    },
  )

  server.registerTool(
    'vault.exists',
    {
      description: 'Check whether a file exists in the vault',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => ok({ exists: await vault.fileExists(path) }),
  )

  server.registerTool(
    'vault.write',
    {
      description: 'Write (overwrite or create) a vault file',
      inputSchema: {
        path: z.string().describe('Vault-relative path'),
        content: z.string().describe('Full file content to write'),
      },
    },
    async ({ path, content }) => {
      await vault.writeFile(path, content)
      return ok({ written: true, path })
    },
  )

  server.registerTool(
    'vault.delete',
    {
      description: 'Delete a file from the vault',
      inputSchema: { path: z.string().describe('Vault-relative path') },
    },
    async ({ path }) => {
      await vault.deleteFile(path)
      return ok({ deleted: true, path })
    },
  )

  server.registerTool(
    'vault.move',
    {
      description: 'Move (rename) a vault file to a new path',
      inputSchema: {
        from: z.string().describe('Current vault-relative path'),
        to: z.string().describe('Destination vault-relative path'),
      },
    },
    async ({ from, to }) => {
      const content = await vault.readFile(from)
      await vault.writeFile(to, content)
      await vault.deleteFile(from)
      return ok({ moved: true, from, to })
    },
  )

  server.registerTool(
    'vault.createFolder',
    {
      description: 'Create a folder in the vault',
      inputSchema: { path: z.string().describe('Vault-relative folder path') },
    },
    async ({ path }) => {
      await vault.createFolder(path)
      return ok({ created: true, path })
    },
  )
}
