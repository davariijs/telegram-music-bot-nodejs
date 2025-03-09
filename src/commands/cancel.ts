// commands/cancel.ts
import { Context } from 'telegraf';
import { BotState } from '../types';

export async function cancelCommand(ctx: Context, state: BotState): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  // Clear any pending states
  state.feedbackState.delete(userId);
  state.sessions.delete(userId);
  state.broadcastState.delete(userId);
  
  await ctx.reply('Current operation canceled. You can start a new search or use other commands.');
}