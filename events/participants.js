import pino from 'pino';
import { clearAdminCache } from '../core/admins.js';
import { getGroupSettings } from '../core/settings.js';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

async function handleGroupParticipantsUpdate(sock, update, customMessages) {
    const { id, participants, action } = update;
    logger.info({ id, participants, action }, '[PARTICIPANT UPDATE]');
    
    // Clear admin cache for this group when participants change
    clearAdminCache(id);
    
    const settings = getGroupSettings(id);
    if (!settings.welcome) return;
    
    for (const user of participants) {
        if (action === 'add') {
            const userId = user.id || user;  // Handle both object and string formats
            if (!userId || typeof userId !== 'string') {
                console.log(`[WELCOME] Skipping invalid user: ${user}`);
                continue;
            }
            const userNum = userId.split('@')[0];
            try {
                // Fetch group metadata to get the group name
                const meta = await sock.groupMetadata(id);
                console.log(`[WELCOME] New user added: ${userNum}, Group: ${meta.subject} (${id})`);
                
                // Replace both {user} and {groupname} placeholders in the welcome message
                let welcomeText = customMessages.welcome_message
                    .replace(/{user}/g, userNum)
                    .replace(/{groupname}/g, meta.subject);
                
                await sock.sendMessage(id, {
                    text: welcomeText,
                    mentions: [userId]
                });
                logger.info(`[WELCOME] Sent welcome message to @${userNum} in ${id} (${meta.subject})`);
            } catch (e) {
                console.log(`[WELCOME ERROR] Failed for user: ${userNum}, Group: ${id}`);
                logger.error({ e }, `[ERROR] Failed to send welcome message to @${userNum} in ${id}`);
                // Try to send error message without failing the whole process
                try {
                    await sock.sendMessage(id, {
                        text: `⚠️ Welcome message failed to send to @${userNum}`,
                        mentions: [userId]
                    });
                } catch (sendError) {
                    logger.warn({ sendError }, '[SEND] Failed to send error message');
                }
            }
        }
    }
}

export {
    handleGroupParticipantsUpdate,
    logger
};