/**
 * The indexed contract set comes from the versioned registry, not from
 * hardcoded addresses: with no INDEX_CONTRACT_IDS the indexer tracks every
 * contract registered for STELLAR_NETWORK, and PROTOCOL_CONTRACT_ID defaults
 * to that network's current version.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const savedEnv = { ...process.env }

async function loadConstants(env: Record<string, string | undefined>) {
  const vitest = await import('vitest')
  vitest.vi.resetModules()
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  return import('../src/common/constants')
}

describe('indexed contract set', () => {
  beforeEach(() => {
    process.env = { ...savedEnv }
  })

  afterEach(() => {
    process.env = { ...savedEnv }
  })

  it('indexes every registered testnet contract when INDEX_CONTRACT_IDS is unset', async () => {
    const registry = await import('../src/common/registry')
    const constants = await loadConstants({
      STELLAR_NETWORK: 'testnet',
      INDEX_CONTRACT_IDS: undefined,
      PROTOCOL_CONTRACT_ID: undefined,
    })

    expect(constants.CONTRACT_IDS_TO_INDEX).toEqual(
      registry.listContracts('testnet').map((c) => c.id)
    )
    expect(constants.CONTRACT_IDS_TO_INDEX.length).toBeGreaterThan(0)
  })

  it('indexes every registered mainnet contract when STELLAR_NETWORK is mainnet', async () => {
    const registry = await import('../src/common/registry')
    const constants = await loadConstants({
      STELLAR_NETWORK: 'mainnet',
      INDEX_CONTRACT_IDS: undefined,
      PROTOCOL_CONTRACT_ID: undefined,
    })

    expect(constants.CONTRACT_IDS_TO_INDEX).toEqual(
      registry.listContracts('mainnet').map((c) => c.id)
    )
  })

  it('attributes ingest to the network current contract by default', async () => {
    const registry = await import('../src/common/registry')
    const constants = await loadConstants({
      STELLAR_NETWORK: 'testnet',
      INDEX_CONTRACT_IDS: undefined,
      PROTOCOL_CONTRACT_ID: undefined,
    })

    expect(constants.PROTOCOL_CONTRACT_ID).toBe(registry.getContractId('testnet'))
    expect(constants.CONTRACT_IDS_TO_INDEX).toContain(constants.PROTOCOL_CONTRACT_ID)
  })

  it('restricts the indexed set to INDEX_CONTRACT_IDS when it is set', async () => {
    const registry = await import('../src/common/registry')
    const pinned = registry.getContractId('testnet', 'v1')
    const constants = await loadConstants({
      STELLAR_NETWORK: 'testnet',
      INDEX_CONTRACT_IDS: ` ${pinned} , `,
      PROTOCOL_CONTRACT_ID: pinned,
    })

    expect(constants.CONTRACT_IDS_TO_INDEX).toEqual([pinned])
  })

  it('refuses to start when the attribution target is not indexed', async () => {
    const registry = await import('../src/common/registry')
    await expect(
      loadConstants({
        STELLAR_NETWORK: 'testnet',
        INDEX_CONTRACT_IDS: registry.getContractId('testnet', 'v1'),
        PROTOCOL_CONTRACT_ID: registry.getContractId('mainnet', 'v1'),
      })
    ).rejects.toThrow(/not among the indexed contracts/)
  })

  it('refuses to start on an unknown network', async () => {
    await expect(
      loadConstants({
        STELLAR_NETWORK: 'futurenet',
        INDEX_CONTRACT_IDS: undefined,
        PROTOCOL_CONTRACT_ID: undefined,
      })
    ).rejects.toThrow(/STELLAR_NETWORK must be/)
  })
})

describe('registry resolution from horizon', () => {
  it('resolves the mainnet v1 contract address through the package export', async () => {
    const { getContractId } = await import('../src/common/registry')
    expect(getContractId('mainnet', 'v1')).toBe(
      'CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI'
    )
  })

  it('rejects a version that is not registered', async () => {
    const { resolveContractFilter } = await import('../src/common/registry')
    expect(() => resolveContractFilter('testnet', undefined, 'v9')).toThrow(RangeError)
  })
})
