// ============================================
// PURRFECT SITTERS - FULL PRODUCTION SERVER
// Node.js + Express + MongoDB + Authentication
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Setup multer for avatar uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '.png';
        cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 9) + ext);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Serve uploads statically
app.use('/uploads', express.static(uploadsDir));

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ============================================
// MONGODB CONNECTION
// ============================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lopezjason_admin:Jas1Lia2@purrfectsitters.uulgtma.mongodb.net/purrfect_sitters?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas!'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================
// SESSION CONFIGURATION
// ============================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'purrfect-sitters-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: MONGODB_URI,
        ttl: 24 * 60 * 60 // 1 day
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production', // set to true in production with HTTPS
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 1 day
    }
}));

// ============================================
// SCHEMAS
// ============================================

// User Schema (for authentication)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    userType: { type: String, enum: ['owner', 'sitter'], required: true },
    phone: String,
    imageUrl: String, // avatar for user
    createdAt: { type: Date, default: Date.now },
    sitterProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'Sitter' }
});

// Breed Schema
const breedSchema = new mongoose.Schema({
    id: String,
    name: String,
    emoji: String,
    tagline: String,
    overview: String,
    traits: [String],
    care: String,
    bestFor: String,
    health: String,
    imageUrl: String
});

// Sitter Schema
const sitterSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    email: String,
    phone: String,
    borough: { type: String, enum: ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'] },
    neighborhood: String,
    rate: Number,
    rateDisplay: String,
    rating: { type: Number, default: 5.0 },
    reviewCount: { type: Number, default: 0 },
    experience: String,
    specialties: [String],
    bio: String,
    verified: { type: Boolean, default: false },
    imageUrl: String,
    availability: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

// Booking Schema
const bookingSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sitterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sitter' },
    sitterName: String,
    catName: String,
    catBreed: String,
    startDate: Date,
    endDate: Date,
    totalDays: Number,
    totalCost: Number,
    ownerName: String,
    ownerEmail: String,
    ownerPhone: String,
    specialInstructions: String,
    status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

// Contact Schema
const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    subject: String,
    message: String,
    createdAt: { type: Date, default: Date.now }
});

// Review Schema
const reviewSchema = new mongoose.Schema({
    sitterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sitter' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ownerName: String,
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    createdAt: { type: Date, default: Date.now }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Breed = mongoose.model('Breed', breedSchema);
const Sitter = mongoose.model('Sitter', sitterSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Contact = mongoose.model('Contact', contactSchema);
const Review = mongoose.model('Review', reviewSchema);

// ============================================
// AUTH MIDDLEWARE
// ============================================
const requireAuth = (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Please log in to continue' });
    }
    next();
};

const requireSitter = async (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false, message: 'Please log in to continue' });
    }
    const user = await User.findById(req.session.userId);
    if (!user || user.userType !== 'sitter') {
        return res.status(403).json({ success: false, message: 'Sitter access required' });
    }
    req.user = user;
    next();
};

// ============================================
// AUTH ROUTES
// ============================================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName, userType, phone } = req.body;

        if (!email || !password || !firstName || !lastName || !userType) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = new User({
            email: email.toLowerCase(),
            password: hashedPassword,
            firstName,
            lastName,
            userType,
            phone
        });

        await user.save();

        if (userType === 'sitter') {
            const sitter = new Sitter({
                userId: user._id,
                name: `${firstName} ${lastName}`,
                email: email.toLowerCase(),
                phone,
                borough: 'Manhattan',
                neighborhood: '',
                rate: 40,
                rateDisplay: '$40/day',
                rating: 5.0,
                reviewCount: 0,
                experience: 'New sitter',
                specialties: [],
                bio: 'New to Purrfect Sitters!',
                verified: false,
                imageUrl: 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=200',
                availability: true
            });
            await sitter.save();
            user.sitterProfile = sitter._id;
            await user.save();
        }

        req.session.userId = user._id;
        req.session.userType = user.userType;

        res.json({
            success: true,
            message: 'Registration successful!',
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                userType: user.userType,
                sitterProfile: user.sitterProfile || null
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Registration failed', error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        req.session.userId = user._id;
        req.session.userType = user.userType;

        let sitterProfile = null;
        if (user.userType === 'sitter' && user.sitterProfile) {
            sitterProfile = await Sitter.findById(user.sitterProfile);
        }

        res.json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                userType: user.userType,
                sitterProfile: sitterProfile
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Login failed', error: error.message });
    }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// Get current user
app.get('/api/auth/me', async (req, res) => {
    try {
        if (!req.session.userId) {
            return res.json({ success: true, user: null });
        }

        const user = await User.findById(req.session.userId).select('-password');
        if (!user) {
            return res.json({ success: true, user: null });
        }

        let sitterProfile = null;
        if (user.userType === 'sitter' && user.sitterProfile) {
            sitterProfile = await Sitter.findById(user.sitterProfile);
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                userType: user.userType,
                phone: user.phone,
                imageUrl: user.imageUrl || null,
                sitterProfile: sitterProfile
            }
        });

    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to get user', error: error.message });
    }
});

// Update current user profile (including avatar upload)
app.put('/api/auth/me', requireAuth, upload.single('avatar'), async (req, res) => {
    try {
        const updates = {};
        const allowed = ['firstName', 'lastName', 'phone'];
        allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

        if (req.file) {
            updates.imageUrl = `/uploads/${req.file.filename}`;
        }

        const user = await User.findByIdAndUpdate(req.session.userId, { $set: updates }, { new: true }).select('-password');

        let sitterProfile = null;
        if (user.userType === 'sitter' && user.sitterProfile) {
            sitterProfile = await Sitter.findById(user.sitterProfile);
        }

        res.json({
            success: true,
            message: 'Profile updated!',
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                userType: user.userType,
                phone: user.phone,
                imageUrl: user.imageUrl || null,
                sitterProfile: sitterProfile
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// BREED ROUTES
// ============================================

app.get('/api/breeds', async (req, res) => {
    try {
        const breeds = await Breed.find();
        res.json({ success: true, data: breeds });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/breeds/:id', async (req, res) => {
    try {
        const breed = await Breed.findOne({ id: req.params.id });
        if (!breed) {
            return res.status(404).json({ success: false, message: 'Breed not found' });
        }
        res.json({ success: true, data: breed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// SITTER ROUTES (with search/filter)
// ============================================

app.get('/api/sitters', async (req, res) => {
    try {
        const { borough, minRate, maxRate, specialty, minRating, search, available } = req.query;
        
        let filter = {};
        
        if (borough && borough !== 'all') {
            filter.borough = borough;
        }
        
        if (minRate || maxRate) {
            filter.rate = {};
            if (minRate) filter.rate.$gte = Number(minRate);
            if (maxRate) filter.rate.$lte = Number(maxRate);
        }
        
        if (specialty && specialty !== 'all') {
            filter.specialties = { $in: [new RegExp(specialty, 'i')] };
        }
        
        if (minRating) {
            filter.rating = { $gte: Number(minRating) };
        }
        
        if (available === 'true') {
            filter.availability = true;
        }
        
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { neighborhood: { $regex: search, $options: 'i' } },
                { bio: { $regex: search, $options: 'i' } },
                { borough: { $regex: search, $options: 'i' } }
            ];
        }

        const sitters = await Sitter.find(filter).sort({ rating: -1 });
        res.json({ success: true, data: sitters });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/sitters/:id', async (req, res) => {
    try {
        const sitter = await Sitter.findById(req.params.id);
        if (!sitter) {
            return res.status(404).json({ success: false, message: 'Sitter not found' });
        }
        
        const reviews = await Review.find({ sitterId: sitter._id }).sort({ createdAt: -1 });
        
        res.json({ success: true, data: { ...sitter.toObject(), reviews } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update sitter profile (accept avatar upload)
app.put('/api/sitters/profile', upload.single('avatar'), requireSitter, async (req, res) => {
    try {
        const user = req.user;
        const updates = req.body || {};

        if (updates.rate) {
            updates.rateDisplay = `$${updates.rate}/day`;
        }

        if (req.file) {
            updates.imageUrl = `/uploads/${req.file.filename}`;
        }

        const sitter = await Sitter.findByIdAndUpdate(
            user.sitterProfile,
            { $set: updates },
            { new: true }
        );

        // return updated user with sitterProfile
        const updatedUser = await User.findById(user._id).select('-password');
        res.json({ success: true, message: 'Profile updated!', data: { user: updatedUser, sitter } });
    } catch (error) {
        console.error('Update sitter error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// BOOKING ROUTES
// ============================================

app.post('/api/bookings', requireAuth, async (req, res) => {
    try {
        const { sitterId, catName, catBreed, startDate, endDate, specialInstructions } = req.body;

        const user = await User.findById(req.session.userId);
        const sitter = await Sitter.findById(sitterId);

        if (!sitter) {
            return res.status(404).json({ success: false, message: 'Sitter not found' });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        const totalCost = totalDays * sitter.rate;

        const booking = new Booking({
            ownerId: user._id,
            sitterId: sitter._id,
            sitterName: sitter.name,
            catName,
            catBreed,
            startDate: start,
            endDate: end,
            totalDays,
            totalCost,
            ownerName: `${user.firstName} ${user.lastName}`,
            ownerEmail: user.email,
            ownerPhone: user.phone,
            specialInstructions,
            status: 'pending'
        });

        await booking.save();
        res.json({ success: true, message: 'Booking created!', data: booking });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/bookings/my', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        let bookings;

        if (user.userType === 'owner') {
            bookings = await Booking.find({ ownerId: user._id }).sort({ createdAt: -1 });
        } else {
            const sitter = await Sitter.findOne({ userId: user._id });
            bookings = await Booking.find({ sitterId: sitter._id }).sort({ createdAt: -1 });
        }

        res.json({ success: true, data: bookings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/bookings/:id/status', requireSitter, async (req, res) => {
    try {
        const { status } = req.body;
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );
        res.json({ success: true, message: 'Booking updated!', data: booking });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/bookings', async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ createdAt: -1 });
        res.json({ success: true, data: bookings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// REVIEW ROUTES
// ============================================

app.post('/api/reviews', requireAuth, async (req, res) => {
    try {
        const { sitterId, rating, comment } = req.body;
        const user = await User.findById(req.session.userId);

        const review = new Review({
            sitterId,
            ownerId: user._id,
            ownerName: `${user.firstName} ${user.lastName}`,
            rating,
            comment
        });

        await review.save();

        const reviews = await Review.find({ sitterId });
        const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        await Sitter.findByIdAndUpdate(sitterId, {
            rating: Math.round(avgRating * 10) / 10,
            reviewCount: reviews.length
        });

        res.json({ success: true, message: 'Review submitted!', data: review });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// CONTACT ROUTES
// ============================================

app.post('/api/contact', async (req, res) => {
    try {
        const contact = new Contact(req.body);
        await contact.save();
        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/contacts', async (req, res) => {
    try {
        const contacts = await Contact.find().sort({ createdAt: -1 });
        res.json({ success: true, data: contacts });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// SEED DATABASE - NYC SITTERS
// ============================================
// NOTE: Disabled by default in production. To enable seeding set ENV ENABLE_SEED=true
app.get('/api/seed', async (req, res) => {
    try {
        if (process.env.ENABLE_SEED !== 'true') {
            return res.status(403).json({ success: false, message: 'Seeding is disabled. Set ENABLE_SEED=true to enable.' });
        }

        await Breed.deleteMany({});
        await Sitter.deleteMany({});

        // CAT BREEDS
        const breeds = [
            {
                id: 'persian',
                name: 'Persian',
                emoji: '👑',
                tagline: 'The Glamorous Royalty',
                overview: 'Persian cats are known for their long, luxurious coats and sweet, gentle personalities.',
                traits: ['Calm', 'Affectionate', 'Quiet', 'Loyal'],
                care: 'Daily brushing required. Keep eyes clean.',
                bestFor: 'Quiet homes, seniors, apartments',
                health: 'Watch for breathing issues and eye problems.',
                imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/8/81/Persialainen.jpg?w=400'
            },
            {
                id: 'maine-coon',
                name: 'Maine Coon',
                emoji: '🦁',
                tagline: 'The Gentle Giant',
                overview: 'Maine Coons are one of the largest domestic cat breeds, known for their friendly nature.',
                traits: ['Friendly', 'Playful', 'Intelligent', 'Social'],
                care: 'Regular brushing, lots of playtime.',
                bestFor: 'Families, homes with other pets',
                health: 'Watch for hip dysplasia and heart issues.',
                imageUrl: 'https://framerusercontent.com/images/9vaMYZ1IbMWni6Fxww0r2chMFhc.jpg?width=400'
            },
            {
                id: 'siamese',
                name: 'Siamese',
                emoji: '💎',
                tagline: 'The Vocal Companion',
                overview: 'Siamese cats are known for their striking blue eyes and vocal personalities.',
                traits: ['Vocal', 'Social', 'Intelligent', 'Active'],
                care: 'Needs lots of attention and mental stimulation.',
                bestFor: 'Active owners who are home often',
                health: 'Generally healthy, watch for dental issues.',
                imageUrl: 'https://assets.elanco.com/8e0bf1c2-1ae4-001f-9257-f2be3c683fb1/fca42f04-2474-4302-a238-990c8aebfe8c/Siamese_cat_1110x740.jpg?w=400'
            },
            {
                id: 'british-shorthair',
                name: 'British Shorthair',
                emoji: '🧸',
                tagline: 'The Teddy Bear',
                overview: 'British Shorthairs are calm, easygoing cats with plush, dense coats.',
                traits: ['Calm', 'Independent', 'Easygoing', 'Quiet'],
                care: 'Weekly brushing, moderate exercise.',
                bestFor: 'Busy professionals, apartments',
                health: 'Watch for obesity and heart disease.',
                imageUrl: 'https://cdn.shopify.com/s/files/1/0274/5994/4493/files/BRI_Dad_-_Newtella.png?v=1742455452?w=400'
            },
            {
                id: 'ragdoll',
                name: 'Ragdoll',
                emoji: '🪆',
                tagline: 'The Floppy Friend',
                overview: 'Ragdolls go limp when picked up and are extremely docile and affectionate.',
                traits: ['Docile', 'Affectionate', 'Gentle', 'Relaxed'],
                care: 'Regular brushing, indoor only recommended.',
                bestFor: 'Families with children, calm homes',
                health: 'Watch for heart disease and bladder stones.',
                imageUrl: 'https://www.floppycats.com/wp-content/uploads/2022/09/Ragna-Ragdoll-Cat-of-the-Week-RagnaOutside.jpg?w=400'
            },
            {
                id: 'bengal',
                name: 'Bengal',
                emoji: '🐆',
                tagline: 'The Wild Child',
                overview: 'Bengals have exotic leopard-like markings and are highly energetic.',
                traits: ['Energetic', 'Curious', 'Athletic', 'Playful'],
                care: 'Lots of exercise and enrichment needed.',
                bestFor: 'Active owners, large spaces',
                health: 'Generally healthy, watch for heart issues.',
                imageUrl: 'https://image.petmd.com/files/inline-images/bengal-cat.jpeg?VersionId=X0xkDftr_klFvUhQpLarkxvJBbnUAd01?w=400'
            },
            {
                id: 'scottish-fold',
                name: 'Scottish Fold',
                emoji: '🦉',
                tagline: 'The Owl Cat',
                overview: 'Scottish Folds have unique folded ears and owl-like expressions.',
                traits: ['Sweet', 'Adaptable', 'Playful', 'Loving'],
                care: 'Regular ear cleaning, moderate grooming.',
                bestFor: 'Any home, good with children',
                health: 'Watch for joint issues.',
                imageUrl: 'https://cdn.wamiz.fr/cdn-cgi/image/format=auto,quality=80,width=720,height=405,fit=cover/animal/breed/cat/adult/6687c811719fb656583283.jpg?w=400'
            },
            {
                id: 'sphynx',
                name: 'Sphynx',
                emoji: '👽',
                tagline: 'The Naked Wonder',
                overview: 'Sphynx cats are hairless and known for their warmth-seeking behavior.',
                traits: ['Affectionate', 'Energetic', 'Social', 'Curious'],
                care: 'Regular baths, keep warm, sun protection.',
                bestFor: 'Allergy sufferers, attentive owners',
                health: 'Watch for skin issues and heart disease.',
                imageUrl: 'https://images.squarespace-cdn.com/content/v1/54822a56e4b0b30bd821480c/1672325275441-8O2J3VIWG1ZWAOAOPQ7V/sphynx.jpg?w=400'
            },
            {
                id: 'abyssinian',
                name: 'Abyssinian',
                emoji: '🏃',
                tagline: 'The Busy Explorer',
                overview: 'Abyssinians are active, curious cats who love to climb and explore.',
                traits: ['Active', 'Curious', 'Intelligent', 'Playful'],
                care: 'Lots of vertical space and toys needed.',
                bestFor: 'Active families, multi-cat homes',
                health: 'Watch for kidney disease.',
                imageUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR_2G2ALwTk3GqXxMGAvnx1vncNYnR_r6uWfiFwUxNOYl6_ME-9YbUJLVjEoGBhTxnKN9amOjfThZ35ikzgXpBIcb9uxaSEvRbMzWpjM0s&s=10?w=400'
            },
            {
                id: 'russian-blue',
                name: 'Russian Blue',
                emoji: '💙',
                tagline: 'The Shy Sweetheart',
                overview: 'Russian Blues have beautiful silver-blue coats and are quietly affectionate.',
                traits: ['Shy', 'Loyal', 'Quiet', 'Gentle'],
                care: 'Low maintenance, weekly brushing.',
                bestFor: 'Quiet homes, singles, seniors',
                health: 'Generally very healthy breed.',
                imageUrl: 'https://rawznaturalpetfood.com/wp-content/uploads/2021/05/russian-blue-cats.jpg?w=400'
            },
            {
                id: 'norwegian-forest',
                name: 'Norwegian Forest',
                emoji: '🌲',
                tagline: 'The Viking Cat',
                overview: 'Norwegian Forest Cats are large, fluffy cats built for cold climates.',
                traits: ['Independent', 'Friendly', 'Athletic', 'Patient'],
                care: 'Regular brushing, especially in spring.',
                bestFor: 'Families, homes with outdoor access',
                health: 'Watch for heart and kidney issues.',
                imageUrl: 'https://image.petmd.com/files/styles/863x625/public/2023-04/norwegian-forest-cat.jpg?w=400'
            },
            {
                id: 'american-shorthair',
                name: 'American Shorthair',
                emoji: '🇺🇸',
                tagline: 'The All-American',
                overview: 'American Shorthairs are adaptable, friendly cats great for any family.',
                traits: ['Adaptable', 'Friendly', 'Easy-going', 'Healthy'],
                care: 'Low maintenance, weekly brushing.',
                bestFor: 'Families, first-time cat owners',
                health: 'Watch for obesity.',
                imageUrl: 'https://framerusercontent.com/images/zrmhsmoFui8gk0S3XnUFkpo10hs.jpg?w=400'
            }
        ];

        // NYC SITTERS - 2 per borough (10 total)
        const sitters = [
            // MANHATTAN
            {
                name: 'Sarah Chen',
                email: 'sarah.chen@email.com',
                phone: '(212) 555-0101',
                borough: 'Manhattan',
                neighborhood: 'Upper East Side',
                rate: 55,
                rateDisplay: '$55/day',
                rating: 4.9,
                reviewCount: 47,
                experience: '6 years',
                specialties: ['Senior cats', 'Medical care', 'Medication administration'],
                bio: 'Certified vet tech with 6 years experience. I specialize in senior cats and those with medical needs. Your fur baby will receive loving care!',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
                availability: true
            },
            {
                name: 'Michael Torres',
                email: 'michael.t@email.com',
                phone: '(212) 555-0102',
                borough: 'Manhattan',
                neighborhood: 'Hells Kitchen',
                rate: 50,
                rateDisplay: '$50/day',
                rating: 4.8,
                reviewCount: 32,
                experience: '4 years',
                specialties: ['Kittens', 'Multiple cats', 'Playtime expert'],
                bio: 'Cat dad of 3 rescue kitties! I work from home so your cats have company all day. Photo and video updates included!',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
                availability: true
            },
            // BROOKLYN
            {
                name: 'Emily Rodriguez',
                email: 'emily.r@email.com',
                phone: '(347) 555-0201',
                borough: 'Brooklyn',
                neighborhood: 'Park Slope',
                rate: 48,
                rateDisplay: '$48/day',
                rating: 5.0,
                reviewCount: 56,
                experience: '7 years',
                specialties: ['Anxious cats', 'Special needs', 'Behavioral issues'],
                bio: 'Former animal shelter volunteer with animal behavior degree. I specialize in anxious and special needs cats.',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
                availability: true
            },
            {
                name: 'James Wright',
                email: 'james.w@email.com',
                phone: '(347) 555-0202',
                borough: 'Brooklyn',
                neighborhood: 'Williamsburg',
                rate: 45,
                rateDisplay: '$45/day',
                rating: 4.7,
                reviewCount: 28,
                experience: '3 years',
                specialties: ['Active breeds', 'Bengals', 'Young cats'],
                bio: 'Large cat-proofed apartment with cat trees, tunnels, and toys. Perfect for active cats who need stimulation!',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
                availability: true
            },
            // QUEENS
            {
                name: 'Priya Patel',
                email: 'priya.p@email.com',
                phone: '(718) 555-0301',
                borough: 'Queens',
                neighborhood: 'Astoria',
                rate: 42,
                rateDisplay: '$42/day',
                rating: 4.9,
                reviewCount: 41,
                experience: '5 years',
                specialties: ['Multiple cats', 'Dietary needs', 'Senior cats'],
                bio: 'I treat every cat like royalty! 5 years experience with cats of all personalities. Quiet, clean home with no other pets.',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200',
                availability: true
            },
            {
                name: 'David Kim',
                email: 'david.k@email.com',
                phone: '(718) 555-0302',
                borough: 'Queens',
                neighborhood: 'Forest Hills',
                rate: 40,
                rateDisplay: '$40/day',
                rating: 4.6,
                reviewCount: 19,
                experience: '2 years',
                specialties: ['Kittens', 'Siamese', 'Vocal cats'],
                bio: 'Cat enthusiast with special love for vocal breeds! Flexible hours and lots of one-on-one attention.',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
                availability: true
            },
            // BRONX
            {
                name: 'Maria Santos',
                email: 'maria.s@email.com',
                phone: '(718) 555-0401',
                borough: 'Bronx',
                neighborhood: 'Riverdale',
                rate: 38,
                rateDisplay: '$38/day',
                rating: 4.8,
                reviewCount: 35,
                experience: '8 years',
                specialties: ['Senior cats', 'Medical care', 'Hospice care'],
                bio: '8 years experience including veterinary clinic work. Specializing in senior cats and medical attention.',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200',
                availability: true
            },
            {
                name: 'Anthony Johnson',
                email: 'anthony.j@email.com',
                phone: '(718) 555-0402',
                borough: 'Bronx',
                neighborhood: 'Pelham Bay',
                rate: 35,
                rateDisplay: '$35/day',
                rating: 4.5,
                reviewCount: 15,
                experience: '2 years',
                specialties: ['Outdoor cats', 'Multiple cats', 'Budget-friendly'],
                bio: 'Affordable, reliable cat sitting! Secure backyard catio for cats who enjoy fresh air. Daily updates included!',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200',
                availability: true
            },
            // STATEN ISLAND
            {
                name: 'Jennifer Liu',
                email: 'jennifer.l@email.com',
                phone: '(718) 555-0501',
                borough: 'Staten Island',
                neighborhood: 'St. George',
                rate: 40,
                rateDisplay: '$40/day',
                rating: 4.9,
                reviewCount: 38,
                experience: '5 years',
                specialties: ['Persians', 'Long-haired breeds', 'Grooming'],
                bio: 'Experienced with long-haired breeds and show cats. Grooming services included to keep coats beautiful!',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
                availability: true
            },
            {
                name: 'Robert Martinez',
                email: 'robert.m@email.com',
                phone: '(718) 555-0502',
                borough: 'Staten Island',
                neighborhood: 'Tottenville',
                rate: 36,
                rateDisplay: '$36/day',
                rating: 4.7,
                reviewCount: 22,
                experience: '3 years',
                specialties: ['Rescue cats', 'Shy cats', 'Quiet environment'],
                bio: 'Quiet home perfect for shy or anxious cats. Former rescue volunteer - I understand cats needing extra patience.',
                verified: true,
                imageUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200',
                availability: true
            }
        ];

        await Breed.insertMany(breeds);
        await Sitter.insertMany(sitters);

        res.json({
            success: true,
            message: 'Database seeded successfully!',
            data: { breeds: breeds.length, sitters: sitters.length }
        });

    } catch (error) {
        console.error('Seed error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`
    ✅ Server is running!
    🌐 Open: http://localhost:${PORT}
    
    📊 API Endpoints:
       Auth:
       - POST /api/auth/register
       - POST /api/auth/login
       - POST /api/auth/logout
       - GET  /api/auth/me
       - PUT  /api/auth/me (update profile, multipart/form-data; avatar field name: 'avatar')
       
       Data:
       - GET  /api/breeds
       - GET  /api/sitters (supports ?borough=&minRate=&maxRate=&specialty=&search=)
       - GET  /api/sitters/:id
       - PUT  /api/sitters/profile (sitter updates; supports avatar upload field 'avatar')
       - POST /api/bookings
       - GET  /api/bookings/my
       - POST /api/reviews
       
       Setup:
       - GET  /api/seed  (disabled by default; enable with ENABLE_SEED=true)
    `);
});