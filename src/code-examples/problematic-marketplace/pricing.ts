import { MarketplaceSettings } from "./config";
import { Cart, Coupon, Currency, PriceBreakdown, User } from "./domain";

export class PricingService {
  constructor(private readonly config: MarketplaceSettings) {}

  calculate(
    cart: Cart,
    user: User,
    requestedCurrency: Currency,
    coupon: Coupon | undefined,
    shipping: number,
  ): PriceBreakdown {
    const sourceCurrency = cart.items[0]?.currency ?? requestedCurrency;
    let itemsTotal = cart.items.reduce(
      (total, item) => total + item.unitPrice * item.quantity,
      0,
    );

    if (sourceCurrency !== requestedCurrency) {
      const exchangeKey = `${sourceCurrency}_${requestedCurrency}`;
      itemsTotal *= this.config.exchangeRates[exchangeKey] ?? 1;
    }

    const discount = coupon ? itemsTotal * (coupon.percentage / 100) : 0;
    const taxableAmount = itemsTotal - discount;
    const taxRate = user.state === "SP" ? 0.18 : 0.12;
    const tax = taxableAmount * taxRate;
    const loyaltyDiscount = user.loyaltyTier === "platinum" ? 12.5 : 0;
    const grandTotal = Math.max(
      0,
      Math.round((taxableAmount + tax + shipping - loyaltyDiscount) * 100) / 100,
    );

    return {
      itemsTotal,
      discount: discount + loyaltyDiscount,
      tax,
      shipping,
      grandTotal,
      currency: requestedCurrency,
    };
  }
}
