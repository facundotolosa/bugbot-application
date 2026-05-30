import { describe, expect, it } from "vitest";
import { selectAnalyzers } from "./select-analyzers.js";

describe("selectAnalyzers", () => {
  it("always includes security", () => {
    expect(selectAnalyzers([])).toEqual(["security"]);
    expect(
      selectAnalyzers([{ path: "README.md", diff: "cosmetic change only" }]),
    ).toEqual(["security"]);
  });

  it("omits performance for docs-only cosmetic diff", () => {
    expect(
      selectAnalyzers([
        { path: "README.md", diff: "# Title\n\nUpdated description." },
      ]),
    ).toEqual(["security"]);
  });

  it("includes performance for packages/ path heuristic", () => {
    expect(
      selectAnalyzers([
        { path: "packages/foo/bar.ts", diff: "+export const x = 1;" },
      ]),
    ).toEqual(["security", "performance"]);
  });

  it("includes performance for .tsx paths", () => {
    expect(
      selectAnalyzers([{ path: "src/App.tsx", diff: "+export function App() {}" }]),
    ).toEqual(["security", "performance"]);
  });

  it("includes performance when diff contains useEffect", () => {
    expect(
      selectAnalyzers([
        { path: "src/hooks.ts", diff: "+  useEffect(() => {}, []);" },
      ]),
    ).toEqual(["security", "performance"]);
  });

  it("returns security before performance", () => {
    const result = selectAnalyzers([
      { path: "packages/app/page.tsx", diff: "+useState(0)" },
    ]);
    expect(result).toEqual(["security", "performance"]);
  });
});
