import { fetchHtmlWithRetry, delay } from './lib/fetch-utils.js';
import { extractHomepageEpisodeCards, filterRelevantHomepageEntries, parseEpisodeCode, deriveSeriesSlugFromEpisodeUrl, sanitizeTitle } from './lib/homepage-parser.js';
import { initSupabase, saveEpisode, addToLatestEpisodes, pruneLatestEpisodes } from './lib/supabase-helpers.js';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG = {
  HOME_URL: 'https://toonstream.love/',
  POLL_INTERVAL_MS: 3000,
  MAX_LATEST_EPISODES: 9,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const processedEpisodes = new Set();
let isRunning = true;

async function scrapeEpisodeDetails(episodeUrl) {
  const html = await fetchHtmlWithRetry(episodeUrl);
  const $ = cheerio.load(html);

  let seriesTitle = null;
  let seriesSlug = null;

  const breadcrumbLink = $('nav.breadcrumb a[href*="/series/"]').last();
  if (breadcrumbLink.length) {
    seriesTitle = breadcrumbLink.text().trim();
    const seriesUrl = breadcrumbLink.attr('href');
    if (seriesUrl) {
      seriesSlug = seriesUrl.split('/').filter(Boolean).pop();
    }
  }

  if (!seriesTitle || !seriesSlug) {
    const divBreadcrumbLink = $('div.breadcrumb a[href*="/series/"]').last();
    if (divBreadcrumbLink.length) {
      seriesTitle = divBreadcrumbLink.text().trim();
      const seriesUrl = divBreadcrumbLink.attr('href');
      if (seriesUrl) {
        seriesSlug = seriesUrl.split('/').filter(Boolean).pop();
      }
    }
  }

  if (!seriesTitle || !seriesSlug) {
    console.log('   ⚠️  Breadcrumbs not found, deriving from URL...');
    seriesSlug = deriveSeriesSlugFromEpisodeUrl(episodeUrl);
    seriesTitle = seriesSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  seriesTitle = sanitizeTitle(seriesTitle);

  const thumbnail = $('.video-options img').attr('data-src') || $('.post-thumbnail img').attr('data-src') || $('meta[property="og:image"]').attr('content') || '';

  const servers = [];
  for (let i = 1; i <= 20; i++) {
    const container = $(`div#options-${i}`);
    if (!container.length) continue;
    container.find('iframe').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src) servers.push(src);
    });
  }

  return { seriesTitle, seriesSlug, thumbnail, servers };
}

async function processEpisodeCard(card) {
  const episodeCode = parseEpisodeCode(card.url);
  if (!episodeCode) {
    console.log(`   ⚠️  Skipping ${card.url} - no episode code found`);
    return;
  }

  const episodeKey = `${card.url}`;
  if (processedEpisodes.has(episodeKey)) {
    return;
  }

  console.log(`   🆕 New episode detected: ${card.title}`);
  console.log(`      URL: ${card.url}`);

  try {
    const details = await scrapeEpisodeDetails(card.url);

    const episodeData = {
      series_slug: details.seriesSlug,
      series_title: details.seriesTitle,
      season: episodeCode.season,
      episode: episodeCode.episode,
      title: card.title,
      thumbnail: card.thumbnail || details.thumbnail,
      servers: details.servers,
    };

    await saveEpisode(episodeData);
    await addToLatestEpisodes(episodeData);
    await pruneLatestEpisodes(CONFIG.MAX_LATEST_EPISODES);

    processedEpisodes.add(episodeKey);
    console.log(`   ✅ Successfully processed: ${details.seriesSlug}_${episodeCode.season}_${episodeCode.episode}`);
  } catch (err) {
    console.error(`   ❌ Error processing ${card.url}:`, err.message);
  }
}

async function pollHomepage() {
  try {
    console.log(`🔍 [${new Date().toISOString()}] Polling homepage for new episodes...`);
    const html = await fetchHtmlWithRetry(CONFIG.HOME_URL);
    const allCards = extractHomepageEpisodeCards(html);
    const episodeCards = filterRelevantHomepageEntries(allCards);

    console.log(`   📊 Found ${episodeCards.length} episode card(s) on homepage`);

    for (const card of episodeCards) {
      await processEpisodeCard(card);
    }

    if (episodeCards.length === 0 || processedEpisodes.size > 0) {
      console.log(`   ✨ No new episodes detected`);
    }
  } catch (err) {
    console.error(`❌ Error polling homepage:`, err.message);
    console.log(`   🔁 Retrying in 3 seconds...`);
  }
}

async function startMonitoring() {
  console.log('============================================================');
  console.log('🚀 Starting Standalone Episode Monitoring Service');
  console.log('============================================================');
  console.log(`📡 Polling interval: ${CONFIG.POLL_INTERVAL_MS}ms (3s)`);
  console.log(`🎯 Target: ${CONFIG.HOME_URL}`);
  console.log(`📊 Max latest episodes: ${CONFIG.MAX_LATEST_EPISODES}`);
  console.log('============================================================\n');

  while (isRunning) {
    await pollHomepage();
    await delay(CONFIG.POLL_INTERVAL_MS);
  }
}

function handleShutdown(signal) {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  isRunning = false;
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

(async () => {
  try {
    if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required');
    }

    initSupabase(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
    console.log('✅ Supabase initialized successfully\n');

    await startMonitoring();
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
})();
