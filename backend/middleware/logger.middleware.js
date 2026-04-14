import winston from 'winston';
import { config } from '../config/env.js';

// Create logger (simple & clean)
const logger = winston.createLogger({
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
            return `${timestamp} [${level}] ${message} ${
                Object.keys(meta).length ? JSON.stringify(meta) : ''
            }`;
        })
    ),
    transports: [
        new winston.transports.Console({
            silent: config.nodeEnv === 'test',
        }),

        // Enable file logs ONLY if you really want (optional)
        ...(config.nodeEnv === 'production'
            ? [
                  new winston.transports.File({
                      filename: 'logs/error.log',
                      level: 'error',
                      maxsize: 5242880,
                      maxFiles: 5,
                  }),
                  new winston.transports.File({
                      filename: 'logs/combined.log',
                      maxsize: 5242880,
                      maxFiles: 10,
                  }),
              ]
            : []),
    ],
});

//  Routes you DON'T want to log (noise reduction)
const IGNORED_ROUTES = ['/api/deliveries'];

// Middleware
export const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Skip noisy routes
    if (IGNORED_ROUTES.includes(req.originalUrl)) {
        return next();
    }

    const requestId = Math.random().toString(36).slice(2, 10);

    req.logger = logger.child({
        requestId,
    });

    res.on('finish', () => {
        const duration = Date.now() - start;
        const { method, originalUrl } = req;
        const { statusCode } = res;

        // Skip useless logs
        if (statusCode === 304) return;

        //  Log only meaningful stuff
        if (statusCode >= 500) {
            req.logger.error(`${method} ${originalUrl}`, {
                status: statusCode,
                duration: `${duration}ms`,
            });
        } else if (statusCode >= 400) {
            req.logger.warn(`${method} ${originalUrl}`, {
                status: statusCode,
                duration: `${duration}ms`,
            });
        } else if (config.nodeEnv !== 'production') {
            // Only log success in dev (not in production)
            req.logger.debug(`${method} ${originalUrl}`, {
                status: statusCode,
                duration: `${duration}ms`,
            });
        }
    });

    next();
};

export default logger;