const { VARIANTS } = require('./src/lib/variants-config');

const variantId = process.env.EXPO_PUBLIC_VARIANT ?? 'octovault';
const v = VARIANTS[variantId] ?? VARIANTS['octovault'];

/** @type {import('expo/config').ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  name: v.name,
  slug: v.slug,
  scheme: v.scheme,
  android: {
    ...config.android,
    package: v.bundleId,
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [{ scheme: 'https', host: v.linkHost, pathPrefix: '/open' }],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  ios: {
    ...config.ios,
    bundleIdentifier: v.bundleId,
    associatedDomains: [`applinks:${v.linkHost}`],
  },
  extra: {
    ...config.extra,
    eas: { projectId: v.easProjectId },
  },
  updates: {
    url: `https://u.expo.dev/${v.easProjectId}`,
  },
});
