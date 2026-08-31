import registry from './contracts.json' with { type: 'json' }

export type Network = 'testnet' | 'mainnet'
export type ContractVersion = 'v1' | 'v2'

export interface ContractEntry {
  id: string
  sdk: string
  deployedAt: string
  deployedLedger: number | null
  txHash: string
  wasmHash: string | null
}

export type NetworkRegistry = { current: ContractVersion } & Partial<Record<ContractVersion, ContractEntry>>

export const contracts = registry as unknown as Record<Network, NetworkRegistry>

const VERSION_ORDER: ContractVersion[] = ['v1', 'v2']

/** Resolve one registry entry; `version` defaults to the network's `current`. */
export function getContractEntry(network: Network, version?: ContractVersion): ContractEntry {
  const net = contracts[network]
  if (!net) throw new Error(`Unknown network ${network}`)
  const resolved = version ?? net.current
  const entry = net[resolved]
  if (!entry) throw new Error(`No ${resolved} contract registered for ${network}`)
  return entry
}

/** Contract address for a network, defaulting to its `current` version. */
export function getContractId(network: Network, version?: ContractVersion): string {
  return getContractEntry(network, version).id
}

/** Every registered contract on a network, oldest version first. */
export function listContracts(network: Network): Array<ContractEntry & { version: ContractVersion }> {
  const net = contracts[network]
  if (!net) throw new Error(`Unknown network ${network}`)
  return VERSION_ORDER.filter((v) => net[v] !== undefined).map((v) => ({ ...(net[v] as ContractEntry), version: v }))
}
