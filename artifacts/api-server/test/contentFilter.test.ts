import { describe, expect, it } from "vitest";
import { screenContent, screenUsername } from "../src/lib/contentFilter";

/**
 * The filter's job is to be right about the extremes and to hand everything
 * ambiguous to a human. The cases that matter most are the false positives:
 * this is a grocery app, and "cumin", "shiitake" and "Niger" all sit close to
 * the word lists. A block-tier false positive silently eats a real post.
 */
describe("screenContent", () => {
  it("allows ordinary grocery talk", () => {
    for (const text of [
      "Milk is $3.49 at Aldi this week",
      "Best price on cumin and shiitake mushrooms",
      "Raccoon got into my groceries",
      "prices: 1.99 2.99 3.99 4.99 5.99 6.99",
    ]) {
      expect(screenContent(text).verdict, text).toBe("allow");
    }
  });

  it("does not mistake near-miss words for slurs", () => {
    // Both collapse to the same string as a slur; the length guard is what
    // separates them.
    expect(screenContent("I visited Niger last year").verdict).toBe("allow");
    expect(screenContent("Great deals in Nigeria").verdict).toBe("allow");
    // Whole-word matching keeps prose off the substring path entirely.
    expect(screenContent("the analysis of unit prices").verdict).toBe("allow");
  });

  it("blocks slurs, sexual content and threats", () => {
    for (const text of [
      "that guy is a n1gg3r",
      "free p0rn here",
      "you should kill yourself",
    ]) {
      expect(screenContent(text).verdict, text).toBe("block");
    }
  });

  it("sees through leetspeak, padding and spelled-out letters", () => {
    expect(screenContent("k i l l   y o u r s e l f").verdict).toBe("block");
    expect(screenContent("what the fuuuuck is this price").verdict).toBe("review");
    expect(screenContent("this store is a f u c k i n g rip off").verdict).toBe("review");
  });

  it("sends profanity and spam signals to a human rather than refusing them", () => {
    expect(screenContent("this price is bullshit").verdict).toBe("review");
    expect(screenContent("check https://spam.example.com").verdict).toBe("review");
    expect(screenContent("Call me at 555-123-4567 for deals").verdict).toBe("review");
    // A surname on the review tier, not the block tier, precisely because of this.
    expect(screenContent("Lynch's Market has good deals").verdict).toBe("review");
  });

  it("returns a client-safe reason only when blocking", () => {
    expect(screenContent("Milk is cheap").reason).toBeNull();
    expect(screenContent("this price is bullshit").reason).toBeNull();
    expect(screenContent("free p0rn here").reason).toContain("no tolerance");
  });

  it("treats empty input as the caller's problem, not objectionable", () => {
    expect(screenContent("").verdict).toBe("allow");
    expect(screenContent("   ").verdict).toBe("allow");
  });
});

describe("screenUsername", () => {
  it("allows the generated handles and ordinary ones", () => {
    for (const handle of ["SoggyPickle42", "ShiitakeSam", "CuminQueen", "bob_the_shopper"]) {
      expect(screenUsername(handle).verdict, handle).toBe("allow");
    }
  });

  it("refuses handles that hide profanity or slurs with no separators", () => {
    // A handle is one token, so unlike prose it has to be matched by substring.
    for (const handle of ["fu_ck_you", "N1gg3rHater", "b1gd1ckhead"]) {
      expect(screenUsername(handle).verdict, handle).toBe("block");
    }
  });

  it("has no review tier — a handle has no moderation queue to fall into", () => {
    // "bullshit" is review-tier in prose but a refusal as a handle.
    expect(screenContent("bullshit prices").verdict).toBe("review");
    expect(screenUsername("BullshitPrices").verdict).toBe("block");
  });
});
