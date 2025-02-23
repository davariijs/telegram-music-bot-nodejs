import ytdl from 'yt-dlp-exec';
import ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import { convertCookiesToNetscape } from './netscapeFormat';
const IYoutubeSearchApi: any = require('youtube-search-api');

const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);


export async function searchYouTube(query: string): Promise<any[]> {
    try {
        const results = await IYoutubeSearchApi.GetListByKeyword(query, false);
        return results.items;
    } catch (error) {
        console.error('Error searching YouTube:', error);
        throw error; // Re-throw the error to be caught in index.ts
    }
}

export async function downloadAndConvert(videoId: string): Promise<{ filePath?: string; error?: Error }> {
  const outputFileName = `${videoId}.mp3`;
  const outputFilePath = path.join(__dirname, outputFileName); // Save in the src directory (for simplicity during development)
  const cookiesFilePath = path.join(__dirname, 'cookies.txt');
  const jsonCookiesPath = path.join(__dirname, 'cookies.json');

  // Check if the file already exists
  if (fs.existsSync(outputFilePath)) {
    console.log(`File already exists: ${outputFilePath}`);
    return { filePath: outputFilePath };
  }

  try {

    // Convert JSON cookies to Netscape format
    convertCookiesToNetscape(jsonCookiesPath, cookiesFilePath);

    // Convert cookies.json to Netscape format
    if (!fs.existsSync(cookiesFilePath)) {
      throw new Error(`Cookies file not found: ${cookiesFilePath}`);
      }
    
    await ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
      extractAudio: true,
      audioFormat: 'mp3',
      output: outputFilePath,
      noPlaylist: true, // Important: Only download the single video
      limitRate: '1M', // Limit download rate to avoid getting blocked
      cookies: cookiesFilePath,
    });

    // Clean up the temporary cookie file (IMPORTANT)
  //   if (cookiesContent) {
  //     fs.unlinkSync(cookiesFilePath);
  // }

//   if (fs.existsSync(cookiesFilePath)) {
//     fs.unlinkSync(cookiesFilePath);
// }

        return { filePath: outputFilePath };
    } catch (error: any) {
        // Delete the incomplete file if an error occurs
        if (fs.existsSync(outputFilePath)) {
          fs.unlinkSync(outputFilePath);
        }
        return { error };
    }
}