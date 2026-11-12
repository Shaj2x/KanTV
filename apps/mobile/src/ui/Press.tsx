// The app's one pressable. It takes the same style-as-a-function-of-pressed as React Native's Pressable, but the
// style lands on an Animated.View with a Reanimated CSS transition, so press feedback (scale, fill) eases in
// 120ms on the UI thread on phones as well as the web, instead of snapping. Feedback starts on press-in.
import { useState, type ReactNode } from "react";
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { pressTransition } from "../motion";

type Style = StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);

export function Press({
  style,
  frame,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, "style" | "children"> & {
  style?: Style;
  /** Layout for the touch area itself (absolute position, flex); `style` is the part that moves. */
  frame?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const look = typeof style === "function" ? style({ pressed }) : style;
  return (
    <Pressable
      pressRetentionOffset={16}
      {...rest}
      style={frame}
      onPressIn={(e: GestureResponderEvent) => (setPressed(true), onPressIn?.(e))}
      onPressOut={(e: GestureResponderEvent) => (setPressed(false), onPressOut?.(e))}
    >
      <Animated.View style={[pressTransition, look]}>{children}</Animated.View>
    </Pressable>
  );
}
