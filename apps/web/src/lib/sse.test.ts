// @vitest-environment happy-dom
/**
 * Session 202 — Server-Sent Events parser tests.
 *
 * streamSSE() powers every streaming AI response in the app. Its parser has
 * real logic that regresses easily:
 *   - frames split on the blank-line (\n\n) delimiter, even across chunk
 *     boundaries
 *   - `event:` and `data:` line prefixes, comment (`:`) lines ignored
 *   - multi-line `data:` reassembled; JSON parsed, falling back to raw string
 *   - default event name of "message"
 *   - error thrown on non-ok responses
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamSSE } from "./sse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

function okResponse(chunks: string[]): Response {
  return new Response(streamFromChunks(chunks), { status: 200 });
}

async function collect(gen: AsyncGenerator<{ event: string; data: any }>) {
  const out: { event: string; data: any }[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("streamSSE", () => {
  it("parses named events with JSON data payloads", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(['event: token\ndata: {"text":"hi"}\n\n', 'event: done\ndata: {"ok":true}\n\n'])
    );
    const events = await collect(streamSSE("/ai/stream", { method: "POST", json: {} }));
    expect(events).toEqual([
      { event: "token", data: { text: "hi" } },
      { event: "done", data: { ok: true } },
    ]);
  });

  it("defaults the event name to 'message' when only data is present", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(['data: {"n":1}\n\n']));
    const events = await collect(streamSSE("/x", {}));
    expect(events).toEqual([{ event: "message", data: { n: 1 } }]);
  });

  it("falls back to the raw string when data is not valid JSON", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(["data: plain text here\n\n"]));
    const events = await collect(streamSSE("/x", {}));
    expect(events).toEqual([{ event: "message", data: "plain text here" }]);
  });

  it("reassembles a frame split across two network chunks", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(['event: token\nda', 'ta: {"text":"split"}\n\n']));
    const events = await collect(streamSSE("/x", {}));
    expect(events).toEqual([{ event: "token", data: { text: "split" } }]);
  });

  it("joins multi-line data blocks before parsing", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(["data: line one\ndata: line two\n\n"]));
    const events = await collect(streamSSE("/x", {}));
    expect(events).toEqual([{ event: "message", data: "line one\nline two" }]);
  });

  it("ignores comment lines and empty frames", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([": keep-alive\n\n", 'data: {"v":2}\n\n']));
    const events = await collect(streamSSE("/x", {}));
    expect(events).toEqual([{ event: "message", data: { v: 2 } }]);
  });

  it("sets the Accept: text/event-stream header and encodes json body", async () => {
    fetchMock.mockResolvedValueOnce(okResponse(["data: ok\n\n"]));
    await collect(streamSSE("/x", { method: "POST", json: { a: 1 } }));
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Accept).toBe("text/event-stream");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("throws with status and body snippet on a non-ok response", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    await expect(collect(streamSSE("/x", {}))).rejects.toThrow(/Stream error 500/);
  });
});
