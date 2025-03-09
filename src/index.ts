import { Telegraf, Context, Markup } from 'telegraf';
import * as dotenv from 'dotenv';
import { searchYouTube, downloadAndConvertAudio, downloadVideo, sendFileAndCleanup } from './utils';
import { Message } from 'telegraf/types';

dotenv.config();

// Initialize the bot with token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Simple in-memory session storage - stores user search results and selections
const sessions = new Map();

// Start command handler
bot.start((ctx) => {
  ctx.reply('Welcome! Send me a song name or artist to search for audio or video content.');
});

// Handle text messages (search queries)
bot.on('text', async (ctx) => {
  try {
    const message = ctx.message as Message.TextMessage;
    if (!message) return;
    
    const query = message.text;
    const statusMessage = await ctx.reply(`Searching for "${query}"...`);

    try {
      const results = await searchYouTube(query);

      if (results.length === 0) {
        await ctx.reply('No results found. Please try a different search term.');
        return;
      }

      // Store search results in session
      const userId = ctx.from.id;
      sessions.set(userId, { 
        searchResults: results.slice(0, 10),
        lastSearchQuery: query
      });

      // Create an inline keyboard with search results
      const buttons = results.slice(0, 10).map((result, index) => {
        // Trim title if too long for display
        const displayTitle = result.title.length > 40 ? 
          `${result.title.substring(0, 37)}...` : result.title;
        return [Markup.button.callback(`${index + 1}. ${displayTitle}`, `select:${index}`)];
      });

      await ctx.reply('Please select a video from these search results:', 
        Markup.inlineKeyboard(buttons));
      
    } catch (searchError) {
      console.error('Search error:', searchError);
      await ctx.reply('Unable to search YouTube at the moment. Please try again later.');
    }
  } catch (error) {
    console.error('Error handling text message:', error);
    await ctx.reply('An unexpected error occurred. Please try again.');
  }
});

// Handle selection of a video
bot.action(/select:(\d+)/, async (ctx) => {
  try {
    // Answer callback query immediately to prevent timeout
    await ctx.answerCbQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Please start a new search.');
      return;
    }
    
    const session = sessions.get(userId);
    if (!session?.searchResults) {
      await ctx.reply('Your search session has expired. Please search again.');
      return;
    }
    
    const index = parseInt(ctx.match[1]);
    if (isNaN(index) || index < 0 || index >= session.searchResults.length) {
      await ctx.reply('Invalid selection. Please try again.');
      return;
    }
    
    const selected = session.searchResults[index];
    
    // Update session with selected video
    sessions.set(userId, {
      ...session,
      selectedVideoId: selected.id,
      selectedVideoTitle: selected.title
    });
    
    // Ask user to choose format
    await ctx.editMessageText(
      `You selected: ${selected.title}\nChoose format:`,
      Markup.inlineKeyboard([
        Markup.button.callback('Audio (MP3)', 'format:audio'),
        Markup.button.callback('Video (MP4)', 'format:video')
      ])
    );
  } catch (error) {
    console.error('Error handling video selection:', error);
    try {
      await ctx.reply('Please try selecting another video.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
});

// Handle format selection
bot.action(/format:(audio|video)/, async (ctx) => {
  try {
    // Answer callback query immediately to prevent timeout
    await ctx.answerCbQuery();
    
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Please start a new search.');
      return;
    }
    
    const session = sessions.get(userId);
    if (!session?.selectedVideoId) {
      await ctx.reply('Your selection has expired. Please search again.');
      return;
    }
    
    const format = ctx.match[1];
    const { selectedVideoId, selectedVideoTitle } = session;
    
    // Let user know processing has started
    const processingMsg = await ctx.reply(`Processing your request...\nGetting ${format} for: ${selectedVideoTitle}`);
    
    if (format === 'audio') {
      try {
        const { filePath, error } = await downloadAndConvertAudio(selectedVideoId);
        
        if (error) {
          console.error('Audio download error:', error);
          
          // Don't show technical error to user, just a friendly message
          await ctx.reply('This content is unavailable. Please try another video.');
          return;
        }
        
        if (filePath) {
          await sendFileAndCleanup(filePath, async (filePath) => {
            try {
              await ctx.replyWithAudio(
                { source: filePath }, 
                { 
                  title: selectedVideoTitle,
                  performer: 'YouTube'
                }
              );
            } catch (sendError) {
              console.error('Error sending audio:', sendError);
              await ctx.reply('Could not send audio. The file might be too large.');
            }
          });
        } else {
          await ctx.reply('Could not process audio. Please try another video.');
        }
      } catch (audioError) {
        console.error('Audio processing error:', audioError);
        await ctx.reply('This content is unavailable. Please try another video.');
      }
    } else if (format === 'video') {
      try {
        const { filePath, error } = await downloadVideo(selectedVideoId);
        
        if (error) {
          console.error('Video download error:', error);
          
          // Don't show technical error to user, just a friendly message
          await ctx.reply('This content is unavailable. Please try another video.');
          return;
        }
        
        if (filePath) {
          await sendFileAndCleanup(filePath, async (filePath) => {
            try {
              await ctx.replyWithVideo(
                { source: filePath }, 
                { caption: selectedVideoTitle }
              );
            } catch (sendError) {
              console.error('Error sending video:', sendError);
              await ctx.reply('Could not send video. The file might be too large.');
            }
          });
        } else {
          await ctx.reply('Could not process video. Please try another video.');
        }
      } catch (videoError) {
        console.error('Video processing error:', videoError);
        await ctx.reply('This content is unavailable. Please try another video.');
      }
    } else {
      await ctx.reply('Invalid format selected. Please try again.');
    }
    
    // Clear the selection after download to prevent reuse
    sessions.set(userId, { 
      ...session,
      selectedVideoId: null,
      selectedVideoTitle: null 
    });
    
  } catch (error) {
    console.error('Error handling format selection:', error);
    try {
      await ctx.reply('Something went wrong. Please try selecting another video.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
});

// Handle errors
bot.catch((err, ctx) => {
  console.error('Telegram bot error:', err);
  ctx.reply('Something went wrong. Please try again later.');
});

// Launch the bot
bot.launch().then(() => {
  console.log('Bot is running!');
}).catch(err => {
  console.error('Failed to start bot:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));