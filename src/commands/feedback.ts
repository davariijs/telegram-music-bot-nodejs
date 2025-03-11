import { Context } from 'telegraf';
import { BotState } from '../types';

export async function feedbackCommand(ctx: Context, state: BotState): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  state.feedbackState.set(userId, 'awaiting_feedback');
  await ctx.reply(
    'Please share your feedback, suggestion, or report a problem. ' +
    'Your message will be sent to the bot administrator.\n\n' +
    'Type /cancel to cancel.'
  );
}