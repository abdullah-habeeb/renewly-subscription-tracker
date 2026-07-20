import { describe, expect, test } from "vitest";
import { cancelSearchUrl, findCancelGuide, UPI_MANDATE_TIP } from "./cancellation";

describe("findCancelGuide", () => {
  test("matches merchants case-insensitively and inside longer names", () => {
    expect(findCancelGuide("Netflix")?.merchant).toBe("Netflix");
    expect(findCancelGuide("netflix premium")?.merchant).toBe("Netflix");
    expect(findCancelGuide("NETFLIX (family)")?.merchant).toBe("Netflix");
  });

  // The scanner names Google plans several ways — every variant must land on
  // the same guide.
  test("maps every Google plan variant to the Google guide", () => {
    for (const name of ["Google One", "Google AI Pro", "Google AI Premium", "Google Gemini"]) {
      expect(findCancelGuide(name)?.merchant).toBe("Google One / Google AI");
    }
  });

  test("covers the big Indian OTT services", () => {
    expect(findCancelGuide("Disney+ Hotstar")?.merchant).toBe("JioHotstar");
    expect(findCancelGuide("ZEE5")?.merchant).toBe("ZEE5");
    expect(findCancelGuide("SonyLIV")?.merchant).toBe("SonyLIV");
    expect(findCancelGuide("Amazon Prime")?.merchant).toBe("Amazon Prime");
  });

  test("returns null for unknown merchants", () => {
    expect(findCancelGuide("Neighborhood Gym")).toBeNull();
    expect(findCancelGuide("Some Local Magazine")).toBeNull();
  });

  test("every guide has a https url and at least two steps", () => {
    for (const name of ["Netflix", "Spotify", "Adobe", "ChatGPT Plus", "LinkedIn"]) {
      const guide = findCancelGuide(name);
      expect(guide).not.toBeNull();
      expect(guide!.url).toMatch(/^https:\/\//);
      expect(guide!.steps.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("cancelSearchUrl", () => {
  test("URL-encodes the subscription name", () => {
    const url = cancelSearchUrl("Local Gym & Spa");
    expect(url).toContain("https://www.google.com/search?q=");
    expect(url).toContain(encodeURIComponent("Local Gym & Spa"));
    expect(url).not.toContain(" ");
  });
});

describe("UPI mandate tip", () => {
  test("mentions where mandates actually live", () => {
    expect(UPI_MANDATE_TIP).toMatch(/UPI/);
    expect(UPI_MANDATE_TIP).toMatch(/mandate/i);
  });
});
