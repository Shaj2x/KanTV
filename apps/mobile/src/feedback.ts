// Haptics for the few moments that finish something the person started: cleanup done, design on the TV,
// subscription bought, TV restored. One per action, on the same frame as the visual, never the only signal.
// Phones only: the web has no haptics.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export function success() {
  if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
