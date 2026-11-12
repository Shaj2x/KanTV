// The pictures in the setup steps: a TV showing the menu the user should be on, with the item to pick
// highlighted. Drawn rather than photographed, so they match every TV of the family closely enough, stay sharp,
// and can be translated.
import { StyleSheet, Text, View } from "react-native";
import { color, radius, space } from "../theme";

interface MenuItem {
  label: string;
  value?: string;
  toggle?: boolean;
}

export function TvPicture({
  crumb,
  items,
  highlight,
  badge,
  dialog,
}: {
  crumb?: string;
  items?: MenuItem[];
  highlight?: number;
  badge?: string;
  dialog?: { title: string; body: string; check?: string; buttons: [string, string] };
}) {
  return (
    <View style={s.wrap} accessible accessibilityLabel={describe(crumb, items, highlight, dialog)}>
      <View style={s.tv}>
        <View style={s.screen}>
          {items ? (
            <View style={s.panel}>
              {crumb ? <Text style={s.crumb}>{crumb}</Text> : null}
              {items.map((it, i) => (
                <View key={it.label} style={[s.item, i === highlight && s.itemOn]}>
                  <Text style={[s.itemText, i === highlight && { color: color.accentInk }]} numberOfLines={1}>
                    {it.label}
                  </Text>
                  {it.toggle !== undefined ? (
                    <View style={[s.toggle, it.toggle && { backgroundColor: i === highlight ? color.accentInk : color.ok }]}>
                      <View style={[s.knob, it.toggle && { alignSelf: "flex-end" }]} />
                    </View>
                  ) : it.value ? (
                    <Text style={[s.value, i === highlight && { color: color.accentInk }]}>{it.value}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {dialog ? (
            <View style={s.dialogScrim}>
              <View style={s.dialog}>
                <Text style={s.dialogTitle}>{dialog.title}</Text>
                <Text style={s.dialogBody}>{dialog.body}</Text>
                {dialog.check ? (
                  <View style={s.checkLine}>
                    <View style={s.tick}>
                      <Text style={{ color: color.accentInk, fontSize: 8, fontWeight: "900" }}>✓</Text>
                    </View>
                    <Text style={s.dialogBody}>{dialog.check}</Text>
                  </View>
                ) : null}
                <View style={s.dialogButtons}>
                  <Text style={s.dialogBtn}>{dialog.buttons[0]}</Text>
                  <Text style={[s.dialogBtn, s.dialogBtnOn]}>{dialog.buttons[1]}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </View>
      <View style={s.stand} />
      {badge ? (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function describe(crumb?: string, items?: MenuItem[], highlight?: number, dialog?: { title: string }) {
  if (dialog) return `The TV shows: ${dialog.title}`;
  const target = highlight !== undefined ? items?.[highlight]?.label : undefined;
  return `TV menu ${crumb ?? ""}${target ? `, with ${target} selected` : ""}`;
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: space(2), paddingBottom: space(1) },
  // The settings menu's cool light on the wall behind the TV.
  tv: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#050506", borderRadius: radius.sm, padding: 6, boxShadow: "0 0 70px 18px rgba(127,140,255,0.16)" } as object,
  screen: { flex: 1, backgroundColor: color.tvScreen, borderRadius: 4, overflow: "hidden", alignItems: "flex-end" },
  panel: { width: "52%", height: "100%", backgroundColor: color.tvPanel, paddingVertical: 8, paddingHorizontal: 8, gap: 3 },
  crumb: { color: color.muted, fontSize: 8, marginBottom: 2 },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 5 },
  itemOn: { backgroundColor: color.accent },
  itemText: { color: color.text, fontSize: 9.5, flexShrink: 1 },
  value: { color: color.muted, fontSize: 8 },
  toggle: { width: 18, height: 10, borderRadius: 5, backgroundColor: "#4A4E58", padding: 1.5 },
  knob: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
  stand: { width: "22%", height: 6, backgroundColor: "#202228", borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  badge: { position: "absolute", left: 10, bottom: 18, backgroundColor: color.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: color.accentInk, fontSize: 12, fontWeight: "800" },
  dialogScrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  dialog: { width: "62%", backgroundColor: "#2A2D35", borderRadius: 8, padding: 10, gap: 5 },
  dialogTitle: { color: color.text, fontSize: 11, fontWeight: "700" },
  dialogBody: { color: color.muted, fontSize: 8, lineHeight: 11 },
  checkLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  tick: { width: 10, height: 10, borderRadius: 2, backgroundColor: color.accent, alignItems: "center", justifyContent: "center" },
  dialogButtons: { flexDirection: "row", justifyContent: "flex-end", gap: 6, marginTop: 3 },
  dialogBtn: { color: color.muted, fontSize: 9, fontWeight: "700", paddingHorizontal: 7, paddingVertical: 3 },
  dialogBtnOn: { color: color.accentInk, backgroundColor: color.accent, borderRadius: 4 },
});
