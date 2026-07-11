// ======================================
// ELEMENT REFS
// ======================================
const fullName            = document.getElementById("userName");
const emailEl             = document.getElementById("userEmail");
const phoneEl             = document.getElementById("userPhone");
const memberSinceEl       = document.getElementById("memberSince");
const studentBadge        = document.getElementById("studentBadge");
const profileForm         = document.getElementById("profileForm");
const verificationSummary = document.getElementById("verificationSummary");
const studentStatus       = document.getElementById("studentStatus");
const sellerStatus        = document.getElementById("sellerStatus");
const sellerAccessBox     = document.getElementById("sellerAccessBox");
const listingContainer    = document.getElementById("listingContainer");
const newListingBtn       = document.getElementById("newListingBtn");
const logoutBtn           = document.getElementById("logoutBtn");
const logoutAccountBtn    = document.getElementById("logoutAccountBtn");
const navbarThemeToggle   = document.getElementById("navbarThemeToggle");
const loadingOverlay      = document.getElementById("loadingOverlay");
const avatarImg           = document.getElementById("userAvatar");
const navAvatarImg        = document.getElementById("navAvatarImg");
const avatarUpload        = document.getElementById("avatarUpload");

// ======================================
// GLOBAL STATE
// ======================================
let currentUser = null;

// ======================================
// LOADING OVERLAY
// ======================================
function showLoading() { if (loadingOverlay) loadingOverlay.style.display = "flex"; }
function hideLoading() { if (loadingOverlay) loadingOverlay.style.display = "none"; }

// ======================================
// THEME ENGINE
// ======================================
const savedTheme = localStorage.getItem("theme") || "light-theme";
document.body.className = savedTheme;

if (navbarThemeToggle) {
    navbarThemeToggle.addEventListener("click", () => {
        const isDark = document.body.classList.contains("dark-theme");
        const next   = isDark ? "light-theme" : "dark-theme";
        document.body.className = next;
        localStorage.setItem("theme", next);
    });
}

// ======================================
// LOGOUT
// ======================================
function logout() {
    localStorage.removeItem("unithrift_session_token");
    localStorage.removeItem("unithrift_refresh_token");
    setTimeout(() => { window.location.href = "/"; }, 50);
}
if (logoutBtn) logoutBtn.addEventListener("click", logout);
if (logoutAccountBtn) logoutAccountBtn.addEventListener("click", logout);

// ======================================
// OAUTH CALLBACK
// ======================================
(function handleOAuthCallback() {
    const hash = window.location.hash;
    if (!hash || !hash.includes("access_token")) return;
    const params = new URLSearchParams(hash.substring(1));
    const accessToken  = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken) return;
    localStorage.setItem("unithrift_session_token", accessToken);
    if (refreshToken) localStorage.setItem("unithrift_refresh_token", refreshToken);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
})();

// ======================================
// TOKEN REFRESH
// ======================================
async function tryRefreshToken() {
    const refreshToken = localStorage.getItem("unithrift_refresh_token");
    if (!refreshToken) return null;
    try {
        const res = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken })
        });
        if (!res.ok) return null;
        const result = await res.json().catch(() => ({ success: false }));
        if (result.success && result.access_token) {
            localStorage.setItem("unithrift_session_token", result.access_token);
            if (result.refresh_token) localStorage.setItem("unithrift_refresh_token", result.refresh_token);
            return result.access_token;
        }
    } catch (err) {
        console.warn("Token refresh failed:", err);
    }
    return null;
}

// ======================================
// AUTHENTICATED FETCH
// ======================================
async function authFetch(url, options = {}) {
    const token        = localStorage.getItem("unithrift_session_token");
    const refreshToken = localStorage.getItem("unithrift_refresh_token");

    function withAuthHeaders(tok) {
        const headers = new Headers(options.headers || {});
        headers.set("Authorization", `Bearer ${tok || ""}`);
        if (refreshToken) headers.set("X-Refresh-Token", refreshToken);
        return headers;
    }

    function persistRefreshedTokens(res) {
        const newAccess  = res.headers.get("X-New-Access-Token");
        const newRefresh = res.headers.get("X-New-Refresh-Token");
        if (newAccess)  localStorage.setItem("unithrift_session_token", newAccess);
        if (newRefresh) localStorage.setItem("unithrift_refresh_token", newRefresh);
    }

    let res = await fetch(url, { ...options, headers: withAuthHeaders(token) });
    persistRefreshedTokens(res);

    if (res.status === 401) {
        const refreshedToken = await tryRefreshToken();
        if (!refreshedToken) return res; 

        res = await fetch(url, { ...options, headers: withAuthHeaders(refreshedToken) });
        persistRefreshedTokens(res);
    }

    return res;
}

// ======================================
// INITIALIZE APPLICATION
// ======================================
async function initializeProfile() {
    try {
        showLoading();
        const token = localStorage.getItem("unithrift_session_token");
        if (!token) { logout(); return; }

        let response = await authFetch("/api/profile");
        if (response.status === 401) { logout(); return; }
        if (!response.ok) throw new Error(`Status ${response.status}`);

        let result = await response.json().catch(() => ({ success: false }));
        if (!result.success) { logout(); return; }

        if (!result.profile || !result.profile.id) {
            const saveRes = await authFetch("/api/profile/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ college_name: "", location_name: "", address: "" })
            });
            if (saveRes.ok) {
                const retry = await authFetch("/api/profile");
                result = await retry.json().catch(() => result);
            }
        }

        currentUser = { id: result.profile?.id || "", email: result.email };

        await loadProfileData(result);
        await loadListings();

    } catch (err) {
        console.error("Init error:", err);
        alert("Failed to load profile. Please refresh.");
    } finally {
        hideLoading();
    }
}

initializeProfile();

// ======================================
// LOAD PROFILE DATA INTO DOM
// ======================================
async function loadProfileData(accountData) {
    const profile = accountData.profile || {};

    if (fullName) fullName.textContent   = profile.username || accountData.username || "Student";
    if (emailEl)  emailEl.textContent    = accountData.email || "—";
    if (phoneEl)  phoneEl.textContent    = profile.phone     || "Not added";

    const accountCreationDate = accountData.created_at || profile.created_at;

    if (accountCreationDate && memberSinceEl) {
        const d = new Date(accountCreationDate);
        memberSinceEl.textContent = d.toLocaleString("default", { month: "long", year: "numeric" });
    }

    if (profile.avatar_url) {
        if (avatarImg)    avatarImg.src    = profile.avatar_url;
        if (navAvatarImg) navAvatarImg.src = profile.avatar_url;
    }

    if (studentBadge) {
        studentBadge.style.display = profile.student_verified ? "inline-flex" : "none";
    }

    const collegeInput = document.getElementById("college");
    const locationInput = document.getElementById("location");
    const addressInput = document.getElementById("address");

    if (collegeInput)  collegeInput.value  = profile.college_name  || "";
    if (locationInput) locationInput.value = profile.location_name || "";
    if (addressInput)  addressInput.value  = profile.address       || "";

    renderVerificationSummary(profile);
}

// ======================================
// VERIFICATION SUMMARY
// ======================================
function renderDocCard(label, url, type) {
    if (!url) return "";
    const isPdf  = /\.pdf($|\?)/i.test(url);
    const thumb  = isPdf
        ? `<div style="width:44px;height:44px;border-radius:8px;background:rgba(124,92,255,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
               <i class="fas fa-file-pdf" style="color:var(--muted,#999);font-size:1.1rem;"></i>
           </div>`
        : `<img src="${url}" alt="${label}" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;">`;

    return `
        <div class="ver-doc-card" data-doctype="${type}"
             style="display:flex;align-items:center;gap:12px;padding:10px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;">
            <a href="${url}" target="_blank" rel="noopener" style="flex-shrink:0;line-height:0;">${thumb}</a>
            <div style="flex:1;min-width:0;">
                <p style="margin:0;font-size:0.85rem;font-weight:600;">${label}</p>
                <a href="${url}" target="_blank" rel="noopener" style="font-size:0.75rem;color:var(--muted,#999);text-decoration:none;">View document</a>
            </div>
            <button type="button" class="doc-replace-btn" data-doctype="${type}" title="Replace"
                    style="background:none;border:none;cursor:pointer;color:inherit;opacity:0.75;padding:6px;">
                <i class="fas fa-rotate"></i>
            </button>
            <button type="button" class="doc-delete-btn" data-doctype="${type}" title="Delete"
                    style="background:none;border:none;cursor:pointer;color:#ff6b6b;opacity:0.85;padding:6px;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

function renderVerificationSummary(profile) {
    if (!verificationSummary) return;

    const studentVerified = profile.student_verified;
    const sellerVerified  = profile.seller_verified;

    const studentIcon  = studentVerified  ? "fa-check-circle" : "fa-clock";
    const sellerIcon   = sellerVerified   ? "fa-check-circle" : "fa-circle-xmark";
    const studentColor = studentVerified  ? "var(--success)"  : "var(--warning)";
    const sellerColor  = sellerVerified   ? "var(--success)"  : "var(--muted)";
    const sellerDocsSubmitted = profile.pan_url && profile.payment_qr_url;
    const studentText  = studentVerified  ? "Verified"        : (profile.college_id_url ? "Pending review" : "Not submitted");
    const sellerText   = sellerVerified   ? "Verified"        : (sellerDocsSubmitted ? "Pending review" : "Not submitted");

    if (studentStatus) {
        studentStatus.textContent = studentVerified ? "Verified" : (profile.college_id_url ? "Pending" : "Not submitted");
        studentStatus.className   = "badge-status" + (studentVerified ? "" : " badge-pending");
    }
    if (sellerStatus) {
        sellerStatus.textContent = sellerVerified ? "Verified" : (sellerDocsSubmitted ? "Pending" : "Not submitted");
        sellerStatus.className   = "badge-status" + (sellerVerified ? "" : " badge-pending");
    }

    const docCards = [
        renderDocCard("College ID", profile.college_id_url, "student"),
        renderDocCard("PAN Card",   profile.pan_url,        "pan"),
        renderDocCard("Payment QR", profile.payment_qr_url, "qr")
    ].join("");

    verificationSummary.innerHTML = `
        <div class="ver-item">
            <i class="fas ${studentIcon} ver-icon" style="color:${studentColor};"></i>
            <div class="ver-info">
                <h4>Student Status</h4>
                <p>${studentText}</p>
            </div>
        </div>
        <div class="ver-item">
            <i class="fas ${sellerIcon} ver-icon" style="color:${sellerColor};"></i>
            <div class="ver-info">
                <h4>Seller Verification</h4>
                <p>${sellerText}</p>
            </div>
        </div>
        ${docCards ? `<div style="margin-top:14px;display:flex;flex-direction:column;gap:10px;">${docCards}</div>` : ""}
    `;

    if (sellerAccessBox) {
        sellerAccessBox.innerHTML = sellerVerified
            ? `<div style="text-align:center;padding-top:10px;">
                 <a href="/sell" class="btn btn-primary" style="text-decoration:none;">
                   <i class="fas fa-plus"></i> List an Item
                 </a>
               </div>`
            : "";
    }
}

// ---- Document Actions ----
const REPLACE_TARGET = {
    student: { input: "collegeId", section: "studentVerSection" },
    pan:     { input: "panCard",   section: "sellerVerSection" },
    qr:      { input: "paymentQr", section: "sellerVerSection" }
};

if (verificationSummary) {
    verificationSummary.addEventListener("click", async (e) => {
        const replaceBtn = e.target.closest(".doc-replace-btn");
        const deleteBtn  = e.target.closest(".doc-delete-btn");

        if (replaceBtn) {
            const type = replaceBtn.dataset.doctype;
            const target = REPLACE_TARGET[type];
            if (!target) return;
            document.getElementById(target.section)?.scrollIntoView({ behavior: "smooth", block: "center" });
            document.getElementById(target.input)?.click();
            return;
        }

        if (deleteBtn) {
            const type = deleteBtn.dataset.doctype;
            const labels = { student: "College ID", pan: "PAN Card", qr: "Payment QR" };
            if (!confirm(`Delete your ${labels[type] || "document"}? You'll need to re-upload it for verification.`)) return;

            const token = localStorage.getItem("unithrift_session_token");
            if (!token) return;

            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const res = await authFetch(`/api/profile/verify/${type}`, { method: "DELETE" });
                const result = await res.json().catch(() => ({ success: false }));
                if (result.success) {
                    initializeProfile();
                } else {
                    alert(result.message || "Failed to delete document.");
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                }
            } catch (err) {
                console.error("Delete document failed:", err);
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            }
        }
    });
}

// ======================================
// SAVE PROFILE FORM
// ======================================
if (profileForm) {
    profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const token = localStorage.getItem("unithrift_session_token");
        if (!token) return;

        const btn = profileForm.querySelector("button[type='submit']");
        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;

        try {
            const res = await authFetch("/api/profile/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    college_name:  document.getElementById("college")?.value  || "",
                    location_name: document.getElementById("location")?.value || "",
                    address:       document.getElementById("address")?.value  || ""
                })
            });

            const result = await res.json().catch(() => ({ success: false }));
            btn.innerHTML = result.success
                ? '<i class="fas fa-check"></i> Saved!'
                : '<i class="fas fa-times"></i> Failed';
        } catch (err) {
            btn.innerHTML = '<i class="fas fa-times"></i> Error';
        }

        setTimeout(() => {
            btn.innerHTML = origText;
            btn.disabled  = false;
        }, 2200);
    });
}

// ======================================
// AVATAR UPLOAD
// ======================================
if (avatarUpload) {
    avatarUpload.addEventListener("change", async () => {
        const file  = avatarUpload.files[0];
        const token = localStorage.getItem("unithrift_session_token");
        if (!file || !token) return;

        const formData = new FormData();
        formData.append("avatar", file);

        try {
            const res = await authFetch("/api/profile/avatar", {
                method: "POST",
                body: formData
            });
            const result = await res.json().catch(() => ({ success: false }));
            if (result.success && result.url) {
                if (avatarImg)    avatarImg.src    = result.url;
                if (navAvatarImg) navAvatarImg.src = result.url;
            }
        } catch (err) {
            console.error("Avatar upload failed:", err);
        }
    });
}

// ======================================
// STUDENT VERIFICATION UPLOAD
// ======================================
const verifyStudentBtn = document.getElementById("verifyStudentBtn");
if (verifyStudentBtn) {
    verifyStudentBtn.addEventListener("click", async () => {
        const file  = document.getElementById("collegeId")?.files[0];
        const token = localStorage.getItem("unithrift_session_token");
        if (!file || !token) { alert("Please select a College ID file first."); return; }

        const origText = verifyStudentBtn.innerHTML;
        verifyStudentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        verifyStudentBtn.disabled  = true;

        const formData = new FormData();
        formData.append("collegeId", file);

        try {
            const res = await authFetch("/api/profile/verify/student", {
                method: "POST",
                body: formData
            });
            const result = await res.json().catch(() => ({ success: false, message: "Verification failed." }));

            if (result.success) {
                verifyStudentBtn.innerHTML = '<i class="fas fa-check"></i> Submitted!';
                initializeProfile();
            } else {
                verifyStudentBtn.innerHTML = '<i class="fas fa-times"></i> Verification Failed';
                alert(result.message || "Verification failed.");
            }
        } catch (err) {
            verifyStudentBtn.innerHTML = '<i class="fas fa-times"></i> Error';
        }

        setTimeout(() => {
            verifyStudentBtn.innerHTML = origText;
            verifyStudentBtn.disabled  = false;
        }, 2200);
    });
}

// ======================================
// SELLER VERIFICATION UPLOAD
// ======================================
const sellerVerifyBtn = document.getElementById("sellerVerifyBtn");
if (sellerVerifyBtn) {
    sellerVerifyBtn.addEventListener("click", async () => {
        const panFile = document.getElementById("panCard")?.files[0];
        const qrFile  = document.getElementById("paymentQr")?.files[0];
        const token   = localStorage.getItem("unithrift_session_token");
        if (!panFile || !qrFile || !token) {
            alert("Please select both PAN Card and Payment QR files.");
            return;
        }

        const origText = sellerVerifyBtn.innerHTML;
        sellerVerifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
        sellerVerifyBtn.disabled  = true;

        const formData = new FormData();
        formData.append("panCard",    panFile);
        formData.append("paymentQr",  qrFile);

        try {
            const res = await authFetch("/api/profile/verify/seller", {
                method: "POST",
                body: formData
            });
            const result = await res.json().catch(() => ({ success: false }));
            sellerVerifyBtn.innerHTML = result.success
                ? '<i class="fas fa-check"></i> Submitted!'
                : '<i class="fas fa-times"></i> Failed';
            if (result.success) initializeProfile();
        } catch (err) {
            sellerVerifyBtn.innerHTML = '<i class="fas fa-times"></i> Error';
        }

        setTimeout(() => {
            sellerVerifyBtn.innerHTML = origText;
            sellerVerifyBtn.disabled  = false;
        }, 2200);
    });
}

// ======================================
// NAV NAVIGATION BINDINGS
// ======================================
if (newListingBtn) newListingBtn.addEventListener("click", () => { window.location.href = "/sell"; });
const cartBtn = document.getElementById("cartBtn");
if (cartBtn) cartBtn.addEventListener("click", () => { window.location.href = "/marketplace"; });

// ======================================
// HIDDEN ADMIN ENTRY (Ctrl+F10)
// ======================================
document.addEventListener("keydown", async (e) => {
    if (!e.ctrlKey || e.key !== "F10") return;
    e.preventDefault();
    const token = localStorage.getItem("unithrift_session_token");
    if (!token) return;
    try {
        const res    = await authFetch("/api/admin/check");
        const result = await res.json().catch(() => ({ isAdmin: false }));
        if (result.isAdmin) window.location.href = "/admin";
    } catch (err) { /* fail silent */ }
});

// ======================================
// LOAD MY LISTINGS
// ======================================
async function loadListings() {
    const token = localStorage.getItem("unithrift_session_token");
    if (!token || !listingContainer) return;

    listingContainer.innerHTML = `<p class="loading-text" style="padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading your listings...</p>`;

    try {
        const res = await authFetch("/api/profile/my-listings");
        const result = await res.json().catch(() => ({ success: false }));

        if (!result.success || !result.products?.length) {
            listingContainer.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:48px 20px; color:var(--muted);">
                    <i class="fas fa-store" style="font-size:2rem; display:block; margin-bottom:12px; opacity:0.4;"></i>
                    <p style="font-size:0.9rem;">No listings yet.</p>
                    <button class="btn btn-primary" style="margin-top:16px;" onclick="window.location.href='/sell'">
                        <i class="fas fa-plus"></i> Create your first listing
                    </button>
                </div>`;
            return;
        }

        listingContainer.innerHTML = result.products.map(item => renderListingCard(item)).join("");

        listingContainer.querySelectorAll(".listing-view-btn").forEach(btn => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                if (id) window.location.href = `/product.html?id=${id}`;
            });
        });
    } catch (err) {
        console.error("Failed to load listings:", err);
        listingContainer.innerHTML = `<p style="color:var(--muted); padding:20px;">Failed to load listings.</p>`;
    }
}

// ======================================
// LISTING CARD RENDERER
// ======================================
function renderListingCard(item) {
    const price    = item.price ? `₹${Number(item.price).toLocaleString("en-IN")}` : "Free";
    const title    = item.title || "Untitled";
    const location = item.location || item.college || "Campus";
    const isSold   = item.is_sold || item.status === "sold";
    const isArch   = item.status === "archived";

    const imgTag = item.image_url
        ? `<img src="${item.image_url}" alt="${title}" loading="lazy">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:2rem;"><i class="fas fa-image"></i></div>`;

    const soldBadge = isSold ? `<span class="listing-sold-badge">Sold</span>` : "";

    const deleteBtn = `<button class="listing-delete-btn" data-id="${item.id}" title="Delete listing"><i class="fas fa-trash"></i></button>`;

    const actionRow = isArch
        ? `<span class="listing-archived-tag">Archived</span>${deleteBtn}`
        : `<button class="listing-view-btn" data-id="${item.id}">Quick View</button>
           <button class="listing-heart-btn"><i class="fas fa-heart"></i></button>
           ${deleteBtn}`;

    return `
        <div class="listing-card ${isSold ? "is-sold" : ""}">
            <div class="listing-img-wrap">
                ${imgTag}
                <span class="listing-price-badge">${price}</span>
                ${soldBadge}
            </div>
            <div class="listing-body">
                <h3>${title}</h3>
                <p class="listing-location">
                    <i class="fas fa-location-dot"></i>
                    ${location}
                </p>
                <div class="listing-actions">
                    ${actionRow}
                </div>
            </div>
        </div>`;
}

// ======================================
// DELETE LISTING (Quick View action row)
// ======================================
if (listingContainer) {
    listingContainer.addEventListener("click", async (e) => {
        const deleteBtn = e.target.closest(".listing-delete-btn");
        if (!deleteBtn) return;

        const id = deleteBtn.getAttribute("data-id");
        if (!id) return;

        if (!confirm("Delete this listing? This cannot be undone.")) return;

        const originalHTML = deleteBtn.innerHTML;
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await authFetch(`/api/products/${id}`, { method: "DELETE" });
            const result = await res.json().catch(() => ({ success: false }));

            if (result.success) {
                loadListings();
            } else {
                alert(result.message || "Failed to delete listing.");
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = originalHTML;
            }
        } catch (err) {
            console.error("Failed to delete listing:", err);
            alert("Something went wrong. Please try again.");
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = originalHTML;
        }
    });
}

// ======================================
// FILE INPUT SELECTED-STATE (visual feedback once a file is chosen)
// ======================================
document.querySelectorAll(".file-input").forEach(input => {
    input.addEventListener("change", () => {
        input.classList.toggle("file-input--selected", input.files.length > 0);
    });
});

// ======================================
// GEOAPIFY LOCATION AUTOCOMPLETE
// ======================================
(function setupLocationAutocomplete() {
    const locationInput = document.getElementById("campusSearchInput");
    if (!locationInput) return;

    locationInput.parentElement.style.position = "relative";
    const dropdown = document.createElement("div");
    dropdown.className = "geo-autocomplete-dropdown";
    Object.assign(dropdown.style, {
        position: "absolute", top: "100%", left: "0", right: "0",
        background: "#161826", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px",
        marginTop: "6px", maxHeight: "220px", overflowY: "auto",
        boxShadow: "0 10px 24px rgba(0,0,0,0.4)", zIndex: "999", display: "none"
    });
    locationInput.parentElement.appendChild(dropdown);

    let debounceTimer = null;
    let currentResults = [];
    let selectedIndex = -1;

    function highlight(index) {
        dropdown.querySelectorAll(".geo-suggestion").forEach(el => {
            el.style.background = Number(el.dataset.index) === index ? "rgba(255,255,255,0.1)" : "transparent";
        });
    }

    function applySelection(result) {
        if (!result) return;
        locationInput.value = result.formatted;

        const locationField = document.getElementById("location");
        const addressField  = document.getElementById("address");
        const collegeField  = document.getElementById("college");

        if (locationField) locationField.value = result.formatted;
        if (addressField && !addressField.value.trim()) addressField.value = result.formatted;
        if (collegeField && result.city && !collegeField.value.trim()) collegeField.value = result.city;

        [locationField, addressField].forEach(el => {
            if (!el) return;
            el.style.transition = "background-color 0.3s";
            el.style.backgroundColor = "rgba(124, 92, 255, 0.15)";
            setTimeout(() => { el.style.backgroundColor = ""; }, 900);
        });

        dropdown.style.display = "none";
        selectedIndex = -1;
    }

    locationInput.addEventListener("input", () => {
        const query = locationInput.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 3) {
            dropdown.style.display = "none";
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const resp = await fetch(`/api/geoapify/autocomplete?text=${encodeURIComponent(query)}`);
                const data = await resp.json();
                if (!data.success) return;

                currentResults = data.results || [];
                selectedIndex = -1;
                if (currentResults.length === 0) {
                    dropdown.style.display = "none";
                    return;
                }

                dropdown.innerHTML = currentResults.map((r, i) => `
                    <div class="geo-suggestion" data-index="${i}"
                         style="padding:10px 14px; cursor:pointer; font-size:0.9rem; color:#e4e4ec;">
                        <i class="fas fa-location-dot" style="margin-right:8px; opacity:0.6;"></i>${r.formatted}
                    </div>
                `).join("");
                dropdown.style.display = "block";
                dropdown.querySelectorAll(".geo-suggestion").forEach(el => {
                    el.addEventListener("mouseenter", () => el.style.background = "rgba(255,255,255,0.06)");
                    el.addEventListener("mouseleave", () => el.style.background = "transparent");
                });
            } catch (err) {
                console.error("Location autocomplete failed:", err);
            }
        }, 300); 
    });

    locationInput.addEventListener("keydown", (e) => {
        if (dropdown.style.display === "none" || currentResults.length === 0) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
            highlight(selectedIndex);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            highlight(selectedIndex);
        } else if (e.key === "Enter") {
            e.preventDefault();
            const chosen = currentResults[selectedIndex >= 0 ? selectedIndex : 0];
            applySelection(chosen);
        } else if (e.key === "Escape") {
            dropdown.style.display = "none";
        }
    });

    dropdown.addEventListener("click", (e) => {
        const item = e.target.closest(".geo-suggestion");
        if (!item) return;
        applySelection(currentResults[Number(item.dataset.index)]);
    });

    document.addEventListener("click", (e) => {
        if (e.target !== locationInput && !dropdown.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
})();