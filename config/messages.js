import fs from 'fs';
import path from 'path';
import pino from 'pino';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

function loadMessages() {
    const defaultMessages = {
        alive_message: "╔══════════════════════════╗\n║ 💥 BOT IS ALIVE (Default) 💥\n║\n║ This is a default message. Customize in messages.json\n║ © Dev by Yaseen\n╚══════════════════════════╝",
        welcome_message: "💫 Welcome @{user} to the group! (Default)",
        violation_message: "💥 Message from @{user} deleted. Reason: {reason_capitalized} is not allowed. (Default)",
        status_kick_message: "🚨 @{user} KICKED! 🚨\nDefault: HUH GO SEND YOUR STATUS IN OTHER GROUPS☆",
        promotion_message: "🚫 Promotion from @{user} deleted. Default: Group promotion is strictly forbidden ⛔",
        no_user_mentioned_kick: "⚠️ Please mention the user you want to kick.",
        kick_failed: "⚠ Kick failed. Make sure I am an admin and the user is in the group.",
        group_open_success: "✅ Group is now OPEN for everyone.",
        group_open_fail: "⚠ Failed to open group. Make sure I am an admin.",
        group_close_success: "🔒 Group is now CLOSED for admins only.",
        group_close_fail: "⚠ Failed to close group. Make sure I am an admin.",
        auto_timer_provide_time: "⚠️ Please provide a time. Example: !{command} 7:00AM",
        auto_timer_invalid_format: "⚠️ Invalid time format. Please use HH:MMAM/PM (e.g., 09:30PM).",
        auto_timer_set_success: "Auto-{type} scheduled for {time} daily.✅",
        auto_timer_trigger_success: "⏰ Auto-timer executed: Group has been {type_upper}. {emoji}",
        auto_timer_cancel_all: "All auto-timers for this group have been canceled.☑️",
        auto_timer_no_active: "ℹ️ No active auto-timers to cancel.",
        tagall_empty_group: "⚠️ Cannot tag all: Group has no participants or failed to fetch participants.",
        tagall_message_prefix: "╔═══════════════════════════╗\n╠ 📢 *ATTENTION ALL MEMBERS* 📢\n╠\n╠ {message}\n╠\n╠ © Dev by Yaseen\n╚═══════════════════════════╝",
        tagall_no_message: "⚠️ Please provide a message for !tagall. Example: !tagall Important announcement!",
        not_admin_command_message: "╔═══════════════════════════╗\n╠ 👑 *ADMIN ONLY!* 👑\n╠\n╠ *User*: @{user}\n╠ *Action*: 🚫 Command blocked.\n╠ *Message*: Pehle admin bano, baad me message karna! 😉\n╠\n╠ © Dev by Yaseen\n╚═══════════════════════════╝"
    };
    try {
        if (fs.existsSync('messages.json')) {
            const fileContent = fs.readFileSync('messages.json', 'utf8');
            const customMessages = JSON.parse(fileContent);
            logger.info('[SUCCESS] Custom messages loaded from messages.json');
            return { ...defaultMessages, ...customMessages };
        }
        throw new Error('messages.json not found.');
    } catch (error) {
        logger.error({ error }, '[ERROR] Could not load messages.json. Using default messages.');
        return defaultMessages;
    }
}

export {
    loadMessages,
    logger
};