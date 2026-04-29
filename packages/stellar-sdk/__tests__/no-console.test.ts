/**
 * Regression test for C-SDK-2.
 *
 * Walks every production source file under packages/stellar-sdk/src and
 * fails if `console.log(` appears anywhere. The opt-in `debug` helper in
 * src/utils/debug.ts uses `console.debug` and is therefore allowed.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

function collectTsFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full))
    } else if (full.endsWith('.ts') && !full.endsWith('.test.ts') && !full.endsWith('.d.ts')) {
      files.push(full)
    }
  }
  return files
}

/**
 * Strip block comments (/* ... *\/) and single-line comments (// ...) from a
 * TypeScript source file so JSDoc examples in `@example` blocks do not trip
 * the regex match below. Matches roughly what ESLint's no-console rule sees.
 */
function stripComments(src: string): string {
  // Remove /* ... */ blocks (including JSDoc)
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove // line comments
  return noBlockComments.replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('C-SDK-2: no console.log in production source files', () => {
  const srcDir = join(__dirname, '..', 'src')
  const files = collectTsFiles(srcDir)

  it('discovered at least one source file', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const rel = file.replace(srcDir, '')
    it(`${rel} contains no console.log`, () => {
      const content = readFileSync(file, 'utf8')
      const codeOnly = stripComments(content)
      const matches = codeOnly.match(/\bconsole\.log\s*\(/g)
      expect(matches).toBeNull()
    })
  }
})
