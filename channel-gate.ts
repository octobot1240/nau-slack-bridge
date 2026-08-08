/**
 * Per-instance inbound channel boundary for NAU bridge processes.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export const CHANNEL_INSTANCE_MISMATCH = 'channel.instance_mismatch'

export interface ChannelGateJournalEvent {
  kind: 'gate.inbound.drop'
  outcome: 'drop'
  actor: 'peer_agent' | 'session_owner'
  input: Record<string, unknown>
  reason: typeof CHANNEL_INSTANCE_MISMATCH
}

/** Fail closed unless the inbound message belongs to this process's channel. */
export function enforceConfiguredChannel(
  event: unknown,
  configuredChannelId: string | undefined,
  journalWrite: (event: ChannelGateJournalEvent) => unknown,
): boolean {
  const ev =
    event !== null && typeof event === 'object' ? (event as Record<string, unknown>) : {}
  const channel = typeof ev.channel === 'string' ? ev.channel : undefined
  if (
    configuredChannelId !== undefined &&
    configuredChannelId !== '' &&
    channel === configuredChannelId
  ) {
    return true
  }

  const user = typeof ev.user === 'string' ? ev.user : undefined
  journalWrite({
    kind: 'gate.inbound.drop',
    outcome: 'drop',
    actor: ev.bot_id ? 'peer_agent' : 'session_owner',
    input: {
      ...(channel !== undefined ? { channel } : {}),
      ...(user !== undefined ? { user } : {}),
      dropReason: CHANNEL_INSTANCE_MISMATCH,
    },
    reason: CHANNEL_INSTANCE_MISMATCH,
  })
  return false
}
