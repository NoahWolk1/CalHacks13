import { describe, expect, it } from "vitest";
import { assertPublicUrl } from "./urlGuard";

describe("assertPublicUrl", () => {
  it("allows public http(s) URLs", () => {
    expect(assertPublicUrl("https://data.sfgov.org/resource/abcd-1234.json?$limit=5").host).toBe("data.sfgov.org");
    expect(assertPublicUrl("http://example.com/x").protocol).toBe("http:");
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "http://localhost:3000/api/agents",
    "http://127.0.0.1/",
    "http://10.0.0.5/",
    "http://172.16.3.4/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://metadata.google.internal/",
    "http://printer.local/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => assertPublicUrl(url)).toThrow();
  });
});
