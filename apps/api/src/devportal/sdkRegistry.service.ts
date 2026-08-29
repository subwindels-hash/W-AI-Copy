/**
 * SDKRegistryService - Slices 216–229: SDK/Package registry for the Developer Portal.
 */
import { randomUUID } from "node:crypto";
import { redisCmd as redis } from "../db/redis.js";
import type { SDKCategory, SDKLanguage, SDKPackage, SDKStatus } from "@windels/shared";
// Deterministic demo RNG — stable within a running process.



const LIST_KEY = "dev:sdks";
const COUNTER = "dev:sdk:counter";
const DETAIL = (id: string) => `dev:sdk:${id}`;
const DOWNLOADS_KEY = "dev:sdk:downloads";

function iso() { return new Date().toISOString(); }
const SER = <T>(v: T) => JSON.stringify(v);

function mkInstall(slug: string, lang: SDKLanguage): string {
  switch (lang) {
    case "typescript": return `pnpm add @windels/${slug}`;
    case "python": return `pip install windels-${slug.replace(/-/g, "-")}`;
    case "go": return `go get github.com/windels-ai/windels-go/${slug}`;
    case "rust": return `cargo add windels-${slug}`;
    case "java": return `// Maven: <dependency><groupId>ai.windels</groupId><artifactId>${slug}</artifactId><version>1.0.0</version></dependency>`;
    case "kotlin": return `implementation("ai.windels:${slug}:1.0.0")`;
    case "swift": return `.package(url: "https://github.com/windels-ai/windels-swift.git", from: "1.0.0")`;
    case "dart": return `flutter pub add windels_${slug.replace(/-/g, "_")}`;
    case "cli": return `npm install -g @windels/cli`;
    case "curl": return `curl https://api.windels.ai/v1/${slug}`;
  }
}

export const SDKRegistryService = {
  async list(category?: string): Promise<SDKPackage[]> {
    const ids = await redis.smembers(LIST_KEY);
    const out: SDKPackage[] = [];
    for (const id of ids) {
      const raw = await redis.get(DETAIL(id));
      if (!raw) continue;
      const s = JSON.parse(raw) as SDKPackage;
      if (!category || s.category === category) out.push(s);
    }
    return out.sort((a, b) => a.slug.localeCompare(b.slug));
  },
  async get(id: string): Promise<SDKPackage | null> {
    const raw = await redis.get(DETAIL(id));
    return raw ? (JSON.parse(raw) as SDKPackage) : null;
  },
  async register(input: {
    slug: string; name: string; category: SDKCategory; language: SDKLanguage;
    description: string; features: string[]; status?: SDKStatus; version?: string;
    sliceNumber: number; exampleSnippet?: string; bundleSizeKb?: number;
  }): Promise<SDKPackage> {
    const id = randomUUID();
    const sdk: SDKPackage = {
      id,
      slug: input.slug,
      name: input.name,
      category: input.category,
      version: input.version ?? "1.0.0",
      status: input.status ?? "ga",
      language: input.language,
      installSnippet: mkInstall(input.slug, input.language),
      docsUrl: `https://docs.windels.ai/sdks/${input.slug}`,
      description: input.description,
      // Shown on the public developer portal as real adoption. A newly
      // registered SDK has neither downloads nor stars; the existing download
      // counter increments from real traffic.
      weeklyDownloads: 0,
      stars: 0,
      bundleSizeKb: input.bundleSizeKb,
      minPlatformVersion: "0.27.0",
      repoUrl: `https://github.com/windels-ai/windels/tree/main/sdks/${input.slug}`,
      exampleSnippet: input.exampleSnippet,
      features: input.features,
      sliceNumber: input.sliceNumber,
      maintainer: "windels-team",
      updatedAt: iso(),
    };
    await redis.set(DETAIL(id), SER(sdk));
    await redis.sadd(LIST_KEY, id);
    await redis.incr(COUNTER);
    return sdk;
  },
  async recordDownload(id: string) {
    await redis.hincrby(DOWNLOADS_KEY, id, 1);
    const raw = await redis.get(DETAIL(id));
    if (raw) {
      const s = JSON.parse(raw) as SDKPackage;
      // weeklyDownloads is optional (undefined until the registry reports);
      // count up from the real recorded total rather than assuming a baseline.
      s.weeklyDownloads = (s.weeklyDownloads ?? 0) + 1;
      s.updatedAt = iso();
      await redis.set(DETAIL(id), SER(s));
    }
  },
  async weeklyTotal(): Promise<number> {
    const all = await this.list();
    return all.reduce((a, b) => a + (b.weeklyDownloads ?? 0), 0);
  },
};
