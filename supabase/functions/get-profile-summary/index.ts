import { createClient } from "npm:@supabase/supabase-js@2.56.1";

import { getProfileSummaryWithDependencies } from "../../../shared/profile/profile-summary-core.ts";

type JsonHeaders = Record<string, string>;

const jsonHeaders: JsonHeaders = {
  "Content-Type": "application/json",
};

const corsHeaders: JsonHeaders = {
  ...jsonHeaders,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function jsonResponse(status: number, body: unknown, headers: JsonHeaders = corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function createUserClient(request: Request) {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseAnonKey = getRequiredEnv("SUPABASE_ANON_KEY");
  const authorization = request.headers.get("Authorization");

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: authorization
        ? {
            Authorization: authorization,
          }
        : {},
    },
  });
}

function createServiceClient() {
  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function requireAuthenticatedUserId(request: Request) {
  const authorization = request.headers.get("Authorization");

  if (!authorization) {
    return null;
  }

  const userClient = createUserClient(request);
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user.id;
}

Deno.serve(async (request) => {
  console.log("get-profile-summary function entered", {
    method: request.method,
  });

  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  let diagnosticStep = "requireAuthenticatedUserId";
  const authUserId = await requireAuthenticatedUserId(request);

  console.log("get-profile-summary authenticated user id resolved", {
    authUserId,
  });

  if (!authUserId) {
    return jsonResponse(401, {
      code: "auth_required",
      userMessage: "인증 상태를 다시 확인해 주세요.",
    });
  }

  try {
    const serviceClient = createServiceClient();
    const profileSummary = await getProfileSummaryWithDependencies(authUserId, {
      async loadProfileRow(profileId) {
        diagnosticStep = "before loadProfileRow";
        console.log("get-profile-summary before loadProfileRow", {
          profileId,
        });

        const { data, error } = await serviceClient
          .from("profiles")
          .select("id, gender, onboarding_completed")
          .eq("id", profileId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        diagnosticStep = "after loadProfileRow";
        console.log("get-profile-summary after loadProfileRow", {
          profileId,
          profileFound: Boolean(data),
        });

        return data;
      },
      async loadProfileInterests(profileId) {
        diagnosticStep = "before loadProfileInterests";
        console.log("get-profile-summary before loadProfileInterests", {
          profileId,
        });

        const { data, error } = await serviceClient
          .from("profile_interests")
          .select("interest_key")
          .eq("profile_id", profileId)
          .order("interest_key", { ascending: true });

        if (error) {
          throw error;
        }

        diagnosticStep = "after loadProfileInterests";
        console.log("get-profile-summary after loadProfileInterests", {
          profileId,
          interestCount: data?.length ?? 0,
        });

        return data ?? [];
      },
      async loadSolvedCount(profileId) {
        diagnosticStep = "before loadSolvedCount";
        console.log("get-profile-summary before loadSolvedCount", {
          profileId,
        });

        const { data, error } = await serviceClient.rpc("get_profile_solved_count_for_service", {
          p_profile_id: profileId,
        });

        if (error) {
          throw error;
        }

        diagnosticStep = "after loadSolvedCount";
        console.log("get-profile-summary after loadSolvedCount", {
          profileId,
          solvedCount: data,
        });

        return data;
      },
    });

    diagnosticStep = "before final success response";
    console.log("get-profile-summary before final success response", {
      authUserId,
      summaryFound: profileSummary !== null,
      interestCount: profileSummary?.interestKeys.length ?? 0,
      solvedCount: profileSummary?.solvedCount ?? null,
    });

    return jsonResponse(200, profileSummary);
  } catch (error) {
    console.error("get-profile-summary unexpected failure", {
      diagnosticStep,
      error,
      errorName: error instanceof Error ? error.name : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return jsonResponse(500, {
      code: "profile_summary_failed",
      userMessage: "프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
});
