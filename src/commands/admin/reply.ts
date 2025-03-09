// commands/admin/reply.ts
import { Context } from 'telegraf';
import { ADMIN_ID } from '../../config';
import { getFeedbackById, saveReply } from '../../db/feedback';
import { escapeHTML } from '../../utils/formatting';
import { Telegraf } from 'telegraf';

export function setupReplyCommand(bot: Telegraf): void {
  // Handle the format: /reply ID message
  bot.hears(/^\/reply\s+(\d+)\s+(.+)$/s, async (ctx) => {
    console.log('Matched reply with ID pattern');
    if (ctx.from?.id !== ADMIN_ID) return;
    
    const feedbackId = parseInt(ctx.match[1]);
    const replyText = ctx.match[2];
    
    console.log(`Processing reply to feedback #${feedbackId}: "${replyText}"`);
    await handleReply(ctx, bot, feedbackId, replyText);
  });
  
  // Handle /reply command (must be after the more specific hears handler)
  bot.command('reply', async (ctx) => {
    console.log('Matched general reply command');
    if (ctx.from?.id !== ADMIN_ID) return;
    
    const message = ctx.message;
    const messageText = message?.text || '';
    
    // Check if this is in the format "/reply ID message" manually
    const manualMatch = messageText.match(/^\/reply\s+(\d+)\s+(.+)$/s);
    if (manualMatch) {
      console.log('Manually matched ID pattern inside command handler');
      const feedbackId = parseInt(manualMatch[1]);
      const replyText = manualMatch[2];
      
      await handleReply(ctx, bot, feedbackId, replyText);
      return;
    }
    
    // If this is a reply to another message
    if (message && message.reply_to_message) {
      console.log('Processing reply to message');
      const originalMessage = message.reply_to_message;
      
      if (!('text' in originalMessage)) {
        await ctx.reply('Cannot find feedback ID in the original message.');
        return;
      }
      
      // Try to extract feedback ID from the original message
      const match = originalMessage.text.match(/Feedback #(\d+)/i) || 
                    originalMessage.text.match(/feedback.*?(\d+)/i);
      
      if (!match || !match[1]) {
        await ctx.reply('Could not find feedback ID in the message. Make sure you are replying to a feedback message.');
        return;
      }
      
      const feedbackId = parseInt(match[1]);
      const replyText = messageText.replace(/^\/reply\s*/, '').trim();
      
      if (!replyText) {
        await ctx.reply('Please provide a reply text after the /reply command.');
        return;
      }
      
      await handleReply(ctx, bot, feedbackId, replyText);
      return;
    }
    
    // Regular command without arguments - show help
    console.log('Showing help message');
    await ctx.reply(
      "To reply to feedback, use one of these methods:\n\n" +
      "1. Reply directly to a feedback message with:\n" +
      "/reply Your response here\n\n" +
      "2. Use the format with ID:\n" +
      "/reply [ID] [your message]\n\n" +
      "Example: /reply 5 Thanks for your feedback!"
    );
  });
}

// Helper function to handle the reply process
async function handleReply(ctx: Context, bot: Telegraf, feedbackId: number, replyText: string): Promise<void> {
  try {
    console.log(`Handling reply to feedback #${feedbackId}`);
    const feedback = getFeedbackById(feedbackId);
    
    if (!feedback) {
      await ctx.reply(`Feedback #${feedbackId} not found.`);
      return;
    }
    
    // Save the reply
    saveReply(feedbackId, replyText);
    
    // Send reply to the user
    await bot.telegram.sendMessage(
      feedback.user_id,
      `📬 <b>Reply from admin regarding your feedback:</b>\n\n` +
      `Your message: "${escapeHTML(feedback.message)}"\n\n` +
      `Admin's reply: "${escapeHTML(replyText)}"\n\n` +
      `Use /feedback to send another message if needed.`,
      { parse_mode: 'HTML' }
    );
    
    await ctx.reply(`Reply sent to user ${feedback.user_id} for feedback #${feedbackId}`);
  } catch (error) {
    console.error('Error replying to feedback:', error);
    await ctx.reply('Error sending reply. Please try again.');
  }
}