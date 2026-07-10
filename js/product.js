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

// Modal Elements
const contactSellerBtn = document.getElementById("contactSellerBtn");
const contactModal = document.getElementById("contactModal");
const closeModal = document.getElementById("closeModal");
const modalSellerDetails = document.getElementById("modalSellerDetails");

// Chat Popup Elements
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

// Cache targets for async operations
let currentProduct = null;
let currentSeller = null;
let currentUserId = null;
let currentUserName = null; 
let activeRoomId = null;

// Disable interaction buttons until dataset loading is finished
if (chatWithSellerBtn) chatWithSellerBtn.disabled = true;
if (contactSellerBtn) contactSellerBtn.disabled = true;

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

    const token = localStorage.getItem("unithrift_session_token");
    if (token) {
      try {
        const r = await fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } });
        const d = await r.json();
        if (d.success) {
          currentUserId = d.profile?.id;
          currentUserName = d.profile?.full_name || d.profile?.username || "User"; 
          initNotificationListener(currentUserId);
          
          // Pre-fetch structural room history alignment mapping context cleanly
          await syncChatRoomHistory(token, targetedSellerId);
        }

        if (d.success && d.profile?.id === targetedSellerId) {
          const markSoldBtn = document.createElement('button');
          markSoldBtn.textContent = 'Mark as Sold';
          markSoldBtn.style.cssText = "width:100%;margin-top:10px;padding:13px;border:none;border-radius:12px;background:#f59e0b;color:white;font-weight:700;font-size:1rem;cursor:pointer;transition:.2s;";
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
          const actionButtons = document.querySelector('.action-buttons');
          if (actionButtons) actionButtons.appendChild(markSoldBtn);
        }
      } catch (err) {
        console.error("Profile initialization tracking context failure:", err);
      }
    }

    // Parallelized asset load routines
    renderAIVerification(currentProduct.ai_verification_status);
    
    await Promise.all([
      loadSeller(targetedSellerId),
      loadImages(currentProduct.id),
      loadReviews(currentProduct.id),
      loadAIInsights(currentProduct.id)
    ]);

    if (chatWithSellerBtn) chatWithSellerBtn.disabled = false;
    if (contactSellerBtn) contactSellerBtn.disabled = false;

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
    verificationInfo.innerHTML = `<p style="color: #b5b5b5;">No verification log data exists for this item.</p>`;
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
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div>
          <span style="background: #ef4444; color: white; padding: 5px 12px; border-radius: 20px; font-weight: 700; font-size: 0.85rem;">FLAGGED ISSUE</span>
        </div>
        <p style="margin: 5px 0 0 0; color: #fca5a5; font-weight: 500;">${statusText}</p>
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

// Consistent with the IST-localized timestamps used elsewhere (rate-limit retry messaging)
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

// Fills the chat header (avatar / verified badge) and the compact product
// card from data already loaded on the page — no extra API calls needed.
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

  // Presence isn't tracked yet; indicator defaults to online. Left as its
  // own element so real presence data can be wired in later without
  // touching the surrounding markup.
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

// Structural Async Sync Channel Resolver History Engine
async function syncChatRoomHistory(token, targetSellerId) {
  try {
    const roomResponse = await fetch('/api/chat/room', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ product_id: productId, seller_id: targetSellerId })
    });
    const roomResult = await roomResponse.json();
    if (!roomResult.success) throw new Error(roomResult.message);
    activeRoomId = roomResult.room_id;

    const msgResponse = await fetch(`/api/chat/rooms/${activeRoomId}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const msgResult = await msgResponse.json();
    
    if (msgResult.success && msgResult.messages && chatMessages) {
      chatMessages.innerHTML = '<div class="message system-msg">Welcome to campus chat! Protect your data.</div>';
      msgResult.messages.forEach(msg => {
        const direction = (msg.sender_id === currentUserId) ? "sent" : "received";
        const timestamp = msg.created_at || msg.inserted_at || msg.timestamp;
        appendMessageToUI(msg.message_text || msg.message, direction, timestamp);
      });
    }
  } catch (err) {
    console.error("Failed to restore history structural sync map alignment:", err);
  }
}

if (chatWithSellerBtn) {
  chatWithSellerBtn.addEventListener("click", async () => {
    const token = localStorage.getItem("unithrift_session_token");
    if (!token) return alert("Please login to chat with the seller.");
    if (!currentProduct) return alert("Product data is loading. Please wait a moment.");

    const sellerData = currentSeller?.seller || currentSeller;
    const sellerName = sellerData?.full_name || sellerData?.username || "Seller";
    const targetedSellerId = currentProduct.seller_id || currentProduct.user_id;

    if (chatSellerName) chatSellerName.textContent = sellerName;
    populateChatHeader();

    // syncChatRoomHistory already finds-or-creates the room server-side
    // (POST /api/chat/room) and reloads its history, so reopening the
    // widget for the same product/seller always resumes the same
    // conversation instead of starting a new one.
    if (chatPopup) chatPopup.classList.add("open");
    if (chatInput) chatInput.focus();

    await syncChatRoomHistory(token, targetedSellerId);
  });
}

if (closeChatBtn) {
  closeChatBtn.addEventListener("click", () => { if (chatPopup) chatPopup.classList.remove("open"); });
}

// ======================================
// REALTIME NOTIFICATION SYSTEM
// ======================================
function initNotificationListener(userId) {
  if (typeof supabase === 'undefined' || !userId) return;
  const notificationChannel = supabase.channel(`notifications:${userId}`);
  
  notificationChannel
    .on('broadcast', { event: 'new_msg_alert' }, (payload) => {
      if (payload.payload.productId === productId || !payload.payload.productId) {
        if (chatPopup && chatPopup.classList.contains("open")) {
          appendMessageToUI(payload.payload.msg, "received", new Date());
        }
      } 
      sendToProfileUpdateSection(payload.payload.senderName, payload.payload.msg);
    })
    .subscribe();
}

function sendToProfileUpdateSection(sender, message) {
  let updateSection = document.getElementById("profileUpdates") || document.querySelector(".update-section");
  if (!updateSection) {
    console.warn("Update dashboard view container components missing. Routing redirect framework layer.");
    renderInboundNotificationAlert(sender, message);
    return;
  }

  const updateCard = document.createElement("div");
  updateCard.className = "update-card dynamic-message-alert";
  updateCard.style.cssText = "background: #27272a; border-left: 4px solid #10b981; padding: 12px; margin-bottom: 10px; border-radius: 8px; animation: fadeIn 0.3s ease;";
  
  updateCard.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
      <strong style="color: #10b981; font-size: 0.9rem;">💬 New Chat Message</strong>
      <span style="font-size: 0.75rem; color: #a1a1aa;">Just now</span>
    </div>
    <p style="margin: 0; font-size: 0.85rem; color: #e4e4e7;"><strong>${sender}:</strong> "${message}"</p>
  `;

  const placeholder = updateSection.querySelector(".no-updates-placeholder") || updateSection.querySelector("p");
  if (placeholder && (placeholder.textContent.includes("No") || placeholder.textContent.includes("empty"))) {
    placeholder.remove();
  }
  updateSection.insertBefore(updateCard, updateSection.firstChild);
}

function renderInboundNotificationAlert(sender, message) {
  let alertBox = document.getElementById("unithriftNotificationBox");
  if (!alertBox) {
    alertBox = document.createElement("div");
    alertBox.id = "unithriftNotificationBox";
    alertBox.style.cssText = "position:fixed;bottom:24px;right:24px;background:#1e1e24;color:#fff;padding:16px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.3);z-index:9999;max-width:320px;border-left:4px solid #10b981;font-family:sans-serif;";
    document.body.appendChild(alertBox);
  }
  
  alertBox.innerHTML = `
    <div style="font-weight:700;margin-bottom:4px;font-size:0.9rem;color:#10b981;">New Message from ${sender}</div>
    <div style="font-size:0.85rem;color:#d1d5db;">${message}</div>
  `;
  
  setTimeout(() => {
    const box = document.getElementById("unithriftNotificationBox");
    if (box) box.remove();
  }, 4500);
}

// Chat Form Submission
if (chatForm) {
  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    if (!currentProduct || !(currentProduct.seller_id || currentProduct.user_id)) {
      alert("Routing failure: Target identity reference context missing.");
      return;
    }

    const sellerId = currentProduct.seller_id || currentProduct.user_id;

    appendMessageToUI(text, "sent", new Date());
    if (chatInput) chatInput.value = "";

    try {
      // Post cleanly to archived schema models container metrics endpoints
      const targetEndpoint = activeRoomId ? `/api/chat/rooms/${activeRoomId}/messages` : '/api/chats/archive';
      await fetch(targetEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem("unithrift_session_token")}`
        },
        body: JSON.stringify({
          product_id: productId,
          seller_id: sellerId,
          message_text: text,
          message: text
        })
      });

      if (typeof supabase !== 'undefined') {
        const deliveryTargetChannel = supabase.channel(`notifications:${sellerId}`);
        await deliveryTargetChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await deliveryTargetChannel.send({
              type: 'broadcast',
              event: 'new_msg_alert',
              payload: { 
                msg: text, 
                productId: productId,
                senderId: currentUserId,
                senderName: currentUserName || "Another Student"
              }
            });
          }
        });
      }
    } catch (err) {
      console.error("Transmission execution system pipeline error: ", err);
    }
  });
}

// ======================================
// INITIALIZATION EXECUTION ROUTINE
// ======================================
if (typeof productId !== 'undefined' && productId) {
  loadProduct();
} else if (productTitle) {
  productTitle.textContent = "Invalid Product ID";
}