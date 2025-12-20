import { config } from "dotenv";
import Stripe from "stripe";

config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getPriceForProduct(productId) {
  try {
    // List all prices for the product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 10,
    });

    console.log(
      `\nFound ${prices.data.length} active price(s) for product ${productId}:\n`,
    );

    prices.data.forEach((price, index) => {
      console.log(`Price #${index + 1}:`);
      console.log(`  ID: ${price.id}`);
      console.log(
        `  Amount: ${price.unit_amount ? `$${(price.unit_amount / 100).toFixed(2)}` : "N/A"}`,
      );
      console.log(`  Currency: ${price.currency.toUpperCase()}`);
      console.log(
        `  Billing: ${price.recurring ? `${price.recurring.interval_count} ${price.recurring.interval}(s)` : "one-time"}`,
      );
      console.log(``);
    });

    if (prices.data.length > 0) {
      console.log(`\nTo use this in your code, set:`);
      console.log(`  const STRIPE_PRICE_ID = "${prices.data[0].id}";`);
      return prices.data[0].id;
    } else {
      console.log(`\nNo active prices found for this product.`);
      console.log(`Please create a price in the Stripe Dashboard.`);
      return null;
    }
  } catch (error) {
    console.error("Error fetching price:", error.message);
    return null;
  }
}

const productId = process.argv[2] || "prod_TRokgs5QjojmQR";
void getPriceForProduct(productId);
