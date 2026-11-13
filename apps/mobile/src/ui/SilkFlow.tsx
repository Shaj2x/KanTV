// Silk on phones and tablets: the still silk picture, sized to its box (react-native-svg draws no SVG animation).
import { useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { SvgXml } from "react-native-svg";
import { silkXml } from "./silk";

export function SilkFlow({ glow, id }: { glow: string; id: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const xml = useMemo(() => (size.w ? silkXml(glow, size.w, size.h, `sf${id}`) : ""), [glow, size.w, size.h, id]);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {xml ? <SvgXml xml={xml} width={size.w} height={size.h} /> : null}
    </View>
  );
}
