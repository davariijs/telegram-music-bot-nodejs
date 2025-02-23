import * as fs from 'fs';


export function convertCookiesToNetscape(jsonCookiesPath: string, outputFilePath: string): void {
    try {
        // Read and parse the JSON cookies file
        const jsonCookies = fs.readFileSync(jsonCookiesPath, 'utf-8');
        const cookies = JSON.parse(jsonCookies);

        // Convert JSON cookies to Netscape format
        const netscapeCookies = cookies.map((cookie: any) => {
            const expirationDate = cookie.expirationDate
                ? Math.floor(cookie.expirationDate) // Ensure it's an integer
                : 0; // Default to 0 if no expirationDate is provided

            return `${cookie.domain}\t${cookie.hostOnly ? 'FALSE' : 'TRUE'}\t${cookie.path}\t${cookie.secure ? 'TRUE' : 'FALSE'}\t${expirationDate}\t${cookie.name}\t${cookie.value}`;
        }).join('\n');

        // Write the Netscape-formatted cookies to a file
        fs.writeFileSync(outputFilePath, netscapeCookies, 'utf-8');
    } catch (error) {
        console.error('Error converting cookies to Netscape format:', error);
        throw error;
    }
}