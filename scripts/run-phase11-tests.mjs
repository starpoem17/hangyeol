import { spawnSync } from "node:child_process";
import process from "node:process";

const PHASE11_TEST_FILES = [
  "supabase/tests/migrations.test.ts",
  "supabase/tests/access-control.test.ts",
  "supabase/tests/moderation-persistence.test.ts",
  "supabase/tests/repo-scenario.test.ts",
  "supabase/tests/repo-scenario-blocked.test.ts",
];

function fail(message, details) {
  console.error(message);

  if (details) {
    console.error(details);
  }

  process.exit(1);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
}

function runInherited(command, args, options = {}) {
  return spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });
}

function parseEnvOutput(stdout) {
  const parsed = {};

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    const rawValue = rest.join("=");
    parsed[key] =
      rawValue.startsWith("\"") && rawValue.endsWith("\"") ? rawValue.slice(1, -1) : rawValue;
  }

  return parsed;
}

const statusResult = run("npx", ["-y", "supabase", "status", "-o", "env"]);

if (statusResult.status !== 0) {
  fail(
    "Local Supabase status lookup failed. Ensure Docker is running and `npx -y supabase start` has completed.",
    statusResult.stderr || statusResult.stdout,
  );
}

const parsedEnv = parseEnvOutput(statusResult.stdout);
const apiUrl = parsedEnv.API_URL;
const anonKey = parsedEnv.ANON_KEY;
const serviceRoleKey = parsedEnv.SERVICE_ROLE_KEY;

if (!apiUrl || !anonKey || !serviceRoleKey) {
  fail(
    "Local Supabase status output is missing API_URL, ANON_KEY, or SERVICE_ROLE_KEY.",
    statusResult.stdout,
  );
}

const resetResult = runInherited("npx", ["-y", "supabase", "db", "reset", "--local", "--yes", "--no-seed"]);

if (resetResult.status !== 0) {
  process.exit(resetResult.status ?? 1);
}

const testResult = runInherited(
  "npx",
  ["vitest", "run", ...PHASE11_TEST_FILES],
  {
    env: {
      ...process.env,
      PHASE11_SUPABASE_URL: apiUrl,
      PHASE11_SUPABASE_ANON_KEY: anonKey,
      PHASE11_SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
  },
);

process.exit(testResult.status ?? 1);
