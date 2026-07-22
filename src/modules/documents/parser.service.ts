import mammoth from 'mammoth';
import admZip from 'adm-zip';
import { logger } from '../../config/logger';
import { cloudinary } from '../../config/cloudinary';
import https from 'https';
import http from 'http';

/**
 * Given a Cloudinary URL, generate a signed URL if restricted access is enabled.
 */
function getSignedCloudinaryUrl(url: string): string {
  if (!url.includes('res.cloudinary.com') || url.includes('s--')) return url;

  try {
    const match = url.match(/res\.cloudinary\.com\/[^/]+\/(image|raw|video|auto)\/upload\/(?:v\d+\/)?(.+)$/);
    if (match) {
      const resourceType = match[1];
      const publicId = match[2];
      const signedUrl = cloudinary.url(publicId, {
        resource_type: resourceType as any,
        sign_url: true,
        secure: true,
        type: 'upload',
      });
      logger.info(`Generated signed Cloudinary URL: ${signedUrl}`);
      return signedUrl;
    }
  } catch (err: any) {
    logger.warn(`Failed to generate signed Cloudinary URL: ${err.message}`);
  }
  return url;
}

/**
 * Downloads file buffer from Cloudinary, using archive zip as fallback if strict ACL 401 occurs.
 */
async function downloadFileFromCloudinary(url: string): Promise<Buffer> {
  // Try direct HTTP GET download first
  try {
    return await downloadFile(url);
  } catch (err: any) {
    if (err.message.includes('401') && url.includes('res.cloudinary.com')) {
      logger.info(`Direct download returned 401. Retrying via Cloudinary signed archive API for ${url}...`);
      const match = url.match(/res\.cloudinary\.com\/[^/]+\/(image|raw|video|auto)\/upload\/(?:v\d+\/)?(.+)$/);
      if (match) {
        const resourceType = match[1] as any;
        const publicId = match[2];
        const zipUrl = cloudinary.utils.download_zip_url({
          public_ids: [publicId],
          resource_type: resourceType === 'auto' ? 'raw' : resourceType,
          flatten_folders: true,
        });

        const zipBuffer = await downloadFile(zipUrl);
        const zip = new admZip(zipBuffer);
        const entries = zip.getEntries();
        if (entries.length > 0) {
          const fileBuf = entries[0].getData();
          logger.info(`Successfully extracted file buffer from Cloudinary zip archive (${fileBuf.length} bytes)`);
          return fileBuf;
        }
      }
    }
    throw err;
  }
}

/**
 * Download a file from a URL and return its contents as a Buffer.
 */
function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const targetUrl = getSignedCloudinaryUrl(url);
      const parsedUrl = new URL(targetUrl);
      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.pathname + parsedUrl.search,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
      };
      const client = targetUrl.startsWith('https') ? https : http;

      client.get(options, (res) => {
        // Handle redirects
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith('http')
            ? res.headers.location
            : `${parsedUrl.protocol}//${parsedUrl.host}${res.headers.location}`;
          return downloadFile(redirectUrl).then(resolve).catch(reject);
        }

        if (res.statusCode && res.statusCode >= 400) {
          if (res.statusCode === 401 && targetUrl.includes('/image/upload/')) {
            const rawUrl = targetUrl.replace('/image/upload/', '/raw/upload/');
            logger.info(`Retrying Cloudinary PDF download with raw endpoint: ${rawUrl}`);
            return downloadFile(rawUrl).then(resolve).catch(reject);
          }
          return reject(new Error(`Failed to download file: HTTP ${res.statusCode}`));
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    } catch (err: any) {
      reject(err);
    }
  });
}

export const parserService = {
  /**
   * Parse a document stored at a Cloudinary URL to extract text.
   * storagePath is a Cloudinary secure_url (https://...).
   */
  parseDocumentToText: async (storagePath: string, mimeType: string): Promise<string> => {
    logger.info(`Parsing document from ${storagePath} (${mimeType})`);
    try {
      if (mimeType === 'youtube' || storagePath.includes('youtube.com') || storagePath.includes('youtu.be')) {
        const { youtubeService } = require('./youtube.service');
        const res = await youtubeService.getTranscript(storagePath);
        return res.transcriptText;
      }

      if (mimeType === 'web' || (storagePath.startsWith('http') && !storagePath.includes('res.cloudinary.com'))) {
        const { webService } = require('./web.service');
        const res = await webService.extractWebpageText(storagePath);
        return res.text;
      }

      // Download file from Cloudinary (with signed archive fallback if needed)
      const fileBuffer = await downloadFileFromCloudinary(storagePath);

      if (mimeType === 'application/pdf') {
        let extractedText = '';
        try {
          const { PDFParse } = require('pdf-parse');
          const parser = new PDFParse(new Uint8Array(fileBuffer));
          const result = await parser.getText();
          extractedText = result.text || '';
        } catch (v2Err: any) {
          logger.warn(`PDFParse v2 class failed (${v2Err.message}), attempting fallback...`);
          const pdfParseLegacy = require('pdf-parse');
          const parseFn = typeof pdfParseLegacy === 'function' ? pdfParseLegacy : pdfParseLegacy.default;
          if (typeof parseFn === 'function') {
            const result = await parseFn(fileBuffer);
            extractedText = result.text || '';
          }
        }
        return extractedText;
      }

      if (
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return result.value || '';
      }

      if (mimeType === 'text/plain') {
        return fileBuffer.toString('utf-8');
      }

      throw new Error(`Unsupported mime type: ${mimeType}`);
    } catch (error: any) {
      logger.error(`Error parsing document ${storagePath}: ${error.message}`);
      throw error;
    }
  },
};
