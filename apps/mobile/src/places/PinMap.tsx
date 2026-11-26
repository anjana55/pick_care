import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { GeoPoint } from '@care-platform/shared';
import { webViewAvailable } from '@/care/PayhereSheet';
import { MAPLIBRE, MAP_STYLE_URL } from '@/search/CaregiverMap';
import { useTranslation } from '@/i18n';
import { useColors } from '@/theme';
import { Text } from '@/ui/Text';

/**
 * The pin page: a map with a pin fixed in the middle. Moving the map moves
 * the house under the pin, which is easier with one finger than dragging a
 * small pin - the person drags the map until the pin sits on the house. The
 * page tells the app where the middle is after every move; the app moves the
 * map with window.goTo. Read-only maps can't be moved and send nothing.
 */
export function pinHtml(styleUrl: string, start: GeoPoint | null, opts: { editable: boolean; brand: string }, maplibre: string = MAPLIBRE): string {
  const at = start ? [start.longitude, start.latitude] : null;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${maplibre}/maplibre-gl.css">
<style>html,body,#map{margin:0;height:100%;font-family:sans-serif}
#pin{position:absolute;left:50%;top:50%;width:30px;height:42px;margin:-42px 0 0 -15px;pointer-events:none}</style></head>
<body><div id="map"></div>
<svg id="pin" viewBox="0 0 30 42"><path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 27 15 27s15-16 15-27C30 6.7 23.3 0 15 0z" fill="${opts.brand}" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>
<script type="module">
var send=function(m){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));};
import(${JSON.stringify(`${maplibre}/maplibre-gl.mjs`)}).then(start,function(){send({type:'failed'});});
function start(maplibregl){
  var at=${JSON.stringify(at)};
  var map=new maplibregl.Map({container:'map',style:${JSON.stringify(styleUrl)},center:at||[80.7,7.8],zoom:at?17:7,attributionControl:{compact:true},dragRotate:false,pitchWithRotate:false,interactive:${opts.editable ? 'true' : 'false'}});
  map.touchZoomRotate.disableRotation();
  var loaded=false;
  map.on('error',function(e){if(!loaded&&!e.sourceId&&!e.tile)send({type:'failed'});});
  var r=function(n){return Math.round(n*1e6)/1e6;};
  map.on('moveend',function(){if(!${opts.editable ? 'true' : 'false'})return;var c=map.getCenter();send({type:'moved',latitude:r(c.lat),longitude:r(c.lng),zoom:map.getZoom()});});
  window.goTo=function(p){map.jumpTo({center:[p.longitude,p.latitude],zoom:p.zoom||17});};
  map.on('load',function(){loaded=true;send({type:'ready'});});
}
</script></body></html>`;
}

/**
 * One place on the map. Editable: the person moves the map until the pin
 * sits on the house; `onMove` gets the point under the pin, and `zoomedIn`
 * says whether they are close enough for it to mean one house. Nothing is
 * drawn in a build without the in-app browser.
 */
export function PinMap({
  start,
  goTo,
  onMove,
  height = 300,
}: {
  /** Where the map opens. */
  start: GeoPoint | null;
  /** Move the map here (the phone's position arrived, or an address was found); zoom defaults to one house. */
  goTo?: (GeoPoint & { zoom?: number }) | null;
  onMove?: (point: GeoPoint, zoomedIn: boolean) => void;
  height?: number;
}) {
  const { t } = useTranslation();
  const colors = useColors();
  const ref = useRef<{ injectJavaScript(js: string): void } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The page is built once: later changes reach it through goTo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => pinHtml(MAP_STYLE_URL, start, { editable: Boolean(onMove), brand: colors.brand }), []);

  useEffect(() => {
    if (ready && goTo) ref.current?.injectJavaScript(`window.goTo(${JSON.stringify(goTo)});true;`);
  }, [ready, goTo]);

  if (!webViewAvailable()) return null;
  if (failed) return <Text style={{ fontSize: 14, color: colors.muted }}>{t('places.mapFailed')}</Text>;
  const { WebView } = require('react-native-webview') as typeof import('react-native-webview');
  return (
    <View accessible={!onMove} accessibilityLabel={t('places.map')} style={[styles.map, { height, borderColor: colors.border }]}>
      <WebView
        ref={ref as never}
        testID="pin-map"
        originWhitelist={['https://*', 'about:*']}
        source={{ html, baseUrl: 'https://tiles.openfreemap.org' }}
        onMessage={(e) => {
          const m = JSON.parse(e.nativeEvent.data) as { type: string; latitude?: number; longitude?: number; zoom?: number };
          if (m.type === 'ready') setReady(true);
          if (m.type === 'failed') setFailed(true);
          if (m.type === 'moved' && m.latitude !== undefined && m.longitude !== undefined) onMove?.({ latitude: m.latitude, longitude: m.longitude }, (m.zoom ?? 0) >= 15);
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
  map: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
});
