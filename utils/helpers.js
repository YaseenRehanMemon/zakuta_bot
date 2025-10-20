/**
 * Utility functions for the WhatsApp bot
 */

// Function to convert text to Unicode mathematical bold characters
function toUnicodeBold(text) {
    const boldMap = {
        'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝',
        'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧',
        'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
        'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷',
        'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁',
        'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
        '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵',
        ' ': ' ', ',': ',', '!': '!', '?': '?', ':': ':', ';': ';', '.': '.', '-': '-', '(': ')', ')': ')'
    };

    return text.split('').map(char => boldMap[char] || char).join('');
}

// Helper to get message content
const getMessageContent = (message) => {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return message.imageMessage.caption;
    if (message.videoMessage?.caption) return message.videoMessage.caption;
    if (message.viewOnceMessageV2?.message) {
        return getMessageContent(message.viewOnceMessageV2.message);
    }
    return '';
};

// Normalize ID to standard format
function normalizeId(id) {
    if (!id) return null;
    // Remove device suffix (like :6) before @s.whatsapp.net or @lid
    id = id.replace(/:\d+(@s\.whatsapp\.net|@lid)$/, '$1');
    // Convert @lid to @s.whatsapp.net
    id = id.replace(/@lid$/, '@s.whatsapp.net');
    return id;
}

export {
    toUnicodeBold,
    getMessageContent,
    normalizeId
};