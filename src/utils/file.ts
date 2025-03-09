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
    
    // Send the file using the provided sendFunction
    await sendFunction(filePath);

    // Add a small delay to ensure file handles are fully released
    await new Promise(resolve => setTimeout(resolve, 500));

    // Delete the file after sending
    try {
      await unlinkAsync(filePath);
      console.log(`File ${filePath} deleted successfully.`);
    } catch (deleteError) {
      console.error(`Error deleting file ${filePath}:`, deleteError);
      
      // If deletion fails, schedule another attempt
      setTimeout(async () => {
        try {
          await unlinkAsync(filePath);
          console.log(`File ${filePath} deleted successfully on second attempt.`);
        } catch (retryError) {
          console.error(`Failed to delete file ${filePath} on retry:`, retryError);
        }
      }, 5000); // Try again after 5 seconds
    }
  } catch (error) {
    console.error('Error sending file:', error);
  }
}