/**
 * Module: registry
 *
 * Thin wrapper over the versioned contract registry shipped by
 * `@attestprotocol/stellar-contracts`. Horizon never hardcodes contract
 * addresses; everything resolves through here.
 */
import {
  contracts,
  getContractId,
  getContractEntry,
  listContracts,
  type Network,
  type ContractVersion,
  type ContractEntry,
  type NetworkRegistry,
} from '@attestprotocol/stellar-contracts/registry'

/** All registered contracts for one network, including its `current` pointer. */
export function networkRegistry(network: Network): NetworkRegistry {
  return contracts[network]
}

/**
 * Resolve the `contract` / `version` query parameters to a contract address.
 *
 * An explicit `contract` address wins. A `version` is looked up in the registry
 * for `network`, and an unknown key throws a RangeError so the router can turn
 * it into a 400. Neither given means "no contract filter".
 */
export function resolveContractFilter(
  network: Network,
  contract?: string,
  version?: string
): string | undefined {
  if (contract) return contract
  if (!version) return undefined
  try {
    return getContractId(network, version as ContractVersion)
  } catch {
    throw new RangeError(`Unknown contract version '${version}' for ${network}`)
  }
}

export { contracts, getContractId, getContractEntry, listContracts }
export type { Network, ContractVersion, ContractEntry, NetworkRegistry }
