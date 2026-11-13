// Any address the app doesn't know (an old link, or a host that serves the web app under its own path) opens
// the home screen instead of an error page.
import { Redirect } from "expo-router";

export default function NotFound() {
  return <Redirect href="/" />;
}
