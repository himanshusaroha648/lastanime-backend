import axios from 'axios';
import * as cheerio from 'cheerio';
import { CONFIG, validateConfig } from './config.js';
import { proxyManager } from './proxy-manager.js';
import {
  getSeriesBySlug,
  upsertSeries,
  upsertEpisode,
  getEpisode,
  addToLatestEpisodes,
} from './supabase-client.js';
import { enrichSeriesWithTMDB } from './tmdb-fetcher.js';

// Utility functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomUA() {
  return CONFIG.userAgents[Math.floor(Math.random() * CONFIG.userAgents.length)];
}

function normalizeUrl(rawUrl, base = CONFIG.scraper.url) {
  if (!rawUrl || /^javascript:/i.test(rawUrl)) return null;
  try {
    return new URL(rawUrl, base).href;
  } catch {
    return null;
  }
}

function cleanSlug(name) {
  return name
    .replace(/['']/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

// HTTP fetch with retry and proxy support
export async function fetchHtmlWithRetry(url, retries = CONFIG.scraper.maxRetries) {
  let lastErr = null;
  const proxyList = CONFIG.proxy.list;
  const totalAttempts = retries * Math.max(1, proxyList.length || 1);
  
  for (let i = 1; i <= totalAttempts; i++) {
    let configWithProxy = null;
    
    try {
      const axiosConfig = {
        timeout: CONFIG.scraper.timeout,
        headers: {
          'User-Agent': getRandomUA(),
          'Referer': CONFIG.scraper.url,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      };
      
      // Add proxy if available
      configWithProxy = proxyManager.getAxiosConfig(axiosConfig);
      
      const res = await axios.get(url, configWithProxy);
      
      if (configWithProxy && configWithProxy._proxyString) {
        console.log(`   ✅ Success with proxy`);
      }
      
      return String(res.data || '');
    } catch (err) {
      lastErr = err;
      
      // Mark proxy as failed if it was used
      if (configWithProxy && configWithProxy._proxyString) {
        proxyManager.handleProxyError(configWithProxy);
      }
      
      console.log(`   ❌ Fetch failed (attempt ${i}/${totalAttempts}): ${err.message}`);
      
      if (i < totalAttempts) {
        await delay(CONFIG.scraper.delay);
      }
    }
  }
  
  throw new Error(`Failed to fetch ${url} after ${totalAttempts} attempts: ${lastErr?.message || 'unknown error'}`);
}

// Parse episode code from URL (e.g., 1x1, 2x5)
function parseEpisodeCode(url) {
  const match = url.match(/(\d+)x(\d+)/i);
  if (!match) return null;
  return {
    season: parseInt(match[1], 10),
    episode: parseInt(match[2], 10),
  };
}

// Extract common metadata from HTML
function extractCommonFields(html) {
  const $ = cheerio.load(html);
  
  const title = $('h1.entry-title').first().text().trim() ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() || '';
  
  const description = $('meta[property="og:description"]').attr('content')?.trim() ||
    $('div.entry-content p').first().text().trim() || '';
  
  let year = null;
  const yearMatch = $('span.year, .year, [class*="year"]').first().text().match(/\d{4}/);
  if (yearMatch) year = parseInt(yearMatch[0], 10);
  
  const genres = [];
  $('a[rel="tag"], .genres a, [class*="genre"] a').each((_, el) => {
    const genre = $(el).text().trim();
    if (genre) genres.push(genre);
  });
  
  let thumbnail = normalizeUrl(
    $('div.post-thumbnail img').attr('src') ||
    $('div.post-thumbnail img').attr('data-src') ||
    $('meta[property="og:image"]').attr('content')
  );
  
  return {
    title: title.replace(/\s+/g, ' '),
    description: description.replace(/\s+/g, ' '),
    year,
    genres,
    thumbnail,
  };
}

// Extract iframe embeds from episode page
function extractIframeEmbeds(html) {
  const $ = cheerio.load(html);
  const iframes = [];
  
  // Look for iframes in option divs
  for (let i = 1; i <= 20; i++) {
    const container = $(`div#options-${i}`);
    if (!container.length) continue;
    container.find('iframe').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      const url = normalizeUrl(src);
      if (url) iframes.push({ option: i, url });
    });
  }
  
  // Fallback: find all iframes
  $('iframe').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('data-src');
    const url = normalizeUrl(src);
    if (url && !iframes.some(x => x.url === url)) {
      iframes.push({ option: null, url });
    }
  });
  
  return iframes;
}

// Scrape and save a single episode
export async function scrapeEpisode(episodeUrl, options = {}) {
  console.log(`\n🔍 Scraping episode: ${episodeUrl}`);
  
  try {
    // Parse episode code
    const epCode = parseEpisodeCode(episodeUrl);
    if (!epCode) {
      console.error(`   ❌ Could not parse episode code from URL`);
      return null;
    }
    
    console.log(`   📺 Detected: Season ${epCode.season}, Episode ${epCode.episode}`);
    
    // Fetch episode page
    const html = await fetchHtmlWithRetry(episodeUrl);
    const $ = cheerio.load(html);
    
    // Extract series info from breadcrumbs
    let seriesUrl = normalizeUrl($('nav.breadcrumb a[href*="/series/"]').last().attr('href'));
    let seriesTitle = $('nav.breadcrumb a[href*="/series/"]').last().text().trim();
    
    // Fallback: Try alternative breadcrumb selectors
    if (!seriesUrl || !seriesTitle) {
      seriesUrl = normalizeUrl($('div.breadcrumb a[href*="/series/"]').last().attr('href'));
      seriesTitle = $('div.breadcrumb a[href*="/series/"]').last().text().trim();
    }
    
    // Fallback: Extract from URL pattern (e.g., /episode/series-name-1x5/)
    if (!seriesUrl || !seriesTitle) {
      console.log(`   ⚠️  Breadcrumbs not found, deriving from URL...`);
      try {
        const urlObj = new URL(episodeUrl);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const episodeSegment = pathParts[pathParts.length - 1];
        const derivedSlug = episodeSegment.replace(/-\d+x\d+\/?$/, '');
        
        seriesTitle = derivedSlug.split('-').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
        
        seriesUrl = normalizeUrl(`/series/${derivedSlug}/`);
        
        console.log(`   📝 Derived series: ${seriesTitle} (${derivedSlug})`);
      } catch (err) {
        console.error(`   ❌ Could not derive series information from URL`);
        return null;
      }
    }
    
    // Fallback: Extract from page metadata
    if (!seriesTitle) {
      seriesTitle = $('meta[property="og:title"]').attr('content')?.trim();
      if (seriesTitle) {
        seriesTitle = seriesTitle.split('-')[0].trim();
        console.log(`   📝 Series from og:title: ${seriesTitle}`);
      }
    }
    
    if (!seriesUrl || !seriesTitle) {
      console.error(`   ❌ Could not find or derive series information`);
      return null;
    }
    
    console.log(`   📚 Series: ${seriesTitle}`);
    
    // Get or create series in database
    const seriesSlug = cleanSlug(seriesTitle);
    let series = await getSeriesBySlug(seriesSlug);
    
    if (!series) {
      console.log(`   💾 Creating new series in database...`);
      
      // Fetch series page for more info
      const seriesHtml = await fetchHtmlWithRetry(seriesUrl);
      const seriesData = extractCommonFields(seriesHtml);
      
      const newSeries = {
        slug: seriesSlug,
        title: seriesTitle,
        description: seriesData.description,
        poster: seriesData.thumbnail,
        year: seriesData.year,
        genres: seriesData.genres,
      };
      
      // Enrich with TMDB if enabled
      const enrichedSeries = await enrichSeriesWithTMDB(newSeries);
      series = await upsertSeries(enrichedSeries);
      
      console.log(`   ✅ Series created: ${series.title}`);
    }
    
    // Check if episode already exists
    const existing = await getEpisode(seriesSlug, epCode.season, epCode.episode);
    if (existing && !options.force) {
      console.log(`   ⚠️  Episode already exists. Use --force to update.`);
      return existing;
    }
    
    // Extract episode data
    const epData = extractCommonFields(html);
    const embeds = extractIframeEmbeds(html);
    
    const episodeData = {
      series_slug: seriesSlug,
      season: epCode.season,
      episode: epCode.episode,
      title: epData.title || `Episode ${epCode.episode}`,
      thumbnail: epData.thumbnail,
      servers: embeds.map(e => ({ option: e.option, url: e.url })),
    };
    
    // Save episode
    const savedEpisode = await upsertEpisode(episodeData);
    console.log(`   ✅ Episode saved: ${savedEpisode.title}`);
    
    // Add to latest episodes
    await addToLatestEpisodes({
      ...savedEpisode,
      series_title: series.title,
    }, CONFIG.monitoring.maxLatestEpisodes);
    
    console.log(`   📊 Found ${embeds.length} video sources`);
    
    return savedEpisode;
  } catch (error) {
    console.error(`   ❌ Error scraping episode:`, error.message);
    return null;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  validateConfig();
  
  const args = process.argv.slice(2);
  const url = args.find(arg => !arg.startsWith('--'));
  const force = args.includes('--force');
  
  if (!url) {
    console.log('Usage: node scraper.js <episode-url> [--force]');
    console.log('Example: node scraper.js https://toonstream.love/episode/naruto-1x1/');
    process.exit(1);
  }
  
  await scrapeEpisode(url, { force });
  process.exit(0);
}
