import { Telegraf, Context, Markup } from 'telegraf';
import * as dotenv from 'dotenv';
import { searchYouTube, downloadAndConvertAudio, downloadVideo, getVideoFormats, sendFileAndCleanup } from './utils';
import { Message } from 'telegraf/types';
import Database from 'better-sqlite3';
import * as path from 'path';

dotenv.config();

interface VideoFormat {
  format_id: string;
  height: number;
  width?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  format_note?: string;
  ext?: string;
}

function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Initialize the bot with token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Initialize database for user tracking and feedback
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
  
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    message TEXT,
    timestamp TEXT,
    status TEXT DEFAULT 'pending',
    FOREIGN KEY (user_id) REFERENCES users (id)
  );
  
  CREATE TABLE IF NOT EXISTS feedback_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id INTEGER,
    reply TEXT,
    timestamp TEXT,
    FOREIGN KEY (feedback_id) REFERENCES feedback (id)
  );
`);

// Set your admin Telegram ID - replace with your actual ID
const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');

// Interfaces for database results
interface CountResult {
  count: number;
}

interface SearchResult {
  search_query: string;
  count: number;
}

interface FeedbackMessage {
  id: number;
  user_id: number;
  message: string;
  timestamp: string;
  status: string;
  first_name?: string;
  username?: string;
}

// Simple in-memory session storage - stores user search results and selections
const sessions = new Map();

// Feedback command state
const feedbackState = new Map();

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

// Start command handler with admin detection
bot.start((ctx) => {
  const isAdmin = ctx.from?.id === ADMIN_ID;
  
  let welcomeMessage = 'Welcome! I can help you download music and videos from YouTube.\n\n' +
    'Just send me a song name or artist to search, or use these commands:\n' +
    '/search - Search for videos\n' +
    '/feedback - Send feedback or report issues\n' +
    '/help - Show help information';
  
  // Add admin commands if the user is an admin
  if (isAdmin) {
    welcomeMessage += '\n\n' +
      '🔐 <b>Admin Commands:</b>\n' +
      '/stats - View bot statistics\n' +
      '/feedback_list - See pending feedback\n' +
      '/reply [ID] [message] - Reply to feedback\n' +
      '/broadcast - Send message to all users';
      
    ctx.reply(welcomeMessage, { parse_mode: 'HTML' });
  } else {
    ctx.reply(welcomeMessage);
  }
  
  // Log the start event
  try {
    if (ctx.from) {
      const now = new Date().toISOString();
      const logActivity = db.prepare(`
        INSERT INTO user_activity (user_id, activity_type, search_query, timestamp)
        VALUES (?, ?, ?, ?)
      `);
      logActivity.run(ctx.from.id, 'start_command', '', now);
    }
  } catch (error) {
    console.error('Error logging start command:', error);
  }
});

// Help command
bot.command('help', (ctx) => {
  const isAdmin = ctx.from?.id === ADMIN_ID;
  
  let helpMessage = '🎵 <b>YouTube Downloader Bot Help</b> 🎵\n\n' +
    '<b>User Commands:</b>\n' +
    '• Simply type any song or video name to search\n' +
    '• /search - Search for videos\n' +
    '• /feedback - Send feedback or report issues\n' +
    '• /cancel - Cancel current operation\n\n' +
    '<b>How to use:</b>\n' +
    '1. Search for a video by name\n' +
    '2. Select from search results\n' +
    '3. Choose audio or video format\n' +
    '4. For videos, select quality\n' +
    '5. Wait for download to complete\n\n' +
    'If you encounter any issues, use /feedback to report them!';
  
  if (isAdmin) {
    helpMessage += '\n\n' +
      '🔐 <b>Admin Commands:</b>\n' +
      '• /stats - View bot usage statistics\n' +
      '• /feedback_list - See pending user feedback\n' +
      '• /reply [ID] [message] - Reply to user feedback\n' +
      '• /broadcast - Send announcement to all users\n\n' +
      '<b>Reply format:</b>\n' +
      '/reply 5 Thanks for your feedback!';
  }
  
  ctx.reply(helpMessage, { parse_mode: 'HTML' });
});

// Cancel command - resets any ongoing operation
bot.command('cancel', (ctx) => {
  const userId = ctx.from?.id;
  if (userId) {
    // Clear any pending feedback state
    feedbackState.delete(userId);
    // Clear any session data
    sessions.delete(userId);
  }
  ctx.reply('Current operation canceled. You can start a new search or use other commands.');
});

// Feedback command - let users send messages to admin
bot.command('feedback', (ctx) => {
  const userId = ctx.from?.id;
  if (userId) {
    feedbackState.set(userId, 'awaiting_feedback');
    ctx.reply(
      'Please share your feedback, suggestion, or report a problem. ' +
      'Your message will be sent to the bot administrator.\n\n' +
      'Type /cancel to cancel.'
    );
  }
});


// Admin broadcast command state
const broadcastState = new Map();

// Command to broadcast a message to all users
bot.command('broadcast', async (ctx) => {
  if (ctx.from?.id === ADMIN_ID) {
    broadcastState.set(ADMIN_ID, 'awaiting_message');
    await ctx.reply(
      '📣 <b>Broadcast Message</b>\n\n' +
      'Please type the message you want to broadcast to all users.\n' +
      'The message will be sent to everyone who has used the bot.\n\n' +
      'Type /cancel to cancel the broadcast.',
      { parse_mode: 'HTML' }
    );
  }
});

// Update the text handler to handle broadcast messages
bot.on('text', async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    
    const messageText = ctx.message.text;
    
    // Skip if message starts with / (potential command)
    if (messageText.startsWith('/')) {
      // Command handling code...
      return;
    }
    
    // Check if admin is in broadcast mode
    if (userId === ADMIN_ID && broadcastState.get(ADMIN_ID) === 'awaiting_message') {
      const broadcastMessage = messageText;
      
      await ctx.reply('⏳ <b>Broadcasting message to all users...</b>', { parse_mode: 'HTML' });
      
      try {
        // Get all users
        const users = db.prepare('SELECT id FROM users').all() as { id: number }[];
        
        let sentCount = 0;
        let failedCount = 0;
        
        // Send to each user
        for (const user of users) {
          try {
            // Don't send to the admin themselves
            if (user.id !== ADMIN_ID) {
              await bot.telegram.sendMessage(
                user.id,
                `📢 <b>Announcement from Bot Admin:</b>\n\n${escapeHTML(broadcastMessage)}`,
                { parse_mode: 'HTML' }
              );
              sentCount++;
            }
            // Add a small delay to avoid hitting Telegram's rate limits
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (sendError) {
            console.error(`Failed to send broadcast to user ${user.id}:`, sendError);
            failedCount++;
          }
        }
        
        // Reset broadcast state
        broadcastState.delete(ADMIN_ID);
        
        await ctx.reply(
          `✅ <b>Broadcast Complete</b>\n\n` +
          `Message sent to ${sentCount} users\n` +
          `Failed to send to ${failedCount} users`,
          { parse_mode: 'HTML' }
        );
      } catch (dbError) {
        console.error('Error getting users for broadcast:', dbError);
        await ctx.reply('Error retrieving user list for broadcast.');
      }
      
      return;
    }
    
    // Check if user is in feedback mode
    if (feedbackState.get(userId) === 'awaiting_feedback') {
      // Feedback handling code...
      return;
    }
    
    // Handle as a search query
    // Search handling code...
  } catch (error) {
    console.error('Error handling text message:', error);
    await ctx.reply('An unexpected error occurred. Please try again.');
  }
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
        WHERE search_query != '' AND search_query NOT LIKE '/%'
        GROUP BY search_query 
        ORDER BY count DESC 
        LIMIT 5
      `).all() as SearchResult[];
      
      // Pending feedback count
      const pendingFeedback = db.prepare(`
        SELECT COUNT(*) as count FROM feedback WHERE status = 'pending'
      `).get() as CountResult;
      
      let searchesText = popularSearches.length > 0 
        ? popularSearches.map(s => `"${s.search_query}" (${s.count})`).join('\n')
        : 'No searches yet';
      
        await ctx.reply(
          `📊 <b>Bot Statistics:</b>\n\n` +
          `Total Users: ${totalUsers.count}\n` +
          `Active Today: ${activeToday.count}\n` +
          `Active This Week: ${activeWeek.count}\n\n` +
          `Pending Feedback: ${pendingFeedback.count}\n\n` +
          `<b>Top Searches:</b>\n${searchesText}`,
          { parse_mode: 'HTML' }
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

// Admin command to view pending feedback
bot.command('feedback_list', async (ctx) => {
  if (ctx.from?.id === ADMIN_ID) {
    try {
      const pendingFeedback = db.prepare(`
        SELECT f.id, f.user_id, f.message, f.timestamp, f.status, u.first_name, u.username
        FROM feedback f
        JOIN users u ON f.user_id = u.id
        WHERE f.status = 'pending'
        ORDER BY f.timestamp DESC
        LIMIT 10
      `).all() as FeedbackMessage[];
      
      if (pendingFeedback.length === 0) {
        await ctx.reply('No pending feedback messages.');
        return;
      }
      
      for (const feedback of pendingFeedback) {
        const userInfo = feedback.username 
          ? `@${feedback.username}` 
          : feedback.first_name || `User ${feedback.user_id}`;
        
          await ctx.reply(
            `📩 <b>Feedback #${feedback.id}</b>\n` +
            `From: ${userInfo} (ID: ${feedback.user_id})\n` +
            `Time: ${new Date(feedback.timestamp).toLocaleString()}\n\n` +
            `${escapeHTML(feedback.message)}\n\n` +
            `To reply, use: /reply ${feedback.id} YOUR_REPLY`,
            { parse_mode: 'HTML' }
          );
      }
    } catch (error) {
      console.error('Error retrieving feedback:', error);
      await ctx.reply('Error retrieving feedback messages');
    }
  }
});

// Admin command to reply to feedback - use regex to match the entire command
bot.hears(/^\/reply\s+(\d+)\s+(.+)$/i, async (ctx) => {
  if (ctx.from?.id === ADMIN_ID) {
    try {
      const feedbackId = parseInt(ctx.match[1]);
      const replyText = ctx.match[2];
      
      // Get the feedback message and user
      const feedback = db.prepare(`
        SELECT id, user_id, message FROM feedback WHERE id = ?
      `).get(feedbackId) as FeedbackMessage | undefined;
      
      if (!feedback) {
        await ctx.reply(`Feedback #${feedbackId} not found.`);
        return;
      }
      
      // Save the reply
      const now = new Date().toISOString();
      const insertReply = db.prepare(`
        INSERT INTO feedback_replies (feedback_id, reply, timestamp)
        VALUES (?, ?, ?)
      `);
      insertReply.run(feedbackId, replyText, now);
      
      // Update feedback status
      const updateStatus = db.prepare(`
        UPDATE feedback SET status = 'replied' WHERE id = ?
      `);
      updateStatus.run(feedbackId);
      
      // Send reply to the user
      await bot.telegram.sendMessage(
        feedback.user_id,
        `📬 <b>Reply from admin regarding your feedback:</b>\n\n` +
        `Your message: "${escapeHTML(feedback.message)}"\n\n` +
        `Admin's reply: "${escapeHTML(replyText)}"\n\n` +
        `Use /feedback to send another message if needed.`,
        { parse_mode: 'HTML' }
      );
      
      await ctx.reply(`Reply sent to user ${feedback.user_id} for feedback #${feedbackId}`);
    } catch (error) {
      console.error('Error replying to feedback:', error);
      await ctx.reply('Error sending reply. Please try again.');
    }
  }
});

// Also add a simple handler for just "/reply" to show usage
bot.command('reply', (ctx) => {
  if (ctx.from?.id === ADMIN_ID) {
    ctx.reply(
      "To reply to feedback, use the format:\n" +
      "/reply [ID] [your message]\n\n" +
      "Example: /reply 5 Thanks for your feedback!"
    );
  }
});

// Search command
bot.command('search', (ctx) => {
  ctx.reply('Please enter the name of the song or video you want to search for:');
});

// Handle text messages (search queries or feedback)
bot.on('text', async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    
    // Check if user is in feedback mode
    if (feedbackState.get(userId) === 'awaiting_feedback') {
      const feedbackText = ctx.message.text;
      
      // Store feedback in database
      try {
        const now = new Date().toISOString();
        const insertFeedback = db.prepare(`
          INSERT INTO feedback (user_id, message, timestamp)
          VALUES (?, ?, ?)
        `);
        insertFeedback.run(userId, feedbackText, now);
        
        // Notify admin if configured
        if (ADMIN_ID) {
          const userInfo = ctx.from.username 
            ? `@${ctx.from.username}` 
            : ctx.from.first_name || `User ${userId}`;
            
            await bot.telegram.sendMessage(
              ADMIN_ID,
              `📩 <b>New Feedback Received</b>\n` +
              `From: ${userInfo} (ID: ${userId})\n\n` +
              `${escapeHTML(feedbackText)}\n\n` +
              `Use /feedback_list to see all pending feedback.`,
              { parse_mode: 'HTML' }
            );
        }
        
        await ctx.reply(
          'Thank you for your feedback! The administrator will review it soon.\n' +
          'You can continue using the bot normally now.'
        );
      } catch (dbError) {
        console.error('Error saving feedback:', dbError);
        await ctx.reply('Error saving your feedback. Please try again later.');
      }
      
      // Reset feedback state
      feedbackState.delete(userId);
      return;
    }
    
    // Handle as a search query
    const message = ctx.message as Message.TextMessage;
    if (!message) return;
    
    const query = message.text;
    await ctx.reply(`Searching for "${query}"...`);

    try {
      const results = await searchYouTube(query);

      if (results.length === 0) {
        await ctx.reply('No results found. Please try a different search term.');
        return;
      }

      // Store search results in session
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
    
    if (format === 'audio') {
      // For audio, directly start download
      await ctx.reply(`Processing your request...\nGetting audio for: ${selectedVideoTitle}`);
      
      try {
        const { filePath, error } = await downloadAndConvertAudio(selectedVideoId);
        
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
      // For video, get available qualities first
      await ctx.reply(`Getting available video qualities for: ${selectedVideoTitle}`);
      
      try {
        const formats = await getVideoFormats(selectedVideoId);
        
        if (!formats || formats.length === 0) {
          await ctx.reply('No video formats available. Please try another video.');
          return;
        }
        
        // Group formats by resolution for cleaner display
        const grouped: Record<string, VideoFormat> = {};
        for (const format of formats as VideoFormat[]) {
          if (format.height && format.height > 0) {
            const key = `${format.height}p`;
            if (!grouped[key]) {
              grouped[key] = format;
            }
          }
        }
        
        // Sort by resolution (highest to lowest)
        const sortedFormats = Object.values(grouped).sort((a, b) => b.height - a.height);
        
        // Create quality selection buttons
        const qualityButtons = sortedFormats.map(format => {
          const label = `${format.height}p`;
          return [Markup.button.callback(label, `quality:${format.format_id}:${format.height}p`)];
        });
        
        // Add a button for adaptive quality
        qualityButtons.push([Markup.button.callback('Best Quality (Auto)', 'quality:best:auto')]);
        
        // Store formats in session
        sessions.set(userId, {
          ...session,
          videoFormats: formats
        });
        
        await ctx.reply('Select video quality:', Markup.inlineKeyboard(qualityButtons));
      } catch (formatError) {
        console.error('Error getting video formats:', formatError);
        await ctx.reply('Could not retrieve video qualities. Please try another video.');
      }
    }
    
  } catch (error) {
    console.error('Error handling format selection:', error);
    try {
      await ctx.reply('Something went wrong. Please try selecting another video.');
    } catch (replyError) {
      console.error('Error sending message:', replyError);
    }
  }
});

// Handle quality selection
bot.action(/quality:(.+):(.+)/, async (ctx) => {
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
    
    const { selectedVideoId, selectedVideoTitle } = session;
    const formatId = ctx.match[1];
    const qualityLabel = ctx.match[2];
    
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
            
            // Log successful download in database
            if (userId) {
              try {
                const now = new Date().toISOString();
                const logDownload = db.prepare(`
                  INSERT INTO user_activity (user_id, activity_type, search_query, timestamp)
                  VALUES (?, ?, ?, ?)
                `);
                logDownload.run(userId, `download_video_${qualityLabel}`, selectedVideoTitle, now);
              } catch (dbError) {
                console.error('Error logging download:', dbError);
              }
            }
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
    sessions.set(userId, { 
      ...session,
      selectedVideoId: null,
      selectedVideoTitle: null,
      videoFormats: null
    });
    
  } catch (error) {
    console.error('Error handling quality selection:', error);
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
  console.log('Bot is running with user tracking and feedback system enabled!');
}).catch(err => {
  console.error('Failed to start bot:', err);
});