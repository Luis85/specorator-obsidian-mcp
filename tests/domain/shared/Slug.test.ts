import { describe, it, expect } from 'vitest'
import { Slug } from '@/domain/shared/Slug'

describe('Slug', () => {
  it('creates a lowercase kebab slug from a title', () => {
    const r = Slug.create('Dark Mode Support')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.toString()).toBe('dark-mode-support')
  })

  it('collapses consecutive non-alphanumeric chars', () => {
    const r = Slug.create('Hello  World!!!')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.toString()).toBe('hello-world')
  })

  it('strips leading and trailing hyphens', () => {
    const r = Slug.create('  --my feature--  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.toString()).toBe('my-feature')
  })

  it('rejects a string that produces an empty slug', () => {
    const r = Slug.create('!!! ---')
    expect(r.ok).toBe(false)
  })

  it('two slugs with the same value are equal', () => {
    const a = Slug.create('hello')
    const b = Slug.create('hello')
    if (!a.ok || !b.ok) throw new Error()
    expect(a.value.equals(b.value)).toBe(true)
  })
})
