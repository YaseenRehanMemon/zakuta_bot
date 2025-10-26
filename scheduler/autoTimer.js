import schedule from 'node-schedule';
import pino from 'pino';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// Initialize auto timers - now supporting multiple timers per group
const autoTimers = {};

// Initialize mute timers for temporary group closures
const muteTimers = {};

export {
    autoTimers,
    muteTimers,
    schedule,
    logger
};