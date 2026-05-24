import { ok, err, type Result } from './Result'

export class Slug {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<Slug> {
    const slug = raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    if (!slug) {
      return err(new Error(`Cannot create a valid slug from: "${raw}"`))
    }
    return ok(new Slug(slug))
  }

  static reconstitute(value: string): Slug {
    return new Slug(value)
  }

  equals(other: Slug): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
