import { Argv } from 'yargs'
import { logger } from '../logger'
import { red } from 'picocolors'
import { handleJsonFile, validateChain } from '../utils'
import { getHandler } from '../handlers'

interface SchemaArgv {
  chain: string
  action: string
  uid?: string
  jsonFile?: string
  keyFile: string
  url?: string
  content?: any
}

export const command = 'schema'
export const describe = 'Manage schemas (create, fetch)'

export function builder(yargs: Argv<SchemaArgv>): Argv {
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
      choices: ['create', 'fetch'],
      demandOption: true,
    })
    .option('uid', {
      type: 'string',
      describe: 'Schema UID (required for fetch)',
      normalize: true,
    })
    .option('json-file', {
      type: 'string',
      describe: 'Path to JSON schema file (required for create)',
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
      if (argv.action === 'fetch' && !argv.uid) {
        throw new Error('UID is required for fetch action')
      }
      if (argv.action === 'create' && !argv.jsonFile) {
        throw new Error('JSON file is required for create action')
      }
      return true
    })
}

export async function handler(argv: SchemaArgv) {
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
      type: 'schema',
    }

    const success = await chainHandler.check(argv.action, args)

    if (success) {
      logger.log('Done ✨')
    }
  } catch (error: any) {
    logger.log(red(`Error: ${error.message}`))
  }
}