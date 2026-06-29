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

// Cache targets for async operations
let currentProduct = null;
let currentSeller = null;

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

    // Show Mark as Sold button if current user is the owner
    const token = localStorage.getItem("unithrift_session_token");
    if (token && !currentProduct.is_sold) {
        try {
            const r = await fetch('/api/profile', { headers: { 'Authorization': `Bearer ${token}` } });
            const d = await r.json();
            if (d.success && d.profile?.id === currentProduct.user_id) {
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

    // Load secondary references
    loadSeller(currentProduct.seller_id);
    loadImages(currentProduct.id);
    loadReviews(currentProduct.id);
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
// SUBMIT REVIEW (FIXED FRONTEND CODE)
// ======================================
reviewForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = localStorage.getItem("unithrift_session_token");
  if (!token) return alert("Please login first.");

  const rating = document.getElementById("rating").value;
  const review_text = document.getElementById("reviewText").value; // Changed to match snake_case variables safely

  try {
    const response = await fetch(`/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        rating: Number(rating), 
        review_text: review_text // Cleanly passes down to your server.js req.body
      })
    });

    const result = await response.json(); // Read the server's response payload

    if (!response.ok) {
      // Instead of a generic alert, this alerts the EXACT error reason sent by your Express backend
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

  // Handle cases where currentSeller is nested under result.seller from the API
  const sellerData = currentSeller?.seller || currentSeller;

  if (!sellerData) {
    alert("Seller details are unavailable right now.");
    return;
  }

  // Fallback chain matching your server.js columns: college_name, location_name, address
  const sellerName = sellerData.full_name || sellerData.username || "Registered Student";
  const sellerCollege = sellerData.college_name || "UniThrift Verified College";
  
  // Use product schema properties, falling back gracefully if columns are null
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

// Initializer execution check
if (typeof productId !== 'undefined' && productId) {
  loadProduct();
} else if (productTitle) {
  productTitle.textContent = "Invalid Product ID";
}