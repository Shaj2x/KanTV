// Motion tokens: every curve, duration and haptic the app uses, so the whole app moves with one personality,
// calm and quick, like a good TV menu. Rules: UI motion stays under 300ms; nothing uses ease-in; nothing
// grows from scale 0; with Reduce Motion, movement drops away and fades stay.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { Easing, ReduceMotion } from "react-native-reanimated";
import { cubicBezier, type CSSTransitionProperties } from "react-native-reanimated";

/** Strong ease-out for anything entering, leaving or answering a press. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** For things that move or morph while staying on screen. */
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
/** The same curves for Reanimated's CSS transitions and animations. */
export const CSS_EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
export const CSS_EASE_IN_OUT = cubicBezier(0.77, 0, 0.175, 1);

export const duration = {
  press: 120, // press feedback: near-imperceptible, it happens dozens of times a session
  state: 180, // a toggle, a radio, a tick
  enter: 260, // content arriving
  exit: 200, // leaving is quicker than arriving
  light: 600, // the TV's light changing colour: a slow crossfade, like the picture changing
};

export const reduce = ReduceMotion.System;

/** Press feedback on every pressable, as a Reanimated CSS transition (runs on the UI thread, native and web). */
export const pressTransition: CSSTransitionProperties = {
  transitionProperty: ["transform", "backgroundColor", "borderColor", "opacity"],
  transitionDuration: duration.press,
  transitionTimingFunction: CSS_EASE_OUT,
};

export const stateTransition: CSSTransitionProperties = {
  transitionProperty: ["backgroundColor", "borderColor", "opacity", "transform"],
  transitionDuration: duration.state,
  transitionTimingFunction: CSS_EASE_OUT,
};

const native = Platform.OS !== "web";

/** A light tick for a remote key or a picked option: one per press, always with a visual change too. */
export function tick() {
  if (native) void Haptics.selectionAsync().catch(() => {});
}

/** Something landed: a design arrived, a step finished. */
export function thud() {
  if (native) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
