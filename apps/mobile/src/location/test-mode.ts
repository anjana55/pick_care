import { hasNativeModule } from '@/native';

/**
 * The location test mode (GPS tracking, B0) is for testing on real phones
 * before "On my way" and the checks during a visit are switched on. It is in
 * development and preview (internal) builds only, never in a store build:
 * it is decided from the build's update channel at run time, so an
 * over-the-air update can't bring it into the production app.
 */
export function locationTestAvailable(channel: string | null | undefined = updatesChannel()): boolean {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return true;
  return Boolean(channel) && channel !== 'production';
}

function updatesChannel(): string | null {
  if (!hasNativeModule('ExpoUpdates')) return null;
  try {
    return (require('expo-updates') as typeof import('expo-updates')).channel ?? null;
  } catch {
    return null;
  }
}
