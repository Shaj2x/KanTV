// Sign in or create an account: an email, then the six-digit code Supabase sends to it. One screen, two steps.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import { sendCode, verifyCode } from "../src/auth";
import { color, radius, space, type } from "../src/theme";
import { Button, Card, Screen } from "../src/ui/kit";

const SEND_ERROR = {
  "invalid-email": "That doesn't look like an email address.",
  "too-many": "Too many codes asked for. Wait a minute and try again.",
  offline: "Can't reach KanTV right now. Check your connection and try again.",
} as const;
const VERIFY_ERROR = {
  "wrong-code": "That code isn't right, or it has expired. Check the latest email from KanTV, or send a new code.",
  "too-many": "Too many tries. Wait a minute and try again.",
  offline: "Can't reach KanTV right now. Check your connection and try again.",
} as const;

/** Only paths inside the app, so a link can't send someone elsewhere after sign-in. */
const safeNext = (n: unknown) => (typeof n === "string" && /^\/[a-z/-]*$/.test(n) && n !== "/signin" ? n : "/");

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const r = await sendCode(email.trim().toLowerCase());
    setBusy(false);
    if (r === "sent") {
      setStep("code");
      setCode("");
    } else setError(SEND_ERROR[r]);
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const r = await verifyCode(email.trim().toLowerCase(), code);
    setBusy(false);
    if (r === "ok") router.replace(safeNext(next) as never);
    else setError(VERIFY_ERROR[r]);
  };

  if (step === "code") {
    return (
      <Screen
        title="Check your email"
        subtitle={`We sent a 6-digit code to ${email.trim()}. It works for 10 minutes.`}
        footer={<Button label="Sign in" onPress={verify} busy={busy} disabled={code.length !== 6} />}
      >
        <TextInput
          value={code}
          onChangeText={(c) => setCode(c.replace(/\D/g, "").slice(0, 6))}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          placeholder="123456"
          placeholderTextColor={color.faint}
          style={[s.input, s.code]}
          accessibilityLabel="Code from the email"
          onSubmitEditing={() => code.length === 6 && void verify()}
        />
        {error ? <Text style={[type.small, { color: color.danger }]}>{error}</Text> : null}
        <Button kind="ghost" label="Send a new code" onPress={send} disabled={busy} />
        <Button kind="ghost" label="Use a different email" onPress={() => (setStep("email"), setError(null))} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Sign in to KanTV"
      subtitle="Your account holds your free trial, your designs and your subscription. No password: we email you a code."
      footer={<Button label="Email me a code" onPress={send} busy={busy} disabled={!email.trim()} />}
    >
      <TextInput
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        placeholder="you@example.com"
        placeholderTextColor={color.faint}
        style={s.input}
        accessibilityLabel="Email"
        onSubmitEditing={() => email.trim() && void send()}
      />
      {error ? <Text style={[type.small, { color: color.danger }]}>{error}</Text> : null}
      <Card>
        <Text style={type.small}>
          New here? The same code creates your account. By continuing you agree to the Terms and the Privacy Policy.
          Restore my TV never needs an account.
        </Text>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  input: { ...type.body, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: 1, borderColor: color.line, paddingHorizontal: space(4), paddingVertical: space(4) },
  code: { fontSize: 28, letterSpacing: 8, textAlign: "center", fontVariant: ["tabular-nums"] },
});
