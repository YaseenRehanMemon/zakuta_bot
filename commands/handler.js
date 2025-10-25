import schedule from 'node-schedule';
import moment from 'moment-timezone';
import pino from 'pino';
import { toUnicodeBold, normalizeId, getMessageContent } from '../utils/helpers.js';
import { getGroupSettings, setGroupSettings } from '../core/settings.js';
import { isAdmin, clearAdminCache } from '../core/admins.js';
import { autoTimers } from '../scheduler/autoTimer.js';
import { containsLinks, hasMentions, checkPromotionContent } from '../moderation/rules.js';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

async function handleCommand(sock, groupId, senderId, messageText, msg, customMessages) {
    const settings = getGroupSettings(groupId);
    const senderIsAdmin = await isAdmin(sock, groupId, senderId);

    logger.debug(`[COMMAND] Received from ${senderId} in ${groupId}: \"${messageText}\" | Admin: ${senderIsAdmin}`);
    if (!senderIsAdmin) {
        logger.info(`[COMMAND] Ignored command from non-admin ${senderId}`);
        const notAdminMessage = customMessages.not_admin_command_message.replace(/{user}/g, senderId.split('@')[0]);
        await sock.sendMessage(groupId, { text: notAdminMessage, mentions: [senderId] });
        return;
    }
    const cmd = messageText.trim().split(' ')[0].toLowerCase();
    const args = messageText.trim().split(' ').slice(1);
    const commandWithoutPrefix = cmd.substring(1);
    switch(cmd) {
        case '!antilink':
            const antilinkValue = args[0]?.toLowerCase() !== 'off';
            setGroupSettings(groupId, { antilink: antilinkValue });
            if (antilinkValue) {
                await sock.sendMessage(groupId, { text: "*😈 Anti-Link has been enable successfully for this group.☑️*" });
            } else {
                await sock.sendMessage(groupId, { text: "*😈 Anti-Link has been disabled successfully for this group.*" });
            }
            logger.info(`[COMMAND] Anti-link set to ${antilinkValue} for ${groupId}`);
            break;
        case '!antisticker':
            const antistickerValue = args[0]?.toLowerCase() !== 'off';
            setGroupSettings(groupId, { antisticker: antistickerValue });
            if (antistickerValue) {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Sticker now enabled for this group.☑️*" });
            } else {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Sticker feature is now disabled.*" });
            }
            logger.info(`[COMMAND] Anti-sticker set to ${antistickerValue} for ${groupId}`);
            break;
        case '!antitag':
        case '!taganti':
            const antitagValue = args[0]?.toLowerCase() !== 'off';
            setGroupSettings(groupId, { antitag: antitagValue });
            if (antitagValue) {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Tag feature has been successfully activated.✅*" });
            } else {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Tag feature has been successfully deactivated.*" });
            }
            logger.info(`[COMMAND] Anti-tag set to ${antitagValue} for ${groupId}`);
            break;
        case '!antipromotion':
            const antipromotionValue = args[0]?.toLowerCase() !== 'off';
            setGroupSettings(groupId, { antipromotion: antipromotionValue });
            if (antipromotionValue) {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Promotion feature has been successfully activated.✅*" });
            } else {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Promotion feature has been successfully deactivated.*" });
            }
            logger.info(`[COMMAND] Anti-promotion set to ${antipromotionValue} for ${groupId}`);
            break;
        case '!antistatus':
            const antistatusValue = args[0]?.toLowerCase() !== 'off';
            setGroupSettings(groupId, { antistatus: antistatusValue });
            if (antistatusValue) {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Status feature has been successfully activated.✅*" });
            } else {
                await sock.sendMessage(groupId, { text: "*😈 The Anti-Status feature has been successfully deactivated now.*" });
            }
            logger.info(`[COMMAND] Anti-status set to ${antistatusValue} for ${groupId}`);
            break;
        case '!welcome':
            const welcomeValue = args[0]?.toLowerCase() !== 'off';
            setGroupSettings(groupId, { welcome: welcomeValue });
            if (welcomeValue) {
                await sock.sendMessage(groupId, { text: "*😈 The Welcome feature has been successfully activated for this group.✅*" });
            } else {
                await sock.sendMessage(groupId, { text: "*😈 The Welcome feature has been successfully deactivated.*" });
            }
            logger.info(`[COMMAND] Welcome messages set to ${welcomeValue} for ${groupId}`);
            break;
        case '!ping':
            const start = Date.now();
            await sock.sendMessage(groupId, { text: '⏳ Pinging...' });
            const latency = Date.now() - start;
            await sock.sendMessage(groupId, { text: `📶 Pong! Latency: ${latency}ms` });
            logger.info(`[COMMAND] Ping command executed, latency: ${latency}ms`);
            break;
        case '!alive':
        case '!zakuta':
            await sock.sendMessage(groupId, { text: customMessages.alive_message });
            logger.info(`[COMMAND] Alive command executed.`);
            break;
        case '!teststatus':
            // Test command for antistatus functionality
            await sock.sendMessage(groupId, { text: 'Check my status for updates!' });
            logger.info(`[COMMAND] Test status command executed for antistatus testing.`);
            break;
        case '!help':
        case '!list':
            await sock.sendMessage(groupId, { text: `
⚡ *COMMANDS LIST* ⚡
*MODERATION TOGGLES:*
- *!antilink on/off*
- *!antisticker on/off*
- *!antitag on/off*
- *!antipromotion on/off*
- *!antistatus on/off*
- *!welcome on/off*
*GROUP MANAGEMENT:*
- *!link* (get group invite link)
- *!kick @user* or reply to user
- *!open*
- *!close*
- *!tagall [message]* or reply to message
*AUTOMATION:*
- *!autoopen HH:MM(AM/PM)*
- *!autoclose HH:MM(AM/PM)*
- *!autotimer off*
*UTILITY:*
- *!ping*
- *!alive* or *!zakuta*
- *!teststatus* (test antistatus)
`
            });
            logger.info(`[COMMAND] Help command executed.`);
            break;
        case '!link':
            try {
                // Check if bot is an admin before getting the group link
                let botIsAdmin = false;
                let retries = 3;

                while (retries > 0) {
                    try {
                        if (retries < 3) clearAdminCache(groupId);
                        const botJidOptions = [
                            sock.user?.lid,
                            sock.user?.id,
                            sock.authState?.creds?.me?.id,
                            sock.user?.jid
                        ].filter(Boolean).map(normalizeId);

                        logger.debug(`[BOT ADMIN CHECK] Checking JIDs for !link in ${groupId}: ${botJidOptions.join(', ')}`);
                        logger.info(`[STARTUP] Bot JIDs for !link in ${groupId}: ${botJidOptions.join(', ')}`);

                        for (const botJid of botJidOptions) {
                            botIsAdmin = await isAdmin(sock, groupId, botJid);
                            if (botIsAdmin) break;
                        }
                        if (botIsAdmin) break;
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[LINK] Bot not admin, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (e) {
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[LINK] Admin check failed, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
                if (!botIsAdmin) {
                    await sock.sendMessage(groupId, { text: "⚠️ I need admin rights to fetch the group link." });
                    logger.warn(`[LINK] Bot is not admin in ${groupId}, cannot fetch group link`);
                    return;
                }
                
                const code = await sock.groupInviteCode(groupId);
                const groupLink = `https://chat.whatsapp.com/${code}`;
                await sock.sendMessage(groupId, { text: groupLink });
                logger.info(`[LINK] Group link sent for ${groupId}`);
            } catch (e) {
                logger.error({ e }, '[LINK] Failed to get group link');
                await sock.sendMessage(groupId, { text: customMessages.group_link_fail || "❌ Failed to get group link. Make sure I am an admin." });
            }
            break;
        case '!kick':
            try {
                let userToKick = null;
                
                // Check for reply-based kick first
                const repliedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant;
                if (repliedParticipant) {
                    userToKick = repliedParticipant;
                } else {
                    // Check for mentioned users
                    const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (mentionedJids && mentionedJids.length > 0) {
                        userToKick = mentionedJids[0];
                    }
                }
                
                if (!userToKick) {
                    await sock.sendMessage(groupId, { text: customMessages.no_user_mentioned_kick });
                    logger.warn(`[COMMAND] Kick command failed: No user specified (mentioned or replied).`);
                    return;
                }

                logger.info(`[KICK] Admin ${senderId} attempting to kick ${userToKick}`);
                
                // Check if the user to kick is an admin (admins can't be kicked by other admins)
                const userToKickIsAdmin = await isAdmin(sock, groupId, userToKick);
                if (userToKickIsAdmin) {
                    await sock.sendMessage(groupId, { 
                        text: "❌ Cannot kick an admin user.", 
                        mentions: [userToKick] 
                    });
                    logger.warn(`[KICK] Attempted to kick admin user ${userToKick}, operation blocked`);
                    return;
                }
                
                // Check if bot is admin before attempting to kick
                let botIsAdmin = false;
                let retries = 3;

                while (retries > 0) {
                    try {
                        if (retries < 3) clearAdminCache(groupId);
                        const botJidOptions = [
                            sock.user?.lid,
                            sock.user?.id,
                            sock.authState?.creds?.me?.id,
                            sock.user?.jid
                        ].filter(Boolean).map(normalizeId);

                        logger.debug(`[BOT ADMIN CHECK] Checking JIDs for !kick in ${groupId}: ${botJidOptions.join(', ')}`);
                        logger.info(`[STARTUP] Bot JIDs for !kick in ${groupId}: ${botJidOptions.join(', ')}`);

                        for (const botJid of botJidOptions) {
                            botIsAdmin = await isAdmin(sock, groupId, botJid);
                            if (botIsAdmin) break;
                        }
                        if (botIsAdmin) break;
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[KICK] Bot not admin, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (e) {
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[KICK] Admin check failed, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
                if (!botIsAdmin) {
                    await sock.sendMessage(groupId, { text: customMessages.kick_failed });
                    logger.warn(`[KICK] Bot is not admin in ${groupId}, cannot kick user`);
                    return;
                }
                
                await sock.groupParticipantsUpdate(groupId, [userToKick], 'remove');
                await sock.sendMessage(groupId, { text: `🗑️ @${userToKick.split('@')[0]} has been kicked.`, mentions: [userToKick] });
                logger.info(`[KICK] Successfully kicked ${userToKick}`);
            } catch (e) {
                logger.error({ e }, '[ERROR] Kick failed!');
                await sock.sendMessage(groupId, { text: customMessages.kick_failed });
            }
            break;
        case '!open':
            try {
                // Check if bot is an admin before changing group settings
                let botIsAdmin = false;
                let retries = 3;

                while (retries > 0) {
                    try {
                        if (retries < 3) clearAdminCache(groupId);
                        const botJidOptions = [
                            sock.user?.lid,
                            sock.user?.id,
                            sock.authState?.creds?.me?.id,
                            sock.user?.jid
                        ].filter(Boolean).map(normalizeId);

                        logger.debug(`[BOT ADMIN CHECK] Checking JIDs for !open in ${groupId}: ${botJidOptions.join(', ')}`);
                        logger.info(`[STARTUP] Bot JIDs for !open in ${groupId}: ${botJidOptions.join(', ')}`);

                        for (const botJid of botJidOptions) {
                            botIsAdmin = await isAdmin(sock, groupId, botJid);
                            if (botIsAdmin) break;
                        }
                        if (botIsAdmin) break;
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[OPEN] Bot not admin, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (e) {
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[OPEN] Admin check failed, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
                if (!botIsAdmin) {
                    await sock.sendMessage(groupId, { text: customMessages.group_open_fail });
                    logger.warn(`[OPEN] Bot is not admin in ${groupId}, cannot open group`);
                    return;
                }
                
                await sock.groupSettingUpdate(groupId, 'not_announcement');
                await sock.sendMessage(groupId, { text: customMessages.group_open_success });
                logger.info(`[COMMAND] Group ${groupId} set to OPEN.`);
            } catch (e) {
                logger.error({ e }, '[ERROR] Failed to open group.');
                await sock.sendMessage(groupId, { text: customMessages.group_open_fail });
            }
            break;
        case '!close':
            try {
                // Check if bot is an admin before changing group settings
                let botIsAdmin = false;
                let retries = 3;

                while (retries > 0) {
                    try {
                        if (retries < 3) clearAdminCache(groupId);
                        const botJidOptions = [
                            sock.user?.lid,
                            sock.user?.id,
                            sock.authState?.creds?.me?.id,
                            sock.user?.jid
                        ].filter(Boolean).map(normalizeId);

                        logger.debug(`[BOT ADMIN CHECK] Checking JIDs for !close in ${groupId}: ${botJidOptions.join(', ')}`);
                        logger.info(`[STARTUP] Bot JIDs for !close in ${groupId}: ${botJidOptions.join(', ')}`);

                        for (const botJid of botJidOptions) {
                            botIsAdmin = await isAdmin(sock, groupId, botJid);
                            if (botIsAdmin) break;
                        }
                        if (botIsAdmin) break;
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[CLOSE] Bot not admin, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (e) {
                        retries--;
                        if (retries > 0) {
                            logger.warn(`[CLOSE] Admin check failed, retrying... (${retries} left)`);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }
                
                if (!botIsAdmin) {
                    await sock.sendMessage(groupId, { text: customMessages.group_close_fail });
                    logger.warn(`[CLOSE] Bot is not admin in ${groupId}, cannot close group`);
                    return;
                }
                
                await sock.groupSettingUpdate(groupId, 'announcement');
                await sock.sendMessage(groupId, { text: customMessages.group_close_success });
                logger.info(`[COMMAND] Group ${groupId} set to CLOSED.`);
            } catch (e) {
                logger.error({ e }, '[ERROR] Failed to close group.');
                await sock.sendMessage(groupId, { text: customMessages.group_close_fail });
            }
            break;
        case '!tagall':
            try {
                const metadata = await sock.groupMetadata(groupId);
                const participants = metadata.participants.map(p => p.id);
                if (participants.length === 0) {
                    await sock.sendMessage(groupId, { text: customMessages.tagall_empty_group });
                    logger.warn(`[COMMAND] Tagall failed: No participants found in group ${groupId}.`);
                    return;
                }
                
                // Check if command is used as a reply
                const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
                const isReply = !!contextInfo?.stanzaId;
                
                let tagMessage = args.join(' ');
                
                if (isReply) {
                    // When replying, handle the message differently
                    if (!tagMessage) {
                        // If no message provided, use a default minimal message
                        tagMessage = "🔔 Attention!";
                    }
                    
                    const formattedMessage = customMessages.tagall_message_prefix.replace(/{message}/g, tagMessage);
                    
                    // Create message with quote context
                    const messageWithQuote = {
                        text: formattedMessage,
                        mentions: participants,
                        contextInfo: {
                            stanzaId: contextInfo.stanzaId,
                            participant: contextInfo.participant,
                            remoteJid: groupId
                        }
                    };
                    
                    await sock.sendMessage(groupId, messageWithQuote);
                    logger.info(`[TAGALL] Quoted tagall executed in ${groupId} by ${senderId}. Tagged ${participants.length} members.`);
                } else {
                    // Original behavior when not replying
                    if (!tagMessage) {
                        await sock.sendMessage(groupId, { text: customMessages.tagall_no_message });
                        logger.warn(`[COMMAND] Tagall failed: No message provided.`);
                        return;
                    }
                    
                    const formattedMessage = customMessages.tagall_message_prefix.replace(/{message}/g, tagMessage);
                    await sock.sendMessage(groupId, {
                        text: formattedMessage,
                        mentions: participants
                    });
                    logger.info(`[COMMAND] Tagall executed in ${groupId} by ${senderId}. Tagged ${participants.length} members.`);
                }
            } catch (e) {
                logger.error({ e }, '[ERROR] Tagall command failed!');
                await sock.sendMessage(groupId, { text: `⚠ Failed to tag all members. Make sure I am an admin.` });
            }
            break;
        case '!autoopen':
        case '!autoclose':
            const timeArg = args[0];
            if (!timeArg) {
                const message = toUnicodeBold(customMessages.auto_timer_provide_time.replace(/{command}/g, commandWithoutPrefix));
                await sock.sendMessage(groupId, { text: message });
                logger.warn(`[COMMAND] Auto-timer failed: No time provided for ${cmd}.`);
                return;
            }
            const match = timeArg.match(/(\d{1,2}):(\d{2})(AM|PM)/i);
            if (!match) {
                await sock.sendMessage(groupId, { text: toUnicodeBold(customMessages.auto_timer_invalid_format) });
                logger.warn(`[COMMAND] Auto-timer failed: Invalid time format \"${timeArg}\" for ${cmd}.`);
                return;
            }
            let [, hour, minute, meridiem] = match;
            hour = parseInt(hour);
            minute = parseInt(minute);
            if (meridiem.toUpperCase() === 'PM' && hour !== 12) hour += 12;
            if (meridiem.toUpperCase() === 'AM' && hour === 12) hour = 0;

            // Convert Pakistan time to UTC for scheduling
            const pakistanTime = moment.tz(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`, 'HH:mm', 'Asia/Karachi');
            const utcHour = pakistanTime.utc().hour();
            const utcMinute = pakistanTime.utc().minute();

            const cmdType = cmd === '!autoopen' ? 'open' : 'close';
            const action = cmdType === 'open' ? 'not_announcement' : 'announcement';

            if (!autoTimers[groupId]) {
                autoTimers[groupId] = { open: [], close: [] };
            }

            try {
                const job = schedule.scheduleJob({ hour: utcHour, minute: utcMinute, tz: 'UTC' }, async () => {
                    logger.info(`[AUTO-TIMER] TRIGGERED! Running ${cmdType} for group ${groupId}.`);
                    try {
                        await sock.groupSettingUpdate(groupId, action);
                        const successMessage = toUnicodeBold(customMessages.auto_timer_trigger_success.replace(/{type_upper}/g, cmdType.toUpperCase()));
                        await sock.sendMessage(groupId, { text: successMessage });
                        logger.info(`[AUTO-TIMER] SUCCESS! Group ${groupId} has been set to ${cmdType}.`);
                    } catch (e) {
                        logger.error({ e }, `[AUTO-TIMER] FAILED to execute ${cmdType} for group ${groupId}.`);
                        await sock.sendMessage(groupId, { text: toUnicodeBold(customMessages.auto_timer_trigger_fail || "⚠️ Auto-timer failed to execute!") });
                    }
                });
                
                // Push new job to the appropriate array
                autoTimers[groupId][cmdType].push(job);
                logger.info(`[AUTO-TIMER] Added new ${cmdType} timer for ${timeArg} (Pakistan time, scheduled in UTC) in group ${groupId}`);
                
                const successMessage = toUnicodeBold(customMessages.auto_timer_set_success.replace(/{type}/g, cmdType.charAt(0).toUpperCase() + cmdType.slice(1)).replace(/{time}/g, timeArg));
                await sock.sendMessage(groupId, { text: successMessage });
            } catch (e) {
                logger.error({ e }, `[ERROR] Failed to schedule auto-${cmdType}.`);
                await sock.sendMessage(groupId, { text: toUnicodeBold(customMessages.auto_timer_schedule_fail || "⚠️ Auto-timer failed to schedule!") });
            }
            break;
        case '!autotimer':
            if (args[0]?.toLowerCase() === 'off') {
                if (autoTimers[groupId]) {
                    // Cancel all open timers
                    for (const job of autoTimers[groupId].open) {
                        job.cancel();
                    }
                    logger.info(`[AUTO-TIMER] Canceled all auto-open timers for group ${groupId}`);
                    
                    // Cancel all close timers
                    for (const job of autoTimers[groupId].close) {
                        job.cancel();
                    }
                    logger.info(`[AUTO-TIMER] Canceled all auto-close timers for group ${groupId}`);
                    
                    // Clear arrays and delete group entry
                    autoTimers[groupId].open = [];
                    autoTimers[groupId].close = [];
                    delete autoTimers[groupId];
                    
                    await sock.sendMessage(groupId, { text: toUnicodeBold(customMessages.auto_timer_cancel_all) });
                } else {
                    await sock.sendMessage(groupId, { text: toUnicodeBold(customMessages.auto_timer_no_active) });
                }
            }
            break;
    }
}

export {
    handleCommand,
    logger
};