import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const ADMIN_ID = parseInt(process.env.ADMIN_ID || '0');
export const DB_PATH = path.join(__dirname, '..', 'bot_stats.db');
export const FFMPEG_PATH = require('@ffmpeg-installer/ffmpeg').path;
export const COOKIES_PATH = path.join(__dirname, 'cookies.txt');
export const DOWNLOADS_DIR = path.join(__dirname, '..', 'downloads');