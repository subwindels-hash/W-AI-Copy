/**
 * Module 111: AI Model Knowledge Base Service
 * WINDELS AI OS - Phase 2
 * 
 * Provides knowledge base management for AI models including articles, tutorials,
 * FAQs, search functionality, categorization, and collaborative knowledge sharing.
 */

import { randomUUID } from 'crypto';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeBase {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: KnowledgeBaseStatus;
  categories: Category[];
  articles: Article[];
  settings: KnowledgeBaseSettings;
  analytics: KnowledgeBaseAnalytics;
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeBaseStatus = 'draft' | 'published' | 'archived';

export interface KnowledgeBaseSettings {
  allowPublicAccess: boolean;
  requireApproval: boolean;
  enableComments: boolean;
  enableVoting: boolean;
  enableSearch: boolean;
  defaultLanguage: string;
  supportedLanguages: string[];
}

export interface KnowledgeBaseAnalytics {
  totalViews: number;
  totalSearches: number;
  popularArticles: Array<{ articleId: string; views: number }>;
  topSearchTerms: Array<{ term: string; count: number }>;
  lastUpdated: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  order: number;
  icon?: string;
  articleCount: number;
  createdAt: string;
}

export interface Article {
  id: string;
  knowledgeBaseId: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  categoryId: string;
  tags: string[];
  author: ArticleAuthor;
  status: ArticleStatus;
  visibility: 'public' | 'internal' | 'restricted';
  allowedUsers?: string[];
  allowedTeams?: string[];
  metadata: ArticleMetadata;
  versions: ArticleVersion[];
  comments: ArticleComment[];
  votes: ArticleVote[];
  relatedArticles: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface ArticleAuthor {
  userId: string;
  userName: string;
  email: string;
  avatar?: string;
}

export type ArticleStatus = 'draft' | 'review' | 'published' | 'archived';

export interface ArticleMetadata {
  readingTime: number; // minutes
  wordCount: number;
  lastReviewedAt?: string;
  reviewedBy?: string;
  feedbackScore: number; // 0-5
  feedbackCount: number;
  attachments: Attachment[];
  links: Link[];
}

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Link {
  url: string;
  title: string;
  description?: string;
}

export interface ArticleVersion {
  version: number;
  content: string;
  summary?: string;
  author: ArticleAuthor;
  changeLog: string;
  createdAt: string;
}

export interface ArticleComment {
  id: string;
  articleId: string;
  author: ArticleAuthor;
  content: string;
  parentId?: string;
  status: 'visible' | 'hidden' | 'deleted';
  votes: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleVote {
  userId: string;
  userName: string;
  value: 'up' | 'down';
  createdAt: string;
}

export interface SearchResult {
  articles: Article[];
  total: number;
  query: string;
  filters: SearchFilters;
  suggestions: string[];
  facets: SearchFacets;
}

export interface SearchFilters {
  categoryId?: string;
  tags?: string[];
  author?: string;
  status?: ArticleStatus;
  dateRange?: { start: string; end: string };
  language?: string;
}

export interface SearchFacets {
  categories: Array<{ name: string; count: number }>;
  tags: Array<{ name: string; count: number }>;
  authors: Array<{ name: string; count: number }>;
}

export interface FAQ {
  id: string;
  knowledgeBaseId: string;
  question: string;
  answer: string;
  categoryId: string;
  tags: string[];
  order: number;
  helpful: number;
  notHelpful: number;
  createdAt: string;
  updatedAt: string;
}

export interface Tutorial {
  id: string;
  knowledgeBaseId: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: number; // minutes
  steps: TutorialStep[];
  prerequisites: string[];
  resources: TutorialResource[];
  categoryId: string;
  tags: string[];
  author: ArticleAuthor;
  status: ArticleStatus;
  completionRate: number;
  averageRating: number;
  createdAt: string;
  updatedAt: string;
}

export interface TutorialStep {
  order: number;
  title: string;
  content: string;
  code?: string;
  language?: string;
  expectedOutput?: string;
  tips: string[];
}

export interface TutorialResource {
  type: 'link' | 'video' | 'document' | 'dataset';
  title: string;
  url: string;
  description?: string;
}

export interface GlossaryTerm {
  id: string;
  knowledgeBaseId: string;
  term: string;
  definition: string;
  synonyms: string[];
  relatedTerms: string[];
  categoryId?: string;
  examples: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

const knowledgeBases = new Map<string, KnowledgeBase>();
const articles = new Map<string, Article[]>();
const faqs = new Map<string, FAQ[]>();
const tutorials = new Map<string, Tutorial[]>();
const glossaryTerms = new Map<string, GlossaryTerm[]>();

// ─── Helper Functions ─────────────────────────────────────────────────────────

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const wordCount = content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
}

function calculateWordCount(content: string): number {
  return content.split(/\s+/).length;
}

// ─── Service Implementation ───────────────────────────────────────────────────

export function createKnowledgeBase(params: {
  organizationId: string;
  name: string;
  description?: string;
  settings?: Partial<KnowledgeBaseSettings>;
}): KnowledgeBase {
  const now = new Date().toISOString();
  const id = randomUUID();

  const defaultSettings: KnowledgeBaseSettings = {
    allowPublicAccess: false,
    requireApproval: false,
    enableComments: true,
    enableVoting: true,
    enableSearch: true,
    defaultLanguage: 'en',
    supportedLanguages: ['en'],
  };

  const knowledgeBase: KnowledgeBase = {
    id,
    organizationId: params.organizationId,
    name: params.name,
    description: params.description,
    status: 'draft',
    categories: [],
    articles: [],
    settings: { ...defaultSettings, ...params.settings },
    analytics: {
      totalViews: 0,
      totalSearches: 0,
      popularArticles: [],
      topSearchTerms: [],
      lastUpdated: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  knowledgeBases.set(id, knowledgeBase);
  articles.set(id, []);
  faqs.set(id, []);
  tutorials.set(id, []);
  glossaryTerms.set(id, []);

  return knowledgeBase;
}

export function getKnowledgeBase(id: string): KnowledgeBase | undefined {
  return knowledgeBases.get(id);
}

export function listKnowledgeBases(
  organizationId: string,
  filters?: { status?: KnowledgeBaseStatus }
): KnowledgeBase[] {
  let result = Array.from(knowledgeBases.values()).filter(
    kb => kb.organizationId === organizationId
  );

  if (filters?.status) result = result.filter(kb => kb.status === filters.status);

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateKnowledgeBase(
  knowledgeBaseId: string,
  updates: Partial<KnowledgeBase>
): KnowledgeBase {
  const kb = knowledgeBases.get(knowledgeBaseId);
  if (!kb) throw new Error(`Knowledge base ${knowledgeBaseId} not found`);

  Object.assign(kb, updates, { updatedAt: new Date().toISOString() });
  return kb;
}

export function addCategory(
  knowledgeBaseId: string,
  category: Omit<Category, 'id' | 'articleCount' | 'createdAt'>
): KnowledgeBase {
  const kb = knowledgeBases.get(knowledgeBaseId);
  if (!kb) throw new Error(`Knowledge base ${knowledgeBaseId} not found`);

  const newCategory: Category = {
    ...category,
    id: randomUUID(),
    articleCount: 0,
    createdAt: new Date().toISOString(),
  };

  kb.categories.push(newCategory);
  kb.categories.sort((a, b) => a.order - b.order);
  kb.updatedAt = new Date().toISOString();

  return kb;
}

export function updateCategory(
  knowledgeBaseId: string,
  categoryId: string,
  updates: Partial<Category>
): KnowledgeBase {
  const kb = knowledgeBases.get(knowledgeBaseId);
  if (!kb) throw new Error(`Knowledge base ${knowledgeBaseId} not found`);

  const category = kb.categories.find(c => c.id === categoryId);
  if (!category) throw new Error(`Category ${categoryId} not found`);

  Object.assign(category, updates);
  kb.categories.sort((a, b) => a.order - b.order);
  kb.updatedAt = new Date().toISOString();

  return kb;
}

export function deleteCategory(knowledgeBaseId: string, categoryId: string): KnowledgeBase {
  const kb = knowledgeBases.get(knowledgeBaseId);
  if (!kb) throw new Error(`Knowledge base ${knowledgeBaseId} not found`);

  kb.categories = kb.categories.filter(c => c.id !== categoryId);
  kb.updatedAt = new Date().toISOString();

  return kb;
}

export function createArticle(params: {
  knowledgeBaseId: string;
  title: string;
  content: string;
  summary?: string;
  categoryId: string;
  tags?: string[];
  author: ArticleAuthor;
  visibility?: 'public' | 'internal' | 'restricted';
  allowedUsers?: string[];
  allowedTeams?: string[];
}): Article {
  const kb = knowledgeBases.get(params.knowledgeBaseId);
  if (!kb) throw new Error(`Knowledge base ${params.knowledgeBaseId} not found`);

  const now = new Date().toISOString();
  const id = randomUUID();

  const article: Article = {
    id,
    knowledgeBaseId: params.knowledgeBaseId,
    title: params.title,
    slug: generateSlug(params.title),
    content: params.content,
    summary: params.summary,
    categoryId: params.categoryId,
    tags: params.tags || [],
    author: params.author,
    status: 'draft',
    visibility: params.visibility || 'internal',
    allowedUsers: params.allowedUsers,
    allowedTeams: params.allowedTeams,
    metadata: {
      readingTime: calculateReadingTime(params.content),
      wordCount: calculateWordCount(params.content),
      feedbackScore: 0,
      feedbackCount: 0,
      attachments: [],
      links: [],
    },
    versions: [
      {
        version: 1,
        content: params.content,
        summary: params.summary,
        author: params.author,
        changeLog: 'Initial version',
        createdAt: now,
      },
    ],
    comments: [],
    votes: [],
    relatedArticles: [],
    createdAt: now,
    updatedAt: now,
  };

  const kbArticles = articles.get(params.knowledgeBaseId) || [];
  kbArticles.push(article);
  articles.set(params.knowledgeBaseId, kbArticles);

  // Update category article count
  const category = kb.categories.find(c => c.id === params.categoryId);
  if (category) {
    category.articleCount++;
  }

  kb.updatedAt = now;

  return article;
}

export function getArticle(articleId: string): Article | undefined {
  for (const kbArticles of articles.values()) {
    const article = kbArticles.find(a => a.id === articleId);
    if (article) return article;
  }
  return undefined;
}

export function getArticleBySlug(knowledgeBaseId: string, slug: string): Article | undefined {
  const kbArticles = articles.get(knowledgeBaseId) || [];
  return kbArticles.find(a => a.slug === slug);
}

export function listArticles(
  knowledgeBaseId: string,
  filters?: {
    categoryId?: string;
    status?: ArticleStatus;
    tags?: string[];
    author?: string;
    visibility?: string;
  }
): Article[] {
  let result = articles.get(knowledgeBaseId) || [];

  if (filters?.categoryId) result = result.filter(a => a.categoryId === filters.categoryId);
  if (filters?.status) result = result.filter(a => a.status === filters.status);
  if (filters?.tags) result = result.filter(a => filters.tags!.some(t => a.tags.includes(t)));
  if (filters?.author) result = result.filter(a => a.author.userId === filters.author);
  if (filters?.visibility) result = result.filter(a => a.visibility === filters.visibility);

  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function updateArticle(
  articleId: string,
  updates: Partial<Article>,
  author: ArticleAuthor,
  changeLog: string
): Article {
  const article = getArticle(articleId);
  if (!article) throw new Error(`Article ${articleId} not found`);

  const now = new Date().toISOString();

  // Create new version if content changed
  if (updates.content && updates.content !== article.content) {
    const newVersion: ArticleVersion = {
      version: article.versions.length + 1,
      content: updates.content,
      summary: updates.summary || article.summary,
      author,
      changeLog,
      createdAt: now,
    };
    article.versions.push(newVersion);

    // Update metadata
    article.metadata.readingTime = calculateReadingTime(updates.content);
    article.metadata.wordCount = calculateWordCount(updates.content);
  }

  Object.assign(article, updates, { updatedAt: now });

  return article;
}

export function publishArticle(articleId: string): Article {
  const article = getArticle(articleId);
  if (!article) throw new Error(`Article ${articleId} not found`);

  article.status = 'published';
  article.publishedAt = new Date().toISOString();
  article.updatedAt = new Date().toISOString();

  return article;
}

export function archiveArticle(articleId: string): Article {
  const article = getArticle(articleId);
  if (!article) throw new Error(`Article ${articleId} not found`);

  article.status = 'archived';
  article.updatedAt = new Date().toISOString();

  return article;
}

export function addArticleComment(
  articleId: string,
  comment: Omit<ArticleComment, 'id' | 'status' | 'votes' | 'createdAt' | 'updatedAt'>
): Article {
  const article = getArticle(articleId);
  if (!article) throw new Error(`Article ${articleId} not found`);

  const now = new Date().toISOString();
  const newComment: ArticleComment = {
    ...comment,
    id: randomUUID(),
    status: 'visible',
    votes: 0,
    createdAt: now,
    updatedAt: now,
  };

  article.comments.push(newComment);
  article.updatedAt = now;

  return article;
}

export function voteArticle(
  articleId: string,
  userId: string,
  userName: string,
  value: 'up' | 'down'
): Article {
  const article = getArticle(articleId);
  if (!article) throw new Error(`Article ${articleId} not found`);

  // Remove existing vote
  article.votes = article.votes.filter(v => v.userId !== userId);

  // Add new vote
  article.votes.push({
    userId,
    userName,
    value,
    createdAt: new Date().toISOString(),
  });

  article.updatedAt = new Date().toISOString();

  return article;
}

export function searchArticles(
  knowledgeBaseId: string,
  query: string,
  filters?: SearchFilters
): SearchResult {
  let result = articles.get(knowledgeBaseId) || [];

  // Apply filters
  if (filters?.categoryId) result = result.filter(a => a.categoryId === filters.categoryId);
  if (filters?.tags) result = result.filter(a => filters.tags!.some(t => a.tags.includes(t)));
  if (filters?.author) result = result.filter(a => a.author.userId === filters.author);
  if (filters?.status) result = result.filter(a => a.status === filters.status);

  // Search in title, content, summary, and tags
  const queryLower = query.toLowerCase();
  result = result.filter(a =>
    a.title.toLowerCase().includes(queryLower) ||
    a.content.toLowerCase().includes(queryLower) ||
    (a.summary && a.summary.toLowerCase().includes(queryLower)) ||
    a.tags.some(t => t.toLowerCase().includes(queryLower))
  );

  // Calculate facets
  const categoryFacets = new Map<string, number>();
  const tagFacets = new Map<string, number>();
  const authorFacets = new Map<string, number>();

  result.forEach(a => {
    categoryFacets.set(a.categoryId, (categoryFacets.get(a.categoryId) || 0) + 1);
    a.tags.forEach(t => tagFacets.set(t, (tagFacets.get(t) || 0) + 1));
    authorFacets.set(a.author.userName, (authorFacets.get(a.author.userName) || 0) + 1);
  });

  // Update analytics
  const kb = knowledgeBases.get(knowledgeBaseId);
  if (kb) {
    kb.analytics.totalSearches++;
    const existingTerm = kb.analytics.topSearchTerms.find(t => t.term === query);
    if (existingTerm) {
      existingTerm.count++;
    } else {
      kb.analytics.topSearchTerms.push({ term: query, count: 1 });
    }
    kb.analytics.topSearchTerms.sort((a, b) => b.count - a.count);
    kb.analytics.topSearchTerms = kb.analytics.topSearchTerms.slice(0, 10);
  }

  return {
    articles: result,
    total: result.length,
    query,
    filters: filters || {},
    suggestions: [], // Would implement autocomplete suggestions
    facets: {
      categories: Array.from(categoryFacets.entries()).map(([name, count]) => ({ name, count })),
      tags: Array.from(tagFacets.entries()).map(([name, count]) => ({ name, count })),
      authors: Array.from(authorFacets.entries()).map(([name, count]) => ({ name, count })),
    },
  };
}

export function createFAQ(params: {
  knowledgeBaseId: string;
  question: string;
  answer: string;
  categoryId: string;
  tags?: string[];
  order?: number;
}): FAQ {
  const now = new Date().toISOString();
  const id = randomUUID();

  const faq: FAQ = {
    id,
    knowledgeBaseId: params.knowledgeBaseId,
    question: params.question,
    answer: params.answer,
    categoryId: params.categoryId,
    tags: params.tags || [],
    order: params.order || 0,
    helpful: 0,
    notHelpful: 0,
    createdAt: now,
    updatedAt: now,
  };

  const kbFaqs = faqs.get(params.knowledgeBaseId) || [];
  kbFaqs.push(faq);
  faqs.set(params.knowledgeBaseId, kbFaqs);

  return faq;
}

export function getFAQs(
  knowledgeBaseId: string,
  filters?: { categoryId?: string; tag?: string }
): FAQ[] {
  let result = faqs.get(knowledgeBaseId) || [];

  if (filters?.categoryId) result = result.filter(f => f.categoryId === filters.categoryId);
  if (filters?.tag) result = result.filter(f => f.tags.includes(filters.tag!));

  return result.sort((a, b) => a.order - b.order);
}

export function rateFAQ(faqId: string, helpful: boolean): FAQ {
  for (const kbFaqs of faqs.values()) {
    const faq = kbFaqs.find(f => f.id === faqId);
    if (faq) {
      if (helpful) {
        faq.helpful++;
      } else {
        faq.notHelpful++;
      }
      faq.updatedAt = new Date().toISOString();
      return faq;
    }
  }
  throw new Error(`FAQ ${faqId} not found`);
}

export function createTutorial(params: {
  knowledgeBaseId: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  duration: number;
  steps: Omit<TutorialStep, 'order'>[];
  prerequisites?: string[];
  resources?: TutorialResource[];
  categoryId: string;
  tags?: string[];
  author: ArticleAuthor;
}): Tutorial {
  const now = new Date().toISOString();
  const id = randomUUID();

  const tutorial: Tutorial = {
    id,
    knowledgeBaseId: params.knowledgeBaseId,
    title: params.title,
    description: params.description,
    difficulty: params.difficulty,
    duration: params.duration,
    steps: params.steps.map((s, i) => ({ ...s, order: i + 1 })),
    prerequisites: params.prerequisites || [],
    resources: params.resources || [],
    categoryId: params.categoryId,
    tags: params.tags || [],
    author: params.author,
    status: 'draft',
    completionRate: 0,
    averageRating: 0,
    createdAt: now,
    updatedAt: now,
  };

  const kbTutorials = tutorials.get(params.knowledgeBaseId) || [];
  kbTutorials.push(tutorial);
  tutorials.set(params.knowledgeBaseId, kbTutorials);

  return tutorial;
}

export function getTutorials(
  knowledgeBaseId: string,
  filters?: { difficulty?: string; categoryId?: string; tag?: string }
): Tutorial[] {
  let result = tutorials.get(knowledgeBaseId) || [];

  if (filters?.difficulty) result = result.filter(t => t.difficulty === filters.difficulty);
  if (filters?.categoryId) result = result.filter(t => t.categoryId === filters.categoryId);
  if (filters?.tag) result = result.filter(t => t.tags.includes(filters.tag!));

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addGlossaryTerm(params: {
  knowledgeBaseId: string;
  term: string;
  definition: string;
  synonyms?: string[];
  relatedTerms?: string[];
  categoryId?: string;
  examples?: string[];
}): GlossaryTerm {
  const now = new Date().toISOString();
  const id = randomUUID();

  const glossaryTerm: GlossaryTerm = {
    id,
    knowledgeBaseId: params.knowledgeBaseId,
    term: params.term,
    definition: params.definition,
    synonyms: params.synonyms || [],
    relatedTerms: params.relatedTerms || [],
    categoryId: params.categoryId,
    examples: params.examples || [],
    createdAt: now,
    updatedAt: now,
  };

  const kbTerms = glossaryTerms.get(params.knowledgeBaseId) || [];
  kbTerms.push(glossaryTerm);
  glossaryTerms.set(params.knowledgeBaseId, kbTerms);

  return glossaryTerm;
}

export function getGlossaryTerms(
  knowledgeBaseId: string,
  filters?: { categoryId?: string; letter?: string }
): GlossaryTerm[] {
  let result = glossaryTerms.get(knowledgeBaseId) || [];

  if (filters?.categoryId) result = result.filter(t => t.categoryId === filters.categoryId);
  if (filters?.letter) result = result.filter(t => t.term.toLowerCase().startsWith(filters.letter!.toLowerCase()));

  return result.sort((a, b) => a.term.localeCompare(b.term));
}

export function trackArticleView(articleId: string): void {
  const article = getArticle(articleId);
  if (!article) return;

  const kb = knowledgeBases.get(article.knowledgeBaseId);
  if (!kb) return;

  kb.analytics.totalViews++;

  const existing = kb.analytics.popularArticles.find(a => a.articleId === articleId);
  if (existing) {
    existing.views++;
  } else {
    kb.analytics.popularArticles.push({ articleId, views: 1 });
  }

  kb.analytics.popularArticles.sort((a, b) => b.views - a.views);
  kb.analytics.popularArticles = kb.analytics.popularArticles.slice(0, 10);
  kb.analytics.lastUpdated = new Date().toISOString();
}

export function getKnowledgeBaseAnalytics(knowledgeBaseId: string): KnowledgeBaseAnalytics {
  const kb = knowledgeBases.get(knowledgeBaseId);
  if (!kb) throw new Error(`Knowledge base ${knowledgeBaseId} not found`);
  return kb.analytics;
}
