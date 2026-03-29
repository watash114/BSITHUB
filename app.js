let token = localStorage.getItem("bsithub-token") || "";
let currentUser = null;
let posts = [];
let messages = [];

let syncTimer = null;
let pingTimer = null;
let pendingProfileAvatarData = null;
let profileAvatarChanged = false;
let pendingChatImageData = null;
let pendingGifUrl = null;
const MAX_UPLOAD_IMAGE_BYTES = 2 * 1024 * 1024;
let chatToolsOpen = false;
let gifPickerOpen = false;
let activeProfileTab = "all";
let profileRecentPosts = [];
let profileSearchVisible = false;
let profileSearchQuery = "";

const DEFAULT_SETTINGS = {
    emailNotifications: true,
    publicProfile: true,
    allowMessages: true,
    showTimestamps: true,
    chatEnterToSend: true,
    reduceMotion: false,
    profileFollowed: false
};

let currentSettings = { ...DEFAULT_SETTINGS };

const GIF_LIBRARY = [
    { url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif", tags: "happy excited dance" },
    { url: "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif", tags: "wow shocked surprised" },
    { url: "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif", tags: "thumbs up yes" },
    { url: "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif", tags: "lol cat funny" },
    { url: "https://media.giphy.com/media/xUPGcxpCV81ebKh7Vu/giphy.gif", tags: "clap celebration" },
    { url: "https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif", tags: "thinking hmm" },
    { url: "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif", tags: "what confused" },
    { url: "https://media.giphy.com/media/ICOgUNjpvO0PC/giphy.gif", tags: "fire hype" },
    { url: "https://media.giphy.com/media/14uQ3cOFteDaU/giphy.gif", tags: "dog cute" },
    { url: "https://media.giphy.com/media/KzDqC8LvVC4lshCcGK/giphy.gif", tags: "meme reaction" },
    { url: "https://media.giphy.com/media/jpbnoe3UIa8TU8LM13/giphy.gif", tags: "laugh meme" },
    { url: "https://media.giphy.com/media/QBd2kLB5qDmysEXre9/giphy.gif", tags: "hello wave" },
    { url: "https://media.giphy.com/media/3NtY188QaxDdC/giphy.gif", tags: "heart love" },
    { url: "https://media.giphy.com/media/fUYhyT9IjftxrxJXcE/giphy.gif", tags: "party celebration" },
    { url: "https://media.giphy.com/media/l2JJJ0CP1ZaKairdu/giphy.gif", tags: "nice cool" },
    { url: "https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif", tags: "facepalm" },
    { url: "https://media.giphy.com/media/YTbZzCkRQCEJa/giphy.gif", tags: "sad cry" },
    { url: "https://media.giphy.com/media/3o7TKxOhkp8vnhD8dy/giphy.gif", tags: "nicolas cage meme" }
];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return "Unknown time";
    }
    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatCompactCount(value) {
    const num = Number(value || 0);
    if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
    }
    return String(num);
}

function setAuthMessage(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

function applySettingsToUi() {
    document.body.classList.toggle("hide-timestamps", !currentSettings.showTimestamps);
    document.body.classList.toggle("reduce-motion", !!currentSettings.reduceMotion);
}

function setSettingsFormValues() {
    const mapping = [
        ["settingPublicProfile", currentSettings.publicProfile],
        ["settingAllowMessages", currentSettings.allowMessages],
        ["settingEmailNotifications", currentSettings.emailNotifications],
        ["settingShowTimestamps", currentSettings.showTimestamps],
        ["settingEnterToSend", currentSettings.chatEnterToSend],
        ["settingReduceMotion", currentSettings.reduceMotion]
    ];
    mapping.forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.checked = Boolean(value);
    });
}

function getSettingsPayloadFromForm() {
    return {
        publicProfile: Boolean(document.getElementById("settingPublicProfile")?.checked),
        allowMessages: Boolean(document.getElementById("settingAllowMessages")?.checked),
        emailNotifications: Boolean(document.getElementById("settingEmailNotifications")?.checked),
        showTimestamps: Boolean(document.getElementById("settingShowTimestamps")?.checked),
        chatEnterToSend: Boolean(document.getElementById("settingEnterToSend")?.checked),
        reduceMotion: Boolean(document.getElementById("settingReduceMotion")?.checked),
        profileFollowed: Boolean(currentSettings.profileFollowed)
    };
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Failed to read image file"));
        reader.readAsDataURL(file);
    });
}

function renderAvatar(imageId, fallbackId, username, avatarImage) {
    const image = document.getElementById(imageId);
    const fallback = document.getElementById(fallbackId);
    const fallbackText = username ? username.slice(0, 1).toUpperCase() : "?";

    if (fallback) {
        fallback.textContent = fallbackText;
    }

    if (avatarImage) {
        if (image) {
            image.src = avatarImage;
            image.classList.add("show");
        }
        if (fallback) {
            fallback.classList.add("hidden");
        }
    } else {
        if (image) {
            image.removeAttribute("src");
            image.classList.remove("show");
        }
        if (fallback) {
            fallback.classList.remove("hidden");
        }
    }
}

async function api(path, options = {}) {
    const method = options.method || "GET";
    const includeAuth = options.includeAuth !== false;

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (includeAuth && token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });

    let data = null;
    try {
        data = await response.json();
    } catch {
        data = null;
    }

    if (!response.ok) {
        if (response.status === 401 && includeAuth) {
            forceLogout("Session expired. Please login again.");
        }
        throw new Error(data?.error || "Request failed");
    }

    return data;
}

function showTab(tab) {
    const loginTab = document.getElementById("loginTabBtn");
    const registerTab = document.getElementById("registerTabBtn");
    const loginForm = document.getElementById("loginForm");
    const forgotForm = document.getElementById("forgotForm");
    const registerForm = document.getElementById("registerForm");

    if (tab === "login") {
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
        loginForm.classList.remove("hidden");
        forgotForm.classList.add("hidden");
        registerForm.classList.add("hidden");
    } else {
        registerTab.classList.add("active");
        loginTab.classList.remove("active");
        registerForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        forgotForm.classList.add("hidden");
    }

    setAuthMessage("forgotError", "");
    setAuthMessage("forgotSuccess", "");
}

function toggleForgotPassword(showForgot) {
    const loginForm = document.getElementById("loginForm");
    const forgotForm = document.getElementById("forgotForm");

    if (showForgot) {
        loginForm.classList.add("hidden");
        forgotForm.classList.remove("hidden");
    } else {
        forgotForm.classList.add("hidden");
        loginForm.classList.remove("hidden");
    }

    setAuthMessage("loginError", "");
    setAuthMessage("loginSuccess", "");
    setAuthMessage("forgotError", "");
    setAuthMessage("forgotSuccess", "");
}

async function sendResetCode() {
    setAuthMessage("forgotError", "");
    setAuthMessage("forgotSuccess", "");

    const email = document.getElementById("forgotEmail").value.trim();
    if (!email) {
        setAuthMessage("forgotError", "Please enter your email.");
        return;
    }

    try {
        await api("/api/auth/forgot-password", {
            method: "POST",
            includeAuth: false,
            body: { email }
        });
        setAuthMessage("forgotSuccess", "If your email is registered, a reset code was sent.");
    } catch (error) {
        setAuthMessage("forgotError", error.message);
    }
}

async function resetPassword() {
    setAuthMessage("forgotError", "");
    setAuthMessage("forgotSuccess", "");

    const email = document.getElementById("forgotEmail").value.trim();
    const code = document.getElementById("resetCode").value.trim();
    const newPassword = document.getElementById("resetPasswordInput").value;
    const confirmPassword = document.getElementById("resetConfirmInput").value;

    if (!email || !code || !newPassword || !confirmPassword) {
        setAuthMessage("forgotError", "All reset fields are required.");
        return;
    }
    if (newPassword !== confirmPassword) {
        setAuthMessage("forgotError", "Passwords do not match.");
        return;
    }

    try {
        await api("/api/auth/reset-password", {
            method: "POST",
            includeAuth: false,
            body: { email, code, newPassword }
        });

        document.getElementById("resetCode").value = "";
        document.getElementById("resetPasswordInput").value = "";
        document.getElementById("resetConfirmInput").value = "";

        toggleForgotPassword(false);
        setAuthMessage("loginSuccess", "Password reset successful. You can now login.");
    } catch (error) {
        setAuthMessage("forgotError", error.message);
    }
}

async function register() {
    setAuthMessage("registerError", "");
    setAuthMessage("registerSuccess", "");

    const username = document.getElementById("registerUsername").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const yearLevel = document.getElementById("registerYear").value;
    const password = document.getElementById("registerPassword").value;
    const confirm = document.getElementById("registerConfirm").value;

    if (!username || !email || !password || !confirm) {
        setAuthMessage("registerError", "All fields are required.");
        return;
    }
    if (password !== confirm) {
        setAuthMessage("registerError", "Passwords do not match.");
        return;
    }
    if (!["BSIT 1", "BSIT 2", "BSIT 3", "BSIT 4"].includes(yearLevel)) {
        setAuthMessage("registerError", "Please select your BSIT year level.");
        return;
    }

    try {
        await api("/api/auth/register", {
            method: "POST",
            includeAuth: false,
            body: { username, email, yearLevel, password }
        });

        document.getElementById("registerUsername").value = "";
        document.getElementById("registerEmail").value = "";
        document.getElementById("registerYear").value = "BSIT 1";
        document.getElementById("registerPassword").value = "";
        document.getElementById("registerConfirm").value = "";

        setAuthMessage("registerSuccess", "Account created. You can login now.");
        showTab("login");
    } catch (error) {
        setAuthMessage("registerError", error.message);
    }
}

async function login() {
    setAuthMessage("loginError", "");
    setAuthMessage("loginSuccess", "");

    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!username || !password) {
        setAuthMessage("loginError", "Please enter username and password.");
        return;
    }

    try {
        const result = await api("/api/auth/login", {
            method: "POST",
            includeAuth: false,
            body: { username, password }
        });

        token = result.token;
        currentUser = result.user;
        localStorage.setItem("bsithub-token", token);
    setRoleBadge(currentUser.role);
        await openApp();

        document.getElementById("loginUsername").value = "";
        document.getElementById("loginPassword").value = "";
    } catch (error) {
        setAuthMessage("loginError", error.message);
    }
}

async function openApp() {
    document.getElementById("authModal").classList.add("hidden");
    document.getElementById("app").style.display = "flex";
    document.getElementById("currentUser").textContent = `@${currentUser.username}`;

    if (currentUser.role === "admin") {
        document.getElementById("navAdmin").classList.remove("hidden");
    } else {
        document.getElementById("navAdmin").classList.add("hidden");
    }

    showPage("feed");
    await refreshAll();
    startSync();
}

function stopSync() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
    if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
    }
}

function startSync() {
    stopSync();

    syncTimer = setInterval(async () => {
        if (!token) return;
        try {
            await Promise.all([refreshPosts(), refreshMessages(), refreshPresence(), refreshNotifications()]);
        } catch {
            // no-op; errors are handled by api() for auth and UI remains usable
        }
    }, 4000);

    pingTimer = setInterval(async () => {
        if (!token) return;
        try {
            await api("/api/presence/ping", { method: "POST" });
        } catch {
            // no-op
        }
    }, 15000);
}

async function refreshAll() {
    await refreshSettings();
    await Promise.all([refreshPosts(), refreshMessages(), refreshPresence(), refreshProfile(), refreshNotifications()]);
    await api("/api/presence/ping", { method: "POST" });
}

async function refreshPosts() {
    const result = await api("/api/posts");
    posts = result.posts || [];
    renderFeed();
}

async function refreshMessages() {
    const result = await api("/api/messages");
    messages = result.messages || [];
    renderMessages();
}

async function refreshPresence() {
    const result = await api("/api/presence");
    renderOnlineUsers(result.users || []);
}

async function refreshSettings() {
    const result = await api("/api/settings/me");
    currentSettings = {
        ...DEFAULT_SETTINGS,
        ...(result.settings || {})
    };
    applySettingsToUi();
    setSettingsFormValues();
}

async function saveSettings() {
    setAuthMessage("settingsError", "");
    setAuthMessage("settingsSuccess", "");
    try {
        const payload = getSettingsPayloadFromForm();
        const result = await api("/api/settings/me", {
            method: "PUT",
            body: payload
        });
        currentSettings = {
            ...DEFAULT_SETTINGS,
            ...(result.settings || {})
        };
        applySettingsToUi();
        setSettingsFormValues();
        setAuthMessage("settingsSuccess", "Settings saved.");
    } catch (error) {
        setAuthMessage("settingsError", error.message);
    }
}

function resetSettingsToDefaults() {
    currentSettings = { ...DEFAULT_SETTINGS };
    setSettingsFormValues();
    applySettingsToUi();
    setAuthMessage("settingsSuccess", "Defaults loaded. Click Save Settings to apply.");
}

function setRoleBadge(role) {
    const profileBadge = document.getElementById("adminBadge");
    const headerBadge = document.getElementById("headerAdminBadge");
    const isAdmin = role === "admin";
    [profileBadge, headerBadge].forEach(function(badge) {
        if (!badge) return;
        if (isAdmin) {
            badge.style.display = "inline-flex";
            badge.classList.add("admin");
        } else {
            badge.style.display = "none";
            badge.classList.remove("admin");
        }
    });
}

async function refreshProfile() {
    const result = await api("/api/profile/me");
    currentUser = result.user;
    setRoleBadge(currentUser.role);

    const usernameTag = `@${currentUser.username}`;
    const displayName = currentUser.username;
    const yearLevel = currentUser.yearLevel || "BSIT 1";
    const isPublicProfile = currentSettings.publicProfile;
    const bioText = `${currentUser.bio || "BSIT Student"} - ${yearLevel}`;
    const joinedDate = new Date(currentUser.createdAt).toLocaleDateString();
    const postsValue = Number(result.stats?.posts || 0);
    const commentsValue = Number(result.stats?.comments || 0);

    const followerBase = postsValue * 300 + commentsValue * 45 + currentUser.username.length * 80 + 1200;
    const followersCount = formatCompactCount(followerBase);
    const followingCount = formatCompactCount(postsValue * 90 + currentUser.username.length * 60 + 350);

    renderAvatar("profileAvatarImage", "profileAvatarFallback", currentUser.username, currentUser.avatarImage);
    setText("profileDisplayName", displayName);
    setText("profileFollowers", followersCount);
    setText("profileFollowing", followingCount);
    setText("profileTagline", bioText);
    setText("profileRole", currentUser.role === "admin" ? "ADMIN" : (isPublicProfile ? "BSIT Student" : "Private Profile"));
    setText("profileHandle", usernameTag);
    setText("profileDetailYear", yearLevel);
    setText("profileDetailSince", joinedDate);
    setText("profileDetailEmail", isPublicProfile ? currentUser.email || "" : "Hidden (private)");

    renderAvatar("feedProfileAvatarImage", "feedProfileAvatarFallback", currentUser.username, currentUser.avatarImage);
    setText("feedProfileUsername", usernameTag);
    setText("feedProfileBio", bioText);
    setText("feedProfileEmail", isPublicProfile ? currentUser.email || "" : "Private profile");

    const postsCount = String(postsValue);
    const commentsCount = String(commentsValue);
    setText("statPosts", postsCount);
    setText("statComments", commentsCount);
    setText("feedStatPosts", postsCount);
    setText("feedStatComments", commentsCount);

    profileRecentPosts = result.recentPosts || [];
    renderProfileTabContent();
}

function renderProfileTabContent() {
    const myPostsWrap = document.getElementById("myPosts");
    const profilePostsTitle = document.getElementById("profilePostsTitle");
    if (!myPostsWrap || !profilePostsTitle) {
        return;
    }

    const titleByTab = {
        all: "Posts",
        about: "About",
        friends: "Friends",
        photos: "Photos"
    };
    setText("profilePostsTitle", titleByTab[activeProfileTab] || "Posts");

    if (activeProfileTab === "all") {
        const query = profileSearchQuery.trim().toLowerCase();
        const visiblePosts = query
            ? profileRecentPosts.filter((post) => String(post.title || "").toLowerCase().includes(query))
            : profileRecentPosts;

        if (!visiblePosts.length) {
            myPostsWrap.innerHTML = '<div class="my-post-card empty-posts">No posts available</div>';
            return;
        }

        myPostsWrap.innerHTML = visiblePosts
            .map(
                (post) =>
                    `<div class="my-post-card"><strong>${escapeHtml(post.title)}</strong><div class="muted">${formatDate(post.createdAt)}</div></div>`
            )
            .join("");
        return;
    }

    const aboutText = currentUser
        ? `${currentUser.bio || "BSIT Student"} | ${currentUser.email || "No contact info"}`
        : "No profile details yet.";
    const messageByTab = {
        about: aboutText,
        friends: "No friends available yet.",
        photos: "No photos available."
    };

    myPostsWrap.innerHTML = `<div class="my-post-card empty-posts">${escapeHtml(messageByTab[activeProfileTab] || "Coming soon")}</div>`;
}

function showProfileTab(tab) {
    activeProfileTab = tab;
    document.querySelectorAll(".profile-tab").forEach((button) => {
        button.classList.toggle("active", button.dataset.tab === tab);
    });

    const searchInput = document.getElementById("profileSearchInput");
    if (searchInput) {
        const shouldShowSearch = tab === "all" && profileSearchVisible;
        searchInput.classList.toggle("hidden", !shouldShowSearch);
        if (!shouldShowSearch) {
            searchInput.value = "";
            profileSearchQuery = "";
        }
    }

    renderProfileTabContent();
}

function toggleProfileSearch() {
    showProfileTab("all");
    const searchInput = document.getElementById("profileSearchInput");
    if (!searchInput) return;

    profileSearchVisible = !profileSearchVisible;
    searchInput.classList.toggle("hidden", !profileSearchVisible);
    if (profileSearchVisible) {
        searchInput.focus();
    } else {
        searchInput.value = "";
        profileSearchQuery = "";
        renderProfileTabContent();
    }
}

async function logout() {
    if (token) {
        try {
            await api("/api/presence/logout", { method: "POST" });
        } catch {
            // no-op
        }
    }
    forceLogout("");
}

function forceLogout(message) {
    stopSync();
    clearChatAttachment();
    toggleGifPicker(false);
    token = "";
    currentUser = null;
    posts = [];
    messages = [];
    pendingProfileAvatarData = null;
    profileAvatarChanged = false;
    activeProfileTab = "all";
    profileRecentPosts = [];
    profileSearchVisible = false;
    profileSearchQuery = "";
    currentSettings = { ...DEFAULT_SETTINGS };
    localStorage.removeItem("bsithub-token");

    document.getElementById("app").style.display = "none";
    document.getElementById("authModal").classList.remove("hidden");
    document.getElementById("currentUser").textContent = "";
    document.getElementById("messages").innerHTML = "";
    document.getElementById("feed").innerHTML = "";
    document.getElementById("userList").innerHTML = "";
    document.getElementById("navAdmin").classList.add("hidden");
    document.getElementById("notifDropdown").classList.add("hidden");
    document.getElementById("notifCountBadge").classList.add("hidden");
    document.getElementById("notifList").innerHTML = '<div class="notif-empty" id="notifEmpty">No notifications yet</div>';
    const avatarPreview = document.getElementById("editAvatarPreview");
    if (avatarPreview) {
        avatarPreview.removeAttribute("src");
        avatarPreview.classList.add("hidden");
    }
    renderAvatar("profileAvatarImage", "profileAvatarFallback", "", null);
    renderAvatar("feedProfileAvatarImage", "feedProfileAvatarFallback", "", null);
    setText("profileDisplayName", "");
    setText("profileFollowers", "0");
    setText("profileFollowing", "0");
    setText("profileTagline", "");
    setText("profileRole", "");
    setRoleBadge(null);
    setText("profileHandle", "");
    setText("profileDetailYear", "");
    setText("profileDetailSince", "");
    setText("profileDetailEmail", "");
    setText("feedProfileUsername", "");
    setText("feedProfileBio", "");
    setText("feedProfileEmail", "");
    setText("statPosts", "0");
    setText("statComments", "0");
    setText("feedStatPosts", "0");
    setText("feedStatComments", "0");
    setSettingsFormValues();
    applySettingsToUi();
    showProfileTab("all");
    showTab("login");
    if (message) {
        setAuthMessage("loginError", message);
    }
}

function showPage(page) {
    const pages = {
        feed: document.getElementById("feedPage"),
        chat: document.getElementById("chatPage"),
        profile: document.getElementById("profilePage"),
        settings: document.getElementById("settingsPage"),
        admin: document.getElementById("adminPage"),
        search: document.getElementById("searchPage")
    };

    const nav = {
        feed: document.getElementById("navFeed"),
        chat: document.getElementById("navChat"),
        profile: document.getElementById("navProfile"),
        settings: document.getElementById("navSettings"),
        admin: document.getElementById("navAdmin")
    };

    Object.keys(pages).forEach((key) => {
        pages[key].classList.toggle("hidden", key !== page);
        if (nav[key]) nav[key].classList.toggle("active", key === page);
    });

    if (page !== "chat") {
        toggleChatTools(false);
        toggleGifPicker(false);
    }

    if (page === "profile" && token) {
        refreshProfile().catch(() => {});
    }

    if (page === "settings") {
        setSettingsFormValues();
        setAuthMessage("settingsError", "");
        setAuthMessage("settingsSuccess", "");
    }

    if (page === "admin") {
        if (currentUser && currentUser.role === "admin") {
            showAdminTab("posts");
        } else {
            showPage("feed");
        }
    }

    if (page === "search") {
        document.getElementById("searchResults").innerHTML = '<div class="post-card">Enter a search term and filters to find posts.</div>';
        document.getElementById("searchPagination").innerHTML = "";
    }
}

function renderFeed() {
    const feed = document.getElementById("feed");
    if (!posts.length) {
        feed.innerHTML = '<div class="post-card">No posts yet. Be the first to share something.</div>';
        return;
    }

    feed.innerHTML = posts
        .map((post) => {
            const commentsHtml = post.comments.length
                ? post.comments
                    .map(
                        (comment) =>
                            `<div class="comment"><div>${escapeHtml(comment.content)}</div><div class="comment-meta">${escapeHtml(comment.author)} - ${formatDate(comment.createdAt)}</div></div>`
                    )
                    .join("")
                : '<div class="comment-meta">No comments yet.</div>';

            return `<article class="post-card">
                <div class="post-meta">${escapeHtml(post.author)} - ${formatDate(post.createdAt)}</div>
                <h4 class="post-title">${escapeHtml(post.title)}</h4>
                <p class="post-body">${escapeHtml(post.content)}</p>
                <div class="comments">${commentsHtml}</div>
                <div class="comment-input-wrap">
                    <input id="commentInput-${post.id}" type="text" placeholder="Write a comment..." maxlength="300">
                    <button onclick="addComment(${post.id})">Comment</button>
                </div>
            </article>`;
        })
        .join("");
}

async function createPost() {
    const titleInput = document.getElementById("postTitle");
    const contentInput = document.getElementById("postContent");
    const postError = document.getElementById("postError");
    postError.textContent = "";

    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!content) {
        postError.textContent = "Post content is required.";
        return;
    }

    try {
        await api("/api/posts", {
            method: "POST",
            body: {
                title,
                content
            }
        });
        titleInput.value = "";
        contentInput.value = "";
        await Promise.all([refreshPosts(), refreshProfile()]);
    } catch (error) {
        postError.textContent = error.message;
    }
}

async function addComment(postId) {
    const input = document.getElementById(`commentInput-${postId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;

    try {
        await api(`/api/posts/${postId}/comments`, {
            method: "POST",
            body: { content }
        });
        input.value = "";
        await Promise.all([refreshPosts(), refreshProfile()]);
    } catch {
        // no-op
    }
}

function renderMessages() {
    const container = document.getElementById("messages");
    container.innerHTML = "";

    messages.forEach((message) => {
        const div = document.createElement("div");
        const isSelf = currentUser && message.author === currentUser.username;
        div.className = `message ${isSelf ? "self" : ""}`.trim();
        const safeAuthor = escapeHtml(message.author);
        const safeText = escapeHtml(message.content || "");
        const timeText = formatDate(message.createdAt);

        if (message.type === "image" && message.imageDataUrl) {
            div.innerHTML = `
                <div class="username">${safeAuthor}</div>
                ${safeText ? `<div class="text">${safeText}</div>` : ""}
                <img class="message-image" src="${message.imageDataUrl}" alt="Chat image from ${safeAuthor}">
                <div class="time">${timeText}</div>
            `;
        } else if (message.type === "gif" && message.gifUrl) {
            div.innerHTML = `
                <div class="username">${safeAuthor}</div>
                ${safeText ? `<div class="text">${safeText}</div>` : ""}
                <img class="message-image" src="${message.gifUrl}" alt="GIF from ${safeAuthor}">
                <div class="time">${timeText}</div>
            `;
        } else {
            div.innerHTML = `<div class="username">${safeAuthor}</div><div class="text">${safeText}</div><div class="time">${timeText}</div>`;
        }
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    if (!currentSettings.allowMessages) {
        setChatAttachment("Messaging is disabled in Settings", false);
        return;
    }

    const input = document.getElementById("messageInput");
    let content = input.value.trim();

    if (!content && !pendingChatImageData && !pendingGifUrl) {
        content = "👍";
    }

    const type = pendingChatImageData ? "image" : pendingGifUrl ? "gif" : "text";

    try {
        await api("/api/messages", {
            method: "POST",
            body: {
                content,
                type,
                imageDataUrl: pendingChatImageData,
                gifUrl: pendingGifUrl
            }
        });
        input.value = "";
        clearChatAttachment();
        toggleChatTools(false);
        toggleGifPicker(false);
        updateChatComposerState();
        await refreshMessages();
    } catch {
        // no-op
    }
}

function insertEmoji(emoji) {
    const input = document.getElementById("messageInput");
    input.value += emoji;
    updateChatComposerState();
    input.focus();
}

function toggleChatTools(forceOpen) {
    const tools = document.getElementById("chatTools");
    const toggleBtn = document.getElementById("chatToolsToggle");
    if (!tools || !toggleBtn) {
        return;
    }

    if (typeof forceOpen === "boolean") {
        chatToolsOpen = forceOpen;
    } else {
        chatToolsOpen = !chatToolsOpen;
    }

    tools.classList.toggle("hidden", !chatToolsOpen);
    toggleBtn.classList.toggle("active", chatToolsOpen);
}

function updateChatComposerState() {
    const input = document.getElementById("messageInput");
    const sendBtn = document.getElementById("chatSendBtn");
    const hasText = input && input.value.trim().length > 0;
    const hasImage = Boolean(pendingChatImageData);
    const hasGif = Boolean(pendingGifUrl);
    if (sendBtn) {
        sendBtn.textContent = hasText || hasImage || hasGif ? "➤" : "👍";
    }
}

function renderGifGrid(query = "") {
    const grid = document.getElementById("gifGrid");
    if (!grid) {
        return;
    }
    const q = query.trim().toLowerCase();
    const filtered = GIF_LIBRARY.filter((item) => !q || item.tags.includes(q));
    if (!filtered.length) {
        grid.innerHTML = '<div class="gif-empty">No GIF found. Try another keyword.</div>';
        return;
    }

    grid.innerHTML = filtered
        .map(
            (item) =>
                `<img class="gif-item" src="${item.url}" alt="gif" loading="lazy" onclick="selectGif('${item.url}')">`
        )
        .join("");
}

function toggleGifPicker(forceOpen) {
    const picker = document.getElementById("gifPicker");
    if (!picker) {
        return;
    }

    if (typeof forceOpen === "boolean") {
        gifPickerOpen = forceOpen;
    } else {
        gifPickerOpen = !gifPickerOpen;
    }

    picker.classList.toggle("hidden", !gifPickerOpen);
    if (gifPickerOpen) {
        toggleChatTools(false);
        renderGifGrid(document.getElementById("gifSearchInput").value || "");
        document.getElementById("gifSearchInput").focus();
    }
}

function selectGif(url) {
    pendingGifUrl = url;
    pendingChatImageData = null;
    const fileInput = document.getElementById("chatImageInput");
    if (fileInput) {
        fileInput.value = "";
    }
    setChatAttachment("GIF selected", true);
    toggleGifPicker(false);
    updateChatComposerState();
}

function openChatImagePicker() {
    toggleGifPicker(false);
    const fileInput = document.getElementById("chatImageInput");
    if (fileInput) {
        fileInput.click();
    }
}

function setChatAttachment(label, showClear) {
    const attachment = document.getElementById("chatAttachment");
    if (!attachment) {
        return;
    }
    if (!label) {
        attachment.innerHTML = "";
        return;
    }

    attachment.innerHTML = `${escapeHtml(label)} ${showClear ? '<button type="button" class="clear-attachment-btn" onclick="clearChatAttachment()">Clear</button>' : ""}`;
}

function clearChatImage() {
    pendingChatImageData = null;
    const fileInput = document.getElementById("chatImageInput");
    if (fileInput) {
        fileInput.value = "";
    }
}

function clearPendingGif() {
    pendingGifUrl = null;
}

function clearChatAttachment() {
    clearChatImage();
    clearPendingGif();
    setChatAttachment("", false);
    updateChatComposerState();
}

async function onChatImageSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        return;
    }
    if (!file.type.startsWith("image/")) {
        clearChatImage();
        return;
    }
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
        clearChatImage();
        setChatAttachment("Image too large (max 2MB)", false);
        return;
    }

    try {
        pendingChatImageData = await readFileAsDataUrl(file);
        clearPendingGif();
        setChatAttachment(`Attached: ${file.name}`, true);
        toggleChatTools(true);
        toggleGifPicker(false);
        updateChatComposerState();
    } catch {
        clearChatImage();
        setChatAttachment("Failed to load image", false);
    }
}

function renderOnlineUsers(users) {
    const list = document.getElementById("userList");
    list.innerHTML = users.map((user) => `<li>${escapeHtml(user)}</li>`).join("");
}

function toggleEditProfile() {
    const panel = document.getElementById("editProfilePanel");
    const isHidden = panel.classList.toggle("hidden");
    if (!isHidden && currentUser) {
        document.getElementById("editBio").value = currentUser.bio || "";
        document.getElementById("editEmail").value = currentUser.email || "";
        document.getElementById("editPassword").value = "";
        document.getElementById("editAvatarInput").value = "";
        pendingProfileAvatarData = currentUser.avatarImage || null;
        profileAvatarChanged = false;
        const preview = document.getElementById("editAvatarPreview");
        if (currentUser.avatarImage) {
            preview.src = currentUser.avatarImage;
            preview.classList.remove("hidden");
        } else {
            preview.removeAttribute("src");
            preview.classList.add("hidden");
        }
        document.getElementById("editError").textContent = "";
        document.getElementById("editSuccess").textContent = "";
    }
}

function clearAvatarSelection() {
    pendingProfileAvatarData = null;
    profileAvatarChanged = true;
    const preview = document.getElementById("editAvatarPreview");
    preview.removeAttribute("src");
    preview.classList.add("hidden");
    const input = document.getElementById("editAvatarInput");
    if (input) {
        input.value = "";
    }
}

async function onAvatarSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        return;
    }
    if (!file.type.startsWith("image/")) {
        event.target.value = "";
        return;
    }
    if (file.size > MAX_UPLOAD_IMAGE_BYTES) {
        event.target.value = "";
        document.getElementById("editError").textContent = "Image too large (max 2MB).";
        return;
    }

    try {
        pendingProfileAvatarData = await readFileAsDataUrl(file);
        profileAvatarChanged = true;
        const preview = document.getElementById("editAvatarPreview");
        preview.src = pendingProfileAvatarData;
        preview.classList.remove("hidden");
        document.getElementById("editError").textContent = "";
    } catch {
        event.target.value = "";
        document.getElementById("editError").textContent = "Failed to read selected image.";
    }
}

async function saveProfile() {
    const editError = document.getElementById("editError");
    const editSuccess = document.getElementById("editSuccess");
    editError.textContent = "";
    editSuccess.textContent = "";

    const bio = document.getElementById("editBio").value.trim() || "BSIT Student";
    const email = document.getElementById("editEmail").value.trim();
    const password = document.getElementById("editPassword").value;

    const payload = {
        bio,
        email,
        password
    };

    if (profileAvatarChanged) {
        payload.avatarImage = pendingProfileAvatarData;
    }

    try {
        await api("/api/profile/me", {
            method: "PUT",
            body: payload
        });
        editSuccess.textContent = "Profile updated.";
        profileAvatarChanged = false;
        await refreshProfile();
    } catch (error) {
        editError.textContent = error.message;
    }
}

async function refreshNotifications() {
    if (!token) return;
    try {
        const result = await api("/api/notifications");
        const notifications = result.notifications || [];
        const unread = result.unread || 0;

        const badge = document.getElementById("notifCountBadge");
        if (unread > 0) {
            badge.textContent = unread > 99 ? "99+" : String(unread);
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }

        const list = document.getElementById("notifList");
        const empty = document.getElementById("notifEmpty");
        if (!notifications.length) {
            list.innerHTML = '<div class="notif-empty" id="notifEmpty">No notifications yet</div>';
            return;
        }

        list.innerHTML = notifications
            .map((n) => {
                const unreadClass = n.is_read ? "" : "unread";
                const linkAttr = n.link ? `onclick="navigateFromNotif('${escapeHtml(n.link)}')"` : "";
                return `<div class="notif-item ${unreadClass}" ${linkAttr}>
                    <div class="notif-message">${escapeHtml(n.message)}</div>
                    <div class="notif-time">${formatDate(n.created_at)}</div>
                    <div class="notif-actions">
                        ${!n.is_read ? `<button class="notif-action-btn" onclick="event.stopPropagation(); markRead(${n.id})">✓</button>` : ""}
                        <button class="notif-action-btn" onclick="event.stopPropagation(); deleteNotif(${n.id})">✕</button>
                    </div>
                </div>`;
            })
            .join("");
    } catch {
        // no-op
    }
}

function toggleNotifications() {
    const dropdown = document.getElementById("notifDropdown");
    dropdown.classList.toggle("hidden");
    if (!dropdown.classList.contains("hidden")) {
        refreshNotifications();
    }
}

async function markAllRead() {
    try {
        await api("/api/notifications/read-all", { method: "PUT" });
        await refreshNotifications();
    } catch {
        // no-op
    }
}

async function markRead(notifId) {
    try {
        await api(`/api/notifications/${notifId}/read`, { method: "PUT" });
        await refreshNotifications();
    } catch {
        // no-op
    }
}

async function deleteNotif(notifId) {
    try {
        await api(`/api/notifications/${notifId}`, { method: "DELETE" });
        await refreshNotifications();
    } catch {
        // no-op
    }
}

function navigateFromNotif(link) {
    document.getElementById("notifDropdown").classList.add("hidden");
    if (link === "#chat") {
        showPage("chat");
    } else if (link === "#feed") {
        showPage("feed");
    }
}

let activeAdminTab = "posts";

function showAdminTab(tab) {
    activeAdminTab = tab;
    document.querySelectorAll(".admin-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tab === tab);
    });
    if (tab === "posts") loadAdminPosts();
    else if (tab === "users") loadAdminUsers();
    else if (tab === "comments") loadAdminComments();
}

async function loadAdminPosts() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div class="admin-loading">Loading posts...</div>';
    try {
        const result = await api("/api/admin/posts");
        const posts = result.posts || [];
        if (!posts.length) {
            content.innerHTML = '<div class="admin-empty">No posts found.</div>';
            return;
        }
        content.innerHTML = `<table class="admin-table">
            <thead><tr><th>Title</th><th>Author</th><th>Comments</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>${posts.map((p) => `<tr>
                <td>${escapeHtml(p.title || "(no title)")}</td>
                <td>${escapeHtml(p.author)}</td>
                <td>${p.comment_count || 0}</td>
                <td>${formatDate(p.created_at)}</td>
                <td><button class="admin-danger-btn" onclick="adminDeletePost(${p.id})">Delete</button></td>
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (error) {
        content.innerHTML = `<div class="admin-error">Failed to load posts: ${escapeHtml(error.message)}</div>`;
    }
}

async function adminDeletePost(postId) {
    if (!confirm("Delete this post?")) return;
    try {
        await api(`/api/admin/posts/${postId}`, { method: "DELETE" });
        loadAdminPosts();
    } catch (error) {
        alert("Failed: " + error.message);
    }
}

async function loadAdminUsers() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div class="admin-loading">Loading users...</div>';
    try {
        const result = await api("/api/admin/users");
        const users = result.users || [];
        if (!users.length) {
            content.innerHTML = '<div class="admin-empty">No users found.</div>';
            return;
        }
        content.innerHTML = `<table class="admin-table">
            <thead><tr><th>Username</th><th>Email</th><th>Year</th><th>Posts</th><th>Comments</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>${users.map((u) => `<tr>
                <td>${escapeHtml(u.username)}</td>
                <td>${escapeHtml(u.email || "")}</td>
                <td>${escapeHtml(u.year_level || "")}</td>
                <td>${u.post_count || 0}</td>
                <td>${u.comment_count || 0}</td>
                <td><span class="role-badge ${u.role === "admin" ? "admin" : ""}">${escapeHtml(u.role || "member")}</span></td>
                <td class="admin-actions-cell">
                    ${u.role !== "admin" ? `<button class="admin-btn" onclick="adminChangeRole(${u.id}, 'admin')">Make Admin</button>` : `<button class="admin-btn" onclick="adminChangeRole(${u.id}, 'member')">Remove Admin</button>`}
                    ${u.role !== "banned" ? `<button class="admin-warning-btn" onclick="adminBanUser(${u.id})">Ban</button>` : ""}
                    <button class="admin-danger-btn" onclick="adminDeleteUser(${u.id})">Delete</button>
                </td>
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (error) {
        content.innerHTML = `<div class="admin-error">Failed to load users: ${escapeHtml(error.message)}</div>`;
    }
}

async function adminChangeRole(userId, role) {
    if (!confirm(`Change user role to "${role}"?`)) return;
    try {
        await api(`/api/admin/users/${userId}/role`, { method: "PUT", body: { role } });
        loadAdminUsers();
    } catch (error) {
        alert("Failed: " + error.message);
    }
}

async function adminBanUser(userId) {
    if (!confirm("Ban this user?")) return;
    try {
        await api(`/api/admin/users/${userId}/ban`, { method: "PUT" });
        loadAdminUsers();
    } catch (error) {
        alert("Failed: " + error.message);
    }
}

async function adminDeleteUser(userId) {
    if (!confirm("Permanently delete this user?")) return;
    try {
        await api(`/api/admin/users/${userId}`, { method: "DELETE" });
        loadAdminUsers();
    } catch (error) {
        alert("Failed: " + error.message);
    }
}

async function loadAdminComments() {
    const content = document.getElementById("adminContent");
    content.innerHTML = '<div class="admin-loading">Loading comments...</div>';
    try {
        const result = await api("/api/admin/comments");
        const comments = result.comments || [];
        if (!comments.length) {
            content.innerHTML = '<div class="admin-empty">No comments found.</div>';
            return;
        }
        content.innerHTML = `<table class="admin-table">
            <thead><tr><th>Content</th><th>Author</th><th>Post</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>${comments.map((c) => `<tr>
                <td>${escapeHtml(c.content.substring(0, 80))}${c.content.length > 80 ? "..." : ""}</td>
                <td>${escapeHtml(c.author)}</td>
                <td>${escapeHtml(c.post_title || "(deleted post)")}</td>
                <td>${formatDate(c.created_at)}</td>
                <td><button class="admin-danger-btn" onclick="adminDeleteComment(${c.id})">Delete</button></td>
            </tr>`).join("")}</tbody>
        </table>`;
    } catch (error) {
        content.innerHTML = `<div class="admin-error">Failed to load comments: ${escapeHtml(error.message)}</div>`;
    }
}

async function adminDeleteComment(commentId) {
    if (!confirm("Delete this comment?")) return;
    try {
        await api(`/api/admin/comments/${commentId}`, { method: "DELETE" });
        loadAdminComments();
    } catch (error) {
        alert("Failed: " + error.message);
    }
}

let searchPage = 1;

function openSearchPage() {
    showPage("search");
    document.getElementById("searchQuery").value = "";
    document.getElementById("filterYear").value = "";
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    populateAuthorFilter();
}

function populateAuthorFilter() {
    const select = document.getElementById("filterAuthor");
    const uniqueAuthors = [...new Set(posts.map((p) => p.author).filter(Boolean))];
    select.innerHTML = '<option value="">All Authors</option>' +
        uniqueAuthors.map((a) => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join("");
}

async function submitSearch(event) {
    if (event) event.preventDefault();
    searchPage = 1;
    await performSearch();
}

async function performSearch() {
    const q = document.getElementById("searchQuery").value.trim();
    const author = document.getElementById("filterAuthor").value;
    const yearLevel = document.getElementById("filterYear").value;
    const dateFrom = document.getElementById("filterDateFrom").value;
    const dateTo = document.getElementById("filterDateTo").value;

    const params = new URLSearchParams();
    if (q) params.append("q", q);
    if (author) params.append("author", author);
    if (yearLevel) params.append("yearLevel", yearLevel);
    if (dateFrom) params.append("dateFrom", dateFrom);
    if (dateTo) params.append("dateTo", dateTo);
    params.append("page", searchPage);

    const container = document.getElementById("searchResults");
    container.innerHTML = '<div class="admin-loading">Searching...</div>';

    try {
        const result = await api(`/api/posts/search?${params.toString()}`);
        const searchPosts = result.posts || [];
        const total = result.total || 0;
        const totalPages = result.totalPages || 1;

        if (!searchPosts.length) {
            container.innerHTML = '<div class="post-card">No posts found matching your search.</div>';
        } else {
            container.innerHTML = `<div class="search-result-count">${total} result${total !== 1 ? "s" : ""} found</div>` +
                searchPosts.map((post) => {
                    const commentsHtml = post.comments && post.comments.length
                        ? post.comments.map((c) => `<div class="comment"><div>${escapeHtml(c.content)}</div><div class="comment-meta">${escapeHtml(c.author)} - ${formatDate(c.createdAt)}</div></div>`).join("")
                        : '<div class="comment-meta">No comments yet.</div>';
                    return `<article class="post-card">
                        <div class="post-meta">${escapeHtml(post.author)} - ${formatDate(post.createdAt)}</div>
                        <h4 class="post-title">${escapeHtml(post.title)}</h4>
                        <p class="post-body">${escapeHtml(post.content)}</p>
                        <div class="comments">${commentsHtml}</div>
                        <div class="comment-input-wrap">
                            <input id="commentInput-${post.id}" type="text" placeholder="Write a comment..." maxlength="300">
                            <button onclick="addComment(${post.id})">Comment</button>
                        </div>
                    </article>`;
                }).join("");
        }

        renderSearchPagination(totalPages);
    } catch (error) {
        container.innerHTML = `<div class="admin-error">Search failed: ${escapeHtml(error.message)}</div>`;
    }
}

function renderSearchPagination(totalPages) {
    const pagination = document.getElementById("searchPagination");
    if (totalPages <= 1) {
        pagination.innerHTML = "";
        return;
    }
    let html = "";
    if (searchPage > 1) {
        html += `<button class="page-btn" onclick="goToSearchPage(${searchPage - 1})">← Prev</button>`;
    }
    html += `<span class="page-info">Page ${searchPage} of ${totalPages}</span>`;
    if (searchPage < totalPages) {
        html += `<button class="page-btn" onclick="goToSearchPage(${searchPage + 1})">Next →</button>`;
    }
    pagination.innerHTML = html;
}

function goToSearchPage(page) {
    searchPage = page;
    performSearch();
}

function clearSearch() {
    document.getElementById("searchQuery").value = "";
    document.getElementById("filterAuthor").value = "";
    document.getElementById("filterYear").value = "";
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    searchPage = 1;
    document.getElementById("searchResults").innerHTML = '<div class="post-card">Enter a search term and filters to find posts.</div>';
    document.getElementById("searchPagination").innerHTML = "";
}

document.getElementById("loginPassword").addEventListener("keypress", (event) => {
    if (event.key === "Enter") login();
});

document.getElementById("registerConfirm").addEventListener("keypress", (event) => {
    if (event.key === "Enter") register();
});

document.getElementById("forgotEmail").addEventListener("keypress", (event) => {
    if (event.key === "Enter") sendResetCode();
});

document.getElementById("resetConfirmInput").addEventListener("keypress", (event) => {
    if (event.key === "Enter") resetPassword();
});

document.getElementById("messageInput").addEventListener("keypress", (event) => {
    if (event.key === "Enter" && currentSettings.chatEnterToSend) {
        event.preventDefault();
        sendMessage();
    }
});

document.getElementById("messageInput").addEventListener("input", () => {
    updateChatComposerState();
});

document.getElementById("profileSearchInput").addEventListener("input", (event) => {
    profileSearchQuery = event.target.value || "";
    renderProfileTabContent();
});

document.getElementById("chatImageInput").addEventListener("change", onChatImageSelected);
document.getElementById("gifSearchInput").addEventListener("input", (event) => {
    renderGifGrid(event.target.value || "");
});
document.getElementById("editAvatarInput").addEventListener("change", onAvatarSelected);

async function bootstrap() {
    if (!token) {
        document.getElementById("authModal").classList.remove("hidden");
        showTab("login");
        return;
    }

    document.getElementById("authModal").classList.add("hidden");

    try {
        const result = await api("/api/profile/me");
        currentUser = result.user;
        await openApp();
    } catch {
        forceLogout("");
    }
}

bootstrap();
updateChatComposerState();
renderGifGrid();
