import { YoutubeTranscript } from 'youtube-transcript';
import { logger } from '../../config/logger';
import https from 'https';

export interface YouTubeTranscriptResult {
  videoId: string;
  title: string;
  transcriptText: string;
  description?: string;
  hasCaptions: boolean;
}

/**
 * Extracts YouTube Video ID from various YouTube URL formats.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

export function getYouTubeMetadata(videoId: string): Promise<{ title: string; description: string }> {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf-8');
          const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
          const descMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<meta name="description" content="([^"]+)"/i);

          const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : `YouTube Video (${videoId})`;
          const description = descMatch ? descMatch[1].trim() : '';

          resolve({ title, description });
        });
      }
    );
    req.on('error', () => resolve({ title: `YouTube Video (${videoId})`, description: '' }));
  });
}

export const youtubeService = {
  /**
   * Fetches transcript for a YouTube video URL, or returns video title/description metadata if captions are disabled.
   */
  getTranscript: async (videoUrl: string): Promise<YouTubeTranscriptResult> => {
    const videoId = extractYouTubeVideoId(videoUrl);
    if (!videoId) {
      throw new Error(`Invalid YouTube URL: ${videoUrl}`);
    }

    logger.info(`Extracting YouTube transcript for video ID: ${videoId}`);
    const meta = await getYouTubeMetadata(videoId);

    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId);
      if (items && items.length > 0) {
        const transcriptText = items
          .map((item) => item.text.trim())
          .filter((t) => t.length > 0)
          .join(' ');

        logger.info(`Successfully extracted YouTube transcript (${transcriptText.length} chars)`);

        return {
          videoId,
          title: meta.title,
          description: meta.description,
          transcriptText,
          hasCaptions: true,
        };
      }
    } catch (err: any) {
      logger.warn(`Captions disabled or unavailable for ${videoId}: ${err.message}`);
    }

    // Fallback: Return video title & description metadata when captions are disabled
    const fallbackText = `Video Title: "${meta.title}"\nDescription: "${meta.description || 'No description provided.'}"\nNote: Closed captions are disabled for this YouTube video.`;

    return {
      videoId,
      title: meta.title,
      description: meta.description,
      transcriptText: fallbackText,
      hasCaptions: false,
    };
  },
};
