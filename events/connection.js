import fs from 'fs';
import path from 'path';
import { Boom } from '@hapi/boom';
import { DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { cleanupOldSessions } from '../utils/session.js';
import { startConnectionHealthMonitor, displayQR, connectionState } from '../core/connection.js';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

async function handleConnectionUpdate(sock, update, customMessages, startBot) {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
        displayQR(qr);
        logger.info('[QR CODE] QR code displayed in terminal. Scan to connect.');
    }
    
    if (connection === 'close') {
        const statusCode = (lastDisconnect?.error instanceof Boom) ? lastDisconnect.error.output.statusCode : undefined;
        let reason = `Connection closed, reason: ${statusCode}`;
        let shouldReconnect = true;
        switch (statusCode) {
            case DisconnectReason.loggedOut:
                reason = 'Device Logged Out. Please delete auth_info folder and rescan.';
                shouldReconnect = false;
                connectionState.reconnectAttempts = 0;
                break;
            case DisconnectReason.restartRequired:
                reason = 'Restart Required. Restarting immediately...';
                connectionState.reconnectAttempts = 0;
                break;
            case DisconnectReason.timedOut:
                reason = 'Connection Timed Out. Will retry with backoff...';
                break;
            case DisconnectReason.connectionLost:
                reason = 'Connection Lost. Will retry with backoff...';
                break;
            case DisconnectReason.badSession:
                reason = 'Bad Session Detected. Clearing session and restarting...';
                // Clear corrupted session data
                try {
                    const authPath = path.join(__dirname, '../auth_info');
                    if (fs.existsSync(authPath)) {
                        // Only clear session files, keep creds
                        const files = fs.readdirSync(authPath);
                        for (const file of files) {
                            if (file !== 'creds.json' && file.includes('session')) {
                                fs.unlinkSync(path.join(authPath, file));
                                logger.info(`[SESSION] Cleared corrupted session file: ${file}`);
                            }
                        }
                    }
                } catch (e) {
                    logger.error('[SESSION] Failed to clear session files:', e.message);
                }
                connectionState.reconnectAttempts = 0;
                break;
            default:
                reason = `Unknown Disconnect Reason (${statusCode}). Will retry with backoff...`;
        }
        console.error(`[CONNECTION FAILED] ${reason}`);
        logger.error(`[CONNECTION FAILED] ${reason}, Attempt: ${connectionState.reconnectAttempts + 1}/${connectionState.maxReconnectAttempts}`);
        if (shouldReconnect && connectionState.reconnectAttempts < connectionState.maxReconnectAttempts) {
            connectionState.reconnectAttempts++;
            const delayMs = calculateReconnectDelay(connectionState.reconnectAttempts - 1);
            const delaySeconds = Math.round(delayMs / 1000);
            console.log(`[RECONNECT] Attempt ${connectionState.reconnectAttempts}/${connectionState.maxReconnectAttempts} in ${delaySeconds} seconds...`);
            logger.info(`[RECONNECT] Scheduling reconnect attempt ${connectionState.reconnectAttempts} in ${delayMs}ms`);
            setTimeout(() => {
                console.log(`[RECONNECT] Executing attempt ${connectionState.reconnectAttempts}...`);
                startBot();
            }, delayMs);
        } else if (connectionState.reconnectAttempts >= connectionState.maxReconnectAttempts) {
            console.error(`[RECONNECT] Max reconnection attempts (${connectionState.maxReconnectAttempts}) reached. Manual restart required.`);
            logger.error(`[RECONNECT] Max reconnection attempts reached. Stopping automatic restart.`);
            console.log('[RECONNECT] To restart, run: npm run ngrok');
        } else {
            console.log('[LOGOUT] Please restart the application after deleting the auth_info folder.');
            logger.warn('[LOGOUT] User logged out. Manual intervention required.');
        }
    } else if (connection === 'open') {
        console.log('✅ Bot connected successfully! Monitoring all groups...');
        logger.info('✅ Bot connected successfully!');
        connectionState.reconnectAttempts = 0; // Reset attempts on successful connection
        connectionState.lastReconnectTime = Date.now();
        // Start connection health monitoring
        startConnectionHealthMonitor(sock, logger);
        // Clean up old sessions on successful connection
        cleanupOldSessions();
        // Debug bot ID information
        logger.info(`[DEBUG] Bot ID: ${sock.user?.id}, Bot Name: ${sock.user?.name}`);
        console.log(`[STARTUP] Bot JID: ${sock.user?.id}`);
        console.log(`[STARTUP] Bot LID: ${sock.user?.lid}`);
        // Send connection success message to web interface
        console.log('Bot connected successfully!');
    } else if (connection === 'connecting') {
        console.log('⏳ Connecting to WhatsApp...');
        logger.info('⏳ Connecting to WhatsApp...');
    }
}

// Connection stability variables
const minReconnectDelay = 5000; // 5 seconds
const maxReconnectDelay = 300000; // 5 minutes

function calculateReconnectDelay(attempt) {
    // Exponential backoff with jitter
    const baseDelay = Math.min(minReconnectDelay * Math.pow(2, attempt), maxReconnectDelay);
    const jitter = Math.random() * 1000; // Add up to 1 second of jitter
    return baseDelay + jitter;
}

export {
    handleConnectionUpdate,
    calculateReconnectDelay,
    connectionState,
    logger
};