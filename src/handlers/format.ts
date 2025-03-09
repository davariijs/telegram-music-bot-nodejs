// handlers/format.ts
import { Context, Markup } from 'telegraf';
import { CallbackQuery } from 'telegraf/types';
import { BotState, VideoFormat } from '../types';
import { downloadAndConvertAudio, downloadVideo, getVideoFormats } from '../utils/youtube';
import { sendFileAndCleanup } from '../utils/file';
import { logActivity } from '../db/users';

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

    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
        return;
      }
    
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData) return;
    
    const match = callbackData.match(/format:(audio|video)/);
    if (!match) return;
    
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Please start a new search.');
      return;
    }
    
    const session = state.sessions.get(userId);
    if (!session?.selectedVideoId) {
      await ctx.reply('Your selection has expired. Please search again.');
      return;
    }
    
    const format = match[1];
    const selectedVideoId = session.selectedVideoId;
    const selectedVideoTitle = session.selectedVideoTitle || 'Unknown Video';
    
    if (format === 'audio') {
      await handleAudioDownload(ctx, userId, selectedVideoId, selectedVideoTitle);
    } else if (format === 'video') {
      await handleVideoQualitySelection(ctx, userId, selectedVideoId, selectedVideoTitle, state);
    }
  } catch (error) {
    console.error('Error handling format selection:', error);
    try {
      await ctx.reply('Something went wrong. Please try selecting another video.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
}

async function handleAudioDownload(ctx: Context, userId: number, videoId: string, videoTitle: string): Promise<void> {
  await ctx.reply(`Processing your request...\nGetting audio for: ${videoTitle}`);
  
  try {
    const { filePath, error } = await downloadAndConvertAudio(videoId);
    
    if (error) {
      console.error('Audio download error:', error);
      await ctx.reply('This content is unavailable. Please try another video.');
      return;
    }
    
    if (filePath) {
      await sendFileAndCleanup(filePath, async (filePath) => {
        try {
          await ctx.replyWithAudio(
            { source: filePath }, 
            { 
              title: videoTitle,
              performer: 'YouTube'
            }
          );
          
          // Log successful download
          logActivity(userId, 'download_audio', videoTitle);
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
}

async function handleVideoQualitySelection(
  ctx: Context, 
  userId: number, 
  videoId: string, 
  videoTitle: string,
  state: BotState
): Promise<void> {
  await ctx.reply(`Getting available video qualities for: ${videoTitle}`);
  
  try {
    const formats = await getVideoFormats(videoId);
    
    if (!formats || formats.length === 0) {
      await ctx.reply('No video formats available. Please try another video.');
      return;
    }
    
    // Group formats by resolution for cleaner display
    const grouped: Record<string, VideoFormat> = {};
    for (const format of formats) {
      if (format.height && format.height > 0) {
        const key = `${format.height}p`;
        if (!grouped[key]) {
          grouped[key] = format;
        }
      }
    }
    
    // Sort by resolution (highest to lowest)
    const sortedFormats = Object.values(grouped).sort((a: VideoFormat, b: VideoFormat) => b.height - a.height);
    
    // Create quality selection buttons
    const qualityButtons = sortedFormats.map((format: VideoFormat) => {
      const label = `${format.height}p`;
      return [Markup.button.callback(label, `quality:${format.format_id}:${format.height}p`)];
    });
    
    // Add a button for adaptive quality
    qualityButtons.push([Markup.button.callback('Best Quality (Auto)', 'quality:best:auto')]);
    
    // Store formats in session
    const session = state.sessions.get(userId);
    if (session) {
      state.sessions.set(userId, {
        ...session,
        videoFormats: formats
      });
    }
    
    await ctx.reply('Select video quality:', Markup.inlineKeyboard(qualityButtons));
    
    // Log quality selection
    logActivity(userId, 'select_quality', videoTitle);
  } catch (formatError) {
    console.error('Error getting video formats:', formatError);
    await ctx.reply('Could not retrieve video qualities. Please try another video.');
  }
}

export async function handleQualitySelection(ctx: Context, state: BotState): Promise<void> {
  try {
    // Answer callback query immediately to prevent timeout
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    if (!ctx.callbackQuery || !isDataCallbackQuery(ctx.callbackQuery)) {
        return;
      }
    
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData) return;
    
    const match = callbackData.match(/quality:(.+):(.+)/);
    if (!match) return;
    
    const userId = ctx.from?.id;
    if (!userId) {
      await ctx.reply('Please start a new search.');
      return;
    }
    
    const session = state.sessions.get(userId);
    if (!session?.selectedVideoId) {
      await ctx.reply('Your selection has expired. Please search again.');
      return;
    }
    
    const selectedVideoId = session.selectedVideoId;
    const selectedVideoTitle = session.selectedVideoTitle || 'Unknown Video';
    const formatId = match[1];
    const qualityLabel = match[2];
    
    await ctx.reply(`Processing your request...\nDownloading ${qualityLabel} video for: ${selectedVideoTitle}`);
    
    try {
      const { filePath, error } = await downloadVideo(selectedVideoId, formatId);
      
      if (error) {
        console.error('Video download error:', error);
        await ctx.reply('This content is unavailable. Please try another video.');
        return;
      }
      
      if (filePath) {
        await ctx.reply('Download complete! Sending video...');
        await sendFileAndCleanup(filePath, async (filePath) => {
          try {
            await ctx.replyWithVideo(
              { source: filePath }, 
              { caption: `${selectedVideoTitle} (${qualityLabel})` }
            );
            
            // Log successful download
            logActivity(userId, `download_video_${qualityLabel}`, selectedVideoTitle);
          } catch (sendError) {
            console.error('Error sending video:', sendError);
            await ctx.reply('Could not send video. The file might be too large for Telegram (max 50MB).');
          }
        });
      } else {
        await ctx.reply('Could not process video. Please try another video or quality.');
      }
    } catch (videoError) {
      console.error('Video processing error:', videoError);
      await ctx.reply('Error processing video. Please try another video or quality.');
    }
    
    // Clear the selection after download to prevent reuse
    if (session) {
      state.sessions.set(userId, { 
        ...session,
        selectedVideoId: null,
        selectedVideoTitle: null,
        videoFormats: null
      });
    }
  } catch (error) {
    console.error('Error handling quality selection:', error);
    try {
      await ctx.reply('Something went wrong. Please try selecting another video.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
}