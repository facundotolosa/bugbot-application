const API_KEY_ENV = "CURSOR_API_KEY";

export type CliOptions = {
  /** Single suite filter (legacy). Prefer `suites`. */
  suite?: string;
  suites: string[];
  caseId?: string;
  refreshInputs: boolean;
  /** When true, show agent orchestration stream and task prompt dumps. */
  verbose: boolean;
};

export function parseCliArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  const options: CliOptions = { refreshInputs: false, suites: [], verbose: false };
  let verboseFromFlag = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--verbose") {
      verboseFromFlag = true;
      options.verbose = true;
      continue;
    }
    if (arg === "--refresh-inputs") {
      options.refreshInputs = true;
      continue;
    }
    if (arg === "--suite" && argv[i + 1]) {
      const name = argv[++i]!;
      options.suites.push(name);
      options.suite = options.suite ?? name;
      continue;
    }
    if (arg === "--case" && argv[i + 1]) {
      options.caseId = argv[++i];
      continue;
    }
  }

  // CLI flag wins when both --verbose and EVAL_VERBOSE=1 are set.
  if (!verboseFromFlag && process.env.EVAL_VERBOSE === "1") {
    options.verbose = true;
  }

  return options;
}

export function requireCursorApiKey(): void {
  if (!process.env[API_KEY_ENV]?.trim()) {
    console.error(
      `Evals require a Cursor API key. Set ${API_KEY_ENV} in the repository root .env or your environment and run again.`,
    );
    process.exit(1);
  }
}
