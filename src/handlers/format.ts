import { Context, Markup } from 'telegraf';
import { CallbackQuery } from 'telegraf/types';
import { BotState, DownloadResult, VideoFormat } from '../types';
import { downloadAndConvertAudio, downloadVideo, getVideoFormats , getFileSizeInMB} from '../utils/youtube';
import { logActivity } from '../db/users';
import { sendFileAndCleanup } from '../utils/file';
import * as fs from 'fs';

// Type guard to check if CallbackQuery has data property
function isDataCallbackQuery(query: CallbackQuery): query is CallbackQuery.DataQuery {
  return 'data' in query;
}

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
    
    if (format === 'audio') {
      // Show initial status message
      const statusMessage = await ctx.reply(`⏳ Preparing to download audio...`);
      
      // Start a progress update interval
      let dots = 0;
      const progressInterval = setInterval(async () => {
        dots = (dots + 1) % 4;
        const loadingText = `⏳ Downloading audio` + '.'.repeat(dots);
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
        // Update status
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          statusMessage.message_id,
          undefined,
          '⏳ Downloading and converting to audio...'
        );
        
        // Download audio
        const result = await downloadAndConvertAudio(videoId);
        
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
        // Send the audio file
if (result.filePath && fs.existsSync(result.filePath)) {
  const fileSizeMB = getFileSizeInMB(result.filePath);
  
  // Update status with file size info
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    statusMessage.message_id,
    undefined,
    `✅ Audio ready! Sending... (${fileSizeMB.toFixed(1)}MB)`
  );
  
  // For very large files, warn the user it might take time
  if (fileSizeMB > 20) {
    await ctx.telegram.sendMessage(
      ctx.chat.id,
      `⚠️ This is a large file (${fileSizeMB.toFixed(1)}MB). It may take some time to upload.`
    );
  }
  
  try {
    // Use a longer timeout for sending large files
    await ctx.telegram.sendAudio(
      ctx.chat.id,
      { source: result.filePath },
      { caption: `🎵 ${videoTitle}` }
    );
    
    // Delete status message after successful send
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id);
  } catch (sendError: any) {
    console.error('Error sending audio:', sendError);
    
    if (sendError.message && sendError.message.includes('413')) {
      // Handle "Request Entity Too Large" error
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        undefined,
        `❌ Error: File is too large for Telegram (${fileSizeMB.toFixed(1)}MB). Telegram has a 50MB limit.`
      );
    } else if (sendError.message && sendError.message.includes('timeout')) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        undefined,
        `❌ Timeout while uploading. The file (${fileSizeMB.toFixed(1)}MB) may be too large.`
      );
    } else {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        statusMessage.message_id,
        undefined,
        '❌ Error sending audio: ' + sendError.message
      );
    }
  }
  
  // Clean up the file regardless of whether sending succeeded
  await sendFileAndCleanup(result.filePath, async () => {
    // File is already sent or failed to send, this is just for cleanup
  });
} else {
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    statusMessage.message_id,
    undefined,
    '❌ Error: Audio file not found.'
  );
}
        
        // Log activity
        logActivity(userId, `download_audio`, videoTitle);
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
    } else if (format === 'video') {
      // For video format, show quality options
      await ctx.editMessageText('⏳ Loading available video qualities...');
      
      try {
        // Get available video formats
        const formats = await getVideoFormats(videoId);
        
        // Store formats in session
        state.sessions.set(userId, {
          ...session,
          videoFormats: formats
        });
        
        if (formats.length === 0) {
          await ctx.editMessageText('❌ No video formats found. Please try another video.');
          return;
        }
        
        // Group formats by resolution (height)
        const resolutionGroups = new Map<number, VideoFormat[]>();
        
        formats.forEach(format => {
          if (!resolutionGroups.has(format.height)) {
            resolutionGroups.set(format.height, []);
          }
          resolutionGroups.get(format.height)?.push(format);
        });
        
        // Sort resolutions in descending order
        const sortedResolutions = Array.from(resolutionGroups.keys()).sort((a, b) => b - a);
        
        // Create quality selection buttons
        const qualityButtons = sortedResolutions.map(resolution => {
          // Get the best format for this resolution (usually the one with smallest filesize)
          const formatsForResolution = resolutionGroups.get(resolution) || [];
          const bestFormat = formatsForResolution.sort((a, b) => 
            (a.filesize || Infinity) - (b.filesize || Infinity)
          )[0];
          
          const label = `${resolution}p ${bestFormat.format_note || ''}`.trim();
          return [Markup.button.callback(label, `quality:video:${bestFormat.format_id}`)];
        });
        
        // Add a "Best Quality" option at the top
        qualityButtons.unshift([Markup.button.callback('🔝 Best Quality', 'quality:video:best')]);
        
        await ctx.editMessageText(
          `Select video quality for: ${videoTitle}`,
          Markup.inlineKeyboard(qualityButtons)
        );
        
        // Log activity
        logActivity(userId, 'select_video_quality', videoTitle);
      } catch (error) {
        console.error('Error getting video formats:', error);
        await ctx.editMessageText('❌ Error loading video qualities. Please try again.');
      }
    }
  } catch (error) {
    console.error('Error handling format selection:', error);
    try {
      await ctx.reply('An error occurred. Please try again.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
}

export async function handleQualitySelection(ctx: Context, state: BotState): Promise<void> {
  try {
    // Check for callback query first
    if (!ctx.callbackQuery) {
      console.error('No callback query in context');
      return;
    }
    
    // Answer callback query immediately to prevent timeout
    await ctx.answerCbQuery();
    
    // Check if callback query has data
    if (!isDataCallbackQuery(ctx.callbackQuery)) {
      console.error('Callback query has no data');
      return;
    }
    
    const callbackData = ctx.callbackQuery.data;
    const match = callbackData.match(/quality:(\w+):(.+)/);
    if (!match) {
      console.error('Invalid quality callback data format');
      return;
    }
    
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Please start a new search.');
      return;
    }
    
    // Check if chat and message exist
    if (!ctx.chat || !ctx.callbackQuery.message) {
      console.error('Chat or message context is missing');
      if (ctx.from) {
        // Try to send a direct message to the user if we have their ID
        await ctx.telegram.sendMessage(userId, 'Error processing your request. Please try again.');
      }
      return;
    }
    
    const chatId = ctx.chat.id;
    const messageId = ctx.callbackQuery.message.message_id;
    
    const session = state.sessions.get(userId);
    if (!session?.selectedVideoId) {
      await ctx.telegram.sendMessage(chatId, 'Your selection has expired. Please search again.');
      return;
    }
    
    const format = match[1]; // 'video'
    const formatId = match[2]; // format_id or 'best'
    const videoId = session.selectedVideoId;
    const videoTitle = session.selectedVideoTitle || 'Selected video';
    
    // Show initial status message
    await ctx.telegram.editMessageText(
      chatId,
      messageId,
      undefined,
      `⏳ Preparing to download video...`
    );
    
    // Start a progress update interval
    let dots = 0;
    const progressInterval = setInterval(async () => {
      dots = (dots + 1) % 4;
      const loadingText = `⏳ Downloading video` + '.'.repeat(dots);
      try {
        await ctx.telegram.editMessageText(
          chatId,
          messageId,
          undefined,
          loadingText
        );
      } catch (e) {
        // Ignore edit conflicts
      }
    }, 3000);
    
    try {
      // Download video with the selected format
      const result = await downloadVideo(videoId, formatId);
      
      // Check for error
      if (result.error) {
        clearInterval(progressInterval);
        await ctx.telegram.editMessageText(
          chatId,
          messageId,
          undefined,
          '❌ Error downloading video: ' + result.error.message
        );
        return;
      }
      
      // Update status
      await ctx.telegram.editMessageText(
        chatId,
        messageId,
        undefined,
        '✅ Video ready! Sending...'
      );
      
      // Send the video file
      if (result.filePath && fs.existsSync(result.filePath)) {
        // Correct way to send video with InputFile
        await ctx.telegram.sendVideo(
          chatId,
          { source: result.filePath }, // InputFile format
          { 
            caption: `🎬 ${videoTitle}`
            // Note: filename is not a valid option for sendVideo extras
          }
        );
        
        // Update the message after sending
        await ctx.telegram.editMessageText(
          chatId,
          messageId,
          undefined,
          '✅ Video sent successfully!'
        );
        
        // Clean up the file
        await sendFileAndCleanup(result.filePath, async () => {
          // File is already sent, this is just for cleanup
        });
      } else {
        await ctx.telegram.editMessageText(
          chatId,
          messageId,
          undefined,
          '❌ Error: Video file not found.'
        );
      }
      
      // Log activity
      logActivity(userId, `download_video_${formatId}`, videoTitle);
    } catch (downloadError) {
      console.error('Download error:', downloadError);
      try {
        await ctx.telegram.editMessageText(
          chatId,
          messageId,
          undefined,
          '❌ Download failed. Please try again later or try another video.'
        );
      } catch (editError) {
        console.error('Error updating status message:', editError);
      }
    } finally {
      // Make sure to clear the interval regardless of outcome
      clearInterval(progressInterval);
    }
  } catch (error) {
    console.error('Error handling quality selection:', error);
    try {
      // Try to send a message if we have context
      if (ctx.chat) {
        await ctx.telegram.sendMessage(ctx.chat.id, 'An error occurred. Please try again.');
      } else if (ctx.from) {
        await ctx.telegram.sendMessage(ctx.from.id, 'An error occurred. Please try again.');
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}