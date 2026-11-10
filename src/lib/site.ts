// Central place for business details Brian may want to change.
// Prices are null until Brian sets them; the site shows "Price coming soon" meanwhile.
export const site = {
  name: "Condo Wise Guys",
  domain: "condowiseguys.com",
  email: "info@condowiseguys.com",
  tagline: "BC strata document reviews, in plain English",
  retentionDays: 90,
};

export type Tier = {
  id: string;
  name: string;
  priceCad: number | null;
  /** Used only while Stripe is in test mode and no real price is set. */
  testPriceCad: number;
  turnaround: string;
  summary: string;
  features: string[];
  highlight?: boolean;
};

export const tiers: Tier[] = [
  {
    id: "standard",
    name: "Standard Review",
    priceCad: null,
    testPriceCad: 199,
    turnaround: "Within 1 business day",
    summary:
      "A full AI-assisted review of your strata package, delivered as a clear PDF report.",
    features: [
      "Every document in the package reviewed",
      "Red, amber and green risk ratings with page references",
      "Estimated special levy exposure for your unit",
      "Questions to ask before removing subjects",
    ],
  },
  {
    id: "expert",
    name: "Expert Reviewed",
    priceCad: null,
    testPriceCad: 349,
    turnaround: "1 to 2 business days",
    summary:
      "Everything in Standard, with every finding checked and edited by Brian before delivery.",
    features: [
      "Everything in Standard Review",
      "Personally reviewed by Brian before it is sent",
      "Written notes on the issues that matter most",
      "Follow-up questions answered by email",
    ],
    highlight: true,
  },
];

export const rushAddOn = {
  name: "Rush",
  priceCad: null as number | null,
  testPriceCad: 50,
  summary: "Moved to the front of the queue for tight subject-removal deadlines.",
};

export function formatPrice(price: number | null) {
  return price === null
    ? "Price coming soon"
    : `$${price.toLocaleString("en-CA")} CAD`;
}

/**
 * Price in cents for an order, before GST. Returns null when no real price is set
 * and we are not in Stripe test mode (so checkout stays closed).
 */
export function orderPriceCents(tierId: string, rush: boolean, testMode: boolean): number | null {
  const tier = tiers.find((t) => t.id === tierId);
  if (!tier) return null;
  const base = tier.priceCad ?? (testMode ? tier.testPriceCad : null);
  if (base === null) return null;
  const rushPrice = rush ? rushAddOn.priceCad ?? (testMode ? rushAddOn.testPriceCad : null) : 0;
  if (rushPrice === null) return null;
  return Math.round((base + rushPrice) * 100);
}
