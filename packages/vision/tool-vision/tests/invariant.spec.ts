import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as VisionInvariant from '@deepseek-ai/dsh-tool-vision/invariant'

describe('tool-vision invariant companion', () => {
  it('registers the package manifest name with an empty installer and disposes cleanly', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = await ctx.plugin(VisionInvariant)
    // The registration reserved the package name: a second registration of the
    // same name must fail loud, proving the first one actually registered.
    await expect(ctx.plugin(VisionInvariant)).rejects.toThrow(/already registered/)
    await fiber.dispose()
  })

  it('has the namespace-plugin export shape (no stray default)', () => {
    expect('default' in VisionInvariant).toBe(false)
    expect(VisionInvariant.name).toBe('tool-vision-invariant')
    expect(VisionInvariant.inject).toEqual(['invariants'])
  })
})
