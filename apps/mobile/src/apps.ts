// The apps a person would put in a dock, as the designer needs them: package and a readable name. Read from
// the TV during setup; before that, the common ones, so the studio still works.
export const KNOWN_APPS: Record<string, string> = {
  "com.netflix.ninja": "Netflix",
  "com.google.android.youtube.tv": "YouTube",
  "com.disney.disneyplus": "Disney+",
  "com.amazon.amazonvideo.livingroom": "Prime Video",
  "com.spotify.tv.android": "Spotify",
  "com.plexapp.android": "Plex",
  "org.jellyfin.androidtv": "Jellyfin",
  "com.apple.atve.androidtv.appletv": "Apple TV",
  "com.hbo.hbonow": "Max",
  "com.wbd.stream": "Max",
  "tv.twitch.android.app": "Twitch",
  "com.google.android.youtube.tvmusic": "YouTube Music",
  "org.videolan.vlc": "VLC",
  "com.peacocktv.peacockandroid": "Peacock",
  "com.hulu.livingroomplus": "Hulu",
};

export function dockableApps(installed: Iterable<string>): { package: string; label: string }[] {
  return [...installed].filter((p) => KNOWN_APPS[p]).map((p) => ({ package: p, label: KNOWN_APPS[p]! }));
}

export const COMMON_APPS = dockableApps(["com.netflix.ninja", "com.google.android.youtube.tv", "com.disney.disneyplus", "com.amazon.amazonvideo.livingroom", "com.spotify.tv.android"]);
