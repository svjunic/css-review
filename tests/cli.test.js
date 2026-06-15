import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const CLI = resolve(__dirname, '../bin/css-diff.js')
const OLD = resolve(__dirname, '../data/old/module.css')
const NEW = resolve(__dirname, '../data/new/module.css')

function run(args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf8' })
    return { stdout, code: 0 }
  } catch (err) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', code: err.status ?? 1 }
  }
}

describe('css-diff CLI', () => {
  it('--help exits 0 and shows Usage', () => {
    const { stdout, code } = run(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('Usage:')
  })

  it('--version exits 0 and shows semver string', () => {
    const { stdout, code } = run(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('exits 1 and shows Summary when files differ', () => {
    const { stdout, code } = run([OLD, NEW])
    expect(code).toBe(1)
    expect(stdout).toContain('Summary:')
  })

  it('exits 0 when comparing identical files', () => {
    const { code } = run([OLD, OLD])
    expect(code).toBe(0)
  })

  it('--format json outputs valid JSON with version:1', () => {
    const { stdout, code } = run([OLD, NEW, '--format', 'json'])
    const parsed = JSON.parse(stdout)
    expect(parsed.version).toBe(1)
    expect(typeof parsed.summary.changed).toBe('number')
    expect(typeof parsed.summary.added).toBe('number')
    expect(typeof parsed.summary.removed).toBe('number')
    expect(Array.isArray(parsed.contexts)).toBe(true)
    expect(code).toBe(1)
  })

  it('exits 2 when a file does not exist', () => {
    const { code } = run(['nonexistent.css', NEW])
    expect(code).toBe(2)
  })

  it('exits 2 when fewer than 2 arguments are given', () => {
    const { code } = run([OLD])
    expect(code).toBe(2)
  })

  it('--filter added shows only added properties in JSON', () => {
    const { stdout } = run([OLD, NEW, '--format', 'json', '--filter', 'added'])
    const parsed = JSON.parse(stdout)
    for (const ctx of parsed.contexts) {
      for (const sel of ctx.selectors) {
        for (const prop of sel.props) {
          expect(prop.status).toBe('added')
        }
      }
    }
  })
})
