import { Telegraf } from 'telegraf';
import { BOT_TOKEN } from './config';
import { BotState } from './types';
import { db } from './db';
import { trackUser, logActivity } from './db/users';

// commands
import { 
  startCommand, 
  helpCommand, 
  searchCommand,
  feedbackCommand,
  cancelCommand
} from './commands';

// admin commands
import { 
  statsCommand, 
  feedbackListCommand,
  setupReplyCommand,
  broadcastCommand
} from './commands';

// handlers
import { 
  handleSearch, 
  handleVideoSelection,
  handleFormatSelection, 
  handleQualitySelection,
  handleFeedbackMessage
} from './handlers';

// admin handlers
import { handleBroadcastMessage } from './commands/admin/broadcast';

// Initialize the bot
const bot = new Telegraf(BOT_TOKEN, {
  // Set handlerTimeout to 30 minutes (plenty of time for large uploads)
  handlerTimeout: 1800000,
  
  telegram: {
    // API request timeout (different from handler timeout)
    timeout: 600000 // 10 minutes
  }
} as any);

// Initialize global state
const state: BotState = {
  sessions: new Map(),
  feedbackState: new Map(),
  broadcastState: new Map()
};

// Middleware to track users
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const { id, first_name, username } = ctx.from;
    trackUser(id, first_name || '', username || '');
    
    // Log activity for commands is handled separately
    if (ctx.message && 'text' in ctx.message && !ctx.message.text.startsWith('/')) {
      logActivity(id, ctx.updateType || 'unknown', ctx.message.text);
    }
  }
  return next();
});

// Register regular commands
bot.start(ctx => startCommand(ctx));
bot.help(ctx => helpCommand(ctx));
bot.command('search', ctx => searchCommand(ctx));
bot.command('feedback', ctx => feedbackCommand(ctx, state));
bot.command('cancel', ctx => cancelCommand(ctx, state));

// Register admin commands
bot.command('stats', ctx => statsCommand(ctx));
bot.command('feedback_list', ctx => feedbackListCommand(ctx));
bot.command('broadcast', ctx => broadcastCommand(ctx, state));

// Setup reply command with regex pattern
setupReplyCommand(bot);

// Handle callback queries
bot.action(/select:\d+/, ctx => handleVideoSelection(ctx, state));
bot.action(/format:(audio|video)/, ctx => handleFormatSelection(ctx, state));
bot.action(/quality:.+:.+/, ctx => handleQualitySelection(ctx, state));

// Handle text messages (searches, feedback, broadcast)
bot.on('text', async (ctx) => {
  try {
    const userId = ctx.from?.id;
    if (!userId) return;
    
    const messageText = ctx.message.text;
    
    // Skip processing commands as searches
    if (messageText.startsWith('/')) {
      return;
    }
    
    // Check if admin is in broadcast mode
    if (userId === parseInt(process.env.ADMIN_ID || '0') && state.broadcastState.get(userId) === 'awaiting_message') {
      await handleBroadcastMessage(ctx, state, bot);
      return;
    }
    
    // Check if user is in feedback mode
    if (await handleFeedbackMessage(ctx, state, bot)) {
      return;
    }
    
    // Handle as a search query
    await handleSearch(ctx, messageText, state);
  } catch (error) {
    console.error('Error handling text message:', error);
    await ctx.reply('An unexpected error occurred. Please try again.');
  }
});

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('Something went wrong. Please try again later.');
});

// Launch the bot
bot.launch()
  .then(() => console.log('Bot started successfully!'))
  .catch(err => console.error('Failed to start bot:', err));


import * as http from 'http';
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running!');
});
server.listen(3000, () => {
  console.log('Keep-alive server running on port 3000');
});

// Graceful shutdown
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  db.close();
  console.log('Bot stopped and database connection closed');
});