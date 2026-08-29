/**
 * Fixture catalog for the Stage 1 mock WMPC adapter (§32).
 *
 * DEVELOPMENT/TEST ONLY. Every product id is prefixed `WMPC-MOCK-` and every
 * vendor is named with a "(mock)" suffix so a fixture record is instantly
 * distinguishable from real marketplace data in logs, UI and support tickets.
 *
 * The fixtures deliberately include products with MISSING specs, warranty and
 * delivery estimates. That is the point: AI Commerce must render those as
 * "not available" rather than inventing them, and the tests assert it does.
 */
import type { WmpcProduct, WmpcMoney } from "@windels/shared";

export const MOCK_ID_PREFIX = "WMPC-MOCK-";

export function ngn(amountMinor: number): WmpcMoney {
  return {
    amountMinor,
    currency: "NGN",
    display: `₦${(amountMinor / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };
}

/**
 * Fixed catalog. Values are constants, never generated per request, so two
 * identical searches always return byte-identical results.
 */
export const MOCK_PRODUCTS: WmpcProduct[] = [
  {
    id: `${MOCK_ID_PREFIX}PHONE-001`,
    name: "Astra X5 Smartphone 128GB",
    description: "6.5-inch display smartphone with 128GB storage and dual SIM.",
    price: ngn(24500000),
    compareAtPrice: ngn(27900000),
    currency: "NGN",
    availability: "in_stock",
    stockQuantity: 42,
    images: ["https://fixtures.wmpc.invalid/phone-001.jpg"],
    category: "phones",
    brand: "Astra",
    vendor: { id: `${MOCK_ID_PREFIX}V-1`, name: "Lagos Digital Hub (mock)", rating: 4.6, verified: true },
    specs: [
      { key: "storage", label: "Storage", value: "128GB" },
      { key: "ram", label: "RAM", value: "6GB" },
      { key: "battery", label: "Battery", value: "5000mAh" },
      { key: "screen", label: "Screen", value: "6.5 inch" },
      { key: "camera", label: "Rear camera", value: "50MP" },
    ],
    rating: { average: 4.4, count: 218 },
    warranty: "12 months manufacturer warranty",
    returnPolicy: "7-day return window",
    deliveryEstimate: "2-4 business days within Lagos",
  },
  {
    id: `${MOCK_ID_PREFIX}PHONE-002`,
    name: "Nimbus Lite 5G 256GB",
    description: "5G smartphone with 256GB storage.",
    price: ngn(31800000),
    currency: "NGN",
    availability: "low_stock",
    stockQuantity: 3,
    images: ["https://fixtures.wmpc.invalid/phone-002.jpg"],
    category: "phones",
    brand: "Nimbus",
    vendor: { id: `${MOCK_ID_PREFIX}V-2`, name: "Ikeja Electronics (mock)", rating: 4.2, verified: true },
    specs: [
      { key: "storage", label: "Storage", value: "256GB" },
      { key: "ram", label: "RAM", value: "8GB" },
      { key: "battery", label: "Battery", value: "4800mAh" },
      { key: "screen", label: "Screen", value: "6.7 inch" },
      // NOTE: no `camera` spec — must render as "not available", never guessed.
    ],
    rating: { average: 4.1, count: 76 },
    // NOTE: no warranty, no returnPolicy, no deliveryEstimate published.
  },
  {
    id: `${MOCK_ID_PREFIX}PHONE-003`,
    name: "Astra Budget A2 64GB",
    description: "Entry-level smartphone with 64GB storage.",
    price: ngn(9900000),
    currency: "NGN",
    availability: "in_stock",
    stockQuantity: 120,
    images: ["https://fixtures.wmpc.invalid/phone-003.jpg"],
    category: "phones",
    brand: "Astra",
    vendor: { id: `${MOCK_ID_PREFIX}V-1`, name: "Lagos Digital Hub (mock)", rating: 4.6, verified: true },
    specs: [
      { key: "storage", label: "Storage", value: "64GB" },
      { key: "ram", label: "RAM", value: "4GB" },
      { key: "battery", label: "Battery", value: "4000mAh" },
      { key: "screen", label: "Screen", value: "6.1 inch" },
      { key: "camera", label: "Rear camera", value: "13MP" },
    ],
    rating: { average: 3.9, count: 512 },
    warranty: "6 months warranty",
    returnPolicy: "7-day return window",
    deliveryEstimate: "3-5 business days",
  },
  {
    id: `${MOCK_ID_PREFIX}SHOE-001`,
    name: "Meridian Black Leather Derby",
    description: "Black leather formal shoe with rubber sole.",
    price: ngn(4200000),
    currency: "NGN",
    availability: "in_stock",
    stockQuantity: 18,
    images: ["https://fixtures.wmpc.invalid/shoe-001.jpg"],
    category: "shoes",
    brand: "Meridian",
    vendor: { id: `${MOCK_ID_PREFIX}V-3`, name: "Balogun Footwear (mock)", rating: 4.0, verified: false },
    specs: [
      { key: "color", label: "Colour", value: "Black" },
      { key: "material", label: "Material", value: "Leather" },
      { key: "size_range", label: "Sizes", value: "40-46" },
    ],
    rating: { average: 4.3, count: 91 },
    returnPolicy: "14-day return window",
  },
  {
    id: `${MOCK_ID_PREFIX}SHOE-002`,
    name: "Trailrun Black Sneaker",
    description: "Black running sneaker with mesh upper.",
    price: ngn(2850000),
    currency: "NGN",
    availability: "in_stock",
    stockQuantity: 64,
    images: ["https://fixtures.wmpc.invalid/shoe-002.jpg"],
    category: "shoes",
    brand: "Trailrun",
    vendor: { id: `${MOCK_ID_PREFIX}V-3`, name: "Balogun Footwear (mock)", rating: 4.0, verified: false },
    specs: [
      { key: "color", label: "Colour", value: "Black" },
      { key: "material", label: "Material", value: "Mesh" },
      { key: "size_range", label: "Sizes", value: "38-47" },
    ],
    rating: { average: 4.5, count: 340 },
    deliveryEstimate: "2-3 business days",
  },
  {
    id: `${MOCK_ID_PREFIX}SHOE-003`,
    name: "Meridian Brown Loafer",
    description: "Brown suede loafer.",
    price: ngn(5600000),
    currency: "NGN",
    availability: "out_of_stock",
    stockQuantity: 0,
    images: ["https://fixtures.wmpc.invalid/shoe-003.jpg"],
    category: "shoes",
    brand: "Meridian",
    vendor: { id: `${MOCK_ID_PREFIX}V-3`, name: "Balogun Footwear (mock)", rating: 4.0, verified: false },
    specs: [
      { key: "color", label: "Colour", value: "Brown" },
      { key: "material", label: "Material", value: "Suede" },
    ],
  },
  {
    id: `${MOCK_ID_PREFIX}LAPTOP-001`,
    name: "Vector Pro 14 Laptop 512GB",
    description: "14-inch laptop with 512GB SSD and 16GB RAM.",
    price: ngn(78500000),
    currency: "NGN",
    availability: "in_stock",
    stockQuantity: 9,
    images: ["https://fixtures.wmpc.invalid/laptop-001.jpg"],
    category: "laptops",
    brand: "Vector",
    vendor: { id: `${MOCK_ID_PREFIX}V-1`, name: "Lagos Digital Hub (mock)", rating: 4.6, verified: true },
    specs: [
      { key: "storage", label: "Storage", value: "512GB SSD" },
      { key: "ram", label: "RAM", value: "16GB" },
      { key: "screen", label: "Screen", value: "14 inch" },
      { key: "cpu", label: "Processor", value: "8-core" },
    ],
    rating: { average: 4.7, count: 43 },
    warranty: "24 months warranty",
    returnPolicy: "14-day return window",
    deliveryEstimate: "3-6 business days",
  },
];

/** Fixture gift cards. Codes are obviously non-production. */
export const MOCK_GIFT_CARDS: Record<string, { balanceMinor: number; currency: string; expiresAt?: string }> = {
  "WMPC-MOCK-GIFT-5000": { balanceMinor: 500000, currency: "NGN" },
  "WMPC-MOCK-GIFT-20000": { balanceMinor: 2000000, currency: "NGN", expiresAt: "2027-12-31T23:59:59.000Z" },
  "WMPC-MOCK-GIFT-EMPTY": { balanceMinor: 0, currency: "NGN" },
};
