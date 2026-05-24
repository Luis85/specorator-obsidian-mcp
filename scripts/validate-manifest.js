/* eslint-env node */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'))
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
const versions = JSON.parse(fs.readFileSync(path.join(repoRoot, 'versions.json'), 'utf8'))

const errors = []

const required = ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'isDesktopOnly']
for (const key of required) {
  if (manifest[key] === undefined) errors.push(`manifest.json missing field: ${key}`)
}

if (manifest.version !== pkg.version) {
  errors.push(`version mismatch: manifest=${manifest.version} package=${pkg.version}`)
}

if (!versions[manifest.version]) {
  errors.push(`versions.json missing entry for ${manifest.version}`)
}

if (manifest.isDesktopOnly !== true) {
  errors.push('isDesktopOnly must be true (http.Server is Node-only)')
}

if (errors.length > 0) {
  for (const e of errors) console.error(`✗ ${e}`)
  process.exit(1)
}
console.log('✓ manifest.json valid')
