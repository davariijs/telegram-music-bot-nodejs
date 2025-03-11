import ytdl, { YtFlags } from 'yt-dlp-exec';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { promisify } from 'util';
import { FFMPEG_PATH, COOKIES_PATH, DOWNLOADS_DIR } from '../config';
import { sanitizeFilename } from './formatting';
import { DownloadResult, VideoFormat, SearchResultItem } from '../types';
const IYoutubeSearchApi: any = require('youtube-search-api');

const exec = promisify(childProcess.exec);


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


export function getFileSizeInMB(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024); // Convert bytes to MB
  } catch (error) {
    console.error('Error getting file size:', error);
    return 0;
  }
}

// Compress audio file using ffmpeg
async function compressAudio(inputPath: string, bitrate: string = '64k'): Promise<string> {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${baseName}_compressed${ext}`);
  
  try {
    await exec(`"${FFMPEG_PATH}" -i "${inputPath}" -b:a ${bitrate} -ac 1 "${outputPath}"`);
    
    // Check if the compressed file exists and has content
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      // Delete the original file
      fs.unlinkSync(inputPath);
      return outputPath;
    } else {
      console.error('Compression failed or produced empty file');
      return inputPath; // Return original if compression fails
    }
  } catch (error) {
    console.error('Error compressing audio:', error);
    return inputPath; // Return original if compression fails
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
    // First try with moderate compression
    const options: YtdlOptions = {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '128K', // Start with moderate quality
      output: audioFilePath,
      verbose: true,
      cookies: COOKIES_PATH,
      ffmpegLocation: FFMPEG_PATH,
      // Limit duration if very long (optional)
      // postprocessorArgs: ['-ss', '0', '-t', '600'], // Limit to 10 minutes
    }as any;

    await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    
    // Check if file size is too large for Telegram (limit is 50MB)
    let fileSizeMB = getFileSizeInMB(audioFilePath);
    
    // If the file is too large, compress it progressively
    if (fileSizeMB > 49) {
      console.log(`File too large (${fileSizeMB.toFixed(1)}MB), compressing to 64k bitrate...`);
      
      // First compression: 64k bitrate, mono
      const compressedPath = await compressAudio(audioFilePath, '64k');
      fileSizeMB = getFileSizeInMB(compressedPath);
      
      // If still too large, compress more aggressively
      if (fileSizeMB > 49) {
        console.log(`File still too large (${fileSizeMB.toFixed(1)}MB), compressing to 48k bitrate...`);
        const moreCompressedPath = await compressAudio(compressedPath, '48k');
        fileSizeMB = getFileSizeInMB(moreCompressedPath);
        
        // If still too large, try extreme compression
        if (fileSizeMB > 49) {
          console.log(`File still too large (${fileSizeMB.toFixed(1)}MB), compressing to 32k bitrate...`);
          const extremeCompressedPath = await compressAudio(moreCompressedPath, '32k');
          fileSizeMB = getFileSizeInMB(extremeCompressedPath);
          
          // If still too large after all attempts, return error
          if (fileSizeMB > 49) {
            return { 
              error: new Error(`File still too large (${fileSizeMB.toFixed(1)}MB) after compression. Try a shorter audio.`)
            };
          }
          
          return { filePath: extremeCompressedPath };
        }
        
        return { filePath: moreCompressedPath };
      }
      
      return { filePath: compressedPath };
    }
    
    return { filePath: audioFilePath };
  } catch (downloadError) {
    return { error: downloadError as Error };
  }
}


async function compressVideo(inputPath: string, crf: number = 28): Promise<string> {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const outputPath = path.join(dir, `${baseName}_compressed${ext}`);
  
  try {
    // -crf: Constant Rate Factor (18-28 is good, higher = smaller file)
    // -preset: slower = better compression
    await exec(`"${FFMPEG_PATH}" -i "${inputPath}" -c:v libx264 -crf ${crf} -preset medium -c:a aac -b:a 64k "${outputPath}"`);
    
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      fs.unlinkSync(inputPath);
      return outputPath;
    } else {
      return inputPath;
    }
  } catch (error) {
    console.error('Error compressing video:', error);
    return inputPath;
  }
}


// Update downloadVideo function similarly
export async function downloadVideo(videoId: string, formatId: string = 'best'): Promise<DownloadResult> {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }

  const videoTitle = await getVideoTitle(videoId);
  const sanitizedTitle = sanitizeFilename(videoTitle);
  const videoFilePath = path.join(DOWNLOADS_DIR, `${sanitizedTitle}.mp4`);

  try {
    // First try downloading with size limit
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
      // Try to get a reasonably sized file from the start
      options.format = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[ext=mp4]/best';
    }

    await ytdl(`https://www.youtube.com/watch?v=${videoId}`, options);
    
    // Check if file size is too large for Telegram (limit is 50MB)
    let fileSizeMB = getFileSizeInMB(videoFilePath);
    
    // If the file is too large, compress it progressively
    if (fileSizeMB > 49) {
      console.log(`Video too large (${fileSizeMB.toFixed(1)}MB), compressing with CRF 28...`);
      
      // First compression attempt
      const compressedPath = await compressVideo(videoFilePath, 28);
      fileSizeMB = getFileSizeInMB(compressedPath);
      
      // If still too large, compress more aggressively
      if (fileSizeMB > 49) {
        console.log(`Video still too large (${fileSizeMB.toFixed(1)}MB), compressing with CRF 32...`);
        const moreCompressedPath = await compressVideo(compressedPath, 32);
        fileSizeMB = getFileSizeInMB(moreCompressedPath);
        
        // If still too large, try extreme compression
        if (fileSizeMB > 49) {
          console.log(`Video still too large (${fileSizeMB.toFixed(1)}MB), compressing with CRF 38 and reducing resolution...`);
          
          // Use more aggressive compression with resolution reduction
          const dir = path.dirname(moreCompressedPath);
          const ext = path.extname(moreCompressedPath);
          const baseName = path.basename(moreCompressedPath, ext);
          const extremeCompressedPath = path.join(dir, `${baseName}_final${ext}`);
          
          try {
            // Reduce resolution to 480p and use very high compression
            await exec(`"${FFMPEG_PATH}" -i "${moreCompressedPath}" -c:v libx264 -crf 38 -preset fast -s 854x480 -c:a aac -b:a 48k "${extremeCompressedPath}"`);
            
            if (fs.existsSync(extremeCompressedPath) && fs.statSync(extremeCompressedPath).size > 0) {
              fs.unlinkSync(moreCompressedPath);
              fileSizeMB = getFileSizeInMB(extremeCompressedPath);
              
              // If still too large after extreme compression
              if (fileSizeMB > 49) {
                return { 
                  error: new Error(`Video still too large (${fileSizeMB.toFixed(1)}MB) after compression. Try a shorter video.`)
                };
              }
              
              return { filePath: extremeCompressedPath };
            }
          } catch (error) {
            console.error('Error with extreme video compression:', error);
          }
        }
        
        return { filePath: moreCompressedPath };
      }
      
      return { filePath: compressedPath };
    }
    
    return { filePath: videoFilePath };
  } catch (downloadError) {
    return { error: downloadError as Error };
  }
}