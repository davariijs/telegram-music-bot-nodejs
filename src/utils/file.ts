// utils/file.ts
import * as fs from 'fs';
import { promisify } from 'util';
import { DOWNLOADS_DIR } from '../config';

const unlinkAsync = promisify(fs.unlink);

export async function sendFileAndCleanup(filePath: string, sendFunction: (filePath: string) => Promise<void>): Promise<void> {
  try {
    // Ensure downloads directory exists
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }
    
    // Try to send the file using the provided sendFunction
    try {
      await sendFunction(filePath);
    } catch (sendError) {
      console.error(`Error while sending file ${filePath}:`, sendError);
      // We continue to file deletion even if sending fails
    }

    // Add a small delay to ensure file handles are fully released
    await new Promise(resolve => setTimeout(resolve, 500));

    // Delete the file after sending
    try {
      if (fs.existsSync(filePath)) {
        await unlinkAsync(filePath);
        console.log(`File ${filePath} deleted successfully.`);
      } else {
        console.log(`File ${filePath} already deleted or does not exist.`);
      }
    } catch (deleteError) {
      console.error(`Error deleting file ${filePath}:`, deleteError);
      
      // If deletion fails, schedule another attempt with a longer delay
      setTimeout(async () => {
        try {
          if (fs.existsSync(filePath)) {
            await unlinkAsync(filePath);
            console.log(`File ${filePath} deleted successfully on second attempt.`);
          }
        } catch (retryError) {
          console.error(`Failed to delete file ${filePath} on retry:`, retryError);
        }
      }, 5000); // Try again after 5 seconds
    }
  } catch (error) {
    console.error('Error in sendFileAndCleanup:', error);
  }
}

// Helper function to get file size
export function getFileSizeInMB(filePath: string): number {
  try {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024); // Convert bytes to MB
  } catch (error) {
    console.error('Error getting file size:', error);
    return 0;
  }
}