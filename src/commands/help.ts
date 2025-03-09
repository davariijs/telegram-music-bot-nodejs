// commands/help.ts
import { Context } from 'telegraf';
import { ADMIN_ID } from '../config';

export async function helpCommand(ctx: Context): Promise<void> {
  const isAdmin = ctx.from?.id === ADMIN_ID;
  
  let helpMessage = '🎵 <b>YouTube Downloader Bot Help</b> 🎵\n\n' +
    '<b>User Commands:</b>\n' +
    '• Simply type any song or video name to search\n' +
    '• /search - Search for videos\n' +
    '• /feedback - Send feedback or report issues\n' +
    '• /cancel - Cancel current operation\n\n' +
    '<b>How to use:</b>\n' +
    '1. Search for a video by name\n' +
    '2. Select from search results\n' +
    '3. Choose audio or video format\n' +
    '4. For videos, select quality\n' +
    '5. Wait for download to complete\n\n' +
    'If you encounter any issues, use /feedback to report them!';
  
  if (isAdmin) {
    helpMessage += '\n\n' +
      '🔐 <b>Admin Commands:</b>\n' +
      '• /stats - View bot usage statistics\n' +
      '• /feedback_list - See pending user feedback\n' +
      '• /reply [ID] [message] - Reply to user feedback\n' +
      '• /broadcast - Send announcement to all users\n\n' +
      '<b>Reply format:</b>\n' +
      '/reply 5 Thanks for your feedback!';
  }
  
  await ctx.reply(helpMessage, { parse_mode: 'HTML' });
}