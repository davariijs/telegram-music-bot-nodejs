// utils/file.ts
import * as fs from 'fs';
import { DOWNLOADS_DIR } from '../config';

export async function sendFileAndCleanup(filePath: string, sendFunction: (filePath: string) => Promise<void>): Promise<void> {
  try {
    // Ensure downloads directory exists
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }
    
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