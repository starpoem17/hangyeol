import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  getMyConcernResponseDetail,
  getMyConcernResponseFeedback,
  saveMyConcernResponseFeedback,
} from "@/features/my-concern-responses/api";
import type { SaveMyConcernResponseFeedbackFailure } from "@/features/my-concern-responses/api";
import {
  applyApprovedSaveReload,
  applyBlockedOrFailedSavePreservation,
  applyDisplayDetailRefresh,
  canSubmitFeedback,
  getFeedbackEditorMode,
  hydrateMyConcernResponseScreenState,
  toFeedbackSaveValues,
} from "@/features/my-concern-responses/feedback-state";
import type {
  MyConcernResponseDetail,
  MyConcernResponseFeedbackBaseline,
  MyConcernResponseFeedbackDraft,
  MyConcernResponseScreenState,
} from "@/features/my-concern-responses/types";
import { useSessionContext } from "@/features/session/context";
import { supabase } from "@/lib/supabase";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function MyConcernResponseDetailScreen() {
  const router = useRouter();
  const { responseId } = useLocalSearchParams<{ responseId?: string }>();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [displayDetail, setDisplayDetail] = useState<MyConcernResponseDetail | null>(null);
  const [feedbackBaseline, setFeedbackBaseline] = useState<MyConcernResponseFeedbackBaseline | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<MyConcernResponseFeedbackDraft | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error" | "not_found">("loading");
  const [loadErrorMessage, setLoadErrorMessage] = useState<string | null>(null);
  const [feedbackNoticeMessage, setFeedbackNoticeMessage] = useState<string | null>(null);
  const [feedbackErrorMessage, setFeedbackErrorMessage] = useState<string | null>(null);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const loadStateRef = useRef(loadState);
  const screenStateRef = useRef<MyConcernResponseScreenState | null>(null);

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/");
    }
  }, [isSessionLoading, router, session]);

  useEffect(() => {
    loadStateRef.current = loadState;
  }, [loadState]);

  useEffect(() => {
    screenStateRef.current =
      displayDetail && feedbackBaseline && feedbackDraft
        ? {
            displayDetail,
            feedbackBaseline,
            feedbackDraft,
          }
        : null;
  }, [displayDetail, feedbackBaseline, feedbackDraft]);

  const applyScreenState = useCallback((nextState: MyConcernResponseScreenState) => {
    setDisplayDetail(nextState.displayDetail);
    setFeedbackBaseline(nextState.feedbackBaseline);
    setFeedbackDraft(nextState.feedbackDraft);
  }, []);

  const clearScreenState = useCallback(() => {
    setDisplayDetail(null);
    setFeedbackBaseline(null);
    setFeedbackDraft(null);
  }, []);

  useEffect(() => {
    if (isSessionLoading || !session) {
      return;
    }

    if (typeof responseId !== "string") {
      clearScreenState();
      setLoadState("not_found");
      return;
    }

    const resolvedResponseId = responseId;
    let isActive = true;

    async function load() {
      setLoadState("loading");
      setLoadErrorMessage(null);
      setFeedbackErrorMessage(null);
      setFeedbackNoticeMessage(null);

      try {
        const [nextResponseDetail, nextFeedback] = await Promise.all([
          getMyConcernResponseDetail(supabase, resolvedResponseId),
          getMyConcernResponseFeedback(supabase, resolvedResponseId),
        ]);

        if (!isActive) {
          return;
        }

        if (!nextResponseDetail) {
          clearScreenState();
          setLoadState("not_found");
          return;
        }

        applyScreenState(hydrateMyConcernResponseScreenState(nextResponseDetail, nextFeedback));
        setLoadState("ready");
      } catch {
        if (!isActive) {
          return;
        }

        clearScreenState();
        setLoadErrorMessage("답변 상세를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.");
        setLoadState("error");
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [applyScreenState, clearScreenState, isSessionLoading, reloadNonce, responseId, session]);

  useFocusEffect(
    useCallback(() => {
      if (
        isSessionLoading ||
        !session ||
        typeof responseId !== "string" ||
        loadStateRef.current !== "ready" ||
        screenStateRef.current?.displayDetail.responseId !== responseId
      ) {
        return () => undefined;
      }

      const resolvedResponseId = responseId;
      let isActive = true;

      async function refreshDisplayOnly() {
        try {
          const nextResponseDetail = await getMyConcernResponseDetail(supabase, resolvedResponseId);

          if (!isActive) {
            return;
          }

          if (!nextResponseDetail) {
            clearScreenState();
            setLoadState("not_found");
            return;
          }

          const currentState = screenStateRef.current;

          if (!currentState) {
            return;
          }

          applyScreenState(applyDisplayDetailRefresh(currentState, nextResponseDetail));
        } catch {
          if (!isActive) {
            return;
          }
        }
      }

      void refreshDisplayOnly();

      return () => {
        isActive = false;
      };
    }, [applyScreenState, clearScreenState, isSessionLoading, responseId, session]),
  );

  const feedbackMode = feedbackBaseline ? getFeedbackEditorMode(feedbackBaseline) : "create";

  const isFeedbackReady = Boolean(displayDetail && feedbackBaseline && feedbackDraft);
  const isFeedbackSubmittable =
    feedbackBaseline && feedbackDraft ? canSubmitFeedback(feedbackBaseline, feedbackDraft) && !isSavingFeedback : false;

  const handleFeedbackDraftChange = useCallback(
    (updater: (current: MyConcernResponseFeedbackDraft) => MyConcernResponseFeedbackDraft) => {
      setFeedbackDraft((current) => {
        if (!current) {
          return current;
        }

        return updater(current);
      });
      setFeedbackErrorMessage(null);
      setFeedbackNoticeMessage(null);
    },
    [],
  );

  const handleFeedbackReset = useCallback(() => {
    if (!feedbackBaseline) {
      return;
    }

    setFeedbackDraft({
      liked: feedbackBaseline.liked,
      commentBody: feedbackBaseline.commentBody,
    });
    setFeedbackErrorMessage(null);
    setFeedbackNoticeMessage(null);
  }, [feedbackBaseline]);

  const handleFeedbackSave = useCallback(async () => {
    if (!session || !displayDetail || !feedbackBaseline || !feedbackDraft) {
      return;
    }

    const currentState = screenStateRef.current;

    if (!currentState) {
      return;
    }

    setIsSavingFeedback(true);
    setFeedbackErrorMessage(null);
    setFeedbackNoticeMessage(null);

    try {
      const nextValues = toFeedbackSaveValues(feedbackDraft);

      const saveResult = await saveMyConcernResponseFeedback(supabase, {
        responseId: displayDetail.responseId,
        liked: nextValues.liked,
        commentBody: nextValues.commentBody,
      });

      if (saveResult.resultCode === "example_concern_not_allowed") {
        setFeedbackErrorMessage("예제 고민 답변에는 피드백을 남길 수 없어요.");
        return;
      }

      const [nextResponseDetail, nextFeedback] = await Promise.all([
        getMyConcernResponseDetail(supabase, displayDetail.responseId),
        getMyConcernResponseFeedback(supabase, displayDetail.responseId),
      ]);

      if (!nextResponseDetail) {
        clearScreenState();
        setLoadState("not_found");
        return;
      }

      applyScreenState(applyApprovedSaveReload(currentState, nextResponseDetail, nextFeedback));
      setLoadState("ready");
      setFeedbackNoticeMessage(
        saveResult.resultCode === "no_op"
          ? "변경된 내용이 없어 기존 피드백을 유지했어요."
          : feedbackBaseline.feedbackExists
            ? "피드백을 수정했어요."
            : "피드백을 남겼어요.",
      );
    } catch (error) {
      const failure = error as SaveMyConcernResponseFeedbackFailure;

      if (failure.kind === "application" && failure.code === "response_not_accessible") {
        clearScreenState();
        setLoadState("not_found");
        return;
      }

      const preservedState = screenStateRef.current;

      if (preservedState) {
        applyScreenState(applyBlockedOrFailedSavePreservation(preservedState));
      }

      setFeedbackErrorMessage(failure.userMessage);
    } finally {
      setIsSavingFeedback(false);
    }
  }, [applyScreenState, clearScreenState, displayDetail, feedbackBaseline, feedbackDraft, session]);

  if (isSessionLoading || loadState === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>답변 상세를 불러오고 있어요.</Text>
      </View>
    );
  }

  if (loadState === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>답변 상세를 불러오지 못했어요</Text>
        <Text style={styles.description}>{loadErrorMessage}</Text>
        <Pressable onPress={() => setReloadNonce((value) => value + 1)} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>다시 시도</Text>
        </Pressable>
      </View>
    );
  }

  if (loadState === "not_found" || !displayDetail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>접근할 수 없는 답변이에요</Text>
        <Text style={styles.description}>존재하지 않거나 지금 계정에서 볼 수 없는 답변입니다.</Text>
        <Pressable onPress={() => router.replace("/post-concern/my-concerns")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>My concerns로 돌아가기</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.responseCard}>
        <Text style={styles.metaText}>{formatDateTime(displayDetail.createdAt)}</Text>
        <Text style={styles.responseBody}>{displayDetail.body}</Text>
      </View>

      {isFeedbackReady ? (
        <View style={styles.feedbackCard}>
          <View style={styles.feedbackHeader}>
            <Text style={styles.feedbackTitle}>답변 피드백</Text>
            <View
              style={[
                styles.feedbackModeBadge,
                feedbackMode === "edit" ? styles.feedbackModeBadgeEdit : styles.feedbackModeBadgeCreate,
              ]}
            >
              <Text
                style={[
                  styles.feedbackModeBadgeText,
                  feedbackMode === "edit" ? styles.feedbackModeBadgeTextEdit : styles.feedbackModeBadgeTextCreate,
                ]}
              >
                {feedbackMode === "edit" ? "수정 모드" : "첫 작성"}
              </Text>
            </View>
          </View>

          <Text style={styles.feedbackDescription}>
            {feedbackMode === "edit"
              ? "이미 저장된 피드백이 있어요. 현재 draft를 수정한 뒤 다시 저장할 수 있습니다."
              : "이 답변이 도움이 되었는지 기록할 수 있어요. 코멘트는 선택 입력입니다."}
          </Text>

          <View style={styles.feedbackChoiceRow}>
            <Pressable
              disabled={isSavingFeedback}
              onPress={() =>
                handleFeedbackDraftChange((current) => ({
                  ...current,
                  liked: true,
                }))
              }
              style={[
                styles.feedbackChoiceButton,
                feedbackDraft?.liked ? styles.feedbackChoiceButtonActivePositive : null,
              ]}
            >
              <Text
                style={[
                  styles.feedbackChoiceText,
                  feedbackDraft?.liked ? styles.feedbackChoiceTextActive : null,
                ]}
              >
                도움됐어요
              </Text>
            </Pressable>

            <Pressable
              disabled={isSavingFeedback}
              onPress={() =>
                handleFeedbackDraftChange((current) => ({
                  ...current,
                  liked: false,
                }))
              }
              style={[
                styles.feedbackChoiceButton,
                feedbackDraft?.liked === false ? styles.feedbackChoiceButtonActiveNeutral : null,
              ]}
            >
              <Text
                style={[
                  styles.feedbackChoiceText,
                  feedbackDraft?.liked === false ? styles.feedbackChoiceTextActive : null,
                ]}
              >
                아직 아니에요
              </Text>
            </Pressable>
          </View>

          <TextInput
            editable={!isSavingFeedback}
            multiline
            onChangeText={(text) =>
              handleFeedbackDraftChange((current) => ({
                ...current,
                commentBody: text,
              }))
            }
            placeholder="후기를 남겨 주세요. 비워 두면 좋아요 여부만 저장됩니다."
            placeholderTextColor="#94a3b8"
            style={styles.feedbackInput}
            textAlignVertical="top"
            value={feedbackDraft?.commentBody ?? ""}
          />

          {feedbackNoticeMessage ? <Text style={styles.feedbackNoticeText}>{feedbackNoticeMessage}</Text> : null}
          {feedbackErrorMessage ? <Text style={styles.feedbackErrorText}>{feedbackErrorMessage}</Text> : null}

          <View style={styles.feedbackActionRow}>
            <Pressable
              disabled={!isFeedbackSubmittable}
              onPress={() => {
                void handleFeedbackSave();
              }}
              style={[
                styles.primaryButton,
                styles.feedbackPrimaryButton,
                !isFeedbackSubmittable ? styles.disabledPrimaryButton : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isSavingFeedback
                  ? "저장 중..."
                  : feedbackMode === "edit"
                    ? "피드백 저장"
                    : "피드백 남기기"}
              </Text>
            </Pressable>

            {feedbackBaseline &&
            feedbackBaseline.feedbackExists &&
            feedbackDraft &&
            canSubmitFeedback(feedbackBaseline, feedbackDraft) ? (
              <Pressable disabled={isSavingFeedback} onPress={handleFeedbackReset} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>저장값으로 되돌리기</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/post-concern/my-concerns/[concernId]",
            params: {
              concernId: displayDetail.concernId,
            },
          })
        }
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>해당 고민으로 돌아가기</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f8fafc",
  },
  loadingText: {
    marginTop: 16,
    color: "#334155",
    fontSize: 16,
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
  responseCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
  },
  metaText: {
    color: "#64748b",
    fontSize: 13,
  },
  responseBody: {
    marginTop: 12,
    color: "#0f172a",
    fontSize: 17,
    lineHeight: 26,
    fontWeight: "600",
  },
  feedbackCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
    gap: 14,
  },
  feedbackHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  feedbackTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "700",
  },
  feedbackModeBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  feedbackModeBadgeCreate: {
    backgroundColor: "#dbeafe",
  },
  feedbackModeBadgeEdit: {
    backgroundColor: "#dcfce7",
  },
  feedbackModeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  feedbackModeBadgeTextCreate: {
    color: "#1d4ed8",
  },
  feedbackModeBadgeTextEdit: {
    color: "#15803d",
  },
  feedbackDescription: {
    color: "#475569",
    fontSize: 14,
    lineHeight: 21,
  },
  feedbackChoiceRow: {
    flexDirection: "row",
    gap: 10,
  },
  feedbackChoiceButton: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  feedbackChoiceButtonActivePositive: {
    borderColor: "#0f766e",
    backgroundColor: "#ccfbf1",
  },
  feedbackChoiceButtonActiveNeutral: {
    borderColor: "#475569",
    backgroundColor: "#e2e8f0",
  },
  feedbackChoiceText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
  },
  feedbackChoiceTextActive: {
    color: "#0f172a",
  },
  feedbackInput: {
    minHeight: 132,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#0f172a",
    fontSize: 15,
    lineHeight: 22,
  },
  feedbackNoticeText: {
    color: "#15803d",
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackErrorText: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  feedbackActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },
  feedbackPrimaryButton: {
    alignSelf: "auto",
  },
  disabledPrimaryButton: {
    opacity: 0.45,
  },
  secondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    alignSelf: "flex-start",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
});
