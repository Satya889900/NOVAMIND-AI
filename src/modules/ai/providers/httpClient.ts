import https from 'https';

export interface HttpClientResponse {
  statusCode?: number;
  body: string;
}

export function postRequest(
  url: string,
  headers: Record<string, string>,
  body: any,
  timeoutMs = 90000
): Promise<HttpClientResponse> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const postData = JSON.stringify(body);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        ...headers,
        ...(!headers['Content-Type'] && { 'Content-Type': 'application/json' }),
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: timeoutMs,
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const bodyText = Buffer.concat(chunks).toString('utf-8');
        resolve({
          statusCode: res.statusCode,
          body: bodyText,
        });
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
