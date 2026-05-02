/**
 * Script locale: non committare mai chiavi API.
 * Uso: STRIPE_SECRET_KEY=sk_test_... node test-stripe.js
 */
const Stripe = require('stripe');

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error(
    'Imposta STRIPE_SECRET_KEY nel tuo ambiente (es. export STRIPE_SECRET_KEY=sk_test_... dalla Dashboard Stripe).'
  );
  process.exit(1);
}

const stripe = new Stripe(key, {
  apiVersion: '2023-10-16',
});

async function run() {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'paypal'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'Test Product' },
            unit_amount: 1000,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'http://localhost:3000/success',
      cancel_url: 'http://localhost:3000/cancel',
    });
    console.log('Success! URL:', session.url);
  } catch (error) {
    console.error('Stripe Error:', error.message);
  }
}
run();
