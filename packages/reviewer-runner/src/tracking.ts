export const TRACKING_MARKER = "< ai-review-tracking >";

const ANALYZED_UP_TO_RE = /^Analyzed up to:\s+(\S+)\s*$/m;
const AT_RE = /^At:\s+(.+?)\s*$/m;

export interface ParsedTracking {
  analyzedSha: string;
  at: string;
}

export interface TrackingCommentLike {
  body: string;
}

export function parseTrackingComment(body: string): ParsedTracking | null {
  if (!body.includes(TRACKING_MARKER)) {
    return null;
  }

  const analyzedMatch = ANALYZED_UP_TO_RE.exec(body);
  const atMatch = AT_RE.exec(body);
  if (!analyzedMatch || !atMatch) {
    return null;
  }

  const analyzedSha = analyzedMatch[1];
  const at = atMatch[1];
  if (Number.isNaN(Date.parse(at))) {
    return null;
  }

  return { analyzedSha, at };
}

export function formatTrackingBody(headSha: string, at: Date): string {
  return `${TRACKING_MARKER}
Analyzed up to: ${headSha}
At: ${at.toISOString()}`;
}

export function selectTrackingComment<T extends TrackingCommentLike>(
  comments: readonly T[],
): T | null {
  let best: T | null = null;
  let bestTime = Number.NEGATIVE_INFINITY;

  for (const comment of comments) {
    const parsed = parseTrackingComment(comment.body);
    if (!parsed) {
      continue;
    }
    const time = Date.parse(parsed.at);
    if (time > bestTime) {
      bestTime = time;
      best = comment;
    }
  }

  return best;
}
