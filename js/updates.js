// =========================================================================
// UPDATES.JS — Notifications page: list rendering, tabs, mark-read,
// and realtime delivery (persisted DB inserts + instant broadcasts).
// =========================================================================
(async function () {
    const token = localStorage.getItem('unithrift_session_token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // ---- Theme (unchanged behaviour from the previous inline script) ----
    const savedTheme = localStorage.getItem('theme') || 'dark-theme';
    document.body.className = savedTheme;
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
        const targetTheme = document.body.className === 'dark-theme' ? 'light-theme' : 'dark-theme';
        document.body.className = targetTheme;
        localStorage.setItem('theme', targetTheme);
    });

    let allNotifications = [];
    let currentFilter = 'all';
    const list = document.getElementById('notifList');
    const unreadBadge = document.getElementById('unreadCount');

    const ICONS = {
        sale: 'fas fa-tag',
        message: 'fas fa-comment',
        offer: 'fas fa-hand-holding-dollar',
        system: 'fas fa-gear',
        info: 'fas fa-circle-info'
    };

    function timeAgo(dateStr) {
        const diff = (Date.now() - new Date(dateStr)) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    // Notification text can originate from another user (e.g. a chat message
    // preview), so it must always be escaped before hitting innerHTML.
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str ?? '');
        return div.innerHTML;
    }

    function renderCard(n) {
        const type = n.type || 'info';
        const icon = ICONS[type] || ICONS.info;
        return `
        <div class="notif-card ${n.read ? 'read' : 'unread'}" data-id="${n.id}" data-type="${type}" data-ref="${n.reference_id || ''}">
            <div class="notif-icon ${type}"><i class="${icon}"></i></div>
            <div class="notif-body">
                <p>${escapeHtml(n.message)}</p>
                <span class="notif-time">${timeAgo(n.created_at)}</span>
            </div>
            ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
        </div>`;
    }

    function renderList() {
        const filtered = currentFilter === 'all'
            ? allNotifications
            : allNotifications.filter(n => n.type === currentFilter);

        if (!filtered.length) {
            list.innerHTML = `<div class="empty-state">
                <i class="fas fa-bell-slash"></i>
                <p>No ${currentFilter === 'all' ? '' : currentFilter + ' '}notifications yet.</p>
            </div>`;
            return;
        }
        list.innerHTML = filtered.map(renderCard).join('');

        list.querySelectorAll('.notif-card').forEach(card => {
            card.addEventListener('click', async () => {
                const id = card.getAttribute('data-id');
                const ref = card.getAttribute('data-ref');
                const type = card.getAttribute('data-type');

                if (card.classList.contains('unread')) {
                    if (id !== 'live-broadcast') {
                        await authFetch(`/api/notifications/${id}/read`, { method: 'POST' });
                    }
                    card.classList.remove('unread');
                    card.classList.add('read');
                    card.querySelector('.notif-unread-dot')?.remove();
                    const n = allNotifications.find(x => x.id === id);
                    if (n) n.read = true;
                    updateBadge();
                }

                // For messages, reference_id is the chat room id (set server-side
                // in createNotification and in the live broadcast payload below) —
                // NOT the sender's user id — so this always lands on the right room.
                if (type === 'message' && ref) window.location.href = `/chat?room=${ref}`;
                else if ((type === 'sale' || type === 'offer') && ref) window.location.href = `/product?id=${ref}`;
            });
        });
    }

    function updateBadge() {
        const count = allNotifications.filter(n => !n.read).length;
        if (count > 0) {
            unreadBadge.textContent = count > 99 ? '99+' : count;
            unreadBadge.style.display = 'inline-block';
        } else {
            unreadBadge.style.display = 'none';
        }
    }

    async function loadNotifications() {
        try {
            const res = await authFetch('/api/notifications');
            if (res.status === 401) {
                // auth-fetch.js has already cleared localStorage and queued a
                // redirect to the login page for us — don't fire any more
                // requests (they'd just race that redirect and show a
                // confusing "No token provided" flash from an empty token).
                return { ok: false, loggedOut: true };
            }
            const result = await res.json();
            if (!result.success) throw new Error(result.message);
            allNotifications = result.notifications || [];
            renderList();
            updateBadge();
            return { ok: true };
        } catch (err) {
            list.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><p>${escapeHtml(err.message)}</p></div>`;
            return { ok: false, loggedOut: false };
        }
    }

    document.getElementById('markAllReadBtn')?.addEventListener('click', async () => {
        await authFetch('/api/notifications/read-all', { method: 'POST' });
        allNotifications.forEach(n => { n.read = true; });
        renderList();
        updateBadge();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.getAttribute('data-filter');
            renderList();
        });
    });

    // Validate the session with a single call before doing anything else.
    // Everything below (realtime wiring, the profile lookup) depends on this
    // session being good, so if it's dead we stop here instead of firing more
    // requests that would just race the redirect auth-fetch.js already queued.
    const initialLoad = await loadNotifications();
    if (!initialLoad.ok) return;

    // ---- Realtime wiring ----
    // Two complementary channels:
    // 1. postgres_changes on `notifications` — catches every persisted
    //    notification (message previews, verification updates, etc).
    // 2. a `notifications:<userId>` broadcast channel — an instant "someone
    //    just messaged you" ping so it appears without waiting on DB replication.
    if (typeof supabase === 'undefined') return;

    const SUPABASE_URL = window.__SUPABASE_URL__ || '';
    const SUPABASE_KEY = window.__SUPABASE_ANON__ || '';
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    const { createClient } = supabase;
    // This client is only used to authorize Realtime channels — it never
    // needs to manage its own auth session or redeem refresh tokens.
    // Using auth.setSession() here would pull in GoTrue's background
    // auto-refresh cycle, which can independently (and redundantly) try
    // to redeem the same refresh token the rest of the app is already
    // managing, racing against it and logging spurious
    // "Already Used" errors. realtime.setAuth() just sets the JWT used
    // to authorize the socket/channels, with no session machinery attached.
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    // The session was just proven valid by loadNotifications() above, so
    // read whatever token is current now (it may have just been rotated).
    sb.realtime.setAuth(localStorage.getItem('unithrift_session_token') || token);

    let userId = null;
    try {
        const profileRes = await authFetch('/api/profile');
        if (profileRes.status === 401) return; // session died between the two calls; bail
        const profileData = await profileRes.json();
        if (profileData.success) userId = profileData.profile?.id;
    } catch (err) {
        console.error('Failed to fetch session identity for realtime wiring:', err);
    }
    if (!userId) return;

    // authFetch above may have rotated the access token again — re-apply
    // whatever is now current before opening the realtime channels.
    const currentToken = localStorage.getItem('unithrift_session_token');
    if (currentToken) sb.realtime.setAuth(currentToken);

    sb.channel('notifications')
        .on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'notifications',
            filter: `user_id=eq.${userId}`
        }, payload => {
            // Avoid double-inserting if the broadcast below already added
            // a synthetic card for the same event.
            if (allNotifications.some(n => n.id === payload.new.id)) return;
            allNotifications.unshift(payload.new);
            renderList();
            updateBadge();
        })
        .subscribe();

    sb.channel(`notifications:${userId}`)
        .on('broadcast', { event: 'new_msg_alert' }, (payload) => {
            const { msg, senderName, roomId } = payload.payload || {};
            allNotifications.unshift({
                id: `live-${Date.now()}`,
                type: 'message',
                message: `New message from ${senderName || 'a student'}: "${msg || ''}"`,
                read: false,
                reference_id: roomId || '',
                created_at: new Date().toISOString()
            });
            renderList();
            updateBadge();
        })
        .subscribe();
})();