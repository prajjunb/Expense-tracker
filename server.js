const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 5000;
const JWT_SECRET = 'your_jwt_secret_key_here'; // Use a secure key in production
const MONGO_URI = 'mongodb://127.0.0.1:27017/expense_tracker';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Schemas
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  salary: { type: Number, default: 0 },
  planData: {
    investPercent: Number,
    savePercent: Number,
    essentialPercent: Number,
    investAmount: Number,
    saveAmount: Number,
    essentialAmount: Number,
    appliedAt: Date
  },
  settings: {
    theme: { type: String, default: 'light' },
    currency: { type: String, default: 'INR' },
    notifications: { type: Boolean, default: true }
  },
  categories: [String]
});

const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amount: Number,
  category: String,
  note: String,
  date: Date,
  currency: String
});

const goalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  category: String,
  amount: Number,
  period: String,
  alert: Number,
  createdAt: Date
});

const User = mongoose.model('User', userSchema);
const Expense = mongoose.model('Expense', expenseSchema);
const Goal = mongoose.model('Goal', goalSchema);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Routes

// Auth
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(400).json({ message: 'Error creating user' });
  }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Signin attempt:', email);

    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found');
      return res.status(400).json({ message: 'User not found' });
    }
    
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      console.log('Invalid password');
      return res.status(400).json({ message: 'Invalid password' });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('Signin error:', err);
    res.status(400).json({ message: 'Error signing in' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching user' });
  }
});

// Profile & Settings
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ ...user.settings, salary: user.salary, planData: user.planData, categories: user.categories });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching settings' });
  }
});

app.get('/api/settings/categories', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    res.json({ categories: user.categories || [] });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching categories' });
  }
});

app.post('/api/settings/categories', authenticateToken, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { categories: req.body.category } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Error adding category' });
  }
});

// Expenses & Goals (Generic CRUD)
const createCrudRoutes = (Model, path) => {
  app.get(path, authenticateToken, async (req, res) => res.json(await Model.find({ userId: req.user.id })));
  app.post(path, authenticateToken, async (req, res) => res.json(await new Model({ ...req.body, userId: req.user.id }).save()));
  app.delete(`${path}/:id`, authenticateToken, async (req, res) => {
    await Model.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ success: true });
  });
};

createCrudRoutes(Expense, '/api/expenses');
createCrudRoutes(Goal, '/api/goals');

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));