const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "bsithub-dev-secret-change-this";
const DATABASE_URL = process.env.DATABASE_URL;
const ONLINE_TIMEOUT_SECONDS = 60;
const RESET_CODE_TTL_MINUTES = 10;
const MAX_IMAGE_DATA_URL_LENGTH = 3 * 1024 * 1024;
const MAX_GIF_URL_LENGTH = 2048;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 0);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM;
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

if (!DATABASE_URL) {
    console.error("DATABASE_URL is required. Add a Postgres connection string.");
    process.exit(1);
}

const useSsl = !/localhost|127\.0\.0\.1/.test(DATABASE_URL);

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false
});

let mailer = null;
if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM) {
    mailer = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });
}

async function sendResetCodeEmail(email, code) {
    if (!mailer) {
        throw new Error("EMAIL_NOT_CONFIGURED");
    }

    await mailer.sendMail({
        from: SMTP_FROM,
        to: email,
        subject: "BSITHUB Password Reset Code",
        text: `Your BSITHUB password reset code is ${code}. This code expires in ${RESET_CODE_TTL_MINUTES} minutes.`,
        html: `<p>Your BSITHUB password reset code is <strong>${code}</strong>.</p><p>This code expires in ${RESET_CODE_TTL_MINUTES} minutes.</p>`
    });
}

function safeUser(row) {
    return {
        id: row.id,
        username: row.username,
        email: row.email,
        bio: row.bio,
        yearLevel: row.year_level || "BSIT 1",
        avatarImage: row.avatar_image || null,
        createdAt: row.created_at,
        role: row.role || "member"
    };
}

function defaultSettings() {
    return {
        emailNotifications: true,
        publicProfile: true,
        allowMessages: true,
        showTimestamps: true,
        chatEnterToSend: true,
        reduceMotion: false,
        profileFollowed: false
    };
}

function mapSettingsRow(row) {
    return {
        emailNotifications: row.email_notifications,
        publicProfile: row.public_profile,
        allowMessages: row.allow_messages,
        showTimestamps: row.show_timestamps,
        chatEnterToSend: row.chat_enter_to_send,
        reduceMotion: row.reduce_motion,
        profileFollowed: row.profile_followed
    };
}

async function getOrCreateSettings(userId) {
    await pool.query("INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
    const { rows } = await pool.query(
        `SELECT email_notifications, public_profile, allow_messages, show_timestamps,
                chat_enter_to_send, reduce_motion, profile_followed
         FROM user_settings
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
    );
    if (!rows.length) {
        return defaultSettings();
    }
    return mapSettingsRow(rows[0]);
}

async function initDb() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT NOT NULL,
            bio TEXT NOT NULL DEFAULT 'BSIT Student',
            year_level TEXT NOT NULL DEFAULT 'BSIT 1',
            avatar_image TEXT,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            role TEXT NOT NULL DEFAULT 'member'
        );

        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS year_level TEXT NOT NULL DEFAULT 'BSIT 1';

        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS avatar_image TEXT;

        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

        CREATE TABLE IF NOT EXISTS posts (
            id SERIAL PRIMARY KEY,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            message_type TEXT NOT NULL DEFAULT 'text',
            image_data_url TEXT,
            gif_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';

        ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS image_data_url TEXT;

        ALTER TABLE messages
            ADD COLUMN IF NOT EXISTS gif_url TEXT;

        CREATE TABLE IF NOT EXISTS presence (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS password_resets (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            code_hash TEXT NOT NULL,
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
            public_profile BOOLEAN NOT NULL DEFAULT TRUE,
            allow_messages BOOLEAN NOT NULL DEFAULT TRUE,
            show_timestamps BOOLEAN NOT NULL DEFAULT TRUE,
            chat_enter_to_send BOOLEAN NOT NULL DEFAULT TRUE,
            reduce_motion BOOLEAN NOT NULL DEFAULT FALSE,
            profile_followed BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            link TEXT,
            is_read BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS post_likes (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, post_id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
            ON users ((LOWER(username)));

        CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
            ON users ((LOWER(email)));

        CREATE INDEX IF NOT EXISTS posts_author_idx ON posts(author_id);
        CREATE INDEX IF NOT EXISTS comments_post_idx ON comments(post_id);
        CREATE INDEX IF NOT EXISTS comments_author_idx ON comments(author_id);
        CREATE INDEX IF NOT EXISTS messages_author_idx ON messages(author_id);
        CREATE INDEX IF NOT EXISTS presence_last_seen_idx ON presence(last_seen);
        CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
        CREATE INDEX IF NOT EXISTS password_resets_expires_idx ON password_resets(expires_at);
    `);
}

async function auth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
        return res.status(401).json({ error: "Missing token" });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const { rows } = await pool.query(
            "SELECT id, username, email, bio, year_level, avatar_image, created_at, role FROM users WHERE id = $1 LIMIT 1",
            [payload.userId]
        );
        if (!rows.length) {
            return res.status(401).json({ error: "Invalid token" });
        }
        req.user = rows[0];
        return next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}

app.use(cors());
function adminAuth(req, res, next) {
    return auth(req, res, function() {
        if (req.user.role !== "admin") {
            return res.status(403).json({ error: "Admin access required" });
        }
        next();
    });
}

app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
});

app.post("/api/auth/register", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim();
    const bio = String(req.body.bio || "").trim() || "BSIT Student";
    const yearLevel = String(req.body.yearLevel || "").trim() || "BSIT 1";
    const password = String(req.body.password || "");
    const allowedYearLevels = new Set(["BSIT 1", "BSIT 2", "BSIT 3", "BSIT 4"]);

    if (!username || !email || !password) {
        return res.status(400).json({ error: "username, email, and password are required" });
    }
    if (username.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters" });
    }
    if (!email.includes("@")) {
        return res.status(400).json({ error: "Invalid email" });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    if (!allowedYearLevels.has(yearLevel)) {
        return res.status(400).json({ error: "Invalid BSIT year level" });
    }

    const existing = await pool.query(
        "SELECT id FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1",
        [username, email]
    );
    if (existing.rows.length) {
        return res.status(409).json({ error: "Username or email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await pool.query(
        `INSERT INTO users (username, email, bio, year_level, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, username, email, bio, year_level, avatar_image, created_at`,
        [username, email, bio, yearLevel, passwordHash]
    );

    return res.status(201).json({ ok: true, user: safeUser(created.rows[0]) });
});

app.post("/api/auth/login", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
        return res.status(400).json({ error: "username and password are required" });
    }

    const result = await pool.query(
        "SELECT id, username, email, bio, year_level, avatar_image, password_hash, created_at, role FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
        [username]
    );
    if (!result.rows.length) {
        return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({ token, user: safeUser(user) });
});

app.post("/api/auth/forgot-password", async (req, res) => {
    const email = String(req.body.email || "").trim();
    const genericResponse = { ok: true, message: "If the email is registered, a reset code was sent." };

    if (!email || !email.includes("@")) {
        return res.json(genericResponse);
    }

    const userResult = await pool.query(
        "SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
        [email]
    );
    if (!userResult.rows.length) {
        return res.json(genericResponse);
    }

    if (!mailer) {
        return res.status(503).json({ error: "Password reset email is not configured yet." });
    }

    const user = userResult.rows[0];
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = await bcrypt.hash(code, 10);

    await pool.query("UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
    await pool.query(
        `INSERT INTO password_resets (user_id, code_hash, expires_at)
         VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 minute'))`,
        [user.id, codeHash, RESET_CODE_TTL_MINUTES]
    );

    try {
        await sendResetCodeEmail(user.email, code);
        return res.json(genericResponse);
    } catch {
        await pool.query("UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
        return res.status(500).json({ error: "Failed to send reset email. Please try again." });
    }
});

app.post("/api/auth/reset-password", async (req, res) => {
    const email = String(req.body.email || "").trim();
    const code = String(req.body.code || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "email, code, and newPassword are required" });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ error: "Password must be at least 4 characters" });
    }
    if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({ error: "Reset code must be 6 digits" });
    }

    const resetResult = await pool.query(
        `SELECT pr.id, pr.user_id, pr.code_hash, pr.expires_at, pr.attempts
         FROM users u
         JOIN password_resets pr ON pr.user_id = u.id
         WHERE LOWER(u.email) = LOWER($1)
           AND pr.used_at IS NULL
         ORDER BY pr.id DESC
         LIMIT 1`,
        [email]
    );

    if (!resetResult.rows.length) {
        return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const reset = resetResult.rows[0];

    if (new Date(reset.expires_at).getTime() < Date.now()) {
        await pool.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [reset.id]);
        return res.status(400).json({ error: "Reset code has expired" });
    }

    if (reset.attempts >= 5) {
        await pool.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [reset.id]);
        return res.status(400).json({ error: "Too many attempts. Request a new code." });
    }

    const codeValid = await bcrypt.compare(code, reset.code_hash);
    if (!codeValid) {
        await pool.query("UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1", [reset.id]);
        return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, reset.user_id]);
        await client.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [reset.id]);
        await client.query("COMMIT");
        return res.json({ ok: true });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Password reset transaction failed:", error);
        return res.status(500).json({ error: "Failed to reset password" });
    } finally {
        client.release();
    }
});

app.get("/api/profile/me", auth, async (req, res) => {
    const postsCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM posts WHERE author_id = $1", [req.user.id]);
    const commentsCountResult = await pool.query(
        "SELECT COUNT(*)::int AS count FROM comments WHERE author_id = $1",
        [req.user.id]
    );
    const recentPostsResult = await pool.query(
        `SELECT id, title, created_at
         FROM posts
         WHERE author_id = $1
         ORDER BY id DESC
         LIMIT 5`,
        [req.user.id]
    );

    return res.json({
        user: safeUser(req.user),
        stats: {
            posts: postsCountResult.rows[0].count,
            comments: commentsCountResult.rows[0].count
        },
        recentPosts: recentPostsResult.rows.map((row) => ({
            id: row.id,
            title: row.title,
            createdAt: row.created_at
        }))
    });
});

app.get("/api/users/:username", auth, async (req, res) => {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "Username required" });

    const userResult = await pool.query(
        "SELECT id, username, email, bio, year_level, avatar_image, created_at, role FROM users WHERE LOWER(username) = LOWER($1) LIMIT 1",
        [username]
    );
    if (!userResult.rows.length) return res.status(404).json({ error: "User not found" });

    const user = userResult.rows[0];
    const postsCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM posts WHERE author_id = $1", [user.id]);
    const commentsCountResult = await pool.query("SELECT COUNT(*)::int AS count FROM comments WHERE author_id = $1", [user.id]);
    const recentPostsResult = await pool.query(
        `SELECT id, title, created_at FROM posts WHERE author_id = $1 ORDER BY id DESC LIMIT 10`,
        [user.id]
    );

    return res.json({
        user: {
            id: user.id,
            username: user.username,
            bio: user.bio,
            yearLevel: user.year_level,
            avatarImage: user.avatar_image,
            createdAt: user.created_at,
            role: user.role
        },
        stats: {
            posts: postsCountResult.rows[0].count,
            comments: commentsCountResult.rows[0].count
        },
        recentPosts: recentPostsResult.rows.map((row) => ({
            id: row.id,
            title: row.title,
            createdAt: row.created_at
        }))
    });
});

app.get("/api/settings/me", auth, async (req, res) => {
    const settings = await getOrCreateSettings(req.user.id);
    return res.json({ settings });
});

app.put("/api/settings/me", auth, async (req, res) => {
    const payload = {
        emailNotifications: req.body.emailNotifications,
        publicProfile: req.body.publicProfile,
        allowMessages: req.body.allowMessages,
        showTimestamps: req.body.showTimestamps,
        chatEnterToSend: req.body.chatEnterToSend,
        reduceMotion: req.body.reduceMotion,
        profileFollowed: req.body.profileFollowed
    };

    const keys = Object.keys(payload);
    for (const key of keys) {
        if (typeof payload[key] !== "boolean") {
            return res.status(400).json({ error: `Invalid setting type for ${key}` });
        }
    }

    await pool.query("INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [req.user.id]);
    await pool.query(
        `UPDATE user_settings
         SET email_notifications = $1,
             public_profile = $2,
             allow_messages = $3,
             show_timestamps = $4,
             chat_enter_to_send = $5,
             reduce_motion = $6,
             profile_followed = $7,
             updated_at = NOW()
         WHERE user_id = $8`,
        [
            payload.emailNotifications,
            payload.publicProfile,
            payload.allowMessages,
            payload.showTimestamps,
            payload.chatEnterToSend,
            payload.reduceMotion,
            payload.profileFollowed,
            req.user.id
        ]
    );

    const settings = await getOrCreateSettings(req.user.id);
    return res.json({ ok: true, settings });
});

app.put("/api/profile/me", auth, async (req, res) => {
    const email = String(req.body.email || "").trim();
    const bio = String(req.body.bio || "").trim() || "BSIT Student";
    const password = String(req.body.password || "").trim();
    const avatarImageInput = req.body.avatarImage;
    let avatarImageToSave;

    if (avatarImageInput === null) {
        avatarImageToSave = null;
    } else if (typeof avatarImageInput === "string") {
        const normalized = avatarImageInput.trim();
        if (normalized.length === 0) {
            avatarImageToSave = null;
        } else {
            if (!normalized.startsWith("data:image/")) {
                return res.status(400).json({ error: "Invalid profile picture format" });
            }
            if (normalized.length > MAX_IMAGE_DATA_URL_LENGTH) {
                return res.status(400).json({ error: "Profile picture is too large" });
            }
            avatarImageToSave = normalized;
        }
    }

    if (!email.includes("@")) {
        return res.status(400).json({ error: "Invalid email" });
    }

    const existingEmail = await pool.query(
        "SELECT id FROM users WHERE id <> $1 AND LOWER(email) = LOWER($2) LIMIT 1",
        [req.user.id, email]
    );
    if (existingEmail.rows.length) {
        return res.status(409).json({ error: "Email already used by another account" });
    }

    if (password) {
        if (password.length < 4) {
            return res.status(400).json({ error: "Password must be at least 4 characters" });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        if (avatarImageInput === undefined) {
            await pool.query(
                "UPDATE users SET email = $1, bio = $2, password_hash = $3 WHERE id = $4",
                [email, bio, passwordHash, req.user.id]
            );
        } else {
            await pool.query(
                "UPDATE users SET email = $1, bio = $2, password_hash = $3, avatar_image = $4 WHERE id = $5",
                [email, bio, passwordHash, avatarImageToSave, req.user.id]
            );
        }
    } else {
        if (avatarImageInput === undefined) {
            await pool.query("UPDATE users SET email = $1, bio = $2 WHERE id = $3", [email, bio, req.user.id]);
        } else {
            await pool.query("UPDATE users SET email = $1, bio = $2, avatar_image = $3 WHERE id = $4", [
                email,
                bio,
                avatarImageToSave,
                req.user.id
            ]);
        }
    }

    const updated = await pool.query(
        "SELECT id, username, email, bio, year_level, avatar_image, created_at, role FROM users WHERE id = $1",
        [req.user.id]
    );
    return res.json({ ok: true, user: safeUser(updated.rows[0]) });
});

app.get("/api/posts", auth, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const countResult = await pool.query("SELECT COUNT(*)::int AS total FROM posts");
    const total = countResult.rows[0].total;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const postsResult = await pool.query(
        `SELECT p.id, p.title, p.content, p.created_at, u.username AS author
         FROM posts p
         JOIN users u ON u.id = p.author_id
         ORDER BY p.id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
    );

    const postIds = postsResult.rows.map((row) => row.id);
    let commentsByPost = new Map();
    let likesByPost = new Map();

    if (postIds.length) {
        const commentsResult = await pool.query(
            `SELECT c.id, c.post_id, c.content, c.created_at, u.username AS author
             FROM comments c
             JOIN users u ON u.id = c.author_id
             WHERE c.post_id = ANY($1::int[])
             ORDER BY c.id ASC`,
            [postIds]
        );

        for (const row of commentsResult.rows) {
            if (!commentsByPost.has(row.post_id)) {
                commentsByPost.set(row.post_id, []);
            }
            commentsByPost.get(row.post_id).push({
                id: row.id,
                content: row.content,
                createdAt: row.created_at,
                author: row.author
            });
        }

        const likesResult = await pool.query(
            `SELECT post_id, COUNT(*)::int AS count,
                    BOOL_OR(user_id = $2) AS liked
             FROM post_likes
             WHERE post_id = ANY($1::int[])
             GROUP BY post_id`,
            [postIds, req.user.id]
        );

        for (const row of likesResult.rows) {
            likesByPost.set(row.post_id, { count: row.count, liked: row.liked });
        }
    }

    const posts = postsResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        createdAt: row.created_at,
        author: row.author,
        comments: commentsByPost.get(row.id) || [],
        likes: likesByPost.get(row.id)?.count || 0,
        liked: likesByPost.get(row.id)?.liked || false
    }));

    return res.json({ posts, page, totalPages, total });
});

app.post("/api/posts", auth, async (req, res) => {
    const title = String(req.body.title || "").trim() || "Untitled post";
    const content = String(req.body.content || "").trim();

    if (!content) {
        return res.status(400).json({ error: "Post content is required" });
    }

    const created = await pool.query(
        `INSERT INTO posts (author_id, title, content)
         VALUES ($1, $2, $3)
         RETURNING id, title, content, created_at`,
        [req.user.id, title, content]
    );

    const row = created.rows[0];
    return res.status(201).json({
        post: {
            id: row.id,
            title: row.title,
            content: row.content,
            createdAt: row.created_at,
            author: req.user.username,
            comments: []
        }
    });
});

app.post("/api/posts/:postId/comments", auth, async (req, res) => {
    const postId = Number(req.params.postId);
    const content = String(req.body.content || "").trim();
    if (!content) {
        return res.status(400).json({ error: "Comment content is required" });
    }
    if (!Number.isInteger(postId)) {
        return res.status(400).json({ error: "Invalid post id" });
    }

    const postExists = await pool.query("SELECT id, author_id, title FROM posts WHERE id = $1 LIMIT 1", [postId]);
    if (!postExists.rows.length) {
        return res.status(404).json({ error: "Post not found" });
    }

    const postAuthorId = postExists.rows[0].author_id;
    const postTitle = postExists.rows[0].title;
    const created = await pool.query(
        `INSERT INTO comments (post_id, author_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, content, created_at`,
        [postId, req.user.id, content]
    );

    if (postAuthorId !== req.user.id) {
        await pool.query(
            `INSERT INTO notifications (user_id, type, message, link) VALUES ($1, $2, $3, $4)`,
            [postAuthorId, "comment", req.user.username + ' commented on your post "' + postTitle + '"', "#post-" + postId]
        );
    }

    const row = created.rows[0];
    return res.status(201).json({
        comment: {
            id: row.id,
            content: row.content,
            createdAt: row.created_at,
            author: req.user.username
        }
    });
});

app.post("/api/posts/:postId/like", auth, async (req, res) => {
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) {
        return res.status(400).json({ error: "Invalid post id" });
    }

    const postExists = await pool.query("SELECT id FROM posts WHERE id = $1 LIMIT 1", [postId]);
    if (!postExists.rows.length) {
        return res.status(404).json({ error: "Post not found" });
    }

    const existing = await pool.query(
        "SELECT user_id FROM post_likes WHERE user_id = $1 AND post_id = $2",
        [req.user.id, postId]
    );

    let liked;
    if (existing.rows.length) {
        await pool.query("DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2", [req.user.id, postId]);
        liked = false;
    } else {
        await pool.query("INSERT INTO post_likes (user_id, post_id) VALUES ($1, $2)", [req.user.id, postId]);
        liked = true;
    }

    const countResult = await pool.query("SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = $1", [postId]);
    return res.json({ liked, count: countResult.rows[0].count });
});

app.get("/api/messages", auth, async (_req, res) => {
    const result = await pool.query(
        `SELECT *
         FROM (
            SELECT m.id, m.content, m.created_at, m.message_type, m.image_data_url, m.gif_url, u.username AS author
            FROM messages m
            JOIN users u ON u.id = m.author_id
            ORDER BY m.id DESC
            LIMIT 200
         ) recent
         ORDER BY id ASC`
    );

    return res.json({
        messages: result.rows.map((row) => ({
            id: row.id,
            content: row.content,
            type: row.message_type || "text",
            imageDataUrl: row.image_data_url || null,
            gifUrl: row.gif_url || null,
            createdAt: row.created_at,
            author: row.author
        }))
    });
});

app.post("/api/messages", auth, async (req, res) => {
    const content = String(req.body.content || "").trim();
    const type = String(req.body.type || "text").trim().toLowerCase();
    const imageDataUrlInput = req.body.imageDataUrl;
    const gifUrlInput = req.body.gifUrl;

    if (!["text", "image", "gif"].includes(type)) {
        return res.status(400).json({ error: "Invalid message type" });
    }

    let imageDataUrl = null;
    let gifUrl = null;
    if (type === "image") {
        if (typeof imageDataUrlInput !== "string" || !imageDataUrlInput.trim().startsWith("data:image/")) {
            return res.status(400).json({ error: "Image message requires a valid image" });
        }
        imageDataUrl = imageDataUrlInput.trim();
        if (imageDataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
            return res.status(400).json({ error: "Image is too large" });
        }
    } else if (type === "gif") {
        if (typeof gifUrlInput !== "string" || !/^https?:\/\//i.test(gifUrlInput.trim())) {
            return res.status(400).json({ error: "GIF message requires a valid URL" });
        }
        gifUrl = gifUrlInput.trim();
        if (gifUrl.length > MAX_GIF_URL_LENGTH) {
            return res.status(400).json({ error: "GIF URL is too long" });
        }
    }

    if (type === "text" && !content) {
        return res.status(400).json({ error: "Message content is required" });
    }

    const created = await pool.query(
        `INSERT INTO messages (author_id, content, message_type, image_data_url, gif_url)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, content, message_type, image_data_url, gif_url, created_at`,
        [req.user.id, content || "", type, imageDataUrl, gifUrl]
    );

    const row = created.rows[0];
    const allUsers = await pool.query("SELECT DISTINCT author_id FROM messages WHERE author_id != $1", [req.user.id]);
    for (const uid of allUsers.rows.map(function(r) { return r.author_id; })) {
        await pool.query("INSERT INTO notifications (user_id, type, message, link) VALUES ($1, $2, $3, $4)", [uid, "message", req.user.username + " sent a message in chat", "#chat"]);
    }
    return res.status(201).json({
        message: {
            id: row.id,
            content: row.content,
            type: row.message_type || "text",
            imageDataUrl: row.image_data_url || null,
            gifUrl: row.gif_url || null,
            createdAt: row.created_at,
            author: req.user.username
        }
    });
});

app.post("/api/presence/ping", auth, async (req, res) => {
    await pool.query(
        `INSERT INTO presence (user_id, last_seen)
         VALUES ($1, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET last_seen = NOW()`,
        [req.user.id]
    );
    return res.json({ ok: true });
});

app.get("/api/presence", auth, async (_req, res) => {
    await pool.query(
        `DELETE FROM presence
         WHERE last_seen < NOW() - ($1 * INTERVAL '1 second')`,
        [ONLINE_TIMEOUT_SECONDS]
    );

    const result = await pool.query(
        `SELECT u.username
         FROM presence p
         JOIN users u ON u.id = p.user_id
         ORDER BY u.username ASC`
    );

    return res.json({ users: result.rows.map((row) => row.username) });
});

app.post("/api/presence/logout", auth, async (req, res) => {
    await pool.query("DELETE FROM presence WHERE user_id = $1", [req.user.id]);
    return res.json({ ok: true });
});



// === ADMIN PANEL ENDPOINTS ===
app.get("/api/admin/posts", adminAuth, async (req, res) => {
    const result = await pool.query(
        "SELECT p.id, p.title, p.content, p.created_at, u.username AS author, u.role AS author_role, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count FROM posts p JOIN users u ON u.id = p.author_id ORDER BY p.id DESC"
    );
    return res.json({ posts: result.rows });
});

app.delete("/api/admin/posts/:postId", adminAuth, async (req, res) => {
    await pool.query("DELETE FROM posts WHERE id = $1", [Number(req.params.postId)]);
    return res.json({ ok: true });
});

app.get("/api/admin/users", adminAuth, async (req, res) => {
    const result = await pool.query(
        "SELECT u.id, u.username, u.email, u.role, u.created_at, u.year_level, (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count, (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id) AS comment_count FROM users u ORDER BY u.created_at DESC"
    );
    return res.json({ users: result.rows });
});

app.put("/api/admin/users/:userId/role", adminAuth, async (req, res) => {
    const userId = Number(req.params.userId);
    const role = String(req.body.role || "member");
    if (!["member", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    if (userId === req.user.id) return res.status(400).json({ error: "Cannot change your own role" });
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, userId]);
    return res.json({ ok: true });
});

app.put("/api/admin/users/:userId/ban", adminAuth, async (req, res) => {
    const userId = Number(req.params.userId);
    if (userId === req.user.id) return res.status(400).json({ error: "Cannot ban yourself" });
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", ["banned", userId]);
    return res.json({ ok: true });
});

app.delete("/api/admin/users/:userId", adminAuth, async (req, res) => {
    const userId = Number(req.params.userId);
    if (userId === req.user.id) return res.status(400).json({ error: "Cannot delete yourself" });
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    return res.json({ ok: true });
});

app.get("/api/admin/comments", adminAuth, async (req, res) => {
    const result = await pool.query(
        "SELECT c.id, c.content, c.created_at, u.username AS author, u.role AS author_role, p.title AS post_title, p.id AS post_id FROM comments c JOIN users u ON u.id = c.author_id JOIN posts p ON p.id = c.post_id ORDER BY c.id DESC"
    );
    return res.json({ comments: result.rows });
});

app.delete("/api/admin/comments/:commentId", adminAuth, async (req, res) => {
    await pool.query("DELETE FROM comments WHERE id = $1", [Number(req.params.commentId)]);
    return res.json({ ok: true });
});

// === SEARCH ENDPOINT ===
app.get("/api/posts/search", auth, async (req, res) => {
    const q = String(req.query.q || "").trim();
    const author = String(req.query.author || "").trim();
    const yearLevel = String(req.query.yearLevel || "").trim();
    const dateFrom = String(req.query.dateFrom || "").trim();
    const dateTo = String(req.query.dateTo || "").trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let i = 1;
    if (q) { conditions.push("(p.title ILIKE $" + i + " OR p.content ILIKE $" + i + ")"); params.push("%" + q + "%"); i++; }
    if (author) { conditions.push("u.username ILIKE $" + i); params.push("%" + author + "%"); i++; }
    if (yearLevel) { conditions.push("u.year_level = $" + i); params.push(yearLevel); i++; }
    if (dateFrom) { conditions.push("p.created_at >= $" + i); params.push(dateFrom); i++; }
    if (dateTo) { conditions.push("p.created_at <= $" + i); params.push(dateTo + "T23:59:59Z"); i++; }
    const where = conditions.length ? ("WHERE " + conditions.join(" AND ")) : "";
    const countR = await pool.query("SELECT COUNT(*) AS total FROM posts p JOIN users u ON u.id = p.author_id " + where, params);
    const total = Number(countR.rows[0].total);
    params.push(limit, offset);
    const postsR = await pool.query(
        "SELECT p.id, p.title, p.content, p.created_at, u.username AS author, u.year_level AS author_year, (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count FROM posts p JOIN users u ON u.id = p.author_id " + where + " ORDER BY p.id DESC LIMIT $" + i + " OFFSET $" + (i+1),
        params
    );
    return res.json({ posts: postsR.rows, total, page, limit, totalPages: Math.ceil(total / limit) });
});

// === NOTIFICATIONS ENDPOINTS ===
app.get("/api/notifications", auth, async (req, res) => {
    const result = await pool.query(
        "SELECT id, type, message, link, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY id DESC LIMIT 50",
        [req.user.id]
    );
    const unread = result.rows.filter(function(n) { return !n.is_read; }).length;
    return res.json({ notifications: result.rows, unread });
});

app.put("/api/notifications/:notificationId/read", auth, async (req, res) => {
    await pool.query("UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2", [Number(req.params.notificationId), req.user.id]);
    return res.json({ ok: true });
});

app.put("/api/notifications/read-all", auth, async (req, res) => {
    await pool.query("UPDATE notifications SET is_read = TRUE WHERE user_id = $1", [req.user.id]);
    return res.json({ ok: true });
});

app.delete("/api/notifications/:notificationId", auth, async (req, res) => {
    await pool.query("DELETE FROM notifications WHERE id = $1 AND user_id = $2", [Number(req.params.notificationId), req.user.id]);
    return res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


async function start() {
    try {
        await initDb();
        app.listen(PORT, () => {
            console.log(`BSITHUB backend running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

initDb().catch(err => {
    console.error("DB init error:", err);
});

if (require.main === module) {
    start();
}

module.exports = app;
