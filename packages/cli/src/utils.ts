import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { logger } from './logger'
import { red } from 'picocolors'

export const handleJsonFile = async (filePath: string): Promise<any> => {
  const jsonPath = resolve(filePath)

  if (!existsSync(jsonPath)) {
    logger.log(red(`File not found: ${jsonPath}`))
    throw new Error(`File not found: ${jsonPath}`)
  }

  try {
    const fileContent = readFileSync(jsonPath, 'utf-8')
    return JSON.parse(fileContent)
  } catch (error: any) {
    logger.log(red(`Invalid JSON file: ${error.message}`))
    throw new Error(`Invalid JSON file: ${error.message}`)
  }
}

export const handleKeyFile = async (filePath: string): Promise<string> => {
  const keyPath = resolve(filePath)

  if (!existsSync(keyPath)) {
    logger.log(red(`Key file not found: ${keyPath}`))
    throw new Error(`Key file not found: ${keyPath}`)
  }

  try {
    const fileContent = readFileSync(keyPath, 'utf-8')
    // Try to parse as JSON first (for structured key files)
    try {
      const parsed = JSON.parse(fileContent)
      // Handle different key file formats
      if (parsed.secret || parsed.secretKey) {
        return parsed.secret || parsed.secretKey
      }
      if (parsed.privateKey) {
        return parsed.privateKey
      }
      // If it's an array (like Solana keypair), return as is
      if (Array.isArray(parsed)) {
        return JSON.stringify(parsed)
      }
      // Otherwise return the whole object as string
      return JSON.stringify(parsed)
    } catch {
      // If not JSON, treat as plain text secret/private key
      return fileContent.trim()
    }
  } catch (error: any) {
    logger.log(red(`Failed to read key file: ${error.message}`))
    throw new Error(`Failed to read key file: ${error.message}`)
  }
}

export type SupportedChain = 'stellar'

export const validateChain = (chain: string): chain is SupportedChain => {
  return chain === 'stellar'
}