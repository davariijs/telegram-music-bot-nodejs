// commands/search.ts
import { Context } from 'telegraf';

export async function searchCommand(ctx: Context): Promise<void> {
  await ctx.reply('Please enter the name of the song or video you want to search for:');
}