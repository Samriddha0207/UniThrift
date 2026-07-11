// ======================================
// TURNSTILE WIDGET MANAGEMENT
// ======================================
let turnstileWidgetId = null;
const TURNSTILE_SITEKEY = "0x4AAAAAADyHfUVt4-tqoZhk";

window.onloadTurnstileCallback = function () {
    renderTurnstile();
};

function renderTurnstile() {
    if (!window.turnstile) return;

    const signupForm = document.getElementById("signupForm");
    const isSignupVisible = signupForm && signupForm.style.display !== "none";

    // If signup is not visible (i.e., we are on Login or OTP), remove the widget completely
    if (!isSignupVisible) {
        if (turnstileWidgetId !== null) {
            turnstile.remove(turnstileWidgetId);
            turnstileWidgetId = null;
        }
        return;
    }

    // Clean up existing widget before re-rendering on the signup form
    if (turnstileWidgetId !== null) {
        turnstile.remove(turnstileWidgetId);
        turnstileWidgetId = null;
    }

    let container = document.getElementById("turnstile-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "turnstile-container";
        container.style.marginBottom = "1rem";
    }

    // Always append specifically to the signup form now
    const errorMsg = signupForm.querySelector(".form-error");
    if (errorMsg) {
        signupForm.insertBefore(container, errorMsg);
    } else {
        signupForm.appendChild(container);
    }

    turnstileWidgetId = turnstile.render("#turnstile-container", {
        sitekey: TURNSTILE_SITEKEY,
        theme: "light"
    });
}

// ======================================
// TYPING ANIMATION
// ======================================
const phrases = [
    "Buy & Sell on Campus",
    "Your Student Marketplace",
    "Verified. Safe. Affordable.",
    "Give Old Items New Life 🌱",
];
let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
const animatedText = document.getElementById("animated-text");

function typeEffect() {
    if (!animatedText) return;
    const current = phrases[phraseIndex];

    if (isDeleting) {
        animatedText.textContent = current.substring(0, charIndex - 1);
        charIndex--;
    } else {
        animatedText.textContent = current.substring(0, charIndex + 1);
        charIndex++;
    }

    if (!isDeleting && charIndex === current.length) {
        setTimeout(() => { isDeleting = true; }, 1800);
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
    }

    const speed = isDeleting ? 50 : 90;
    setTimeout(typeEffect, speed);
}
typeEffect();

// ======================================
// FORM TOGGLE (Login ↔ Sign Up ↔ Verify OTP)
// ======================================
const loginForm    = document.getElementById("loginForm");
const signupForm   = document.getElementById("signupForm");
const otpForm      = document.getElementById("otpForm");
const formTitle    = document.getElementById("formTitle");
const toggleBtn    = document.getElementById("toggleBtn");
const toggleText   = document.getElementById("toggleText");
const toggleTextRow = document.getElementById("toggleTextRow");
const socialDivider = document.getElementById("socialDivider");
const googleLoginBtnEl = document.getElementById("googleLoginBtn");
const statusMsg    = document.getElementById("statusMsg");
let pendingSignupUsername = null; // carried from signup -> prefills the login field after OTP verification

// Shows exactly one of the three forms and adjusts the surrounding chrome
// (title, toggle link, social login) to match.
function showForm(name) {
    if (loginForm)  loginForm.style.display  = name === "login"  ? "block" : "none";
    if (signupForm) signupForm.style.display = name === "signup" ? "block" : "none";
    if (otpForm)    otpForm.style.display    = name === "otp"    ? "block" : "none";

    const hideChrome = name === "otp";
    if (socialDivider)    socialDivider.style.display    = hideChrome ? "none" : "flex";
    if (googleLoginBtnEl) googleLoginBtnEl.style.display  = hideChrome ? "none" : "flex";
    if (toggleTextRow)    toggleTextRow.style.display     = hideChrome ? "none" : "block";

    if (formTitle) {
        formTitle.textContent = name === "login" ? "Welcome Back 👋"
            : name === "signup" ? "Create Account"
            : "Verify Your Email";
    }
    if (toggleText) toggleText.textContent = name === "login" ? "Don't have an account?" : "Already have an account?";
    if (toggleBtn)  toggleBtn.textContent  = name === "login" ? "Sign Up" : "Login";

    clearMessages();
    renderTurnstile(); // will mount on signup, unmount on login/otp
}

if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isLoginVisible = loginForm.style.display !== "none";
        showForm(isLoginVisible ? "signup" : "login");
    });
}

// ======================================
// PASSWORD VISIBILITY TOGGLES
// ======================================
const toggleLoginPw = document.getElementById("toggleLoginPw");
if (toggleLoginPw) {
    toggleLoginPw.addEventListener("click", () => {
        const pw = document.getElementById("loginPassword");
        if (pw) pw.type = pw.type === "password" ? "text" : "password";
    });
}

const toggleSignupPw = document.getElementById("toggleSignupPw");
if (toggleSignupPw) {
    toggleSignupPw.addEventListener("click", () => {
        const pw = document.getElementById("signupPassword");
        if (pw) pw.type = pw.type === "password" ? "text" : "password";
    });
}

// ======================================
// HELPERS
// ======================================
function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.style.display = "block";
        el.style.color = "#dc2626";
    }
}

function showStatus(message, isSuccess = true) {
    if (!statusMsg) return;
    statusMsg.textContent = message;
    statusMsg.style.color = isSuccess ? "#16a34a" : "#dc2626";
    statusMsg.style.display = "block";
}

function clearMessages() {
    const loginErr = document.getElementById("loginError");
    const signupErr = document.getElementById("signupError");
    const otpErr = document.getElementById("otpError");
    if (loginErr) loginErr.style.display  = "none";
    if (signupErr) signupErr.style.display = "none";
    if (otpErr) otpErr.style.display = "none";
    if (statusMsg) statusMsg.style.display = "none";
}

function setButtonLoading(btnId, loading, defaultText) {
    const btn = document.getElementById(btnId);
    if (btn) {
        btn.disabled    = loading;
        btn.textContent = loading ? "Please wait..." : defaultText;
    }
}

// ======================================
// LOGIN (No Turnstile)
// ======================================
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearMessages();

        const loginIdentifier = document.getElementById("loginIdentifier").value.trim();
        const password        = document.getElementById("loginPassword").value;

        if (!loginIdentifier || !password) {
            return showError("loginError", "Please fill in all fields.");
        }

        setButtonLoading("loginSubmitBtn", true, "Login");

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    loginIdentifier, 
                    password
                })
            });

            const result = await response.json();

            if (!result.success) {
                if (result.needs_verification && result.email) {
                    enterOtpFlow(result.email, { autoResend: true, message: result.message });
                    return;
                }

                showError("loginError", result.message || "Login failed. Check your credentials.");
                return;
            }

            localStorage.setItem("unithrift_session_token", result.token);
            if (result.refresh_token) {
                localStorage.setItem("unithrift_refresh_token", result.refresh_token);
            }
            
            showStatus("✅ " + (result.message || "Logged in! Redirecting..."));

            setTimeout(() => {
                window.location.href = "/marketplace";
            }, 800);

        } catch (err) {
            console.error("Login error:", err);
            showError("loginError", "Network error. Please try again.");
        } finally {
            setButtonLoading("loginSubmitBtn", false, "Login");
        }
    });
}

// ======================================
// SIGNUP
// ======================================
if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearMessages();

        const username = document.getElementById("signupUsername").value.trim();
        const email    = document.getElementById("signupEmail").value.trim();
        const password = document.getElementById("signupPassword").value;
        const confirm  = document.getElementById("signupConfirm").value;
        const turnstileToken = (window.turnstile && turnstileWidgetId !== null) ? turnstile.getResponse(turnstileWidgetId) : "";

        if (!username || !email || !password || !confirm) {
            return showError("signupError", "Please fill in all fields.");
        }

        if (username.length < 3) {
            return showError("signupError", "Username must be at least 3 characters.");
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return showError("signupError", "Username can only contain letters, numbers, and underscores.");
        }

        if (password.length < 6) {
            return showError("signupError", "Password must be at least 6 characters.");
        }

        if (password !== confirm) {
            return showError("signupError", "Passwords do not match.");
        }

        if (!turnstileToken) {
            return showError("signupError", "Please complete the security check.");
        }

        setButtonLoading("signupSubmitBtn", true, "Create Account");

        try {
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    username, 
                    email, 
                    password,
                    'cf-turnstile-response': turnstileToken
                })
            });

            const result = await response.json();

            if (!result.success) {
                if (window.turnstile && turnstileWidgetId !== null) turnstile.reset(turnstileWidgetId);
                showError("signupError", result.message || "Signup failed. Please try again.");
                return;
            }

            showStatus("✅ " + (result.message || "Account created! Check your email for a code."));

            // Remember the username so the login form is prefilled after verification
            pendingSignupUsername = username;

            setTimeout(() => {
                enterOtpFlow(email, { autoResend: false });
            }, 900);

        } catch (err) {
            console.error("Signup error:", err);
            if (window.turnstile && turnstileWidgetId !== null) turnstile.reset(turnstileWidgetId);
            showError("signupError", "Network error. Please try again.");
        } finally {
            setButtonLoading("signupSubmitBtn", false, "Create Account");
        }
    });
}

// ======================================
// VERIFY OTP
// ======================================
const otpBoxes         = Array.from(document.querySelectorAll(".otp-box"));
const otpEmailDisplay  = document.getElementById("otpEmailDisplay");
const otpSubmitBtn     = document.getElementById("otpSubmitBtn");
const otpResendBtn     = document.getElementById("otpResendBtn");
const otpResendIdle    = document.getElementById("otpResendIdle");
const otpResendTimerEl = document.getElementById("otpResendTimer");
const otpBackBtn       = document.getElementById("otpBackBtn");

let otpPendingEmail  = null;
let otpResendTimerId = null;
const OTP_RESEND_COOLDOWN = 45; // seconds

function otpCode() {
    return otpBoxes.map(b => b.value).join("");
}

function clearOtpBoxes(focusFirst = true) {
    otpBoxes.forEach(b => { b.value = ""; b.classList.remove("otp-box-error"); });
    if (focusFirst && otpBoxes[0]) otpBoxes[0].focus();
}

function flashOtpError(message) {
    showError("otpError", message);
    otpBoxes.forEach(b => b.classList.add("otp-box-error"));
    setTimeout(() => otpBoxes.forEach(b => b.classList.remove("otp-box-error")), 400);
}

// Per-box typing: digits only, auto-advance, backspace steps back
otpBoxes.forEach((box, i) => {
    box.addEventListener("input", () => {
        box.value = box.value.replace(/[^0-9]/g, "").slice(0, 1);
        box.classList.remove("otp-box-error");
        if (box.value && i < otpBoxes.length - 1) {
            otpBoxes[i + 1].focus();
        }
        if (otpCode().length === otpBoxes.length) {
            submitOtp();
        }
    });

    box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && i > 0) {
            otpBoxes[i - 1].focus();
        }
    });

    // Pasting a full code into any box distributes it across all boxes
    box.addEventListener("paste", (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
        if (!pasted) return;

        const digits = pasted.slice(0, otpBoxes.length).split("");
        digits.forEach((d, idx) => { if (otpBoxes[idx]) otpBoxes[idx].value = d; });

        const nextEmpty = otpBoxes.findIndex(b => !b.value);
        (nextEmpty === -1 ? otpBoxes[otpBoxes.length - 1] : otpBoxes[nextEmpty]).focus();

        if (otpCode().length === otpBoxes.length) {
            submitOtp();
        }
    });
});

async function submitOtp() {
    const code = otpCode();
    if (code.length !== otpBoxes.length || !otpPendingEmail) {
        return flashOtpError("Please enter the full 6-digit code.");
    }

    setButtonLoading("otpSubmitBtn", true, "Verify Email");
    document.getElementById("otpError").style.display = "none";

    try {
        const response = await fetch('/api/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: otpPendingEmail, otp: code })
        });
        const result = await response.json();

        if (!result.success) {
            flashOtpError(result.message || "Incorrect code. Please try again.");
            clearOtpBoxes();
            return;
        }

        stopOtpResendTimer();
        showStatus("✅ " + (result.message || "Email verified! You can now log in."));

        setTimeout(() => {
            showForm("login");
            const loginIdInput = document.getElementById("loginIdentifier");
            if (loginIdInput) loginIdInput.value = pendingSignupUsername || otpPendingEmail || "";
            pendingSignupUsername = null;
            otpPendingEmail = null;
            clearOtpBoxes(false);
        }, 1200);

    } catch (err) {
        console.error("OTP verification error:", err);
        flashOtpError("Network error. Please try again.");
    } finally {
        setButtonLoading("otpSubmitBtn", false, "Verify Email");
    }
}

if (otpForm) {
    otpForm.addEventListener("submit", (e) => {
        e.preventDefault();
        submitOtp();
    });
}

function startOtpResendTimer(seconds = OTP_RESEND_COOLDOWN) {
    stopOtpResendTimer();
    let remaining = seconds;

    const tick = () => {
        if (otpResendIdle) otpResendIdle.style.display = "none";
        if (otpResendTimerEl) {
            otpResendTimerEl.style.display = "inline";
            otpResendTimerEl.textContent = `Resend code in ${remaining}s`;
        }
        if (remaining <= 0) {
            stopOtpResendTimer();
            return;
        }
        remaining--;
    };

    tick();
    otpResendTimerId = setInterval(tick, 1000);
}

function stopOtpResendTimer() {
    if (otpResendTimerId) {
        clearInterval(otpResendTimerId);
        otpResendTimerId = null;
    }
    if (otpResendTimerEl) otpResendTimerEl.style.display = "none";
    if (otpResendIdle) otpResendIdle.style.display = "inline";
}

async function requestOtpResend() {
    if (!otpPendingEmail) return;
    try {
        const response = await fetch('/api/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: otpPendingEmail })
        });
        const result = await response.json();

        if (!result.success) {
            flashOtpError(result.message || "Could not resend code. Please try again shortly.");
            return;
        }

        clearOtpBoxes();
        showStatus("✅ " + (result.message || "A new code has been sent."));
        startOtpResendTimer();
    } catch (err) {
        console.error("Resend OTP error:", err);
        flashOtpError("Network error. Please try again.");
    }
}

if (otpResendBtn) {
    otpResendBtn.addEventListener("click", (e) => {
        e.preventDefault();
        requestOtpResend();
    });
}

if (otpBackBtn) {
    otpBackBtn.addEventListener("click", (e) => {
        e.preventDefault();
        stopOtpResendTimer();
        otpPendingEmail = null;
        clearOtpBoxes(false);
        showForm("login");
    });
}

// Switches to the OTP screen for a given email. `autoResend` triggers a fresh
// code (e.g. when a login attempt reveals the account still isn't verified);
// signup already sent one, so it just starts the cooldown instead.
function enterOtpFlow(email, { autoResend = false, message = null } = {}) {
    otpPendingEmail = email;
    if (otpEmailDisplay) otpEmailDisplay.textContent = email;
    showForm("otp");
    clearOtpBoxes();

    if (message) showStatus(message, false);

    if (autoResend) {
        requestOtpResend();
    } else {
        startOtpResendTimer();
    }
}

// ======================================
// GOOGLE LOGIN
// ======================================
const googleLoginBtn = document.getElementById("googleLoginBtn");
if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", async () => {
        try {
            const response = await fetch('/api/auth/google', { method: 'POST' });
            const result   = await response.json();

            if (!result.success || !result.url) {
                throw new Error(result.message || "Google auth failed.");
            }

            window.location.href = result.url;

        } catch (err) {
            console.error("Google auth error:", err);
            showStatus("❌ Google login failed. Please try again.", false);
        }
    });
}

// ======================================
// AUTO-REDIRECT ENGINE
// ======================================
(async function checkExistingSession() {
    const token = localStorage.getItem("unithrift_session_token");
    if (!token) return;

    try {
        const response = await fetch('/api/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || !response.ok) {
            console.warn("Session token validation failed or returned 401. Clearing tracking cache...");
            localStorage.removeItem("unithrift_session_token");
            localStorage.removeItem("unithrift_refresh_token");
            return;
        }

        const result = await response.json();
        if (result.success) {
            console.log("🚀 Valid session detected. Forwarding to application context...");
            window.location.href = "/marketplace";
        } else {
            localStorage.removeItem("unithrift_session_token");
            localStorage.removeItem("unithrift_refresh_token");
        }
    } catch (err) {
        console.error("Session intercept verification offline:", err);
    }
})();