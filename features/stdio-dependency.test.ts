import { expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

type Reply = {
  id?: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

test('MCP stdio negotiates, lists and calls a synthetic tool after the SDK update', async () => {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('./fixtures/stdio-dependency-server.ts', import.meta.url))],
    {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  const exited = once(child, 'exit')
  const lines = createInterface({ input: child.stdout })
  const pending = new Map<number, (reply: Reply) => void>()
  let id = 0
  lines.on('line', (line) => {
    const reply = JSON.parse(line) as Reply
    if (typeof reply.id === 'number') pending.get(reply.id)?.(reply)
  })
  // Drain stderr without exposing or persisting child output.
  child.stderr.resume()
  const request = (method: string, params: Record<string, unknown>) => {
    const requestId = ++id
    return new Promise<Reply>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error(`Fixture timed out for ${method}`))
      }, 5000)
      pending.set(requestId, (reply) => {
        clearTimeout(timer)
        pending.delete(requestId)
        resolve(reply)
      })
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`)
    })
  }
  try {
    expect(
      await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'synthetic-test', version: '1.0.0' },
      }),
    ).toMatchObject({
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'stdio-dependency-fixture', version: '1.0.0' },
        capabilities: { tools: {} },
      },
    })
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`,
    )
    expect(await request('tools/list', {})).toMatchObject({
      result: {
        tools: [{ name: 'fixture_echo', inputSchema: { type: 'object', required: ['text'] } }],
      },
    })
    expect(
      await request('tools/call', { name: 'fixture_echo', arguments: { text: 'fixture-value' } }),
    ).toMatchObject({ result: { content: [{ type: 'text', text: 'fixture-value' }] } })
    expect(await request('tools/call', { name: 'unknown_fixture', arguments: {} })).toMatchObject({
      error: { code: -32602 },
    })
    expect(
      await request('tools/call', { name: 'fixture_echo', arguments: { text: 7 } }),
    ).toMatchObject({ error: { code: -32602 } })
  } finally {
    lines.close()
    child.kill()
    await exited
  }
}, 15000)
