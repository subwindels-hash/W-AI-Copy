/**
 * Module 161: AI Model Marketplace Service
 * WINDELS AI OS - Phase 4
 * 
 * Provides comprehensive marketplace capabilities for AI models including model listing,
 * publishing, pricing, licensing, marketplace analytics, and purchase management.
 */

import { randomUUID } from 'crypto';

export interface ModelListing {
  id: string;
  organizationId: string;
  modelId: string;
  modelVersion: string;
  title: string;
  description: string;
  category: ModelCategory;
  tags: string[];
  pricing: PricingModel;
  licensing: LicensingModel;
  status: ListingStatus;
  publisher: PublisherInfo;
  metrics: ListingMetrics;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export type ModelCategory = 
  | 'nlp' | 'computer_vision' | 'audio' | 'reinforcement_learning'
  | 'generative' | 'classification' | 'regression' | 'other';

export interface PricingModel {
  type: 'free' | 'one_time' | 'subscription' | 'usage_based';
  price?: number;
  currency: string;
  subscriptionPeriod?: 'monthly' | 'yearly';
  usageUnit?: 'request' | 'token' | 'hour';
  freeTier?: {
    enabled: boolean;
    limit: number;
    period: 'day' | 'month';
  };
}

export interface LicensingModel {
  type: 'open_source' | 'proprietary' | 'commercial' | 'research';
  licenseName?: string;
  restrictions: string[];
  commercialUse: boolean;
  modificationAllowed: boolean;
  redistributionAllowed: boolean;
}

export type ListingStatus = 'draft' | 'published' | 'unpublished' | 'suspended';

export interface PublisherInfo {
  organizationId: string;
  organizationName: string;
  verified: boolean;
  rating: number;
  totalListings: number;
}

export interface ListingMetrics {
  views: number;
  downloads: number;
  purchases: number;
  rating: number;
  totalRatings: number;
  revenue: number;
}

export interface Purchase {
  id: string;
  listingId: string;
  buyerId: string;
  buyerOrganizationId: string;
  pricing: PricingModel;
  amount: number;
  currency: string;
  status: PurchaseStatus;
  licenseKey?: string;
  purchasedAt: string;
  expiresAt?: string;
}

export type PurchaseStatus = 'pending' | 'completed' | 'refunded' | 'expired';

export interface MarketplaceSearch {
  query?: string;
  categories?: ModelCategory[];
  tags?: string[];
  pricingTypes?: PricingModel['type'][];
  minRating?: number;
  sortBy: 'relevance' | 'rating' | 'downloads' | 'price' | 'newest';
  page: number;
  pageSize: number;
}

export interface MarketplaceAnalytics {
  totalListings: number;
  publishedListings: number;
  totalPurchases: number;
  totalRevenue: number;
  topCategories: Array<{ category: ModelCategory; count: number }>;
  trendingModels: Array<{ listingId: string; title: string; downloads: number }>;
}

const modelListings = new Map<string, ModelListing>();
const purchases = new Map<string, Purchase[]>();
const marketplaceAnalytics = new Map<string, MarketplaceAnalytics>();

export function createModelListing(params: {
  organizationId: string;
  modelId: string;
  modelVersion: string;
  title: string;
  description: string;
  category: ModelCategory;
  tags?: string[];
  pricing: PricingModel;
  licensing: LicensingModel;
  publisher: PublisherInfo;
}): ModelListing {
  const now = new Date().toISOString();
  const listing: ModelListing = {
    id: randomUUID(),
    organizationId: params.organizationId,
    modelId: params.modelId,
    modelVersion: params.modelVersion,
    title: params.title,
    description: params.description,
    category: params.category,
    tags: params.tags || [],
    pricing: params.pricing,
    licensing: params.licensing,
    status: 'draft',
    publisher: params.publisher,
    metrics: {
      views: 0,
      downloads: 0,
      purchases: 0,
      rating: 0,
      totalRatings: 0,
      revenue: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
  modelListings.set(listing.id, listing);
  purchases.set(listing.id, []);
  return listing;
}

export function getModelListing(id: string): ModelListing | undefined {
  const listing = modelListings.get(id);
  if (listing) {
    listing.metrics.views++;
    listing.updatedAt = new Date().toISOString();
  }
  return listing;
}

export function publishListing(listingId: string): ModelListing {
  const listing = modelListings.get(listingId);
  if (!listing) throw new Error(`Listing ${listingId} not found`);
  listing.status = 'published';
  listing.publishedAt = new Date().toISOString();
  listing.updatedAt = new Date().toISOString();
  return listing;
}

export function unpublishListing(listingId: string): ModelListing {
  const listing = modelListings.get(listingId);
  if (!listing) throw new Error(`Listing ${listingId} not found`);
  listing.status = 'unpublished';
  listing.updatedAt = new Date().toISOString();
  return listing;
}

export function purchaseModel(listingId: string, buyerId: string, buyerOrganizationId: string): Purchase {
  const listing = modelListings.get(listingId);
  if (!listing) throw new Error(`Listing ${listingId} not found`);
  if (listing.status !== 'published') throw new Error('Listing is not published');

  const now = new Date().toISOString();
  const purchase: Purchase = {
    id: randomUUID(),
    listingId,
    buyerId,
    buyerOrganizationId,
    pricing: listing.pricing,
    amount: listing.pricing.price || 0,
    currency: listing.pricing.currency,
    status: 'completed',
    licenseKey: listing.licensing.type !== 'open_source' ? randomUUID() : undefined,
    purchasedAt: now,
    expiresAt: listing.pricing.subscriptionPeriod === 'monthly' 
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : listing.pricing.subscriptionPeriod === 'yearly'
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : undefined,
  };

  const listingPurchases = purchases.get(listingId) || [];
  listingPurchases.push(purchase);
  purchases.set(listingId, listingPurchases);

  listing.metrics.purchases++;
  listing.metrics.revenue += purchase.amount;
  listing.metrics.downloads++;
  listing.updatedAt = now;

  return purchase;
}

export function getListingPurchases(listingId: string): Purchase[] {
  return purchases.get(listingId) || [];
}

export function searchMarketplace(search: MarketplaceSearch): { listings: ModelListing[]; total: number } {
  let results = Array.from(modelListings.values()).filter(l => l.status === 'published');

  if (search.query) {
    const query = search.query.toLowerCase();
    results = results.filter(l => 
      l.title.toLowerCase().includes(query) ||
      l.description.toLowerCase().includes(query) ||
      l.tags.some(t => t.toLowerCase().includes(query))
    );
  }

  if (search.categories && search.categories.length > 0) {
    results = results.filter(l => search.categories!.includes(l.category));
  }

  if (search.tags && search.tags.length > 0) {
    results = results.filter(l => l.tags.some(t => search.tags!.includes(t)));
  }

  if (search.pricingTypes && search.pricingTypes.length > 0) {
    results = results.filter(l => search.pricingTypes!.includes(l.pricing.type));
  }

  if (search.minRating) {
    results = results.filter(l => l.metrics.rating >= search.minRating!);
  }

  // Sort
  switch (search.sortBy) {
    case 'rating':
      results.sort((a, b) => b.metrics.rating - a.metrics.rating);
      break;
    case 'downloads':
      results.sort((a, b) => b.metrics.downloads - a.metrics.downloads);
      break;
    case 'price':
      results.sort((a, b) => (a.pricing.price || 0) - (b.pricing.price || 0));
      break;
    case 'newest':
      results.sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
      break;
    default:
      // relevance - keep original order
      break;
  }

  const total = results.length;
  const start = (search.page - 1) * search.pageSize;
  const paginatedResults = results.slice(start, start + search.pageSize);

  return { listings: paginatedResults, total };
}

export function getMarketplaceAnalytics(organizationId: string): MarketplaceAnalytics {
  const listings = Array.from(modelListings.values()).filter(l => l.organizationId === organizationId);
  const publishedListings = listings.filter(l => l.status === 'published');
  
  const totalPurchases = listings.reduce((sum, l) => sum + l.metrics.purchases, 0);
  const totalRevenue = listings.reduce((sum, l) => sum + l.metrics.revenue, 0);

  const categoryCounts = new Map<ModelCategory, number>();
  listings.forEach(l => {
    categoryCounts.set(l.category, (categoryCounts.get(l.category) || 0) + 1);
  });

  const topCategories = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const trendingModels = listings
    .sort((a, b) => b.metrics.downloads - a.metrics.downloads)
    .slice(0, 10)
    .map(l => ({ listingId: l.id, title: l.title, downloads: l.metrics.downloads }));

  const analytics: MarketplaceAnalytics = {
    totalListings: listings.length,
    publishedListings: publishedListings.length,
    totalPurchases,
    totalRevenue,
    topCategories,
    trendingModels,
  };

  marketplaceAnalytics.set(organizationId, analytics);
  return analytics;
}

export function getMarketplaceDashboard(organizationId: string) {
  const analytics = marketplaceAnalytics.get(organizationId);
  if (!analytics) {
    return {
      totalListings: 0,
      publishedListings: 0,
      totalPurchases: 0,
      totalRevenue: 0,
      topCategories: [],
      trendingModels: [],
    };
  }
  return analytics;
}
