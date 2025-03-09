// handlers/feedback.ts
import { Context } from 'telegraf';
import { BotState } from '../types';
import { saveFeedback } from '../db/feedback';
import { escapeHTML } from '../utils/formatting';
import { ADMIN_ID } from '../config';
import { Telegraf } from 'telegraf';

export async function handleFeedbackMessage(ctx: Context, state: BotState, bot: Telegraf): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId || state.feedbackState.get(userId) !== 'awaiting_feedback') {
    return false;
  }
  
  // Check if message exists and is text
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply('Please send a text message for your feedback.');
    return true;
  }
  
  const feedbackText = ctx.message.text;
  
  // Store feedback in database
  try {
    const feedbackId = saveFeedback(userId, feedbackText);
    
    // Notify admin if configured
    if (ADMIN_ID) {
      const userInfo = ctx.from.username 
        ? `@${ctx.from.username}` 
        : ctx.from.first_name || `User ${userId}`;
        
      await bot.telegram.sendMessage(
        ADMIN_ID,
        `📩 <b>New Feedback Received</b>\n` +
        `From: ${escapeHTML(userInfo)} (ID: ${userId})\n\n` +
        `${escapeHTML(feedbackText)}\n\n` +
        `Use /feedback_list to see all pending feedback.`,
        { parse_mode: 'HTML' }
      );
    }
    
    await ctx.reply(
      'Thank you for your feedback! The administrator will review it soon.\n' +
      'You can continue using the bot normally now.'
    );
  } catch (dbError) {
    console.error('Error saving feedback:', dbError);
    await ctx.reply('Error saving your feedback. Please try again later.');
  }
  
  // Reset feedback state
  state.feedbackState.delete(userId);
  return true;
}