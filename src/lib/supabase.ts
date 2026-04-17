import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name: "EXPO_PUBLIC_SUPABASE_URL" | "EXPO_PUBLIC_SUPABASE_ANON_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export const supabase = createClient(
  getRequiredEnv("EXPO_PUBLIC_SUPABASE_URL"),
  getRequiredEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
