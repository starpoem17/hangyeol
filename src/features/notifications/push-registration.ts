import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { useEffect, useRef } from "react";

import { isProfileReadyForInbox } from "@/features/session/gate";
import {
  createPushRegistrationRevalidationController,
  mapPushRegistrationProfile,
  type PushRegistrationProfileRow,
  type PushRegistrationRevalidationRun,
} from "./push-registration-core";

type PushPlatform = "ios" | "android";

export function getPushPlatform(): PushPlatform | null {
  if (Platform.OS === "ios" || Platform.OS === "android") {
    return Platform.OS;
  }

  return null;
}

export function resolveExpoProjectId() {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    null;

  return typeof projectId === "string" && projectId.length > 0 ? projectId : null;
}

export async function fetchMinimalPushProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, gender, onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapPushRegistrationProfile(data as PushRegistrationProfileRow) : null;
}

async function syncMyPushToken(supabase: SupabaseClient, expoPushToken: string | null, platform: PushPlatform) {
  const { error } = await supabase.rpc("sync_my_push_token", {
    p_expo_push_token: expoPushToken,
    p_platform: platform,
  });

  if (error) {
    throw error;
  }
}

export async function syncPushRegistrationForReadyProfile(params: {
  supabase: SupabaseClient;
  hasPromptedForCurrentUser: boolean;
  setHasPromptedForCurrentUser(prompted: boolean): void;
}) {
  const platform = getPushPlatform();

  if (!platform) {
    return;
  }

  let permissionStatus = (await Notifications.getPermissionsAsync()).status;

  if (permissionStatus === "undetermined" && !params.hasPromptedForCurrentUser) {
    params.setHasPromptedForCurrentUser(true);
    permissionStatus = (await Notifications.requestPermissionsAsync()).status;
  }

  if (permissionStatus === "denied") {
    await syncMyPushToken(params.supabase, null, platform);
    return;
  }

  if (permissionStatus !== "granted") {
    return;
  }

  const projectId = resolveExpoProjectId();

  if (!projectId) {
    throw new Error("EXPO_PUBLIC_EAS_PROJECT_ID is required for push token registration");
  }

  const token = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  await syncMyPushToken(params.supabase, token.data, platform);
}

export function usePushRegistration(supabase: SupabaseClient, session: Session | null) {
  const controllerRef = useRef(createPushRegistrationRevalidationController());
  const promptedRef = useRef(false);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    controllerRef.current.replaceUser(userId);
    promptedRef.current = false;

    if (!userId) {
      return;
    }

    const run = controllerRef.current.requestRun("session");

    if (!run) {
      return;
    }

    const executeRun = async (currentRun: PushRegistrationRevalidationRun): Promise<void> => {
      try {
        const profile = await fetchMinimalPushProfile(supabase, currentRun.userId);

        if (!controllerRef.current.isCurrent(currentRun) || !isProfileReadyForInbox(profile)) {
          return;
        }

        await syncPushRegistrationForReadyProfile({
          supabase,
          hasPromptedForCurrentUser: promptedRef.current,
          setHasPromptedForCurrentUser: (prompted) => {
            promptedRef.current = prompted;
          },
        });
      } finally {
        const nextRun = controllerRef.current.finishRun(currentRun);

        if (nextRun) {
          await executeRun(nextRun);
        }
      }
    };

    void executeRun(run);
  }, [session?.user.id, supabase]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || !session?.user.id) {
        return;
      }

      const run = controllerRef.current.requestRun("foreground");

      if (!run) {
        return;
      }

      const executeRun = async (currentRun: PushRegistrationRevalidationRun): Promise<void> => {
        try {
          const profile = await fetchMinimalPushProfile(supabase, currentRun.userId);

          if (!controllerRef.current.isCurrent(currentRun) || !isProfileReadyForInbox(profile)) {
            return;
          }

          await syncPushRegistrationForReadyProfile({
            supabase,
            hasPromptedForCurrentUser: promptedRef.current,
            setHasPromptedForCurrentUser: (prompted) => {
              promptedRef.current = prompted;
            },
          });
        } finally {
          const nextRun = controllerRef.current.finishRun(currentRun);

          if (nextRun) {
            await executeRun(nextRun);
          }
        }
      };

      void executeRun(run);
    });

    return () => {
      subscription.remove();
    };
  }, [session?.user.id, supabase]);
}
