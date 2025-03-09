// commands/admin/feedback-list.ts
import { Context } from 'telegraf';
import { ADMIN_ID } from '../../config';
import { getPendingFeedback } from '../../db/feedback';
import { escapeHTML } from '../../utils/formatting';

export async function feedbackListCommand(ctx: Context): Promise<void> {
  if (ctx.from?.id !== ADMIN_ID) return;
  
  try {
    const pendingFeedback = getPendingFeedback();
    
    if (pendingFeedback.length === 0) {
      await ctx.reply('No pending feedback messages.');
      return;
    }
    
    for (const feedback of pendingFeedback) {
      const userInfo = feedback.username 
        ? `@${feedback.username}` 
        : feedback.first_name || `User ${feedback.user_id}`;
      
      await ctx.reply(
        `📩 <b>Feedback #${feedback.id}</b>\n` +
        `From: ${escapeHTML(userInfo)} (ID: ${feedback.user_id})\n` +
        `Time: ${new Date(feedback.timestamp).toLocaleString()}\n\n` +
        `${escapeHTML(feedback.message)}\n\n` +
        `To reply, use: /reply ${feedback.id} YOUR_REPLY`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Error retrieving feedback:', error);
    await ctx.reply('Error retrieving feedback messages');
  }
}