import { createClient } from '@supabase/supabase-js';
import express from 'express';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Helper to find comment/reply in nested structure
function findCommentById(comments, targetId) {
  for (let comment of comments) {
    if (comment.id == targetId) {
      return { comment, parentId: null, index: comments.indexOf(comment) };
    }
    if (comment.replies && Array.isArray(comment.replies)) {
      const found = findInReplies(comment.replies, targetId, comment.id);
      if (found) return found;
    }
  }
  return null;
}

function findInReplies(replies, targetId, parentId) {
  for (let reply of replies) {
    if (reply.id == targetId) {
      return { comment: reply, parentId, index: replies.indexOf(reply), isReply: true };
    }
    if (reply.replies && Array.isArray(reply.replies)) {
      const found = findInReplies(reply.replies, targetId, reply.id);
      if (found) return found;
    }
  }
  return null;
}

// Get library (all series and movies)
router.get('/library', async (req, res) => {
  try {
    const [seriesResult, moviesResult] = await Promise.all([
      supabase.from('series').select('*').order('title'),
      supabase.from('movies').select('*').order('title')
    ]);

    if (seriesResult.error) throw seriesResult.error;
    if (moviesResult.error) throw moviesResult.error;

    const library = [
      ...(seriesResult.data || []).map(s => ({
        type: 'series',
        slug: s.slug,
        title: s.title,
        poster: s.poster,
        genres: s.genres || [],
        synopsis: s.description || '',
        status: 'Available',
        release_year: s.year,
        totalEpisodes: null,
        rating: s.rating || null
      })),
      ...(moviesResult.data || []).map(m => ({
        type: 'movie',
        slug: m.slug,
        title: m.title,
        poster: m.poster,
        genres: m.genres || [],
        synopsis: m.description || '',
        status: 'Movie',
        release_year: m.year,
        totalEpisodes: 1,
        rating: m.rating || null
      }))
    ];

    res.json(library);
  } catch (error) {
    console.error('Error fetching library:', error);
    res.status(500).json({ error: 'Failed to fetch library' });
  }
});

// Get series by slug
router.get('/series/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const { data: series, error: seriesError } = await supabase
      .from('series')
      .select('*')
      .eq('slug', slug)
      .single();

    if (seriesError || !series) {
      return res.status(404).json({ error: 'Series not found' });
    }

    const { data: episodes, error: episodesError } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .order('season')
      .order('episode');

    if (episodesError) throw episodesError;

    const seasons = {};
    const episodesBySeason = {};

    (episodes || []).forEach(ep => {
      const seasonKey = String(ep.season);
      
      if (!seasons[seasonKey]) {
        seasons[seasonKey] = [];
        episodesBySeason[seasonKey] = [];
      }

      seasons[seasonKey].push(String(ep.episode));
      episodesBySeason[seasonKey].push({
        id: `${ep.season}-${ep.episode}`,
        number: ep.episode,
        title: ep.title,
        duration: '',
        thumbnail: ep.episode_card_thumbnail || ep.episode_list_thumbnail || ep.thumbnail,
        episode_main_poster: ep.episode_main_poster,
        episode_card_thumbnail: ep.episode_card_thumbnail,
        episode_list_thumbnail: ep.episode_list_thumbnail,
        video_player_thumbnail: ep.video_player_thumbnail,
        description: ''
      });
    });

    const result = {
      type: 'series',
      slug: series.slug,
      title: series.title,
      description: series.description || '',
      poster: series.poster,
      banner_image: series.banner_image,
      genres: series.genres || [],
      status: series.status || 'Available',
      release_year: series.year || series.release_year,
      totalEpisodes: episodes?.length || 0,
      seasons,
      episodes: episodesBySeason,
      rating: series.rating || null
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching series:', error);
    res.status(500).json({ error: 'Failed to fetch series' });
  }
});

// Get episode by series slug and episode id
router.get('/series/:slug/episode/:episodeId', async (req, res) => {
  try {
    const { slug, episodeId } = req.params;
    
    const match = episodeId.match(/(\d+)-(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid episode format. Use season-episode (e.g., 1-5)' });
    }

    const [, season, episode] = match;

    const { data, error } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .eq('season', parseInt(season))
      .eq('episode', parseInt(episode))
      .single();

    if (error || !data) {
      console.error('Episode fetch error:', { slug, season, episode, error });
      return res.status(404).json({ error: 'Episode not found' });
    }

    console.log('📝 Episode data from DB:', { coments: data.coments, type: typeof data.coments });

    const result = {
      series: slug,
      season: data.season,
      episode: data.episode,
      episode_title: data.title,
      title: data.title,
      thumbnail: data.episode_card_thumbnail || data.episode_list_thumbnail || data.thumbnail,
      episode_main_poster: data.episode_main_poster,
      episode_card_thumbnail: data.episode_card_thumbnail,
      episode_list_thumbnail: data.episode_list_thumbnail,
      video_player_thumbnail: data.video_player_thumbnail,
      servers: data.servers || [],
      description: '',
      duration: '',
      releaseDate: '',
      comments: Array.isArray(data.coments) ? data.coments : (data.coments || [])
    };

    console.log('📤 Sending response with comments:', { comments: result.comments });
    res.json(result);
  } catch (error) {
    console.error('Error fetching episode:', error);
    res.status(500).json({ error: 'Failed to fetch episode' });
  }
});

// Get movie by slug
router.get('/movies/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const { data: movie, error } = await supabase
      .from('movies')
      .select('*')
      .eq('slug', slug)
      .single();

    if (error || !movie) {
      console.error('Movie fetch error:', { slug, error });
      return res.status(404).json({ error: 'Movie not found' });
    }

    console.log('🎬 Movie data from DB:', { coments: movie.coments ? movie.coments.length : 0, type: typeof movie.coments });

    const result = {
      type: 'movie',
      slug: movie.slug,
      title: movie.title,
      description: movie.description || '',
      poster: movie.poster,
      banner_image: movie.banner_image,
      movie_poster: movie.poster,
      thumbnail: movie.poster,
      genres: movie.genres || [],
      languages: movie.languages || [],
      status: 'Movie',
      release_year: movie.year || movie.release_year,
      runtime: movie.runtime,
      servers: movie.servers || [],
      rating: movie.rating || null,
      comments: Array.isArray(movie.coments) ? movie.coments : (movie.coments || [])
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching movie:', error);
    res.status(500).json({ error: 'Failed to fetch movie' });
  }
});

// Get latest episodes
router.get('/latest-episodes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('latest_episodes')
      .select('*')
      .order('added_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const result = (data || []).map(ep => ({
      seriesSlug: ep.series_slug,
      series: ep.series_title,
      season: ep.season,
      episode: ep.episode,
      title: ep.episode_title,
      thumbnail: ep.thumbnail,
      addedAt: ep.added_at
    }));

    res.json(result);
  } catch (error) {
    console.error('Error fetching latest episodes:', error);
    res.status(500).json({ error: 'Failed to fetch latest episodes' });
  }
});

// POST: Add comment to episode
router.post('/series/:slug/episode/:episodeId/comments', async (req, res) => {
  try {
    const { slug, episodeId } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const match = episodeId.match(/(\d+)-(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid episode format' });
    }

    const [, season, episode] = match;

    const { data: episodeData, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .eq('season', parseInt(season))
      .eq('episode', parseInt(episode))
      .single();

    if (fetchError || !episodeData) {
      console.error('Episode not found:', { slug, season: parseInt(season), episode: parseInt(episode), fetchError });
      return res.status(404).json({ error: 'Episode not found' });
    }

    console.log('📌 Episode found, ID:', episodeData.id, 'current coments:', Array.isArray(episodeData.coments) ? episodeData.coments.length : 0);

    const comments = Array.isArray(episodeData.coments) ? episodeData.coments : [];
    const newComment = {
      id: Date.now(),
      username,
      text,
      timestamp: new Date().toISOString()
    };
    comments.push(newComment);

    console.log('💾 Updating episode', episodeData.id, 'with', comments.length, 'comments');

    const { error: updateError } = await supabaseAdmin
      .from('episodes')
      .update({ coments: comments })
      .eq('id', episodeData.id);

    if (updateError) {
      console.error('❌ Error updating comment:', updateError);
      throw updateError;
    }

    // Verify the data was actually saved
    const { data: verify, error: verifyError } = await supabaseAdmin
      .from('episodes')
      .select('coments')
      .eq('id', episodeData.id)
      .single();
    
    console.log('✅ Verification - Comments in DB:', verify?.coments?.length || 0);

    res.json({ success: true, comment: newComment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// POST: Add comment to movie
router.post('/movies/:slug/comments', async (req, res) => {
  try {
    const { slug } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const { data: movieData, error: fetchError } = await supabase
      .from('movies')
      .select('coments')
      .eq('slug', slug)
      .single();

    if (fetchError || !movieData) {
      console.error('Movie not found:', { slug, fetchError });
      return res.status(404).json({ error: 'Movie not found' });
    }

    console.log('📌 Movie found, ID:', movieData.id, 'current coments:', Array.isArray(movieData.coments) ? movieData.coments.length : 0);

    const comments = Array.isArray(movieData.coments) ? movieData.coments : [];
    const newComment = {
      id: Date.now(),
      username,
      text,
      timestamp: new Date().toISOString()
    };
    comments.push(newComment);

    console.log('💾 Updating movie', movieData.id, 'with', comments.length, 'comments');

    const { error: updateError } = await supabaseAdmin
      .from('movies')
      .update({ coments: comments })
      .eq('id', movieData.id);

    if (updateError) {
      console.error('❌ Error updating movie comment:', updateError);
      throw updateError;
    }

    // Verify the data was saved
    const { data: verify } = await supabaseAdmin
      .from('movies')
      .select('coments')
      .eq('id', movieData.id)
      .single();
    
    console.log('✅ Verification - Comments in DB:', verify?.coments?.length || 0);

    res.json({ success: true, comment: newComment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// DELETE: Remove comment from episode
router.delete('/series/:slug/episode/:episodeId/comments/:commentId', async (req, res) => {
  try {
    const { slug, episodeId, commentId } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const match = episodeId.match(/(\d+)-(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid episode format' });
    }

    const [, season, episode] = match;

    const { data: episodeData, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .eq('season', parseInt(season))
      .eq('episode', parseInt(episode))
      .single();

    if (fetchError || !episodeData) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const comments = Array.isArray(episodeData.coments) ? episodeData.coments : [];
    const commentIndex = comments.findIndex(c => c.id == commentId);
    
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comments[commentIndex].username !== username) {
      return res.status(403).json({ error: 'Unauthorized to delete this comment' });
    }

    comments.splice(commentIndex, 1);

    const { error: updateError } = await supabaseAdmin
      .from('episodes')
      .update({ coments: comments })
      .eq('id', episodeData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// PATCH: Edit comment on episode
router.patch('/series/:slug/episode/:episodeId/comments/:commentId', async (req, res) => {
  try {
    const { slug, episodeId, commentId } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const match = episodeId.match(/(\d+)-(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid episode format' });
    }

    const [, season, episode] = match;

    const { data: episodeData, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .eq('season', parseInt(season))
      .eq('episode', parseInt(episode))
      .single();

    if (fetchError || !episodeData) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const comments = Array.isArray(episodeData.coments) ? episodeData.coments : [];
    const commentIndex = comments.findIndex(c => c.id == commentId);
    
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comments[commentIndex].username !== username) {
      return res.status(403).json({ error: 'Unauthorized to edit this comment' });
    }

    comments[commentIndex].text = text;
    comments[commentIndex].edited = true;

    const { error: updateError } = await supabaseAdmin
      .from('episodes')
      .update({ coments: comments })
      .eq('id', episodeData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true, comment: comments[commentIndex] });
  } catch (error) {
    console.error('Error editing comment:', error);
    res.status(500).json({ error: 'Failed to edit comment' });
  }
});

// DELETE: Remove comment from movie
router.delete('/movies/:slug/comments/:commentId', async (req, res) => {
  try {
    const { slug, commentId } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const { data: movieData, error: fetchError } = await supabase
      .from('movies')
      .select('*')
      .eq('slug', slug)
      .single();

    if (fetchError || !movieData) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const comments = Array.isArray(movieData.coments) ? movieData.coments : [];
    const commentIndex = comments.findIndex(c => c.id == commentId);
    
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comments[commentIndex].username !== username) {
      return res.status(403).json({ error: 'Unauthorized to delete this comment' });
    }

    comments.splice(commentIndex, 1);

    const { error: updateError } = await supabaseAdmin
      .from('movies')
      .update({ coments: comments })
      .eq('id', movieData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// PATCH: Edit comment on movie
router.patch('/movies/:slug/comments/:commentId', async (req, res) => {
  try {
    const { slug, commentId } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const { data: movieData, error: fetchError } = await supabase
      .from('movies')
      .select('*')
      .eq('slug', slug)
      .single();

    if (fetchError || !movieData) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const comments = Array.isArray(movieData.coments) ? movieData.coments : [];
    const commentIndex = comments.findIndex(c => c.id == commentId);
    
    if (commentIndex === -1) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comments[commentIndex].username !== username) {
      return res.status(403).json({ error: 'Unauthorized to edit this comment' });
    }

    comments[commentIndex].text = text;
    comments[commentIndex].edited = true;

    const { error: updateError } = await supabaseAdmin
      .from('movies')
      .update({ coments: comments })
      .eq('id', movieData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true, comment: comments[commentIndex] });
  } catch (error) {
    console.error('Error editing comment:', error);
    res.status(500).json({ error: 'Failed to edit comment' });
  }
});

// POST: Add reply to episode comment (supports nested replies)
router.post('/series/:slug/episode/:episodeId/comments/:commentId/replies', async (req, res) => {
  try {
    const { slug, episodeId, commentId } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const match = episodeId.match(/(\d+)-(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid episode format' });
    }

    const [, season, episode] = match;

    const { data: episodeData, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .eq('season', parseInt(season))
      .eq('episode', parseInt(episode))
      .single();

    if (fetchError || !episodeData) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const comments = Array.isArray(episodeData.coments) ? episodeData.coments : [];
    const found = findCommentById(comments, commentId);
    
    if (!found) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (!found.comment.replies) {
      found.comment.replies = [];
    }

    const newReply = {
      id: Date.now(),
      username,
      text,
      timestamp: new Date().toISOString()
    };

    found.comment.replies.push(newReply);

    const { error: updateError } = await supabaseAdmin
      .from('episodes')
      .update({ coments: comments })
      .eq('id', episodeData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true, reply: { ...newReply, parentId: commentId } });
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

// DELETE: Remove reply from episode comment (supports nested replies)
router.delete('/series/:slug/episode/:episodeId/comments/:commentId/replies/:replyId', async (req, res) => {
  try {
    const { slug, episodeId, commentId, replyId } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const match = episodeId.match(/(\d+)-(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid episode format' });
    }

    const [, season, episode] = match;

    const { data: episodeData, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .eq('season', parseInt(season))
      .eq('episode', parseInt(episode))
      .single();

    if (fetchError || !episodeData) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const comments = Array.isArray(episodeData.coments) ? episodeData.coments : [];
    const foundParent = findCommentById(comments, commentId);
    
    if (!foundParent) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const replies = foundParent.comment.replies || [];
    const foundReply = findCommentById(replies, replyId);
    
    if (!foundReply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    if (foundReply.comment.username !== username) {
      return res.status(403).json({ error: 'Unauthorized to delete this reply' });
    }

    replies.splice(foundReply.index, 1);
    foundParent.comment.replies = replies;

    const { error: updateError } = await supabaseAdmin
      .from('episodes')
      .update({ coments: comments })
      .eq('id', episodeData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reply:', error);
    res.status(500).json({ error: 'Failed to delete reply' });
  }
});

// PATCH: Edit reply on episode comment (supports nested replies)
router.patch('/series/:slug/episode/:episodeId/comments/:commentId/replies/:replyId', async (req, res) => {
  try {
    const { slug, episodeId, commentId, replyId } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const match = episodeId.match(/(\d+)-(\d+)/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid episode format' });
    }

    const [, season, episode] = match;

    const { data: episodeData, error: fetchError } = await supabase
      .from('episodes')
      .select('*')
      .eq('series_slug', slug)
      .eq('season', parseInt(season))
      .eq('episode', parseInt(episode))
      .single();

    if (fetchError || !episodeData) {
      return res.status(404).json({ error: 'Episode not found' });
    }

    const comments = Array.isArray(episodeData.coments) ? episodeData.coments : [];
    const foundParent = findCommentById(comments, commentId);
    
    if (!foundParent) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const replies = foundParent.comment.replies || [];
    const foundReply = findCommentById(replies, replyId);
    
    if (!foundReply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    if (foundReply.comment.username !== username) {
      return res.status(403).json({ error: 'Unauthorized to edit this reply' });
    }

    foundReply.comment.text = text;
    foundReply.comment.edited = true;

    const { error: updateError } = await supabaseAdmin
      .from('episodes')
      .update({ coments: comments })
      .eq('id', episodeData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true, reply: foundReply.comment });
  } catch (error) {
    console.error('Error editing reply:', error);
    res.status(500).json({ error: 'Failed to edit reply' });
  }
});

// POST: Add reply to movie comment (supports nested replies)
router.post('/movies/:slug/comments/:commentId/replies', async (req, res) => {
  try {
    const { slug, commentId } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const { data: movieData, error: fetchError } = await supabase
      .from('movies')
      .select('*')
      .eq('slug', slug)
      .single();

    if (fetchError || !movieData) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const comments = Array.isArray(movieData.coments) ? movieData.coments : [];
    const found = findCommentById(comments, commentId);
    
    if (!found) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (!found.comment.replies) {
      found.comment.replies = [];
    }

    const newReply = {
      id: Date.now(),
      username,
      text,
      timestamp: new Date().toISOString()
    };

    found.comment.replies.push(newReply);

    const { error: updateError } = await supabaseAdmin
      .from('movies')
      .update({ coments: comments })
      .eq('id', movieData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true, reply: { ...newReply, parentId: commentId } });
  } catch (error) {
    console.error('Error adding reply:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

// DELETE: Remove reply from movie comment (supports nested replies)
router.delete('/movies/:slug/comments/:commentId/replies/:replyId', async (req, res) => {
  try {
    const { slug, commentId, replyId } = req.params;
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const { data: movieData, error: fetchError } = await supabase
      .from('movies')
      .select('*')
      .eq('slug', slug)
      .single();

    if (fetchError || !movieData) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const comments = Array.isArray(movieData.coments) ? movieData.coments : [];
    const foundParent = findCommentById(comments, commentId);
    
    if (!foundParent) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const replies = foundParent.comment.replies || [];
    const foundReply = findCommentById(replies, replyId);
    
    if (!foundReply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    if (foundReply.comment.username !== username) {
      return res.status(403).json({ error: 'Unauthorized to delete this reply' });
    }

    replies.splice(foundReply.index, 1);
    foundParent.comment.replies = replies;

    const { error: updateError } = await supabaseAdmin
      .from('movies')
      .update({ coments: comments })
      .eq('id', movieData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reply:', error);
    res.status(500).json({ error: 'Failed to delete reply' });
  }
});

// PATCH: Edit reply on movie comment (supports nested replies)
router.patch('/movies/:slug/comments/:commentId/replies/:replyId', async (req, res) => {
  try {
    const { slug, commentId, replyId } = req.params;
    const { username, text } = req.body;

    if (!username || !text) {
      return res.status(400).json({ error: 'Username and text are required' });
    }

    const { data: movieData, error: fetchError } = await supabase
      .from('movies')
      .select('*')
      .eq('slug', slug)
      .single();

    if (fetchError || !movieData) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const comments = Array.isArray(movieData.coments) ? movieData.coments : [];
    const foundParent = findCommentById(comments, commentId);
    
    if (!foundParent) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const replies = foundParent.comment.replies || [];
    const foundReply = findCommentById(replies, replyId);
    
    if (!foundReply) {
      return res.status(404).json({ error: 'Reply not found' });
    }

    if (foundReply.comment.username !== username) {
      return res.status(403).json({ error: 'Unauthorized to edit this reply' });
    }

    foundReply.comment.text = text;
    foundReply.comment.edited = true;

    const { error: updateError } = await supabaseAdmin
      .from('movies')
      .update({ coments: comments })
      .eq('id', movieData.id);

    if (updateError) {
      throw updateError;
    }

    res.json({ success: true, reply: foundReply.comment });
  } catch (error) {
    console.error('Error editing reply:', error);
    res.status(500).json({ error: 'Failed to edit reply' });
  }
});

export default router;
