import { useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { CANONICAL_INTERESTS, type GenderKey, type InterestKey } from "@/features/onboarding/constants";
import {
  getMyProfileSummary,
  updateMyProfileInterests,
  type MyProfileSummary,
  type UpdateMyProfileInterestsFailure,
} from "@/features/profile/api";
import { useSessionContext } from "@/features/session/context";
import { supabase } from "@/lib/supabase";

const GENDER_LABELS: Record<GenderKey, string> = {
  male: "남성",
  female: "여성",
};

function normalizeInterestKeys(interestKeys: InterestKey[]) {
  return Array.from(new Set(interestKeys)).sort() as InterestKey[];
}

function areInterestKeysEqual(left: InterestKey[], right: InterestKey[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export default function ProfileScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [profile, setProfile] = useState<MyProfileSummary | null>(null);
  const [savedInterestKeys, setSavedInterestKeys] = useState<InterestKey[]>([]);
  const [selectedInterestKeys, setSelectedInterestKeys] = useState<InterestKey[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "not_found">("loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [fieldErrorMessage, setFieldErrorMessage] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/");
    }
  }, [isSessionLoading, router, session]);

  useEffect(() => {
    if (isSessionLoading || !session) {
      return;
    }

    let isActive = true;

    async function load() {
      setLoadState("loading");
      setLoadErrorMessage(null);
      setFieldErrorMessage(null);
      setSubmitMessage(null);

      try {
        const nextProfile = await getMyProfileSummary(supabase);

        if (!isActive) {
          return;
        }

        if (!nextProfile) {
          setProfile(null);
          setSavedInterestKeys([]);
          setSelectedInterestKeys([]);
          setLoadState("not_found");
          return;
        }

        const normalizedInterestKeys = normalizeInterestKeys(nextProfile.interestKeys);

        setProfile({
          ...nextProfile,
          interestKeys: normalizedInterestKeys,
        });
        setSavedInterestKeys(normalizedInterestKeys);
        setSelectedInterestKeys(normalizedInterestKeys);
        setLoadState("ready");
      } catch {
        if (!isActive) {
          return;
        }

        setProfile(null);
        setSavedInterestKeys([]);
        setSelectedInterestKeys([]);
        setLoadErrorMessage("프로필을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
        setLoadState("error");
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [isSessionLoading, reloadNonce, session]);

  const normalizedSelectedInterestKeys = useMemo(
    () => normalizeInterestKeys(selectedInterestKeys),
    [selectedInterestKeys],
  );
  const hasUnsavedChanges = !areInterestKeysEqual(normalizedSelectedInterestKeys, savedInterestKeys);
  const canSave = normalizedSelectedInterestKeys.length > 0 && hasUnsavedChanges && !isSaving;

  const toggleInterest = (interestKey: InterestKey) => {
    setSelectedInterestKeys((current) =>
      current.includes(interestKey)
        ? current.filter((key) => key !== interestKey)
        : normalizeInterestKeys([...current, interestKey]),
    );
    setFieldErrorMessage(null);
    setSubmitMessage(null);
  };

  const handleSave = async () => {
    if (normalizedSelectedInterestKeys.length === 0) {
      setFieldErrorMessage("관심 분야를 하나 이상 선택해 주세요.");
      setSubmitMessage(null);
      return;
    }

    if (!hasUnsavedChanges || isSaving) {
      return;
    }

    setIsSaving(true);
    setFieldErrorMessage(null);
    setSubmitMessage(null);

    try {
      await updateMyProfileInterests(supabase, {
        interestKeys: normalizedSelectedInterestKeys,
      });

      setSavedInterestKeys(normalizedSelectedInterestKeys);
      setProfile((current) =>
        current
          ? {
              ...current,
              interestKeys: normalizedSelectedInterestKeys,
            }
          : current,
      );
      setSubmitMessage("관심 분야를 저장했어요.");
    } catch (error) {
      const failure = error as UpdateMyProfileInterestsFailure;

      if (failure.kind === "validation") {
        setFieldErrorMessage(failure.userMessage);
      } else {
        setSubmitMessage(failure.userMessage);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isSessionLoading || loadState === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>프로필을 불러오고 있어요.</Text>
      </View>
    );
  }

  if (loadState === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>프로필을 불러오지 못했어요</Text>
        <Text style={styles.description}>{loadErrorMessage}</Text>
        <Pressable onPress={() => setReloadNonce((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  }

  if (loadState === "not_found" || !profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>프로필 상태를 확인할 수 없어요</Text>
        <Text style={styles.description}>잠시 후 다시 확인해 주세요.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.summaryCard}>
        <Text style={styles.eyebrow}>내 정보</Text>
        <Text style={styles.summaryTitle}>고민을 해결해준 횟수</Text>
        <Text style={styles.solvedCount}>{profile.solvedCount}</Text>
        <Text style={styles.summaryDescription}>실사용자 고민 답변에서 좋아요를 받은 경우만 집계해요.</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>성별</Text>
        <View style={styles.genderChip}>
          <Text style={styles.genderChipText}>{profile.gender ? GENDER_LABELS[profile.gender] : "미설정"}</Text>
        </View>
        <Text style={styles.helperText}>성별은 MVP 범위에서 수정할 수 없어요.</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>관심 분야</Text>
        <Text style={styles.helperText}>관심 분야 수정은 이후 라우팅에만 반영돼요.</Text>
        <View style={styles.chipWrap}>
          {CANONICAL_INTERESTS.map((interest) => {
            const selected = normalizedSelectedInterestKeys.includes(interest.key);

            return (
              <Pressable
                key={interest.key}
                onPress={() => toggleInterest(interest.key)}
                style={[styles.interestChip, selected && styles.interestChipSelected]}
              >
                <Text style={[styles.interestChipText, selected && styles.interestChipTextSelected]}>
                  {interest.labelKo}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {fieldErrorMessage ? <Text style={styles.errorText}>{fieldErrorMessage}</Text> : null}
        {submitMessage ? <Text style={styles.noticeText}>{submitMessage}</Text> : null}
        <Pressable disabled={!canSave} onPress={handleSave} style={[styles.primaryButton, !canSave && styles.primaryButtonDisabled]}>
          {isSaving ? <ActivityIndicator color="#f8fafc" /> : <Text style={styles.primaryButtonText}>관심 분야 저장</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
    backgroundColor: "#f8fafc",
  },
  centered: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  eyebrow: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  description: {
    marginTop: 12,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  loadingText: {
    marginTop: 16,
    color: "#334155",
    fontSize: 16,
  },
  summaryCard: {
    borderRadius: 24,
    backgroundColor: "#0f172a",
    padding: 22,
  },
  summaryTitle: {
    marginTop: 10,
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
  },
  solvedCount: {
    marginTop: 12,
    color: "#f8fafc",
    fontSize: 44,
    fontWeight: "800",
  },
  summaryDescription: {
    marginTop: 8,
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
  },
  sectionTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
  },
  helperText: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
  },
  genderChip: {
    alignSelf: "flex-start",
    marginTop: 16,
    borderRadius: 999,
    backgroundColor: "#eff6ff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  genderChipText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700",
  },
  chipWrap: {
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  interestChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  interestChipSelected: {
    borderColor: "#1d4ed8",
    backgroundColor: "#dbeafe",
  },
  interestChipText: {
    color: "#334155",
    fontSize: 14,
    fontWeight: "600",
  },
  interestChipTextSelected: {
    color: "#1d4ed8",
  },
  errorText: {
    marginTop: 14,
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  noticeText: {
    marginTop: 14,
    color: "#0f766e",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 18,
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: "#0f172a",
    paddingVertical: 16,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
});
