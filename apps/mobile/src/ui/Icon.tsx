// The handful of icons the app uses, drawn as SVG so they stay sharp and take the theme's colours.
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { color } from "../theme";

export type IconName = "back" | "check" | "dot" | "alert" | "tv" | "wifi" | "remote" | "shield" | "restore" | "chevron" | "up" | "down" | "left" | "right" | "home" | "volUp" | "volDown" | "mute" | "power" | "keyboard" | "sparkle";

export function Icon({ name, size = 22, tint = color.text }: { name: IconName; size?: number; tint?: string }) {
  const s = { stroke: tint, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const body = {
    back: <Path d="M15 5l-7 7 7 7" {...s} />,
    chevron: <Path d="M9 5l7 7-7 7" {...s} />,
    check: <Path d="M5 12.5l4.5 4.5L19 7.5" {...s} strokeWidth={2.6} />,
    dot: <Circle cx={12} cy={12} r={4} fill={tint} />,
    alert: (
      <>
        <Path d="M12 4l9 16H3z" {...s} />
        <Path d="M12 10v4M12 17.5v.5" {...s} />
      </>
    ),
    tv: (
      <>
        <Rect x={3} y={5} width={18} height={12} rx={2} {...s} />
        <Path d="M9 20h6" {...s} />
      </>
    ),
    wifi: <Path d="M3 9.5a13 13 0 0118 0M6 13a8.5 8.5 0 0112 0M9.2 16.4a4 4 0 015.6 0M12 19.5v.1" {...s} />,
    remote: (
      <>
        <Rect x={7} y={2.5} width={10} height={19} rx={5} {...s} />
        <Circle cx={12} cy={8} r={2} {...s} />
        <Path d="M10 14h4M10 17h4" {...s} />
      </>
    ),
    shield: <Path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z" {...s} />,
    restore: <Path d="M4 12a8 8 0 108-8 8.2 8.2 0 00-6 2.7M4 4v4h4" {...s} />,
    up: <Path d="M6 15l6-6 6 6" {...s} />,
    down: <Path d="M6 9l6 6 6-6" {...s} />,
    left: <Path d="M15 6l-6 6 6 6" {...s} />,
    right: <Path d="M9 6l6 6-6 6" {...s} />,
    home: <Path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" {...s} />,
    volUp: <Path d="M4 10h3l5-4v12l-5-4H4zM16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" {...s} />,
    volDown: <Path d="M4 10h3l5-4v12l-5-4H4zM16 9a4 4 0 010 6" {...s} />,
    mute: <Path d="M4 10h3l5-4v12l-5-4H4zM16 9l5 6M21 9l-5 6" {...s} />,
    power: <Path d="M12 3v8M7 6.3a7.5 7.5 0 1010 0" {...s} />,
    keyboard: (
      <>
        <Rect x={2.5} y={6} width={19} height={12} rx={2} {...s} />
        <Path d="M6 10h.1M10 10h.1M14 10h.1M18 10h.1M7 14h10" {...s} />
      </>
    ),
    sparkle: <Path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" {...s} />,
  }[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
}
