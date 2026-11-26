import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { focusManager } from '@tanstack/react-query';

/**
 * Tells React Query when the app comes back to the front, so what is on
 * screen is fetched again instead of showing what was loaded before. React
 * Query only knows about browser windows by itself; on a phone nothing
 * refreshed until the app was restarted, so a client could go on seeing a
 * draft booking's old dates after staff had changed them.
 *
 * Queries with their own staleTime (branding, search settings) still wait it out.
 */
export function useRefetchOnAppForeground() {
  useEffect(() => {
    focusManager.setEventListener((handleFocus) => {
      const sub = AppState.addEventListener('change', (state: AppStateStatus) => handleFocus(state === 'active'));
      return () => sub.remove();
    });
  }, []);
}
