import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth";
import { SessionProvider } from "../src/session";
import { color } from "../src/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: "slide_from_right" }} />
      </SessionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
