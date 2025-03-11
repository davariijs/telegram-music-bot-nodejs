import { Context, Markup } from 'telegraf';
import { CallbackQuery } from 'telegraf/types';
import { BotState, SearchResultItem, DownloadResult } from '../types';
import { searchYouTube, downloadAndConvertAudio, downloadVideo } from '../utils/youtube';
import { logActivity } from '../db/users';
import { sendFileAndCleanup } from '../utils/file';
import * as fs from 'fs';

function isDataCallbackQuery(query: CallbackQuery): query is CallbackQuery.DataQuery {
  return 'data' in query;
}

export async function handleSearch(ctx: Context, query: string, state: BotState): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  await ctx.reply(`Searching for "${query}"...`);

  try {
    const results = await searchYouTube(query);

    if (results.length === 0) {
      await ctx.reply('No results found. Please try a different search term.');
      return;
    }

    // Store search results in session
    state.sessions.set(userId, { 
      searchResults: results.slice(0, 10),
      lastSearchQuery: query
    });

    // Create an inline keyboard with search results
    const buttons = results.slice(0, 10).map((result: SearchResultItem, index: number) => {
      // Trim title if too long for display
      const displayTitle = result.title.length > 40 ? 
        `${result.title.substring(0, 37)}...` : result.title;
      return [Markup.button.callback(`${index + 1}. ${displayTitle}`, `select:${index}`)];
    });

    await ctx.reply('Please select a video from these search results:', 
      Markup.inlineKeyboard(buttons));
    
    // Log search activity
    logActivity(userId, 'search', query);
  } catch (searchError) {
    console.error('Search error:', searchError);
    await ctx.reply('Unable to search YouTube at the moment. Please try again later.');
  }
}

export async function handleVideoSelection(ctx: Context, state: BotState): Promise<void> {
  try {
    // Answer callback query immediately to prevent timeout
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    
    // Check if callback query has data
    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
      return;
    }
    
    const callbackData = ctx.callbackQuery.data;
    const match = callbackData.match(/select:(\d+)/);
    if (!match) return;
    
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Please start a new search.');
      return;
    }
    
    const session = state.sessions.get(userId);
    if (!session?.searchResults) {
      await ctx.reply('Your search session has expired. Please search again.');
      return;
    }
    
    const index = parseInt(match[1]);
    if (isNaN(index) || index < 0 || index >= session.searchResults.length) {
      await ctx.reply('Invalid selection. Please try again.');
      return;
    }
    
    const selected = session.searchResults[index];
    
    // Update session with selected video
    state.sessions.set(userId, {
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
    
    // Log selection activity
    logActivity(userId, 'select_video', selected.title);
  } catch (error) {
    console.error('Error handling video selection:', error);
    try {
      await ctx.reply('Please try selecting another video.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
}

// Add this new handler for format selection

export async function handleFormatSelection(ctx: Context, state: BotState): Promise<void> {
  try {
    // Answer callback query immediately to prevent timeout
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
    
    // Check if callback query has data
    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
      return;
    }
    
    const callbackData = ctx.callbackQuery.data;
    const match = callbackData.match(/format:(\w+)/);
    if (!match) return;
    
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Please start a new search.');
      return;
    }
    
    // Check if chat exists
    if (!ctx.chat) {
      console.error('Chat context is missing');
      return;
    }
    
    const session = state.sessions.get(userId);
    if (!session?.selectedVideoId) {
      await ctx.reply('Your selection has expired. Please search again.');
      return;
    }
    
    const format = match[1]; // 'audio' or 'video'
    const videoId = session.selectedVideoId;
    const videoTitle = session.selectedVideoTitle || 'Selected video';
    
    // Show initial status message
    const statusMessage = await ctx.reply(`⏳ Preparing to download ${format}...`);
    
    // Start a progress update interval
    let dots = 0;
    const progressInterval = setInterval(async () => {
      dots = (dots + 1) % 4;
      const loadingText = `⏳ Downloading ${format}` + '.'.repeat(dots);
      try {
        // Check if chat exists before using it
        if (ctx.chat) {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            loadingText
          );
        }
      } catch (e) {
        // Ignore edit conflicts
      }
    }, 3000);
    
    try {
      let result: DownloadResult;
      
      if (format === 'audio') {
        // Update status
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          undefined,
          '⏳ Downloading and converting to audio...'
        );
        
        // Download audio
        result = await downloadAndConvertAudio(videoId);
        
        // Check for error
        if (result.error) {
          clearInterval(progressInterval);
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            '❌ Error downloading audio: ' + result.error.message
          );
          return;
        }
        
        // Update status
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          undefined,
          '✅ Audio ready! Sending...'
        );
        
        // Send the audio file
        if (result.filePath && fs.existsSync(result.filePath)) {
          await ctx.replyWithAudio({ 
            source: result.filePath,
            filename: `${videoTitle}.mp3`
          }, {
            caption: `🎵 ${videoTitle}`
          });
          
          // Delete status message after successful send
          await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
          
          // Clean up the file
          await sendFileAndCleanup(result.filePath, async () => {
            // File is already sent, this is just for cleanup
          });
        } else {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            '❌ Error: Audio file not found.'
          );
        }
      } else if (format === 'video') {
        // Update status
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          undefined,
          '⏳ Downloading video...'
        );
        
        // Download video
        result = await downloadVideo(videoId);
        
        // Check for error
        if (result.error) {
          clearInterval(progressInterval);
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            '❌ Error downloading video: ' + result.error.message
          );
          return;
        }
        
        // Update status
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          undefined,
          '✅ Video ready! Sending...'
        );
        
        // Send the video file
        if (result.filePath && fs.existsSync(result.filePath)) {
          await ctx.replyWithVideo({ 
            source: result.filePath,
            filename: `${videoTitle}.mp4`
          }, {
            caption: `🎬 ${videoTitle}`
          });
          
          // Delete status message after successful send
          await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
          
          // Clean up the file
          await sendFileAndCleanup(result.filePath, async () => {
            // File is already sent, this is just for cleanup
          });
        } else {
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMessage.message_id,
            undefined,
            '❌ Error: Video file not found.'
          );
        }
      }
    } catch (downloadError) {
      console.error('Download error:', downloadError);
      if (ctx.chat) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          undefined,
          '❌ Download failed. Please try again later or try another video.'
        );
      }
    } finally {
      // Make sure to clear the interval regardless of outcome
      clearInterval(progressInterval);
    }
    
    // Log activity
    logActivity(userId, `download_${format}`, videoTitle);
  } catch (error) {
    console.error('Error handling format selection:', error);
    try {
      await ctx.reply('An error occurred. Please try again.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
}