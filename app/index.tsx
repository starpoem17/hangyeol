import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { logError, logInfo, logWarn } from "@/lib/logger";
import { FIRST_REAL_APP_ROUTE } from "@/features/navigation/contracts";
import { supabase } from "@/lib/supabase";
import { createBootstrapRunController, fetchOwnProfileWithRetry, getBootstrapKey } from "@/features/session/bootstrap";
import { useSessionContext } from "@/features/session/context";
import { type BootstrapStatus, decideGateRoute, type PhaseProfile } from "@/features/session/gate";

export default function IndexScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>("idle");
  const [profile, setProfile] = useState<PhaseProfile | null>(null);
  const [fatalMessage, setFatalMessage] = useState("앱 상태를 확인하는 중 문제가 발생했습니다.");
  const [retryNonce, setRetryNonce] = useState(0);
  const controllerRef = useRef(createBootstrapRunController());

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    const bootstrapKey = getBootstrapKey(session);
    const controller = controllerRef.current;

    if (!controller.canStart(bootstrapKey)) {
      return;
    }

    const run = controller.start(bootstrapKey);

    async function runBootstrap() {
      setBootstrapStatus("loading");
      setProfile(null);
      setFatalMessage("앱 상태를 확인하는 중 문제가 발생했습니다.");

      if (!session) {
        logInfo({
          event: "sign_in_anonymous_started",
          stage: "auth",
          hasSession: false,
          userIdPresent: false,
        });

        const { data, error } = await supabase.auth.signInAnonymously();

        if (!controller.isCurrent(run)) {
          controller.finish(run);
          return;
        }

        if (error) {
          logError({
            event: "sign_in_anonymous_failed",
            stage: "auth",
            hasSession: false,
            userIdPresent: false,
            errorCode: error.code,
            errorMessage: error.message,
          });
          setBootstrapStatus("failed");
          setFatalMessage("인증 상태를 다시 확인하지 못했습니다. 잠시 후 상태를 다시 확인해 주세요.");
          controller.finish(run);
          return;
        }

        logInfo({
          event: "sign_in_anonymous_succeeded",
          stage: "auth",
          hasSession: false,
          userIdPresent: Boolean(data.user?.id),
        });
        controller.finish(run);
        return;
      }

      const profileResult = await fetchOwnProfileWithRetry({
        supabase,
        session,
        isCurrent: () => controller.isCurrent(run),
      });

      if (!controller.isCurrent(run)) {
        controller.finish(run);
        return;
      }

      if (profileResult.kind === "success") {
        setProfile(profileResult.profile);
        setBootstrapStatus("idle");
        controller.finish(run);
        return;
      }

      if (profileResult.kind === "failed") {
        logWarn({
          event: "profile_row_missing_after_retries",
          stage: "profile_bootstrap",
          attempt: 5,
          hasSession: true,
          userIdPresent: Boolean(session.user.id),
          errorCode: profileResult.errorCode,
          errorMessage: profileResult.errorMessage,
        });
        setProfile(null);
        setBootstrapStatus("failed");
        setFatalMessage("프로필 상태를 바로 확인하지 못했습니다. 잠시 후 상태를 다시 확인해 주세요.");
      }

      controller.finish(run);
    }

    void runBootstrap();
  }, [isSessionLoading, retryNonce, session]);

  const gateRoute = useMemo(
    () =>
      decideGateRoute({
        hasSession: Boolean(session),
        bootstrapStatus,
        profile,
      }),
    [bootstrapStatus, profile, session],
  );

  useEffect(() => {
    if (gateRoute === "onboarding") {
      router.replace("/onboarding");
    }

    if (gateRoute === "inbox") {
      router.replace(FIRST_REAL_APP_ROUTE);
    }
  }, [gateRoute, router]);

  if (isSessionLoading || gateRoute === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>앱 상태를 확인하고 있어요.</Text>
      </View>
    );
  }

  if (gateRoute === "fatal-error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>상태 확인이 지연되고 있어요</Text>
        <Text style={styles.description}>{fatalMessage}</Text>
        <Pressable
          onPress={() => {
            controllerRef.current.reset();
            setBootstrapStatus("idle");
            setRetryNonce((value) => value + 1);
          }}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>상태 다시 확인</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#111827" />
      <Text style={styles.loadingText}>이동 경로를 정리하고 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#334155",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#0f172a",
    textAlign: "center",
  },
  description: {
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    color: "#475569",
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 24,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "600",
  },
});
