// server.js

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongodb = require('mongodb')

const app = express();
const port = 3000;

// Serve static files from the public directory
app.use(express.static('./public'));

// MongoDB connection
mongoose.connect('mongodb://127.0.0.1:27017/crud_app')
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log('Connected to MongoDB');
});

// Mongoose Schema
const itemSchema = new mongoose.Schema({
  name: String,
  description: String,
  userId: String,
  imageUrl: String
});
const Item = mongoose.model('Item', itemSchema);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  role: String // 'admin' or 'user'
});
const User = mongoose.model('User', userSchema);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'secret',
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport configuration
passport.use(new LocalStrategy((username, password, done) => {
  User.findOne({ username: username }, (err, user) => {
    if (err) { return done(err); }
    if (!user) {
      return done(null, false, { message: 'Incorrect username.' });
    }
    bcrypt.compare(password, user.password, (err, res) => {
      if (res) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Incorrect password.' });
      }
    });
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// Routes
app.post('/public/login.html', passport.authenticate('local', { successRedirect: '/', failureRedirect: '/public/login.html', failureFlash: true }));

app.post('/register', async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const user = new User({
      username: req.body.username,
      password: hashedPassword,
      role: 'user'
    });
    await user.save();
    res.redirect('/public/login.html');
  } catch {
    res.redirect('/register');
  }
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/public/login.html');
});

app.get('/public/items.html', authenticateUser, async (req, res) => {
  try {
    let query = { userId: req.user._id };
    if (req.user.role === 'admin') {
      query = {}; // Admin can view all items
    }
    const items = await Item.find(query);
    res.json(items);
  } catch(err) {
    res.status(500).json({ message: err.message });
  }
});

app.post('/public/items.html', authenticateUser, upload.single('image'), async (req, res) => {
  const item = new Item({
    name: req.body.name,
    description: req.body.description,
    userId: req.user._id,
    imageUrl: req.file ? req.file.filename : null
  });
  try {
    const newItem = await item.save();
    res.status(201).json(newItem);
  } catch(err) {
    res.status(400).json({ message: err.message });
  }
});

app.get('/public/items.html/:id', authenticateUser, getItem, (req, res) => {
  res.json(res.item);
});

app.patch('/public/items.html/:id', authenticateUser, getItem, async (req, res) => {
  if (req.body.name != null) {
    res.item.name = req.body.name;
  }
  if (req.body.description != null) {
    res.item.description = req.body.description;
  }
  try {
    const updatedItem = await res.item.save();
    res.json(updatedItem);
  } catch(err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete('/public/items.html/:id', authenticateUser, getItem, async (req, res) => {
  try {
    if (res.item.imageUrl) {
      fs.unlinkSync(path.join(__dirname, 'uploads', res.item.imageUrl)); // Delete uploaded image file
    }
    await res.item.remove();
    res.json({ message: 'Deleted Item' });
  } catch(err) {
    res.status(500).json({ message: err.message });
  }
});

async function getItem(req, res, next) {
  let item;
  try {
    item = await Item.findById(req.params.id);
    if (item == null) {
      return res.status(404).json({ message: 'Cannot find item' });
    }
  } catch(err) {
    return res.status(500).json({ message: err.message });
  }
  res.item = item;
  next();
}

function authenticateUser(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/public/login.html');
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
