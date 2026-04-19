import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    limit: 20,
    subjectType: null,
    blocked: null,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] ?? options.limit);
      index += 1;
      continue;
    }

    if (arg === "--subject-type") {
      options.subjectType = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--blocked") {
      const value = argv[index + 1] ?? "";
      options.blocked = value === "true" ? true : value === "false" ? false : null;
      index += 1;
      continue;
    }

    if (arg === "--verbose") {
      options.verbose = true;
    }
  }

  return options;
}

function truncateText(value, maxLength = 120) {
  if (typeof value !== "string") {
    return "";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.rpc("list_moderation_audit_entries_for_operator", {
    p_limit: options.limit,
    p_subject_type: options.subjectType,
    p_blocked: options.blocked,
  });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const formatted = rows.map((row) => ({
    checked_at: row.checked_at,
    subject_type: row.subject_type,
    actor_profile_id: row.actor_profile_id,
    blocked: row.blocked,
    approved_entity_type: row.approved_entity_type,
    approved_entity_id: row.approved_entity_id,
    category_summary: row.category_summary,
    raw_submitted_text: truncateText(row.raw_submitted_text),
    has_raw_provider_payload: row.has_raw_provider_payload,
    ...(options.verbose ? { raw_provider_payload: row.raw_provider_payload } : {}),
  }));

  console.log(JSON.stringify(formatted, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
