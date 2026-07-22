import https from 'https';
import http from 'http';
import { logger } from '../../config/logger';

export interface WebpageExtractResult {
  url: string;
  title: string;
  text: string;
}

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(url);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      };
      const client = url.startsWith('https') ? https : http;

      const req = client.get(options, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${parsedUrl.protocol}//${parsedUrl.host}${res.headers.location}`;
          return fetchHtml(redirectUrl).then(resolve).catch(reject);
        }

        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`Failed to fetch webpage: HTTP ${res.statusCode}`));
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      });

      req.on('error', reject);
    } catch (err: any) {
      reject(err);
    }
  });
}

/**
 * Strips HTML elements and extracts clean text content and page title.
 */
export function extractTextFromHtml(html: string): { title: string; text: string } {
  // Extract Title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Webpage Document';

  // Strip Scripts, Styles, Nav, Footer, Comments
  let cleanHtml = html
    .replace(/<script\b[^<]*>([\s\S]*?)<\/script>/gi, '')
    .replace(/<style\b[^<]*>([\s\S]*?)<\/style>/gi, '')
    .replace(/<nav\b[^<]*>([\s\S]*?)<\/nav>/gi, '')
    .replace(/<footer\b[^<]*>([\s\S]*?)<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Convert break/paragraph tags to linebreaks
  cleanHtml = cleanHtml
    .replace(/<(p|br|div|h1|h2|h3|h4|h5|h6|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  // Decode basic HTML entities
  const text = cleanHtml
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return { title, text };
}

export const webService = {
  extractWebpageText: async (url: string): Promise<WebpageExtractResult> => {
    logger.info(`Extracting webpage content from URL: ${url}`);
    try {
      const html = await fetchHtml(url);
      const { title, text } = extractTextFromHtml(html);
      logger.info(`Successfully extracted webpage text (${text.length} chars) from ${url}`);
      return { url, title, text };
    } catch (err: any) {
      logger.error(`Failed to extract webpage text from ${url}: ${err.message}`);
      throw new Error(`Webpage extraction failed: ${err.message}`);
    }
  },
};
