const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: undefined,
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.newPassword',
            'req.body.current_password',
            'req.body.new_password',
            'req.body.otp',
        ],
        censor: '[REDACTED]',
    },
    transport: !isProduction
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                singleLine: true,
                ignore: 'pid,hostname',
            },
        }
        : undefined,
});

module.exports = logger;
