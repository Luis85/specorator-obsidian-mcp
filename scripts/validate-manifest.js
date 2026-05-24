import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`✗ Required file not found: ${filePath}`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

const manifest = readJson(path.join(repoRoot, 'manifest.json'))
const pkg = readJson(path.join(repoRoot, 'package.json'))
const versions = readJson(path.join(repoRoot, 'versions.json'))

const errors = []

const required = [
  'id',
  'name',
  'version',
  'minAppVersion',
  'description',
  'author',
  'isDesktopOnly',
]
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
