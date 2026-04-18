# `submit-concern` runtime setup

This function uses server-only secrets. Do not expose any of them through `EXPO_PUBLIC_*`.

Required function/runtime secrets:

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` is required by the current implementation because the function creates a service-role Supabase client and calls the service-role-only `submit_concern_with_moderation_audit(...)` RPC helper.

The Expo app should continue to use only:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
