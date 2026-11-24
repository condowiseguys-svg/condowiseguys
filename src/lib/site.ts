// Central place for business details Brian may want to change.
// Prices are null until Brian sets them; the site shows "Price coming soon" meanwhile.
export const site = {
  name: "Condo Wise Guys",
  domain: "condowiseguys.com",
  email: "report@condowiseguys.com",
  tagline: "BC strata document reviews, in plain English",
  /**
   * Postal mailing address only: there is no walk-in office. It has been the business address
   * for 26 years and is how the business is listed on Google, so keep it written the same way.
   * Canada's anti-spam law (CASL) requires one in any email that promotes a service, so the
   * DreamHomeGroup.ca line in report emails stays off while this is null.
   */
  mailingAddress: "9-3151 Lakeshore Road, #199, Kelowna, BC V1W 3S9" as string | null,
};

/**
 * What a review covers. Brian's E&O insurance excludes mould claims, so every report and the
 * order page say plainly that the review is of the documents only: no site visit, and no physical,
 * mould or environmental inspection. Change the wording here and it updates everywhere.
 */
export const reviewScope = {
  /** One line, for footers, emails and page footers in the PDF. */
  line: "Document review only: not a physical, structural, mould or environmental inspection, legal advice or an appraisal.",
  /** Short version for the site. */
  short:
    "Our reviews cover the strata documents you provide, and nothing else. We do not visit or inspect the property. A review is not a physical, home or structural inspection, not a mould or environmental inspection, and not legal advice or an appraisal.",
  /** Full version for the report and the order page. */
  full: [
    "This review covers only the strata documents provided to Condo Wise Guys. We did not visit, view or inspect the property, the building or the unit.",
    "It is not a physical, home or building inspection, a structural or engineering assessment, or a mould, air quality or environmental inspection. It does not assess the condition of the structure, building envelope, roof, plumbing, mechanical, electrical or fire safety systems, or compliance with building codes. It cannot confirm whether mould, moisture damage, asbestos or other hazardous materials are present or absent. Where the documents mention any of these, we report what the documents say.",
    "It is not legal advice, an appraisal or financial advice. It relies on the documents being accurate and complete: anything not in the package, or changed since, is not covered.",
  ],
};

/**
 * The free Condo Buyers Guide. The PDF lives in public/guides; replace that file to publish a new
 * edition (source: project files, condo-buyers-guide/). It is a free download on /buyers-guide and
 * goes with every delivered report.
 */
export const buyersGuide = {
  title: "Condo Buyers Guide",
  subtitle: "Reading the Strata Documents Before You Buy",
  pdfPath: "/guides/condo-buyers-guide.pdf",
  coverPath: "/guides/condo-buyers-guide-cover.png",
  pagePath: "/buyers-guide",
  fileName: "Condo-Buyers-Guide.pdf",
  pages: 51,
};

/**
 * Brian's appraisal and depreciation report company. Condo Wise Guys and DreamHomeGroup.ca have
 * the same owner, so every mention says so.
 */
export const sisterCompany = {
  name: "DreamHomeGroup.ca – Real Property Solutions",
  shortName: "DreamHomeGroup.ca",
  url: "https://dreamhomegroup.ca",
  owner: "Brian A. Hill, B.Comm., DAR, DRP, CRP",
  services: [
    "Market value residential appraisals",
    "Replacement cost (insurance) appraisals for strata and condo buildings",
    "Depreciation reports for BC strata corporations",
  ],
};

/**
 * Brian's background for the About page and the report. Taken from his qualifications sheet
 * (Nov 2026): add nothing here that isn't on it.
 */
export const founder = {
  name: "Brian A. Hill",
  designations: "B.Comm., DAR, DRP, CRP",
  /** Short line used on the home page, the realtor page and in reports. */
  summary:
    "An appraiser since 1986 and a reserve planner since 2012, with DAR, DRP and CRP designations.",
  history: [
    "Brian Hill began his appraisal career at CMHC before moving into the private sector. As technology advanced and the industry evolved, so did Brian.",
    "He went on to work with The Appraisal Group, another independent firm, and then served as President of Associated Appraisal Co. in Saskatoon.",
    "Dream Home Appraisal began in 2000, providing residential appraisal services in Saskatchewan, Alberta and British Columbia. In recent years its services have expanded to include depreciation reports (also called reserve fund studies) and replacement cost estimates throughout BC, including the Okanagan Valley, the Shuswap, Vancouver Island and other BC communities. Today the company is DreamHomeGroup.ca – Real Property Solutions.",
    "Condo Wise Guys puts that experience to work for people buying a strata home in BC. On Expert Reviewed orders, Brian checks every finding himself before the report is sent.",
  ],
  designationsHeld: [
    {
      name: "DAR, Designated Appraiser Residential",
      from: "Canadian National Association of Real Estate Appraisers (CNAREA), 2012",
    },
    {
      name: "DRP, Designated Reserve Planner",
      from: "Canadian National Association of Real Estate Appraisers (CNAREA), 2012",
    },
    { name: "CRP, Certified Reserve Planner", from: "Real Estate Institute of Canada (REIC)" },
  ],
  education: [
    "B.Comm. (Finance), University of Saskatchewan, 1986",
    "CRA, Canadian Residential Appraiser, UBC Sauder, 1995",
    "Canadian Securities Course (CSC), Canadian Securities Institute, 1983",
  ],
  current: [
    "President, DreamHomeGroup.ca – Real Property Solutions",
    "President, Associated Reserve Planners of Canada Inc., 2013 to present",
    "Exclusive reseller of RFA Pro reserve fund analysis software, 2012 to present",
    "Standards Committee member, International Capital Budgeting Institute, 2015 to present",
    "Board member, International Capital Budgeting Institute",
  ],
  past: [
    "Instructor, DRP program, Canadian National Association of Real Estate Appraisers, 2012 to 2015",
    "President, Associated Appraisal Co., 1990 to 2001",
    "Appraiser, The Appraisal Group, 1986 to 1990",
    "Appraiser, CMHC, 1986",
    "Investment advisor, Investors Group, 1985 to 1986",
  ],
};

/** The exact wording shown next to the opt-in box on the order form. Stored with each consent. */
export const MARKETING_CONSENT_TEXT = `Send me occasional emails about appraisals and depreciation reports from ${sisterCompany.name}, our sister company with the same owner. I can unsubscribe at any time.`;

/** Link to DreamHomeGroup.ca tagged with where it came from, so Brian can see which links work. */
export function sisterLink(placement: string) {
  return `${sisterCompany.url}/?utm_source=condowiseguys&utm_medium=referral&utm_campaign=${encodeURIComponent(placement)}`;
}

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
      "Free Condo Buyers Guide (51-page PDF) with your report",
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
