import fs from 'fs';
import path from 'path';
import pino from 'pino';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

// Session cleanup function
function cleanupOldSessions() {
    try {
        const authPath = path.join(__dirname, '../auth_info');
        if (fs.existsSync(authPath)) {
            const files = fs.readdirSync(authPath);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

            for (const file of files) {
                const filePath = path.join(authPath, file);
                const stats = fs.statSync(filePath);
                // Remove old session files (but keep creds.json)
                if (file !== 'creds.json' &&
                    (file.includes('session') || file.includes('pre-key')) &&
                    (now - stats.mtime.getTime()) > maxAge) {
                    fs.unlinkSync(filePath);
                    logger.info(`[SESSION] Cleaned up old session file: ${file}`);
                }
            }
        }
    } catch (error) {
        logger.error({ error }, '[SESSION] Failed to cleanup old sessions');
    }
}

export {
    cleanupOldSessions,
    logger
};