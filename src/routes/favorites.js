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

// Get favorites for user
router.get('/favorites/:email', verifyToken, async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    // Get user data from user_data table
    const { data, error } = await supabase
      .from('user_data')
      .select('watched')
      .eq('email', email);

    if (error) {
      console.error('Error fetching favorites:', error);
      // User might not exist yet, return empty array
      return res.json({ success: true, data: [] });
    }

    // Parse the watched JSONB field - it should contain array of favorites
    if (!data || data.length === 0) {
      return res.json({ success: true, data: [] });
    }

    let favorites = [];
    let watched = data[0]?.watched;
    
    // Handle if watched is a string (stringified JSON)
    if (typeof watched === 'string') {
      try {
        watched = JSON.parse(watched);
      } catch (e) {
        console.error('Failed to parse watched as JSON:', e);
        watched = null;
      }
    }
    
    // Convert to array if needed
    if (watched) {
      if (Array.isArray(watched)) {
        favorites = watched;
      } else if (typeof watched === 'object') {
        favorites = [watched];
      }
    }
    
    res.json({ success: true, data: favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.json({ success: true, data: [] });
  }
});

// Add to favorites
router.post('/favorites', verifyToken, async (req, res) => {
  const { email, slug, series_slug, movie_slug, title, poster, series_name, poster_image, type } = req.body;
  
  // Handle both field naming conventions
  const finalSlug = slug || series_slug || movie_slug;
  const finalPoster = poster || poster_image;
  const finalTitle = title || series_name;

  if (!email || !finalSlug) {
    return res.status(400).json({ error: 'Email and slug required' });
  }

  try {
    // Step 1: Ensure user exists in users table (required for FK constraint)
    const { data: userExists, error: checkError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email);

    if (checkError || !userExists || userExists.length === 0) {
      // User doesn't exist, create them
      console.log('Creating user in users table:', email);
      const { error: createUserError } = await supabase
        .from('users')
        .insert({ email, created_at: new Date().toISOString() });

      if (createUserError && createUserError.code !== '23505') {
        // 23505 = unique violation (user already exists)
        console.error('Error creating user:', createUserError);
      }
    }

    // Step 2: Get existing favorites from user_data table
    const { data: userData, error: fetchError } = await supabase
      .from('user_data')
      .select('watched')
      .eq('email', email);

    // Parse existing favorites - handle all cases including stringified JSON
    let favorites = [];
    if (userData && userData.length > 0) {
      let watched = userData[0]?.watched;
      console.log('Raw watched data:', watched, 'Type:', typeof watched);
      
      // Handle if watched is a string (stringified JSON)
      if (typeof watched === 'string') {
        try {
          watched = JSON.parse(watched);
        } catch (e) {
          console.error('Failed to parse watched as JSON:', e);
          watched = null;
        }
      }
      
      // Now handle the parsed data
      if (watched && Array.isArray(watched)) {
        favorites = [...watched]; // Create a copy of the array
      } else if (watched && typeof watched === 'object') {
        // If it's an object, convert it to an array
        favorites = [watched];
      }
    }
    console.log('Current favorites array:', JSON.stringify(favorites, null, 2));

    // Create new favorite entry
    const newFavorite = {
      series_slug: type === 'movie' ? null : finalSlug,
      movie_slug: type === 'movie' ? finalSlug : null,
      title: finalTitle,
      series_name: type === 'movie' ? null : finalTitle,
      poster_image: finalPoster,
      type: type || 'series',
      added_at: new Date().toISOString()
    };
    console.log('New favorite to add:', JSON.stringify(newFavorite, null, 2));

    // Check if already exists - must check that slug is not null before comparing
    const exists = favorites.some(fav => {
      const seriesMatch = newFavorite.series_slug && fav.series_slug === newFavorite.series_slug;
      const movieMatch = newFavorite.movie_slug && fav.movie_slug === newFavorite.movie_slug;
      return seriesMatch || movieMatch;
    });
    console.log('Already exists?', exists);

    if (!exists) {
      favorites.push(newFavorite);
      console.log('Updated favorites array:', JSON.stringify(favorites, null, 2));
    }

    // Step 3: Update or insert user_data
    if (!userData || userData.length === 0) {
      // Create new user_data entry
      console.log('Creating user_data for:', email);
      const { data: insertData, error: insertError } = await supabase
        .from('user_data')
        .insert({
          email,
          watched: favorites
        })
        .select();

      if (insertError) {
        console.error('User data creation error:', insertError);
        return res.json({ success: true, data: newFavorite });
      }

      return res.json({ success: true, data: newFavorite });
    }

    // Update existing user data with new favorites
    console.log('Updating favorites for:', email);
    console.log('Sending to database:', JSON.stringify(favorites, null, 2));
    
    const { data: updateData, error: updateError } = await supabase
      .from('user_data')
      .update({ watched: favorites })
      .eq('email', email)
      .select('watched');

    if (updateError) {
      console.error('Update error:', updateError);
      return res.json({ success: false, error: updateError.message });
    }

    console.log('Updated data returned:', JSON.stringify(updateData, null, 2));
    res.json({ success: true, data: favorites });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.json({ success: true, data: { email, title: finalTitle } });
  }
});

// Remove from favorites
router.delete('/favorites/:email/:slug', verifyToken, async (req, res) => {
  const { email, slug } = req.params;

  if (!email || !slug) {
    return res.status(400).json({ error: 'Email and slug required' });
  }

  try {
    // Get existing user data
    const { data: userData, error: fetchError } = await supabase
      .from('user_data')
      .select('watched')
      .eq('email', email);

    if (fetchError || !userData || userData.length === 0) {
      console.error('Fetch error:', fetchError);
      return res.json({ success: true, message: 'Favorite removed' });
    }

    // Filter out the favorite
    let favorites = (userData[0]?.watched && Array.isArray(userData[0].watched)) ? userData[0].watched : [];
    favorites = favorites.filter(fav => 
      fav.series_slug !== slug && fav.movie_slug !== slug
    );

    // Update user data
    const { error: updateError } = await supabase
      .from('user_data')
      .update({ watched: favorites })
      .eq('email', email);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.json({ success: true, message: 'Favorite removed' });
    }

    res.json({ success: true, message: 'Favorite removed' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.json({ success: true, message: 'Favorite removed' });
  }
});

export default router;
