// ======================================
// ELEMENT REFS  (all IDs match profile.html)
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
const themeToggle         = document.getElementById("themeToggle");
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
// THEME
// ======================================
const savedTheme = localStorage.getItem("theme") || "dark-theme";
document.body.className = savedTheme;

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
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
// INIT
// ======================================
async function initializeProfile() {
    try {
        showLoading();
        let token = localStorage.getItem("unithrift_session_token");
        if (!token) { logout(); return; }

        let response = await fetch("/api/profile", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.status === 401) {
            token = await tryRefreshToken();
            if (!token) { logout(); return; }
            response = await fetch("/api/profile", {
                headers: { "Authorization": `Bearer ${token}` }
            });
        }

        if (!response.ok) throw new Error(`Status ${response.status}`);

        let result = await response.json().catch(() => ({ success: false }));
        if (!result.success) { logout(); return; }

        // Auto-provision missing profile row
        if (!result.profile || !result.profile.id) {
            const saveRes = await fetch("/api/profile/save", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ college_name: "", location_name: "", address: "" })
            });
            if (saveRes.ok) {
                const retry = await fetch("/api/profile", {
                    headers: { "Authorization": `Bearer ${token}` }
                });
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

    if (profile.created_at && memberSinceEl) {
        const d = new Date(profile.created_at);
        memberSinceEl.textContent = d.toLocaleString("default", { month: "long", year: "numeric" });
    }

    if (profile.avatar_url) {
        if (avatarImg)    avatarImg.src    = profile.avatar_url;
        if (navAvatarImg) navAvatarImg.src = profile.avatar_url;
    }

    if (studentBadge) {
        studentBadge.style.display = profile.student_verified ? "inline-flex" : "none";
    }

    const collegeInput   = document.getElementById("college");
    const locationInput  = document.getElementById("location");
    const addressInput   = document.getElementById("address");

    if (collegeInput)  collegeInput.value  = profile.college_name  || "";
    if (locationInput) locationInput.value = profile.location_name || "";
    if (addressInput)  addressInput.value  = profile.address       || "";

    // Verification summary
    renderVerificationSummary(profile);
}

// ======================================
// VERIFICATION SUMMARY
// ======================================
function renderVerificationSummary(profile) {
    if (!verificationSummary) return;

    const studentVerified = profile.student_verified;
    const sellerVerified  = profile.seller_verified;

    const studentIcon  = studentVerified  ? "fa-check-circle" : "fa-clock";
    const sellerIcon   = sellerVerified   ? "fa-check-circle" : "fa-circle-xmark";
    const studentColor = studentVerified  ? "var(--success)"  : "var(--warning)";
    const sellerColor  = sellerVerified   ? "var(--success)"  : "var(--muted)";
    const studentText  = studentVerified  ? "Verified"        : "Pending review";
    const sellerText   = sellerVerified   ? "Verified"        : "Not submitted";

    // Update badge spans
    if (studentStatus) {
        studentStatus.textContent = studentVerified ? "Verified" : "Pending";
        studentStatus.className   = "badge-status" + (studentVerified ? "" : " badge-pending");
    }
    if (sellerStatus) {
        sellerStatus.textContent = sellerVerified ? "Verified" : "Not submitted";
        sellerStatus.className   = "badge-status" + (sellerVerified ? "" : " badge-pending");
    }

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
            const res = await fetch("/api/profile/save", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
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
            const res    = await fetch("/api/profile/avatar", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
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
            const res    = await fetch("/api/profile/verify/student", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
           const result = await res.json().catch(() => ({
    success: false,
    message: "Verification failed."
}));

if (result.success) {
    verifyStudentBtn.innerHTML =
        '<i class="fas fa-check"></i> Submitted!';
} else {
    verifyStudentBtn.innerHTML =
        '<i class="fas fa-times"></i> Verification Failed';

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
            const res    = await fetch("/api/profile/verify/seller", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            const result = await res.json().catch(() => ({ success: false }));
            sellerVerifyBtn.innerHTML = result.success
                ? '<i class="fas fa-check"></i> Submitted!'
                : '<i class="fas fa-times"></i> Failed';
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
// NAV BUTTONS
// ======================================
if (newListingBtn) newListingBtn.addEventListener("click", () => { window.location.href = "/sell"; });
const cartBtn = document.getElementById("cartBtn");
if (cartBtn) cartBtn.addEventListener("click", () => { window.location.href = "/marketplace"; });

// ======================================
// LOAD MY LISTINGS
// ======================================
async function loadListings() {
    const token = localStorage.getItem("unithrift_session_token");
    if (!token || !listingContainer) return;

    listingContainer.innerHTML = `<p class="loading-text" style="padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading your listings...</p>`;

    try {
        const res    = await fetch("/api/profile/my-listings", {
            headers: { "Authorization": `Bearer ${token}` }
        });
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

        // Wire up Quick View buttons
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
// LISTING CARD RENDERER  (matches screenshot)
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

    const soldBadge = isSold
        ? `<span class="listing-sold-badge">Sold</span>`
        : "";

    const actionRow = isArch
        ? `<span class="listing-archived-tag">Archived</span>`
        : `<button class="listing-view-btn" data-id="${item.id}">Quick View</button>
           <button class="listing-heart-btn"><i class="fas fa-heart"></i></button>`;

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