import * as fs from 'fs';
import { promisify } from 'util'; // Import promisify

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

export async function convertCookiesToNetscape(jsonCookiesPath: string, netscapeCookiesPath: string) {
    try {
        // Read the JSON file
        const data = await readFileAsync(jsonCookiesPath, 'utf8');
        const cookies = JSON.parse(data);

        // Convert to Netscape format
        const netscapeCookies = cookies.map((cookie: any) => {
            return [
                cookie.domain,
                cookie.hostOnly ? 'FALSE' : 'TRUE',  // Convert boolean to string
                cookie.path,
                cookie.secure ? 'TRUE' : 'FALSE',   // Convert boolean to string
                cookie.expirationDate ? Math.floor(cookie.expirationDate) : '0', // Convert to integer timestamp
                cookie.name,
                cookie.value
            ].join('\t'); // Tab-separated
        }).join('\n');   // Newline-separated

        // Add the Netscape header
        const netscapeHeader = `# Netscape HTTP Cookie File\n# https://curl.haxx.se/rfc/cookie_spec.html\n# This is a generated file!  Do not edit.\n\n`;

        // Write to the Netscape file
        await writeFileAsync(netscapeCookiesPath, netscapeHeader + netscapeCookies, 'utf8');
        console.log(`Cookies converted and saved to ${netscapeCookiesPath}`);

    } catch (error) {
        console.error('Error converting cookies:', error);
        throw error; // Re-throw for consistent error handling
    }
}