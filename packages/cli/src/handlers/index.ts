import { BaseHandler } from './base'
import { StellarHandler } from './stellar'
import { handleKeyFile, validateChain } from '../utils'
import { logger } from '../logger'
import { red } from 'picocolors'

export const getHandler = async (
  chain: string,
  keyFile: string,
  url?: string
): Promise<BaseHandler | null> => {
  if (!validateChain(chain)) {
    logger.log(red(`Unsupported chain: ${chain}. Supported chains: stellar`))
    return null
  }

  const handler = new StellarHandler()

  try {
    const keyData = await handleKeyFile(keyFile)
    const initialized = await handler.initialize(keyData, url)

    if (!initialized) {
      return null
    }

    return handler
  } catch (error: any) {
    logger.log(red(`Failed to initialize ${chain} handler: ${error.message}`))
    return null
  }
}

export { BaseHandler, StellarHandler }
