import { describe, expect, it } from "vitest";
import {
  TRACKING_MARKER,
  formatTrackingBody,
  parseTrackingComment,
  selectTrackingComment,
} from "./tracking.js";

const VALID_SHA = "a".repeat(40);

function trackingBody(sha: string, at: string): string {
  return `${TRACKING_MARKER}
Analyzed up to: ${sha}
At: ${at}`;
}

describe("parseTrackingComment", () => {
  it("parses marker, analyzed SHA, and ISO timestamp", () => {
    const at = "2026-05-30T12:00:00.000Z";
    const parsed = parseTrackingComment(trackingBody(VALID_SHA, at));
    expect(parsed).toEqual({ analyzedSha: VALID_SHA, at });
  });

  it("returns null when marker is missing", () => {
    expect(
      parseTrackingComment(`Analyzed up to: ${VALID_SHA}\nAt: 2026-05-30T12:00:00.000Z`),
    ).toBeNull();
  });

  it("returns null when Analyzed up to line is missing", () => {
    expect(
      parseTrackingComment(`${TRACKING_MARKER}\nAt: 2026-05-30T12:00:00.000Z`),
    ).toBeNull();
  });

  it("returns null when At line is missing or not ISO-8601", () => {
    expect(parseTrackingComment(`${TRACKING_MARKER}\nAnalyzed up to: ${VALID_SHA}`)).toBeNull();
    expect(
      parseTrackingComment(`${TRACKING_MARKER}\nAnalyzed up to: ${VALID_SHA}\nAt: not-a-date`),
    ).toBeNull();
  });
});

describe("formatTrackingBody", () => {
  it("emits marker and regex-friendly lines per spec", () => {
    const at = new Date("2026-05-30T12:00:00.000Z");
    const body = formatTrackingBody(VALID_SHA, at);
    expect(body).toBe(trackingBody(VALID_SHA, "2026-05-30T12:00:00.000Z"));
    expect(body).not.toMatch(/Reviewer:/);
  });
});

describe("selectTrackingComment", () => {
  it("returns null when no comment contains a valid tracking body", () => {
    expect(selectTrackingComment([{ body: "unrelated" }, { body: "also unrelated" }])).toBeNull();
  });

  it("picks the comment with the latest At timestamp", () => {
    const older = {
      id: 1,
      body: trackingBody(VALID_SHA, "2026-05-30T10:00:00.000Z"),
    };
    const newer = {
      id: 2,
      body: trackingBody("b".repeat(40), "2026-05-30T14:00:00.000Z"),
    };
    expect(selectTrackingComment([older, newer])).toBe(newer);
    expect(selectTrackingComment([newer, older])).toBe(newer);
  });
});
