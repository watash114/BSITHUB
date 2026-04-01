const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Database
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.static('.'));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'bsithub-secret-key';

// Auth Middleware
const auth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'No token' });
        
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Routes

// Auth - Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);
        
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                yearLevel: user.year_level,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Auth - Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password, yearLevel } = req.body;
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            'INSERT INTO users (username, email, password, year_level, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [username, email, hashedPassword, yearLevel, 'user']
        );
        
        res.status(201).json({ message: 'User created', userId: result.rows[0].id });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get current user
app.get('/api/me', auth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, year_level, role FROM users WHERE id = $1',
            [req.user.userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.rows[0];
        res.json({
            id: user.id,
            username: user.username,
            email: user.email,
            yearLevel: user.year_level,
            role: user.role
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get posts
app.get('/api/posts', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, u.username as author, 
                (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) as likes,
                (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comments
            FROM posts p
            JOIN users u ON p.author_id = u.id
            ORDER BY p.created_at DESC
        `);
        
        res.json({ posts: result.rows });
    } catch (error) {
        console.error('Get posts error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create post
app.post('/api/posts', auth, async (req, res) => {
    try {
        const { title, content } = req.body;
        
        const result = await pool.query(
            'INSERT INTO posts (author_id, title, content) VALUES ($1, $2, $3) RETURNING *',
            [req.user.userId, title, content]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Like post
app.post('/api/posts/:id/like', auth, async (req, res) => {
    try {
        const postId = req.params.id;
        
        const existing = await pool.query(
            'SELECT * FROM post_likes WHERE post_id = $1 AND user_id = $2',
            [postId, req.user.userId]
        );
        
        if (existing.rows.length > 0) {
            await pool.query(
                'DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2',
                [postId, req.user.userId]
            );
        } else {
            await pool.query(
                'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)',
                [postId, req.user.userId]
            );
        }
        
        res.json({ message: 'Success' });
    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get profile
app.get('/api/profile/me', auth, async (req, res) => {
    try {
        const postsCount = await pool.query(
            'SELECT COUNT(*) FROM posts WHERE author_id = $1',
            [req.user.userId]
        );
        
        const commentsCount = await pool.query(
            'SELECT COUNT(*) FROM comments WHERE author_id = $1',
            [req.user.userId]
        );
        
        const posts = await pool.query(
            'SELECT * FROM posts WHERE author_id = $1 ORDER BY created_at DESC',
            [req.user.userId]
        );
        
        res.json({
            postsCount: parseInt(postsCount.rows[0].count),
            commentsCount: parseInt(commentsCount.rows[0].count),
            posts: posts.rows
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get conversations
app.get('/api/conversations', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, 
                CASE WHEN c.user1_id = $1 THEN u2.username ELSE u1.username END as other_user,
                (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
            FROM conversations c
            JOIN users u1 ON c.user1_id = u1.id
            JOIN users u2 ON c.user2_id = u2.id
            WHERE c.user1_id = $1 OR c.user2_id = $1
            ORDER BY c.updated_at DESC
        `, [req.user.userId]);
        
        res.json({ conversations: result.rows });
    } catch (error) {
        console.error('Conversations error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create conversation
app.post('/api/conversations', auth, async (req, res) => {
    try {
        const { username } = req.body;
        
        const otherUser = await pool.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );
        
        if (otherUser.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const otherId = otherUser.rows[0].id;
        
        const existing = await pool.query(`
            SELECT * FROM conversations 
            WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)
        `, [req.user.userId, otherId]);
        
        if (existing.rows.length > 0) {
            return res.json({ conversation: existing.rows[0] });
        }
        
        const result = await pool.query(
            'INSERT INTO conversations (user1_id, user2_id) VALUES ($1, $2) RETURNING *',
            [req.user.userId, otherId]
        );
        
        res.status(201).json({ conversation: result.rows[0] });
    } catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get messages
app.get('/api/conversations/:id/messages', auth, async (req, res) => {
    try {
        const conversationId = req.params.id;
        
        const conv = await pool.query(
            'SELECT * FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
            [conversationId, req.user.userId]
        );
        
        if (conv.rows.length === 0) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        const result = await pool.query(`
            SELECT m.*, u.username as author
            FROM messages m
            JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = $1
            ORDER BY m.created_at ASC
        `, [conversationId]);
        
        res.json({ messages: result.rows });
    } catch (error) {
        console.error('Messages error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Send message
app.post('/api/conversations/:id/messages', auth, async (req, res) => {
    try {
        const conversationId = req.params.id;
        const { content } = req.body;
        
        const conv = await pool.query(
            'SELECT * FROM conversations WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
            [conversationId, req.user.userId]
        );
        
        if (conv.rows.length === 0) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        const result = await pool.query(
            'INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING *',
            [conversationId, req.user.userId, content]
        );
        
        await pool.query(
            'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
            [conversationId]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin - Get all posts
app.get('/api/admin/posts', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        const result = await pool.query(`
            SELECT p.*, u.username as author
            FROM posts p
            JOIN users u ON p.author_id = u.id
            ORDER BY p.created_at DESC
        `);
        
        res.json({ posts: result.rows });
    } catch (error) {
        console.error('Admin posts error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin - Delete post
app.delete('/api/admin/posts/:id', auth, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve index.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});