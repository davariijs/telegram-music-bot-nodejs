// commands/start.ts
import { Context } from 'telegraf';
import { ADMIN_ID } from '../config';
import { logActivity } from '../db/users';

export async function startCommand(ctx: Context): Promise<void> {
  const isAdmin = ctx.from?.id === ADMIN_ID;
  
  let welcomeMessage = 'Welcome! I can help you download music and videos from YouTube.\n\n' +
    'Just send me a song name or artist to search, or use these commands:\n' +
    '/search - Search for videos\n' +
    '/feedback - Send feedback or report issues\n' +
    '/help - Show help information';
  
  // Add admin commands if the user is an admin
  if (isAdmin) {
    welcomeMessage += '\n\n' +
      '🔐 <b>Admin Commands:</b>\n' +
      '/stats - View bot statistics\n' +
      '/feedback_list - See pending feedback\n' +
      '/reply [ID] [message] - Reply to feedback\n' +
      '/broadcast - Send message to all users';
      
    await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
  } else {
    await ctx.reply(welcomeMessage);
  }
  
  // Log the start event
  if (ctx.from) {
    logActivity(ctx.from.id, 'start_command');
  }
}