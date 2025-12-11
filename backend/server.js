require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Import the Models
const Expense = require('./models/Expense');
const User = require('./models/User');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ Connection Error:", err));

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ message: 'Invalid token.' });
  }
};

// --- AUTHENTICATION ROUTES ---

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    const user = new User({ name, email, password });
    await user.save();

    // Generate JWT token
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });

    res.status(201).json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user', error });
  }
});

// Signin
app.post('/api/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '7d' });

    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    res.status(500).json({ message: 'Error signing in', error });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: { id: user._id, name: user.name, email: user.email, currency: user.currency, theme: user.theme, salary: user.salary } });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user', error });
  }
});

// Logout (client-side token removal)
app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Update user profile
app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const { salary, planData } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (salary !== undefined) {
      user.salary = salary;
    }

    if (planData !== undefined) {
      user.planData = planData;
    }

    await user.save();

    res.json({ message: 'Profile updated successfully', user: { id: user._id, name: user.name, email: user.email, salary: user.salary, planData: user.planData } });
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error });
  }
});

// --- EXPENSE ROUTES ---

// Save a new expense
app.post('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const { title, amount, category, note, date } = req.body;
    const newExpense = new Expense({
      userId: req.user.id,
      title,
      amount,
      category,
      note: note || '',
      date: date || new Date()
    });
    await newExpense.save();
    res.status(201).json(newExpense);
    console.log("💰 Expense Saved:", title);
  } catch (error) {
    res.status(500).json({ message: "Error saving expense", error });
  }
});

// Get user's expenses
app.get('/api/expenses', authenticateToken, async (req, res) => {
  try {
    const expenses = await Expense.find({ userId: req.user.id }).sort({ date: -1 });
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ message: "Error fetching expenses", error });
  }
});

// Delete expense
app.delete('/api/expenses/:id', authenticateToken, async (req, res) => {
  try {
    const expense = await Expense.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    res.status(200).json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: "Error deleting expense", error });
  }
});

// --- SETTINGS ROUTES ---

// Get user settings
app.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      theme: user.theme,
      currency: user.currency,
      categories: user.categories,
      salary: user.salary,
      planData: user.planData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error });
  }
});

// Update user settings
app.put('/api/settings', authenticateToken, async (req, res) => {
  try {
    const { theme, currency, categories, salary, planData } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (theme !== undefined) user.theme = theme;
    if (currency !== undefined) user.currency = currency;
    if (categories !== undefined) user.categories = categories;
    if (salary !== undefined) user.salary = salary;
    if (planData !== undefined) user.planData = planData;

    await user.save();

    res.json({
      message: 'Settings updated successfully',
      settings: {
        theme: user.theme,
        currency: user.currency,
        categories: user.categories,
        salary: user.salary,
        planData: user.planData
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating settings', error });
  }
});

// Add new category
app.post('/api/settings/categories', authenticateToken, async (req, res) => {
  try {
    const { category } = req.body;
    if (!category || !category.trim()) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const trimmedCategory = category.trim();
    if (!user.categories.includes(trimmedCategory)) {
      user.categories.push(trimmedCategory);
      await user.save();
    }

    res.json({ message: 'Category added successfully', categories: user.categories });
  } catch (error) {
    res.status(500).json({ message: 'Error adding category', error });
  }
});

const PORT = process.env.PORT || 5003;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
