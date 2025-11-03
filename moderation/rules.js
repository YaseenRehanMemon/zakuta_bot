import pino from 'pino';
import { getMessageContent } from '../utils/helpers.js';

const logger = pino({ level: 'debug' }, pino.destination('bot.log'));

function containsLinks(text) {
    if (!text) return false;
    const youtubePattern = /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|google\.com\/watch)/i;
    const drivePattern = /https?:\/\/drive\.google\.com/i;
    if (youtubePattern.test(text) || drivePattern.test(text)) return false; // Allow YouTube and Google Drive
    const linkPatterns = [/https?:\/\//i, /wa\.me\//i, /t\.me\//i, /chat\.whatsapp\.com\/\S+/i, /bit\.ly\//i, /discord\.gg\//i];
    return linkPatterns.some(p => p.test(text));
}

function hasMentions(message) {
    return message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0 ||
           message.message?.imageMessage?.contextInfo?.mentionedJid?.length > 0 ||
           message.message?.videoMessage?.contextInfo?.mentionedJid?.length > 0;
}

function checkPromotionContent(messageText, msg) {
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
        const hasAnyLinks = linkCount > 0; // Changed from > 1 to > 0
        const hasUrlButtons = innerMessage?.buttons && innerMessage.buttons.some(button => button.urlButton);

        // Consider it promotional if it has any of these indicators
        isPromotionalForward = hasPromotionalKeywords || hasAnyLinks || hasUrlButtons;
    }

    // Enhanced promotion detection
    return linkCount > 0 || 
           promotionKeywords.some(p => p.test(messageText)) ||
           isPromotionalForward || 
           hasForwardedNewsletter || 
           hasUrlButtons || 
           hasQuotedLinks;
}

export {
    containsLinks,
    hasMentions,
    checkPromotionContent,
    logger
};