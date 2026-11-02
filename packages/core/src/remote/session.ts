// The phone remote once paired (Android TV Remote protocol v2, port 6466, TLS with the paired certificate):
// answers the TV's configure/active/ping messages and sends keys, text and app links. Message layout:
// remotemessage.proto (proto3), the same one Google's phone remote and androidtvremote2 use.
import type { ByteTransport } from "../adb/connection.ts";
import { FrameReader, ProtoWriter, decode, frame, getMsg, getNum, getString, type ProtoField } from "./proto.ts";

export const FEATURE = { PING: 1, KEY: 2, IME: 4, VOICE: 8, POWER: 32, VOLUME: 64, APP_LINK: 512 } as const;
export const WANTED_FEATURES = FEATURE.PING | FEATURE.KEY | FEATURE.IME | FEATURE.POWER | FEATURE.VOLUME | FEATURE.APP_LINK;

export const KEY = {
  HOME: 3,
  BACK: 4,
  UP: 19,
  DOWN: 20,
  LEFT: 21,
  RIGHT: 22,
  OK: 23,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
  PLAY_PAUSE: 85,
  MUTE: 164,
} as const;
export type KeyName = keyof typeof KEY;

export const DIRECTION = { START_LONG: 1, END_LONG: 2, SHORT: 3 } as const;

// RemoteMessage fields
const M = {
  configure: 1,
  setActive: 2,
  error: 3,
  pingRequest: 8,
  pingResponse: 9,
  keyInject: 10,
  imeKeyInject: 20,
  imeBatchEdit: 21,
  start: 40,
  setVolume: 50,
  appLink: 90,
};

const msg = (build: (w: ProtoWriter) => void) => {
  const w = new ProtoWriter();
  build(w);
  return w.finish();
};

export const configureReply = (features: number) =>
  msg((w) =>
    w.message(M.configure, (c) =>
      c.uint(1, features).message(2, (d) => d.uint(3, 1).string(4, "1").string(5, "atvremote").string(6, "1.0.0")),
    ),
  );
export const setActiveReply = (features: number) => msg((w) => w.message(M.setActive, (a) => a.uint(1, features)));
export const pingResponse = (val1: number) => msg((w) => w.message(M.pingResponse, (p) => p.uint(1, val1)));
export const keyMessage = (code: number, direction: number = DIRECTION.SHORT) =>
  msg((w) => w.message(M.keyInject, (k) => k.uint(1, code).uint(2, direction)));
export const appLinkMessage = (link: string) => msg((w) => w.message(M.appLink, (a) => a.string(1, link)));
export const textMessage = (text: string, imeCounter: number, fieldCounter: number) => {
  const at = text.length - 1;
  return msg((w) =>
    w.message(M.imeBatchEdit, (b) =>
      b
        .uint(1, imeCounter)
        .uint(2, fieldCounter)
        .message(3, (e) => e.uint(1, 1).message(2, (o) => o.uint(1, at).uint(2, at).string(3, text))),
    ),
  );
};

export interface TvRemoteState {
  /** The TV said it is ready for commands. */
  started: boolean;
  /** Whether the screen is on, as the TV reports it. */
  on: boolean | null;
  features: number;
  device: { model: string; vendor: string } | null;
  volume: { level: number; max: number; muted: boolean } | null;
  /** The app in the foreground, when the TV reports it (needs IME). */
  currentApp: string | null;
}

/**
 * Runs the session: call `run()` once (it reads until the TV closes the connection), and use the send methods
 * while it runs. `onChange` fires whenever the state above changes.
 */
export class TvRemote {
  readonly state: TvRemoteState = { started: false, on: null, features: 0, device: null, volume: null, currentApp: null };
  private imeCounter = 0;
  private fieldCounter = 0;
  private reader = new FrameReader();

  constructor(
    private t: ByteTransport,
    private onChange: (s: TvRemoteState) => void = () => {},
  ) {}

  private send(bytes: Uint8Array) {
    return this.t.write(frame(bytes));
  }

  async run(): Promise<void> {
    for (;;) {
      const chunk = await this.t.read();
      if (chunk === null) return;
      for (const m of this.reader.push(chunk)) await this.handle(decode(m));
    }
  }

  private async handle(m: ProtoField[]): Promise<void> {
    const configure = getMsg(m, M.configure);
    if (configure) {
      const info = getMsg(configure, 2) ?? [];
      this.state.features = getNum(configure, 1) & WANTED_FEATURES;
      this.state.device = { model: getString(info, 1), vendor: getString(info, 2) };
      await this.send(configureReply(this.state.features));
    } else if (getMsg(m, M.setActive)) {
      await this.send(setActiveReply(this.state.features));
    } else if (getMsg(m, M.pingRequest)) {
      await this.send(pingResponse(getNum(getMsg(m, M.pingRequest)!, 1)));
      return; // pings change nothing the app shows
    } else if (getMsg(m, M.start)) {
      this.state.started = true;
      this.state.on = getNum(getMsg(m, M.start)!, 1) === 1;
    } else if (getMsg(m, M.imeBatchEdit)) {
      const b = getMsg(m, M.imeBatchEdit)!;
      this.imeCounter = getNum(b, 1);
      this.fieldCounter = getNum(b, 2);
    } else if (getMsg(m, M.imeKeyInject)) {
      const app = getMsg(getMsg(m, M.imeKeyInject)!, 1); // app_info; its app_package is field 12
      this.state.currentApp = app ? getString(app, 12) || null : null;
    } else if (getMsg(m, M.setVolume)) {
      const v = getMsg(m, M.setVolume)!;
      this.state.volume = { max: getNum(v, 6), level: getNum(v, 7), muted: getNum(v, 8) === 1 };
    } else {
      return;
    }
    this.onChange({ ...this.state });
  }

  key(name: KeyName, direction: number = DIRECTION.SHORT) {
    return this.send(keyMessage(KEY[name], direction));
  }

  text(text: string) {
    if (!text) return Promise.resolve();
    return this.send(textMessage(text, this.imeCounter, this.fieldCounter));
  }

  /** Opens an app by deep link, e.g. "https://www.netflix.com/title" or "market://launch?id=<package>". */
  openLink(link: string) {
    return this.send(appLinkMessage(link));
  }

  close() {
    this.t.close();
  }
}
