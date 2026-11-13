import { FamiljenGrotesk_400Regular, FamiljenGrotesk_500Medium, FamiljenGrotesk_600SemiBold, FamiljenGrotesk_700Bold } from "@expo-google-fonts/familjen-grotesk";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth";
import { SessionProvider } from "../src/session";
import { color } from "../src/theme";

export default function RootLayout() {
  const reduced = useReducedMotion();
  // The typeface (Familjen Grotesk, as on the website) ships inside the app; nothing is drawn until they're ready, so text never jumps.
  const [fontsReady, fontError] = useFonts({
    FamiljenGrotesk_400Regular,
    FamiljenGrotesk_500Medium,
    FamiljenGrotesk_600SemiBold,
    FamiljenGrotesk_700Bold,
  });
  // Screen to screen is the platform's own push (with its swipe-back), or a fade with Reduce Motion.
  if (!fontsReady && !fontError) return <View style={{ flex: 1, backgroundColor: color.bg }} />;
  return (
    <SafeAreaProvider>
      <AuthProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: reduced ? "fade" : "default" }} />
      </SessionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
