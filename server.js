require('dotenv').config();

const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const multer     = require('multer');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require("@google/genai");
const { generateOTP, hashOTP, verifyOTP, createExpiry, isExpired } = require('./services/otpService');
const { sendVerificationOTP } = require('./services/emailservice');

const app    = express();
const PORT   = process.env.PORT || 3000;
const DISABLE_TURNSTILE = true; // Set to false before deployment
// =========================================================================
// 1. CONFIG — all secrets from .env
// =========================================================================
const SUPABASE_URL      = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_KEY?.trim();
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim(); // safe to expose to the browser
const JWT_SECRET   = process.env.SUPABASE_JWT_SECRET?.trim();
const APP_URL      = process.env.APP_URL?.trim() || "http://localhost:3000";
const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY?.trim();
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_KEY || !JWT_SECRET) {
    console.error("❌ Missing required environment variables. Check your .env file.");
    console.error("   SUPABASE_URL:               ", !!SUPABASE_URL);
    console.error("   SUPABASE_SERVICE_KEY:  ", !!SUPABASE_KEY);
    console.error("   SUPABASE_JWT_SECRET:        ", !!JWT_SECRET);
    process.exit(1);
}
const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);
const supabaseAuth = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);
const GEMINI_MODEL = "gemini-2.5-flash";
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function askGemini(parts) {
    const response = await genAI.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts }]
    });
    return response.text || '';
}

function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found in Gemini response');
    return JSON.parse(match[0]);
}
async function verifyProductWithAI(title, description, imageUrls) {
    try {
        const mainImageResp = await fetch(imageUrls[0]);
        if (!mainImageResp.ok) throw new Error(`Could not fetch product image (${mainImageResp.status})`);
        const arrayBuffer = await mainImageResp.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString("base64");
        const mimeType = mainImageResp.headers.get('content-type') || 'image/jpeg';

        const prompt = `
            You are an expert product moderator for a university marketplace called UniThrift.
            Analyze this product listing:
            Title: ${title}
            Description: ${description}

            Task:
            1. Verify if the image shows a real, physical product.
            2. Check if the product is appropriate for a university (no weapons, drugs, or illegal items).
            3. Confirm if the title/description matches the image.
            
            Return ONLY a JSON object in this format:
            {"verified": boolean, "reason": "short explanation", "confidence": 0-1}
        `;

        const responseText = await askGemini([
            { text: prompt },
            { inlineData: { data: base64Data, mimeType } }
        ]);
        const result = extractJson(responseText);
        if (typeof result.verified !== 'boolean') throw new Error('Malformed AI response');
        return result;
    } catch (error) {
        console.error("Gemini AI Error:", error.message);
        return { verified: false, reason: 'AI moderation is temporarily unavailable. Please try submitting again in a moment.' };
    }
}
async function generateProductInsights(product, reviews) {
    try {
        const reviewsText = (reviews && reviews.length > 0)
            ? reviews.map(r => `- ${r.rating}/5: "${(r.review_text || '').slice(0, 300)}"`).join('\n')
            : 'No reviews yet.';

        const prompt = `You are an AI assistant for UniThrift, a campus marketplace in India. Analyze this product listing and its reviews.

Product Title: ${product.title}
Category: ${product.category}
Condition: ${product.condition}
Price: ₹${product.price}
Description: ${product.description}

Reviews:
${reviewsText}

Task:
1. Give a short assessment of the product itself (is the description reasonable for the stated price/condition, anything a buyer should note).
2. Analyze the reviews: overall sentiment, and any recurring praise or complaints. If there are no reviews, say so plainly.
3. List 2-4 short, concrete key points a buyer should know before purchasing.
4. Give a one-word recommendation: "Positive", "Neutral", or "Caution".

Return ONLY JSON, no markdown, in this exact format:
{"product_summary": "...", "review_summary": "...", "key_points": ["...", "..."], "recommendation": "Positive|Neutral|Caution"}`;

        const text = await askGemini([{ text: prompt }]);
        return extractJson(text);
    } catch (err) {
        console.error('Gemini product insights error:', err.message);
        return {
            product_summary: 'AI analysis is temporarily unavailable for this product.',
            review_summary: (reviews && reviews.length) ? `${reviews.length} review(s) on file.` : 'No reviews yet.',
            key_points: [],
            recommendation: 'Neutral',
            ai_unavailable: true
        };
    }
}
async function createNotification(userId, message, type = 'info', referenceId = null) {
    const { error } = await supabase.from('notifications').insert({
        user_id: userId, message, type, reference_id: referenceId, read: false
    });
    if (error) console.error('createNotification error:', error.message);
}
async function verifyTurnstile(token, remoteIp) {
    if (!TURNSTILE_SECRET_KEY) {
        console.error('TURNSTILE_SECRET_KEY is not configured.');
        return false;
    }
    if (!token || typeof token !== 'string') return false;

    try {
        const body = new URLSearchParams();
        body.append('secret', TURNSTILE_SECRET_KEY);
        body.append('response', token);
        if (remoteIp) body.append('remoteip', remoteIp);

        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body
        });
        const result = await verifyRes.json();
        return result.success === true;
    } catch (err) {
        console.error('Turnstile verification request failed:', err.message);
        return false;
    }
}
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_DOC_TYPES   = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];

function imageOnlyFilter(req, file, cb) {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, and WebP images are allowed.'), false);
    }
}

function docOrImageFilter(req, file, cb) {
    if (ALLOWED_DOC_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, WebP, and PDF files are allowed.'), false);
    }
}

const uploadImage = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },   // 5 MB for avatars/product images
    fileFilter: imageOnlyFilter
});

const uploadDoc = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 15 * 1024 * 1024 },  // 15 MB for ID/PAN docs
    fileFilter: docOrImageFilter
});
// 3. AUTH HELPER — auto-refreshes expired tokens via X-Refresh-Token header
class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
        this.status = 401;
    }
}

async function getUserFromToken(req) {
    const authHeader = req.headers['authorization'] || '';
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer')
        throw new AuthError('No token provided');
    const token = parts[1].trim();
    if (!token) throw new AuthError('No token provided');

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (data?.user && !error)
        return { id: data.user.id, email: data.user.email };
    const refreshToken = (req.headers['x-refresh-token'] || '').trim();
    if (!refreshToken) {
        console.error('Supabase getUser failed:', error?.message);
        throw new AuthError('Session expired. Please log in again.');
    }

    const { data: refreshData, error: refreshError } = await supabaseAuth.auth.refreshSession({
        refresh_token: refreshToken
    });

    if (refreshError || !refreshData?.user) {
        console.error('Token refresh failed:', refreshError?.message);
        throw new AuthError('Session expired. Please log in again.');
    }
    req._newAccessToken  = refreshData.session.access_token;
    req._newRefreshToken = refreshData.session.refresh_token;

    return { id: refreshData.user.id, email: refreshData.user.email };
}
async function requireAdmin(req) {
    const user = await getUserFromToken(req);
    const { data: profile, error } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!profile?.is_admin) {
        const e = new Error('Admin access required');
        e.status = 403;
        throw e;
    }
    return user;
}
function sanitizeString(str, maxLength = 500) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLength);
}

function sanitizeNumber(val) {
    const n = Number(val);
    return isNaN(n) || n < 0 ? null : n;
}
// 5. SECURITY MIDDLEWARE
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors({
    origin: APP_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Refresh-Token'],
    exposedHeaders: ['X-New-Access-Token', 'X-New-Refresh-Token']
}));

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many login attempts. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many accounts created from this IP. Try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false
});

const otpVerifyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many verification attempts. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const otpResendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: { success: false, message: 'Too many code requests. Please wait a few minutes before trying again.' },
    standardHeaders: true,
    legacyHeaders: false
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many upload requests. Please slow down.' }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { success: false, message: 'Too many requests. Please slow down.' }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/api/', generalLimiter);
app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        if (req._newAccessToken) {
            res.setHeader('X-New-Access-Token',  req._newAccessToken);
            res.setHeader('X-New-Refresh-Token', req._newRefreshToken);
        }
        return originalJson(body);
    };
    next();
});

app.use('/css',    express.static(path.join(__dirname, 'css')));
app.use('/js',     express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
// 6. FRONTEND ROUTES
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/',            (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html',  (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/homepage',    (req, res) => res.sendFile(path.join(__dirname, 'homepage.html')));
app.get('/marketplace', (req, res) => res.sendFile(path.join(__dirname, 'marketplace.html')));
app.get('/product',     (req, res) => sendWithSupabaseConfig(res, 'product.html'));
app.get('/product.html',(req, res) => sendWithSupabaseConfig(res, 'product.html'));
app.get('/profile',     (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/admin',       (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/checkout', (req, res) => {res.sendFile(path.join(__dirname, 'checkout.html'));});
app.get('/sell',        (req, res) => res.sendFile(path.join(__dirname, 'sell.html')));
app.get('/about',       (req, res) => res.sendFile(path.join(__dirname, 'about.html')));
app.get('/terms',       (req, res) => res.sendFile(path.join(__dirname, 'terms.html')));
app.get('/privacy',     (req, res) => res.sendFile(path.join(__dirname, 'privacy.html')));
app.get('/help',        (req, res) => res.sendFile(path.join(__dirname, 'help.html')));

function sendWithSupabaseConfig(res, fileName) {
    fs.readFile(path.join(__dirname, fileName), 'utf8', (err, html) => {
        if (err) return res.status(500).send('Failed to load page');
        const injected = html.replace(
            '</head>',
            `<script>
                window.__SUPABASE_URL__ = ${JSON.stringify(SUPABASE_URL || '')};
                window.__SUPABASE_ANON__ = ${JSON.stringify(SUPABASE_ANON_KEY || '')};
            </script></head>`
        );
        res.send(injected);
    });
}
app.get('/updates', (req, res) => sendWithSupabaseConfig(res, 'updates.html'));
// 7. API ROUTES--
app.post('/api/auth/google', async (req, res) => {
    try {
        const { data, error } = await supabaseAuth.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${APP_URL}/marketplace` }
        });
        if (error) throw error;
        return res.json({ success: true, url: data.url });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- REFRESH TOKEN ----
app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ success: false, message: 'No refresh token' });
    try {
        const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });
        if (error || !data.session) throw new Error(error?.message || 'Refresh failed');
        return res.json({
            success:       true,
            access_token:  data.session.access_token,
            refresh_token: data.session.refresh_token
        });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
});

// ---- SIGNUP ----
app.post('/api/signup', signupLimiter, async (req, res) => {
    let { username, email, password } = req.body;
    const turnstileToken = req.body['cf-turnstile-response'];

    if (!username || !email || !password)
        return res.status(400).json({ success: false, message: 'All fields are required.' });

    const humanVerified = await verifyTurnstile(turnstileToken, req.ip);
    if (!humanVerified)
        return res.status(400).json({ success: false, message: 'Bot verification failed. Please try again.' });

    username = sanitizeString(username, 30).toLowerCase();
    email    = sanitizeString(email, 254).toLowerCase();
    password = sanitizeString(password, 128);

    if (username.length < 3)
        return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
    if (!/^[a-zA-Z0-9_]+$/.test(username))
        return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers, and underscores.' });
    if (password.length < 6)
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });

    try {
        const { data: signUpData, error } = await supabaseAuth.auth.signUp({
            email,
            password,
            options: { data: { username } }
        });
        if (error) throw error;

        const userId = signUpData?.user?.id;
        
     try {
    console.log("========== SIGNUP OTP ==========");
    console.log("User ID:", userId);
    console.log("Email:", email);

    await issueSignupOtp(email, userId, username);

    console.log("OTP issued successfully.");
} catch (emailErr) {
    console.error("========== OTP ERROR ==========");
    console.error(emailErr);
    console.error("===============================");

    return res.status(201).json({
        success: true,
        message: 'Account created, but we could not send the verification email. Please use "Resend code" on the verification page.',
        email
    });
}

        return res.status(201).json({
            success: true,
            message: 'Account created! Check your email for a 6-digit verification code.',
            email
        });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
});
async function issueSignupOtp(email, userId, username) {
    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const expiresAt = createExpiry(10);

    console.log("Creating OTP:");
    console.log({
        userId,
        email,
        otpHash,
        expiresAt
    });

    await supabase
        .from("email_verifications")
        .delete()
        .eq("email", email);

    const { error: otpError } = await supabase
        .from("email_verifications")
        .insert({
            email,
            user_id: userId,
            otp_hash: otpHash,
            expires_at: expiresAt,
            attempts: 0
        });

    if (otpError) {
        console.error("FULL INSERT ERROR:");
        console.error(otpError);
        throw otpError;
    }

    console.log("OTP saved to database.");

    await sendVerificationOTP(email, otp);

    console.log("OTP email sent.");
}
// ---- VERIFY SIGNUP OTP ----
async function handleVerifyEmail(req, res) {
    let { email, otp } = req.body;
    if (!email || !otp)
        return res.status(400).json({ success: false, message: 'Email and code are required.' });

    email = sanitizeString(email, 254).toLowerCase();
    otp   = sanitizeString(otp, 6);

    try {
        const { data: record, error } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('email', email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) throw error;

        if (!record)
            return res.status(400).json({ success: false, message: 'No pending verification found. Please sign up again or request a new code.' });

        if (isExpired(record.expires_at)) {
            await supabase.from('email_verifications').delete().eq('id', record.id);
            return res.status(400).json({ success: false, message: 'This code has expired. Please request a new one.' });
        }

        if (record.attempts >= 5) {
            await supabase.from('email_verifications').delete().eq('id', record.id);
            return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' });
        }

        if (!verifyOTP(otp, record.otp_hash)) {
            await supabase.from('email_verifications').update({ attempts: record.attempts + 1 }).eq('id', record.id);
            return res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });
        }
        const { error: confirmError } = await supabase.auth.admin.updateUserById(record.user_id, {
            email_confirm: true
        });
        if (confirmError) throw confirmError;
        await supabase.from('email_verifications').delete().eq('id', record.id);

        return res.json({ success: true, message: 'Email verified! You can now log in.' });
    } catch (err) {
        console.error('OTP verification error:', err.message);
        return res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
    }
}
app.post('/api/verify-email', otpVerifyLimiter, handleVerifyEmail);
app.post('/api/verify-otp',   otpVerifyLimiter, handleVerifyEmail); // legacy alias

// ---- RESEND SIGNUP OTP ----
app.post('/api/resend-otp', otpResendLimiter, async (req, res) => {
    let { email } = req.body;
    if (!email)
        return res.status(400).json({ success: false, message: 'Email is required.' });

    email = sanitizeString(email, 254).toLowerCase();

    try {
        const { data: existing, error: findError } = await supabase
            .from('email_verifications')
            .select('*')
            .eq('email', email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (findError) throw findError;

        if (!existing)
            return res.status(400).json({ success: false, message: 'No pending verification found for this email.' });

        await issueSignupOtp(email, existing.user_id);

        return res.json({ success: true, message: 'A new verification code has been sent to your email.' });
    } catch (err) {
        console.error('Resend OTP error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not resend code. Please try again in a few minutes.' });
    }
});

// ---- LOGIN ----
app.post('/api/login', loginLimiter, async (req, res) => {
    let { loginIdentifier, password } = req.body;
    const turnstileToken = req.body['cf-turnstile-response'];

    if (!loginIdentifier || !password)
        return res.status(400).json({ success: false, message: 'All fields are required.' });

    const humanVerified = await verifyTurnstile(turnstileToken, req.ip);
    if (!humanVerified)
        return res.status(400).json({ success: false, message: 'Bot verification failed. Please try again.' });

    let targetEmail = sanitizeString(loginIdentifier, 254).toLowerCase();
    password        = sanitizeString(password, 128);

    try {
        if (!targetEmail.includes('@')) {
            const { data: emailResult, error: searchError } = await supabase
                .rpc('get_email_by_username', { search_username: targetEmail });
            if (searchError || !emailResult)
                return res.status(400).json({ success: false, message: 'No account found matching that username.' });
            targetEmail = emailResult;
        }
        const { data, error } = await supabaseAuth.auth.signInWithPassword({ email: targetEmail, password });

        if (error) {
            if (/confirm/i.test(error.message || '')) {
                return res.status(403).json({
                    success: false,
                    needs_verification: true,
                    email: targetEmail,
                    message: 'Please verify your email before logging in.'
                });
            }
            throw error;
        }
        if (!data.user?.email_confirmed_at) {
            if (data.session?.access_token) {
                await supabase.auth.admin.signOut(data.session.access_token).catch(() => {});
            }
            return res.status(403).json({
                success: false,
                needs_verification: true,
                email: targetEmail,
                message: 'Please verify your email before logging in.'
            });
        }

        const token         = data.session?.access_token;
        const refresh_token = data.session?.refresh_token;
        if (!token) throw new Error('Login succeeded but no session token was returned.');
        return res.json({ success: true, message: 'Welcome back to UniThrift!', token, refresh_token });
    } catch (error) {
        return res.status(400).json({ success: false, message: 'Invalid credentials. Please try again.' });
    }
});

// ---- GET PROFILE ----
app.get('/api/profile', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { data: profile, error } = await supabase
            .from('profiles').select('*').eq('id', user.id).maybeSingle();
        if (error) throw error;
        return res.json({
            success:  true,
            username: profile?.username || user.email?.split('@')[0] || 'User',
            email:    user.email,
            profile:  profile || {}
        });
    } catch (error) {
        return res.status(401).json({ success: false, message: error.message });
    }
});

// ---- SAVE PROFILE ----
app.post('/api/profile/save', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const college_name  = sanitizeString(req.body.college_name  || '', 200);
        const location_name = sanitizeString(req.body.location_name || '', 200);
        const address       = sanitizeString(req.body.address       || '', 500);

        const { error } = await supabase
            .from('profiles')
            .upsert({ id: user.id, college_name, location_name, address, updated_at: new Date() });
        if (error) throw error;
        return res.json({ success: true });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- AVATAR UPLOAD ----
app.post('/api/profile/avatar', uploadLimiter, uploadImage.single('avatar'), async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const ext      = req.file.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `${user.id}_avatar_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
        const { error: updateError } = await supabase
            .from('profiles')
            .upsert({ id: user.id, avatar_url: publicUrl, updated_at: new Date() });
        if (updateError) throw updateError;

        return res.json({ success: true, url: publicUrl });
    } catch (error) {
        console.error('Avatar upload error:', error.message);
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- STUDENT VERIFICATION UPLOAD ----
app.post('/api/profile/verify/student', uploadLimiter, uploadDoc.single('collegeId'), async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const ext      = req.file.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `${user.id}_college_id_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
            .from('verification')
            .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('verification').getPublicUrl(fileName);
        const { data, error } = await supabase
  .from("profiles")
  .upsert({
    id: user.id,
    college_id_url: publicUrl,
    student_verified: false,
    updated_at: new Date()
  })
  .select();

console.log("UPSERT DATA:", data);
console.log("UPSERT ERROR:", error);
        if (error) throw error;

        await createNotification(user.id,
            "Your College ID has been submitted for review. We'll notify you once verified.", 'system');

        return res.json({ success: true, message: 'College ID submitted. Verification under review.', url: publicUrl });
    } catch (error) {
        console.error('Student verification error:', error.message);
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- SELLER VERIFICATION UPLOAD ----
app.post('/api/profile/verify/seller', uploadLimiter, uploadDoc.fields([
    { name: 'panCard',   maxCount: 1 },
    { name: 'paymentQr', maxCount: 1 }
]), async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        if (!req.files?.panCard || !req.files?.paymentQr)
            throw new Error('Both PAN Card and Payment QR are required');

        const panFile = req.files.panCard[0];
        const qrFile  = req.files.paymentQr[0];

        const panExt      = panFile.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const panFileName = `${user.id}_pan_${Date.now()}.${panExt}`;
        const { error: panError } = await supabase.storage
            .from('verification')
            .upload(panFileName, panFile.buffer, { contentType: panFile.mimetype, upsert: true });
        if (panError) throw panError;

        const qrExt      = qrFile.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const qrFileName = `${user.id}_qr_${Date.now()}.${qrExt}`;
        const { error: qrError } = await supabase.storage
            .from('verification')
            .upload(qrFileName, qrFile.buffer, { contentType: qrFile.mimetype, upsert: true });
        if (qrError) throw qrError;

        const { data: { publicUrl: panUrl } } = supabase.storage.from('verification').getPublicUrl(panFileName);
        const { data: { publicUrl: qrUrl  } } = supabase.storage.from('verification').getPublicUrl(qrFileName);

        const { error: updateError } = await supabase.from('profiles').upsert({
            id: user.id, pan_url: panUrl, payment_qr_url: qrUrl,
            seller_verified: false,
            updated_at: new Date()
        });
        if (updateError) throw updateError;

        await createNotification(user.id,
            "Your seller verification documents have been submitted. We'll notify you once approved.", 'system');

        return res.json({ success: true, message: 'Documents submitted. Seller verification under review.', pan_url: panUrl, qr_url: qrUrl });
    } catch (error) {
        console.error('Seller verification error:', error.message);
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- DELETE / RESET A VERIFICATION DOCUMENT ----
app.delete('/api/profile/verify/:type', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const type = req.params.type; // 'student' | 'pan' | 'qr'

        const fieldMap = {
            student: { urlField: 'college_id_url', extra: { student_verified: false } },
            pan:     { urlField: 'pan_url',         extra: { seller_verified: false } },
            qr:      { urlField: 'payment_qr_url',  extra: { seller_verified: false } }
        };
        const config = fieldMap[type];
        if (!config) return res.status(400).json({ success: false, message: 'Invalid document type' });

        const { data: profile, error: fetchError } = await supabase
            .from('profiles').select(config.urlField).eq('id', user.id).maybeSingle();
        if (fetchError) throw fetchError;

        const existingUrl = profile?.[config.urlField];
        if (existingUrl) {
            const fileName = existingUrl.split('/').pop();
            const { error: removeError } = await supabase.storage.from('verification').remove([fileName]);
            if (removeError) console.error('Storage remove error:', removeError.message);
        }

        const { error: updateError } = await supabase.from('profiles')
            .update({ [config.urlField]: null, ...config.extra, updated_at: new Date() })
            .eq('id', user.id);
        if (updateError) throw updateError;

        return res.json({ success: true, message: 'Document removed.' });
    } catch (error) {
        console.error('Delete verification doc error:', error.message);
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});
// ADMIN — MANUAL VERIFICATION REVIEW
-
app.get('/api/admin/check', async (req, res) => {
    try {
        await requireAdmin(req);
        return res.json({ success: true, isAdmin: true });
    } catch (error) {
        return res.json({ success: true, isAdmin: false });
    }
});
app.get('/api/admin/verifications', async (req, res) => {
    try {
        await requireAdmin(req);
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, college_id_url, student_verified, pan_url, payment_qr_url, seller_verified, updated_at')
            .or('and(college_id_url.not.is.null,student_verified.eq.false),and(pan_url.not.is.null,payment_qr_url.not.is.null,seller_verified.eq.false)');
        if (error) throw error;
        return res.json({ success: true, pending: data || [] });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});
app.post('/api/admin/verifications/:userId/:type/:action', async (req, res) => {
    try {
        const admin = await requireAdmin(req);
        const { userId, type, action } = req.params;
        if (!['student', 'seller'].includes(type) || !['approve', 'reject'].includes(action))
            return res.status(400).json({ success: false, message: 'Invalid type or action' });

        const verifiedField = type === 'student' ? 'student_verified' : 'seller_verified';
        const approve = action === 'approve';

        const update = {
            [verifiedField]: approve,
            updated_at: new Date(),
            [`${type}_reviewed_at`]: new Date(),
            [`${type}_reviewed_by`]: admin.id
        };
        if (!approve) {
            if (type === 'student') update.college_id_url = null;
            else { update.pan_url = null; update.payment_qr_url = null; }
        }

        const { error } = await supabase.from('profiles').update(update).eq('id', userId);
        if (error) throw error;

        await createNotification(userId,
            approve
                ? `Your ${type === 'student' ? 'student' : 'seller'} verification was approved!`
                : `Your ${type === 'student' ? 'student' : 'seller'} verification was rejected. Please re-upload a clearer document.`,
            'system');

        return res.json({ success: true });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- MY LISTINGS ----
app.get('/api/profile/my-listings', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { data: products, error: productError } = await supabase
            .from('products').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (productError) throw productError;

        const productIds = (products || []).map(p => p.id);
        let imageMap = {};
        if (productIds.length > 0) {
            const { data: images } = await supabase
                .from('product_images').select('product_id, image_url').in('product_id', productIds);
            (images || []).forEach(img => { if (!imageMap[img.product_id]) imageMap[img.product_id] = img.image_url; });
        }

        return res.json({
            success:  true,
            products: (products || []).map(p => ({
                ...p,
                image_url: imageMap[p.id] || 'https://placehold.co/600x400?text=UniThrift'
            }))
        });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- GET SELLER INFO ----
app.get('/api/user/:id', async (req, res) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles').select('*').eq('id', req.params.id).maybeSingle();
        if (error) throw error;
        if (!profile) return res.status(404).json({ success: false, message: 'Seller not found' });
        return res.json({ success: true, seller: profile });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- FETCH ALL PRODUCTS ----
app.get('/api/products', async (req, res) => {
    try {
        const { data: products, error: productError } = await supabase
            .from('products').select('*').order('created_at', { ascending: false });
        if (productError) throw productError;

        const safeProducts = products || [];
        if (safeProducts.length === 0) return res.json({ success: true, products: [] });

        const { data: images } = await supabase.from('product_images').select('product_id, image_url');
        let imageMap = {};
        (images || []).forEach(img => { if (!imageMap[img.product_id]) imageMap[img.product_id] = img.image_url; });

        return res.json({
            success:  true,
            products: safeProducts.map(p => ({
                ...p,
                image_url: imageMap[p.id] || 'https://placehold.co/600x400?text=UniThrift'
            }))
        });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- FETCH SINGLE PRODUCT ----
app.get('/api/products/:id', async (req, res) => {
    try {
        const { data: product, error } = await supabase
            .from('products').select('*').eq('id', req.params.id).single();
        if (error) throw error;
        return res.json({ success: true, product });
    } catch (error) {
        return res.status(404).json({ success: false, message: error.message });
    }
});

// ---- FETCH PRODUCT IMAGES ----
app.get('/api/products/:id/images', async (req, res) => {
    try {
        const { data: images, error } = await supabase
            .from('product_images').select('*').eq('product_id', req.params.id);
        if (error) throw error;
        return res.json({ success: true, images: images || [] });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- FETCH REVIEWS ----
app.get('/api/products/:id/reviews', async (req, res) => {
    try {
        const { data: reviews, error } = await supabase
            .from('reviews').select('*').eq('product_id', req.params.id).order('created_at', { ascending: true });
        if (error) throw error;
        return res.json({ success: true, reviews: reviews || [] });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- POST REVIEW ----
app.post('/api/products/:id/reviews', async (req, res) => {
    try {
        const user = await getUserFromToken(req);

        const rating      = sanitizeNumber(req.body.rating);
        const review_text = sanitizeString(req.body.review_text || '', 1000);

        if (!rating || rating < 1 || rating > 5)
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
        if (!review_text)
            return res.status(400).json({ success: false, message: 'Review text is required.' });

        const { data: insertedData, error } = await supabase
            .from('reviews')
            .insert([{ product_id: req.params.id, user_id: user.id, rating, review_text }])
            .select();
        if (error) throw error;
        return res.json({ success: true, review: insertedData?.[0] || null });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// ---- AI PRODUCT + REVIEW INSIGHTS ----
app.get('/api/products/:id/ai-insights', async (req, res) => {
    try {
        const { data: product, error: prodError } = await supabase
            .from('products').select('*').eq('id', req.params.id).single();
        if (prodError || !product) return res.status(404).json({ success: false, message: 'Product not found' });

        const { data: reviews } = await supabase
            .from('reviews').select('rating, review_text').eq('product_id', req.params.id);
        const reviewCount = (reviews || []).length;

        // Reuse a cached analysis if nothing has changed since it was generated
        if (product.ai_insights && product.ai_insights_review_count === reviewCount) {
            return res.json({ success: true, insights: product.ai_insights, cached: true });
        }

        const insights = await generateProductInsights(product, reviews);

        // Best-effort cache write — safe to skip if the columns don't exist yet
        try {
            await supabase.from('products')
                .update({ ai_insights: insights, ai_insights_review_count: reviewCount })
                .eq('id', product.id);
        } catch (cacheErr) {
            console.warn('AI insights cache write skipped:', cacheErr.message);
        }

        return res.json({ success: true, insights, cached: false });
    } catch (error) {
        console.error('AI insights route error:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to generate AI insights' });
    }
});

// ---- CREATE LISTING (WITH GEMINI MODERATION INTEGRATION) ----
app.post('/api/listings/create', async (req, res) => { //[cite: 1]
    try { //[cite: 1]
        const user = await getUserFromToken(req); //[cite: 1]

        const turnstileToken = req.body['cf-turnstile-response'];
        const humanVerified = await verifyTurnstile(turnstileToken, req.ip);
        if (!humanVerified)
            return res.status(400).json({ success: false, message: 'Bot verification failed. Please try again.' });

        // Map and sanitize all incoming parameters from your listing system
        const title           = sanitizeString(req.body.title           || '', 200); //[cite: 1]
        const category        = sanitizeString(req.body.category        || '', 100); //[cite: 1]
        const condition       = sanitizeString(req.body.condition       || '', 50); //[cite: 1]
        const description     = sanitizeString(req.body.description     || '', 2000); //[cite: 1]
        const payment_methods = sanitizeString(req.body.payment_methods || '', 200); //[cite: 1]
        const collection_point= sanitizeString(req.body.collection_point|| '', 300); //[cite: 1]
        const contact_no      = sanitizeString(req.body.contact_no      || '', 20); //[cite: 1]
        const delivery_date   = sanitizeString(req.body.delivery_date   || '', 20); //[cite: 1]
        const price           = sanitizeNumber(req.body.price); //[cite: 1]
        const image_urls      = Array.isArray(req.body.image_urls) ? req.body.image_urls : []; //[cite: 1]

        // 1. Basic Validation
        if (!title)    return res.status(400).json({ success: false, message: 'Title is required.' }); //[cite: 1]
        if (!category) return res.status(400).json({ success: false, message: 'Category is required.' }); //[cite: 1]
        if (!price)    return res.status(400).json({ success: false, message: 'Valid price is required.' }); //[cite: 1]
        if (image_urls.length === 0) //[cite: 1]
            return res.status(400).json({ success: false, message: 'At least one image is required.' }); //[cite: 1]

        // 2. TRIGGER GEMINI AI VERIFICATION[cite: 1]
        const aiResult = await verifyProductWithAI(title, description, image_urls); //[cite: 1]

        if (!aiResult.verified) { //[cite: 1]
            return res.status(400).json({  //[cite: 1]
                success: false,  //[cite: 1]
                message: `Product rejected by AI: ${aiResult.reason}`  //[cite: 1]
            }); //[cite: 1]
        } //[cite: 1]

        // 3. Proceed with existing DB logic if verified[cite: 1]
        const { data: product, error } = await supabase //[cite: 1]
            .from('products') //[cite: 1]
            .insert({  //[cite: 1]
                user_id: user.id,  //[cite: 1]
                title,  //[cite: 1]
                category,  //[cite: 1]
                price,  //[cite: 1]
                condition, //[cite: 1]
                description,  //[cite: 1]
                delivery_date, //[cite: 1]
                payment_methods, //[cite: 1]
                collection_point, //[cite: 1]
                contact_no, //[cite: 1]
                ai_verified: true, //[cite: 1]
                ai_score: aiResult.confidence  //[cite: 1]
            }) //[cite: 1]
            .select().single(); //[cite: 1]
        if (error) throw error; //[cite: 1]

        await supabase.from('product_images') //[cite: 1]
            .insert(image_urls.map(url => ({ product_id: product.id, image_url: url }))); //[cite: 1]

        return res.json({ success: true, product }); //[cite: 1]
    } catch (error) { //[cite: 1]
        return res.status(error.status || 500).json({ success: false, message: error.message }); //[cite: 1]
    } //[cite: 1]
}); //[cite: 1]

// ---- UPLOAD LISTING IMAGE ----
app.post('/api/listings/upload-image', uploadLimiter, async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { name, type, data } = req.body;

        if (!ALLOWED_IMAGE_TYPES.includes(type))
            return res.status(400).json({ success: false, message: 'Only JPEG, PNG, and WebP images are allowed.' });

        const buffer   = Buffer.from(data, 'base64');
        if (buffer.length > 5 * 1024 * 1024)
            return res.status(400).json({ success: false, message: 'Image must be under 5MB.' });

        const ext      = (name || 'image').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const fileName = `${user.id}_${Date.now()}.${ext}`;

        const { error } = await supabase.storage
            .from('product-images').upload(fileName, buffer, { contentType: type, upsert: false });
        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
        return res.json({ success: true, url: publicUrl });
    } catch (error) {
        return res.status(error.status || 500).json({ success: false, message: error.message });
    }
});

// =========================================================================
// 8. GLOBAL ERROR HANDLER — catches multer errors cleanly
// =========================================================================
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE')
            return res.status(400).json({ success: false, message: 'File is too large.' });
        return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next();
});

// =========================================================================
// GEOAPIFY LOCATION AUTOCOMPLETE ROUTES
// (kept server-side so the API key is never exposed to the browser)
// =========================================================================
app.get('/api/geoapify/autocomplete', async (req, res) => {
    try {
        const text = (req.query.text || '').trim();
        if (!text) return res.json({ success: true, results: [] });
        if (!GEOAPIFY_KEY) return res.status(500).json({ success: false, message: 'Geoapify not configured' });

        const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}` +
                    `&filter=countrycode:in&format=json&apiKey=${GEOAPIFY_KEY}`;

        const geoRes = await fetch(url);
        if (!geoRes.ok) throw new Error(`Geoapify error: ${geoRes.status}`);
        const data = await geoRes.json();

        const results = (data.results || []).map(r => ({
            formatted:   r.formatted,
            city:        r.city || r.county || '',
            state:       r.state || '',
            lat:         r.lat,
            lon:         r.lon,
            place_id:    r.place_id
        }));

        return res.json({ success: true, results });
    } catch (err) {
        console.error('Geoapify autocomplete error:', err.message);
        return res.status(500).json({ success: false, message: 'Autocomplete failed' });
    }
});

// =========================================================================
// NOTIFICATIONS ROUTES
// =========================================================================
app.get('/api/notifications', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { data, error } = await supabase
            .from('notifications').select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        return res.json({ success: true, notifications: data || [] });
    } catch (err) { return res.status(401).json({ success: false, message: err.message }); }
});

app.get('/api/notifications/unread-count', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { count, error } = await supabase
            .from('notifications').select('*', { count: 'exact', head: true })
            .eq('user_id', user.id).eq('read', false);
        if (error) throw error;
        return res.json({ success: true, count: count || 0 });
    } catch (err) { return res.status(401).json({ success: false, message: err.message }); }
});

app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { error } = await supabase.from('notifications')
            .update({ read: true }).eq('id', req.params.id).eq('user_id', user.id);
        if (error) throw error;
        return res.json({ success: true });
    } catch (err) { return res.status(401).json({ success: false, message: err.message }); }
});

app.post('/api/notifications/read-all', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { error } = await supabase.from('notifications')
            .update({ read: true }).eq('user_id', user.id).eq('read', false);
        if (error) throw error;
        return res.json({ success: true });
    } catch (err) { return res.status(401).json({ success: false, message: err.message }); }
});

// =========================================================================
// CHAT ROUTES
// =========================================================================
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'chat.html')));

// ---- GET OR CREATE CHAT ROOM ----
app.post('/api/chat/room', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { product_id } = req.body;
        if (!product_id) return res.status(400).json({ success: false, message: 'product_id required' });

        const { data: product, error: prodError } = await supabase
            .from('products').select('user_id').eq('id', product_id).single();
        if (prodError || !product) return res.status(404).json({ success: false, message: 'Product not found' });

        if (product.user_id === user.id)
            return res.status(400).json({ success: false, message: "You can't chat with yourself." });

        const { data: existing } = await supabase
            .from('chat_rooms').select('id')
            .eq('product_id', product_id).eq('buyer_id', user.id).maybeSingle();

        if (existing) return res.json({ success: true, room_id: existing.id });

        const { data: room, error: roomError } = await supabase
            .from('chat_rooms')
            .insert({ product_id, buyer_id: user.id, seller_id: product.user_id })
            .select().single();
        if (roomError) throw roomError;

        return res.json({ success: true, room_id: room.id });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// ---- GET ALL ROOMS FOR USER ----
app.get('/api/chat/rooms', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { data: rooms, error } = await supabase
            .from('chat_rooms')
            .select('id, created_at, product_id, products(title), buyer_id, seller_id')
            .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const enriched = (rooms || []).map(r => ({
            ...r,
            role: r.buyer_id === user.id ? 'Buyer' : 'Seller'
        }));
        return res.json({ success: true, rooms: enriched });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// ---- GET MESSAGES ----
app.get('/api/chat/rooms/:room_id/messages', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { data: room } = await supabase
            .from('chat_rooms').select('buyer_id, seller_id').eq('id', req.params.room_id).single();
        if (!room || (room.buyer_id !== user.id && room.seller_id !== user.id))
            return res.status(403).json({ success: false, message: 'Access denied' });

        const { data: messages, error } = await supabase
            .from('messages').select('*').eq('room_id', req.params.room_id)
            .order('created_at', { ascending: true });
        if (error) throw error;
        return res.json({ success: true, messages: messages || [] });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// ---- SEND MESSAGE ----
app.post('/api/chat/rooms/:room_id/messages', async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { message_text } = req.body;
        if (!message_text?.trim())
            return res.status(400).json({ success: false, message: 'Message cannot be empty' });

        const { data: room } = await supabase
            .from('chat_rooms').select('buyer_id, seller_id').eq('id', req.params.room_id).single();
        if (!room || (room.buyer_id !== user.id && room.seller_id !== user.id))
            return res.status(403).json({ success: false, message: 'Access denied' });

        const { data: msg, error } = await supabase
            .from('messages')
            .insert({ room_id: req.params.room_id, sender_id: user.id, message_text: message_text.trim() })
            .select().single();
        if (error) throw error;
        return res.json({ success: true, message: msg });
    } catch (err) {
        return res.status(err.status || 500).json({ success: false, message: err.message });
    }
});

// START SERVER (Keep this at the very bottom)
// =========================================================================
app.listen(PORT, () => {
    console.log(`🚀 UniThrift running at http://localhost:${PORT}`);
});