export type AnalyzerKey = "security" | "performance";

export interface DiffFileInput {
  path: string;
  diff: string;
}

const PATH_HEURISTICS = [
  "packages/",
  "/api/",
  "server",
  "worker",
  "service",
  "route",
  "handler",
  "packages/reviewer-runner",
  "packages/ledger-lite",
  "model",
  "repository",
  "db",
  "database",
] as const;

const CONTENT_TOKENS = [
  "mongoose",
  "mongodb",
  "MongoClient",
  "prisma",
  ".aggregate(",
  ".find(",
  ".findOne(",
  "getCollection",
  "INSERT",
  "SELECT",
  "useEffect",
  "useState",
  "useMemo",
  "useCallback",
  "React.memo",
] as const;

function matchesPathHeuristic(path: string): boolean {
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) {
    return true;
  }
  return PATH_HEURISTICS.some((segment) => path.includes(segment));
}

function matchesContentHeuristic(path: string, diff: string): boolean {
  const haystack = `${path}\n${diff}`;
  return CONTENT_TOKENS.some((token) => haystack.includes(token));
}

function shouldRunPerformance(file: DiffFileInput): boolean {
  return matchesPathHeuristic(file.path) || matchesContentHeuristic(file.path, file.diff);
}

export function selectAnalyzers(files: DiffFileInput[]): AnalyzerKey[] {
  const analyzers: AnalyzerKey[] = ["security"];
  if (files.some(shouldRunPerformance)) {
    analyzers.push("performance");
  }
  return analyzers;
}
