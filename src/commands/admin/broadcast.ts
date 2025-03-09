// commands/admin/broadcast.ts
import { Context, Telegraf } from 'telegraf';
import { ADMIN_ID } from '../../config';
import { BotState } from '../../types';
import { getAllUsers } from '../../db/users';
import { escapeHTML } from '../../utils/formatting';

export async function broadcastCommand(ctx: Context, state: BotState): Promise<void> {
  if (ctx.from?.id !== ADMIN_ID) return;
  
  state.broadcastState.set(ADMIN_ID, 'awaiting_message');
  await ctx.reply(
    '📣 <b>Broadcast Message</b>\n\n' +
    'Please type the message you want to broadcast to all users.\n' +
    'The message will be sent to everyone who has used the bot.\n\n' +
    'Type /cancel to cancel the broadcast.',
    { parse_mode: 'HTML' }
  );
}

export async function handleBroadcastMessage(ctx: Context, state: BotState, bot: Telegraf): Promise<boolean> {
  const userId = ctx.from?.id;
  if (userId !== ADMIN_ID || state.broadcastState.get(ADMIN_ID) !== 'awaiting_message') {
    return false;
  }
  
  // Check if message exists and has text
  if (!ctx.message || !('text' in ctx.message)) {
    await ctx.reply('Please send a text message for broadcast.');
    return true;
  }
  
  const messageText = ctx.message.text;
  
  await ctx.reply('⏳ <b>Broadcasting message to all users...</b>', { parse_mode: 'HTML' });
  
  try {
    // Get all users
    const users = getAllUsers();
    
    let sentCount = 0;
    let failedCount = 0;
    
    // Send to each user
    for (const user of users) {
      try {
        // Don't send to the admin themselves
        if (user.id !== ADMIN_ID) {
          await bot.telegram.sendMessage(
            user.id,
            `📢 <b>Announcement from Bot Admin:</b>\n\n${escapeHTML(messageText)}`,
            { parse_mode: 'HTML' }
          );
          sentCount++;
        }
        // Add a small delay to avoid hitting Telegram's rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (sendError) {
        console.error(`Failed to send broadcast to user ${user.id}:`, sendError);
        failedCount++;
      }
    }
    
    // Reset broadcast state
    state.broadcastState.delete(ADMIN_ID);
    
    await ctx.reply(
      `✅ <b>Broadcast Complete</b>\n\n` +
      `Message sent to ${sentCount} users\n` +
      `Failed to send to ${failedCount} users`,
      { parse_mode: 'HTML' }
    );
    
    return true;
  } catch (error) {
    console.error('Error broadcasting message:', error);
    await ctx.reply('Error broadcasting message. Please try again.');
    state.broadcastState.delete(ADMIN_ID);
    return true;
  }
}