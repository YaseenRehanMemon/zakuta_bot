import schedule from 'node-schedule';
import pino from 'pino';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// Initialize auto timers - now supporting multiple timers per group
const autoTimers = {};

export {
    autoTimers,
    schedule,
    logger
};