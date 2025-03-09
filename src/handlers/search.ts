// handlers/search.ts
import { Context, Markup } from 'telegraf';
import { CallbackQuery } from 'telegraf/types';
import { BotState, SearchResultItem } from '../types';
import { searchYouTube } from '../utils/youtube';
import { logActivity } from '../db/users';

// Type guard to check if CallbackQuery has data property
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