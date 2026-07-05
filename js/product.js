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

// Cache targets for async operations
let currentProduct = null;
let currentSeller = null;
let currentUserId = null;
let currentUserName = null; // <-- Added to cache current active buyer name cleanly

// Disable chat interaction buttons until dataset loading is finished
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

    // Determine the exact owner id dynamically based on database object patterns
    const targetedSellerId = currentProduct.seller_id || currentProduct.user_id;

    // Show sold banner if sold
    if (currentProduct.is_sold) {
        const soldBanner = document.createElement('div');
        soldBanner.style.cssText = "background:#ef4444;color:white;text-align:center;padding:12px;font-weight:700;font-size:1.1rem;letter-spacing:2px;margin-bottom:16px;border-radius:10px;";
        soldBanner.textContent = "⚠️ THIS ITEM HAS BEEN SOLD";
        document.querySelector('.details-section').prepend(soldBanner);
        document.getElementById('addCartBtn').disabled = true;
        document.getElementById('addCartBtn').style.opacity = '0.4';
        document.getElementById('addCartBtn').style.cursor = 'not-allowed';
    }

    // Identify current active user session profile
    const token = localStorage.getItem("unithrift_session_token");
    if (token) {
        try {
            const r = await fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } });
            const d = await r.json();
            if (d.success) {
                currentUserId = d.profile?.id;
                // Capture the real profile text strings dynamically from payload
                currentUserName = d.profile?.full_name || d.profile?.username; 
                initNotificationListener(currentUserId);
            }

            // Show Mark as Sold button if current user is the owner
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
                document.querySelector('.action-buttons').appendChild(markSoldBtn);
            }
        } catch (_) {}
    }

    // Render AI Verification Results dynamically
    renderAIVerification(currentProduct.ai_verification_status);

    // Load secondary references safely with verified destination mapping fallback
    loadSeller(targetedSellerId);
    loadImages(currentProduct.id);
    loadReviews(currentProduct.id);

    // Re-enable chat features now that references are completely cached
    if (chatWithSellerBtn) chatWithSellerBtn.disabled = false;
    if (contactSellerBtn) contactSellerBtn.disabled = false;

  } catch (err) {
    console.error(err);
    productTitle.textContent = "Product Not Found";
  }
}

function renderAIVerification(statusText) {
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

async function loadSeller(sellerId) {
  if (!sellerId) return;
  try {
    const response = await fetch(`/api/user/${sellerId}`);
    const { success, seller } = await response.json();
    if (!success) return;

    currentSeller = seller;
    sellerInfo.innerHTML = `
      <h3>${seller.username || seller.full_name || "Unknown Seller"}</h3>
      <p>College: ${seller.college_name || seller.college || "Not Added"}</p>
      <p>Location: ${seller.location_name || seller.location || "Not Added"}</p>
      <p>Verified Student: ${seller.student_verified ? "✅" : "❌"}</p>
      <p>Verified Seller: ${seller.seller_verified ? "✅" : "❌"}</p>
    `;
  } catch (err) {
    console.error(err);
  }
}

async function loadImages(id) {
  try {
    const response = await fetch(`/api/products/${id}/images`);
    const { images } = await response.json();

    if (images && images.length > 0) {
      mainImage.src = images[0].image_url;
      thumbnailContainer.innerHTML = "";

      images.forEach(img => {
        const thumb = document.createElement("img");
        thumb.src = img.image_url;
        thumb.classList.add("thumb");
        thumb.addEventListener("click", () => mainImage.src = img.image_url);
        thumbnailContainer.appendChild(thumb);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadReviews(id) {
  try {
    const response = await fetch(`/api/products/${id}/reviews`);
    const { reviews } = await response.json();
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
// SUBMIT REVIEW
// ======================================
reviewForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = localStorage.getItem("unithrift_session_token");
  if (!token) return alert("Please login first.");

  const rating = document.getElementById("rating").value;
  const review_text = document.getElementById("reviewText").value;

  try {
    const response = await fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        rating: Number(rating), 
        review_text: review_text
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Failed to post");
    }

    alert("Review submitted successfully!");
    reviewForm.reset();
    loadReviews(productId);
  } catch (err) {
    console.error("Submission Error:", err);
    alert(`Failed to submit review: ${err.message}`);
  }
});

// ======================================
// CONTACT SELLER MODAL INTERACTION
// ======================================
contactSellerBtn.addEventListener("click", () => {
  if (!currentProduct) {
    alert("Product data is loading. Please wait a moment.");
    return;
  }

  const sellerData = currentSeller?.seller || currentSeller;

  if (!sellerData) {
    alert("Seller details are unavailable right now.");
    return;
  }

  const sellerName = sellerData.full_name || sellerData.username || "Registered Student";
  const sellerCollege = sellerData.college_name || "UniThrift Verified College";
  
  const contactNumber = currentProduct.contact_no || currentProduct.phone_number || "Provided upon request";
  const collectionPoint = currentProduct.collection_point || currentProduct.location_name || sellerData.location_name || "Campus Main Gate";

  modalSellerDetails.innerHTML = `
    <div class="modal-item"><strong>Name:</strong> ${sellerName}</div>
    <div class="modal-item"><strong>College:</strong> ${sellerCollege}</div>
    <div class="modal-item"><strong>Contact No:</strong> ${contactNumber}</div>
    <div class="modal-item"><strong>Collection Point:</strong> ${collectionPoint}</div>
  `;
  contactModal.style.display = "flex";
});

if (closeModal) {
  closeModal.addEventListener("click", () => {
    contactModal.style.display = "none";
  });
}

window.addEventListener("click", (e) => {
  if (e.target === contactModal) {
    contactModal.style.display = "none";
  }
});

// ======================================
// CHAT POPUP INTERACTION
// ======================================
chatWithSellerBtn.addEventListener("click", () => {
    const token = localStorage.getItem("unithrift_session_token");
    if (!token) return alert("Please login to chat with the seller.");

    if (!currentProduct) {
        alert("Product data is loading. Please wait a moment.");
        return;
    }

    const sellerData = currentSeller?.seller || currentSeller;
    const sellerName = sellerData?.full_name || sellerData?.username || "Seller";
    
    chatSellerName.textContent = `Chat with ${sellerName}`;
    chatPopup.style.display = "flex";
    chatInput.focus();
});

closeChatBtn.addEventListener("click", () => {
    chatPopup.style.display = "none";
});

// ======================================
// REALTIME NOTIFICATION SYSTEM
// ======================================
function initNotificationListener(userId) {
    if (typeof supabase === 'undefined' || !userId) return;

    const notificationChannel = supabase.channel(`notifications:${userId}`);
    
    notificationChannel
        .on('broadcast', { event: 'new_msg_alert' }, (payload) => {
            // 1. Appends instantly if the target chat window frame is open
            if (chatPopup && chatPopup.style.display === "flex") {
                const msgDiv = document.createElement("div");
                msgDiv.classList.add("message", "received");
                msgDiv.textContent = payload.payload.msg;
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } 
            
            // 2. Transmits the incoming payload straight into the Profile Update container section
            sendToProfileUpdateSection(payload.payload.senderName, payload.payload.msg);
        })
        .subscribe();
}

function sendToProfileUpdateSection(sender, message) {
    // Looks for your update section dashboard container components
    let updateSection = document.getElementById("profileUpdates") || document.querySelector(".update-section");
    
    if (!updateSection) {
        console.warn("Update section element missing. Redirecting alert.");
        renderInboundNotificationAlert(sender, message);
        return;
    }

    // Build the dynamic update notification card block
    const updateCard = document.createElement("div");
    updateCard.className = "update-card dynamic-message-alert";
    updateCard.style.cssText = "background: #27272a; border-left: 4px solid #10b981; padding: 12px; margin-bottom: 10px; border-radius: 8px; animation: fadeIn 0.3s ease;";
    
    updateCard.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #10b981; font-size: 0.9rem;">💬 New Chat Message</strong>
            <span style="font-size: 0.75rem; color: #a1a1aa;">Just now</span>
        </div>
        <p style="margin: 0; font-size: 0.85rem; color: #e4e4e7;">
            <strong>${sender}:</strong> "${message}"
        </p>
    `;

    // Strip default placeholder empty strings if they are present
    const placeholder = updateSection.querySelector(".no-updates-placeholder") || updateSection.querySelector("p");
    if (placeholder && (placeholder.textContent.includes("No") || placeholder.textContent.includes("empty"))) {
        placeholder.remove();
    }

    // Prepend to place the newest messages directly at the top
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
        if (alertBox) alertBox.remove();
    }, 4500);
}

// Chat Form Submission
chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    if (!currentProduct || !(currentProduct.seller_id || currentProduct.user_id)) {
        alert("Routing failure: Target identity reference context missing.");
        return;
    }

    const sellerId = currentProduct.seller_id || currentProduct.user_id;

    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", "sent");
    msgDiv.textContent = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatInput.value = "";

    try {
        await fetch('/api/chats/archive', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem("unithrift_session_token")}`
            },
            body: JSON.stringify({
                product_id: productId,
                seller_id: sellerId,
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
                            senderId: currentUserId,
                            senderName: currentUserName || "Another Student" // <-- Uses the cached session value dynamically
                        }
                    });
                }
            });
        }

    } catch (err) {
        console.error("Transmission error: ", err);
    }
});

// Initializer execution check
if (typeof productId !== 'undefined' && productId) {
  loadProduct();
} else if (productTitle) {
  productTitle.textContent = "Invalid Product ID";
}