import { Argv } from 'yargs'
import { logger } from '../logger'
import { red } from 'picocolors'
import { validateChain } from '../utils'
import { getHandler } from '../handlers'

interface AuthorityArgv {
  chain: string
  action: string
  uid?: string
  keyFile: string
  url?: string
}

export const command = 'authority'
export const describe = 'Manage authorities (register, fetch)'

export function builder(yargs: Argv<AuthorityArgv>): Argv {
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
      choices: ['register', 'fetch'],
      demandOption: true,
    })
    .option('uid', {
      type: 'string',
      describe: 'Authority UID (required for fetch)',
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
      return true
    })
}

export async function handler(argv: AuthorityArgv) {
  try {
    const chainHandler = await getHandler(argv.chain, argv.keyFile, argv.url)

    if (!chainHandler) {
      logger.log(red(`Failed to initialize ${argv.chain} handler`))
      return
    }

    const args = {
      ...argv,
      type: 'authority',
    }

    const success = await chainHandler.check(argv.action, args)

    if (success) {
      logger.log('Done ✨')
    }
  } catch (error: any) {
    logger.log(red(`Error: ${error.message}`))
  }
}