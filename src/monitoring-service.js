import * as cheerio from 'cheerio';
import { CONFIG } from './config.js';
import { fetchHtmlWithRetry, scrapeEpisode } from './scraper.js';

const processedEpisodes = new Set();
let isRunning = false;
let pollTimeout = null;

function normalizeUrl(rawUrl, base = CONFIG.scraper.url) {
  if (!rawUrl || /^javascript:/i.test(rawUrl)) return null;
  try {
    return new URL(rawUrl, base).href;
  } catch {
    return null;
  }
}

function extractHomepageEpisodeCards(html) {
  const $ = cheerio.load(html);
  const episodes = [];
  const seen = new Set();

  const matchRegex = /\/(episode|watch|anime|series)\//i;

  $('a[href]').each((index, el) => {
    const href = normalizeUrl($(el).attr('href'));
    if (!href || !matchRegex.test(href)) return;
    if (!href.startsWith(CONFIG.scraper.url)) return;
    if (seen.has(href)) return;

    seen.add(href);

    let title = ($(el).attr('title') || $(el).text().trim()).replace(/\s+/g, ' ');
    
    let thumb = null;
    const img = $(el).find('img').first();
    if (img.length) {
      thumb = normalizeUrl(img.attr('data-src') || img.attr('src'));
    }
    
    let card = $(el).closest('article, li, .post-item, .film-item');
    if (!thumb && card.length) {
      const cardImg = card.find('img').first();
      if (cardImg.length) thumb = normalizeUrl(cardImg.attr('data-src') || cardImg.attr('src'));
    }

    const contextNode = $(el).closest('section, div.widget, article, div');
    let context = null;
    if (contextNode.length) {
      const headerText = contextNode
        .find('header h1, header h2, header h3, h2.widget-title, h3.widget-title')
        .first()
        .text()
        .trim();
      context = headerText || contextNode.attr('id') || contextNode.attr('class') || null;
    }

    if (!title) title = context || 'Untitled';

    episodes.push({
      title,
      url: href,
      thumbnail: thumb,
      context: context || 'page',
    });
  });

  return episodes;
}

function filterRelevantEpisodes(episodes) {
  return episodes.filter(e => {
    const url = e.url.toLowerCase();
    return url.includes('/episode/') && /\d+x\d+/.test(url);
  });
}

function createEpisodeKey(url) {
  const match = url.match(/(\d+)x(\d+)/i);
  if (!match) return null;
  
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const episodeSegment = pathParts[pathParts.length - 1];
    const seriesSlug = episodeSegment.replace(/-\d+x\d+\/?$/, '');
    
    return `${seriesSlug}_${match[1]}_${match[2]}`;
  } catch {
    return null;
  }
}

async function pollHomepage() {
  if (!isRunning) return;

  try {
    console.log(`\n🔍 [${new Date().toISOString()}] Polling homepage for new episodes...`);
    
    const html = await fetchHtmlWithRetry(CONFIG.scraper.url);
    const allCards = extractHomepageEpisodeCards(html);
    const episodeCards = filterRelevantEpisodes(allCards);
    
    console.log(`   📊 Found ${episodeCards.length} episode card(s) on homepage`);
    
    let newCount = 0;
    
    for (const card of episodeCards) {
      const episodeKey = createEpisodeKey(card.url);
      
      if (!episodeKey) {
        console.log(`   ⚠️  Could not parse episode code from: ${card.url}`);
        continue;
      }
      
      if (processedEpisodes.has(episodeKey)) {
        continue;
      }
      
      console.log(`\n   🆕 New episode detected: ${card.title}`);
      console.log(`      URL: ${card.url}`);
      
      try {
        await scrapeEpisode(card.url, { force: false });
        processedEpisodes.add(episodeKey);
        newCount++;
        console.log(`   ✅ Successfully processed: ${episodeKey}`);
      } catch (error) {
        console.error(`   ❌ Failed to process episode:`, error.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (newCount > 0) {
      console.log(`\n   📈 Processed ${newCount} new episode(s) this cycle`);
    } else {
      console.log(`   ✨ No new episodes detected`);
    }
    
  } catch (error) {
    console.error(`   ❌ Error polling homepage:`, error.message);
  }
  
  if (isRunning) {
    pollTimeout = setTimeout(pollHomepage, CONFIG.monitoring.pollInterval);
  }
}

export function startMonitoring() {
  if (isRunning) {
    console.log('⚠️  Monitoring is already running');
    return;
  }
  
  console.log('='.repeat(60));
  console.log('🚀 Starting Episode Monitoring Service');
  console.log('='.repeat(60));
  console.log(`📡 Polling interval: ${CONFIG.monitoring.pollInterval}ms (${CONFIG.monitoring.pollInterval / 1000}s)`);
  console.log(`🎯 Target: ${CONFIG.scraper.url}`);
  console.log(`📊 Max latest episodes: ${CONFIG.monitoring.maxLatestEpisodes}`);
  console.log('='.repeat(60));
  
  isRunning = true;
  pollHomepage();
}

export function stopMonitoring() {
  if (!isRunning) {
    console.log('⚠️  Monitoring is not running');
    return;
  }
  
  console.log('\n🛑 Stopping Episode Monitoring Service...');
  isRunning = false;
  
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  
  console.log('✅ Monitoring service stopped');
}

export function getMonitoringStatus() {
  return {
    running: isRunning,
    processedCount: processedEpisodes.size,
    pollInterval: CONFIG.monitoring.pollInterval,
    maxLatestEpisodes: CONFIG.monitoring.maxLatestEpisodes,
  };
}
