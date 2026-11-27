'use client';

// NOTE: this file is duplicated verbatim in apps/web and apps/public-web, like caregiver-map.tsx.
// Change both together. It takes every visible string as a prop so it carries no
// dependency on either app's dictionaries.

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { GeoPoint } from '@care-platform/shared';
import { MAP_STYLE_URL } from './caregiver-map';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export interface PinPickerLabels {
  /** Accessible name of the map. */
  map: string;
  /** Title of the pin. */
  pin: string;
  /** Shown when the map cannot load (offline, tiles blocked). */
  failed: string;
}

interface PinPickerProps {
  /** Where the pin is; null puts no pin until the person taps the map. */
  value: GeoPoint | null;
  /** Where to look first when there is no pin yet (the client's city, the phone's position). */
  start?: GeoPoint | null;
  /**
   * Fly the map here, e.g. to an address the person searched for. A new
   * object each time (even for the same place) flies again.
   */
  focus?: (GeoPoint & { zoom: number }) | null;
  /** Called when the pin is dropped, dragged or tapped somewhere new. Omit for a read-only map. */
  onChange?: (point: GeoPoint) => void;
  labels: PinPickerLabels;
  className?: string;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** The brand colour from the white-label CSS variables ("R G B" channels), as rgb() - a marker's colour is an SVG attribute, not CSS. */
function brandColor(): string {
  const value = typeof window === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim();
  return `rgb(${value || '15 92 92'})`;
}

/**
 * One pin on a map: where care happens. Tap the map to drop it, drag it to
 * the door. Read-only when there is no onChange. MapLibre with the same tiles
 * as the caregiver map; nothing about anyone else is drawn.
 */
export function PinPicker({ value, start, focus, onChange, labels, className }: PinPickerProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const lib = useRef<typeof import('maplibre-gl') | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editable = Boolean(onChange);
  const first = useRef(value ?? start ?? null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import('maplibre-gl');
        maplibre.setWorkerUrl(new URL(`${BASE_PATH}/maplibre/${maplibre.getVersion()}/maplibre-gl-worker.mjs`, window.location.origin).href);
        if (cancelled || !container.current) return;
        lib.current = maplibre;
        const at = first.current;
        const instance = new maplibre.Map({
          container: container.current,
          style: MAP_STYLE_URL,
          center: at ? [at.longitude, at.latitude] : [80.7, 7.8],
          zoom: at ? 16 : 6.5,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
        });
        instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
        instance.on('load', () => !cancelled && setReady(true));
        instance.on('error', () => {
          if (!instance.isStyleLoaded()) setFailed(true);
        });
        instance.on('click', (e) => {
          if (!onChangeRef.current) return;
          onChangeRef.current({ latitude: round6(e.lngLat.lat), longitude: round6(e.lngLat.lng) });
        });
        map.current = instance;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      marker.current?.remove();
      marker.current = null;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Keep the one pin where `value` says.
  useEffect(() => {
    const maplibre = lib.current;
    const instance = map.current;
    if (!ready || !maplibre || !instance) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const m = new maplibre.Marker({ draggable: editable, color: brandColor() }).setLngLat([value.longitude, value.latitude]).addTo(instance);
      m.getElement().setAttribute('title', labels.pin);
      m.on('dragend', () => {
        const p = m.getLngLat();
        onChangeRef.current?.({ latitude: round6(p.lat), longitude: round6(p.lng) });
      });
      marker.current = m;
    } else {
      marker.current.setLngLat([value.longitude, value.latitude]);
    }
    if (!instance.getBounds().contains([value.longitude, value.latitude])) instance.jumpTo({ center: [value.longitude, value.latitude], zoom: Math.max(instance.getZoom(), 15) });
  }, [ready, value, editable, labels.pin]);

  // A new starting point (the phone's position arrived) with no pin yet: look there.
  useEffect(() => {
    if (ready && !value && start && map.current) map.current.jumpTo({ center: [start.longitude, start.latitude], zoom: 16 });
  }, [ready, value, start]);

  // A searched-for address: go there, close enough to see the houses.
  useEffect(() => {
    if (ready && focus && map.current) map.current.flyTo({ center: [focus.longitude, focus.latitude], zoom: focus.zoom, speed: 1.6 });
  }, [ready, focus]);

  return (
    <div className={className ?? 'relative h-64 w-full overflow-hidden rounded border border-ink/10'}>
      <div ref={container} role="region" aria-label={labels.map} className="h-full w-full" />
      {failed && <p className="absolute inset-0 flex items-center justify-center bg-paper/90 p-4 text-center text-sm text-ink/60">{labels.failed}</p>}
    </div>
  );
}
