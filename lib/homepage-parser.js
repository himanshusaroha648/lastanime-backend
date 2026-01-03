import * as cheerio from 'cheerio';
import { normalizeUrl } from './fetch-utils.js';

export function extractHomepageEpisodeCards(html) {
  const $ = cheerio.load(html);
  const episodes = [];
  const seen = new Set();

  const matchRegex = /\/(episode|watch|anime|series)\//i;

  $('a[href]').each((index, el) => {
    const href = normalizeUrl($(el).attr('href'));
    if (!href || !matchRegex.test(href)) return;
    if (!href.startsWith('https://toonstream.love')) return;
    if (seen.has(href)) return;

    seen.add(href);
    episodes.push(collectAnchorInfo($, $(el)));
  });

  return episodes;
}

function collectAnchorInfo($, anchor) {
  let title = (anchor.attr('title') || anchor.text().trim()).replace(/\s+/g, ' ');
  const href = normalizeUrl(anchor.attr('href'));

  let thumb = null;
  const img = anchor.find('img').first();
  if (img.length) {
    thumb = normalizeUrl(img.attr('data-src') || img.attr('src'));
  }
  let card = anchor.closest('article, li, .post-item, .film-item');
  if (!thumb && card.length) {
    const cardImg = card.find('img').first();
    if (cardImg.length) thumb = normalizeUrl(cardImg.attr('data-src') || cardImg.attr('src'));
  }

  if (!card.length) card = anchor.parent();

  const contextNode = anchor.closest('section, div.widget, article, div');
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

  return {
    title,
    url: href,
    thumbnail: thumb,
    context: context || 'page',
  };
}

export function filterRelevantHomepageEntries(entries) {
  return entries.filter((e) => e.url && /\/episode\//i.test(e.url));
}

export function parseEpisodeCode(url) {
  const match = url.match(/(\d+)x(\d+)/i);
  if (!match) return null;
  return {
    season: parseInt(match[1], 10),
    episode: parseInt(match[2], 10),
  };
}

export function deriveSeriesSlugFromEpisodeUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    const episodePart = parts[parts.length - 1];
    const episodeCode = episodePart.match(/(\d+)x(\d+)/i);
    if (episodeCode) {
      return episodePart.replace(/-\d+x\d+$/i, '');
    }
    return episodePart;
  } catch {
    return 'unknown';
  }
}

export function sanitizeTitle(title) {
  return title.replace(/\s*\([^)]*\)\s*/g, '').trim();
}
