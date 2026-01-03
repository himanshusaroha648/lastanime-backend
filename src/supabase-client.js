import { createClient } from '@supabase/supabase-js';
import { CONFIG } from './config.js';

export const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.key);

// Helper functions for database operations
export async function getSeriesBySlug(slug) {
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .eq('slug', slug)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    throw error;
  }
  
  return data;
}

export async function getAllSeries() {
  const { data, error } = await supabase
    .from('series')
    .select('*')
    .order('title');
  
  if (error) throw error;
  return data || [];
}

export async function upsertSeries(seriesData) {
  const { data, error } = await supabase
    .from('series')
    .upsert(seriesData, { onConflict: 'slug' })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getEpisodesBySeriesSlug(seriesSlug) {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('series_slug', seriesSlug)
    .order('season')
    .order('episode');
  
  if (error) throw error;
  return data || [];
}

export async function getEpisode(seriesSlug, season, episode) {
  const { data, error } = await supabase
    .from('episodes')
    .select('*')
    .eq('series_slug', seriesSlug)
    .eq('season', season)
    .eq('episode', episode)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  
  return data;
}

export async function upsertEpisode(episodeData) {
  const { data, error } = await supabase
    .from('episodes')
    .upsert(episodeData, { 
      onConflict: 'series_slug,season,episode' 
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function addToLatestEpisodes(episodeData, maxLatest = 9) {
  const latestData = {
    series_slug: episodeData.series_slug,
    series_title: episodeData.series_title || episodeData.title,
    season: episodeData.season,
    episode: episodeData.episode,
    episode_title: episodeData.title,
    thumbnail: episodeData.thumbnail || episodeData.episode_card_thumbnail,
    added_at: new Date().toISOString(),
  };
  
  const { error } = await supabase
    .from('latest_episodes')
    .upsert(latestData, { 
      onConflict: 'series_slug,season,episode' 
    });
  
  if (error) throw error;
  
  await pruneLatestEpisodes(maxLatest);
}

export async function pruneLatestEpisodes(maxCount = 9) {
  const { data: allLatest, error: fetchError } = await supabase
    .from('latest_episodes')
    .select('*')
    .order('added_at', { ascending: false });
  
  if (fetchError) throw fetchError;
  
  if (allLatest && allLatest.length > maxCount) {
    const toDelete = allLatest.slice(maxCount);
    const idsToDelete = toDelete.map(item => 
      `${item.series_slug}_${item.season}_${item.episode}`
    );
    
    for (const item of toDelete) {
      const { error: deleteError } = await supabase
        .from('latest_episodes')
        .delete()
        .eq('series_slug', item.series_slug)
        .eq('season', item.season)
        .eq('episode', item.episode);
      
      if (deleteError) {
        console.warn(`Warning: Failed to delete old episode from latest_episodes:`, deleteError);
      }
    }
  }
}

export async function getLatestEpisodes(limit = 9) {
  const { data, error } = await supabase
    .from('latest_episodes')
    .select('*')
    .order('added_at', { ascending: false })
    .limit(limit);
  
  if (error) throw error;
  return data || [];
}

export async function getMissingEpisodes(seriesSlug) {
  // Get all episodes for this series
  const episodes = await getEpisodesBySeriesSlug(seriesSlug);
  
  if (episodes.length === 0) return [];
  
  // Group by season
  const seasons = {};
  episodes.forEach(ep => {
    if (!seasons[ep.season]) seasons[ep.season] = [];
    seasons[ep.season].push(ep.episode);
  });
  
  // Find missing episodes in each season
  const missing = [];
  Object.entries(seasons).forEach(([season, episodeNumbers]) => {
    const seasonNum = parseInt(season);
    const sortedEps = episodeNumbers.sort((a, b) => a - b);
    const maxEp = Math.max(...sortedEps);
    
    // Check for gaps
    for (let ep = 1; ep <= maxEp; ep++) {
      if (!sortedEps.includes(ep)) {
        missing.push({ season: seasonNum, episode: ep });
      }
    }
  });
  
  return missing;
}

export async function getSeriesStats(seriesSlug) {
  const episodes = await getEpisodesBySeriesSlug(seriesSlug);
  const missing = await getMissingEpisodes(seriesSlug);
  
  const seasons = [...new Set(episodes.map(ep => ep.season))].sort((a, b) => a - b);
  
  return {
    totalEpisodes: episodes.length,
    totalSeasons: seasons.length,
    seasons: seasons,
    missingCount: missing.length,
    missing: missing,
  };
}
