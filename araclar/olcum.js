// Grafik ölçüm yardımcıları (geliştirme aracı, oyunun parçası değil). Oyun açıkken tarayıcı konsolunda:
//   const O = await import( './araclar/olcum.js' );
//   await O.hazir();                                   // yardım ekranını kapatır, FPV kameraya geçer
//   await O.olc( 'ultra', { hata: 1, oran: 1.75 } );   // her pozda: yükleme süresi, GPU/CPU süresi, karo sayıları, ekran görüntüsü
// Görüntüler kayıt alıcısına gider (python araclar/kayit_alici.py; video/ham/olcum/ altına).
// Tarayıcı paneli gizliyken requestAnimationFrame durur; döngü oyun.adim() ile elle ilerletilir ve kütüphanenin
// zamanlayıcısı kısılmayan MessageChannel kanalına bağlanır (tur.kaydet ile aynı yöntem).
import { Scheduler } from '3d-tiles-renderer';

const o = () => window.oyun;
const _kanal = new MessageChannel(), _isler = new Map();
let _no = 0;
_kanal.port1.onmessage = e => { const f = _isler.get( e.data ); _isler.delete( e.data ); if ( f ) f( performance.now() ); };
const hemen = f => { const id = ++ _no; _isler.set( id, f ); _kanal.port2.postMessage( id ); return id; };
const hemenIptal = id => _isler.delete( id );
const nefes = () => new Promise( r => hemen( r ) );
let kisilmayan = false;
export function zamanlayici( ac ) {
	if ( ac === kisilmayan ) return;
	kisilmayan = ac;
	Scheduler.setXRSession( ac ? { requestAnimationFrame: hemen, cancelAnimationFrame: hemenIptal } : null );
}

// e, n (m), yerden (m), yön (kuzeyden saat yönü, derece), gimbal (derece)
export const POZLAR = {
	yakin: [ 31, - 160, 14, 110, - 22 ],      // kilisenin batı cephesi, 27 m
	orta: [ - 120, - 330, 55, 50, - 12 ],     // batı yamacından meydana, ~250 m
	uzak: [ - 185, - 783, 118, 30, - 14 ],    // güneybatıdan köy panoraması, ~650 m
	kuzey: [ - 60, - 690, 140, 6, - 7 ],      // güneyden kuzeye, bütün köy ve kanyon, 1,3 km
};

export async function hazir() {
	while ( ! o()?.durum.hazir ) { o()?.adim?.( 1 ); await new Promise( r => setTimeout( r, 100 ) ); }
	document.getElementById( 'basla' ).click();
	kamera( 'fpv' );
	zamanlayici( true );
}
export function kamera( tur ) {
	if ( o().durum.kamera !== tur ) { dispatchEvent( new KeyboardEvent( 'keydown', { code: 'KeyV' } ) ); dispatchEvent( new KeyboardEvent( 'keyup', { code: 'KeyV' } ) ); }
	return o().durum.kamera;
}
export function poz( ad ) {
	const [ e, n, yerden, yon, gimbal ] = Array.isArray( ad ) ? ad : POZLAR[ ad ];
	const h = o().arazi.yukseklik( e, n );
	if ( isNaN( h ) ) throw new Error( 'DTM dışı: ' + ad );
	o().poz( e, n, h + yerden, yon, gimbal );
	o().adim( 2 );
	return { e, n, yukseklik: + ( h + yerden ).toFixed( 1 ) };
}
// hata: errorTarget (çizim pikseli), oran: piksel oranı, sis: [yakın, uzak] m, bellek: önbellek GB
export function ayar( { hata, oran, sis, bellek } = {} ) {
	const t = o().tiles, r = o().renderer;
	if ( hata !== undefined ) t.errorTarget = hata;
	if ( bellek !== undefined ) { t.lruCache.maxBytesSize = bellek * 2 ** 30; t.lruCache.minBytesSize = 0.6 * bellek * 2 ** 30; }
	if ( oran !== undefined ) {
		r.setPixelRatio( oran ); r.setSize( innerWidth, innerHeight );
		const v = r.getDrawingBufferSize( new ( o().THREE.Vector2 )() );
		for ( const k of t.cameras ) t.setResolution( k, v.x, v.y );
	}
	if ( sis ) { o().sahne.fog.near = sis[ 0 ]; o().sahne.fog.far = sis[ 1 ]; }
	const c = r.domElement;
	return { hata: t.errorTarget, oran: r.getPixelRatio(), cizim: c.width + 'x' + c.height, sis: [ o().sahne.fog.near, o().sahne.fog.far ], bellekGB: t.lruCache.maxBytesSize / 2 ** 30 };
}
// art arda 3 güncellemede kuyruklar boş ve loadProgress 1 olunca kare tam yüklü sayılır
export async function yuklenmeyiBekle( maxMs = 90000 ) {
	const t = o().tiles, bas = performance.now();
	let bos = 0;
	while ( performance.now() - bas < maxMs ) {
		o().adim( 1 ); await nefes();
		const s = t.stats;
		bos = s.queued + s.downloading + s.parsing === 0 && t.loadProgress >= 1 ? bos + 1 : 0;
		if ( bos >= 3 ) break;
	}
	return Math.round( performance.now() - bas );
}
export function kullanilanMB() { const t = o().tiles; let u = 0; for ( const tile of t.lruCache.usedSet ) u += t.lruCache.getMemoryUsage( tile ); return Math.round( u / 2 ** 20 ); }
export function karolar() {
	const t = o().tiles, say = {};
	for ( const tile of t.visibleTiles ) { const m = ( tile.content?.uri || '' ).match( /_L(\d+)_/ ); const L = m ? + m[ 1 ] : 0; say[ 'L' + L ] = ( say[ 'L' + L ] || 0 ) + 1; }
	return { gorunur: t.stats.visible, reddedilen: t.stats.refused, seviyeler: say, kullanilanMB: kullanilanMB(), onbellekMB: Math.round( t.lruCache.cachedBytes / 2 ** 20 ) };
}
// GPU süresi (EXT_disjoint_timer_query_webgl2) ve ana iş parçacığında render + tiles.update süresi, kare başına ms
export async function sure( kare = 40 ) {
	const r = o().renderer, gl = r.getContext(), ext = gl.getExtension( 'EXT_disjoint_timer_query_webgl2' );
	const kam = o().tiles.cameras[ 0 ], sorgular = [], cpu = [], guncelle = [];
	let ucgen = 0, cagri = 0;
	for ( let i = 0; i < kare; i ++ ) {
		const g0 = performance.now(); o().tiles.update(); guncelle.push( performance.now() - g0 );
		const q = ext && gl.createQuery(); if ( q ) gl.beginQuery( ext.TIME_ELAPSED_EXT, q );
		const c0 = performance.now(); r.render( o().sahne, kam ); cpu.push( performance.now() - c0 );
		if ( q ) { gl.endQuery( ext.TIME_ELAPSED_EXT ); sorgular.push( q ); }
		ucgen = r.info.render.triangles; cagri = r.info.render.calls;
		await nefes();
	}
	const gpu = [];
	for ( const q of sorgular ) {
		let n = 0; while ( ! gl.getQueryParameter( q, gl.QUERY_RESULT_AVAILABLE ) && n ++ < 5000 ) await nefes();
		if ( gl.getQueryParameter( q, gl.QUERY_RESULT_AVAILABLE ) && ! gl.getParameter( ext.GPU_DISJOINT_EXT ) ) gpu.push( gl.getQueryParameter( q, gl.QUERY_RESULT ) / 1e6 );
		gl.deleteQuery( q );
	}
	const ist = d => { if ( ! d.length ) return null; const s = [ ...d ].sort( ( a, b ) => a - b ); return { ort: + ( s.reduce( ( a, b ) => a + b, 0 ) / s.length ).toFixed( 2 ), medyan: + s[ s.length >> 1 ].toFixed( 2 ), p95: + s[ Math.min( s.length - 1, Math.floor( s.length * 0.95 ) ) ].toFixed( 2 ) }; };
	return { gpuMs: ist( gpu ), cizimCpuMs: ist( cpu ), guncellemeMs: ist( guncelle ), ucgen, cizimCagrisi: cagri };
}
// o anki tuvali (tam çizim çözünürlüğünde) alıcıya yazar
export async function yakala( ad, tur = 'png' ) {
	const r = o().renderer, kam = o().tiles.cameras[ 0 ];
	o().solmaBitir?.();
	r.render( o().sahne, kam );
	const blob = await new Promise( res => r.domElement.toBlob( res, tur === 'png' ? 'image/png' : 'image/jpeg', 0.97 ) );
	const y = await fetch( 'http://127.0.0.1:8765/kaydet?klasor=olcum&ad=' + ad + '.' + tur, { method: 'POST', body: blob } );
	return y.ok ? `${ ad }.${ tur } ${ r.domElement.width }x${ r.domElement.height } ${ Math.round( blob.size / 1024 ) } KB` : 'alıcı ' + y.status;
}
// etiket: dosya adlarının ön eki; ayarlar ayar()'a gider; her poz için yükleme, süre, karolar ve görüntü
export async function olc( etiket, ayarlar = {}, pozlar = Object.keys( POZLAR ), goruntu = true ) {
	zamanlayici( true );
	const a = ayar( ayarlar ), sonuc = { etiket, ayar: a, pozlar: {} };
	for ( const p of pozlar ) {
		const yer = poz( p );
		const yuklemeMs = await yuklenmeyiBekle();
		const s = await sure();
		const k = karolar();
		const g = goruntu ? await yakala( `${ etiket }_${ p }` ) : null;
		sonuc.pozlar[ p ] = { ...yer, yuklemeMs, ...s, ...k, goruntu: g };
		console.log( etiket, p, JSON.stringify( sonuc.pozlar[ p ] ) );
	}
	return sonuc;
}
