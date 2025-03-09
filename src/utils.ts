// utils.ts
import ytdl, { YtFlags } from 'yt-dlp-exec';
import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
const IYoutubeSearchApi: any = require('youtube-search-api');
const exec = promisify(execCallback);

type YtdlOptions = YtFlags & {
  cookiesFromBrowser?: string;
  browserExecutablePath?: string;
  browserProfilePath?: string;
};

export interface VideoFormat {
  format_id: string;
  height: number;
  width?: number;
  vcodec?: string;
  acodec?: string;
  filesize?: number;
  format_note?: string;
  ext?: string;
}

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);

// Original search function
export async function searchYouTube(query: string): Promise<any[]> {
  try {
    const results = await IYoutubeSearchApi.GetListByKeyword(query, false);
    return results.items;
  } catch (error) {
    console.error('Error searching YouTube:', error);
    throw error;
  }
}

// Renamed from downloadAndConvert to be more specific
export async function downloadAndConvertAudio(videoId: string): Promise<{ filePath?: string; error?: Error }> {
  const outputDir = path.join(__dirname, '..', 'downloads');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const videoTitle = await getVideoTitle(videoId);
  const sanitizedTitle = sanitizeFilename(videoTitle);
  const audioFilePath = path.join(outputDir, `${sanitizedTitle}.mp3`);

  try {
    const options: YtdlOptions = {
      extractAudio: true,
      audioFormat: 'mp3',
      output: audioFilePath,
      verbose: true,
      cookies: path.join(__dirname, 'cookies.txt'),
      ffmpegLocation: ffmpegPath,
    };

    await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    return { filePath: audioFilePath };
  } catch (downloadError) {
    return { error: downloadError as Error };
  }
}


export async function getVideoTitle(videoId: string): Promise<string> {
  try {
    const options: YtdlOptions = {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      verbose: true,
      cookies: path.join(__dirname, 'cookies.txt'),
      ffmpegLocation: ffmpegPath,
    };
    const videoInfo = await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    return videoInfo.title;
  } catch (error) {
    console.error('Error getting video title:', error);
    return `video-${videoId}`;
  }
}

// Add to your utils.ts

// Get available video formats
export async function getVideoFormats(videoId: string): Promise<VideoFormat[]> {
  try {
    const options: YtdlOptions = {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      verbose: true,
      cookies: path.join(__dirname, 'cookies.txt'),
      ffmpegLocation: ffmpegPath,
    };
    
    const videoInfo = await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    
    // Filter for formats that have both video and audio, or just video formats with reasonable sizes
    const formats = videoInfo.formats.filter((format: any) => 
      (format.vcodec !== 'none' && format.height > 0) // Has video
    ) as VideoFormat[];
    
    return formats;
  } catch (error) {
    console.error('Error getting video formats:', error);
    return [];
  }
}

// Update the downloadVideo function to accept formatId
export async function downloadVideo(videoId: string, formatId: string = 'best'): Promise<{ filePath?: string; error?: Error }> {
  const outputDir = path.join(__dirname, '..', 'downloads');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const videoTitle = await getVideoTitle(videoId);
  const sanitizedTitle = sanitizeFilename(videoTitle);
  const videoFilePath = path.join(outputDir, `${sanitizedTitle}.mp4`);

  try {
    const options: YtdlOptions = {
      output: videoFilePath,
      verbose: true,
      cookies: path.join(__dirname, 'cookies.txt'),
      ffmpegLocation: ffmpegPath,
    };

    // If a specific format is requested, use it
    if (formatId !== 'best') {
      options.format = formatId;
    } else {
      options.format = 'best[ext=mp4]/best';
    }

    await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    return { filePath: videoFilePath };
  } catch (downloadError) {
    return { error: downloadError as Error };
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]/g, '_');
}

export async function sendFileAndCleanup(filePath: string, sendFunction: (filePath: string) => Promise<void>) {
  try {
    await sendFunction(filePath);
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Error deleting file ${filePath}:`, err);
      } else {
        console.log(`File ${filePath} deleted successfully.`);
      }
    });
  } catch (error) {
    console.error('Error sending file:', error);
  }
}