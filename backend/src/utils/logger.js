'use strict';

const winston = require('winston');

/**
 * TESSERA backend logger.
 *
 * Uses Winston with structured JSON output for production
 * and colorized text output for development.
 *
 * Log levels: error | warn | info | http | debug
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaStr = Object.keys(meta).length
              ? ' ' + JSON.stringify(meta, null, 0)
              : '';
            return `${timestamp} [${level}] ${message}${metaStr}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console(),
  ],
  // Do not exit on handled exceptions
  exitOnError: false,
});

module.exports = logger;
