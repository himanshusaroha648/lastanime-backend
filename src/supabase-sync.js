import {
  supabase,
  getAllSeries,
  getEpisodesBySeriesSlug,
  getMissingEpisodes,
  getSeriesStats,
  upsertSeries,
  upsertEpisode,
} from './supabase-client.js';
import { enrichSeriesWithTMDB } from './tmdb-fetcher.js';
import { validateConfig } from './config.js';

// Analyze and report on all series in database
export async function analyzeAllSeries() {
  console.log('🔍 Analyzing all series in database...\n');
  
  const allSeries = await getAllSeries();
  console.log(`📊 Found ${allSeries.length} series in database\n`);
  
  const results = [];
  
  for (const series of allSeries) {
    const stats = await getSeriesStats(series.slug);
    
    results.push({
      slug: series.slug,
      title: series.title,
      ...stats,
    });
    
    console.log(`📺 ${series.title} (${series.slug})`);
    console.log(`   Seasons: ${stats.totalSeasons} | Episodes: ${stats.totalEpisodes}`);
    
    if (stats.missingCount > 0) {
      console.log(`   ⚠️  Missing ${stats.missingCount} episodes:`);
      stats.missing.slice(0, 5).forEach(m => {
        console.log(`      - Season ${m.season}, Episode ${m.episode}`);
      });
      if (stats.missingCount > 5) {
        console.log(`      ... and ${stats.missingCount - 5} more`);
      }
    } else {
      console.log(`   ✅ No missing episodes detected`);
    }
    console.log('');
  }
  
  return results;
}

// Find series that are missing TMDB data
export async function findSeriesMissingTMDB() {
  console.log('🔍 Finding series without TMDB data...\n');
  
  const allSeries = await getAllSeries();
  const missing = allSeries.filter(s => !s.tmdb_id || !s.rating || !s.genres || s.genres.length === 0);
  
  console.log(`📊 Found ${missing.length} series missing TMDB data\n`);
  
  missing.forEach(s => {
    const missingFields = [];
    if (!s.tmdb_id) missingFields.push('tmdb_id');
    if (!s.rating) missingFields.push('rating');
    if (!s.genres || s.genres.length === 0) missingFields.push('genres');
    if (!s.banner_image) missingFields.push('banner_image');
    
    console.log(`📺 ${s.title} (${s.slug})`);
    console.log(`   Missing: ${missingFields.join(', ')}\n`);
  });
  
  return missing;
}

// Enrich series with TMDB data
export async function enrichSeriesData(seriesSlug) {
  console.log(`🔍 Enriching series: ${seriesSlug}\n`);
  
  const { data: series } = await supabase
    .from('series')
    .select('*')
    .eq('slug', seriesSlug)
    .single();
  
  if (!series) {
    console.error(`❌ Series not found: ${seriesSlug}`);
    return null;
  }
  
  console.log(`📺 Found: ${series.title}`);
  
  const enrichedData = await enrichSeriesWithTMDB(series);
  
  if (enrichedData.tmdb_id) {
    console.log(`💾 Updating series with TMDB data...`);
    const updated = await upsertSeries(enrichedData);
    console.log(`✅ Successfully enriched: ${updated.title}`);
    return updated;
  } else {
    console.log(`⚠️  No TMDB data found for this series`);
    return null;
  }
}

// Enrich all series that are missing TMDB data
export async function enrichAllSeriesWithTMDB() {
  console.log('🚀 Starting bulk TMDB enrichment...\n');
  
  const missing = await findSeriesMissingTMDB();
  
  if (missing.length === 0) {
    console.log('✅ All series already have TMDB data!');
    return { success: 0, failed: 0, total: 0 };
  }
  
  let success = 0;
  let failed = 0;
  
  for (const series of missing) {
    try {
      console.log(`\n[${success + failed + 1}/${missing.length}] Processing: ${series.title}`);
      const result = await enrichSeriesData(series.slug);
      
      if (result && result.tmdb_id) {
        success++;
      } else {
        failed++;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      console.error(`❌ Error enriching ${series.slug}:`, error.message);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Enrichment Complete!');
  console.log('='.repeat(50));
  console.log(`✅ Successfully enriched: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total processed: ${missing.length}`);
  console.log('='.repeat(50));
  
  return { success, failed, total: missing.length };
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  validateConfig();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'analyze':
      await analyzeAllSeries();
      break;
    case 'missing-tmdb':
      await findSeriesMissingTMDB();
      break;
    case 'enrich':
      if (process.argv[3]) {
        await enrichSeriesData(process.argv[3]);
      } else {
        console.error('❌ Please provide series slug: node supabase-sync.js enrich <series-slug>');
      }
      break;
    case 'enrich-all':
      await enrichAllSeriesWithTMDB();
      break;
    default:
      console.log('Usage:');
      console.log('  node supabase-sync.js analyze          - Analyze all series and find missing episodes');
      console.log('  node supabase-sync.js missing-tmdb     - Find series missing TMDB data');
      console.log('  node supabase-sync.js enrich <slug>    - Enrich specific series with TMDB data');
      console.log('  node supabase-sync.js enrich-all       - Enrich all series with TMDB data');
  }
  
  process.exit(0);
}
