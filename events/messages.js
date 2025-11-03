import pino from 'pino';
import { getMessageContent, toUnicodeBold } from '../utils/helpers.js';
import { getGroupSettings } from '../core/settings.js';
import { isAdmin } from '../core/admins.js';
import { handleAntistatusViolation } from '../moderation/antistatus.js';
import { containsLinks, hasMentions } from '../moderation/rules.js';
import { handleCommand } from '../commands/handler.js';
import { updateActivity } from '../core/connection.js';
import { addWarning, getWarningLimit, shouldKickUser, getUserWarnings, resetUserWarnings } from '../utils/warnings.js';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

async function handleMessagesUpsert(sock, messagesData, customMessages) {
  const { messages, type } = messagesData;

  updateActivity(); // Track activity for health monitoring
  if (type !== 'notify') return;

  for (const msg of messages) {
    try {
      if (msg.key.fromMe || !msg.message) continue;

      // Skip messages that failed to decrypt
      if (msg.messageStubType === 'CIPHERTEXT') {
        logger.debug({ msg }, '[MESSAGE] Skipping encrypted message that failed to decrypt');
        continue;
      }

      const isGroup = msg.key.remoteJid.endsWith('@g.us');
      if (!isGroup) continue;

      const groupId = msg.key.remoteJid;
      const senderId = msg.key.participant || msg.participant;

      if (!senderId) {
        logger.warn({ msg }, '[WARN] Message received without a sender ID in group message.');
        continue;
      }

      const senderNumber = senderId.split('@')[0];
      const settings = getGroupSettings(groupId);
      const senderIsAdmin = await isAdmin(sock, groupId, senderId);

      // --- ANTISTATUS LOGIC (METADATA-BASED) ---
      if (settings.antistatus && !senderIsAdmin && msg.message?.groupStatusMentionMessage) {
        await handleAntistatusViolation(sock, groupId, senderId, msg, '', "group mention in status", customMessages);
        continue; // Stop further processing
      }

      // --- REGULAR MESSAGE PROCESSING ---
      const messageText = getMessageContent(msg.message);
      logger.debug(`[MESSAGE] From @${senderNumber} in ${groupId.split('@')[0]}: \"${messageText || 'Non-text message'}\"`);

      if (messageText.startsWith('!')) {
        await handleCommand(sock, groupId, senderId, messageText, msg, customMessages);
        continue;
      }

      if (senderIsAdmin) {
        logger.debug(`[MODERATION] Bypassed for admin @${senderNumber}`);
        continue;
      }

      // --- ANTISTATUS LOGIC (TEXT-BASED) ---
      if (settings.antistatus && !senderIsAdmin) {
        const statusPromotionKeywords = [
          /check my status/i,
          /my new status/i,
          /status update/i,
          /see my story/i,
          /view my status/i,
          /new story/i,
          /story update/i,
          /watch my status/i,
          /status pe dekho/i,
          /story dekho/i
        ];

        if (statusPromotionKeywords.some(p => p.test(messageText))) {
          await handleAntistatusViolation(sock, groupId, senderId, msg, messageText, "status promotion in group", customMessages);
          continue; // Stop further processing for this message
        }
      }

      // --- OTHER MODERATION RULES ---
      let shouldDelete = false;
      let reason = '';

      if (msg.message?.stickerMessage && settings.antisticker) {
        shouldDelete = true;
        reason = 'sticker';
      }
      if (containsLinks(messageText) && settings.antilink) {
        shouldDelete = true;
        reason = reason ? `${reason}, link` : 'link';
      }
      if (hasMentions(msg) && settings.antitag) {
        shouldDelete = true;
        reason = reason ? `${reason}, mention` : 'mention';
      }

      if (settings.antipromotion) {
        const linkCount = (messageText.match(/https?:\/\/\S+|wa\.me\/\S+|t\.me\/\S+|chat\.whatsapp\.com\/\S+/gi) || []).length;
        const promotionKeywords = [/join my group/i, /lms handlng/i, /services available/i, /vote for/i, /contact at/i, /invest now/i, /earn money/i, /free crypto/i, /get rich/i, /paid service/i, /lms handling/i, /contact us/i, /paid services/i, /paid work/i, /inbox us/i, /online work/i];

        const messageType = Object.keys(msg.message)[0];

        // Check for forwarded messages
        let isForwarded = false;
        let hasForwardedNewsletter = false;
        let hasUrlButtons = false;
        let hasQuotedLinks = false;

        const innerMessage = msg.message[messageType];
        if (innerMessage?.contextInfo) {
          isForwarded = innerMessage.contextInfo.isForwarded || false;
          hasForwardedNewsletter = !!innerMessage.contextInfo.forwardedNewsletterMessageInfo;
        }

        // Check for URL buttons (hidden links)
        if (innerMessage?.buttons) {
          hasUrlButtons = innerMessage.buttons.some(button => button.urlButton);
        }

        // Check for links in quoted message (disabled)
        // if (innerMessage?.contextInfo?.quotedMessage) {
        //     const quotedText = getMessageContent(innerMessage.contextInfo.quotedMessage);
        //     if (quotedText && containsLinks(quotedText)) {
        //         hasQuotedLinks = true;
        //     }
        // }

        // check for a message forwarded or not 
        let isPromotionalForward = false;
        if (isForwarded) {
          // Check for promotional indicators in the forwarded content
          const hasPromotionalKeywords = promotionKeywords.some(p => p.test(messageText));
          const hasAnyLinks = linkCount > 1; // Changed from > 1 to > 0
          const hasUrlButtons = innerMessage?.buttons && innerMessage.buttons.some(button => button.urlButton);

          // Consider it promotional if it has any of these indicators
          isPromotionalForward = hasPromotionalKeywords || hasAnyLinks || hasUrlButtons;
        }

        // Enhanced promotion detection
        if (linkCount > 1 || promotionKeywords.some(p => p.test(messageText)) ||
          isPromotionalForward || hasForwardedNewsletter || hasUrlButtons || hasQuotedLinks) {
          shouldDelete = true;
          reason = reason ? `${reason}, promotion` : 'promotion';
        }
      }

       if (shouldDelete) {
         logger.info(`[MODERATION ACTION] DELETE for ${reason} from @${senderNumber} in group ${groupId}`);
         try {
           // Delete the violating message
           await sock.sendMessage(groupId, { delete: msg.key });

           // Check if this violation should trigger warnings (only sticker and link)
           const shouldWarn = reason.includes('sticker') || reason.includes('link');

           if (shouldWarn) {
             // Add warning to user
             const warningCount = addWarning(groupId, senderId, reason);
             const warningLimit = getWarningLimit(groupId);

             // Check if user should be kicked
             if (shouldKickUser(groupId, senderId)) {
               // Kick the user
               try {
                 await sock.groupParticipantsUpdate(groupId, [senderId], 'remove');
                 const kickMessage = customMessages.kick_message_warning_limit
                   .replace(/{user}/g, senderNumber)
                   .replace(/{limit}/g, warningLimit);
                  await sock.sendMessage(groupId, {
                    text: kickMessage,
                    mentions: [senderId]
                  });
                  logger.info(`[WARNING SYSTEM] Kicked @${senderNumber} after ${warningLimit} warnings`);

                  // Reset user warnings after successful kick
                  resetUserWarnings(groupId, senderId);
                } catch (kickError) {
                  logger.error({ kickError }, `[WARNING SYSTEM] Failed to kick @${senderNumber}`);
                }
             } else {
                // Send violation message with warning count
                const violationMessage = customMessages.violation_message
                  .replace(/{user}/g, senderNumber)
                  .replace(/{reason_capitalized}/g, toUnicodeBold(reason.toUpperCase()))
                  .replace(/{count}/g, warningCount)
                  .replace(/{limit}/g, warningLimit);

               try {
                 await sock.sendMessage(groupId, {
                   text: violationMessage,
                   mentions: [senderId]
                 });
                 logger.info(`[WARNING SYSTEM] Violation message with warning ${warningCount}/${warningLimit} sent to @${senderNumber} for ${reason}`);
               } catch (sendError) {
                 logger.warn({ sendError }, '[WARNING SYSTEM] Failed to send violation message');
               }
             }
           } else {
             // For non-warning violations, send appropriate custom message
             let messageText = '';
             if (reason.includes('promotion')) {
               // Use promotion_message for promotional content
               messageText = customMessages.promotion_message.replace(/{user}/g, senderNumber);
             } else {
               // Use violation_message without warn line for mentions
               messageText = customMessages.violation_message
                 .replace(/{user}/g, senderNumber)
                 .replace(/{reason_capitalized}/g, reason.charAt(0).toUpperCase() + reason.slice(1))
                 .replace(/\n├◉ Warn : \{count\}\/\{limit\}/g, ''); // Remove warn line
             }
             try {
               await sock.sendMessage(groupId, {
                 text: messageText,
                 mentions: [senderId]
               });
               logger.info(`[MODERATION] Custom message sent to @${senderNumber} for ${reason} (no warning)`);
             } catch (sendError) {
               logger.warn({ sendError }, '[MODERATION] Failed to send custom message');
             }
           }
         } catch (e) {
           logger.error({ e }, `[ERROR] Failed to perform moderation action for @${senderNumber}.`);
         }
       }
    } catch (err) {
      // Handle decryption errors gracefully
      if (err.message?.includes('Invalid PreKey') ||
        err.message?.includes('No session found') ||
        err.message?.includes('SessionError')) {
        logger.warn({ err, msg: msg.key }, '[DECRYPT] Decryption error, skipping message');
        continue; // Skip this message and continue processing others
      } else {
        logger.error({ err }, '[FATAL] Error processing group message upsert.');
      }
    }
  }
}

export {
  handleMessagesUpsert,
  logger
};
