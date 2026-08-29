/**
 * Agent Marketplace Service (Module 15 — Gap 2)
 *
 * Agent marketplace catalog and acquisition:
 * - Publish agent packages to marketplace
 * - Browse and discover agents
 * - Install agents from marketplace
 * - Manage installed agents
 * - Track installations and usage
 * - Featured and recommended agents
 *
 * Enables agent ecosystem and distribution.
 */
import { randomUUID } from "node:crypto";
import { redisCmd } from "../db/redis.js";
import { logger } from "../config/logger.js";
import { prisma } from "../db/client.js";
import {
  getAgentPackage,
  listAgentPackages,
  type AgentPackage,
} from "./agentPackaging.service";

// ─── Types ──────────────────────────────────────────────────────

export interface MarketplaceListing {
  id: string;
  packageId: string;
  packageName: string;
  packageVersion: string;
  displayName: string;
  description: string;
  author: string;
  authorId: string;
  organizationId: string;
  department: string;
  category: string;
  tags: string[];
  icon?: string;
  screenshots: string[];
  rating: number; // 0-5
  ratingCount: number;
  installCount: number;
  price: MarketplacePrice;
  license: string;
  compliance: string[];
  featured: boolean;
  recommended: boolean;
  status: "draft" | "pending" | "published" | "deprecated" | "removed";
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplacePrice {
  type: "free" | "one-time" | "subscription" | "enterprise";
  amount?: number; // USD
  currency?: string;
  subscriptionInterval?: "monthly" | "yearly";
  trialDays?: number;
}

export interface MarketplaceInstallation {
  id: string;
  listingId: string;
  packageId: string;
  packageName: string;
  packageVersion: string;
  organizationId: string;
  installedBy: string;
  installedAt: string;
  status: "installed" | "active" | "disabled" | "uninstalled";
  agentId?: string; // ID of the installed agent instance
  configuration?: Record<string, any>;
  lastUsedAt?: string;
  usageCount: number;
}

export interface MarketplaceReview {
  id: string;
  listingId: string;
  userId: string;
  userName: string;
  rating: number; // 1-5
  title: string;
  comment: string;
  helpful: number;
  verified: boolean; // Verified purchase
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceSearchResult {
  listings: MarketplaceListing[];
  total: number;
  filters: {
    departments: Array<{ name: string; count: number }>;
    categories: Array<{ name: string; count: number }>;
    tags: Array<{ name: string; count: number }>;
    priceTypes: Array<{ type: string; count: number }>;
  };
}

// ─── Redis Keys ─────────────────────────────────────────────────

const LISTINGS_KEY = "marketplace:listings";
const LISTING_KEY = (id: string) => `marketplace:listing:${id}`;
const LISTING_BY_PACKAGE_KEY = (packageId: string) => `marketplace:listing:package:${packageId}`;
const INSTALLATIONS_KEY = "marketplace:installations";
const INSTALLATION_KEY = (id: string) => `marketplace:installation:${id}`;
const ORG_INSTALLATIONS_KEY = (orgId: string) => `marketplace:org:${orgId}:installations`;
const REVIEWS_KEY = (listingId: string) => `marketplace:reviews:${listingId}`;
const FEATURED_KEY = "marketplace:featured";
const RECOMMENDED_KEY = "marketplace:recommended";

// ─── Listing Management ─────────────────────────────────────────

/**
 * Publish an agent package to the marketplace.
 */
export async function publishToListing(input: {
  packageId: string;
  price: MarketplacePrice;
  featured?: boolean;
  recommended?: boolean;
}): Promise<MarketplaceListing> {
  const pkg = await getAgentPackage(input.packageId);
  if (!pkg) {
    throw new Error(`Package ${input.packageId} not found`);
  }

  const listingId = randomUUID();
  const now = new Date().toISOString();

  const listing: MarketplaceListing = {
    id: listingId,
    packageId: pkg.id,
    packageName: pkg.metadata.name,
    packageVersion: pkg.metadata.version,
    displayName: pkg.metadata.displayName,
    description: pkg.metadata.description,
    author: pkg.metadata.author,
    authorId: pkg.metadata.authorId,
    organizationId: pkg.metadata.organizationId,
    department: pkg.metadata.department,
    category: pkg.metadata.category,
    tags: pkg.metadata.tags,
    icon: pkg.metadata.icon,
    screenshots: pkg.metadata.screenshots ?? [],
    rating: 0,
    ratingCount: 0,
    installCount: 0,
    price: input.price,
    license: pkg.metadata.license,
    compliance: pkg.metadata.compliance,
    featured: input.featured ?? false,
    recommended: input.recommended ?? false,
    status: "published",
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  // Store listing
  await redisCmd.set(LISTING_KEY(listingId), JSON.stringify(listing));
  await redisCmd.sadd(LISTINGS_KEY, listingId);
  await redisCmd.set(LISTING_BY_PACKAGE_KEY(input.packageId), listingId);

  if (listing.featured) {
    await redisCmd.sadd(FEATURED_KEY, listingId);
  }

  if (listing.recommended) {
    await redisCmd.sadd(RECOMMENDED_KEY, listingId);
  }

  logger.info("Agent published to marketplace", {
    listingId,
    packageId: input.packageId,
    name: pkg.metadata.name,
    version: pkg.metadata.version,
  });

  return listing;
}

/**
 * Get a marketplace listing by ID.
 */
export async function getListing(id: string): Promise<MarketplaceListing | null> {
  const data = await redisCmd.get(LISTING_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * Get a marketplace listing by package ID.
 */
export async function getListingByPackage(packageId: string): Promise<MarketplaceListing | null> {
  const listingId = await redisCmd.get(LISTING_BY_PACKAGE_KEY(packageId));
  return listingId ? getListing(listingId) : null;
}

/**
 * List marketplace listings with filters.
 */
export async function listListings(filter?: {
  department?: string;
  category?: string;
  tags?: string[];
  priceType?: string;
  featured?: boolean;
  recommended?: boolean;
  status?: string;
  authorId?: string;
  search?: string;
  sortBy?: "popular" | "rating" | "newest" | "name";
  limit?: number;
  offset?: number;
}): Promise<MarketplaceSearchResult> {
  const listingIds = await redisCmd.smembers(LISTINGS_KEY);
  let listings: MarketplaceListing[] = [];

  for (const id of listingIds) {
    const listing = await getListing(id);
    if (!listing) continue;

    // Apply filters
    if (filter?.status && listing.status !== filter.status) continue;
    if (!filter?.status && listing.status !== "published") continue;
    if (filter?.department && listing.department !== filter.department) continue;
    if (filter?.category && listing.category !== filter.category) continue;
    if (filter?.priceType && listing.price.type !== filter.priceType) continue;
    if (filter?.featured && !listing.featured) continue;
    if (filter?.recommended && !listing.recommended) continue;
    if (filter?.authorId && listing.authorId !== filter.authorId) continue;

    if (filter?.tags?.length) {
      const hasAllTags = filter.tags.every(tag => listing.tags.includes(tag));
      if (!hasAllTags) continue;
    }

    if (filter?.search) {
      const searchLower = filter.search.toLowerCase();
      const matches =
        listing.displayName.toLowerCase().includes(searchLower) ||
        listing.description.toLowerCase().includes(searchLower) ||
        listing.tags.some(tag => tag.toLowerCase().includes(searchLower));
      if (!matches) continue;
    }

    listings.push(listing);
  }

  // Calculate filter counts
  const allListings = listings;
  const departments = new Map<string, number>();
  const categories = new Map<string, number>();
  const tags = new Map<string, number>();
  const priceTypes = new Map<string, number>();

  for (const listing of allListings) {
    departments.set(listing.department, (departments.get(listing.department) ?? 0) + 1);
    categories.set(listing.category, (categories.get(listing.category) ?? 0) + 1);
    priceTypes.set(listing.price.type, (priceTypes.get(listing.price.type) ?? 0) + 1);
    for (const tag of listing.tags) {
      tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
  }

  // Sort listings
  const sortBy = filter?.sortBy ?? "popular";
  switch (sortBy) {
    case "popular":
      listings.sort((a, b) => b.installCount - a.installCount);
      break;
    case "rating":
      listings.sort((a, b) => b.rating - a.rating);
      break;
    case "newest":
      listings.sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!));
      break;
    case "name":
      listings.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
  }

  // Apply pagination
  const total = listings.length;
  const offset = filter?.offset ?? 0;
  const limit = filter?.limit ?? 50;
  listings = listings.slice(offset, offset + limit);

  return {
    listings,
    total,
    filters: {
      departments: Array.from(departments.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      categories: Array.from(categories.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      tags: Array.from(tags.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      priceTypes: Array.from(priceTypes.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

/**
 * Update a marketplace listing.
 */
export async function updateListing(
  listingId: string,
  updates: Partial<MarketplaceListing>,
): Promise<MarketplaceListing | null> {
  const listing = await getListing(listingId);
  if (!listing) return null;

  Object.assign(listing, updates, { updatedAt: new Date().toISOString() });
  await redisCmd.set(LISTING_KEY(listingId), JSON.stringify(listing));

  // Update featured/recommended sets
  if (updates.featured !== undefined) {
    if (updates.featured) {
      await redisCmd.sadd(FEATURED_KEY, listingId);
    } else {
      await redisCmd.srem(FEATURED_KEY, listingId);
    }
  }

  if (updates.recommended !== undefined) {
    if (updates.recommended) {
      await redisCmd.sadd(RECOMMENDED_KEY, listingId);
    } else {
      await redisCmd.srem(RECOMMENDED_KEY, listingId);
    }
  }

  logger.info("Marketplace listing updated", { listingId, updates: Object.keys(updates) });

  return listing;
}

/**
 * Remove a listing from the marketplace.
 */
export async function removeListing(listingId: string): Promise<boolean> {
  const listing = await getListing(listingId);
  if (!listing) return false;

  await updateListing(listingId, { status: "removed" });
  await redisCmd.srem(FEATURED_KEY, listingId);
  await redisCmd.srem(RECOMMENDED_KEY, listingId);

  logger.info("Marketplace listing removed", { listingId });

  return true;
}

// ─── Installation Management ────────────────────────────────────

/**
 * Install an agent from the marketplace.
 */
export async function installFromMarketplace(input: {
  listingId: string;
  organizationId: string;
  installedBy: string;
  configuration?: Record<string, any>;
}): Promise<MarketplaceInstallation> {
  const listing = await getListing(input.listingId);
  if (!listing) {
    throw new Error(`Listing ${input.listingId} not found`);
  }

  if (listing.status !== "published") {
    throw new Error(`Listing is not published`);
  }

  const installationId = randomUUID();
  const now = new Date().toISOString();

  // Create agent instance from package
  const pkg = await getAgentPackage(listing.packageId);
  if (!pkg) {
    throw new Error(`Package ${listing.packageId} not found`);
  }

  // Create agent in database
  const agent = await prisma.agent.create({
    data: {
      name: `${pkg.agent.name} (Marketplace)`,
      role: pkg.agent.role,
      description: pkg.agent.description,
      systemPrompt: pkg.agent.systemPrompt,
      personality: pkg.agent.personality,
      capabilities: pkg.agent.capabilities,
      configuration: {
        ...pkg.agent.configuration,
        ...input.configuration,
        marketplaceListingId: listing.id,
        marketplacePackageId: pkg.id,
      },
      organizationId: input.organizationId,
      createdBy: input.installedBy,
    },
  });

  // Create installation record
  const installation: MarketplaceInstallation = {
    id: installationId,
    listingId: listing.id,
    packageId: listing.packageId,
    packageName: listing.packageName,
    packageVersion: listing.packageVersion,
    organizationId: input.organizationId,
    installedBy: input.installedBy,
    installedAt: now,
    status: "active",
    agentId: agent.id,
    configuration: input.configuration,
    usageCount: 0,
  };

  // Store installation
  await redisCmd.set(INSTALLATION_KEY(installationId), JSON.stringify(installation));
  await redisCmd.sadd(INSTALLATIONS_KEY, installationId);
  await redisCmd.sadd(ORG_INSTALLATIONS_KEY(input.organizationId), installationId);

  // Update listing install count
  listing.installCount++;
  await redisCmd.set(LISTING_KEY(listing.id), JSON.stringify(listing));

  logger.info("Agent installed from marketplace", {
    installationId,
    listingId: listing.id,
    agentId: agent.id,
    organizationId: input.organizationId,
  });

  return installation;
}

/**
 * Get an installation by ID.
 */
export async function getInstallation(id: string): Promise<MarketplaceInstallation | null> {
  const data = await redisCmd.get(INSTALLATION_KEY(id));
  return data ? JSON.parse(data) : null;
}

/**
 * List installations for an organization.
 */
export async function listOrgInstallations(
  organizationId: string,
): Promise<MarketplaceInstallation[]> {
  const installationIds = await redisCmd.smembers(ORG_INSTALLATIONS_KEY(organizationId));
  const installations: MarketplaceInstallation[] = [];

  for (const id of installationIds) {
    const installation = await getInstallation(id);
    if (installation) {
      installations.push(installation);
    }
  }

  return installations.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
}

/**
 * Uninstall an agent from the marketplace.
 */
export async function uninstallFromMarketplace(
  installationId: string,
): Promise<MarketplaceInstallation | null> {
  const installation = await getInstallation(installationId);
  if (!installation) return null;

  installation.status = "uninstalled";
  await redisCmd.set(INSTALLATION_KEY(installationId), JSON.stringify(installation));

  // Optionally delete the agent
  if (installation.agentId) {
    await prisma.agent.delete({ where: { id: installation.agentId } });
  }

  logger.info("Agent uninstalled from marketplace", {
    installationId,
    agentId: installation.agentId,
  });

  return installation;
}

// ─── Reviews & Ratings ──────────────────────────────────────────

/**
 * Add a review for a marketplace listing.
 */
export async function addReview(input: {
  listingId: string;
  userId: string;
  rating: number;
  title: string;
  comment: string;
}): Promise<MarketplaceReview> {
  const listing = await getListing(input.listingId);
  if (!listing) {
    throw new Error(`Listing ${input.listingId} not found`);
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    throw new Error(`User ${input.userId} not found`);
  }

  const reviewId = randomUUID();
  const now = new Date().toISOString();

  // Check if user has installed this listing
  const installations = await listOrgInstallations(listing.organizationId);
  const verified = installations.some(i => i.listingId === input.listingId);

  const review: MarketplaceReview = {
    id: reviewId,
    listingId: input.listingId,
    userId: input.userId,
    userName: user.name ?? user.email,
    rating: Math.max(1, Math.min(5, input.rating)),
    title: input.title,
    comment: input.comment,
    helpful: 0,
    verified,
    createdAt: now,
    updatedAt: now,
  };

  // Store review
  await redisCmd.rpush(REVIEWS_KEY(input.listingId), JSON.stringify(review));

  // Update listing rating
  const reviews = await getReviews(input.listingId);
  const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
  listing.rating = totalRating / reviews.length;
  listing.ratingCount = reviews.length;
  await redisCmd.set(LISTING_KEY(input.listingId), JSON.stringify(listing));

  logger.info("Review added", {
    reviewId,
    listingId: input.listingId,
    rating: input.rating,
    verified,
  });

  return review;
}

/**
 * Get reviews for a listing.
 */
export async function getReviews(
  listingId: string,
  limit = 50,
): Promise<MarketplaceReview[]> {
  const reviews = await redisCmd.lrange(REVIEWS_KEY(listingId), 0, limit - 1);
  return reviews.map(r => JSON.parse(r)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ─── Featured & Recommended ─────────────────────────────────────

/**
 * Get featured listings.
 */
export async function getFeaturedListings(limit = 10): Promise<MarketplaceListing[]> {
  const listingIds = await redisCmd.smembers(FEATURED_KEY);
  const listings: MarketplaceListing[] = [];

  for (const id of listingIds.slice(0, limit)) {
    const listing = await getListing(id);
    if (listing && listing.status === "published") {
      listings.push(listing);
    }
  }

  return listings.sort((a, b) => b.installCount - a.installCount);
}

/**
 * Get recommended listings.
 */
export async function getRecommendedListings(limit = 10): Promise<MarketplaceListing[]> {
  const listingIds = await redisCmd.smembers(RECOMMENDED_KEY);
  const listings: MarketplaceListing[] = [];

  for (const id of listingIds.slice(0, limit)) {
    const listing = await getListing(id);
    if (listing && listing.status === "published") {
      listings.push(listing);
    }
  }

  return listings.sort((a, b) => b.rating - a.rating);
}

// ─── Analytics ──────────────────────────────────────────────────

/**
 * Get marketplace analytics.
 */
export async function getMarketplaceAnalytics(): Promise<{
  totalListings: number;
  totalInstallations: number;
  byDepartment: Record<string, number>;
  byCategory: Record<string, number>;
  topListings: Array<{ listingId: string; name: string; installCount: number; rating: number }>;
  recentInstallations: Array<{ installationId: string; packageName: string; installedAt: string }>;
}> {
  const listings = await listListings({ status: "published", limit: 1000 });
  const installations = await redisCmd.smembers(INSTALLATIONS_KEY);

  const byDepartment: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const listing of listings) {
    byDepartment[listing.department] = (byDepartment[listing.department] ?? 0) + 1;
    byCategory[listing.category] = (byCategory[listing.category] ?? 0) + 1;
  }

  const topListings = listings
    .sort((a, b) => b.installCount - a.installCount)
    .slice(0, 10)
    .map(l => ({
      listingId: l.id,
      name: l.displayName,
      installCount: l.installCount,
      rating: l.rating,
    }));

  const recentInstallations: Array<{ installationId: string; packageName: string; installedAt: string }> = [];
  for (const id of installations.slice(0, 20)) {
    const installation = await getInstallation(id);
    if (installation) {
      recentInstallations.push({
        installationId: installation.id,
        packageName: installation.packageName,
        installedAt: installation.installedAt,
      });
    }
  }

  return {
    totalListings: listings.length,
    totalInstallations: installations.length,
    byDepartment,
    byCategory,
    topListings,
    recentInstallations: recentInstallations.sort((a, b) => b.installedAt.localeCompare(a.installedAt)),
  };
}
