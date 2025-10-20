import { delay } from '@whiskeysockets/baileys';
import pino from 'pino';
import { isAdmin } from '../core/admins.js';
import { normalizeId } from '../utils/helpers.js';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// --- UPDATED ANTISTATUS HANDLER ---
async function handleAntistatusViolation(sock, groupId, senderId, msg, messageText, reason, customMessages) {
    const senderNumber = senderId.split('@')[0];
    logger.info(`[ANTISTATUS] Detected ${reason} from @${senderNumber} in group ${groupId}`);
    
    try {
        let botIsAdmin = false;
        let retries = 3;
        
        while (retries > 0 && !botIsAdmin) {
            try {
                const botJidOptions = [
                    sock.user?.id,
                    sock.authState?.creds?.me?.id,
                    sock.user?.jid
                ].filter(Boolean).map(normalizeId);
                
                for (const botJid of botJidOptions) {
                    botIsAdmin = await isAdmin(sock, groupId, botJid);
                    if (botIsAdmin) break;
                }
                break;
            } catch (e) {
                retries--;
                if (retries > 0) {
                    logger.warn(`[ANTISTATUS] Admin check failed, retrying... (${retries} left)`);
                    await delay(1000);
                }
            }
        }
        
        if (!botIsAdmin) {
            logger.warn(`[ANTISTATUS] Bot lacks admin privileges in group ${groupId}`);
            await sock.sendMessage(groupId, { 
                text: `⚠️ Antistatus: Cannot kick @${senderNumber} - I need admin privileges.`,
                mentions: [senderId]
            });
            return false;
        }
        
        // Delete the violating message
        try {
            await sock.sendMessage(groupId, { delete: msg.key });
            logger.info(`[ANTISTATUS] Deleted ${reason} message from @${senderNumber}`);
        } catch (e) {
            logger.warn({ e }, `[ANTISTATUS] Failed to delete message, continuing with kick`);
        }
        
        // Kick the violator
        try {
            await sock.groupParticipantsUpdate(groupId, [senderId], "remove");
            
            const statusKickMessage = customMessages.status_kick_message.replace(/{user}/g, senderNumber);
            await sock.sendMessage(groupId, {
                text: statusKickMessage,
                mentions: [senderId]
            });
            
            logger.info(`[ANTISTATUS SUCCESS] Kicked @${senderNumber} from ${groupId} for ${reason}`);
            return true;
            
        } catch (kickError) {
            logger.error({ kickError }, `[ANTISTATUS] Kick failed for @${senderNumber}`);
            
            let errorMessage = `⚠️ Failed to kick @${senderNumber} for ${reason}. `;
            if (kickError.output?.statusCode === 403) {
                errorMessage += "Insufficient permissions or user is admin.";
            } else if (kickError.output?.statusCode === 404) {
                errorMessage += "User not found in group.";
            } else {
                errorMessage += "Unknown error occurred.";
            }
            
            await sock.sendMessage(groupId, { 
                text: errorMessage,
                mentions: [senderId]
            });
            return false;
        }
        
    } catch (e) {
        logger.error({ e }, `[ANTISTATUS FATAL] Unexpected error processing ${reason} for @${senderNumber}`);
        await sock.sendMessage(groupId, { 
            text: `⚠️ System error while processing antistatus violation from @${senderNumber}`,
            mentions: [senderId]
        });
        return false;
    }
}

export {
    handleAntistatusViolation,
    logger
};