import { describe, expect, test } from 'bun:test'
import { ManifestV1 } from '../manifest'

const manifest = () => ({
  __claude_bot_manifest_v1__: true,
  name: 'Fixture bot',
  vendor: 'Fixture vendor',
  version: '1.0.0',
  description: 'Synthetic dependency validation fixture',
  tools: [] as { name: string; description: string }[],
  publishedAt: '2026-10-29T00:00:00.000Z',
})

describe('manifest collection validation', () => {
  test('rejects oversized collections before reading untrusted elements', () => {
    const input = manifest()
    input.tools = Array.from({ length: 51 }, () => ({ name: 'read', description: '' }))
    Object.defineProperty(input.tools, 0, {
      get() {
        throw new Error('Oversized collection elements must not be visited')
      },
    })

    const result = ManifestV1.safeParse(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ code: 'too_big', path: ['tools'] }),
      )
    }
  })

  test('preserves valid manifests at the existing collection limit', () => {
    const input = manifest()
    input.tools = Array.from({ length: 50 }, (_, i) => ({ name: `read_${i}`, description: '' }))
    expect(ManifestV1.parse(input).tools).toEqual(input.tools)
  })
})
