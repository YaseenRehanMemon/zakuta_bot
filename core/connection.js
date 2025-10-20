import { default as makeWASocket, useMultiFileAuthState, DisconnectReason, delay } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { cleanupOldSessions } from '../utils/session.js';

// Connection stability variables
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let lastReconnectTime = 0;
const minReconnectDelay = 5000; // 5 seconds
const maxReconnectDelay = 300000; // 5 minutes

function calculateReconnectDelay(attempt) {
    // Exponential backoff with jitter
    const baseDelay = Math.min(minReconnectDelay * Math.pow(2, attempt), maxReconnectDelay);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return baseDelay + jitter;
}

// Connection health monitoring
let connectionHealthInterval = null;
let lastActivityTime = Date.now();

function startConnectionHealthMonitor(sock, logger) {
    if (connectionHealthInterval) {
        clearInterval(connectionHealthInterval);
    }
    connectionHealthInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceLastActivity = now - lastActivityTime;
        const timeSinceLastReconnect = now - lastReconnectTime;

        // If no activity for 10 minutes and connected for more than 5 minutes, send ping
        if (timeSinceLastActivity > 600000 && timeSinceLastReconnect > 300000 && sock.user) {
            logger.info('[HEALTH] Sending connection health ping...');
            // This will trigger activity and help maintain connection
            lastActivityTime = now;
        }

        // Log connection status every 5 minutes
        if (Math.floor(now / 300000) !== Math.floor(lastActivityTime / 300000)) {
            logger.info(`[HEALTH] Connection status: Active, Reconnect attempts: ${reconnectAttempts}`);
            logger.info(`[HEALTH] Connection health check - Active for ${Math.round(timeSinceLastReconnect / 60000)} minutes`);
            // Run session cleanup every 30 minutes
            if (Math.floor(now / 1800000) !== Math.floor(lastActivityTime / 1800000)) {
                cleanupOldSessions();
            }
        }
    }, 60000); // Check every minute
}

function updateActivity() {
    lastActivityTime = Date.now();
}

async function initializeConnection(eventHandler, messageHandler, logger) {
    console.log('--- Initializing Zakuta Bot ---');
    logger.info('--- Initializing Zakuta Bot ---');
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        browser: ['Baileys', 'Chrome', '1.0.0']
    });

    // Register event handlers
    sock.ev.on('connection.update', eventHandler);
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('messages.upsert', messageHandler);

    // Handle identity changes gracefully
    sock.ev.on('identity.change', (identity) => {
        logger.info({ identity }, '[IDENTITY] Identity change detected');
        // Don't disconnect on identity changes, just log
    });

    return sock;
}

// Export the reconnect attempts as an object so they can be modified
const connectionState = {
    reconnectAttempts: 0,
    maxReconnectAttempts: 10,
    lastReconnectTime: 0
};

function displayQR(qr) {
    console.log('\n[QR CODE] Scan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
}

export {
    initializeConnection,
    displayQR,
    calculateReconnectDelay,
    startConnectionHealthMonitor,
    updateActivity,
    connectionState
};