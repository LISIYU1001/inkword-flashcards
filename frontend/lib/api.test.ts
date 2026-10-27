import { describe, expect, it } from "vitest";

import { apiUrl, resolveApiBase } from "./api";

describe("public API URL", () => {
  it("normalizes a configured base URL and maps every public endpoint", () => {
    const base = "https://inkword-api.example.com/";

    expect(apiUrl("/api/parse", base, "production")).toBe(
      "https://inkword-api.example.com/api/parse",
    );
    expect(apiUrl("/api/explain", base, "production")).toBe(
      "https://inkword-api.example.com/api/explain",
    );
    expect(apiUrl("/api/ai/status", base, "production")).toBe(
      "https://inkword-api.example.com/api/ai/status",
    );
  });

  it("uses the local backend only for a local browser", () => {
    expect(resolveApiBase(undefined, "production", "localhost")).toBe(
      "http://127.0.0.1:8000",
    );
    expect(resolveApiBase(undefined, "production", "127.0.0.1")).toBe(
      "http://127.0.0.1:8000",
    );
  });

  it("fails clearly when a public production build has no API URL", () => {
    expect(() =>
      resolveApiBase(undefined, "production", "inkword.pages.dev"),
    ).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("rejects malformed and insecure public API URLs", () => {
    expect(() =>
      resolveApiBase("not-a-url", "production", "inkword.pages.dev"),
    ).toThrow(/HTTPS/);
    expect(() =>
      resolveApiBase("http://api.example.com", "production", "inkword.pages.dev"),
    ).toThrow(/HTTPS/);
  });
});
