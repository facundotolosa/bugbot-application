# fp-filter-negative

Validator golden case: raw findings include a placeholder credential and a test-file null-check nit that should be filtered, while a real hardcoded token in `src/auth.ts` survives.
