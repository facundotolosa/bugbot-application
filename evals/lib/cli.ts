const API_KEY_ENV = "CURSOR_API_KEY";

export type CliOptions = {
  suite?: string;
  caseId?: string;
  refreshInputs: boolean;
};

export function parseCliArgs(argv: string[] = process.argv.slice(2)): CliOptions {
  const options: CliOptions = { refreshInputs: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--refresh-inputs") {
      options.refreshInputs = true;
      continue;
    }
    if (arg === "--suite" && argv[i + 1]) {
      options.suite = argv[++i];
      continue;
    }
    if (arg === "--case" && argv[i + 1]) {
      options.caseId = argv[++i];
      continue;
    }
  }

  return options;
}

export function requireCursorApiKey(): void {
  if (!process.env[API_KEY_ENV]?.trim()) {
    console.error(
      `Evals require a Cursor API key. Set ${API_KEY_ENV} in your environment and run again.`,
    );
    process.exit(1);
  }
}
