// Flowing silk on the web: the still ground and the swaying ribbons as two SVG layers (silkFlowLayers), the
// ribbons moving by SVG's own animation, so nothing runs in script and the browser keeps it at full frame rate.
// With Reduce Motion the ribbons hold still.
import { silkFlowLayers } from "@kantv/core";
import { useEffect, useMemo, useRef } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { silkColours } from "./silk";

const fill = { position: "absolute", inset: 0, overflow: "hidden" } as const;

export function SilkFlow({ glow, id }: { glow: string; id: string }) {
  const layers = useMemo(() => silkFlowLayers(silkColours(glow), `sf-${id}`), [glow, id]);
  const reduced = useReducedMotion();
  const flow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const svg = flow.current?.querySelector("svg") as SVGSVGElement | null;
    if (!svg) return;
    if (reduced) svg.pauseAnimations();
    else svg.unpauseAnimations();
  }, [reduced, layers]);
  return (
    <div style={fill} aria-hidden="true">
      <div style={{ ...fill, willChange: "transform" }} dangerouslySetInnerHTML={{ __html: layers.still }} />
      <div ref={flow} style={fill} dangerouslySetInnerHTML={{ __html: layers.flow }} />
    </div>
  );
}
