#!/usr/bin/env node
// Rewrite the `networks` const in bindings/src/protocol.ts from the contract
// registry, so the generated bindings always point at each network's current
// contract. Never hand-edit that block.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const registryPath = join(root, 'bindings/src/contracts.json')
const protocolPath = join(root, 'bindings/src/protocol.ts')

const registry = JSON.parse(readFileSync(registryPath, 'utf8'))

function currentId(network) {
  const net = registry[network]
  const entry = net && net.current ? net[net.current] : undefined
  return entry ? entry.id : undefined
}

const literal = (id) => (id === undefined ? 'undefined' : JSON.stringify(id))

const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015'
const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015'

const block = `export const networks = {
  testnet: { networkPassphrase: "${TESTNET_PASSPHRASE}", contractId: ${literal(currentId('testnet'))} },
  local: { networkPassphrase: "${TESTNET_PASSPHRASE}", contractId: undefined },
  mainnet: { networkPassphrase: "${MAINNET_PASSPHRASE}", contractId: ${literal(currentId('mainnet'))} },
} as const`

const source = readFileSync(protocolPath, 'utf8')
const pattern = /export const networks = \{[\s\S]*?\} as const/

if (!pattern.test(source)) {
  console.error(`Error: no \`export const networks = { ... } as const\` block found in ${protocolPath}`)
  process.exit(1)
}

const updated = source.replace(pattern, block)
if (updated !== source) {
  writeFileSync(protocolPath, updated)
  console.log('bindings/src/protocol.ts networks block updated from the registry.')
} else {
  console.log('bindings/src/protocol.ts networks block already matches the registry.')
}
