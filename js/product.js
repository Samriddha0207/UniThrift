// ======================================
// PRODUCT ID FROM URL
// ======================================
const params = new URLSearchParams(window.location.search);
const productId = params.get("id");

// ======================================
// HTML ELEMENTS
// ======================================
const mainImage = document.getElementById("mainImage");
const thumbnailContainer = document.getElementById("thumbnailContainer");
const productTitle = document.getElementById("productTitle");
const productPrice = document.getElementById("productPrice");
const productCondition = document.getElementById("productCondition");
const deliveryDate = document.getElementById("deliveryDate");
const warranty = document.getElementById("warranty");
const paymentMethods = document.getElementById("paymentMethods");
const productDescription = document.getElementById("productDescription");
const sellerInfo = document.getElementById("sellerInfo");
const aiInsights = document.getElementById("aiInsights");
const reviewsContainer = document.getElementById("reviewsContainer");
const reviewForm = document.getElementById("reviewForm");
const verificationInfo = document.getElementById("verificationInfo");

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
      if (!confirm("Mark this listing as sold? This cannot be undone.")) return;
      markSoldBtn.textContent = "Marking...";
      markSoldBtn.disabled = true;
      try {
        const res = await fetch(`/api/products/${productId}/sold`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        window.location.reload();
      } catch (err) {
        alert("Failed: " + err.message);
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
      if (!confirm("Are you sure you want to delete this listing? This action cannot be undone.")) return;
      deleteBtn.textContent = "Deleting...";
      deleteBtn.disabled = true;
      try {
        const res = await fetch(`/api/products/${productId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);
        alert("Product deleted successfully!");
        window.location.href = "/marketplace";
      } catch (err) {
        alert("Failed: " + err.message);
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
    warranty.textContent = currentProduct.warranty || "No warranty";
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

    renderAIVerification(currentProduct.ai_verification_status);
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

  } catch (err) {
    console.error(err);
    if (productTitle) productTitle.textContent = "Product Not Found";
  }
}

// ======================================
// RENDER AI VERIFICATION
// ======================================
function renderAIVerification(statusText) {
  if (!verificationInfo) return;
  if (!statusText) {
    verificationInfo.innerHTML = `<p style="color: #b5b5b5; margin: 0;">No verification log data exists for this item.</p>`;
    return;
  }

  if (statusText === "VERIFIED") {
    verificationInfo.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: #10b981; color: white; padding: 5px 12px; border-radius: 20px; font-weight: 700; font-size: 0.85rem;">VERIFIED</span>
        <p style="margin: 0; color: #e5e7eb;">Product layout passes description metrics. No physical flaws detected.</p>
      </div>
    `;
    verificationInfo.style.borderLeft = "5px solid #10b981";
  } else {
    verificationInfo.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="background: #ef4444; color: white; padding: 5px 12px; border-radius: 20px; font-weight: 700; font-size: 0.85rem;">FLAGGED ISSUE</span>
        <p style="margin: 0; color: #fca5a5; font-weight: 500;">${statusText}</p>
      </div>
    `;
    verificationInfo.style.borderLeft = "5px solid #ef4444";
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
    if (!token) return alert("Please login first.");

    const rating = Number(document.getElementById("rating").value);
    const review_text = document.getElementById("reviewText").value.trim();

    if (!rating) return alert("Please select a rating.");
    if (!review_text) return alert("Please write a review.");

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

      alert("Review submitted successfully!");
      reviewForm.reset();
      
      await loadReviews(productId);
      await loadAIInsights(productId);
    } catch (err) {
      console.error("Submission Error:", err);
      alert(`Failed to submit review: ${err.message}`);
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
    if (!currentProduct) return alert("Product data is loading. Please wait a moment.");
    const sellerData = currentSeller?.seller || currentSeller;
    if (!sellerData) return alert("Seller details are unavailable right now.");

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
      throw new Error(
        roomResult.message || "No active chats found for this product yet."
      );
    }

    activeRoomId = roomResult.room_id;

    loadedMessageIds.clear();

    if (chatMessages) {
      chatMessages.innerHTML =
        '<div class="message system-msg">Welcome to campus chat! Protect your data.</div>';
    }

    startPolling();

  } catch (err) {
    console.error("Failed to restore history structural sync map alignment:", err);

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
      return alert("Please login to chat with the seller.");
    }

    if (!currentProduct) {
      return alert("Product data is loading. Please wait a moment.");
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
      alert("Chat room is not ready yet. Please wait.");
      return;
    }

    if (!localStorage.getItem("unithrift_session_token")) {
      return alert("Session expired. Please log in again.");
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