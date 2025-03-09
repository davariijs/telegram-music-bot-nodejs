// commands/admin/reply.ts
import { Context } from 'telegraf';
import { ADMIN_ID } from '../../config';
import { getFeedbackById, saveReply } from '../../db/feedback';
import { escapeHTML } from '../../utils/formatting';
import { Telegraf } from 'telegraf';

export function setupReplyCommand(bot: Telegraf): void {
  // Handle /reply command without arguments
  bot.command('reply', (ctx) => {
    if (ctx.from?.id === ADMIN_ID) {
      ctx.reply(
        "To reply to feedback, use the format:\n" +
        "/reply [ID] [your message]\n\n" +
        "Example: /reply 5 Thanks for your feedback!"
      );
    }
  });
  
  // Handle full reply command with regex
  bot.hears(/^\/reply\s+(\d+)\s+(.+)$/i, async (ctx) => {
    if (ctx.from?.id !== ADMIN_ID) return;
    
    try {
      const feedbackId = parseInt(ctx.match[1]);
      const replyText = ctx.match[2];
      
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
  });
}