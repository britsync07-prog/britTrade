const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const authService = require('../services/authService');
const authMiddleware = require('./authMiddleware');
const db = require('../db');

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

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
            },
            unit_amount: plan.amount,
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
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
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
