import type { SupabaseClient } from "@supabase/supabase-js";

import type { SubmitConcernRequest, SubmitConcernSuccessResponse } from "./contracts";

export async function submitConcern(supabase: SupabaseClient, input: SubmitConcernRequest) {
  const { data, error } = await supabase.functions.invoke<SubmitConcernSuccessResponse>("submit-concern", {
    body: input,
  });

  if (error) {
    throw error;
  }

  return data;
}
