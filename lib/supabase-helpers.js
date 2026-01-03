import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

export function initSupabase(url, key) {
  if (!url || !key) {
    throw new Error('Supabase URL and SERVICE_ROLE_KEY are required');
  }
  supabaseClient = createClient(url, key);
  return supabaseClient;
}

export function getSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase not initialized. Call initSupabase first.');
  }
  return supabaseClient;
}

export async function ensureSeriesExists(seriesSlug, seriesTitle) {
  const supabase = getSupabase();
  
  const { data: existing } = await supabase
    .from('series')
    .select('slug')
    .eq('slug', seriesSlug)
    .single();

  if (existing) {
    return { slug: seriesSlug, created: false };
  }

  const { error } = await supabase
    .from('series')
    .insert({
      slug: seriesSlug,
      title: seriesTitle,
      description: '',
      poster: '',
      year: new Date().getFullYear(),
    });

  if (error && !error.message.includes('duplicate')) {
    throw error;
  }

  console.log(`   ✅ Series created: ${seriesTitle} (${seriesSlug})`);
  return { slug: seriesSlug, created: true };
}

export async function saveEpisode(episodeData) {
  const supabase = getSupabase();
  
  await ensureSeriesExists(episodeData.series_slug, episodeData.series_title);

  const { data: existing } = await supabase
    .from('episodes')
    .select('id')
    .eq('series_slug', episodeData.series_slug)
    .eq('season', episodeData.season)
    .eq('episode', episodeData.episode)
    .single();

  if (existing) {
    console.log(`   ⚠️  Episode already exists: ${episodeData.title}`);
    return { saved: false, exists: true };
  }

  const { error } = await supabase
    .from('episodes')
    .insert({
      series_slug: episodeData.series_slug,
      season: episodeData.season,
      episode: episodeData.episode,
      title: episodeData.title,
      thumbnail: episodeData.thumbnail || '',
      servers: episodeData.servers || [],
    });

  if (error) {
    throw error;
  }

  console.log(`   ✅ Episode saved: ${episodeData.title}`);
  return { saved: true, exists: false };
}

export async function addToLatestEpisodes(episodeData) {
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from('latest_episodes')
    .select('id')
    .eq('series_slug', episodeData.series_slug)
    .eq('season', episodeData.season)
    .eq('episode', episodeData.episode)
    .single();

  if (existing) {
    return { added: false };
  }

  const { error } = await supabase
    .from('latest_episodes')
    .insert({
      series_slug: episodeData.series_slug,
      series_title: episodeData.series_title,
      season: episodeData.season,
      episode: episodeData.episode,
      episode_title: episodeData.title,
      thumbnail: episodeData.thumbnail || '',
    });

  if (error && !error.message.includes('duplicate')) {
    throw error;
  }

  return { added: true };
}

export async function pruneLatestEpisodes(maxEpisodes = 9) {
  const supabase = getSupabase();

  const { data: allEpisodes } = await supabase
    .from('latest_episodes')
    .select('id')
    .order('added_at', { ascending: false });

  if (!allEpisodes || allEpisodes.length <= maxEpisodes) {
    return { pruned: 0 };
  }

  const toDelete = allEpisodes.slice(maxEpisodes).map((e) => e.id);

  const { error } = await supabase
    .from('latest_episodes')
    .delete()
    .in('id', toDelete);

  if (error) {
    throw error;
  }

  return { pruned: toDelete.length };
}
