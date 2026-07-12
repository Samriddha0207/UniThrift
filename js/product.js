// ======================================
// PRODUCT ID FROM URL
// ======================================
const params = new URLSearchParams(window.location.search);
const productId = params.get("id");

// ======================================
// HTML ELEMENTS
// ======================================
const mainImage = document.getElementById("mainImage");
if (mainImage) mainImage.onerror = () => { mainImage.src = 'https://placehold.co/600x600?text=UniThrift'; };
const thumbnailContainer = document.getElementById("thumbnailContainer");
const productTitle = document.getElementById("productTitle");
const productPrice = document.getElementById("productPrice");
const productCondition = document.getElementById("productCondition");
const deliveryDate = document.getElementById("deliveryDate");
const paymentMethods = document.getElementById("paymentMethods");
const productDescription = document.getElementById("productDescription");
const sellerInfo = document.getElementById("sellerInfo");
const aiInsights = document.getElementById("aiInsights");
const reviewsContainer = document.getElementById("reviewsContainer");
const reviewForm = document.getElementById("reviewForm");

const actionButtonsWrapper = document.querySelector('.action-buttons');

const contactSellerBtn = document.getElementById("contactSellerBtn");
const contactModal = document.getElementById("contactModal");
const closeModal = document.getElementById("closeModal");
const modalSellerDetails = document.getElementById("modalSellerDetails");

const chatWithSellerBtn = document.getElementById("chatWithSellerBtn");
const chatPopup = document.getElementById("chatPopup");
const closeChatBtn = document.getElementById("closeChatBtn");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatSellerName = document.getElementById("chatSellerName");
const chatSellerAvatar = document.getElementById("chatSellerAvatar");
const chatOnlineIndicator = document.getElementById("chatOnlineIndicator");
const chatVerifiedBadge = document.getElementById("chatVerifiedBadge");
const chatProductCard = document.getElementById("chatProductCard");
const chatProductImage = document.getElementById("chatProductImage");
const chatProductTitle = document.getElementById("chatProductTitle");
const chatProductPrice = document.getElementById("chatProductPrice");

let currentProduct = null;
let currentSeller = null;
let currentUserId = null;
let currentUserName = null; 
let activeRoomId = null;

// ======================================
// TOAST NOTIFICATIONS
// ======================================
const toastContainer = document.getElementById("toastContainer");

function showToast(message, type = "info", duration = 3500) {
    if (!toastContainer) return;
    const icons = { success: "fa-check", error: "fa-xmark", warning: "fa-exclamation", info: "fa-info" };

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
        <span class="toast-icon"><i class="fas ${icons[type] || icons.info}"></i></span>
        <span class="toast-message"></span>
        <button class="toast-close" aria-label="Dismiss"><i class="fas fa-xmark"></i></button>
    `;
    toast.querySelector(".toast-message").textContent = message;

    const remove = () => {
        if (!toast.isConnected) return;
        toast.classList.add("toast--leaving");
        toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };

    let timer = setTimeout(remove, duration);
    toast.addEventListener("mouseenter", () => clearTimeout(timer));
    toast.addEventListener("mouseleave", () => { timer = setTimeout(remove, 1200); });
    toast.querySelector(".toast-close").addEventListener("click", remove);

    toastContainer.appendChild(toast);
}

// ======================================
// CONFIRMATION MODAL
// ======================================
const confirmModal = document.getElementById("confirmModal");
const confirmModalTitle = document.getElementById("confirmModalTitle");
const confirmModalMessage = document.getElementById("confirmModalMessage");
const confirmModalOk = document.getElementById("confirmModalOk");
const confirmModalCancel = document.getElementById("confirmModalCancel");

function showConfirm(message, title = "Are you sure?") {
    if (!confirmModal) return Promise.resolve(window.confirm(message));

    return new Promise(resolve => {
        confirmModalTitle.textContent = title;
        confirmModalMessage.textContent = message;
        confirmModal.classList.add("open");

        const cleanup = (result) => {
            confirmModal.classList.remove("open");
            confirmModalOk.removeEventListener("click", onOk);
            confirmModalCancel.removeEventListener("click", onCancel);
            confirmModal.removeEventListener("click", onOverlay);
            document.removeEventListener("keydown", onKeydown);
            resolve(result);
        };

        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onOverlay = (e) => { if (e.target === confirmModal) cleanup(false); };
        const onKeydown = (e) => { if (e.key === "Escape") cleanup(false); };

        confirmModalOk.addEventListener("click", onOk);
        confirmModalCancel.addEventListener("click", onCancel);
        confirmModal.addEventListener("click", onOverlay);
        document.addEventListener("keydown", onKeydown);
    });
}
// ======================================
// AUTH HELPERS
// ======================================

async function tryRefreshToken() {
    const refreshToken = localStorage.getItem("unithrift_refresh_token");

    if (!refreshToken) {
        return null;
    }

    try {
        const response = await fetch("/api/auth/refresh", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                refresh_token: refreshToken
            })
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            return null;
        }

        localStorage.setItem(
            "unithrift_session_token",
            data.access_token
        );

        localStorage.setItem(
            "unithrift_refresh_token",
            data.refresh_token
        );

        return data.access_token;

    } catch (err) {
        console.error("Token refresh failed:", err);
        return null;
    }
}

async function authFetch(url, options = {}) {

    const token = localStorage.getItem("unithrift_session_token");
    const refreshToken = localStorage.getItem("unithrift_refresh_token");

    const buildHeaders = (accessToken) => {
        const headers = new Headers(options.headers || {});

        if (accessToken) {
            headers.set("Authorization", `Bearer ${accessToken}`);
        }

        if (refreshToken) {
            headers.set("X-Refresh-Token", refreshToken);
        }

        return headers;
    };

    let response = await fetch(url, {
        ...options,
        headers: buildHeaders(token)
    });

    if (response.status !== 401) {
        return response;
    }

    const newToken = await tryRefreshToken();

    if (!newToken) {
        return response;
    }

    return fetch(url, {
        ...options,
        headers: buildHeaders(newToken)
    });
}

if (chatWithSellerBtn) chatWithSellerBtn.style.display = 'none';
if (contactSellerBtn) contactSellerBtn.style.display = 'none';

// ======================================
// SELLER EXCLUSIVE LAYOUT ROUTINE
// ======================================
function renderSellerLayout(token) {
  if (!actionButtonsWrapper) return;

  if (chatWithSellerBtn) {
    chatWithSellerBtn.style.display = 'inline-flex';
    chatWithSellerBtn.textContent = '💬 View Buyer Chats';
    chatWithSellerBtn.disabled = false;
  }
  if (contactSellerBtn) {
    contactSellerBtn.style.display = 'none';
  }
  
  const dashboardBadge = document.createElement('div');
  dashboardBadge.style.cssText = "width:100%; text-align:center; padding: 10px; background: #1e293b; color: #94a3b8; font-weight: 600; border-radius: 12px; margin-bottom: 8px; font-size: 0.9rem; border: 1px solid #334155;";
  dashboardBadge.textContent = "🔒 You are managing this listing";
  actionButtonsWrapper.appendChild(dashboardBadge);

  if (!document.getElementById('markSoldBtnGenerated')) {
    const markSoldBtn = document.createElement('button');
    markSoldBtn.id = 'markSoldBtnGenerated';
    markSoldBtn.textContent = 'Mark as Sold';
    markSoldBtn.style.cssText = "width:100%; padding:13px; border:none; border-radius:12px; background:#f59e0b; color:white; font-weight:700; font-size:1rem; cursor:pointer; transition:.2s;";
    
    markSoldBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm("Mark this listing as sold? This cannot be undone.", "Mark as Sold?");
      if (!confirmed) return;
      markSoldBtn.textContent = "Marking...";
      markSoldBtn.disabled = true;
      try {
        const res = await fetch(`/api/products/${productId}/sold`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showToast("Listing marked as sold", "success");
        setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        showToast("Failed: " + err.message, "error");
        markSoldBtn.textContent = "Mark as Sold";
        markSoldBtn.disabled = false;
      }
    });
    
    actionButtonsWrapper.appendChild(markSoldBtn);
  }

  if (!document.getElementById('deleteBtnGenerated')) {
    const deleteBtn = document.createElement('button');
    deleteBtn.id = 'deleteBtnGenerated';
    deleteBtn.textContent = 'Delete Item';
    deleteBtn.style.cssText = "width:100%; padding:13px; border:none; border-radius:12px; background:#ef4444; color:white; font-weight:700; font-size:1rem; cursor:pointer; transition:.2s; margin-top: 8px;";
    
    deleteBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm("Are you sure you want to delete this listing? This action cannot be undone.", "Delete Listing?");
      if (!confirmed) return;
      deleteBtn.textContent = "Deleting...";
      deleteBtn.disabled = true;
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        showToast("Product deleted successfully!", "success");
        setTimeout(() => { window.location.href = "/marketplace"; }, 600);
      } catch (err) {
        showToast("Failed: " + err.message, "error");
        deleteBtn.textContent = "Delete Item";
        deleteBtn.disabled = false;
      }
    });
    
    actionButtonsWrapper.appendChild(deleteBtn);
  }
}

// ======================================
// BUYER/CLIENT EXCLUSIVE LAYOUT ROUTINE
// ======================================
async function renderBuyerLayout(token) {
  if (chatWithSellerBtn) {
    chatWithSellerBtn.style.display = 'inline-flex';
    chatWithSellerBtn.disabled = false;
  }
  if (contactSellerBtn) {
    contactSellerBtn.style.display = 'inline-flex';
    contactSellerBtn.disabled = false;
  }

  if (token) {
    await syncChatRoomHistory(token);
  }
}

// ======================================
// LOAD PRODUCT & DATA
// ======================================
async function loadProduct() {
  try {
    const response = await fetch(`/api/products/${productId}`);
    const result = await response.json();
    if (!result.success) throw new Error("Product not found");

    currentProduct = result.product;
    productTitle.textContent = currentProduct.title;
    productPrice.textContent = `₹${Number(currentProduct.price).toLocaleString('en-IN')}`;
    productCondition.textContent = `Condition: ${currentProduct.condition}`;
    deliveryDate.textContent = currentProduct.delivery_date || "Not specified";
    paymentMethods.textContent = currentProduct.payment_methods || "UPI";
    productDescription.textContent = currentProduct.description;

    const targetedSellerId = currentProduct.seller_id || currentProduct.user_id;

    if (currentProduct.is_sold) {
      const soldBanner = document.createElement('div');
      soldBanner.style.cssText = "background:#ef4444;color:white;text-align:center;padding:12px;font-weight:700;font-size:1.1rem;letter-spacing:2px;margin-bottom:16px;border-radius:10px;";
      soldBanner.textContent = "⚠️ THIS ITEM HAS BEEN SOLD";
      
      const detailsSection = document.querySelector('.details-section');
      if (detailsSection) detailsSection.prepend(soldBanner);
      
      const cartBtn = document.getElementById('addCartBtn');
      if (cartBtn) {
        cartBtn.disabled = true;
        cartBtn.style.opacity = '0.4';
        cartBtn.style.cursor = 'not-allowed';
      }
    }

    await Promise.all([
      loadSeller(targetedSellerId),
      loadImages(currentProduct.id),
      loadReviews(currentProduct.id),
      loadAIInsights(currentProduct.id)
    ]);

    const token = localStorage.getItem("unithrift_session_token");

if (token) {
  try {
    const r = await authFetch('/api/profile');
    const d = await r.json();

    if (d.success) {
      currentUserId = d.profile?.id;
      currentUserName =
        d.profile?.full_name ||
        d.profile?.username ||
        "User";
    }

  } catch (err) {
    console.error("Profile initialization context failure:", err);
  }
}

if (currentUserId && String(currentUserId) === String(targetedSellerId)) {
  renderSellerLayout(token);
} else {
  await renderBuyerLayout(token);
}

if (params.get("openChat") === "1" && chatWithSellerBtn && chatWithSellerBtn.style.display !== "none") {
  chatWithSellerBtn.click();
}

  } catch (err) {
    console.error(err);
    if (productTitle) productTitle.textContent = "Product Not Found";
  }
}

// ======================================
// LOAD SELLER
// ======================================
async function loadSeller(sellerId) {
  if (!sellerId) return;
  try {
    const response = await fetch(`/api/user/${sellerId}`);
    const { success, seller } = await response.json();
    if (!success) return;

    currentSeller = seller;
    if (sellerInfo) {
      sellerInfo.innerHTML = `
        <h3>${seller.username || seller.full_name || "Unknown Seller"}</h3>
        <p>College: ${seller.college_name || seller.college || "Not Added"}</p>
        <p>Location: ${seller.location_name || seller.location || "Not Added"}</p>
        <p>Verified Student: ${seller.student_verified ? "✅" : "❌"}</p>
        <p>Verified Seller: ${seller.seller_verified ? "✅" : "❌"}</p>
      `;
    }
  } catch (err) {
    console.error(err);
  }
}

// ======================================
// LOAD IMAGES
// ======================================
async function loadImages(id) {
  try {
    const response = await fetch(`/api/products/${id}/images`);
    const { images } = await response.json();

    if (images && images.length > 0) {
      if (mainImage) mainImage.src = images[0].image_url;
      if (thumbnailContainer) {
        thumbnailContainer.innerHTML = "";
        images.forEach(img => {
          const thumb = document.createElement("img");
          thumb.src = img.image_url;
          thumb.classList.add("thumb");
          thumb.addEventListener("click", () => { if (mainImage) mainImage.src = img.image_url; });
          thumbnailContainer.appendChild(thumb);
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}

// ======================================
// LOAD REVIEWS
// ======================================
async function loadReviews(id) {
  try {
    const response = await fetch(`/api/products/${id}/reviews`);
    const { reviews } = await response.json();
    if (!reviewsContainer) return;
    reviewsContainer.innerHTML = "";

    if (!reviews || reviews.length === 0) {
      reviewsContainer.innerHTML = `<div class="review-card">No reviews yet.</div>`;
      return;
    }

    reviews.forEach(review => {
      reviewsContainer.innerHTML += `
        <div class="review-card">
          <h4>${"⭐".repeat(review.rating)}</h4>
          <p>${review.review_text}</p>
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
  }
}

// ======================================
// LOAD AI INSIGHTS
// ======================================
async function loadAIInsights(id) {
  if (!aiInsights) return;

  aiInsights.innerHTML = `
    <div class="ai-loading">
      <div class="spinner"></div>
      <h3>Generating AI Summary...</h3>
      <p>UniThrift AI is analysing this product and customer reviews.</p>
    </div>
  `;

  try {
    const response = await fetch(`/api/products/${id}/ai-insights`);
    const result = await response.json();
    if (!result.success) throw new Error(result.message);

    renderAIInsights(result.insights);
  } catch (err) {
    console.error(err);
    aiInsights.innerHTML = `
      <div class="ai-error">
        <h3>⚠ AI Summary Unavailable</h3>
        <p>We couldn't generate an AI summary for this listing.</p>
      </div>
    `;
  }
}

// ======================================
// RENDER AI INSIGHTS
// ======================================
function renderAIInsights(data) {
  if (!aiInsights || !data) return;
  const recommendation = data.recommendation || "Neutral";
  let badgeColor = "#f59e0b";

  if (recommendation === "Positive") badgeColor = "#10b981";
  if (recommendation === "Caution") badgeColor = "#ef4444";

  const keyPoints = (data.key_points || [])
    .map(point => `<li>✔ ${point}</li>`)
    .join("");

  aiInsights.innerHTML = `
    <div class="ai-summary-card">
      <div class="ai-recommendation" style="background:${badgeColor};">${recommendation}</div>
      <div class="ai-section">
        <h3>📦 Product Assessment</h3>
        <p>${data.product_summary || "No summary available."}</p>
      </div>
      <div class="ai-section">
        <h3>⭐ Review Analysis</h3>
        <p>${data.review_summary || "No review summary available."}</p>
      </div>
      <div class="ai-section">
        <h3>📌 Key Points</h3>
        <ul>${keyPoints}</ul>
      </div>
      <div class="ai-footer">Generated using UniThrift AI. AI may occasionally make mistakes.</div>
    </div>
  `;
}

// ======================================
// SUBMIT REVIEW
// ======================================
if (reviewForm) {
  reviewForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("unithrift_session_token");
    if (!token) return showToast("Please login first.", "warning");

    const rating = Number(document.getElementById("rating").value);
    const review_text = document.getElementById("reviewText").value.trim();

    if (!rating) return showToast("Please select a rating.", "warning");
    if (!review_text) return showToast("Please write a review.", "warning");

    const submitBtn = reviewForm.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
    }

    try {
      const response = await fetch(`/api/products/${productId}/reviews`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rating, review_text })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to post");

      showToast("Review submitted successfully!", "success");
      reviewForm.reset();
      
      await loadReviews(productId);
      await loadAIInsights(productId);
    } catch (err) {
      console.error("Submission Error:", err);
      showToast(`Failed to submit review: ${err.message}`, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Review";
      }
    }
  });
}

// ======================================
// CONTACT SELLER MODAL
// ======================================
if (contactSellerBtn) {
  contactSellerBtn.addEventListener("click", () => {
    if (!currentProduct) return showToast("Product data is loading. Please wait a moment.", "warning");
    const sellerData = currentSeller?.seller || currentSeller;
    if (!sellerData) return showToast("Seller details are unavailable right now.", "error");

    const sellerName = sellerData.full_name || sellerData.username || "Registered Student";
    const sellerCollege = sellerData.college_name || "UniThrift Verified College";
    const contactNumber = currentProduct.contact_no || currentProduct.phone_number || "Provided upon request";
    const collectionPoint = currentProduct.collection_point || currentProduct.location_name || sellerData.location_name || "Campus Main Gate";

    if (modalSellerDetails) {
      modalSellerDetails.innerHTML = `
        <div class="modal-item"><strong>Name:</strong> ${sellerName}</div>
        <div class="modal-item"><strong>College:</strong> ${sellerCollege}</div>
        <div class="modal-item"><strong>Contact No:</strong> ${contactNumber}</div>
        <div class="modal-item"><strong>Collection Point:</strong> ${collectionPoint}</div>
      `;
    }
    if (contactModal) contactModal.style.display = "flex";
  });
}

if (closeModal) {
  closeModal.addEventListener("click", () => { if (contactModal) contactModal.style.display = "none"; });
}

window.addEventListener("click", (e) => {
  if (e.target === contactModal) contactModal.style.display = "none";
});

// ======================================
// ENHANCED CHAT COMPONENT ENGINE
// ======================================
let loadedMessageIds = new Set();
let chatPollInterval = null;

function formatMessageTime(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit"
  });
}

function appendMessageToUI(text, direction, timestamp) {
  if (!chatMessages) return;
  const msgDiv = document.createElement("div");
  msgDiv.classList.add("message", direction);

  const textSpan = document.createElement("span");
  textSpan.className = "message-text";
  textSpan.textContent = text;
  msgDiv.appendChild(textSpan);

  if (direction !== "system-msg") {
    const timeSpan = document.createElement("span");
    timeSpan.className = "message-time";
    timeSpan.textContent = formatMessageTime(timestamp);
    msgDiv.appendChild(timeSpan);
  }

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function populateChatHeader() {
  const sellerData = currentSeller?.seller || currentSeller;

  if (chatSellerAvatar) {
    const fallbackName = encodeURIComponent(sellerData?.full_name || sellerData?.username || "U");
    chatSellerAvatar.src =
      sellerData?.avatar_url ||
      sellerData?.profile_picture ||
      `https://ui-avatars.com/api/?name=${fallbackName}&background=1f2937&color=fff`;
  }

  if (chatVerifiedBadge) {
    const isVerified = !!(sellerData?.seller_verified || sellerData?.student_verified);
    chatVerifiedBadge.style.display = isVerified ? "inline" : "none";
  }

  if (chatOnlineIndicator) chatOnlineIndicator.style.background = "#10b981";

  if (currentProduct) {
    if (chatProductImage) chatProductImage.src = mainImage?.src || "";
    if (chatProductTitle) chatProductTitle.textContent = currentProduct.title || "Product";
    if (chatProductPrice) {
      chatProductPrice.textContent = `₹${Number(currentProduct.price).toLocaleString('en-IN')}`;
    }
    if (chatProductCard) chatProductCard.href = `/product.html?id=${productId}`;
  }
}

async function fetchMessages() {
  if (!activeRoomId) return;
  const token = localStorage.getItem("unithrift_session_token");
  if (!token) return;

  try {
    const response = await authFetch(`/api/chat/rooms/${activeRoomId}/messages`);
    const msgResult = await response.json();
    
    if (msgResult.success && msgResult.messages) {
      let addedNew = false;
      msgResult.messages.forEach(msg => {
        if (!loadedMessageIds.has(msg.id)) {
          loadedMessageIds.add(msg.id);
          const direction = (String(msg.sender_id) === String(currentUserId)) ? "sent" : "received";
          const timestamp = msg.created_at || msg.inserted_at || msg.timestamp;
          appendMessageToUI(msg.message_text, direction, timestamp);
          addedNew = true;
        }
      });
      if (addedNew && chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
  } catch (err) {
    console.error("Error fetching messages during poll:", err);
  }
}

function startPolling() {
  stopPolling();
  fetchMessages();
  chatPollInterval = setInterval(fetchMessages, 2500);
}

function stopPolling() {
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
}

async function syncChatRoomHistory() {
  const sendChatBtn = document.getElementById("sendChatBtn");

  // Reset input to enabled at the start of every attempt; the MULTIPLE_BUYERS
  // branch below re-disables it since there's no single room to send into.
  if (chatInput) chatInput.disabled = false;
  if (sendChatBtn) sendChatBtn.disabled = false;

  try {
    const roomResponse = await authFetch('/api/chat/room', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: productId
      })
    });

    const roomResult = await roomResponse.json();

    if (!roomResult.success) {
      const err = new Error(roomResult.message || "No active chats found for this product yet.");
      err.code = roomResult.code;
      throw err;
    }

    activeRoomId = roomResult.room_id;

    loadedMessageIds.clear();

    if (chatMessages) {
      chatMessages.innerHTML =
        '<div class="message system-msg">Welcome to campus chat! Protect your data.</div>';
    }

    startPolling();

  } catch (err) {
    console.error("Failed to restore chat room history:", err);
    stopPolling();
    activeRoomId = null;

    // The seller has more than one interested buyer for this listing — there's
    // no single room to open here, so point them to the full inbox instead of
    // showing a plain error.
    if (err.code === "MULTIPLE_BUYERS") {
      if (chatInput) chatInput.disabled = true;
      if (sendChatBtn) sendChatBtn.disabled = true;

      if (chatMessages) {
        chatMessages.innerHTML = `
          <div class="empty-state-block">
            <i class="fas fa-comments"></i>
            <p>Multiple buyers are interested in this listing.</p>
            <p style="margin-top:6px;font-size:0.85rem;">Manage each conversation from your inbox.</p>
            <a href="/chat" target="_blank" rel="noopener"
               style="display:inline-block;margin-top:14px;padding:10px 20px;border-radius:10px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;font-size:0.85rem;">
              Open Inbox →
            </a>
          </div>`;
      }
      return;
    }

    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="message system-msg"
             style="background:#e11d48;color:white;border-radius:8px;padding:10px;margin:10px;">
          ⚠️ Chat unavailable: ${err.message || "Please wait for a buyer to start a chat."}
        </div>`;
    }
  }
}

if (chatWithSellerBtn) {
  chatWithSellerBtn.addEventListener("click", async () => {

    if (!localStorage.getItem("unithrift_session_token")) {
      return showToast("Please login to chat with the seller.", "warning");
    }

    if (!currentProduct) {
      return showToast("Product data is loading. Please wait a moment.", "warning");
    }

    const sellerData = currentSeller?.seller || currentSeller;
    const sellerName =
      sellerData?.full_name ||
      sellerData?.username ||
      "Seller";

    const isSeller =
      currentUserId &&
      String(currentUserId) ===
      String(currentProduct.seller_id || currentProduct.user_id);

    if (chatSellerName) {
      chatSellerName.textContent = isSeller
        ? "Buyer Chat"
        : sellerName;
    }

    populateChatHeader();

    if (chatPopup) chatPopup.classList.add("open");
    if (chatInput) chatInput.focus();

    await syncChatRoomHistory();
  });
}

if (closeChatBtn) {
  closeChatBtn.addEventListener("click", () => {
    if (chatPopup) chatPopup.classList.remove("open");
    stopPolling();
  });
}

if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = chatInput.value.trim();
    if (!text) return;

    if (!activeRoomId) {
      showToast("Chat room is not ready yet. Please wait.", "warning");
      return;
    }

    if (!localStorage.getItem("unithrift_session_token")) {
      return showToast("Session expired. Please log in again.", "error");
    }

    if (chatInput) chatInput.value = "";

    try {
      const response = await authFetch(
        `/api/chat/rooms/${activeRoomId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message_text: text
          })
        }
      );

      const result = await response.json();

      if (result.success || response.ok) {
        await fetchMessages();
      } else {
        console.error("Failed to send message:", result.message);
      }

    } catch (err) {
      console.error("Transmission execution system pipeline error:", err);
    }
  });
}

if (typeof productId !== 'undefined' && productId) {
  loadProduct();
} else if (productTitle) {
  productTitle.textContent = "Invalid Product ID";
}