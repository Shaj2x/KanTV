import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold } from "@expo-google-fonts/hanken-grotesk";
import { Unbounded_500Medium, Unbounded_600SemiBold } from "@expo-google-fonts/unbounded";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth";
import { SessionProvider } from "../src/session";
import { color } from "../src/theme";

export default function RootLayout() {
  // The two typefaces ship inside the app; nothing is drawn until they're ready, so text never jumps.
  const [fontsReady, fontError] = useFonts({
    Unbounded_500Medium,
    Unbounded_600SemiBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });
  if (!fontsReady && !fontError) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
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
