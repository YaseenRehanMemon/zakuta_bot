import fs from 'fs';
import pino from 'pino';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// Warning data structure:
// {
//   "groupId": {
//     "limit": 3,
//     "users": {
//       "userId@s.whatsapp.net": {
//         "count": 2,
//         "lastWarning": 1640995200000,
//         "violations": ["link", "sticker"]
//       }
//     }
//   }
// }

const WARNINGS_FILE = 'warnings.json';

// Initialize warnings data
let warningsData = {};

// Load warnings from file
function loadWarnings() {
    try {
        if (fs.existsSync(WARNINGS_FILE)) {
            const fileContent = fs.readFileSync(WARNINGS_FILE, 'utf8');
            warningsData = JSON.parse(fileContent);
            logger.info('[WARNINGS] Loaded warnings data from file');
        } else {
            warningsData = {};
            logger.info('[WARNINGS] No warnings file found, starting fresh');
        }
    } catch (error) {
        logger.error({ error }, '[WARNINGS] Failed to load warnings data, using empty data');
        warningsData = {};
    }
}

// Save warnings to file
function saveWarnings() {
    try {
        fs.writeFileSync(WARNINGS_FILE, JSON.stringify(warningsData, null, 2));
        logger.debug('[WARNINGS] Saved warnings data to file');
    } catch (error) {
        logger.error({ error }, '[WARNINGS] Failed to save warnings data');
    }
}

// Get warning limit for a group (default 3)
function getWarningLimit(groupId) {
    if (!warningsData[groupId]) {
        warningsData[groupId] = { limit: 3, users: {} };
    }
    return warningsData[groupId].limit || 3;
}

// Set warning limit for a group
function setWarningLimit(groupId, limit) {
    if (!warningsData[groupId]) {
        warningsData[groupId] = { limit: 3, users: {} };
    }
    warningsData[groupId].limit = limit;
    saveWarnings();
    logger.info(`[WARNINGS] Set warning limit to ${limit} for group ${groupId}`);
}

// Get user warnings for a group
function getUserWarnings(groupId, userId) {
    if (!warningsData[groupId]) {
        warningsData[groupId] = { limit: 3, users: {} };
    }
    return warningsData[groupId].users[userId] || { count: 0, lastWarning: 0, violations: [] };
}

// Add a warning to a user
function addWarning(groupId, userId, violationType) {
    if (!warningsData[groupId]) {
        warningsData[groupId] = { limit: 3, users: {} };
    }
    if (!warningsData[groupId].users[userId]) {
        warningsData[groupId].users[userId] = { count: 0, lastWarning: 0, violations: [] };
    }

    const userWarnings = warningsData[groupId].users[userId];
    userWarnings.count += 1;
    userWarnings.lastWarning = Date.now();
    userWarnings.violations.push(violationType);

    // Keep only last 10 violations
    if (userWarnings.violations.length > 10) {
        userWarnings.violations = userWarnings.violations.slice(-10);
    }

    saveWarnings();
    logger.info(`[WARNINGS] Added warning ${userWarnings.count}/${getWarningLimit(groupId)} for ${userId} in ${groupId} (reason: ${violationType})`);
    return userWarnings.count;
}

// Reset warnings for a specific user in a group
function resetUserWarnings(groupId, userId) {
    if (warningsData[groupId] && warningsData[groupId].users[userId]) {
        delete warningsData[groupId].users[userId];
        saveWarnings();
        logger.info(`[WARNINGS] Reset warnings for ${userId} in ${groupId}`);
        return true;
    }
    return false;
}

// Reset all warnings in a group
function resetAllWarnings(groupId) {
    if (warningsData[groupId]) {
        warningsData[groupId].users = {};
        saveWarnings();
        logger.info(`[WARNINGS] Reset all warnings in ${groupId}`);
        return true;
    }
    return false;
}

// Get all warned users in a group
function getWarnedUsers(groupId) {
    if (!warningsData[groupId]) {
        return [];
    }
    return Object.entries(warningsData[groupId].users).map(([userId, data]) => ({
        userId,
        ...data
    }));
}

// Check if user should be kicked (reached limit)
function shouldKickUser(groupId, userId) {
    const userWarnings = getUserWarnings(groupId, userId);
    const limit = getWarningLimit(groupId);
    return userWarnings.count >= limit;
}

// Clean up old warnings (older than specified days)
function cleanupOldWarnings(days = 30) {
    const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
    let cleaned = 0;

    for (const groupId in warningsData) {
        for (const userId in warningsData[groupId].users) {
            const userWarnings = warningsData[groupId].users[userId];
            if (userWarnings.lastWarning < cutoffTime) {
                delete warningsData[groupId].users[userId];
                cleaned++;
            }
        }
        // Remove empty groups
        if (Object.keys(warningsData[groupId].users).length === 0) {
            delete warningsData[groupId];
        }
    }

    if (cleaned > 0) {
        saveWarnings();
        logger.info(`[WARNINGS] Cleaned up ${cleaned} old warnings`);
    }
}

// Initialize on module load
loadWarnings();

// Set up automatic cleanup of old warnings (every 24 hours)
setInterval(() => {
    cleanupOldWarnings(30); // Clean warnings older than 30 days
}, 24 * 60 * 60 * 1000); // 24 hours in milliseconds

export {
    loadWarnings,
    saveWarnings,
    getWarningLimit,
    setWarningLimit,
    getUserWarnings,
    addWarning,
    resetUserWarnings,
    resetAllWarnings,
    getWarnedUsers,
    shouldKickUser,
    cleanupOldWarnings,
    logger
};