// The web app can be served from a sub-path of the website (KANTV_WEB_BASE=/app): Expo then prefixes every asset
// and route with it. Unset, the app is served from the root as before.
module.exports = ({ config }) => {
  const base = process.env.KANTV_WEB_BASE;
  return base ? { ...config, experiments: { ...(config.experiments ?? {}), baseUrl: base } } : config;
};
