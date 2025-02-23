import ytdl, { YtFlags } from 'yt-dlp-exec';
import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
const IYoutubeSearchApi: any = require('youtube-search-api');
const exec = promisify(execCallback);

type YtdlOptions =  YtFlags & {
  cookiesFromBrowser?: string;
  browserExecutablePath?: string;
  browserProfilePath?: string;
};


const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);


export async function searchYouTube(query: string): Promise<any[]> {
    try {
        const results = await IYoutubeSearchApi.GetListByKeyword(query, false);
        return results.items;
    } catch (error) {
        console.error('Error searching YouTube:', error);
        throw error;
    }
}

export async function downloadAndConvert(videoId: string): Promise<{ filePath?: string; error?: Error }> {
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
          // cookiesFromBrowser: 'chrome',
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
          // cookiesFromBrowser: 'chrome',
          cookies: path.join(__dirname, 'cookies.txt'),
          ffmpegLocation: ffmpegPath, 
      };
      const videoInfo = await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);

      return videoInfo.title;
  } catch (error) {
      console.error('Error getting video title:', error);
      return `video-${videoId}`; // Return a default title
  }
}
// Helper function to sanitize filenames
function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/:*?"<>|]/g, '_');
}


export async function sendFileAndCleanup(filePath: string, sendFunction: (filePath: string) => Promise<void>) {
  try {
    // Send the file using the provided sendFunction
    await sendFunction(filePath);

    // Delete the file after sending
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