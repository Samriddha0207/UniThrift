require('dotenv').config();

const express    = require('express');
const path       = require('path');
const multer     = require('multer');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');

const app    = express();
const PORT   = process.env.PORT || 3000;

// =========================================================================
// 1. CONFIG — all secrets from .env
// =========================================================================
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY?.trim();
const JWT_SECRET   = process.env.SUPABASE_JWT_SECRET?.trim(); // .trim() guards against accidental spaces in .env
const APP_URL      = process.env.APP_URL?.trim() || 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_KEY || !JWT_SECRET) {
    console.error('❌ Missing required environment variables. Check your .env file.');
    console.error('   SUPABASE_URL:        ', !!SUPABASE_URL);
    console.error('   SUPABASE_ANON_KEY:   ', !!SUPABASE_KEY);
    console.error('   SUPABASE_JWT_SECRET: ', !!JWT_SECRET);
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// =========================================================================
// 2. MULTER — file size limit + MIME type whitelist
// =========================================================================
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

// =========================================================================
// 3. AUTH HELPER — uses Supabase to verify ES256 tokens
//    Newer Supabase projects use ES256 (asymmetric) not HS256, so local
//    jwt.verify() with the JWT secret won't work. We call supabase.auth.getUser()
//    which handles all algorithm types correctly.
// =========================================================================
async function getUserFromToken(req) {
    const authHeader = req.headers['authorization'] || '';
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer')
        throw new Error('No token provided');
    const token = parts[1].trim();
    if (!token) throw new Error('No token provided');

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
        console.error('Supabase getUser failed:', error?.message);
        throw new Error('Invalid or expired session token');
    }
    return { id: data.user.id, email: data.user.email };
}

// =========================================================================
// 4. INPUT SANITIZATION HELPERS
// =========================================================================
function sanitizeString(str, maxLength = 500) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLength);
}

function sanitizeNumber(val) {
    const n = Number(val);
    return isNaN(n) || n < 0 ? null : n;
}

// =========================================================================
// 5. SECURITY MIDDLEWARE
// =========================================================================

// Helmet — sets secure HTTP headers
app.use(helmet({
    contentSecurityPolicy: false // keep off so your CDN fonts/scripts still load
}));

// CORS — only allow your own app origin
app.use(cors({
    origin: APP_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiters
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { success: false, message: 'Too many login attempts. Please wait 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false
});

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { success: false, message: 'Too many accounts created from this IP. Try again in an hour.' },
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

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Apply general limiter to all API routes
app.use('/api/', generalLimiter);

// Static files
app.use('/css',    express.static(path.join(__dirname, 'css')));
app.use('/js',     express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// =========================================================================
// 6. FRONTEND ROUTES
// =========================================================================
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.get('/',            (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html',  (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/homepage',    (req, res) => res.sendFile(path.join(__dirname, 'homepage.html')));
app.get('/marketplace', (req, res) => res.sendFile(path.join(__dirname, 'marketplace.html')));
app.get('/product',     (req, res) => res.sendFile(path.join(__dirname, 'product.html')));
app.get('/profile',     (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/sell',        (req, res) => res.sendFile(path.join(__dirname, 'sell.html')));

// =========================================================================
// 7. API ROUTES
// =========================================================================

// ---- GOOGLE OAUTH ----
app.post('/api/auth/google', async (req, res) => {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${APP_URL}/marketplace` }
        });
        if (error) throw error;
        return res.json({ success: true, url: data.url });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ---- REFRESH TOKEN ----
app.post('/api/auth/refresh', async (req, res) => {
    const { refresh_token } = req.body;
    if (!refresh_token) return res.status(400).json({ success: false, message: 'No refresh token' });
    try {
        const { data, error } = await supabase.auth.refreshSession({ refresh_token });
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

    // Validate
    if (!username || !email || !password)
        return res.status(400).json({ success: false, message: 'All fields are required.' });

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
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { username } }
        });
        if (error) throw error;
        return res.status(201).json({ success: true, message: 'Registration successful! You can now log in.' });
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
});

// ---- LOGIN ----
app.post('/api/login', loginLimiter, async (req, res) => {
    let { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password)
        return res.status(400).json({ success: false, message: 'All fields are required.' });

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
        const { data, error } = await supabase.auth.signInWithPassword({ email: targetEmail, password });
        if (error) throw error;
        const token         = data.session?.access_token;
        const refresh_token = data.session?.refresh_token;
        if (!token) throw new Error('Login succeeded but no session token was returned.');
        return res.json({ success: true, message: 'Welcome back to UniThrift!', token, refresh_token });
    } catch (error) {
        // Generic message — don't reveal whether email or password was wrong
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
        return res.status(500).json({ success: false, message: error.message });
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
        return res.status(500).json({ success: false, message: error.message });
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
        const { error: updateError } = await supabase
            .from('profiles')
            .upsert({ id: user.id, college_id_url: publicUrl, student_verified: false, updated_at: new Date() });
        if (updateError) throw updateError;

        return res.json({ success: true, url: publicUrl });
    } catch (error) {
        console.error('Student verification error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
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

        const panFile     = req.files.panCard[0];
        const panExt      = panFile.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const panFileName = `${user.id}_pan_${Date.now()}.${panExt}`;
        const { error: panError } = await supabase.storage
            .from('verification')
            .upload(panFileName, panFile.buffer, { contentType: panFile.mimetype, upsert: true });
        if (panError) throw panError;

        const qrFile     = req.files.paymentQr[0];
        const qrExt      = qrFile.originalname.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
        const qrFileName = `${user.id}_qr_${Date.now()}.${qrExt}`;
        const { error: qrError } = await supabase.storage
            .from('verification')
            .upload(qrFileName, qrFile.buffer, { contentType: qrFile.mimetype, upsert: true });
        if (qrError) throw qrError;

        const { data: { publicUrl: panUrl } } = supabase.storage.from('verification').getPublicUrl(panFileName);
        const { data: { publicUrl: qrUrl  } } = supabase.storage.from('verification').getPublicUrl(qrFileName);

        const { error: updateError } = await supabase
            .from('profiles')
            .upsert({ id: user.id, pan_url: panUrl, payment_qr_url: qrUrl, seller_verified: false, updated_at: new Date() });
        if (updateError) throw updateError;

        return res.json({ success: true, pan_url: panUrl, qr_url: qrUrl });
    } catch (error) {
        console.error('Seller verification error:', error.message);
        return res.status(500).json({ success: false, message: error.message });
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
        return res.status(500).json({ success: false, message: error.message });
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
        return res.status(500).json({ success: false, message: error.message });
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
        return res.status(500).json({ success: false, message: error.message });
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
        return res.status(500).json({ success: false, message: error.message });
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
        return res.status(500).json({ success: false, message: error.message });
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
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ---- CREATE LISTING ----
app.post('/api/listings/create', async (req, res) => {
    try {
        const user = await getUserFromToken(req);

        const title           = sanitizeString(req.body.title           || '', 200);
        const category        = sanitizeString(req.body.category        || '', 100);
        const condition       = sanitizeString(req.body.condition       || '', 50);
        const description     = sanitizeString(req.body.description     || '', 2000);
        const payment_methods = sanitizeString(req.body.payment_methods || '', 200);
        const collection_point= sanitizeString(req.body.collection_point|| '', 300);
        const contact_no      = sanitizeString(req.body.contact_no      || '', 20);
        const delivery_date   = sanitizeString(req.body.delivery_date   || '', 20);
        const price           = sanitizeNumber(req.body.price);
        const image_urls      = Array.isArray(req.body.image_urls) ? req.body.image_urls : [];

        if (!title)    return res.status(400).json({ success: false, message: 'Title is required.' });
        if (!category) return res.status(400).json({ success: false, message: 'Category is required.' });
        if (!price)    return res.status(400).json({ success: false, message: 'Valid price is required.' });
        if (image_urls.length === 0)
            return res.status(400).json({ success: false, message: 'At least one image is required.' });

        const { data: product, error } = await supabase
            .from('products')
            .insert({ user_id: user.id, title, category, price, condition, description, delivery_date, payment_methods, collection_point, contact_no })
            .select().single();
        if (error) throw error;

        await supabase.from('product_images')
            .insert(image_urls.map(url => ({ product_id: product.id, image_url: url })));

        return res.json({ success: true, product });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ---- UPLOAD LISTING IMAGE ----
app.post('/api/listings/upload-image', uploadLimiter, async (req, res) => {
    try {
        const user = await getUserFromToken(req);
        const { name, type, data } = req.body;

        // Validate MIME type on the base64 upload too
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
        return res.status(500).json({ success: false, message: error.message });
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
// 9. START SERVER
// =========================================================================

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
        return res.status(500).json({ success: false, message: err.message });
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

        // Attach role so frontend knows if user is buyer or seller
        const enriched = (rooms || []).map(r => ({
            ...r,
            role: r.buyer_id === user.id ? 'Buyer' : 'Seller'
        }));
        return res.json({ success: true, rooms: enriched });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
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
        return res.status(500).json({ success: false, message: err.message });
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
        return res.status(500).json({ success: false, message: err.message });
    }
});

// =========================================================================
app.listen(PORT, () => {
    console.log(`🚀 UniThrift running at http://localhost:${PORT}`);
});