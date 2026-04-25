const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const authMiddleware = require('./authMiddleware');
const db = require('../db');

// Get active offers
router.get('/offers', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const offers = await db.query(
      "SELECT * FROM offers WHERE status = 'active' AND startDate <= ? AND endDate >= ?",
      [now, now]
    );
    res.json(offers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Lazy-init Stripe to prevent crash if key is missing
let stripe;
const getStripe = () => {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('placeholder')) {
      throw new Error('STRIPE_SECRET_KEY is missing or invalid in environment variables.');
    }
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

// Create a Checkout Session
router.post('/create-session', authMiddleware, express.json(), async (req, res) => {
  try {
    const { planId } = req.body;
    
    const plans = {
      'low_risk': { name: 'Low Risk Strategy', amount: 2500 }, // $25.00
      'medium_risk': { name: 'Medium Risk Strategy', amount: 2000 },
      'high_risk': { name: 'High Risk Strategy', amount: 1500 },
      'bundle': { name: 'All Strategies Bundle', amount: 5000 }
    };

    const plan = plans[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    // Check for active offers for this plan
    let finalAmount = plan.amount;
    try {
      const now = new Date().toISOString();
      const activeOffer = await db.get(
        "SELECT * FROM offers WHERE planId = ? AND status = 'active' AND startDate <= ? AND endDate >= ? LIMIT 1",
        [planId, now, now]
      );

      if (activeOffer) {
        const discount = Math.floor(plan.amount * (activeOffer.discountPercentage / 100));
        finalAmount = plan.amount - discount;
        console.log(`[Payment] Applied ${activeOffer.discountPercentage}% discount to plan ${planId}. Original: ${plan.amount}, Final: ${finalAmount}`);
      }
    } catch (offerError) {
      console.error('[Payment] Failed to check for active offers:', offerError);
    }

    // Check if already purchased
    const existing = await db.get("SELECT id FROM purchases WHERE userId = ? AND planId = ?", [req.userId, planId]);
    if (existing) {
      return res.status(400).json({ error: 'You have already purchased this plan' });
    }

    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
            },
            unit_amount: finalAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/?canceled=true`,
      metadata: {
        userId: req.userId,
        planId: planId
      }
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error('[Stripe Create Session Error]', e.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, planId } = session.metadata;

    console.log(`[Stripe Webhook] Payment successful for User ${userId}, Plan ${planId}`);
    
    try {
      await authService.purchasePlan(Number(userId), planId);
    } catch (e) {
      console.error('[Webhook Error] Failed to grant access:', e.message);
      // Stripe will retry if we return 500, but since the payment was successful, 
      // we might want to log this and handle it manually if it fails repeatedly.
    }
  }

  res.json({ received: true });
});

module.exports = router;
