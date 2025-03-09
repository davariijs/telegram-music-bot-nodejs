import { Telegraf, Context, Markup } from 'telegraf';
import * as dotenv from 'dotenv';
import { searchYouTube, downloadAndConvertAudio, downloadVideo, sendFileAndCleanup } from './utils';
import { Message } from 'telegraf/types';
import Database from 'better-sqlite3';
import * as path from 'path';

dotenv.config();


interface CountResult {
  count: number;
}

interface SearchResult {
  search_query: string;
  count: number;
}
// Initialize the bot with token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Initialize database for user tracking
const dbPath = path.join(__dirname, '..', 'bot_stats.db');
const db = new Database(dbPath);

// Create database tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    first_name TEXT,
    username TEXT,
    joined_date TEXT,
    last_active TEXT
  );
  
  CREATE TABLE IF NOT EXISTS user_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    activity_type TEXT,
    search_query TEXT,
    timestamp TEXT,
    FOREIGN KEY (user_id) REFERENCES users (id)
  );
`);

// Set your admin Telegram ID - replace with your actual ID
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

// Simple in-memory session storage - stores user search results and selections
const sessions = new Map();

// Middleware to track users
bot.use((ctx, next) => {
  if (ctx.from) {
    const now = new Date().toISOString();
    const { id, first_name, username } = ctx.from;
    
    try {
      // Try to insert new user (will be ignored if user already exists)
      const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (id, first_name, username, joined_date, last_active)
        VALUES (?, ?, ?, ?, ?)
      `);
      insertUser.run(id, first_name || '', username || '', now, now);
      
      // Update last active timestamp
      const updateActivity = db.prepare(`
        UPDATE users SET last_active = ? WHERE id = ?
      `);
      updateActivity.run(now, id);
      
      // Log activity type
      const activityType = ctx.updateType || 'unknown';
      
      // Get search query if this is a text message
      let searchQuery = '';
      if (ctx.message && 'text' in ctx.message) {
        searchQuery = ctx.message.text;
      }
      
      // Log activity
      const logActivity = db.prepare(`
        INSERT INTO user_activity (user_id, activity_type, search_query, timestamp)
        VALUES (?, ?, ?, ?)
      `);
      logActivity.run(id, activityType, searchQuery, now);
    } catch (error) {
      console.error('Database error:', error);
    }
  }
  return next();
});

// Admin command for stats
bot.command('stats', async (ctx) => {
  if (ctx.from?.id === ADMIN_ID) {
    try {
      // Total users
      const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as CountResult;
      
      // Active users in last 24 hours
      const activeToday = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count FROM user_activity 
        WHERE timestamp > datetime('now', '-1 day')
      `).get() as CountResult;
      
      // Active users in last week
      const activeWeek = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count FROM user_activity 
        WHERE timestamp > datetime('now', '-7 day')
      `).get() as CountResult;
      
      // Most popular searches
      const popularSearches = db.prepare(`
        SELECT search_query, COUNT(*) as count 
        FROM user_activity 
        WHERE search_query != '' 
        GROUP BY search_query 
        ORDER BY count DESC 
        LIMIT 5
      `).all() as SearchResult[];
      
      let searchesText = popularSearches.length > 0 
        ? popularSearches.map(s => `"${s.search_query}" (${s.count})`).join('\n')
        : 'No searches yet';
      
      await ctx.reply(
        `📊 Bot Statistics:\n\n` +
        `Total Users: ${totalUsers.count}\n` +
        `Active Today: ${activeToday.count}\n` +
        `Active This Week: ${activeWeek.count}\n\n` +
        `Top Searches:\n${searchesText}`
      );
    } catch (error) {
      console.error('Error getting stats:', error);
      await ctx.reply('Error retrieving statistics');
    }
  } else {
    // Optional: Reply with a message if non-admin tries to access stats
    console.log(`Non-admin user ${ctx.from?.id} tried to access stats`);
  }
});

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
              
              // Log successful download in database
              if (userId) {
                try {
                  const now = new Date().toISOString();
                  const logDownload = db.prepare(`
                    INSERT INTO user_activity (user_id, activity_type, search_query, timestamp)
                    VALUES (?, ?, ?, ?)
                  `);
                  logDownload.run(userId, 'download_audio', selectedVideoTitle, now);
                } catch (dbError) {
                  console.error('Error logging download:', dbError);
                }
              }
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
              
              // Log successful download in database
              if (userId) {
                try {
                  const now = new Date().toISOString();
                  const logDownload = db.prepare(`
                    INSERT INTO user_activity (user_id, activity_type, search_query, timestamp)
                    VALUES (?, ?, ?, ?)
                  `);
                  logDownload.run(userId, 'download_video', selectedVideoTitle, now);
                } catch (dbError) {
                  console.error('Error logging download:', dbError);
                }
              }
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

// Graceful shutdown - close database connection
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  if (db) db.close();
  console.log('Bot stopped and database connection closed');
});

process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  if (db) db.close();
  console.log('Bot stopped and database connection closed');
});

// Launch the bot
bot.launch().then(() => {
  console.log('Bot is running with user tracking enabled!');
}).catch(err => {
  console.error('Failed to start bot:', err);
});