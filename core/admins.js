import pino from 'pino';
import { normalizeId } from '../utils/helpers.js';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// Initialize admin cache
const groupAdminsCache = new Map();

async function isAdmin(sock, groupId, userId) {
    if (!userId) return false;
    try {
        if (!groupAdminsCache.has(groupId) || (Date.now() - groupAdminsCache.get(groupId).timestamp > 300000)) {
            logger.debug(`[ADMIN CHECK] Caching admins for group ${groupId}`);
            const metadata = await sock.groupMetadata(groupId);
            logger.debug(`[METADATA] Raw admin participants for ${groupId}: ${metadata.participants.filter(p => p.admin).map(p => `${normalizeId(p.id)}(${normalizeId(p.jid)})`).join(', ')}`);
            const admins = metadata.participants
                .filter(p => p.admin)
                .flatMap(p => {
                    // Normalize all possible ID formats for each admin
                    const normalizedId = normalizeId(p.id);
                    const normalizedJid = normalizeId(p.jid);
                    return [normalizedId, normalizedJid].filter(Boolean);
                })
                .filter((value, index, self) => self.indexOf(value) === index); // Remove duplicates

            logger.info(`[ADMIN CACHE] Admins for ${groupId}: ${admins.join(', ')}`);
            console.log(`[STARTUP] Group ${groupId} admin JIDs: ${admins.join(', ')}`);
            groupAdminsCache.set(groupId, { admins, timestamp: Date.now() });
        }
        // Normalize the input user ID before checking
        const normalizedUserId = normalizeId(userId);
        const isAdminResult = groupAdminsCache.get(groupId).admins.includes(normalizedUserId);
        logger.debug(`[ADMIN CHECK] User ${normalizedUserId} in group ${groupId}: ${isAdminResult}`);
        console.log(`[STARTUP] Checking user ${normalizedUserId} in group ${groupId}: ${isAdminResult ? 'ADMIN' : 'NOT ADMIN'}`);
        return isAdminResult;
    } catch (err) {
        logger.error({ err }, `[ERROR] Failed to check admin status for ${userId} in ${groupId}`);
        return false;
    }
}

// Function to clear admin cache for a group (e.g., when participants change)
function clearAdminCache(groupId) {
    if (groupAdminsCache.has(groupId)) {
        groupAdminsCache.delete(groupId);
        logger.debug(`[ADMIN CACHE] Invalidated for group ${groupId} due to participant update.`);
    }
}

export {
    isAdmin,
    clearAdminCache,
    groupAdminsCache,
    logger
};