// X-Poll Backend Server
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const passport = require('passport');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors())
// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests) or any localhost
    if (!origin || origin.startsWith('http://localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'x-auth-token', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(passport.initialize());

// DB Connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/xpoll', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error(err));

app.get('/api/auth/google/callback', passport.authenticate('google', {
  failureRedirect: `${process.env.CLIENT_URL}/login`,
  session: false
}), (req, res) => {
  const token = require('jsonwebtoken').sign({ id: req.user.id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}`);
});

// Server
const PORT = process.env.PORT || 5000;

// Import// Routes
app.use('/auth', require('./routes/auth'));
app.use('/buckets', require('./routes/buckets'));
app.use('/admin', require('./routes/admin'));
app.use('/admin', require('./routes/admin-data'));
app.use('/admin', require('./routes/upload')); // PDF upload route

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
