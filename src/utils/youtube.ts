// utils/youtube.ts
import ytdl, { YtFlags } from 'yt-dlp-exec';
import * as path from 'path';
import * as fs from 'fs';
import { FFMPEG_PATH, COOKIES_PATH, DOWNLOADS_DIR } from '../config';
import { sanitizeFilename } from './formatting';
import { DownloadResult, VideoFormat, SearchResultItem } from '../types';

const IYoutubeSearchApi: any = require('youtube-search-api');

type YtdlOptions = YtFlags & {
  cookiesFromBrowser?: string;
  browserExecutablePath?: string;
  browserProfilePath?: string;
};

export async function searchYouTube(query: string): Promise<SearchResultItem[]> {
  try {
    const results = await IYoutubeSearchApi.GetListByKeyword(query, false);
    return results.items;
  } catch (error) {
    console.error('Error searching YouTube:', error);
    throw error;
  }
}

export async function getVideoTitle(videoId: string): Promise<string> {
  try {
    const options: YtdlOptions = {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      verbose: true,
      cookies: COOKIES_PATH,
      ffmpegLocation: FFMPEG_PATH,
    };
    
    const videoInfo = await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    return videoInfo.title;
  } catch (error) {
    console.error('Error getting video title:', error);
    return `video-${videoId}`;
  }
}

export async function getVideoFormats(videoId: string): Promise<VideoFormat[]> {
  try {
    const options: YtdlOptions = {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true,
      verbose: true,
      cookies: COOKIES_PATH,
      ffmpegLocation: FFMPEG_PATH,
    };
    
    const videoInfo = await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    
    // Filter for formats that have video
    const formats = videoInfo.formats.filter((format: any) => 
      (format.vcodec !== 'none' && format.height > 0)
    ) as VideoFormat[];
    
    return formats;
  } catch (error) {
    console.error('Error getting video formats:', error);
    return [];
  }
}

export async function downloadAndConvertAudio(videoId: string): Promise<DownloadResult> {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const videoTitle = await getVideoTitle(videoId);
  const sanitizedTitle = sanitizeFilename(videoTitle);
  const audioFilePath = path.join(DOWNLOADS_DIR, `${sanitizedTitle}.mp3`);

  try {
    const options: YtdlOptions = {
      extractAudio: true,
      audioFormat: 'mp3',
      output: audioFilePath,
      verbose: true,
      cookies: COOKIES_PATH,
      ffmpegLocation: FFMPEG_PATH,
    };

    await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    return { filePath: audioFilePath };
  } catch (downloadError) {
    return { error: downloadError as Error };
  }
}

export async function downloadVideo(videoId: string, formatId: string = 'best'): Promise<DownloadResult> {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const videoTitle = await getVideoTitle(videoId);
  const sanitizedTitle = sanitizeFilename(videoTitle);
  const videoFilePath = path.join(DOWNLOADS_DIR, `${sanitizedTitle}.mp4`);

  try {
    const options: YtdlOptions = {
      output: videoFilePath,
      verbose: true,
      cookies: COOKIES_PATH,
      ffmpegLocation: FFMPEG_PATH,
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