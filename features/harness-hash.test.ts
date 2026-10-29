import { afterEach, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve(import.meta.dir, '../scripts/harness-hash.sh')
const bash = Bun.which('bash') ?? ''
if (!bash) throw new Error('Bash is required for the native harness contract')
const nativePath = process.env.PATH ?? '/usr/bin:/bin'
const nativeSort = Bun.which('sort') ?? ''
if (!nativeSort) throw new Error('Native sort is required')
const fixtures: string[] = []

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'harness-contract-'))
  fixtures.push(root)
  mkdirSync(join(root, 'features/nested'), { recursive: true })
  mkdirSync(join(root, 'tools'))
  mkdirSync(join(root, 'home'))
  const files = ['features/z.feature', 'features/nested/a.feature']
  for (const file of files) writeFileSync(join(root, file), `Feature: ${file}\n`)
  const manifest = files
    .map((file) => {
      const hash = createHash('sha256')
        .update(readFileSync(join(root, file)))
        .digest('hex')
      return `${hash}  ${file}`
    })
    .join('\n')
  // Deliberately unsorted, with a nested feature to exercise native globstar.
  writeFileSync(join(root, '.harness-hash'), `${manifest}\n`)
  return root
}

function tool(root: string, name: string, body: string) {
  writeFileSync(join(root, 'tools', name), `#!/bin/sh\n${body}\n`, { mode: 0o700 })
}

function verify(root: string, path = `${join(root, 'tools')}:${nativePath}`) {
  return spawnSync(bash, ['--noprofile', '--norc', script, '--verify'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      PATH: path,
      HOME: join(root, 'home'),
      TMPDIR: root,
      HARNESS_SORT_CALLS: join(root, 'sort-calls'),
      HARNESS_NATIVE_SORT: nativeSort,
    },
  })
}

describe('native harness verification fails closed', () => {
  test('accepts matching unsorted pins including nested features', () => {
    const result = verify(fixture())
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('harness-hash: OK\n')
    expect(result.stderr).toBe('')
  })

  test('reports changed artifact as tampered with exit 2', () => {
    const root = fixture()
    writeFileSync(join(root, 'features/z.feature'), 'Feature: changed\n')
    const result = verify(root)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('HARNESS_TAMPERED')
    expect(result.stdout).not.toContain('harness-hash: OK')
  })

  test('reports a missing manifest with exit 3', () => {
    const root = fixture()
    rmSync(join(root, '.harness-hash'))
    expect(verify(root).status).toBe(3)
  })

  test.each(['diff', 'sha256sum', 'sort', 'cat'])('rejects a failing %s command', (command) => {
    const root = fixture()
    tool(root, command, 'exit 2')
    const result = verify(root)
    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain('harness-hash: OK')
  })

  test('rejects a missing hash command', () => {
    const root = fixture()
    tool(root, 'sort', 'exec "$HARNESS_NATIVE_SORT" "$@"')
    const result = verify(root, join(root, 'tools'))
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('failed to hash')
    expect(result.stdout).not.toContain('harness-hash: OK')
  })

  test('rejects invalid hash output even when the hash command succeeds', () => {
    const root = fixture()
    tool(root, 'sha256sum', 'printf "not-a-hash  fixture\\n"')
    const result = verify(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('invalid hash output')
  })

  test('rejects sort failure after collection instead of hiding it in process substitution', () => {
    const root = fixture()
    tool(
      root,
      'sort',
      `count=0
if [ -f "$HARNESS_SORT_CALLS" ]; then read -r count < "$HARNESS_SORT_CALLS"; fi
count=$((count + 1))
printf '%s\\n' "$count" > "$HARNESS_SORT_CALLS"
if [ "$count" -eq 2 ]; then exit 2; fi
exec "$HARNESS_NATIVE_SORT" "$@"`,
    )
    const result = verify(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('failed to sort expected hashes')
    expect(result.stdout).not.toContain('harness-hash: OK')
  })
})
