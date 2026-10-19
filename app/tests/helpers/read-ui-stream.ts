import type { InferUIMessageChunk } from "ai";
import type { HscUIMessage } from "@/lib/schemas";

/** One chunk of the app's UI message stream (`start`, `data-*`, `text-*`, `error`, `finish`, ...). */
export type HscUIChunk = InferUIMessageChunk<HscUIMessage>;

const DONE = "[DONE]";

/**
 * Parses the SSE text of a UI message stream (`data: <json>\n\n` events, closed by
 * `data: [DONE]`) into its chunk list. Comment lines (keep-alives) are ignored.
 */
export function parseUIStream(sse: string): HscUIChunk[] {
  const chunks: HscUIChunk[] = [];
  for (const event of sse.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    if (data === "" || data === DONE) continue;
    chunks.push(JSON.parse(data) as HscUIChunk);
  }
  return chunks;
}

/** Reads a streamed `Response` to the end and returns its chunk list. */
export async function readUIStream(response: Response): Promise<HscUIChunk[]> {
  return parseUIStream(await response.text());
}
