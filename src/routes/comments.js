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
    return res.status(401).json({ error: 'Unauthorized - Please login first' });
  }
  next();
};

// POST: Add a comment (requires login)
router.post('/comments', verifyToken, async (req, res) => {
  const { email, username, first_name, last_name, content, location, series_slug, movie_slug } = req.body;

  if (!email || !content || !location) {
    return res.status(400).json({ error: 'Email, content, and location required' });
  }

  if (content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment cannot be empty' });
  }

  try {
    const insertData = {
      user_email: email,
      username: username || null,
      first_name: first_name || null,
      last_name: last_name || null,
      content: content.trim(),
      location: location,
      series_slug: series_slug || null,
      movie_slug: movie_slug || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('comments')
      .insert(insertData)
      .select();

    if (error) {
      console.error('Comment insert error:', error);
      return res.status(500).json({ error: 'Failed to save comment' });
    }

    res.json({ 
      success: true, 
      data: data?.[0] || insertData,
      message: 'Comment posted successfully!'
    });
  } catch (error) {
    console.error('Error saving comment:', error);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

// GET: Fetch comments for a location (episode/movie)
router.get('/comments/:location', async (req, res) => {
  const { location } = req.params;

  if (!location) {
    return res.status(400).json({ error: 'Location required' });
  }

  try {
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('location', location)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Comment fetch error:', error);
      return res.json({ success: true, data: [] });
    }

    res.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.json({ success: true, data: [] });
  }
});

// DELETE: Delete a comment (only by owner)
router.delete('/comments/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { email } = req.body;

  if (!id || !email) {
    return res.status(400).json({ error: 'ID and email required' });
  }

  try {
    // Verify comment belongs to user
    const { data: comment } = await supabase
      .from('comments')
      .select('*')
      .eq('id', id)
      .single();

    if (!comment || comment.user_email !== email) {
      return res.status(403).json({ error: 'Unauthorized - Can only delete your own comments' });
    }

    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete comment' });
    }

    res.json({ success: true, message: 'Comment deleted' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;
