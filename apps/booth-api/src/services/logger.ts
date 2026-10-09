import pino from 'pino'
import { join } from 'path'

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard'
    }
  }
})
