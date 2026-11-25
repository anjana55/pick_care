import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { ClientBooking, ClientLive, GeoPoint } from '@care-platform/shared';
import { api } from '@/api';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Text } from '@/ui/Text';
import { webViewAvailable } from '@/care/PayhereSheet';
import { MAPLIBRE, MAP_STYLE_URL } from '@/search/CaregiverMap';
import { useClient } from './api';

/**
 * "Nimal is on the way" (GPS tracking B): for each booking whose caregiver
 * tapped On my way and has not checked in, about how long until they arrive
 * and a small map with them and the home. Asked again every 15 seconds while
 * it is on screen; gone once they check in.
 */
export function OnTheWay({ bookings }: { bookings: ClientBooking[] }) {
  const coming = bookings.filter((b) => b.shifts.some((s) => s.visit?.onTheWay));
  if (!coming.length) return null;
  return (
    <View style={{ gap: 12 }}>
      {coming.map((b) => (
        <OnTheWayCard key={b.id} bookingId={b.id} />
      ))}
    </View>
  );
}

export function useLive(bookingId: string) {
  const client = useClient();
  return useQuery({
    queryKey: ['client-care', client?.userId ?? 'none', 'live', bookingId],
    queryFn: () => api.get<ClientLive>(`/me/bookings/${encodeURIComponent(bookingId)}/live`),
    enabled: Boolean(client),
    refetchInterval: (q) => (q.state.data?.status === 'ON_THE_WAY' ? 15_000 : false),
  });
}

export function OnTheWayCard({ bookingId }: { bookingId: string }) {
  const { t } = useTranslation();
  const colors = useColors();
  const live = useLive(bookingId);
  const l = live.data;
  if (!l || l.status !== 'ON_THE_WAY') return null;
  const eta = l.stale
    ? t('onTheWay.stale')
    : l.eta.arriving
      ? t('onTheWay.arriving')
      : l.eta.minutes !== null
        ? t('onTheWay.minutes', { minutes: l.eta.minutes })
        : l.position
          ? t('onTheWay.noHome')
          : t('onTheWay.waiting');
  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.surface }]} testID={`on-the-way-${bookingId}`}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>
        {t('onTheWay.title', { name: l.caregiverName })}
      </Text>
      <Text accessibilityLiveRegion="polite" style={{ fontSize: 16, fontWeight: '600', color: l.stale ? colors.muted : colors.brand }}>
        {eta}
      </Text>
      {l.position ? <LiveMap caregiver={l.position} home={l.home} /> : null}
    </View>
  );
}

/** The page: the caregiver's dot and the home's pin; window.show moves the dot without reloading. */
export function liveHtml(styleUrl: string, caregiver: GeoPoint, home: GeoPoint | null, brand: string, maplibre: string = MAPLIBRE): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${maplibre}/maplibre-gl.css">
<style>html,body,#map{margin:0;height:100%}.dot{width:18px;height:18px;border-radius:50%;background:${brand};border:3px solid #fff;box-shadow:0 0 0 2px ${brand}55}</style></head>
<body><div id="map"></div><script type="module">
var send=function(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));};
import(${JSON.stringify(`${maplibre}/maplibre-gl.mjs`)}).then(start,function(){send({type:'failed'});});
function start(maplibregl){
  var cg=${JSON.stringify([caregiver.longitude, caregiver.latitude])}, home=${JSON.stringify(home ? [home.longitude, home.latitude] : null)};
  var map=new maplibregl.Map({container:'map',style:${JSON.stringify(styleUrl)},center:cg,zoom:14,attributionControl:{compact:true},interactive:false});
  var el=document.createElement('div');el.className='dot';
  var dot=new maplibregl.Marker({element:el}).setLngLat(cg).addTo(map);
  if(home){new maplibregl.Marker({color:${JSON.stringify(brand)}}).setLngLat(home).addTo(map);}
  var fit=function(){if(!home){map.jumpTo({center:cg,zoom:15});return;}var b=new maplibregl.LngLatBounds(cg,cg).extend(home);map.fitBounds(b,{padding:48,maxZoom:16,duration:0});};
  window.show=function(p){cg=[p.longitude,p.latitude];dot.setLngLat(cg);fit();};
  map.on('load',function(){fit();send({type:'ready'});});
}
</script></body></html>`;
}

function LiveMap({ caregiver, home }: { caregiver: GeoPoint; home: GeoPoint | null }) {
  const { t } = useTranslation();
  const colors = useColors();
  const ref = useRef<{ injectJavaScript(js: string): void } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // Built once; later positions go in through window.show.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => liveHtml(MAP_STYLE_URL, caregiver, home, colors.brand), []);
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.show(${JSON.stringify({ latitude: caregiver.latitude, longitude: caregiver.longitude })});true;`);
  }, [ready, caregiver.latitude, caregiver.longitude]);
  if (!webViewAvailable() || failed) return null;
  const { WebView } = require('react-native-webview') as typeof import('react-native-webview');
  return (
    <View accessible accessibilityLabel={t('onTheWay.map')} style={[styles.map, { borderColor: colors.border }]}>
      <WebView
        ref={ref as never}
        testID="live-map"
        originWhitelist={['https://*', 'about:*']}
        source={{ html, baseUrl: 'https://tiles.openfreemap.org' }}
        onMessage={(e) => {
          const m = JSON.parse(e.nativeEvent.data) as { type: string };
          if (m.type === 'ready') setReady(true);
          if (m.type === 'failed') setFailed(true);
        }}
        onShouldStartLoadWithRequest={(req) => req.url.startsWith('about:') || req.url.startsWith('https://tiles.openfreemap.org')}
        scrollEnabled={false}
        javaScriptEnabled
        style={{ flex: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 8 },
  map: { height: 200, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
});
