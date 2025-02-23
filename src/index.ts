import { Telegraf, Context } from 'telegraf';
import * as dotenv from 'dotenv';
import { searchYouTube, downloadAndConvert } from './utils';
import { Message } from 'telegraf/types';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

bot.start((ctx: Context) => {
  ctx.reply('Welcome! Send me a song name or artist to get the audio.');
});

bot.on('text', async (ctx: Context) => {
    const message = ctx.message as Message.TextMessage;
  if (message) {
    const query = message.text;
    ctx.reply(`Searching for "${query}"...`);

    try {
      const results = await searchYouTube(query);

      if (results.length === 0) {
        ctx.reply('No results found.');
        return;
      }

      const videoId = results[0].id; // Use the first result
      const videoTitle = results[0].title;

      ctx.reply(`Downloading and converting: ${videoTitle}`);

      const { filePath, error } = await downloadAndConvert(videoId);

      if (error) {
        console.error('Download error:', error);
        ctx.reply(`Error downloading or converting the audio: ${error.message}`);
        return;
      }

      if (filePath) {
          try {
            await ctx.replyWithAudio({ source: filePath }, { title: videoTitle });
          } catch (sendError: any) {
            console.error('Error sending audio:', sendError);
            ctx.reply('Error sending the audio file. The file might be too large, or there was a network issue.');
          }
      }


    } catch (searchError: any) {
      console.error('Search error:', searchError);
      ctx.reply(`Error searching YouTube: ${searchError.message}`);
    }
  }
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('Bot started!');