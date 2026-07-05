// =========================================================================
// UPDATES.JS - REALTIME SELLER CHAT LISTENER
// =========================================================================
(async function() {
    const token = localStorage.getItem('unithrift_session_token');
    if (!token || typeof supabase === 'undefined') return;

    // 1. Fallback to extracting or fetching current logged-in user profile ID 
    // (The seller viewing their updates page)
    let currentSellerId = null;
    try {
        const response = await fetch('/api/profile', { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        const data = await response.json();
        if (data.success) {
            currentSellerId = data.profile?.id;
        }
    } catch (err) {
        console.error("Failed to fetch session identity context:", err);
    }

    if (!currentSellerId) return;

    // 2. Initialize Supabase Realtime client connection
    const SUPABASE_URL = window.__SUPABASE_URL__ || '';
    const SUPABASE_KEY = window.__SUPABASE_ANON__ || '';
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    const { createClient } = supabase;
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 3. Connect to the seller-specific broadcast channel matching product.js
    const sellerChannel = sb.channel(`notifications:${currentSellerId}`);

    sellerChannel
        .on('broadcast', { event: 'new_msg_alert' }, (payload) => {
            // Destructure data transmitted from product.js
            const { msg, senderName } = payload.payload;

            // Target the notifications container frame
            const list = document.getElementById('notifList');
            const unreadBadge = document.getElementById('unreadCount');

            // Remove empty/placeholder states if active
            const emptyState = list.querySelector('.empty-state');
            if (emptyState) emptyState.remove();

            // 4. Construct a dynamic notification card matching the theme
            const newNotifCard = document.createElement('div');
            newNotifCard.className = "notif-card unread";
            newNotifCard.style.cssText = "animation: fadeIn 0.3s ease; border-left: 3px solid var(--accent);";
            
            // Generate unique random or temporary id referencing chat rooms if desired
            newNotifCard.innerHTML = `
                <div class="notif-icon message"><i class="fas fa-comment"></i></div>
                <div class="notif-body">
                    <p><strong>${senderName}:</strong> "${msg}"</p>
                    <span class="notif-time">just now</span>
                </div>
                <div class="notif-unread-dot"></div>
            `;

            // Prepend new messages directly at the top of the timeline
            list.insertBefore(newNotifCard, list.firstChild);

            // 5. Instantly update UI element badge counters
            if (unreadBadge) {
                let currentCount = parseInt(unreadBadge.textContent || '0', 10);
                currentCount += 1;
                unreadBadge.textContent = currentCount;
                unreadBadge.style.display = 'inline-block';
            }
        })
        .subscribe();
})();