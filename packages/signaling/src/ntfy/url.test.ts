import { describe, expect, it } from "vitest";

import { parseNtfyUrl } from "./url.js";

const testCases = [
  {
    url: "https://ntfy.sh/?auth=mytoken1",
    expected: {
      host: "ntfy.sh",
      protocol: "https",
      parameters: "?auth=mytoken1",
    },
  },
  {
    url: "https://ntfy.sh/?auth=mytoken2",
    expected: {
      host: "ntfy.sh",
      protocol: "http",
      parameters: "?auth=mytoken2",
    },
  },
  {
    url: "ntfy://mytoken@example.com",
    expected: {
      host: "example.com",
      protocol: "http",
      credentials: { token: "mytoken" },
    },
  },
  {
    url: "ntfys://myuser:mypassword@ntfy.sh/",
    expected: {
      host: "ntfy.sh",
      protocol: "https",
      credentials: { user: "myuser", password: "mypassword" },
    },
  },
  {
    url: "ntfy://mytoken@ntfy.sh/?auth=mytoken",
    expected: {
      host: "ntfy.sh",
      protocol: "http",
      credentials: { token: "mytoken" },
      parameters: "?auth=mytoken",
    },
  },
];

describe("should parse NTFY URL", () => {
  for (const testCase of testCases) {
    it(`should parse NTFY URL ${testCase.url}`, () => {
      const result = parseNtfyUrl(testCase.url);

      expect(result).toEqual(testCase.expected);
    });
  }
});
