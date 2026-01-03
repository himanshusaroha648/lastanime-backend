// Configuration for the backend scraper
export const CONFIG = {
  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  
  // TMDB
  tmdb: {
    apiKey: process.env.TMDB_API_KEY,
    baseUrl: 'https://api.themoviedb.org/3',
    imageBase: 'https://image.tmdb.org/t/p/original',
    delay: parseInt(process.env.TMDB_DELAY_MS || '250', 10),
  },
  
  // Scraper
  scraper: {
    url: process.env.SCRAPE_URL || 'https://toonstream.love/',
    timeout: parseInt(process.env.TIMEOUT_MS || '30000', 10),
    maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),
    pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '3000', 10),
    delay: parseInt(process.env.SCRAPE_DELAY_MS || '1000', 10),
  },
  
  // Monitoring
  monitoring: {
    enabled: process.env.ENABLE_MONITORING !== 'false',
    pollInterval: parseInt(process.env.POLL_INTERVAL_MS || '3000', 10),
    maxLatestEpisodes: parseInt(process.env.MAX_LATEST_EPISODES || '9', 10),
  },
  
  // Server
  server: {
    port: parseInt(process.env.PORT || '3000', 10),
    env: process.env.NODE_ENV || 'development',
  },
  
  // Resend Email
  resend: {
    apiKey: process.env.RESEND_API_KEY,
  },

  // Proxy
  proxy: {
    list: process.env.PROXY_LIST ? process.env.PROXY_LIST.split(',').map(p => p.trim()).filter(Boolean) : [],
  },
  
  // User Agents
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  ],
};

export function validateConfig() {
  const errors = [];
  
  if (!CONFIG.supabase.url) errors.push('SUPABASE_URL is required');
  if (!CONFIG.supabase.key) errors.push('SUPABASE_SERVICE_ROLE_KEY is required');
  if (!CONFIG.tmdb.apiKey) console.warn('⚠️  TMDB_API_KEY not set. TMDB features will be disabled.');
  
  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
  
  console.log('✅ Configuration validated successfully');
  
  if (CONFIG.proxy.list.length > 0) {
    console.log(`✅ Loaded ${CONFIG.proxy.list.length} proxies`);
  } else {
    console.log('⚠️  No proxies configured. Running without proxy rotation.');
  }
}
