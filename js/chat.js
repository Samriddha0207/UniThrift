const urlParams = new URLSearchParams(window.location.search);
const sellerId = urlParams.get("sellerId");
const productId = urlParams.get("productId");

const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const imageUpload = document.getElementById("imageUpload");
const voiceMemoBtn = document.getElementById("voiceMemoBtn");

const chatHeaderName = document.getElementById("chatHeaderName");
const chatProductBadge = document.getElementById("chatProductBadge");
const sidebarSellerName = document.getElementById("sidebarSellerName");
const sidebarProductTitle = document.getElementById("sidebarProductTitle");

let isRecording = false;

async function initChatWorkspace() {
    if (!sellerId || !productId) {
        chatHeaderName.textContent = "Error: Context Missing";
        return;
    }
    await fetchContextData();
    setupMockIncomingResponses();
}

async function fetchContextData() {
    try {
        const prodRes = await fetch(`/api/products/${productId}`);
        const prodData = await prodRes.json();
        if (prodData.success) {
            chatProductBadge.textContent = prodData.product.title;
            sidebarProductTitle.textContent = prodData.product.title;
        }

        const userRes = await fetch(`/api/user/${sellerId}`);
        const userData = await userRes.json();
        
        const profile = userData.seller?.seller || userData.seller || userData.profile;
        const targetName = profile?.username || profile?.full_name || "Verified Student";

        chatHeaderName.textContent = targetName;
        sidebarSellerName.textContent = targetName;

    } catch (err) {
        console.error("Error setting chat context parameters:", err);
        chatHeaderName.textContent = "Chat Workspace";
    }
}

function appendMessage(type, content, attachmentType = 'text') {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message", type);

    let bubbleContent = "";

    if (attachmentType === 'text') {
        bubbleContent = `<div class="msg-bubble">${content}</div>`;
    } else if (attachmentType === 'image') {
        bubbleContent = `
            <div class="msg-bubble" style="padding: 8px;">
                <img src="${content}" class="msg-img" alt="Shared Image Attachment">
            </div>`;
    } else if (attachmentType === 'voice') {
        bubbleContent = `
            <div class="msg-bubble">
                <div class="voice-memo-wrapper">
                    <button type="button" class="voice-play-btn">▶</button>
                    <div class="voice-wave-mock"></div>
                    <span style="font-size:0.75rem; color:var(--secondary); min-width:35px;">0:04</span>
                </div>
            </div>`;
    }

    msgDiv.innerHTML = bubbleContent;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const textValue = messageInput.value.trim();
    if (!textValue) return;

    appendMessage('outgoing', textValue, 'text');
    messageInput.value = "";
});

imageUpload.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        appendMessage('outgoing', event.target.result, 'image');
    };
    reader.readAsDataURL(file);
    imageUpload.value = "";
});

voiceMemoBtn.addEventListener("click", () => {
    if (!isRecording) {
        isRecording = true;
        voiceMemoBtn.classList.add("recording");
        messageInput.placeholder = "Recording audio note... click mic again to send";
        messageInput.disabled = true;
    } else {
        isRecording = false;
        voiceMemoBtn.classList.remove("recording");
        messageInput.placeholder = "Type your message here...";
        messageInput.disabled = false;
        
        appendMessage('outgoing', null, 'voice');
    }
});

function setupMockIncomingResponses() {
    setTimeout(() => {
        appendMessage('incoming', "Hey there! Yeah, the item is still available for campus pickup. Are you around today?", 'text');
    }, 3000);
}

document.addEventListener("DOMContentLoaded", initChatWorkspace);
