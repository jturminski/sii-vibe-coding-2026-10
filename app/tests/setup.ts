import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

// TAC-03: unit and integration tests must never reach OpenRouter.
const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("openrouter.ai")) {
      throw new Error(`Network guard: tests must not call OpenRouter (${url})`);
    }
    return realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
