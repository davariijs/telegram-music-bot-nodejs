import { Context } from 'telegraf';
import { ADMIN_ID } from '../../config';
import { getUserStats } from '../../db/users';
import { getPendingFeedbackCount } from '../../db/feedback';
import { escapeHTML } from '../../utils/formatting';

export async function statsCommand(ctx: Context): Promise<void> {
  if (ctx.from?.id !== ADMIN_ID) return;
  
  try {
    const stats = getUserStats();
    const pendingFeedback = getPendingFeedbackCount();
    
    const { totalUsers, activeToday, activeWeek, popularSearches } = stats;
    
    let searchesText = popularSearches.length > 0 
      ? popularSearches.map(s => `"${escapeHTML(s.search_query)}" (${s.count})`).join('\n')
      : 'No searches yet';
    
    await ctx.reply(
      `📊 <b>Bot Statistics:</b>\n\n` +
      `Total Users: ${totalUsers.count}\n` +
      `Active Today: ${activeToday.count}\n` +
      `Active This Week: ${activeWeek.count}\n\n` +
      `Pending Feedback: ${pendingFeedback.count}\n\n` +
      `<b>Top Searches:</b>\n${searchesText}`,
      { parse_mode: 'HTML' }
    );
  } catch (error) {
    console.error('Error in stats command:', error);
    await ctx.reply('Error retrieving statistics');
  }
}