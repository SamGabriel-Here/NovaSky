import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy } from '@shared/csp'

const directive = (policy: string, name: string): string => {
  const found = policy.split('; ').find((part) => part.startsWith(`${name} `))
  if (!found) throw new Error(`policy has no ${name} directive`)
  return found
}

describe('production policy', () => {
  const policy = buildContentSecurityPolicy(false)

  it('locks scripts to the bundle', () => {
    expect(directive(policy, 'script-src')).toBe("script-src 'self'")
  })

  it('makes no network origin reachable from the renderer', () => {
    expect(directive(policy, 'connect-src')).toBe("connect-src 'self'")
  })

  it('never ships the dev relaxations', () => {
    expect(policy).not.toContain('unsafe-eval')
    expect(policy).not.toContain('localhost')
    expect(directive(policy, 'script-src')).not.toContain('unsafe-inline')
  })

  it('blocks plugins, base-tag hijacking and framing', () => {
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
  })
})

describe('development policy', () => {
  const policy = buildContentSecurityPolicy(true)

  it("allows Vite's inline React Refresh preamble", () => {
    // Without this the preamble is blocked, @vitejs/plugin-react throws while
    // evaluating the first component, and the window comes up completely blank.
    expect(directive(policy, 'script-src')).toContain("'unsafe-inline'")
  })

  it('allows the dev server and its hot-reload socket', () => {
    const connect = directive(policy, 'connect-src')
    expect(connect).toContain('http://localhost:*')
    expect(connect).toContain('ws://localhost:*')
  })
})

describe('both policies', () => {
  it('allow the inline styles Vite and the sky-map labels rely on', () => {
    for (const isDev of [true, false]) {
      expect(directive(buildContentSecurityPolicy(isDev), 'style-src')).toContain("'unsafe-inline'")
    }
  })

  it('allow data and blob images for the inline icons', () => {
    for (const isDev of [true, false]) {
      expect(directive(buildContentSecurityPolicy(isDev), 'img-src')).toContain('data:')
    }
  })
})
