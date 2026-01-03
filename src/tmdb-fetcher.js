import axios from 'axios';
import { CONFIG } from './config.js';

const TMDB_BASE_URL = CONFIG.tmdb.baseUrl;
const TMDB_IMAGE_BASE = CONFIG.tmdb.imageBase;
const TMDB_API_KEY = CONFIG.tmdb.apiKey;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeTitleForTMDB(title) {
  if (!title) return title;
  return title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function searchTMDB(title, type = 'tv') {
  if (!TMDB_API_KEY) {
    console.warn('⚠️  TMDB API key not configured. Skipping TMDB search.');
    return null;
  }
  
  try {
    await delay(CONFIG.tmdb.delay);
    
    const sanitizedTitle = sanitizeTitleForTMDB(title);
    if (sanitizedTitle !== title) {
      console.log(`   📝 Sanitized title: "${title}" → "${sanitizedTitle}"`);
    }
    
    const searchUrl = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(sanitizedTitle)}&language=en-US`;
    const response = await axios.get(searchUrl);
    
    if (response.data.results && response.data.results.length > 0) {
      return response.data.results[0].id;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ TMDB search error for "${title}":`, error.message);
    return null;
  }
}

export async function fetchTMDBDetails(tmdbId, type = 'tv') {
  if (!TMDB_API_KEY || !tmdbId) return null;
  
  try {
    await delay(CONFIG.tmdb.delay);
    
    const detailsUrl = `${TMDB_BASE_URL}/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=images,credits`;
    const response = await axios.get(detailsUrl);
    const data = response.data;
    
    // Extract genres
    const genres = data.genres ? data.genres.map(g => g.name) : [];
    
    // Extract studios/production companies
    const studios = data.production_companies ? data.production_companies.map(c => c.name) : [];
    
    // Extract posters
    const posters = [];
    if (data.poster_path) {
      posters.push(`${TMDB_IMAGE_BASE}${data.poster_path}`);
    }
    if (data.images && data.images.posters) {
      data.images.posters.slice(0, 5).forEach(img => {
        const url = `${TMDB_IMAGE_BASE}${img.file_path}`;
        if (!posters.includes(url)) {
          posters.push(url);
        }
      });
    }
    
    // Extract backdrops
    const backdrops = [];
    if (data.backdrop_path) {
      backdrops.push(`${TMDB_IMAGE_BASE}${data.backdrop_path}`);
    }
    if (data.images && data.images.backdrops) {
      data.images.backdrops.slice(0, 5).forEach(img => {
        const url = `${TMDB_IMAGE_BASE}${img.file_path}`;
        if (!backdrops.includes(url)) {
          backdrops.push(url);
        }
      });
    }
    
    return {
      tmdb_id: data.id,
      title: data.name || data.title || null,
      description: data.overview || null,
      rating: data.vote_average ? parseFloat(data.vote_average.toFixed(2)) : null,
      popularity: data.popularity ? parseFloat(data.popularity.toFixed(3)) : null,
      status: data.status || null,
      genres: genres,
      studios: studios,
      release_date: data.first_air_date || data.release_date || null,
      total_seasons: data.number_of_seasons || null,
      total_episodes: data.number_of_episodes || null,
      runtime: data.runtime || null,
      posters: posters,
      backdrops: backdrops,
      poster: posters[0] || null,
      banner_image: backdrops[0] || null,
      cover_image_large: posters[0] || null,
      cover_image_extra_large: posters[0] || null,
    };
  } catch (error) {
    console.error(`❌ TMDB details error for ID ${tmdbId}:`, error.message);
    return null;
  }
}

export async function fetchTMDBData(title, type = 'tv') {
  if (!TMDB_API_KEY) {
    return null;
  }
  
  try {
    console.log(`   🔍 Fetching TMDB data for: ${title}`);
    const tmdbId = await searchTMDB(title, type);
    
    if (!tmdbId) {
      console.log(`   ⚠️  No TMDB results found for "${title}"`);
      return null;
    }
    
    const details = await fetchTMDBDetails(tmdbId, type);
    
    if (details) {
      console.log(`   ✓ TMDB data fetched successfully (ID: ${tmdbId})`);
      console.log(`   📊 Rating: ${details.rating || 'N/A'} | Popularity: ${details.popularity || 'N/A'}`);
      if (details.genres && details.genres.length > 0) {
        console.log(`   🎭 Genres: ${details.genres.join(', ')}`);
      }
    }
    
    return details;
  } catch (error) {
    console.error(`   ❌ TMDB fetch error:`, error.message);
    return null;
  }
}

export async function enrichSeriesWithTMDB(seriesData) {
  const tmdbData = await fetchTMDBData(seriesData.title, 'tv');
  
  if (tmdbData) {
    // Merge TMDB data with existing series data
    return {
      ...seriesData,
      tmdb_id: tmdbData.tmdb_id,
      description: tmdbData.description || seriesData.description,
      rating: tmdbData.rating,
      popularity: tmdbData.popularity,
      status: tmdbData.status,
      genres: tmdbData.genres,
      studios: tmdbData.studios,
      release_date: tmdbData.release_date,
      total_seasons: tmdbData.total_seasons || seriesData.total_seasons,
      total_episodes: tmdbData.total_episodes,
      posters: tmdbData.posters,
      backdrops: tmdbData.backdrops,
      poster: tmdbData.poster || seriesData.poster,
      banner_image: tmdbData.banner_image || seriesData.banner_image,
      cover_image_large: tmdbData.cover_image_large || seriesData.cover_image_large,
      cover_image_extra_large: tmdbData.cover_image_extra_large || seriesData.cover_image_extra_large,
      year: seriesData.year || (tmdbData.release_date ? parseInt(tmdbData.release_date.split('-')[0]) : null),
    };
  }
  
  return seriesData;
}
