import { Argv } from 'yargs'
import { logger } from '../logger'
import { red } from 'picocolors'
import { handleJsonFile, validateChain } from '../utils'
import { getHandler } from '../handlers'

interface AttestationArgv {
  chain: string
  action: string
  uid?: string
  jsonFile?: string
  keyFile: string
  url?: string
  content?: any
}

export const command = 'attestation'
export const describe = 'Manage attestations (create, fetch, revoke)'

export function builder(yargs: Argv<AttestationArgv>): Argv {
  return yargs
    .option('chain', {
      type: 'string',
      describe: 'Blockchain to use',
      choices: ['stellar'],
      demandOption: true,
    })
    .option('action', {
      type: 'string',
      describe: 'Action to perform',
      choices: ['create', 'fetch', 'revoke'],
      demandOption: true,
    })
    .option('uid', {
      type: 'string',
      describe: 'Attestation UID (required for fetch and revoke)',
      normalize: true,
    })
    .option('json-file', {
      type: 'string',
      describe: 'Path to JSON attestation file (required for create)',
      normalize: true,
    })
    .option('key-file', {
      type: 'string',
      describe: 'Path to the key file',
      normalize: true,
      demandOption: true,
    })
    .option('url', {
      type: 'string',
      describe: 'Custom RPC URL',
      normalize: true,
    })
    .check((argv) => {
      if (!validateChain(argv.chain)) {
        throw new Error(`Unsupported chain: ${argv.chain}. Supported chains: stellar`)
      }
      if ((argv.action === 'fetch' || argv.action === 'revoke') && !argv.uid) {
        throw new Error('UID is required for fetch and revoke actions')
      }
      if (argv.action === 'create' && !argv.jsonFile) {
        throw new Error('JSON file is required for create action')
      }
      return true
    })
}

export async function handler(argv: AttestationArgv) {
  try {
    // Load JSON content for create action
    if (argv.action === 'create' && argv.jsonFile) {
      argv.content = await handleJsonFile(argv.jsonFile)
    }

    const chainHandler = await getHandler(argv.chain, argv.keyFile, argv.url)

    if (!chainHandler) {
      logger.log(red(`Failed to initialize ${argv.chain} handler`))
      return
    }

    const args = {
      ...argv,
      type: 'attestation',
    }

    const success = await chainHandler.check(argv.action, args)

    if (success) {
      logger.log('Done ✨')
    }
  } catch (error: any) {
    logger.log(red(`Error: ${error.message}`))
  }
}