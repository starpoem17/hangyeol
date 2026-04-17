import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { logError, logInfo } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { completeOnboarding, type OnboardingRpcFailure } from "@/features/onboarding/api";
import {
  CANONICAL_GENDERS,
  CANONICAL_INTERESTS,
  type GenderKey,
  type InterestKey,
} from "@/features/onboarding/constants";
import { validateOnboardingInput } from "@/features/onboarding/validation";
import { fetchOwnProfileWithRetry } from "@/features/session/bootstrap";
import { useSessionContext } from "@/features/session/context";

const GENDER_LABELS: Record<GenderKey, string> = {
  male: "남성",
  female: "여성",
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [selectedGender, setSelectedGender] = useState<GenderKey | null>(null);
  const [selectedInterests, setSelectedInterests] = useState<InterestKey[]>([]);
  const [fieldErrors, setFieldErrors] = useState<{
    gender?: string;
    interestKeys?: string;
  }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sessionLogPayload = useMemo(
    () => ({
      hasSession: Boolean(session),
      userIdPresent: Boolean(session?.user.id),
    }),
    [session],
  );

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/");
    }
  }, [isSessionLoading, router, session]);

  if (isSessionLoading || !session) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>인증 상태를 불러오고 있어요.</Text>
      </View>
    );
  }

  const toggleInterest = (interestKey: InterestKey) => {
    setSelectedInterests((current) =>
      current.includes(interestKey) ? current.filter((key) => key !== interestKey) : [...current, interestKey],
    );
  };

  const handleSubmit = async () => {
    const validation = validateOnboardingInput({
      gender: selectedGender,
      interestKeys: selectedInterests,
    });

    if (!validation.success) {
      setFieldErrors(validation.fieldErrors);
      setSubmitError(null);
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      logInfo({
        event: "complete_onboarding_rpc_started",
        stage: "onboarding_rpc",
        ...sessionLogPayload,
      });

      await completeOnboarding(supabase, {
        gender: selectedGender as GenderKey,
        interestKeys: selectedInterests,
      });

      logInfo({
        event: "complete_onboarding_rpc_succeeded",
        stage: "onboarding_rpc",
        ...sessionLogPayload,
      });

      const profileResult = await fetchOwnProfileWithRetry({
        supabase,
        session,
        isCurrent: () => true,
      });

      if (profileResult.kind === "success" && profileResult.profile.onboardingCompleted && profileResult.profile.gender) {
        router.replace("/inbox");
        return;
      }

      setSubmitError("설정 내용이 바로 반영됐는지 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.");
    } catch (error) {
      const failure = error as OnboardingRpcFailure;

      logError({
        event: "complete_onboarding_rpc_failed",
        stage: "onboarding_rpc",
        ...sessionLogPayload,
        errorCode: failure.errorCode,
        errorMessage: failure.errorMessage,
        errorTag: failure.tag ?? undefined,
      });

      if (failure.kind === "validation") {
        setFieldErrors((current) => ({
          ...current,
          interestKeys: failure.userMessage,
        }));
        setSubmitError(null);
      } else {
        setSubmitError(failure.userMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>첫 사용 설정</Text>
      <Text style={styles.title}>성별과 관심 분야를 알려주세요</Text>
      <Text style={styles.description}>
        앱 첫 실행에서만 필요한 정보예요. 이후에는 이 정보를 기준으로 고민이 전달돼요.
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>성별</Text>
        <View style={styles.row}>
          {CANONICAL_GENDERS.map((gender) => {
            const selected = selectedGender === gender;
            return (
              <Pressable
                key={gender}
                onPress={() => setSelectedGender(gender)}
                style={[styles.singleChip, selected && styles.singleChipSelected]}
              >
                <Text style={[styles.singleChipText, selected && styles.singleChipTextSelected]}>
                  {GENDER_LABELS[gender]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.gender ? <Text style={styles.errorText}>{fieldErrors.gender}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>관심 분야</Text>
        <View style={styles.chipWrap}>
          {CANONICAL_INTERESTS.map((interest) => {
            const selected = selectedInterests.includes(interest.key);
            return (
              <Pressable
                key={interest.key}
                onPress={() => toggleInterest(interest.key)}
                style={[styles.multiChip, selected && styles.multiChipSelected]}
              >
                <Text style={[styles.multiChipText, selected && styles.multiChipTextSelected]}>{interest.labelKo}</Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrors.interestKeys ? <Text style={styles.errorText}>{fieldErrors.interestKeys}</Text> : null}
      </View>

      {submitError ? <Text style={styles.submitErrorText}>{submitError}</Text> : null}

      <Pressable disabled={isSubmitting} onPress={handleSubmit} style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}>
        {isSubmitting ? (
          <ActivityIndicator color="#f8fafc" />
        ) : (
          <Text style={styles.submitButtonText}>설정 완료</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 48,
    backgroundColor: "#f8fafc",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    marginTop: 16,
    color: "#334155",
    fontSize: 16,
  },
  eyebrow: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    marginTop: 12,
    color: "#0f172a",
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "700",
  },
  description: {
    marginTop: 12,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },
  section: {
    marginTop: 28,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  singleChip: {
    minWidth: 116,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
    alignItems: "center",
  },
  singleChipSelected: {
    backgroundColor: "#0f172a",
  },
  singleChipText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "600",
  },
  singleChipTextSelected: {
    color: "#f8fafc",
  },
  multiChip: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  multiChipSelected: {
    backgroundColor: "#1d4ed8",
  },
  multiChipText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "600",
  },
  multiChipTextSelected: {
    color: "#eff6ff",
  },
  errorText: {
    marginTop: 10,
    color: "#b91c1c",
    fontSize: 13,
  },
  submitErrorText: {
    marginTop: 20,
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    marginTop: 28,
    backgroundColor: "#0f172a",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
});
