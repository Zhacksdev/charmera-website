import { db } from '../db/index.js'
import { logger } from './logger.js'
import type { Settings, Frame } from '@chamera/shared'

export function getConfig(): Settings | null {
  try {
    const configRow = db.prepare(`
      SELECT value, version FROM config_cache WHERE key = 'settings'
    `).get() as { value: string; version: number } | undefined

    if (!configRow) {
      return null
    }

    return JSON.parse(configRow.value)
  } catch (err) {
    logger.error({ err }, 'Failed to load config from cache')
    return null
  }
}

export function getFrames(): Frame[] {
  try {
    const framesRow = db.prepare(`
      SELECT value FROM config_cache WHERE key = 'frames'
    `).get() as { value: string } | undefined

    if (!framesRow) {
      return []
    }

    return JSON.parse(framesRow.value)
  } catch (err) {
    logger.error({ err }, 'Failed to load frames from cache')
    return []
  }
}
