import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";

import { submitConcern, type SubmitConcernFailure } from "@/features/concerns/api";
import { CONCERN_BLOCKED_MESSAGE, SUBMIT_CONCERN_RETRY_MESSAGE } from "@/features/concerns/contracts";
import { validateSubmitConcernPayload } from "@/features/concerns/validation";
import { useSessionContext } from "@/features/session/context";
import { supabase } from "@/lib/supabase";

export default function PostConcernIndexScreen() {
  const router = useRouter();
  const { isLoading: isSessionLoading, session } = useSessionContext();
  const [draftBody, setDraftBody] = useState("");
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace("/");
    }
  }, [isSessionLoading, router, session]);

  const validation = validateSubmitConcernPayload({
    body: draftBody,
  });
  const draftError = hasTriedSubmit && !validation.success ? validation.error.userMessage : null;
  const canSubmit = !isSubmitting && validation.success;

  const handleSubmit = async () => {
    setHasTriedSubmit(true);
    setSubmitMessage(null);

    if (!validation.success || isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitConcern(supabase, {
        body: draftBody,
      });

      if (result.status === "blocked" && result.code === "moderation_blocked") {
        Alert.alert("", CONCERN_BLOCKED_MESSAGE, [{ text: "확인" }]);
        return;
      }

      setDraftBody("");
      setSubmitMessage(null);
      setHasTriedSubmit(false);
      router.push({
        pathname: "/post-concern/my-concerns/[concernId]",
        params: {
          concernId: result.concernId,
        },
      });
    } catch (error) {
      const failure = error as SubmitConcernFailure;
      setSubmitMessage(failure.kind === "application" ? SUBMIT_CONCERN_RETRY_MESSAGE : failure.userMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSessionLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.loadingText}>Post concern 화면을 준비하고 있어요.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>실사용자 고민 게시</Text>
          <Text style={styles.title}>답변을 받고 싶은 고민을 익명으로 남겨보세요.</Text>
          <Text style={styles.description}>
            승인된 고민만 저장되고, 차단된 경우에는 작성 중인 문장을 그대로 유지한 채 다시 수정할 수 있습니다.
          </Text>

          <TextInput
            editable={!isSubmitting}
            multiline
            onChangeText={(text) => {
              setDraftBody(text);
              setSubmitMessage(null);
            }}
            placeholder="지금 가장 답답한 고민을 구체적으로 적어주세요."
            placeholderTextColor="#94a3b8"
            style={styles.input}
            textAlignVertical="top"
            value={draftBody}
          />

          <View style={styles.metaRow}>
            <Text style={styles.counterText}>{draftBody.length}/2000</Text>
            <Pressable disabled={isSubmitting} onPress={() => router.push("/post-concern/my-concerns")}>
              <Text style={styles.linkText}>My concerns 보기</Text>
            </Pressable>
          </View>

          {draftError ? <Text style={styles.errorText}>{draftError}</Text> : null}
          {submitMessage ? <Text style={styles.errorText}>{submitMessage}</Text> : null}

          <Pressable disabled={!canSubmit} onPress={handleSubmit} style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}>
            {isSubmitting ? <ActivityIndicator color="#f8fafc" /> : <Text style={styles.primaryButtonText}>고민 게시</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 20,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f8fafc",
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbeafe",
    padding: 20,
  },
  eyebrow: {
    color: "#1d4ed8",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    marginTop: 10,
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 30,
  },
  description: {
    marginTop: 12,
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
  },
  input: {
    minHeight: 220,
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 16,
    paddingVertical: 16,
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 24,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  counterText: {
    color: "#64748b",
    fontSize: 13,
  },
  linkText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    marginTop: 12,
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 20,
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
    fontSize: 16,
    fontWeight: "700",
  },
  loadingText: {
    marginTop: 16,
    color: "#334155",
    fontSize: 16,
  },
});
