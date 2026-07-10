// ======================================
// AUTH HELPERS (mirrors profile.js)
// ======================================
function getToken() { return localStorage.getItem("unithrift_session_token"); }

async function authFetch(url, options = {}) {
    const token        = getToken();
    const refreshToken = localStorage.getItem("unithrift_refresh_token");

    function headers(tok) {
        const h = new Headers(options.headers || {});
        h.set("Authorization", `Bearer ${tok || ""}`);
        if (refreshToken) h.set("X-Refresh-Token", refreshToken);
        return h;
    }
    function persist(res) {
        const a = res.headers.get("X-New-Access-Token");
        const r = res.headers.get("X-New-Refresh-Token");
        if (a) localStorage.setItem("unithrift_session_token", a);
        if (r) localStorage.setItem("unithrift_refresh_token", r);
    }

    let res = await fetch(url, { ...options, headers: headers(token) });
    persist(res);
    if (res.status === 401) {
        const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken })
        }).then(r => r.json()).catch(() => null);
        if (refreshRes?.success) {
            localStorage.setItem("unithrift_session_token", refreshRes.access_token);
            if (refreshRes.refresh_token) localStorage.setItem("unithrift_refresh_token", refreshRes.refresh_token);
            res = await fetch(url, { ...options, headers: headers(refreshRes.access_token) });
            persist(res);
        }
    }
    return res;
}

// ======================================
// STATE
// ======================================
let queue = [];        // flattened { userId, type, username, ...doc fields }
let filter = "all";
let selectedKey = null;

const queueEl  = document.getElementById("queue");
const detailEl = document.getElementById("detail");
const gateEl   = document.getElementById("gate");
const toastEl  = document.getElementById("toast");

function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2000);
}

function keyOf(item) { return `${item.userId}:${item.type}`; }

// ======================================
// LOAD QUEUE
// ======================================
async function loadQueue() {
    if (!getToken()) { window.location.href = "/login.html"; return; }

    try {
        const res = await authFetch("/api/admin/verifications");
        if (res.status === 401) { window.location.href = "/login.html"; return; }
        if (res.status === 403) {
            gateEl.innerHTML = `<i class="fas fa-lock"></i><span class="mono" style="font-size:0.8rem;">Admin access required — redirecting…</span>`;
            setTimeout(() => window.location.href = "/profile", 1600);
            return;
        }
        const result = await res.json().catch(() => ({ success: false }));
        if (!result.success) throw new Error(result.message || "Failed to load queue");

        queue = [];
        (result.pending || []).forEach(p => {
            if (p.college_id_url && !p.student_verified) {
                queue.push({ userId: p.id, type: "student", username: p.username, doc_url: p.college_id_url, confidence: p.ai_id_confidence });
            }
            if (p.pan_url && p.payment_qr_url && !p.seller_verified) {
                queue.push({ userId: p.id, type: "seller", username: p.username, pan_url: p.pan_url, qr_url: p.payment_qr_url, confidence: p.ai_pan_confidence, pan_number: p.pan_number_ai });
            }
        });

        gateEl.classList.add("hidden");
        renderCounts();
        renderQueue();
    } catch (err) {
        gateEl.innerHTML = `<i class="fas fa-triangle-exclamation"></i><span class="mono" style="font-size:0.8rem;">${err.message}</span>`;
    }
}

// ======================================
// RENDER
// ======================================
function renderCounts() {
    document.getElementById("countAll").textContent = queue.length;
    document.getElementById("countStudent").textContent = queue.filter(i => i.type === "student").length;
    document.getElementById("countSeller").textContent = queue.filter(i => i.type === "seller").length;
}

function visibleQueue() {
    return filter === "all" ? queue : queue.filter(i => i.type === filter);
}

function renderQueue() {
    const items = visibleQueue();

    if (items.length === 0) {
        queueEl.innerHTML = `<div class="queue-empty"><i class="fas fa-champagne-glasses" style="font-size:1.4rem;display:block;margin-bottom:8px;opacity:0.5;"></i>Queue clear.</div>`;
        renderDetail(null);
        return;
    }

    if (!items.find(i => keyOf(i) === selectedKey)) selectedKey = keyOf(items[0]);

    queueEl.innerHTML = items.map(item => {
        const k = keyOf(item);
        const conf = item.confidence != null ? `${Math.round(item.confidence * 100)}%` : "—";
        return `
        <div class="q-item ${k === selectedKey ? "selected" : ""}" data-key="${k}">
            <div class="q-top">
                <span class="q-name">${item.username || "Unknown"}</span>
                <span class="q-conf">${conf}</span>
            </div>
            <span class="q-type">${item.type}</span>
        </div>`;
    }).join("");

    queueEl.querySelectorAll(".q-item").forEach(el => {
        el.addEventListener("click", () => { selectedKey = el.dataset.key; renderQueue(); });
    });

    renderDetail(items.find(i => keyOf(i) === selectedKey));
}

function confidenceColor(c) {
    if (c == null) return "var(--muted)";
    if (c >= 0.75) return "var(--green)";
    if (c >= 0.5) return "var(--amber)";
    return "var(--red)";
}

function renderDetail(item) {
    if (!item) {
        detailEl.innerHTML = `<div class="detail-empty"><i class="fas fa-inbox"></i><span>Nothing selected</span></div>`;
        return;
    }

    const confPct = item.confidence != null ? Math.round(item.confidence * 100) : null;
    const color   = confidenceColor(item.confidence);

    const docsHtml = item.type === "student"
        ? docCard("College ID", item.doc_url)
        : docCard("PAN Card", item.pan_url) + docCard("Payment QR", item.qr_url);

    detailEl.innerHTML = `
        <div class="d-head">
            <div>
                <h1>${item.username || "Unknown"}</h1>
                <span class="q-type">${item.type} verification</span>
            </div>
            <div class="shortcut-hint">
                <span><kbd>A</kbd>approve</span>
                <span><kbd>R</kbd>reject</span>
                <span><kbd>↓</kbd>next</span>
            </div>
        </div>

        <div class="exposure">
            <div class="exposure-label"><span>AI CONFIDENCE</span><span>${confPct != null ? confPct + "%" : "n/a"}</span></div>
            <div class="exposure-track"><div class="exposure-fill" style="width:${confPct ?? 0}%;background:${color};"></div></div>
        </div>

        ${item.type === "seller" && item.pan_number ? `<div class="pan-line"><span>PAN (AI read):</span> ${item.pan_number}</div>` : ""}

        <div class="docs">${docsHtml}</div>

        <div class="actions">
            <button class="btn btn-approve" id="approveBtn"><i class="fas fa-check"></i> Approve</button>
            <button class="btn btn-reject" id="rejectBtn"><i class="fas fa-xmark"></i> Reject</button>
        </div>
    `;

    document.getElementById("approveBtn").addEventListener("click", () => review(item, "approve"));
    document.getElementById("rejectBtn").addEventListener("click", () => review(item, "reject"));
}

function docCard(label, url) {
    if (!url) return "";
    const isPdf = /\.pdf($|\?)/i.test(url);
    const frame = isPdf
        ? `<div class="frame"><i class="fas fa-file-pdf pdf-icon"></i></div>`
        : `<div class="frame"><img src="${url}" alt="${label}"></div>`;
    return `
        <div class="doc-card">
            ${frame}
            <div class="caption"><span>${label}</span><a href="${url}" target="_blank" rel="noopener">Open <i class="fas fa-arrow-up-right-from-square"></i></a></div>
        </div>`;
}

// ======================================
// APPROVE / REJECT
// ======================================
async function review(item, action) {
    const approveBtn = document.getElementById("approveBtn");
    const rejectBtn  = document.getElementById("rejectBtn");
    approveBtn.disabled = true;
    rejectBtn.disabled  = true;

    try {
        const res = await authFetch(`/api/admin/verifications/${item.userId}/${item.type}/${action}`, { method: "POST" });
        const result = await res.json().catch(() => ({ success: false }));
        if (!result.success) { toast(result.message || "Action failed."); approveBtn.disabled = false; rejectBtn.disabled = false; return; }

        toast(action === "approve" ? "Approved." : "Rejected.");
        queue = queue.filter(i => keyOf(i) !== keyOf(item));
        selectedKey = null;
        renderCounts();
        renderQueue();
    } catch (err) {
        toast("Network error. Try again.");
        approveBtn.disabled = false;
        rejectBtn.disabled  = false;
    }
}

// ======================================
// TABS + KEYBOARD SHORTCUTS
// ======================================
document.getElementById("tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter;
    selectedKey = null;
    renderQueue();
});

document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    const items = visibleQueue();
    const idx = items.findIndex(i => keyOf(i) === selectedKey);

    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        if (items.length) { selectedKey = keyOf(items[Math.min(idx + 1, items.length - 1)]); renderQueue(); }
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (items.length) { selectedKey = keyOf(items[Math.max(idx - 1, 0)]); renderQueue(); }
    } else if (e.key.toLowerCase() === "a" && idx >= 0) {
        review(items[idx], "approve");
    } else if (e.key.toLowerCase() === "r" && idx >= 0) {
        review(items[idx], "reject");
    }
});

loadQueue();