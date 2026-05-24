import esbuild from 'esbuild'
import process from 'node:process'

const banner = `/*
THIS FILE IS GENERATED. DO NOT EDIT.
Source: github.com/Luis85/specorator-obsidian-mcp
*/`

const watch = process.argv.includes('--watch')

const ctx = await esbuild.context({
  banner: { js: banner },
  entryPoints: ['src/plugin/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    'node:http',
    'node:crypto',
    'node:fs',
    'node:path',
  ],
  format: 'cjs',
  target: 'es2022',
  logLevel: 'info',
  sourcemap: 'inline',
  treeShaking: true,
  platform: 'node',
  outfile: 'main.js',
})

if (watch) {
  await ctx.watch()
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
