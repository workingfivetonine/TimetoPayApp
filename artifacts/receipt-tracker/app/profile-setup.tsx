import { useAuth } from "@clerk/expo";
import { type Href, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { getApiOrigin } from "@/lib/apiBase";

const AVATAR_STYLE = "fun-emoji";
function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/${AVATAR_STYLE}/png?seed=${encodeURIComponent(seed)}&size=160`;
}
function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

export default function ProfileSetupScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [avatarSeed, setAvatarSeed] = React.useState(randomSeed);
  const [availability, setAvailability] = React.useState<Availability>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);

  const authedFetch = React.useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await getToken();
      return fetch(`${getApiOrigin()}/api/me${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
    },
    [getToken],
  );

  // Pre-fill a fun suggestion on first load so the field is never empty.
  React.useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await authedFetch("/username-suggestion");
        if (!res.ok) return;
        const data = (await res.json()) as { username: string };
        if (active && data.username) setUsername(data.username);
      } catch {
        /* non-fatal — user can type their own */
      }
    })();
    return () => {
      active = false;
    };
    // Run ONCE on mount. (authedFetch closes over Clerk's getToken, whose
    // identity changes each render — including it here would loop forever.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced live availability check as the username changes.
  React.useEffect(() => {
    const u = username.trim();
    if (!u) {
      setAvailability("idle");
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) {
      setAvailability("invalid");
      return;
    }
    setAvailability("checking");
    let active = true;
    const t = setTimeout(async () => {
      try {
        const res = await authedFetch(`/username-available?username=${encodeURIComponent(u)}`);
        const data = (await res.json()) as { valid: boolean; available: boolean };
        if (!active) return;
        setAvailability(data.valid ? (data.available ? "available" : "taken") : "invalid");
      } catch {
        if (active) setAvailability("idle");
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(t);
    };
    // Re-check only when the typed username changes (not when authedFetch's
    // identity churns from getToken).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const shuffleAvatar = () => setAvatarSeed(randomSeed());

  const suggestUsername = async () => {
    setSuggesting(true);
    setError(null);
    try {
      const res = await authedFetch("/username-suggestion");
      const data = (await res.json()) as { username: string };
      if (data.username) setUsername(data.username);
    } catch {
      /* ignore */
    } finally {
      setSuggesting(false);
    }
  };

  const canSave = availability === "available" && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          username: username.trim(),
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          avatar: avatarUrl(avatarSeed),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't save your profile. Please try again.");
        if (res.status === 409) setAvailability("taken");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      router.replace("/" as Href);
    } catch {
      setError("Couldn't save your profile. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const availabilityHint = () => {
    switch (availability) {
      case "checking":
        return <Text style={[styles.hint, { color: colors.mutedForeground }]}>Checking…</Text>;
      case "available":
        return <Text style={[styles.hint, { color: colors.priceGood }]}>✓ {username} is available</Text>;
      case "taken":
        return <Text style={[styles.hint, { color: colors.destructive }]}>✗ That username is taken</Text>;
      case "invalid":
        return (
          <Text style={[styles.hint, { color: colors.destructive }]}>
            3–20 letters, numbers, or underscores
          </Text>
        );
      default:
        return null;
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={[styles.title, { color: colors.foreground }]}>Set up your profile</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Pick a username and an avatar — this is how you'll show up in the community.
          </Text>

          {/* Avatar */}
          <View style={styles.avatarWrap}>
            <Image
              source={{ uri: avatarUrl(avatarSeed) }}
              style={[styles.avatar, { borderColor: colors.border, backgroundColor: colors.card }]}
            />
            <TouchableOpacity
              style={[styles.shuffleBtn, { backgroundColor: colors.secondary }]}
              onPress={shuffleAvatar}
              activeOpacity={0.8}
            >
              <Feather name="refresh-cw" size={14} color={colors.foreground} />
              <Text style={[styles.shuffleText, { color: colors.foreground }]}>Shuffle</Text>
            </TouchableOpacity>
          </View>

          {/* Username */}
          <Text style={[styles.label, { color: colors.foreground }]}>Username</Text>
          <View style={styles.usernameRow}>
            <TextInput
              style={[
                styles.input,
                styles.usernameInput,
                { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card },
              ]}
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. CaptainWafflePants47"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
            <TouchableOpacity
              style={[styles.diceBtn, { backgroundColor: colors.primary }]}
              onPress={suggestUsername}
              disabled={suggesting}
              activeOpacity={0.85}
            >
              {suggesting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.diceText}>🎲</Text>
              )}
            </TouchableOpacity>
          </View>
          {availabilityHint()}

          {/* Optional name */}
          <Text style={[styles.label, { color: colors.foreground }]}>First name (optional)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={colors.mutedForeground}
          />
          <Text style={[styles.label, { color: colors.foreground }]}>Last name (optional)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.input, color: colors.foreground, backgroundColor: colors.card }]}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            placeholderTextColor={colors.mutedForeground}
          />

          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.primary }, !canSave && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 400, ...(Platform.OS === "web" ? { alignSelf: "center" } : {}) },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 6 },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", marginBottom: 24, lineHeight: 21 },
  avatarWrap: { alignItems: "center", gap: 10, marginBottom: 18 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 1 },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  shuffleText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 6, marginTop: 14 },
  usernameRow: { flexDirection: "row", gap: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  usernameInput: { flex: 1 },
  diceBtn: { width: 48, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  diceText: { fontSize: 20 },
  hint: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 8 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 14 },
  button: { borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center", marginTop: 24 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
});
