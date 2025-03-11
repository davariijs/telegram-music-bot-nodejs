# 🎵 Telegram Music Bot 🎧

A Telegram bot built with Node.js and TypeScript that allows users to search for and download music and videos from YouTube.

---

## ✨ Features

- 🔍 Search for YouTube videos by name
- ⬇️ Download media in either audio or video format
- 🎬 Select video quality for downloads
- 💬 User feedback system
- 📊 Admin statistics and broadcast functionality
- 📝 Activity tracking and user management

---

## 📋 Prerequisites

- 📌 Node.js v22.14.0 or higher
- 📌 npm or yarn
- 📌 Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- 📌 ffmpeg installed on your system (handled by @ffmpeg-installer/ffmpeg)
- 📌 YouTube cookies file (for authenticated access)

---

## 🚀 Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/davariijs/telegram-music-bot-nodejs.git
   cd telegram-music-bot-nodejs
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create environment file:**
   ```bash
   cp env.example.txt .env
   ```

4. **Configure your `.env` file** with your Telegram Bot Token and Admin ID.

5. **Add YouTube cookies file** (see cookies section below)

6. **Build and start the bot:**
   ```bash
   npm run build
   npm start
   ```

---

## ⚙️ Configuration

Edit the `.env` file with your specific configuration:

```
# Telegram Bot Configuration
# Get your bot token from @BotFather
# Get your ADMIN_ID from @userinfobot
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ADMIN_ID=your_telegram_user_id_here
```

---

## 🍪 YouTube Cookies Setup

**Important:** The bot requires YouTube cookies for proper functionality.

1. **Install the Chrome extension** "Get cookies.txt Clean" from the Chrome Web Store

2. **Sign in to your YouTube account** in Chrome

3. **Export your cookies:**
   - Open the "Get cookies.txt Clean" extension
   - Navigate to YouTube.com
   - Export the cookies file

4. **Add the cookies file to your project:**
   - Rename the exported file to `cookies.txt`
   - Place it in the root directory of your project

This allows the bot to access age-restricted content and higher quality streams that require authentication.

---

## 📱 Usage

### 👤 User Commands

- ✍️ Simply type any song or video name to search
- 🔍 `/search` - Start a search for videos
- 📣 `/feedback` - Send feedback or report issues
- ❌ `/cancel` - Cancel current operation
- 🚀 `/start` - Start the bot
- ❓ `/help` - Get help information

### 👑 Admin Commands

- 📊 `/stats` - View bot usage statistics
- 📬 `/feedback_list` - See all user feedback
- 💬 `/reply [ID] [message]` - Reply to a specific feedback
- 📢 `/broadcast` - Send a message to all users

---

## 📂 Project Structure

```
src/
├── commands/          # Bot command handlers
│   ├── admin/         # Admin-specific commands
│   ├── cancel.ts
│   ├── feedback.ts
│   ├── help.ts
│   ├── index.ts
│   ├── search.ts
│   └── start.ts
├── db/                # Database operations
│   ├── feedback.ts
│   ├── index.ts
│   ├── schema.ts
│   └── users.ts
├── handlers/          # Message and callback handlers
│   ├── feedback.ts
│   ├── format.ts
│   ├── index.ts
│   └── search.ts
├── utils/             # Utility functions
│   ├── file.ts
│   ├── formatting.ts
│   ├── index.ts
│   └── youtube.ts
├── config.ts          # Bot configuration
├── index.ts           # Main entry point
├── types.ts           # TypeScript type definitions
└── youtube-search-api.d.ts
```

---

## 🔄 How It Works

1. 🔸 User initiates a search by typing a song/video name or using `/search`
2. 🔸 Bot searches YouTube and returns a list of results
3. 🔸 User selects a video from the results
4. 🔸 User chooses between audio or video format
5. 🔸 For videos, user selects preferred quality
6. 🔸 Bot downloads and sends the file to the user

---

## 🛠️ Technologies Used

- **TypeScript** 📝 For type-safe code
- **Telegraf** 📱 Telegram Bot framework
- **yt-dlp-exec** 📥 For downloading YouTube content
- **youtube-search-api** 🔍 For searching YouTube
- **ffmpeg** 🎞️ For media processing
- **SQLite3** 🗃️ For data storage
- **dotenv** 🔐 For environment variables

---

## 💻 Development

Run the bot in development mode:
```bash
npm run start
```

Or with automatic restart on file changes:
```bash
npm start
```

Build TypeScript files:
```bash
npm run build
```

---

## ⚠️ Current Limitations

- ⚠️ The bot currently only accepts search by name, not by YouTube links
- ⚠️ Large files may take longer to process due to Telegram's file size limits

---

## 📜 License

ISC

---

### 🌟 Made with ❤️ for music lovers everywhere 🎵