import type { ConfigContext, ExpoConfig } from 'expo/config';

// This file runs in Node; the app's TypeScript has no Node types, so the two calls used are typed here.
const { existsSync, readFileSync } = require('fs') as { existsSync(path: string): boolean; readFileSync(path: string, encoding: 'utf8'): string };
const { join } = require('path') as { join(...parts: string[]): string };
declare const __dirname: string;

/**
 * One app, many brands. `BRAND` picks the store name, identifiers and the
 * API it talks to, so a white-labelled deployment is a build profile, not a
 * fork. Colours and the logo are NOT here: the app reads them at runtime from
 * the API's /branding (Settings > Branding), so an admin's change shows up
 * without a new build. Only what the stores bake in lives here.
 *
 *   BRAND=pickcare npx expo start
 *   EXPO_PUBLIC_API_URL=http://192.168.1.10:3001 npx expo start   (a dev API on your network)
 */
interface Brand {
  /** Name under the icon and in the stores. */
  name: string;
  slug: string;
  /** Deep links: pickcare://... */
  scheme: string;
  /**
   * The iOS bundle id and Android package. It can't be changed once an app
   * is published under it: a new id is a different app in both stores.
   */
  bundleId: string;
  apiUrl: string;
  /**
   * The public website. Links to it (in emails and WhatsApp messages) open
   * the app on Android once the site vouches for it - see BUILDING.md,
   * "App links".
   */
  siteHost: string;
  /**
   * The brand's Expo (EAS) project: the account that owns it and the project
   * id `eas init` prints. Needed for builds, push and over-the-air updates;
   * see BUILDING.md. Empty until the brand's Expo account is set up -
   * the app runs without them, just without push. EAS_PROJECT_ID / EXPO_OWNER
   * override them.
   */
  owner: string;
  easProjectId: string;
}

/**
 * Website paths the app opens instead of the browser: what the API's emails
 * and messages link to, and caregiver profiles. src/links/app-links.ts maps
 * each to its screen (a test keeps the two in step). Verifying an email,
 * resetting a password, the social sign-in return, deleting an account and
 * registering stay on the website.
 */
export const APP_LINK_PATHS = [
  '/account',
  '/caregiver/dashboard',
  '/caregiver/shifts',
  '/caregiver/payments',
  '/caregiver/documents',
  '/caregiver/profile',
  '/caregiver/ratings',
  '/caregiver/care-offers',
  '/caregivers/',
  '/find',
];

/**
 * The home-screen icon, Android's adaptive icon and the splash screen, made
 * from the deployment's Settings > Branding by `npm run brand:assets` (also
 * run by EAS Build). Unlike everything else about the brand they are baked
 * into the app, so a change to them needs a new build. Without them, Expo's
 * defaults are used.
 */
function brandArtwork(key: string) {
  const dir = join(__dirname, 'assets', 'brand', key);
  const file = (name: string) => (existsSync(join(dir, name)) ? `./assets/brand/${key}/${name}` : undefined);
  let colours: { adaptiveBackground?: string; splashBackground?: string } = {};
  try {
    colours = JSON.parse(readFileSync(join(dir, 'brand.json'), 'utf8'));
  } catch {
    // not fetched yet
  }
  return {
    icon: file('icon.png'),
    adaptiveIcon: file('adaptive-icon.png'),
    splashIcon: file('splash-icon.png'),
    adaptiveBackground: colours.adaptiveBackground ?? '#FFFFFF',
    splashBackground: colours.splashBackground ?? '#FFFFFF',
  };
}

/**
 * The iPhone permission messages in Sinhala and Tamil. locales/*.json hold
 * them with `{brand}` where the app's name goes, so every brand gets its own
 * name in the system prompt (the English ones are built inline below).
 */
function permissionLocales(brandName: string): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const lang of ['si', 'ta']) {
    const strings = JSON.parse(readFileSync(join(__dirname, 'locales', `${lang}.json`), 'utf8')) as Record<string, string>;
    out[lang] = Object.fromEntries(Object.entries(strings).map(([k, v]) => [k, v.split('{brand}').join(brandName)]));
  }
  return out;
}

const BRANDS: Record<string, Brand> = {
  pickcare: {
    name: 'Pick Care',
    slug: 'pickcare',
    scheme: 'pickcare',
    bundleId: 'lk.pickcare.app',
    apiUrl: 'https://pickcare.lk/api',
    siteHost: 'pickcare.lk',
    owner: '',
    easProjectId: '',
  },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const key = process.env.BRAND ?? 'pickcare';
  const brand = BRANDS[key];
  if (!brand) throw new Error(`Unknown BRAND "${key}". Known: ${Object.keys(BRANDS).join(', ')}`);
  const projectId = process.env.EAS_PROJECT_ID || brand.easProjectId;
  const owner = process.env.EXPO_OWNER || brand.owner;
  // Android push goes through Firebase: EAS Build provides this file from the
  // GOOGLE_SERVICES_JSON file variable (BUILDING.md, step 4). Never committed.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const art = brandArtwork(key);

  return {
    ...config,
    name: brand.name,
    slug: brand.slug,
    scheme: brand.scheme,
    ...(owner ? { owner } : {}),
    // The store version people see (1.2.0). Raise it for each store release;
    // Settings > Mobile app compares against it. Build numbers are kept by EAS.
    version: '0.1.0',
    // Over-the-air updates only reach builds of the same version, so a JS
    // update never lands in an app without the native code it needs.
    runtimeVersion: { policy: 'appVersion' },
    ...(projectId ? { updates: { url: `https://u.expo.dev/${projectId}` } } : {}),
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ...(art.icon ? { icon: art.icon } : {}),
    ios: { bundleIdentifier: brand.bundleId, supportsTablet: false },
    android: {
      package: brand.bundleId,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      ...(art.adaptiveIcon ? { adaptiveIcon: { foregroundImage: art.adaptiveIcon, backgroundColor: art.adaptiveBackground } } : {}),
      // Links to the website open the app (APP_LINK_PATHS above). Android checks
      // the site's /.well-known/assetlinks.json when the app is installed.
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: APP_LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host: brand.siteHost, pathPrefix })),
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
    plugins: [
      'expo-router',
      // The brand's mark on a plain screen while the app starts (Settings > Branding, via brand:assets).
      ...(art.splashIcon ? [['expo-splash-screen', { image: art.splashIcon, imageWidth: 180, backgroundColor: art.splashBackground }] as [string, object]] : []),
      'expo-notifications',
      // "Use my location" on Find and a caregiver's check-in; and, started only by a caregiver's tap, "On my way" and
      // the checks during a visit (GPS tracking B and C). Those keep running with the app in the background, but
      // only with "while using the app" permission: a foreground service with a notification on Android, the
      // location background mode with the blue indicator on iOS. Never "Allow all the time".
      [
        'expo-location',
        {
          locationWhenInUsePermission: `${brand.name} uses your location only for what you start: to show caregivers near you, to check in to a shift, and while you share your trip to a client or are checked in to a visit. It never tracks you outside a shift.`,
          isIosBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      // Caregivers photograph their documents. Photos only - the microphone is never asked for.
      [
        'expo-image-picker',
        {
          cameraPermission: `${brand.name} uses your camera, only when you ask, to photograph your documents.`,
          photosPermission: `${brand.name} opens your photos, only when you ask, so you can upload a document.`,
          microphonePermission: false,
        },
      ],
      // Face ID / fingerprint unlock, only for people who turn it on (src/auth/AppLock). iOS needs the reason.
      ['expo-local-authentication', { faceIDPermission: `${brand.name} uses Face ID, only if you turn it on, to unlock the app.` }],
    ],
    // The iPhone permission message in Sinhala and Tamil (locales/*.json; English is above).
    locales: permissionLocales(brand.name),
    extra: {
      brand: key,
      brandName: brand.name,
      apiUrl: process.env.EXPO_PUBLIC_API_URL ?? brand.apiUrl,
      appLinkHost: brand.siteHost,
      // Push needs the Expo (EAS) project's id; without it the app simply doesn't register for push.
      ...(projectId ? { eas: { projectId } } : {}),
    },
  };
};
