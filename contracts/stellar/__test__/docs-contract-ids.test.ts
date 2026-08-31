/**
 * The docs render every protocol contract address from one snippet, and that
 * snippet mirrors the registry in bindings/src/contracts.json. Offline test:
 * reads files only.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import registry from '../bindings/src/contracts.json'

const repoRoot = join(__dirname, '..', '..', '..')
const docsDir = join(repoRoot, 'apps', 'docs')
const snippetPath = join(docsDir, 'snippets', 'contracts.mdx')
const snippet = readFileSync(snippetPath, 'utf8')

function snippetConstant(name: string): string | undefined {
  return new RegExp(`export const ${name} = "([^"]+)"`).exec(snippet)?.[1]
}

function mdxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry.startsWith('.')) return []
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return mdxFiles(full)
    return full.endsWith('.mdx') ? [full] : []
  })
}

describe('docs contract addresses', () => {
  const cases: Array<[string, string]> = [
    ['testnetV1', registry.testnet.v1.id],
    ['testnetV2', registry.testnet.v2.id],
    ['mainnetV1', registry.mainnet.v1.id],
    ['mainnetV2', registry.mainnet.v2.id],
  ]

  for (const [name, id] of cases) {
    it(`publishes ${name} exactly as the registry has it`, () => {
      expect(snippetConstant(name)).toBe(id)
    })
  }

  it('points readers at the current version for each network', () => {
    expect(snippetConstant('testnetCurrent')).toBe(
      (registry.testnet as Record<string, any>)[registry.testnet.current].id
    )
    expect(snippetConstant('mainnetCurrent')).toBe(
      (registry.mainnet as Record<string, any>)[registry.mainnet.current].id
    )
  })

  it('has no contract address hardcoded in any page outside the snippet', () => {
    const offenders = mdxFiles(docsDir)
      .filter((file) => file !== snippetPath)
      .filter((file) => /C[A-Z2-7]{55}/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(repoRoot.length + 1))

    expect(offenders).toEqual([])
  })
})
