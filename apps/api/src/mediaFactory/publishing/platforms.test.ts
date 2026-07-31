/**
 * Platform adapter protocol tests — verifies each adapter drives the real
 * upload protocol (URLs, methods, headers, payload shapes, polling) against a
 * stubbed global fetch. No network, no faked success.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { PLATFORM_ADAPTERS, PlatformPublishError } from "./platforms.js";

const MEDIA = { buffer: Buffer.alloc(2 * 1024 * 1024, 7), contentType: "video/mp4" }; // 2MB

interface Call { url: string; init: any }

function jsonRes(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    headers: { get: (k: string) => headers[k] ?? (k === "content-type" ? "application/json" : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function recorder(plan: Array<{ match: (url: string, init: any) => boolean; respond: (call: Call) => any }>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: any = {}) => {
    const call: Call = { url, init };
    calls.push(call);
    const step = plan.find((p) => p.match(url, init));
    if (!step) throw new Error(`unexpected fetch: ${init.method ?? "GET"} ${url}`);
    return step.respond(call);
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("youtube adapter", () => {
  it("runs resumable upload: initiate (metadata headers) → PUT bytes → video url", async () => {
    const { calls } = recorder([
      {
        match: (url, init) => url.includes("upload/youtube/v3/videos?uploadType=resumable") && init.method === "POST",
        respond: (c) => {
          expect(c.init.headers["X-Upload-Content-Type"]).toBe("video/mp4");
          expect(c.init.headers["X-Upload-Content-Length"]).toBe(String(MEDIA.buffer.byteLength));
          const meta = JSON.parse(c.init.body);
          expect(meta.snippet.title).toBe("My Video");
          expect(meta.status.privacyStatus).toBe("unlisted");
          return jsonRes(200, {}, { location: "https://upload.youtube.com/resumable/session-123" });
        },
      },
      {
        match: (url, init) => url === "https://upload.youtube.com/resumable/session-123" && init.method === "PUT",
        respond: (c) => {
          expect(Buffer.isBuffer(c.init.body)).toBe(true);
          expect(c.init.body.byteLength).toBe(MEDIA.buffer.byteLength);
          return jsonRes(200, { id: "yt-abc" });
        },
      },
    ]);
    const out = await PLATFORM_ADAPTERS.youtube.publish({
      accessToken: "tok",
      input: { title: "My Video", description: "d" },
      media: MEDIA,
    });
    expect(out.postId).toBe("yt-abc");
    expect(out.url).toBe("https://youtu.be/yt-abc");
    expect(calls.length).toBe(2);
  });

  it("truncates titles to YouTube's 100-char limit", async () => {
    recorder([
      {
        match: (url) => url.includes("uploadType=resumable"),
        respond: (c) => {
          expect(JSON.parse(c.init.body).snippet.title.length).toBe(100);
          return jsonRes(200, {}, { location: "https://upload.youtube.com/s" });
        },
      },
      { match: () => true, respond: () => jsonRes(200, { id: "v" }) },
    ]);
    await PLATFORM_ADAPTERS.youtube.publish({
      accessToken: "tok", input: { title: "x".repeat(500) }, media: MEDIA,
    });
  });
});

describe("x adapter", () => {
  it("runs INIT → APPEND → FINALIZE → tweet with media id", async () => {
    let appended = 0;
    const { calls } = recorder([
      {
        match: (url, init) => url.includes("media/upload.json") && String(init.body).includes("command=INIT"),
        respond: (c) => {
          expect(String(c.init.body)).toContain("total_bytes=" + MEDIA.buffer.byteLength);
          expect(String(c.init.body)).toContain("media_category=tweet_video");
          return jsonRes(200, { media_id_string: "m-99" });
        },
      },
      {
        match: (url, init) => url.includes("media/upload.json") && init.body instanceof FormData && init.body.get("command") === "APPEND",
        respond: (c) => {
          appended++;
          expect(c.init.body.get("media_id")).toBe("m-99");
          expect(c.init.body.get("media")).toBeTruthy();
          return jsonRes(204, {});
        },
      },
      {
        match: (url, init) => url.includes("media/upload.json") && String(init.body).includes("command=FINALIZE"),
        respond: () => jsonRes(200, { media_id_string: "m-99" }),
      },
      {
        match: (url, init) => url === "https://api.twitter.com/2/tweets" && init.method === "POST",
        respond: (c) => {
          const body = JSON.parse(c.init.body);
          expect(body.media.media_ids).toEqual(["m-99"]);
          expect(body.text).toContain("Launch post");
          return jsonRes(201, { data: { id: "tw-1" } });
        },
      },
    ]);
    const out = await PLATFORM_ADAPTERS.x.publish({
      accessToken: "tok",
      input: { title: "Launch post", description: "details" },
      media: MEDIA,
    });
    expect(out.url).toBe("https://x.com/i/web/status/tw-1");
    expect(appended).toBe(1); // 2MB < 5MB chunk size
    expect(calls.length).toBe(4);
  });

  it("supports text-only posts (no media required)", async () => {
    recorder([
      {
        match: (url) => url.includes("/2/tweets"),
        respond: (c) => {
          expect(JSON.parse(c.init.body).media).toBeUndefined();
          return jsonRes(201, { data: { id: "tw-2" } });
        },
      },
    ]);
    const out = await PLATFORM_ADAPTERS.x.publish({ accessToken: "tok", input: { title: "Just text" } });
    expect(out.postId).toBe("tw-2");
  });
});

describe("tiktok adapter", () => {
  it("inits upload, PUTs chunked content-range, polls until complete", async () => {
    const big = { buffer: Buffer.alloc(12 * 1024 * 1024, 1), contentType: "video/mp4" }; // 12MB → 2 chunks
    const ranges: string[] = [];
    recorder([
      {
        match: (url, init) => url.includes("/post/publish/video/init/") && init.method === "POST",
        respond: (c) => {
          const body = JSON.parse(c.init.body);
          expect(body.source_info.total_chunk_count).toBe(2);
          expect(body.post_info.privacy_level).toBe("SELF_ONLY");
          return jsonRes(200, { data: { publish_id: "pub-7", upload_url: "https://open.tiktokapis.com/upload/x" } });
        },
      },
      {
        match: (url, init) => url === "https://open.tiktokapis.com/upload/x" && init.method === "PUT",
        respond: (c) => {
          ranges.push(c.init.headers["Content-Range"]);
          return jsonRes(201, {});
        },
      },
      {
        match: (url) => url.includes("/post/publish/status/fetch/"),
        respond: () => jsonRes(200, { data: { status: "PUBLISH_COMPLETE" } }),
      },
    ]);
    const out = await PLATFORM_ADAPTERS.tiktok.publish({
      accessToken: "tok", input: { title: "Clip" }, media: big,
    });
    expect(out.postId).toBe("pub-7");
    expect(ranges).toEqual([`bytes 0-${10 * 1024 * 1024 - 1}/${big.buffer.byteLength}`, `bytes ${10 * 1024 * 1024}-${big.buffer.byteLength - 1}/${big.buffer.byteLength}`]);
    expect(out.warnings?.some((w) => w.includes("SELF_ONLY"))).toBe(true);
  });
});

describe("facebook adapter", () => {
  it("uploads multipart form to the page videos edge", async () => {
    process.env.FACEBOOK_PAGE_ID = "page-1";
    recorder([
      {
        match: (url, init) => url === "https://graph-video.facebook.com/v21.0/page-1/videos" && init.method === "POST",
        respond: (c) => {
          expect(c.init.body instanceof FormData).toBe(true);
          expect(c.init.body.get("title")).toBe("FB Video");
          expect(c.init.body.get("source")).toBeTruthy();
          return jsonRes(200, { id: "fbvid-1" });
        },
      },
    ]);
    const out = await PLATFORM_ADAPTERS.facebook.publish({
      accessToken: "tok", input: { title: "FB Video", description: "desc" }, media: MEDIA,
    });
    expect(out.url).toBe("https://www.facebook.com/fbvid-1");
    delete process.env.FACEBOOK_PAGE_ID;
  });

  it("requires a page id", async () => {
    delete process.env.FACEBOOK_PAGE_ID;
    await expect(PLATFORM_ADAPTERS.facebook.publish({
      accessToken: "tok", input: { title: "FB Video" }, media: MEDIA,
    })).rejects.toThrow(/pageId|FACEBOOK_PAGE_ID/);
  });
});

describe("pinterest adapter", () => {
  it("registers media, uploads, then creates the pin", async () => {
    process.env.PINTEREST_BOARD_ID = "board-9";
    recorder([
      {
        match: (url) => url === "https://api.pinterest.com/v5/media",
        respond: () => jsonRes(200, { media_id: "pmed-1", upload_url: "https://uploads.pinterest.example/abc", upload_parameters: { key: "v" } }),
      },
      {
        match: (url, init) => url === "https://uploads.pinterest.example/abc" && init.method === "POST",
        respond: (c) => {
          expect(c.init.body.get("file")).toBeTruthy();
          expect(c.init.body.get("key")).toBe("v");
          return jsonRes(204, {});
        },
      },
      {
        match: (url) => url === "https://api.pinterest.com/v5/pins",
        respond: (c) => {
          const body = JSON.parse(c.init.body);
          expect(body.board_id).toBe("board-9");
          expect(body.media_source).toEqual({ source_type: "video_id", media_id: "pmed-1" });
          return jsonRes(201, { id: "pin-5" });
        },
      },
    ]);
    const out = await PLATFORM_ADAPTERS.pinterest.publish({
      accessToken: "tok", input: { title: "Pin it" }, media: MEDIA,
    });
    expect(out.url).toBe("https://www.pinterest.com/pin/pin-5/");
    delete process.env.PINTEREST_BOARD_ID;
  });
});

describe("instagram adapter", () => {
  it("uses the public video_url container flow when media is a source URL", async () => {
    process.env.INSTAGRAM_IG_USER_ID = "ig-77";
    recorder([
      {
        match: (url) => url.endsWith("/ig-77/media"),
        respond: (c) => {
          expect(String(c.init.body)).toContain("media_type=REELS");
          expect(String(c.init.body)).toContain(encodeURIComponent("https://cdn.example.com/reel.mp4"));
          return jsonRes(200, { id: "cont-1" });
        },
      },
      {
        match: (url) => url.includes("/cont-1?fields=status_code"),
        respond: () => jsonRes(200, { status_code: "FINISHED" }),
      },
      {
        match: (url) => url.includes("/ig-77/media_publish"),
        respond: (c) => {
          expect(String(c.init.body)).toContain("creation_id=cont-1");
          return jsonRes(200, { id: "igmed-1" });
        },
      },
      {
        match: (url) => url.includes("/igmed-1?fields=permalink"),
        respond: () => jsonRes(200, { permalink: "https://www.instagram.com/reel/igmed-1/" }),
      },
    ]);
    const out = await PLATFORM_ADAPTERS.instagram.publish({
      accessToken: "tok",
      input: { title: "Reel day" },
      media: { ...MEDIA, sourceUrl: "https://cdn.example.com/reel.mp4" },
    });
    expect(out.url).toBe("https://www.instagram.com/reel/igmed-1/");
    delete process.env.INSTAGRAM_IG_USER_ID;
  });
});

describe("error mapping", () => {
  it("401/403 are permanent AUTH errors", async () => {
    recorder([{ match: () => true, respond: () => jsonRes(401, { error: { message: "bad token" } }) }]);
    const err = await PLATFORM_ADAPTERS.youtube.publish({ accessToken: "tok", input: { title: "t" }, media: MEDIA }).catch((e) => e);
    expect(err).toBeInstanceOf(PlatformPublishError);
    expect(err.code).toBe("AUTH");
    expect(err.permanent).toBe(true);
  });

  it("429 is retryable and carries retry-after", async () => {
    recorder([{ match: () => true, respond: () => jsonRes(429, {}, { "retry-after": "42" }) }]);
    const err = await PLATFORM_ADAPTERS.youtube.publish({ accessToken: "tok", input: { title: "t" }, media: MEDIA }).catch((e) => e);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.permanent).toBe(false);
    expect(err.retryAfterSec).toBe(42);
  });

  it("adapters refuse to run without required media", async () => {
    await expect(PLATFORM_ADAPTERS.youtube.publish({ accessToken: "tok", input: { title: "t" } })).rejects.toThrow(/requires a video file/);
  });
});
