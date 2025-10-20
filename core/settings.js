import pino from 'pino';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// Initialize group settings
const groupSettings = {};

function getGroupSettings(groupId) {
    if (!groupSettings[groupId]) {
        logger.info(`[SETTINGS] Initializing default settings for group: ${groupId}`);
        groupSettings[groupId] = {
            antilink: true,
            antisticker: true,
            antitag: false,
            antipromotion: true,
            antistatus: true,
            welcome: true,
        };
    }
    return groupSettings[groupId];
}

function setGroupSettings(groupId, settings) {
    groupSettings[groupId] = { ...getGroupSettings(groupId), ...settings };
}

export {
    getGroupSettings,
    setGroupSettings,
    groupSettings,
    logger
};