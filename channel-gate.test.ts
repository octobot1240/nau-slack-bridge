import { describe, expect, test } from 'bun:test'
import { enforceConfiguredChannel } from './channel-gate.ts'

describe('configured instance channel gate', () => {
  test('passes the declared channel without journaling', () => {
    const journaled: unknown[] = []

    expect(
      enforceConfiguredChannel(
        { channel: 'C_ALLOWED', user: 'U_ALICE' },
        'C_ALLOWED',
        (event) => journaled.push(event),
      ),
    ).toBe(true)
    expect(journaled).toEqual([])
  })

  test('drops a different channel and journals the decision', () => {
    const journaled: unknown[] = []

    expect(
      enforceConfiguredChannel(
        { channel: 'C_OTHER', user: 'U_ALICE' },
        'C_ALLOWED',
        (event) => journaled.push(event),
      ),
    ).toBe(false)
    expect(journaled).toEqual([
      {
        kind: 'gate.inbound.drop',
        outcome: 'drop',
        actor: 'session_owner',
        input: {
          channel: 'C_OTHER',
          user: 'U_ALICE',
          dropReason: 'channel.instance_mismatch',
        },
        reason: 'channel.instance_mismatch',
      },
    ])
  })

  test('fails closed when SLACK_CHANNEL_ID is absent', () => {
    const journaled: unknown[] = []

    expect(
      enforceConfiguredChannel(
        { channel: 'C_OTHER', user: 'U_ALICE' },
        undefined,
        (event) => journaled.push(event),
      ),
    ).toBe(false)
    expect(journaled).toHaveLength(1)
  })
})
