const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// In-memory database (replace with real DB like PostgreSQL, MongoDB, etc.)
let subscriptions = [];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes

/**
 * GET /api/subscriptions
 * Get all subscriptions for the user
 */
app.get('/api/subscriptions', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const userSubs = subscriptions.filter(sub => sub.userId === userId);
    res.json(userSubs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/subscriptions
 * Create a new subscription
 */
app.post('/api/subscriptions', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const { name, amount, category, billingCycle, nextDueDate } = req.body;

    if (!name || !amount || !category || !billingCycle) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const subscription = {
      id: `sub_${Date.now()}`,
      userId,
      name: name.trim(),
      amount: Math.abs(parseFloat(amount)),
      category: category.trim().charAt(0).toUpperCase() + category.slice(1),
      billingCycle,
      nextDueDate,
      createdAt: new Date().toISOString(),
    };

    subscriptions.push(subscription);
    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/subscriptions/:id
 * Update a subscription
 */
app.put('/api/subscriptions/:id', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const { id } = req.params;
    const subscription = subscriptions.find(s => s.id === id && s.userId === userId);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const { name, amount, category, billingCycle, nextDueDate } = req.body;

    if (name) subscription.name = name.trim();
    if (amount) subscription.amount = Math.abs(parseFloat(amount));
    if (category) subscription.category = category.trim().charAt(0).toUpperCase() + category.slice(1);
    if (billingCycle) subscription.billingCycle = billingCycle;
    if (nextDueDate) subscription.nextDueDate = nextDueDate;
    subscription.updatedAt = new Date().toISOString();

    res.json(subscription);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/subscriptions/:id
 * Delete a subscription
 */
app.delete('/api/subscriptions/:id', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const { id } = req.params;
    const index = subscriptions.findIndex(s => s.id === id && s.userId === userId);

    if (index === -1) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const deleted = subscriptions.splice(index, 1);
    res.json({ deleted: deleted[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/spending-report
 * Get spending analytics for the user
 */
app.get('/api/spending-report', (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Missing user ID' });
    }

    const userSubs = subscriptions.filter(sub => sub.userId === userId);

    let monthlyTotal = 0;
    let yearlyEquivalent = 0;
    const categoryBreakdown = {};
    const upcomingDues = [];

    userSubs.forEach((sub) => {
      const monthlyCost =
        sub.billingCycle === 'monthly' ? sub.amount : sub.amount / 12;

      monthlyTotal += monthlyCost;
      yearlyEquivalent +=
        sub.billingCycle === 'yearly' ? sub.amount : sub.amount * 12;

      categoryBreakdown[sub.category] =
        (categoryBreakdown[sub.category] || 0) + monthlyCost;

      upcomingDues.push({
        name: sub.name,
        nextDueDate: sub.nextDueDate,
        amount: sub.amount,
        billingCycle: sub.billingCycle,
      });
    });

    upcomingDues.sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate));

    res.json({
      monthlyTotal: parseFloat(monthlyTotal.toFixed(2)),
      yearlyEquivalent: parseFloat(yearlyEquivalent.toFixed(2)),
      totalSubscriptions: userSubs.length,
      categoryBreakdown,
      upcomingDues: upcomingDues.slice(0, 5),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Subscription Tracker API listening on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
