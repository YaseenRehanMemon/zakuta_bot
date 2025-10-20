// --- START OF FILE index.js ---
import fs from 'fs';
import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, delay, proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import schedule from 'node-schedule';

// Import modules
import { toUnicodeBold, getMessageContent, normalizeId } from './utils/helpers.js';
import { loadMessages } from './config/messages.js';
import { cleanupOldSessions } from './utils/session.js';
import { initializeConnection, displayQR, calculateReconnectDelay, startConnectionHealthMonitor, updateActivity, connectionState } from './core/connection.js';
import { isAdmin, clearAdminCache } from './core/admins.js';
import { getGroupSettings } from './core/settings.js';
import { handleAntistatusViolation } from './moderation/antistatus.js';
import { containsLinks, hasMentions, checkPromotionContent } from './moderation/rules.js';
import { handleCommand } from './commands/handler.js';
import { handleMessagesUpsert } from './events/messages.js';
import { handleGroupParticipantsUpdate } from './events/participants.js';
import { handleConnectionUpdate, calculateReconnectDelay as connCalculateReconnectDelay } from './events/connection.js';
import { autoTimers } from './scheduler/autoTimer.js';

// Initialize logger
const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// Load custom messages
const customMessages = loadMessages();

async function startBot() {
    console.log('--- Initializing Zakuta Bot ---');
    logger.info('--- Initializing Zakuta Bot ---');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = await initializeConnection(
        async (update) => {
            await handleConnectionUpdate(sock, update, customMessages, startBot);
        },
        async (messagesData) => {
            await handleMessagesUpsert(sock, messagesData, customMessages);
        },
        logger
    );

    // Register participant update handler
    sock.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantsUpdate(sock, update, customMessages);
    });
}

// Global error handlers
let fatalErrorCount = 0;
const maxFatalErrors = 3;
process.on('uncaughtException', (err) => {
    fatalErrorCount++;
    console.error(`[FATAL ERROR ${fatalErrorCount}/${maxFatalErrors}] Uncaught Exception:`, err.message);
    logger.fatal({ err }, `[FATAL ERROR] Uncaught Exception #${fatalErrorCount}`);
    if (fatalErrorCount < maxFatalErrors) {
        const restartDelay = Math.min(10000 * fatalErrorCount, 60000); // Progressive delay, max 1 minute
        console.log(`[RESTART] Restarting bot in ${restartDelay/1000} seconds due to fatal error...`);
        setTimeout(() => startBot(), restartDelay);
    } else {
        console.error('[FATAL ERROR] Too many fatal errors. Manual restart required.');
        logger.fatal('[FATAL ERROR] Max fatal errors reached. Stopping automatic restart.');
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[FATAL ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
    logger.fatal({ reason, promise }, '[FATAL ERROR] Unhandled Rejection');
    // Don't restart on unhandled rejections as they might be less critical
    // Just log and continue
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('[SHUTDOWN] Shutting down bot...');
    logger.info('[SHUTDOWN] Shutting down bot...');
    schedule.gracefulShutdown();
    process.exit(0);
});

console.log('🚀 Starting WhatsApp Moderation Bot...');
logger.info('🚀 Starting WhatsApp Moderation Bot...');
startBot();
// --- END OF FILE index.js ---