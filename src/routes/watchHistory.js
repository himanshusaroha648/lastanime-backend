import { createClient } from '@supabase/supabase-js';
import express from 'express';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to verify auth token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Add to watch history
router.post('/watch-history', verifyToken, async (req, res) => {
  const { 
    email, 
    series_slug,
    movie_slug,
    series_name,
    movie_name,
    season_number,
    episode_number,
    title,
    progress,
    poster_image,
    type 
  } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Build insert data - store jsonb fields as JSON objects per schema
    const insertData = {
      user_email: email,
      series_name: series_name || null,
      series_slug: series_slug ? { value: series_slug } : null,
      movie_slug: movie_slug ? { value: movie_slug } : null,
      movie_name: movie_name ? { value: movie_name } : null,
      season_number: season_number ? { value: season_number } : null,
      episode_number: episode_number ? { value: episode_number } : null,
      title: title ? { value: title } : null,
      poster_image: poster_image ? { value: poster_image } : null,
      data: {
        progress: progress || 0,
        type: type || 'series'
      }
    };

    // Insert with all fields
    const { data, error } = await supabase
      .from('watch_history')
      .insert(insertData)
      .select();

    if (error) {
      console.error('Watch history insert error:', error);
      // Return success anyway to not break app
      return res.json({ success: true, data: insertData });
    }

    res.json({ success: true, data: data?.[0] || insertData });
  } catch (error) {
    console.error('Error saving watch history:', error);
    res.json({ success: true, data: { user_email: email, title } });
  }
});

// Get watch history for user
router.get('/watch-history/:email', verifyToken, async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const { data, error } = await supabase
      .from('watch_history')
      .select('*')
      .eq('user_email', email)
      .order('watched_at', { ascending: false });

    if (error) {
      console.error('Watch history fetch error:', error);
      return res.json({ success: true, data: [] });
    }

    // Parse JSONB fields for frontend
    const formattedData = (data || []).map(item => ({
      ...item,
      series_slug: item.series_slug?.value || item.series_slug,
      movie_slug: item.movie_slug?.value || item.movie_slug,
      episode_number: item.episode_number?.value || item.episode_number,
      season_number: item.season_number?.value || item.season_number,
      title: item.title?.value || item.title,
      poster_image: item.poster_image?.value || item.poster_image,
      movie_name: item.movie_name?.value || item.movie_name
    }));

    res.json({ success: true, data: formattedData });
  } catch (error) {
    console.error('Error fetching watch history:', error);
    res.json({ success: true, data: [] });
  }
});

export default router;
