'use client';

// NOTE: like pin-picker.tsx, this is the same in apps/web and apps/public-web. Change both.

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { GeoPoint } from '@care-platform/shared';
import { MAP_STYLE_URL } from './caregiver-map';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export interface LiveMapPoint extends GeoPoint {
  id: string;
  /** Hover text and the accessible name of the dot. */
  label: string;
}

function brandColor(): string {
  const value = typeof window === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim();
  return `rgb(${value || '15 92 92'})`;
}

/**
 * Caregivers on their way (GPS tracking B): a dot per caregiver and a pin per
 * home, kept in view. The dots move as new positions arrive, without
 * reloading the map. Read-only.
 */
export function LiveMap({
  caregivers,
  homes,
  label,
  failedText,
  className,
}: {
  caregivers: LiveMapPoint[];
  homes: LiveMapPoint[];
  label: string;
  failedText: string;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const lib = useRef<typeof import('maplibre-gl') | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fitted = useRef('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        maplibre.setWorkerUrl(new URL(`${BASE_PATH}/maplibre/${maplibre.getVersion()}/maplibre-gl-worker.mjs`, window.location.origin).href);
        if (cancelled || !container.current) return;
        lib.current = maplibre;
        const instance = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          center: [80.7, 7.8],
          zoom: 7,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
        });
        instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        instance.on('load', () => !cancelled && setReady(true));
        instance.on('error', () => {
          if (!instance.isStyleLoaded()) setFailed(true);
        });
        map.current = instance;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    const all = markers.current;
    return () => {
      cancelled = true;
      all.forEach((m) => m.remove());
      all.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const maplibre = lib.current;
    const instance = map.current;
    if (!ready || !maplibre || !instance) return;
    const color = brandColor();
    const want = new Map<string, { p: LiveMapPoint; kind: 'cg' | 'home' }>();
    for (const p of caregivers) want.set(`cg:${p.id}`, { p, kind: 'cg' });
    for (const p of homes) want.set(`home:${p.id}`, { p, kind: 'home' });
    for (const [key, m] of markers.current) {
      if (!want.has(key)) {
        m.remove();
        markers.current.delete(key);
      }
    }
    for (const [key, { p, kind }] of want) {
      const existing = markers.current.get(key);
      if (existing) {
        existing.setLngLat([p.longitude, p.latitude]);
        continue;
      }
      let marker: Marker;
      if (kind === 'cg') {
        const el = document.createElement('div');
        el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 2px ${color}`;
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', p.label);
        el.title = p.label;
        marker = new maplibre.Marker({ element: el });
      } else {
        marker = new maplibre.Marker({ color });
        marker.getElement().title = p.label;
      }
      markers.current.set(key, marker.setLngLat([p.longitude, p.latitude]).addTo(instance));
    }
    // Fit once per set of people (not on every move, so a person can pan and zoom).
    const ids = [...want.keys()].sort().join('|');
    if (ids && ids !== fitted.current) {
      fitted.current = ids;
      const points = [...want.values()].map(({ p }) => [p.longitude, p.latitude] as [number, number]);
      const bounds = points.reduce((b, pt) => b.extend(pt), new maplibre.LngLatBounds(points[0], points[0]));
      instance.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
    }
  }, [ready, caregivers, homes]);

  return (
    <div className={className ?? 'relative h-64 w-full overflow-hidden rounded border border-ink/10'}>
      <div ref={container} role="region" aria-label={label} className="h-full w-full" />
      {failed && <p className="absolute inset-0 flex items-center justify-center bg-paper/90 p-4 text-center text-sm text-ink/60">{failedText}</p>}
    </div>
  );
}
