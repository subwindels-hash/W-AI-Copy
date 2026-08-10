/**
 * Web search tool backend.
 *
 * Performs real web searches through a configurable provider. Supports Brave
 * Search, SerpAPI and Tavily. When no provider key is configured, returns an
 * honest `not_configured` result rather than fabricated placeholder results.
 */

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchOutcome {
  configured: boolean;
  provider: string | null;
  query: string;
  results: WebSearchResultItem[];
  note?: string;
}

const MAX_RESULTS = 10;

async function braveSearch(query: string, limit: number): Promise<WebSearchOutcome> {
  const key = process.env.BRAVE_SEARCH_API_KEY!;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(limit, 20)));
  url.searchParams.set("safesearch", "moderate");
  const res = await fetch(url.toString(), { headers: { "X-Subscription-Token": key, Accept: "application/json" } });
  if (!res.ok) {
    return { configured: true, provider: "brave", query, results: [], note: `Search provider returned HTTP ${res.status}` };
  }
  const json = (await res.json()) as any;
  const web = json?.web?.results ?? [];
  const results: WebSearchResultItem[] = web.slice(0, limit).map((r: any) => ({
    title: r?.title ?? "",
    url: r?.url ?? "",
    snippet: r?.description ?? "",
  }));
  return { configured: true, provider: "brave", query, results };
}

async function serpApiSearch(query: string, limit: number): Promise<WebSearchOutcome> {
  const key = process.env.SERPAPI_KEY!;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", key);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    return { configured: true, provider: "serpapi", query, results: [], note: `Search provider returned HTTP ${res.status}` };
  }
  const json = (await res.json()) as any;
  const organic = json?.organic_results ?? [];
  const results: WebSearchResultItem[] = organic.slice(0, limit).map((r: any) => ({
    title: r?.title ?? "",
    url: r?.link ?? "",
    snippet: r?.snippet ?? "",
  }));
  return { configured: true, provider: "serpapi", query, results };
}

async function tavilySearch(query: string, limit: number): Promise<WebSearchOutcome> {
  const key = process.env.TAVILY_API_KEY!;
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, query, max_results: limit, search_depth: "basic" }),
  });
  if (!res.ok) {
    return { configured: true, provider: "tavily", query, results: [], note: `Search provider returned HTTP ${res.status}` };
  }
  const json = (await res.json()) as any;
  const results: WebSearchResultItem[] = (json?.results ?? []).slice(0, limit).map((r: any) => ({
    title: r?.title ?? "",
    url: r?.url ?? "",
    snippet: r?.content ?? "",
  }));
  return { configured: true, provider: "tavily", query, results };
}

/** Run a web search against the first configured provider. */
export async function webSearch(query: string, maxResults = 5): Promise<WebSearchOutcome> {
  const limit = Math.max(1, Math.min(Math.floor(maxResults) || 5, MAX_RESULTS));
  if (process.env.BRAVE_SEARCH_API_KEY) return braveSearch(query, limit);
  if (process.env.SERPAPI_KEY) return serpApiSearch(query, limit);
  if (process.env.TAVILY_API_KEY) return tavilySearch(query, limit);
  return {
    configured: false,
    provider: null,
    query,
    results: [],
    note: "Web search is not configured. Set BRAVE_SEARCH_API_KEY, SERPAPI_KEY or TAVILY_API_KEY to enable real web search.",
  };
}
