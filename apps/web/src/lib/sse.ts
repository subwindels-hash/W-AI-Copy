/**
 * Minimal Server-Sent Events parser for streaming AI responses.
 * Returns an async iterator yielding { event, data } pairs.
 */
type SSEInit = RequestInit & { json?: unknown };

export async function* streamSSE(
  url: string,
  init: SSEInit
): AsyncGenerator<{ event: string; data: any }> {
  const { json: jsonBody, ...rest } = init;
  const finalInit: RequestInit = {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(rest.headers || {}),
      Accept: "text/event-stream",
    },
    body: jsonBody !== undefined ? JSON.stringify(jsonBody) : rest.body,
  };
  const BASE = import.meta.env.VITE_API_URL?.replace(/\/api\/v1\/?$/, "") ?? "";
  const finalUrl = url.startsWith("http") ? url : `${BASE}${url}`;
  const res = await fetch(finalUrl, finalInit);
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Stream error ${res.status}: ${text.slice(0, 300)}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const lines = part.split("\n");
        let event = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          else if (line.startsWith(":")) { /* comment */ }
        }
        if (dataLines.length === 0) continue;
        try {
          yield { event, data: JSON.parse(dataLines.join("\n")) };
        } catch {
          yield { event, data: dataLines.join("\n") };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
