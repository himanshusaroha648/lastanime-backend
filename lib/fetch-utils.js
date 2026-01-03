import axios from 'axios';

const CONFIG = {
  timeout: 30000,
  referer: 'https://toonstream.love/',
  maxRetries: 3,
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export async function fetchHtmlWithRetry(url, retries = CONFIG.maxRetries) {
  let lastErr = null;
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await axios.get(url, {
        timeout: CONFIG.timeout,
        headers: {
          'User-Agent': getUA(),
          Referer: CONFIG.referer,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      return String(res.data || '');
    } catch (err) {
      lastErr = err;
      if (i < retries) {
        console.log(`   ⚠️  Retry ${i}/${retries} for ${url}...`);
        await delay(1000);
      }
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastErr?.message || 'unknown error'}`);
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeUrl(rawUrl, base = 'https://toonstream.love') {
  if (!rawUrl || /^javascript:/i.test(rawUrl)) return null;
  try {
    return new URL(rawUrl, base).href;
  } catch {
    return null;
  }
}
