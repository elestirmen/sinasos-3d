// Mustafapaşa Drone: DJI Terra 3D Tiles modeli üzerinde drone uçuşu (prototip)
// three.js + 3d-tiles-renderer + three-mesh-bvh

import * as THREE from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { TilesRenderer, Scheduler } from '3d-tiles-renderer';
import { GLTFExtensionsPlugin, ReorientationPlugin } from '3d-tiles-renderer/plugins';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ---------------------------------------------------------------- ayarlar
const parametre = new URLSearchParams(location.search);
const AYAR = {
	tileset: parametre.get('tileset') || './terra_b3dms/tileset.json',
	veri: './data/',
	tur: parametre.get( 'tur' ) || 'tur.json',   // farklı bir tur denemek için: ?tur=tur_v2.json
	maxYerdenYukseklik: 150,          // m, arazinin (DTM) üzerinde tavan
	modlar: {
		cine: { ad: 'Cine', yatay: 4, dikey: 2, donus: 35, ivme: 1.4 },
		normal: { ad: 'Normal', yatay: 12, dikey: 5, donus: 90, ivme: 2.6 },
		spor: { ad: 'Spor', yatay: 21, dikey: 6, donus: 150, ivme: 4.0 },
	},
	// hata: 3d-tiles-renderer errorTarget (çizim pikseli, piksel oranı dahil), bellek: karo önbelleği üst sınırı (GB),
	// piksel: en yüksek piksel oranı (ekranın kendi oranı bunun altındaysa o kullanılır)
	kalite: {
		dusuk: { hata: 6, bellek: 1, piksel: 1.5 },
		orta: { hata: 3, bellek: 2, piksel: 1.5 },
		yuksek: { hata: 2, bellek: 3, piksel: 1.5 },
		ultra: { hata: 1, bellek: 6, piksel: 2 },
	},
	bataryaSure: 20 * 60,             // saniye, normal modda düz uçuş
	halkaYaricap: 6,
	halkaSayisi: 10,
	parkurTohum: 2026,
	govde: 0.12,                      // drone merkezinden ayak altına (m)
	carpismaYaricap: 0.7,
};
const DERECE = Math.PI / 180;
const YUKARI = new THREE.Vector3( 0, 1, 0 );
const $ = id => document.getElementById( id );

// ---------------------------------------------------------------- arayüz yardımcıları
const arayuz = {
	durum: $( 'durumYazi' ), cubuk: $( 'yuklemeCubuk' ).firstElementChild, mesaj: $( 'mesaj' ), flas: $( 'flas' ),
	yardim: $( 'yardim' ), hata: $( 'hata' ), bellek: $( 'bellekYazi' ),
};
let mesajZaman = 0, sonMesaj = '', sonMesajAn = 0;
function mesajGoster( yazi, tur = '', sure = 2200 ) {
	const simdi = performance.now();
	if ( yazi === sonMesaj && simdi - sonMesajAn < 1500 ) return;
	sonMesaj = yazi; sonMesajAn = simdi;
	arayuz.mesaj.textContent = yazi;
	arayuz.mesaj.className = 'panel goster ' + tur;
	clearTimeout( mesajZaman );
	mesajZaman = setTimeout( () => arayuz.mesaj.classList.remove( 'goster' ), sure );
}
function flasYap( renk ) {
	arayuz.flas.style.transition = 'none';
	arayuz.flas.style.background = renk;
	arayuz.flas.style.opacity = '1';
	requestAnimationFrame( () => requestAnimationFrame( () => {
		arayuz.flas.style.transition = 'opacity .45s';
		arayuz.flas.style.opacity = '0';
	} ) );
}
function hataGoster( html ) {
	arayuz.yardim.classList.remove( 'gizli' );
	arayuz.hata.style.display = 'block';
	arayuz.hata.innerHTML = html;
}
function sureYaz( s ) {
	if ( ! isFinite( s ) ) return '–';
	const dk = Math.floor( s / 60 ), sn = s - dk * 60;
	return dk + ':' + sn.toFixed( 1 ).padStart( 4, '0' );
}
function yonHarf( d ) {
	return t( 'yonHarf' )[ Math.round( d / 45 ) % 8 ];
}
function guvenliOku( anahtar ) { try { return localStorage.getItem( anahtar ); } catch { return null; } }
function guvenliYaz( anahtar, deger ) { try { localStorage.setItem( anahtar, deger ); } catch { /* yoksay */ } }

// ---------------------------------------------------------------- dil (Türkçe / English)
// Arayüz yazıları burada; index.html'deki data-t (düz yazı) ve data-h (kbd içeren yazı) anahtarları da buradan dolar.
// Gezi kartları, görevler ve tur yazıları data/ altındaki JSON'larda: Türkçesi ana alanlarda, İngilizcesi "en" alt nesnesinde.
const METIN = {
	tr: {
		baslatiliyor: 'Başlatılıyor…', modelYukleniyor: 'Model yükleniyor…', karolarYukleniyor: p => `Karolar yükleniyor %${ p }`, modelHazir: 'Model hazır',
		onbellek: ( a, b ) => `Önbellek ${ a } / ${ b } GB`, onbellekDolu: n => ` · dolu, ${ n } karo bekliyor`,
		dosyaHata: 'Bu sayfa dosya olarak açıldığı için model yüklenemez. Lütfen oyun klasöründeki <b>BASLAT.bat</b> dosyasını çalıştır, oyun tarayıcıda kendiliğinden açılır.',
		veriHata: m => 'Arazi verisi okunamadı (<code>data/arazi.json</code>). Oyunu BASLAT.bat ile açtığından emin ol. Ayrıntı: ' + m,
		modelYok: y => `Model bulunamadı (<code>${ y }</code>). DJI Terra çıktısındaki <b>terra_b3dms</b> klasörünü oyun klasörüne kopyala ya da <b>model_yolu.txt</b> ile yerini göster (README.md).`,
		yonHarf: [ 'K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB' ],
		yonden: [ 'kuzeyden', 'kuzeydoğudan', 'doğudan', 'güneydoğudan', 'güneyden', 'güneybatıdan', 'batıdan', 'kuzeybatıdan' ],
		takip: 'Takip', fpv: 'FPV', modAd: { cine: 'Cine', normal: 'Normal', spor: 'Spor' },
		modMesaj: ( ad, v ) => `${ ad } modu · en fazla ${ v } m/s`,
		kalkisIcin: 'Kalkış için Boşluk tuşuna bas', kalkis: 'Kalkış', inis: 'İniş yapıldı', inisBitti: 'Batarya bitti, iniş yapıldı. T ile eve dönebilirsin.',
		carpisma: 'Çarpışma!', sertInis: 'Sert iniş!', ucusSiniri: 'Uçuş sınırı: model bu noktada bitiyor', yukseklikSiniri: m => `Yükseklik sınırı: araziden ${ m } m`,
		bataryaKritik: 'Batarya kritik! Eve dön (T) ya da iniş yap.', batarya30: 'Batarya %30', bataryaBitti: 'Batarya bitti, zorunlu iniş', evNoktasi: 'Ev noktası · yeni batarya takıldı',
		sesAcik: 'Ses açık', sesKapali: 'Ses kapalı', pervaneAcik: 'Pervane sesi açık', pervaneKapali: 'Pervane sesi kapalı',
		parkurKapali: 'Parkur kapatıldı', parkurHazir: 'Parkur hazır: süre ilk halkadan geçince başlar', sureBasladi: 'Süre başladı!',
		parkurTamam: ( s, ceza, rekor ) => `Parkur tamamlandı: ${ s }${ ceza ? ` (ceza +${ ceza } sn)` : '' }${ rekor ? ' · yeni rekor!' : '' }`,
		carpismaCeza: 'Çarpışma! +5 sn ceza', baslangicHalkasi: 'Başlangıç halkası', sonrakiHalka: 'Sonraki halka', bitti: 'Bitti',
		turBitti: 'Sinematik tur bitti',
		klasor: ad => `Fotoğraflar "${ ad }" klasörüne kaydedilecek`, kaydedildi: yol => `Kaydedildi: ${ yol }`,
		klasorHata: 'Klasöre yazılamadı, dosyalar indirilecek', indirildi: 'Fotoğraf ve konum bilgisi indirildi',
		turAd: { giris: 'Hoş geldin', kilise: 'Kilise', manastir: 'Manastır', konak: 'Konak', universite: 'Üniversite', medrese: 'Medrese', cami: 'Cami', vadi: 'Vadi' },
		kaynak: 'Kaynak: ', yeniYer: ( ad, k, n ) => `Yeni yer: ${ ad } · ${ k }/${ n }`, geziTamam: n => `Gezi tamamlandı: ${ n } yerin hepsini gördün!`,
		kartUzak: 'Bilgi kartı bir gezi noktasının yanında açılır', rehberAcik: 'Gezi rehberi açık', rehberKapali: 'Gezi rehberi kapalı',
		buradasin: 'Buradasın', sonrakiYer: 'Sonraki yer', geziBitti: 'Gezi tamamlandı', hepsiniGordun: 'Hepsini gördün',
		fotoGorevi: 'Fotoğraf görevi', gorevTamamlandi: 'tamamlandı', gorevTamam: ( b, k, n ) => `Görev tamamlandı: ${ b } · ${ k }/${ n }`,
		albumTamam: n => `Albüm tamamlandı: ${ n } fotoğrafın hepsi senin!`, gorev: 'Görev', gorevBaslik: b => `Görev: ${ b }`,
		kMesafe: 'Mesafe', kYon: 'Yön', kAci: 'Açı', kYukseklik: 'Yükseklik', kKadraj: 'Kadraj', kGorus: 'Görüş', kYapi: 'Yapılar',
		iYaklas: m => `Biraz yaklaş (en çok ${ m } m)`, iUzaklas: m => `Biraz uzaklaş (en az ${ m } m)`,
		iYon: y => y[ 0 ].toLocaleUpperCase( 'tr' ) + y.slice( 1 ) + ' çek',
		iAsagi: 'Gimbali aşağı indir (F)', iYukari: 'Gimbali yukarı kaldır (R)',
		iAlcal: m => `Alçal (yerden en çok ${ m } m)`, iYuksel: m => `Yüksel (yerden en az ${ m } m)`,
		iKadraja: 'Hedefi kadraja al', iOrtala: 'Hedefi kadrajın ortasına al', iKapali: 'Önü kapalı: araya bir şey giriyor',
		iYapi: ( k, n ) => `Kadrajda ${ k } gezi noktası var, en az ${ n } olmalı`,
		hazir: 'Hazır: şimdi çek (P)', vIpucu: 'V ile kamera görüntüsüne geç',
		// index.html
		hHalka: 'Halka', hSure: 'Süre', hEnIyi: 'En iyi', hGezi: 'Gezi', hAlbum: 'Albüm', kuzeyK: 'K ▲',
		hKartIpucu: '<kbd>B</kbd> kartı kapat · <kbd>M</kbd> sesi kapat',
		hYerden: 'Yerden m', hKot: 'Kot m', hHiz: 'Hız m/s', hDikey: 'Dikey m/s', hYon: 'Yön', hEve: 'Eve m', hMod: 'Mod', hBatarya: 'Batarya',
		hEnlem: 'Enlem', hBoylam: 'Boylam', hKamera: 'Kamera', hGimbal: 'Gimbal',
		hIpucu: '<kbd>H</kbd> Yardım · <kbd>N</kbd> Gezi · <kbd>G</kbd> Parkur · <kbd>P</kbd> Fotoğraf',
		hBaslik: 'Mustafapaşa üzerinde uçuş',
		hGiris: "Matrice 4E ile çekilen 6875 fotoğraftan üretilen 3B modelin üzerinde serbest uçuş yapabilir ya da halka parkurunu tamamlamaya çalışabilirsin. Turkuaz ışıklar Mustafapaşa'nın (Sinasos) simge yapılarını gösteriyor: yanlarına uçunca müzik başlar ve yapının hikâyesi açılır. Fotoğraf görevlerini doğru yerden ve açıyla çekerek kendi Sinasos albümünü oluşturabilirsin. Drone ev noktasında yerde bekliyor, kalkmak için <kbd>Boşluk</kbd> tuşuna bas.",
		hUcus: 'Uçuş', hIleri: 'İleri / geri', hKay: 'Sola / sağa kay', hDon: 'Sola / sağa dön', hYuksel: 'Yüksel / alçal (kalkış, iniş)',
		hModlar: 'Uçuş modu: Cine, Normal, Spor', hOklar: 'Ok tuşları da ileri-geri ve dönüş yapar', hBosluk: 'Boşluk',
		hDiger: 'Kamera ve diğerleri', hKameraTus: 'Takip / FPV kamera', hGimbalTus: 'Gimbal yukarı / aşağı', hTakipMesafe: 'Takip mesafesi', hTeker: 'Fare tekerleği',
		hFoto: 'Fotoğraf + konum bilgisi (PNG ve JSON, ilk seferde kayıt klasörü sorulur); görevleri de bununla çekersin',
		hParkur: 'Halka parkurunu başlat / kapat', hRehber: 'Gezi rehberi aç / kapat', hKart: 'Gezi bilgi kartını kapat / aç', hTur: 'Sinematik tur başlat / bitir',
		hEv: 'Eve dön (yeni batarya)', hSes: 'Bütün sesler aç / kapat', hPervane: 'Pervane sesi aç / kapat', hDilTus: 'Dil: Türkçe / English', hEkran: 'Bu ekran',
		hKumanda: 'Oyun kumandası (Mod 2)', hSolCubuk: 'Yükseklik ve dönüş', hSol: 'Sol çubuk', hSagCubuk: 'İleri-geri ve yana', hSag: 'Sağ çubuk',
		hDugmeler: 'Fotoğraf · kamera · parkur', hModGimbal: 'Uçuş modu · gimbal', hOmuz: 'LB / RB · yön tuşları',
		hGeziListe: 'Sinasos gezisi', hZiyaretSifirla: 'ziyaretleri sıfırla', hAlbumBaslik: 'Sinasos albümü · fotoğraf görevleri', hAlbumSifirla: 'albümü sıfırla',
		hKalite: 'Görüntü kalitesi', hDusuk: 'Düşük (hızlı, en çok 1 GB)', hOrta: 'Orta (en çok 2 GB)', hYuksek: 'Yüksek (en çok 3 GB, güçlü ekran kartı)',
		hUltra: 'Ultra (en çok 6 GB, 12 GB ve üstü ekran kartı)', hSesAyar: 'Ses', hPervaneAyar: 'Pervane sesi', hMuzikAyar: 'Gezi müziği',
		hTurDugme: 'Sinematik tur', hBasla: 'Uçuşa başla',
	},
	en: {
		baslatiliyor: 'Starting…', modelYukleniyor: 'Loading model…', karolarYukleniyor: p => `Loading tiles ${ p }%`, modelHazir: 'Model ready',
		onbellek: ( a, b ) => `Cache ${ a } / ${ b } GB`, onbellekDolu: n => ` · full, ${ n } tiles waiting`,
		dosyaHata: 'The model cannot load because this page was opened as a file. Please run <b>BASLAT.bat</b> in the game folder; the game opens in the browser by itself.',
		veriHata: m => 'Could not read the terrain data (<code>data/arazi.json</code>). Make sure you started the game with BASLAT.bat. Details: ' + m,
		modelYok: y => `Model not found (<code>${ y }</code>). Copy the <b>terra_b3dms</b> folder from the DJI Terra output into the game folder, or point to it with <b>model_yolu.txt</b> (README.md).`,
		yonHarf: [ 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW' ],
		yonden: [ 'from the north', 'from the northeast', 'from the east', 'from the southeast', 'from the south', 'from the southwest', 'from the west', 'from the northwest' ],
		takip: 'Follow', fpv: 'FPV', modAd: { cine: 'Cine', normal: 'Normal', spor: 'Sport' },
		modMesaj: ( ad, v ) => `${ ad } mode · up to ${ v } m/s`,
		kalkisIcin: 'Press Space to take off', kalkis: 'Take-off', inis: 'Landed', inisBitti: 'Battery empty, landed. Press T to return home.',
		carpisma: 'Collision!', sertInis: 'Hard landing!', ucusSiniri: 'Flight boundary: the model ends here', yukseklikSiniri: m => `Altitude limit: ${ m } m above ground`,
		bataryaKritik: 'Battery critical! Return home (T) or land.', batarya30: 'Battery 30%', bataryaBitti: 'Battery empty, forced landing', evNoktasi: 'Home point · fresh battery fitted',
		sesAcik: 'Sound on', sesKapali: 'Sound off', pervaneAcik: 'Propeller sound on', pervaneKapali: 'Propeller sound off',
		parkurKapali: 'Race closed', parkurHazir: 'Race ready: the clock starts at the first ring', sureBasladi: 'Clock started!',
		parkurTamam: ( s, ceza, rekor ) => `Race finished: ${ s }${ ceza ? ` (penalty +${ ceza } s)` : '' }${ rekor ? ' · new record!' : '' }`,
		carpismaCeza: 'Collision! +5 s penalty', baslangicHalkasi: 'Start ring', sonrakiHalka: 'Next ring', bitti: 'Done',
		turBitti: 'Cinematic tour finished',
		klasor: ad => `Photos will be saved to the "${ ad }" folder`, kaydedildi: yol => `Saved: ${ yol }`,
		klasorHata: 'Could not write to the folder, files will be downloaded', indirildi: 'Photo and pose data downloaded',
		turAd: { giris: 'Welcome', kilise: 'Church', manastir: 'Monastery', konak: 'Mansion', universite: 'University', medrese: 'Madrasa', cami: 'Mosque', vadi: 'Valley' },
		kaynak: 'Source: ', yeniYer: ( ad, k, n ) => `New place: ${ ad } · ${ k }/${ n }`, geziTamam: n => `Tour complete: you have seen all ${ n } places!`,
		kartUzak: 'The info card opens next to a sight', rehberAcik: 'Sightseeing guide on', rehberKapali: 'Sightseeing guide off',
		buradasin: 'You are here', sonrakiYer: 'Next place', geziBitti: 'Tour complete', hepsiniGordun: 'You have seen them all',
		fotoGorevi: 'Photo mission', gorevTamamlandi: 'done', gorevTamam: ( b, k, n ) => `Mission complete: ${ b } · ${ k }/${ n }`,
		albumTamam: n => `Album complete: all ${ n } photos are yours!`, gorev: 'Mission', gorevBaslik: b => `Mission: ${ b }`,
		kMesafe: 'Distance', kYon: 'Direction', kAci: 'Tilt', kYukseklik: 'Height', kKadraj: 'Framing', kGorus: 'View', kYapi: 'Sights',
		iYaklas: m => `Move a bit closer (at most ${ m } m)`, iUzaklas: m => `Move a bit further away (at least ${ m } m)`,
		iYon: y => 'Shoot ' + y,
		iAsagi: 'Tilt the gimbal down (F)', iYukari: 'Tilt the gimbal up (R)',
		iAlcal: m => `Descend (at most ${ m } m above ground)`, iYuksel: m => `Climb (at least ${ m } m above ground)`,
		iKadraja: 'Get the target into the frame', iOrtala: 'Centre the target in the frame', iKapali: 'Blocked: something is in the way',
		iYapi: ( k, n ) => `${ k } sights in the frame, you need at least ${ n }`,
		hazir: 'Ready: take the shot (P)', vIpucu: 'Press V for the camera view',
		hHalka: 'Ring', hSure: 'Time', hEnIyi: 'Best', hGezi: 'Sights', hAlbum: 'Album', kuzeyK: 'N ▲',
		hKartIpucu: '<kbd>B</kbd> close card · <kbd>M</kbd> mute',
		hYerden: 'AGL m', hKot: 'Elev. m', hHiz: 'Speed m/s', hDikey: 'Vert. m/s', hYon: 'Heading', hEve: 'Home m', hMod: 'Mode', hBatarya: 'Battery',
		hEnlem: 'Lat', hBoylam: 'Lon', hKamera: 'Camera', hGimbal: 'Gimbal',
		hIpucu: '<kbd>H</kbd> Help · <kbd>N</kbd> Sights · <kbd>G</kbd> Race · <kbd>P</kbd> Photo',
		hBaslik: 'Flying over Mustafapaşa',
		hGiris: 'Fly freely over a 3D model built from 6,875 photos taken with a Matrice 4E, or try to finish the ring race. The turquoise beacons mark the landmarks of Mustafapaşa (Sinasos): fly up to them and music starts as the story of the building opens. Shoot the photo missions from the right spot and angle to build your own Sinasos album. The drone is waiting on the ground at the home point; press <kbd>Space</kbd> to take off.',
		hUcus: 'Flight', hIleri: 'Forward / back', hKay: 'Strafe left / right', hDon: 'Turn left / right', hYuksel: 'Climb / descend (take-off, landing)',
		hModlar: 'Flight mode: Cine, Normal, Sport', hOklar: 'Arrow keys also move forward-back and turn', hBosluk: 'Space',
		hDiger: 'Camera and more', hKameraTus: 'Follow / FPV camera', hGimbalTus: 'Gimbal up / down', hTakipMesafe: 'Follow distance', hTeker: 'Mouse wheel',
		hFoto: 'Photo + pose data (PNG and JSON, asks for a folder the first time); also used for the missions',
		hParkur: 'Start / close the ring race', hRehber: 'Sightseeing guide on / off', hKart: 'Close / open the info card', hTur: 'Start / stop the cinematic tour',
		hEv: 'Return home (fresh battery)', hSes: 'All sound on / off', hPervane: 'Propeller sound on / off', hDilTus: 'Language: Türkçe / English', hEkran: 'This screen',
		hKumanda: 'Gamepad (Mode 2)', hSolCubuk: 'Altitude and turning', hSol: 'Left stick', hSagCubuk: 'Forward-back and sideways', hSag: 'Right stick',
		hDugmeler: 'Photo · camera · race', hModGimbal: 'Flight mode · gimbal', hOmuz: 'LB / RB · D-pad',
		hGeziListe: 'Sinasos sights', hZiyaretSifirla: 'reset visits', hAlbumBaslik: 'Sinasos album · photo missions', hAlbumSifirla: 'reset album',
		hKalite: 'Graphics quality', hDusuk: 'Low (fast, up to 1 GB)', hOrta: 'Medium (up to 2 GB)', hYuksek: 'High (up to 3 GB, strong graphics card)',
		hUltra: 'Ultra (up to 6 GB, graphics card with 12 GB or more)', hSesAyar: 'Sound', hPervaneAyar: 'Propeller sound', hMuzikAyar: 'Sightseeing music',
		hTurDugme: 'Cinematic tour', hBasla: 'Start flying',
	},
};
let dil = guvenliOku( 'mustafapasa-drone-dil' ) === 'en' ? 'en' : 'tr';
function t( anahtar, ...a ) {
	const v = METIN[ dil ][ anahtar ] ?? METIN.tr[ anahtar ] ?? anahtar;
	return typeof v === 'function' ? v( ...a ) : v;
}
// JSON'daki bir yazının seçili dildeki hâli; İngilizcesi yoksa Türkçesi
const yerel = ( o, alan ) => ( dil !== 'tr' && o?.[ dil ]?.[ alan ] ) || o?.[ alan ];
function dilUygula() {
	document.documentElement.lang = dil;
	for ( const e of document.querySelectorAll( '[data-t]' ) ) e.textContent = t( e.dataset.t );
	for ( const e of document.querySelectorAll( '[data-h]' ) ) e.innerHTML = t( e.dataset.h );
	for ( const b of document.querySelectorAll( '#dilSec button' ) ) b.classList.toggle( 'secili', b.dataset.dil === dil );
}

if ( location.protocol === 'file:' ) {
	hataGoster( t( 'dosyaHata' ) );
	throw new Error( 'file:// desteklenmiyor' );
}

// ---------------------------------------------------------------- arazi verisi (DTM, uçuş sınırı)
class Arazi {

	constructor( m, tampon ) {
		this.m = m;
		const n = m.cols * m.rows;
		this.h = new Uint16Array( tampon, 0, n );
		this.sinir = new Uint8Array( tampon, 2 * n, n );
		this.kapsama = new Uint8Array( tampon, 3 * n, n );
	}

	// ENU (doğu, kuzey) -> elipsoid yüksekliği (m), veri yoksa NaN
	yukseklik( e, n ) {
		const { e0, n0, cell, cols, rows, hBase } = this.m;
		const fx = ( e - e0 ) / cell - 0.5, fy = ( n - n0 ) / cell - 0.5;
		const c = Math.floor( fx ), r = Math.floor( fy ), tx = fx - c, ty = fy - r;
		let top = 0, w = 0;
		const ekle = ( cc, rr, ww ) => {
			if ( cc < 0 || rr < 0 || cc >= cols || rr >= rows ) return;
			const v = this.h[ rr * cols + cc ];
			if ( v === 65535 ) return;
			top += ww * v; w += ww;
		};
		ekle( c, r, ( 1 - tx ) * ( 1 - ty ) ); ekle( c + 1, r, tx * ( 1 - ty ) );
		ekle( c, r + 1, ( 1 - tx ) * ty ); ekle( c + 1, r + 1, tx * ty );
		return w > 1e-6 ? hBase + top / w / 10 : NaN;
	}

	icinde( e, n ) {
		const { e0, n0, cell, cols, rows } = this.m;
		const c = Math.floor( ( e - e0 ) / cell ), r = Math.floor( ( n - n0 ) / cell );
		if ( c < 0 || r < 0 || c >= cols || r >= rows ) return false;
		return this.sinir[ r * cols + c ] === 1;
	}

}

// ---------------------------------------------------------------- sahne
const kap = $( 'sahne' );
const renderer = new THREE.WebGLRenderer( { antialias: true, logarithmicDepthBuffer: true } );
renderer.setPixelRatio( Math.min( devicePixelRatio, 1.5 ) );
renderer.setSize( innerWidth, innerHeight );
renderer.domElement.tabIndex = 0;
kap.appendChild( renderer.domElement );

const UFUK = 0xd9e2ea, ZENIT = 0x6f9ed6;
const sahne = new THREE.Scene();
sahne.fog = new THREE.Fog( UFUK, 900, 3400 );
sahne.background = new THREE.Color( UFUK );

const takipKam = new THREE.PerspectiveCamera( 60, innerWidth / innerHeight, 0.1, 40000 );
const fpvKam = new THREE.PerspectiveCamera( 58, innerWidth / innerHeight, 0.1, 40000 );   // Matrice 4E geniş açı ~ 58° dikey
let aktifKam = takipKam;
takipKam.position.set( 0, 120, 160 );
takipKam.lookAt( 0, 0, 0 );

// gökyüzü: dikey renk geçişi + güneş parıltısı
const gunesYon = new THREE.Vector3( 0.3, 0.75, 0.5 ).normalize();
const gok = new THREE.Mesh(
	new THREE.SphereGeometry( 30000, 32, 16 ),
	new THREE.ShaderMaterial( {
		side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
		uniforms: {
			ufuk: { value: new THREE.Color( UFUK ) }, zenit: { value: new THREE.Color( ZENIT ) }, gunes: { value: gunesYon },
		},
		vertexShader: /* glsl */`
			varying vec3 vYon;
			void main() {
				vYon = normalize( position );
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				gl_Position.z = gl_Position.w;
			}`,
		fragmentShader: /* glsl */`
			uniform vec3 ufuk; uniform vec3 zenit; uniform vec3 gunes;
			varying vec3 vYon;
			void main() {
				vec3 d = normalize( vYon );
				float t = pow( clamp( d.y, 0.0, 1.0 ), 0.55 );
				vec3 renk = mix( ufuk, zenit, t );
				float g = max( dot( d, gunes ), 0.0 );
				renk += vec3( 1.0, 0.93, 0.8 ) * ( pow( g, 600.0 ) * 0.9 + pow( g, 12.0 ) * 0.12 );
				gl_FragColor = vec4( renk, 1.0 );
			}`,
	} ),
);
gok.material.uniforms.ufuk.value.convertLinearToSRGB();
gok.material.uniforms.zenit.value.convertLinearToSRGB();
gok.frustumCulled = false;
gok.renderOrder = - 1000;
sahne.add( gok );

sahne.add( new THREE.HemisphereLight( 0xe6eef6, 0x8a7a60, 1.7 ) );
const gunesIsik = new THREE.DirectionalLight( 0xfff4e6, 2.2 );
sahne.add( gunesIsik, gunesIsik.target );

// ---------------------------------------------------------------- 3D Tiles
const draco = new DRACOLoader().setDecoderPath( './lib/three/examples/jsm/libs/draco/gltf/' );
let tiles = null, arazi = null;
const cerceve = { hazir: false, O: new THREE.Vector3(), E: new THREE.Vector3( 1, 0, 0 ), N: new THREE.Vector3( 0, 0, - 1 ), ters: new THREE.Matrix4() };

function tilesKur( meta ) {

	tiles = new TilesRenderer( AYAR.tileset );
	tiles.registerPlugin( new GLTFExtensionsPlugin( { dracoLoader: draco } ) );
	tiles.registerPlugin( new ReorientationPlugin( {
		lat: meta.originLat * DERECE, lon: meta.originLon * DERECE, height: meta.originHeight, recenter: true,
	} ) );
	kaliteUygula( $( 'kalite' ).value );
	tiles.setCamera( aktifKam );
	cozunurlukAyarla();
	sahne.add( tiles.group );

	// çarpışma ışınları için karolara BVH kur (takılma olmasın diye kare başına süre sınırıyla, kuyrukla)
	// eğik bakışta zemin dokusu bulanıklaşmasın diye anizotropik süzme
	const anizotropi = renderer.capabilities.getMaxAnisotropy();
	tiles.addEventListener( 'load-model', ( { scene } ) => {
		scene.traverse( o => {
			if ( o.isMesh && o.geometry && ! o.geometry.boundsTree ) bvhKuyrugu.add( o.geometry );
			if ( o.isMesh && o.material && o.material.map ) o.material.map.anisotropy = anizotropi;
		} );
	} );
	tiles.addEventListener( 'dispose-model', ( { scene } ) => {
		scene.traverse( o => {
			if ( ! o.isMesh || ! o.geometry ) return;
			bvhKuyrugu.delete( o.geometry );
			if ( o.geometry.boundsTree ) o.geometry.disposeBoundsTree();
		} );
	} );
	tiles.addEventListener( 'load-error', e => {
		const url = String( e.url || '' );
		if ( ! tiles.root && url.endsWith( AYAR.tileset.split( '/' ).pop() ) ) {
			hataGoster( t( 'modelYok', AYAR.tileset ) );
		}
	} );

}

// Önbellek doluyken kütüphane yeni karo isteklerini reddeder ve görüntü kaba seviyede takılır,
// bu yüzden ayrıntı düzeyi ile bellek sınırı birlikte ayarlanır.
let kalite = AYAR.kalite.orta;
function kaliteUygula( ad ) {
	kalite = AYAR.kalite[ ad ] || AYAR.kalite.orta;
	tiles.errorTarget = kalite.hata;
	tiles.lruCache.maxBytesSize = kalite.bellek * 2 ** 30;
	tiles.lruCache.minBytesSize = 0.6 * kalite.bellek * 2 ** 30;
	boyutAyarla();
}

function boyutAyarla() {
	renderer.setPixelRatio( Math.min( devicePixelRatio, kalite.piksel ) );   // pencere başka ekrana taşınınca oran değişebilir
	renderer.setSize( innerWidth, innerHeight );
	cozunurlukAyarla();
}

// karo ayrıntısı CSS boyutuna göre değil, gerçekten çizilen piksel sayısına göre seçilsin
const _cozunurluk = new THREE.Vector2();
function cozunurlukAyarla() {
	if ( tiles ) tiles.setResolution( aktifKam, renderer.getDrawingBufferSize( _cozunurluk ) );
}

const bvhKuyrugu = new Set();
function bvhIsle( butceMs ) {
	const bas = performance.now();
	for ( const g of bvhKuyrugu ) {
		bvhKuyrugu.delete( g );
		if ( g.attributes.position && ! g.boundsTree ) g.computeBoundsTree();
		if ( performance.now() - bas > butceMs ) break;
	}
}

function cerceveKur() {
	tiles.group.updateMatrixWorld( true );
	const g = tiles.group.matrixWorld, ell = tiles.ellipsoid, m = arazi.m;
	const la = m.originLat * DERECE, lo = m.originLon * DERECE, h0 = m.originHeight;
	const p0 = ell.getCartographicToPosition( la, lo, h0, new THREE.Vector3() ).applyMatrix4( g );
	if ( p0.length() > 5 ) return false;           // yeniden konumlandırma henüz uygulanmadı
	const pE = ell.getCartographicToPosition( la, lo + 2e-5, h0, new THREE.Vector3() ).applyMatrix4( g );
	const pN = ell.getCartographicToPosition( la + 2e-5, lo, h0, new THREE.Vector3() ).applyMatrix4( g );
	cerceve.O.copy( p0 );
	cerceve.E.subVectors( pE, p0 ).setY( 0 ).normalize();
	cerceve.N.subVectors( pN, p0 ).setY( 0 ).normalize();
	cerceve.ters.copy( g ).invert();
	cerceve.hazir = true;
	gunesYon.set( 0, 0, 0 ).addScaledVector( cerceve.E, 0.35 ).addScaledVector( cerceve.N, - 0.55 ).addScaledVector( YUKARI, 0.75 ).normalize();
	return true;
}
const enu = ( p, hedef = {} ) => {
	const dx = p.x - cerceve.O.x, dz = p.z - cerceve.O.z;
	hedef.e = dx * cerceve.E.x + dz * cerceve.E.z;
	hedef.n = dx * cerceve.N.x + dz * cerceve.N.z;
	return hedef;
};
const dunya = ( e, n, h, hedef = new THREE.Vector3() ) => hedef.copy( cerceve.O )
	.addScaledVector( cerceve.E, e ).addScaledVector( cerceve.N, n ).setY( h - arazi.m.originHeight );
const _cg = new THREE.Vector3();
const cografi = ( p, hedef = {} ) => tiles.ellipsoid.getPositionToCartographic( _cg.copy( p ).applyMatrix4( cerceve.ters ), hedef );

// ---------------------------------------------------------------- ışın testi (çarpışma, yerden yükseklik)
const isinci = new THREE.Raycaster();
isinci.firstHitOnly = true;
function isin( baslangic, yon, uzaklik ) {
	if ( ! tiles || ! tiles.root ) return null;
	isinci.set( baslangic, yon );
	isinci.near = 0; isinci.far = uzaklik;
	const h = isinci.intersectObject( tiles.group, true )[ 0 ];
	if ( ! h ) return null;
	h.dunyaNormal = h.face ? h.face.normal.clone().transformDirection( h.object.matrixWorld ) : yon.clone().negate();
	if ( h.dunyaNormal.dot( yon ) > 0 ) h.dunyaNormal.negate();
	return h;
}

// ---------------------------------------------------------------- drone modeli
function droneYap() {
	const g = new THREE.Group();
	const govde = new THREE.MeshStandardMaterial( { color: 0x2d3138, roughness: 0.55, metalness: 0.25 } );
	const kabuk = new THREE.MeshStandardMaterial( { color: 0x4b5058, roughness: 0.4, metalness: 0.3 } );
	const turuncu = new THREE.MeshStandardMaterial( { color: 0xff8a1a, roughness: 0.5, emissive: 0x3a1800 } );
	const siyah = new THREE.MeshStandardMaterial( { color: 0x111317, roughness: 0.7 } );
	const kutu = ( w, h, d, mat, x, y, z ) => { const m = new THREE.Mesh( new THREE.BoxGeometry( w, h, d ), mat ); m.position.set( x, y, z ); g.add( m ); return m; };

	kutu( 0.30, 0.10, 0.40, govde, 0, 0.03, 0 );
	kutu( 0.22, 0.05, 0.28, kabuk, 0, 0.10, 0.01 );
	kutu( 0.30, 0.025, 0.02, turuncu, 0, 0.05, - 0.205 );
	for ( const [ x, z ] of [ [ - 0.1, - 0.13 ], [ 0.1, - 0.13 ], [ - 0.1, 0.13 ], [ 0.1, 0.13 ] ] ) kutu( 0.016, 0.1, 0.016, siyah, x, - 0.07, z );
	kutu( 0.07, 0.07, 0.07, siyah, 0, - 0.03, - 0.2 );                        // gimbal
	const lens = new THREE.Mesh( new THREE.CylinderGeometry( 0.022, 0.022, 0.02, 16 ), new THREE.MeshStandardMaterial( { color: 0x0b1a2a, roughness: 0.1, metalness: 0.8 } ) );
	lens.rotation.x = Math.PI / 2; lens.position.set( 0, - 0.03, - 0.24 ); g.add( lens );

	const pervaneler = [];
	const kol = new THREE.CylinderGeometry( 0.016, 0.016, 0.34, 8 );
	const motor = new THREE.CylinderGeometry( 0.034, 0.034, 0.05, 16 );
	const kanat = new THREE.BoxGeometry( 0.36, 0.004, 0.032 );
	const bulanik = new THREE.CircleGeometry( 0.19, 32 );
	const bulanikMat = new THREE.MeshBasicMaterial( { color: 0x222222, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide } );
	for ( const a of [ 45, 135, 225, 315 ] ) {
		const r = a * DERECE, dx = Math.sin( r ), dz = - Math.cos( r );
		const k = new THREE.Mesh( kol, govde );
		k.rotation.set( Math.PI / 2, 0, 0 ); k.rotation.y = 0;
		k.position.set( dx * 0.2, 0.05, dz * 0.2 );
		k.lookAt( dx * 2, 0.05, dz * 2 ); k.rotateX( Math.PI / 2 );
		g.add( k );
		const mo = new THREE.Mesh( motor, siyah ); mo.position.set( dx * 0.37, 0.07, dz * 0.37 ); g.add( mo );
		const p = new THREE.Group(); p.position.set( dx * 0.37, 0.105, dz * 0.37 );
		const b = new THREE.Mesh( kanat, siyah ); p.add( b );
		const d = new THREE.Mesh( bulanik, bulanikMat ); d.rotation.x = - Math.PI / 2; p.add( d );
		p.userData.yon = a % 180 === 45 ? 1 : - 1;
		g.add( p ); pervaneler.push( p );
	}
	const led = ( renk, x, z ) => { const m = new THREE.Mesh( new THREE.SphereGeometry( 0.014, 8, 8 ), new THREE.MeshBasicMaterial( { color: renk } ) ); m.position.set( x, 0.04, z ); g.add( m ); return m; };
	led( 0x7dff9a, - 0.37 * 0.71, - 0.37 * 0.71 ); led( 0x7dff9a, 0.37 * 0.71, - 0.37 * 0.71 );
	const arkaLed = led( 0xff3b30, 0, 0.205 );
	g.userData = { pervaneler, bulanikMat, arkaLed };
	return g;
}
const drone = droneYap();
sahne.add( drone );

// yumuşak gölge lekesi (karolar ışıktan etkilenmediği için derinlik algısına yardım eder)
const golge = new THREE.Mesh(
	new THREE.CircleGeometry( 0.55, 32 ),
	new THREE.MeshBasicMaterial( { color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: - 4 } ),
);
golge.visible = false;
sahne.add( golge );

// model dışındaki boşluğu kapatan zemin düzlemi (sis ile birleşir)
const zemin = new THREE.Mesh( new THREE.CircleGeometry( 20000, 64 ), new THREE.MeshBasicMaterial( { color: 0xc8b694 } ) );
zemin.rotation.x = - Math.PI / 2;
zemin.renderOrder = - 10;
sahne.add( zemin );

// fotogrametri modelinin deliklerinden (dik kaya yüzleri gibi) gökyüzü görünmesin diye DTM'den kaba bir arazi örtüsü:
// modelin 3 m altında, toprak renginde, kuzeybatıdan gölgelenmiş. Yalnız görüntü içindir, çarpışma ışınları görmez.
function araziOrtusuKur() {
	const { cols, rows, e0, n0, cell, hBase, hMin } = arazi.m;
	const yuk = ( c, r ) => { const v = arazi.h[ Math.min( Math.max( r, 0 ), rows - 1 ) * cols + Math.min( Math.max( c, 0 ), cols - 1 ) ]; return v === 65535 ? NaN : hBase + v / 10; };
	const konum = new Float32Array( cols * rows * 3 ), renk = new Float32Array( cols * rows * 3 );
	const p = new THREE.Vector3(), nrm = new THREE.Vector3(), isik = new THREE.Vector3( - 0.5, 0.5, 0.75 ).normalize(), taban = new THREE.Color();
	for ( let r = 0; r < rows; r ++ ) for ( let c = 0; c < cols; c ++ ) {
		const i = r * cols + c, h = yuk( c, r );
		dunya( e0 + ( c + 0.5 ) * cell, n0 + ( r + 0.5 ) * cell, ( isNaN( h ) ? hMin : h ) - 3, p );
		konum[ i * 3 ] = p.x; konum[ i * 3 + 1 ] = p.y; konum[ i * 3 + 2 ] = p.z;
		const de = ( yuk( c + 1, r ) - yuk( c - 1, r ) ) / ( 2 * cell ), dn = ( yuk( c, r + 1 ) - yuk( c, r - 1 ) ) / ( 2 * cell );
		const g = THREE.MathUtils.clamp( nrm.set( - de || 0, - dn || 0, 1 ).normalize().dot( isik ), 0.35, 1 );
		// Kapadokya tüfüne yakın açık krem; dik kaya yüzlerindeki deliklerde yassı leke gibi durmasın diye gölgesi hafif
		const ton = 0.8 + 0.22 * g;
		taban.setRGB( 0.86 * ton, 0.82 * ton, 0.74 * ton, THREE.SRGBColorSpace );
		renk[ i * 3 ] = taban.r; renk[ i * 3 + 1 ] = taban.g; renk[ i * 3 + 2 ] = taban.b;
	}
	const indeks = [], k = arazi.kapsama;
	for ( let r = 0; r < rows - 1; r ++ ) for ( let c = 0; c < cols - 1; c ++ ) {
		const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
		if ( k[ a ] && k[ b ] && k[ d ] && k[ e ] ) indeks.push( a, b, d, b, e, d );
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute( 'position', new THREE.BufferAttribute( konum, 3 ) );
	geo.setAttribute( 'color', new THREE.BufferAttribute( renk, 3 ) );
	geo.setIndex( indeks );
	const ortu = new THREE.Mesh( geo, new THREE.MeshBasicMaterial( { vertexColors: true, side: THREE.DoubleSide } ) );
	ortu.renderOrder = - 5;
	sahne.add( ortu );
}

// ---------------------------------------------------------------- durum
const durum = {
	hazir: false, yerde: true,
	pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, egimX: 0, egimZ: 0,
	gimbal: - 15 * DERECE, mod: 'normal', kamera: 'takip', takipMesafe: 7,
	batarya: 100, bataryaUyari: 100,
	yerdenYukseklik: NaN, zeminY: NaN, zeminNormal: new THREE.Vector3( 0, 1, 0 ), zeminKaynak: '',
	ev: { e: 0, n: 0 }, iz: [], sonCarpisma: 0, carpismaSayisi: 0,
	kamYerlesti: false,
};

// ---------------------------------------------------------------- girdi
const tuslar = new Set();
const girdi = { ileri: 0, yan: 0, yukari: 0, donus: 0, gimbal: 0 };
let yardimAcik = true;

addEventListener( 'keydown', e => {
	if ( [ 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight' ].includes( e.code ) ) e.preventDefault();
	if ( tur.aktif ) { if ( ! tur.kayitta && ( e.code === 'Escape' || e.code === 'KeyC' ) ) tur.bitir(); return; }
	if ( yardimAcik ) {
		if ( e.code === 'KeyH' || e.code === 'Escape' || e.code === 'Enter' ) basla();
		return;
	}
	if ( e.repeat ) { tuslar.add( e.code ); return; }
	tuslar.add( e.code );
	tekSeferlik( e.code );
} );
addEventListener( 'keyup', e => tuslar.delete( e.code ) );
addEventListener( 'blur', () => tuslar.clear() );
renderer.domElement.addEventListener( 'wheel', e => {
	e.preventDefault();
	durum.takipMesafe = THREE.MathUtils.clamp( durum.takipMesafe * ( e.deltaY > 0 ? 1.12 : 1 / 1.12 ), 2.5, 80 );
}, { passive: false } );

function tekSeferlik( kod ) {
	switch ( kod ) {
		case 'KeyV': kameraDegistir(); break;
		case 'Digit1': modSec( 'cine' ); break;
		case 'Digit2': modSec( 'normal' ); break;
		case 'Digit3': modSec( 'spor' ); break;
		case 'KeyG': parkur.degistir(); break;
		case 'KeyN': gezi.rehberTusu(); break;
		case 'KeyC': tur.baslat(); break;
		case 'KeyB': gezi.kartTusu(); break;
		case 'KeyP': fotoTusu(); break;
		case 'KeyT': eveDon(); break;
		case 'KeyM': ses.ac( ! ses.acik ); mesajGoster( t( ses.acik ? 'sesAcik' : 'sesKapali' ) ); break;
		case 'KeyU': ses.pervaneAc( ! ses.pervane ); mesajGoster( t( ses.pervane ? 'pervaneAcik' : 'pervaneKapali' ) ); break;
		case 'KeyL': dilDegistir( dil === 'tr' ? 'en' : 'tr' ); break;
		case 'KeyH': yardimAc(); break;
	}
}
function modSec( mod ) {
	durum.mod = mod;
	mesajGoster( t( 'modMesaj', t( 'modAd' )[ mod ], AYAR.modlar[ mod ].yatay ) );
}
function kameraDegistir() {
	if ( ! tiles || ! durum.hazir ) return;
	durum.kamera = durum.kamera === 'takip' ? 'fpv' : 'takip';
	const yeni = durum.kamera === 'fpv' ? fpvKam : takipKam;
	tiles.deleteCamera( aktifKam );
	aktifKam = yeni;
	tiles.setCamera( aktifKam );
	cozunurlukAyarla();
	durum.kamYerlesti = false;
	$( 'kKamera' ).textContent = t( durum.kamera );
	$( 'nisangah' ).style.display = durum.kamera === 'fpv' ? 'block' : 'none';
	$( 'gimbal' ).style.display = durum.kamera === 'fpv' ? 'block' : 'none';
}

// oyun kumandası (standart eşleme, Mod 2)
const oncekiDugme = [];
function kumandaOku() {
	const pads = navigator.getGamepads ? navigator.getGamepads() : [];
	const gp = [ ...pads ].find( p => p && p.connected );
	if ( ! gp ) return null;
	const o = v => Math.abs( v ) < 0.12 ? 0 : ( v - Math.sign( v ) * 0.12 ) / 0.88;
	const a = gp.axes, b = i => gp.buttons[ i ] && gp.buttons[ i ].pressed;
	const kenar = ( i, f ) => { const s = b( i ); if ( s && ! oncekiDugme[ i ] ) f(); oncekiDugme[ i ] = s; };
	if ( ! yardimAcik ) {
		kenar( 0, fotoTusu );
		kenar( 1, kameraDegistir );
		kenar( 3, () => parkur.degistir() );
		kenar( 4, () => modSec( durum.mod === 'spor' ? 'normal' : 'cine' ) );
		kenar( 5, () => modSec( durum.mod === 'cine' ? 'normal' : 'spor' ) );
	}
	kenar( 9, () => yardimAcik ? basla() : yardimAc() );
	return { yukari: - o( a[ 1 ] || 0 ), donus: o( a[ 0 ] || 0 ), ileri: - o( a[ 3 ] || 0 ), yan: o( a[ 2 ] || 0 ), gimbal: ( b( 12 ) ? 1 : 0 ) - ( b( 13 ) ? 1 : 0 ) };
}

function girdiOku() {
	const t = k => tuslar.has( k ) ? 1 : 0;
	girdi.ileri = t( 'KeyW' ) + t( 'ArrowUp' ) - t( 'KeyS' ) - t( 'ArrowDown' );
	girdi.yan = t( 'KeyD' ) - t( 'KeyA' );
	girdi.donus = t( 'KeyE' ) + t( 'ArrowRight' ) - t( 'KeyQ' ) - t( 'ArrowLeft' );
	girdi.yukari = t( 'Space' ) - t( 'ShiftLeft' ) - t( 'ShiftRight' );
	girdi.gimbal = t( 'KeyR' ) - t( 'KeyF' );
	const k = kumandaOku();
	if ( k ) for ( const a in k ) if ( Math.abs( k[ a ] ) > Math.abs( girdi[ a ] ) ) girdi[ a ] = k[ a ];
	for ( const a in girdi ) girdi[ a ] = THREE.MathUtils.clamp( girdi[ a ], - 1, 1 );
	if ( yardimAcik ) for ( const a in girdi ) girdi[ a ] = 0;
}

// ---------------------------------------------------------------- ses (pervane uğultusu)
const ses = {
	acik: true, pervane: guvenliOku( 'mustafapasa-drone-pervane' ) !== '0', ctx: null,
	baslat() {
		if ( this.ctx ) { this.ctx.resume(); return; }
		try {
			const c = this.ctx = new AudioContext();
			this.kazanc = c.createGain(); this.kazanc.gain.value = 0;
			this.filtre = c.createBiquadFilter(); this.filtre.type = 'lowpass'; this.filtre.frequency.value = 520; this.filtre.Q.value = 0.5;
			this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 110;
			this.o2 = c.createOscillator(); this.o2.type = 'sawtooth'; this.o2.frequency.value = 113.5;
			this.o1.connect( this.filtre ); this.o2.connect( this.filtre ); this.filtre.connect( this.kazanc ); this.kazanc.connect( c.destination );
			this.o1.start(); this.o2.start();
		} catch { this.ctx = null; }
	},
	ac( v ) { this.acik = v; $( 'sesAcik' ).checked = v; },
	pervaneAc( v ) { this.pervane = v; $( 'pervaneAcik' ).checked = v; guvenliYaz( 'mustafapasa-drone-pervane', v ? '1' : '0' ); },
	guncelle( gaz, ucuyor ) {
		if ( ! this.ctx ) return;
		const t = this.ctx.currentTime;
		// uğultu yumuşatıldı (süzgeç 900 yerine 520 Hz, kazanç 0,035 yerine 0,025); U tuşu ya da ayar ile tamamen kapanır
		this.kazanc.gain.setTargetAtTime( this.acik && this.pervane && ucuyor ? 0.025 : 0, t, 0.15 );
		const f = 92 + 46 * gaz;
		this.o1.frequency.setTargetAtTime( f, t, 0.1 ); this.o2.frequency.setTargetAtTime( f * 1.031, t, 0.1 );
	},
	bip( frekans = 880, sure = 0.12, hacim = 0.08 ) {
		if ( ! this.ctx || ! this.acik ) return;
		const c = this.ctx, o = c.createOscillator(), k = c.createGain();
		o.frequency.value = frekans; o.type = 'triangle';
		k.gain.setValueAtTime( hacim, c.currentTime ); k.gain.exponentialRampToValueAtTime( 0.0001, c.currentTime + sure );
		o.connect( k ); k.connect( c.destination ); o.start(); o.stop( c.currentTime + sure );
	},
};

// ---------------------------------------------------------------- müzik (gezi noktalarında)
// Dosya gerekmez: ezgiler Web Audio ile çalınır. Perdeler sent cinsinden, makam aralıklarına yakın.
// Melodi [derece, vuruş] çiftleri; derece 7 bir oktav üst, null es. Bir noktanın "muzik" alanı .mp3/.ogg ise o dosya çalar.
const MAKAM = {
	hicaz: [ 0, 90, 384, 498, 702, 792, 996 ],
	ussak: [ 0, 165, 294, 498, 702, 792, 996 ],
	rast: [ 0, 204, 384, 498, 702, 906, 1086 ],
};
const TEMALAR = {
	// kiliseler: ison (sabit ses) üzerinde ağır, ilahi benzeri ezgi
	ilahi: { makam: 'hicaz', tonik: 146.83, tempo: 54, cal: 'koro', ison: [ 0, - 7 ], hacim: 1.1, melodi: [
		[ 0, 2 ], [ 1, 1 ], [ 2, 1 ], [ 3, 2 ], [ 2, 1 ], [ 1, 1 ], [ 2, 2 ], [ 1, 1 ], [ 0, 1 ], [ 1, 3 ], [ null, 1 ],
		[ 2, 1 ], [ 3, 1 ], [ 4, 2 ], [ 3, 1 ], [ 2, 1 ], [ 3, 1 ], [ 2, 1 ], [ 1, 1 ], [ 2, 1 ], [ 1, 2 ], [ 0, 4 ], [ null, 2 ] ] },
	// konaklar: Uşşak'ta mızraplı saz ezgisi, sofyan usulünde def
	konak: { makam: 'ussak', tonik: 220, tempo: 100, cal: 'mizrap', ison: [ - 7 ], hacim: 0.6, usul: [ 'dum', 'tek', 'tek', null ], melodi: [
		[ 3, 0.5 ], [ 2, 0.5 ], [ 1, 0.5 ], [ 2, 0.5 ], [ 3, 1 ], [ 4, 1 ], [ 3, 0.5 ], [ 2, 0.5 ], [ 1, 1 ], [ 0, 2 ],
		[ 0, 0.5 ], [ 1, 0.5 ], [ 2, 0.5 ], [ 3, 0.5 ], [ 4, 1 ], [ 5, 0.5 ], [ 4, 0.5 ], [ 3, 1 ], [ 2, 0.5 ], [ 1, 0.5 ], [ 2, 1 ], [ 1, 0.5 ], [ 0, 0.5 ], [ 1, 2 ],
		[ 4, 0.5 ], [ 5, 0.5 ], [ 6, 0.5 ], [ 7, 0.5 ], [ 6, 1 ], [ 5, 0.5 ], [ 4, 0.5 ], [ 3, 1 ], [ 2, 0.5 ], [ 1, 0.5 ], [ 0, 2 ], [ null, 2 ] ] },
	// medrese, cami, vadi: Rast'ta uzun soluklu ney
	ney: { makam: 'rast', tonik: 196, tempo: 60, cal: 'ney', ison: [ - 7 ], hacim: 0.5, melodi: [
		[ 4, 2 ], [ 5, 1 ], [ 4, 1 ], [ 3, 2 ], [ 2, 1 ], [ 3, 1 ], [ 4, 3 ], [ null, 1 ], [ 3, 1 ], [ 2, 1 ], [ 1, 2 ], [ 2, 1 ], [ 1, 1 ], [ 0, 4 ], [ null, 2 ],
		[ 0, 1 ], [ 1, 1 ], [ 2, 2 ], [ 3, 1 ], [ 4, 1 ], [ 5, 2 ], [ 6, 1 ], [ 7, 3 ], [ 6, 1 ], [ 5, 1 ], [ 4, 4 ], [ null, 2 ] ] },
};
const TUR_TEMA = { kilise: 'ilahi', manastir: 'ilahi', konak: 'konak', universite: 'konak', medrese: 'ney', cami: 'ney', vadi: 'ney' };

const muzik = {
	tema: null, ad: '', sira: 0, sonraki: 0, isonlar: [], dosyalar: new Map(), bozuk: new Set(), dosya: null, zamanlayici: 0,
	kaynak: null, istenenKaynak: null, dosyaHacim: 0.25,
	kur() {
		if ( this.kazanc || ! ses.ctx ) return !! this.kazanc;
		const c = ses.ctx;
		this.kazanc = c.createGain(); this.kazanc.gain.value = 0;
		// yön ve uzaklık: ses yapının yerinden gelir, dinleyici aktif kameradır (dinleyiciGuncelle her karede).
		// "inverse" yasası: ref mesafesinin (yapının yarıçapı) içinde tam ses, iki katında yarısı, dört katında dörtte biri
		this.panner = new PannerNode( c, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 30, rolloffFactor: 1, maxDistance: 10000 } );
		this.yanki = c.createConvolver(); this.yanki.buffer = this.yankiYap( c, 2.6 );
		const kuru = c.createGain(), islak = c.createGain(); kuru.gain.value = 0.8; islak.gain.value = 0.35;
		this.giris = c.createGain();
		this.giris.connect( kuru ); this.giris.connect( this.yanki ); this.yanki.connect( islak );
		kuru.connect( this.kazanc ); islak.connect( this.kazanc ); this.kazanc.connect( this.panner ); this.panner.connect( c.destination );
		return true;
	},
	yankiYap( c, sure ) {
		const n = Math.floor( c.sampleRate * sure ), b = c.createBuffer( 2, n, c.sampleRate );
		for ( let k = 0; k < 2; k ++ ) { const d = b.getChannelData( k ); for ( let i = 0; i < n; i ++ ) d[ i ] = ( Math.random() * 2 - 1 ) * ( 1 - i / n ) ** 3; }
		return b;
	},
	// Gezi hangi kaynağın çalacağını söyler: { ses (TEMALAR adı ya da dosya yolu), yedek, hacim,
	// konum (THREE.Vector3; yoksa ses dinleyicinin önünden, yönsüz gelir), ref (m), kenar (0-1, duyma sınırında söner) } ya da null.
	// Aynı yer için hep aynı nesne verilir; nesne değişince eskisi söner, sonra yenisi başlar.
	hedefle( k ) { this.istenenKaynak = k; },
	// temaAd bir TEMALAR adı ya da ses dosyası yolu; dosya açılamazsa yedek tema çalar (yedek yoksa susar).
	// hacim yalnız dosyalar için: kayıtların yüksekliği farklı olduğundan noktalar.json'da kayıt başına verilir
	cal( temaAd, yedek = 'ney', hacim = 0.25, bastan = false ) {
		const c = ses.ctx;
		this.durdurHemen();
		this.ad = temaAd; this.dosyaHacim = hacim;
		if ( /\.(mp3|ogg|m4a|wav)$/i.test( temaAd ) ) {
			let a = this.dosyalar.get( temaAd );
			if ( ! a ) {
				a = new Audio( temaAd ); a.loop = true; a.preload = 'auto';
				a.addEventListener( 'error', () => {
					console.warn( 'Müzik dosyası açılamadı, yedek ezgi çalıyor:', temaAd );
					this.bozuk.add( temaAd );
					if ( this.dosya !== a ) return;
					this.dosya = null; this.ad = ''; $( 'bMuzik' ).textContent = '';
					if ( yedek ) this.cal( yedek );
				} );
				c.createMediaElementSource( a ).connect( this.kazanc );
				this.dosyalar.set( temaAd, a );
			}
			// aynı yere dönülünce parça kaldığı yerden sürer (turda baştan)
			if ( bastan ) a.currentTime = 0;
			this.dosya = a; a.play().catch( () => {} );
		} else {
			this.tema = TEMALAR[ temaAd ] || TEMALAR.ney;
			this.sira = 0; this.vurus = 0; this.sonraki = c.currentTime + 0.6;
			for ( const d of this.tema.ison ) this.isonlar.push( this.isonCal( this.frekans( d ), c.currentTime ) );
			clearInterval( this.zamanlayici );
			this.zamanlayici = setInterval( () => this.planla(), 100 );
		}
	},
	durdurHemen() {
		const t = ses.ctx.currentTime;
		for ( const o of this.isonlar ) { o.g.gain.setTargetAtTime( 0, t, 0.3 ); o.os.forEach( x => x.stop( t + 2 ) ); }
		this.isonlar = []; this.tema = null; this.ad = '';
		clearInterval( this.zamanlayici );
		if ( this.dosya ) { this.dosya.pause(); this.dosya = null; }
	},
	frekans( d ) {
		const m = MAKAM[ this.tema.makam ], o = Math.floor( d / 7 ), i = ( ( d % 7 ) + 7 ) % 7;
		return this.tema.tonik * 2 ** ( ( m[ i ] + 1200 * o ) / 1200 );
	},
	// her 100 ms: kaynak değiştiyse geçiş, sonra ses düzeyi (hacim değerleri temaları yaklaşık aynı yüksekliğe getirir, RMS ~0,04)
	guncelle() {
		if ( ! this.kur() ) return;
		const k = this.istenenKaynak, t = ses.ctx.currentTime, g = this.kazanc.gain;
		if ( this.kaynak && this.kaynak !== k ) {
			g.setTargetAtTime( 0, t, 0.25 );
			if ( g.value > 0.01 ) return;
			this.durdurHemen(); this.kaynak = null;
		}
		if ( ! this.kaynak && k ) {
			this.kaynak = k;
			this.panner.refDistance = k.konum ? k.ref || 30 : 1;
			this.cal( k.ses, k.yedek, k.hacim, k.bastan );
		}
		if ( ! this.kaynak ) return;
		const acik = ses.acik && $( 'muzikAcik' ).checked;
		const taban = this.tema ? this.tema.hacim : this.dosyaHacim;
		g.setTargetAtTime( acik ? taban * ( this.kaynak.kenar ?? 1 ) : 0, t, 0.3 );
	},
	// dinleyici kameranın yerinde ve baktığı yönde; kaynak yapının yerinde (yönsüz kaynak dinleyicinin hemen önünde)
	dinleyiciGuncelle( kam ) {
		if ( ! this.panner ) return;
		const c = ses.ctx, L = c.listener, t = c.currentTime, e = kam.matrixWorld.elements;
		const p = [ e[ 12 ], e[ 13 ], e[ 14 ] ], f = [ - e[ 8 ], - e[ 9 ], - e[ 10 ] ], u = [ e[ 4 ], e[ 5 ], e[ 6 ] ];
		const k = this.kaynak && this.kaynak.konum;
		const q = k ? [ k.x, k.y, k.z ] : [ p[ 0 ] + f[ 0 ], p[ 1 ] + f[ 1 ], p[ 2 ] + f[ 2 ] ];
		const yaz = ( a, v ) => a.setTargetAtTime( v, t, 0.04 );
		if ( L.positionX ) {
			[ L.positionX, L.positionY, L.positionZ ].forEach( ( a, i ) => yaz( a, p[ i ] ) );
			[ L.forwardX, L.forwardY, L.forwardZ ].forEach( ( a, i ) => yaz( a, f[ i ] ) );
			[ L.upX, L.upY, L.upZ ].forEach( ( a, i ) => yaz( a, u[ i ] ) );
		} else { L.setPosition( ...p ); L.setOrientation( ...f, ...u ); }
		[ this.panner.positionX, this.panner.positionY, this.panner.positionZ ].forEach( ( a, i ) => yaz( a, q[ i ] ) );
	},
	planla() {
		const c = ses.ctx, tm = this.tema;
		if ( ! tm ) return;
		const vurusSn = 60 / tm.tempo;
		while ( this.sonraki < c.currentTime + 0.4 ) {
			const [ d, v ] = tm.melodi[ this.sira ];
			if ( d !== null ) this[ tm.cal ]( this.frekans( d ), this.sonraki, v * vurusSn );
			if ( tm.usul ) {
				// usul vuruşları melodiden bağımsız, her tam vuruşta bir
				for ( let b = Math.ceil( this.vurus ); b < this.vurus + v; b ++ ) {
					const vurus = tm.usul[ b % tm.usul.length ];
					if ( vurus ) this.def( vurus, this.sonraki + ( b - this.vurus ) * vurusSn );
				}
			}
			this.vurus += v;
			this.sonraki += v * vurusSn;
			this.sira = ( this.sira + 1 ) % tm.melodi.length;
		}
	},
	zarf( t, sure, tepe, atak, birak ) {
		const g = ses.ctx.createGain();
		g.gain.setValueAtTime( 0, t );
		g.gain.linearRampToValueAtTime( tepe, t + atak );
		g.gain.setTargetAtTime( 0, t + Math.max( sure - birak, atak ), birak / 3 );
		g.connect( this.giris );
		return g;
	},
	isonCal( f, t ) {
		const c = ses.ctx, g = c.createGain(), fl = c.createBiquadFilter();
		fl.type = 'lowpass'; fl.frequency.value = 700;
		g.gain.setValueAtTime( 0, t ); g.gain.linearRampToValueAtTime( 0.05, t + 2.5 );
		const os = [ 0, 4 ].map( sapma => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = sapma; o.connect( fl ); o.start( t ); return o; } );
		fl.connect( g ); g.connect( this.giris );
		return { g, os };
	},
	koro( f, t, sure ) {
		// iki ses, "a" sesli harfine yakın iki formant süzgeci
		const c = ses.ctx, g = this.zarf( t, sure, 0.11, 0.25, 0.5 );
		for ( const [ fr, q, k ] of [ [ 700, 6, 1 ], [ 1150, 8, 0.6 ] ] ) {
			const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
			const kg = c.createGain(); kg.gain.value = k; bp.connect( kg ); kg.connect( g );
			for ( const sapma of [ - 6, 7 ] ) {
				const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = sapma;
				o.connect( bp ); o.start( t ); o.stop( t + sure + 1.5 );
			}
		}
	},
	mizrap( f, t, sure ) {
		const c = ses.ctx, g = this.zarf( t, Math.min( sure, 0.5 ), 0.22, 0.004, 0.45 ), fl = c.createBiquadFilter();
		fl.type = 'lowpass'; fl.Q.value = 2;
		fl.frequency.setValueAtTime( 3200, t ); fl.frequency.exponentialRampToValueAtTime( 700, t + 0.35 );
		fl.connect( g );
		for ( const [ tip, sapma ] of [ [ 'sawtooth', - 4 ], [ 'triangle', 5 ] ] ) {
			const o = c.createOscillator(); o.type = tip; o.frequency.value = f; o.detune.value = sapma;
			o.connect( fl ); o.start( t ); o.stop( t + 1.2 );
		}
	},
	ney( f, t, sure ) {
		const c = ses.ctx, g = this.zarf( t, sure, 0.16, 0.12, 0.35 );
		const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
		const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.2; lg.gain.value = 0;
		lg.gain.setValueAtTime( 0, t ); lg.gain.linearRampToValueAtTime( f * 0.006, t + Math.min( 0.6, sure ) );
		lfo.connect( lg ); lg.connect( o.frequency );
		const o2 = c.createOscillator(), g2 = c.createGain(); o2.type = 'sine'; o2.frequency.value = f * 2; g2.gain.value = 0.18;
		o2.connect( g2 ); g2.connect( g ); o.connect( g );
		// nefes: süzülmüş gürültü
		const n = c.createBufferSource(); n.buffer = this.gurultu || ( this.gurultu = this.gurultuYap( c ) );
		const bp = c.createBiquadFilter(), ng = c.createGain(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 1.5; ng.gain.value = 0.25;
		n.connect( bp ); bp.connect( ng ); ng.connect( g );
		for ( const x of [ o, o2, lfo, n ] ) { x.start( t ); x.stop( t + sure + 1.2 ); }
	},
	def( vurus, t ) {
		const c = ses.ctx, g = c.createGain();
		g.connect( this.giris );
		if ( vurus === 'dum' ) {
			const o = c.createOscillator(); o.frequency.setValueAtTime( 110, t ); o.frequency.exponentialRampToValueAtTime( 55, t + 0.18 );
			g.gain.setValueAtTime( 0.28, t ); g.gain.exponentialRampToValueAtTime( 0.001, t + 0.3 );
			o.connect( g ); o.start( t ); o.stop( t + 0.32 );
		} else {
			const n = c.createBufferSource(), hp = c.createBiquadFilter(); n.buffer = this.gurultu || ( this.gurultu = this.gurultuYap( c ) );
			hp.type = 'highpass'; hp.frequency.value = 2500;
			g.gain.setValueAtTime( 0.12, t ); g.gain.exponentialRampToValueAtTime( 0.001, t + 0.09 );
			n.connect( hp ); hp.connect( g ); n.start( t ); n.stop( t + 0.1 );
		}
	},
	gurultuYap( c ) {
		const b = c.createBuffer( 1, c.sampleRate * 2, c.sampleRate ), d = b.getChannelData( 0 );
		for ( let i = 0; i < d.length; i ++ ) d[ i ] = Math.random() * 2 - 1;
		return b;
	},
};

// ---------------------------------------------------------------- halka parkuru
function tohumluRastgele( a ) {
	return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul( a ^ a >>> 15, 1 | a ); t = t + Math.imul( t ^ t >>> 7, 61 | t ) ^ t; return ( ( t ^ t >>> 14 ) >>> 0 ) / 4294967296; };
}
const parkur = {
	halkalar: [], aktif: false, sira: 0, baslangic: null, ceza: 0, bitti: false, sonSure: NaN,
	enIyi: parseFloat( guvenliOku( 'mustafapasa-drone-eniyi' ) ) || Infinity,
	grup: new THREE.Group(),
	uret() {
		const rnd = tohumluRastgele( AYAR.parkurTohum ), noktalar = [];
		const guvenli = ( e, n ) => arazi.icinde( e, n ) && [ 0, 1, 2, 3 ].every( i => arazi.icinde( e + 30 * Math.cos( i * Math.PI / 2 ), n + 30 * Math.sin( i * Math.PI / 2 ) ) );
		let pe = durum.ev.e, pn = durum.ev.n, yon = rnd() * Math.PI * 2;
		for ( let i = 0; i < AYAR.halkaSayisi; i ++ ) {
			let bulunan = null;
			for ( let d = 0; d < 120 && ! bulunan; d ++ ) {
				const y = yon + ( rnd() - 0.5 ) * ( d < 60 ? 2.4 : 6.28 );
				const mesafe = ( i === 0 ? 70 : 110 ) + rnd() * 110;
				const e = pe + Math.sin( y ) * mesafe, n = pn + Math.cos( y ) * mesafe;
				if ( ! guvenli( e, n ) ) continue;
				if ( noktalar.some( p => Math.hypot( p.e - e, p.n - n ) < 80 ) ) continue;
				bulunan = { e, n, yon: y };
			}
			if ( ! bulunan ) break;
			noktalar.push( bulunan ); pe = bulunan.e; pn = bulunan.n; yon = bulunan.yon;
		}
		const geo = new THREE.TorusGeometry( AYAR.halkaYaricap, 0.34, 12, 64 );
		const isikGeo = new THREE.CylinderGeometry( 0.22, 0.22, 1, 8, 1, true );
		this.halkalar = noktalar.map( ( p, i ) => {
			const h = arazi.yukseklik( p.e, p.n ) + 28 + rnd() * 18;
			const mat = new THREE.MeshBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0.35, fog: false, depthWrite: false } );
			const m = new THREE.Mesh( geo, mat );
			dunya( p.e, p.n, h, m.position );
			const onceki = i === 0 ? durum.ev : noktalar[ i - 1 ];
			const yonV = new THREE.Vector3().addScaledVector( cerceve.E, p.e - onceki.e ).addScaledVector( cerceve.N, p.n - onceki.n ).normalize();
			m.lookAt( m.position.clone().add( yonV ) );
			const isik = new THREE.Mesh( isikGeo, new THREE.MeshBasicMaterial( { color: 0xffb21e, transparent: true, opacity: 0.28, fog: false, depthWrite: false } ) );
			this.grup.add( m, isik );
			return { m, isik, e: p.e, n: p.n, zeminY: arazi.yukseklik( p.e, p.n ) - arazi.m.originHeight, ayarlandi: 0 };
		} );
		this.grup.visible = false;
		sahne.add( this.grup );
	},
	degistir() {
		if ( ! durum.hazir ) return;
		if ( ! this.halkalar.length ) this.uret();
		if ( this.aktif && ! this.bitti ) {
			this.aktif = false; this.grup.visible = false; $( 'parkur' ).classList.remove( 'acik' );
			mesajGoster( t( 'parkurKapali' ) ); return;
		}
		Object.assign( this, { aktif: true, sira: 0, baslangic: null, ceza: 0, bitti: false } );
		this.grup.visible = true; $( 'parkur' ).classList.add( 'acik' );
		mesajGoster( t( 'parkurHazir' ), 'iyi', 3200 );
	},
	sure( simdi ) { return this.baslangic === null ? 0 : ( simdi - this.baslangic ) / 1000 + this.ceza; },
	guncelle( simdi ) {
		if ( ! this.aktif ) return;
		const R = AYAR.halkaYaricap;
		this.halkalar.forEach( ( h, i ) => {
			const siradaki = i === this.sira && ! this.bitti;
			h.m.visible = i >= this.sira && ! this.bitti;
			h.isik.visible = siradaki;
			h.m.material.color.set( siradaki ? 0xffb21e : 0xffffff );
			h.m.material.opacity = siradaki ? 0.95 : 0.3;
			const s = siradaki ? 1 + 0.06 * Math.sin( simdi / 180 ) : 1;
			h.m.scale.setScalar( s );
			// uzak halkaları gerçek model yüzeyine göre yükselt (çatı, kaya, ağaç)
			if ( simdi - h.ayarlandi > 500 && h.m.position.distanceTo( durum.pos ) > 70 ) {
				h.ayarlandi = simdi;
				const yuzey = isin( h.m.position.clone().setY( h.m.position.y + 400 ), ASAGI, 900 );
				if ( yuzey ) {
					h.zeminY = Math.max( h.zeminY, yuzey.point.y );
					if ( yuzey.point.y > h.m.position.y - R - 14 ) h.m.position.y = yuzey.point.y + R + 18;
				}
			}
			const alt = h.zeminY, ust = h.m.position.y - R;
			h.isik.scale.set( 1, Math.max( ust - alt, 0.1 ), 1 );
			h.isik.position.set( h.m.position.x, ( ust + alt ) / 2, h.m.position.z );
		} );
		if ( this.bitti ) return;
		const hedef = this.halkalar[ this.sira ];
		if ( hedef && durum.pos.distanceTo( hedef.m.position ) < R * 1.05 ) {
			if ( this.sira === 0 ) this.baslangic = simdi;
			this.sira ++;
			ses.bip( 660 + this.sira * 60 );
			if ( this.sira >= this.halkalar.length ) {
				this.bitti = true; this.sonSure = this.sure( simdi );
				const rekor = this.sonSure < this.enIyi;
				if ( rekor ) { this.enIyi = this.sonSure; guvenliYaz( 'mustafapasa-drone-eniyi', String( this.enIyi ) ); }
				mesajGoster( t( 'parkurTamam', sureYaz( this.sonSure ), this.ceza, rekor ), 'iyi', 5000 );
				ses.bip( 1320, 0.35 );
			} else if ( this.sira === 1 ) mesajGoster( t( 'sureBasladi' ), 'iyi' );
		}
	},
	carpisma() { if ( this.aktif && ! this.bitti && this.baslangic !== null ) { this.ceza += 5; mesajGoster( t( 'carpismaCeza' ), 'uyari' ); } },
};

// ---------------------------------------------------------------- gezi (Mustafapaşa'nın simge yapıları)
// Noktalar data/noktalar.json'dan gelir. Yanına uçunca bilgi kartı açılır, müzik başlar, ziyaret kaydedilir.
const GEZI_RENK = { yeni: '#3fd0c9', ziyaret: '#ffb21e', tamam: '#59d18c' };
const _ekran = new THREE.Vector3();
const gezi = {
	veri: null, noktalar: [], grup: new THREE.Group(), hedef: null, aktif: null, acik: true, kartKapali: false, hedefZaman: 0,
	girisGosterildi: false, girisAcik: false, girisKaynak: null, calan: null, kart: null,
	ziyaret: new Set( ( () => { try { return JSON.parse( guvenliOku( 'mustafapasa-drone-ziyaret' ) ) || []; } catch { return []; } } )() ),
	kur() {
		if ( ! Array.isArray( this.veri?.noktalar ) ) return;
		const sutunGeo = new THREE.CylinderGeometry( 0.5, 0.5, 1, 8, 1, true );
		this.noktalar = this.veri.noktalar.map( v => {
			const p = tiles.ellipsoid.getCartographicToPosition( v.enlem * DERECE, v.boylam * DERECE, arazi.m.originHeight, new THREE.Vector3() ).applyMatrix4( tiles.group.matrixWorld );
			const { e, n } = enu( p, {} );
			const zemin = arazi.yukseklik( e, n );
			if ( isNaN( zemin ) ) { console.warn( 'Gezi noktası modelin dışında:', v.ad ); return null; }
			const etiket = new THREE.Sprite( new THREE.SpriteMaterial( { depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false, transparent: true } ) );
			etiket.renderOrder = 20;
			dunya( e, n, zemin + ( v.etiketYuksekligi || 40 ), etiket.position );
			const isaret = new THREE.Sprite( new THREE.SpriteMaterial( { depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false, transparent: true } ) );
			isaret.renderOrder = 19; isaret.position.copy( etiket.position ); isaret.scale.set( 0.016, 0.016, 1 );
			const sutun = new THREE.Mesh( sutunGeo, new THREE.MeshBasicMaterial( { transparent: true, opacity: 0.32, fog: false, depthWrite: false } ) );
			const alt = zemin - arazi.m.originHeight - 5, ust = etiket.position.y - 2;
			sutun.scale.set( 1, ust - alt, 1 ); dunya( e, n, ( ust + alt ) / 2 + arazi.m.originHeight, sutun.position );
			this.grup.add( etiket, isaret, sutun );
			const nokta = { ...v, e, n, etiket, isaret, sutun, mesafe: Infinity, yaricap: v.yaricap || 40 };
			// müzik yapının yerinden gelir; yaricap içinde tam ses, duyma mesafesinde söner
			nokta.duyma = v.duyma || Math.max( 140, 4 * nokta.yaricap );
			// "kaynak" kartın kaynakça satırı; müzik kaynağı ayrı alanda (sesKaynak)
			const tema = v.muzik || TUR_TEMA[ v.tur ] || 'ney', kayit = this.veri.muzikler?.[ tema ];
			nokta.sesKaynak = {
				ses: kayit?.dosya || tema, yedek: TEMALAR[ tema ] ? tema : 'ney', hacim: kayit?.hacim, kayit,
				konum: dunya( e, n, zemin + 6 ), ref: nokta.yaricap, kenar: 0,
			};
			this.etiketCiz( nokta );
			return nokta;
		} ).filter( Boolean );
		sahne.add( this.grup );
		const g = this.veri.muzikler?.giris;
		this.girisKaynak = g ? { ses: g.dosya, yedek: null, hacim: g.hacim, kayit: g, konum: null, kenar: 1 } : null;
		this.listeYaz();
	},
	// müzik künyesi, dosya açılamadıysa (yedek ezgi çalıyorsa) gösterilmez
	kunye( k ) {
		return k?.kayit?.kunye && ! muzik.bozuk.has( k.ses ) ? '♪ ' + yerel( k.kayit, 'kunye' ) : '';
	},
	etiketCiz( p ) {
		const gidildi = this.ziyaret.has( p.id ), yazi = ( gidildi ? '✓ ' : '' ) + yerel( p, 'ad' );
		// 4K ekranda da net olsun diye etiket büyük çiziliyor, ekranda küçültülüyor
		const c = document.createElement( 'canvas' ), x = c.getContext( '2d' ), font = '600 80px Segoe UI, system-ui, sans-serif';
		x.font = font;
		const w = Math.ceil( x.measureText( yazi ).width ) + 152, h = 140;
		c.width = w; c.height = h;
		x.fillStyle = 'rgba(14,18,24,.8)'; x.beginPath(); x.roundRect( 4, 4, w - 8, h - 8, 44 ); x.fill();
		x.strokeStyle = gidildi ? GEZI_RENK.ziyaret : GEZI_RENK.yeni; x.lineWidth = 6; x.stroke();
		x.fillStyle = gidildi ? GEZI_RENK.ziyaret : GEZI_RENK.yeni; x.beginPath(); x.arc( 68, h / 2, 20, 0, Math.PI * 2 ); x.fill();
		x.font = font; x.fillStyle = '#f3f1ec'; x.textBaseline = 'middle'; x.fillText( yazi, 112, h / 2 + 4 );
		const doku = new THREE.CanvasTexture( c ); doku.colorSpace = THREE.SRGBColorSpace;
		if ( p.etiket.material.map ) p.etiket.material.map.dispose();
		p.etiket.material.map = doku; p.etiket.material.needsUpdate = true;
		p.oran = w / h;
		p.isaret.material.map = this.isaretDoku( gidildi ); p.isaret.material.needsUpdate = true;
		p.sutun.material.color.set( gidildi ? GEZI_RENK.ziyaret : GEZI_RENK.yeni );
	},
	isaretDoku( gidildi ) {
		const ad = gidildi ? 'ziyaret' : 'yeni';
		this.isaretler = this.isaretler || {};
		if ( this.isaretler[ ad ] ) return this.isaretler[ ad ];
		const c = document.createElement( 'canvas' ), x = c.getContext( '2d' );
		c.width = c.height = 64;
		x.fillStyle = 'rgba(14,18,24,.85)'; x.beginPath(); x.arc( 32, 32, 29, 0, Math.PI * 2 ); x.fill();
		x.fillStyle = GEZI_RENK[ ad ]; x.beginPath(); x.arc( 32, 32, 17, 0, Math.PI * 2 ); x.fill();
		const d = new THREE.CanvasTexture( c ); d.colorSpace = THREE.SRGBColorSpace;
		return ( this.isaretler[ ad ] = d );
	},
	// ekranda üst üste binen etiketlerden hedef ve yakın olan yazılı kalır, diğerleri yalnız nokta olarak görünür
	etiketDuzenle() {
		const P = aktifKam.projectionMatrix.elements, kutular = [];
		const sira = this.noktalar.filter( p => p.etiket.visible ).sort( ( a, b ) => ( b === this.hedef ) - ( a === this.hedef ) || a.mesafe - b.mesafe );
		for ( const p of sira ) {
			_ekran.copy( p.etiket.position ).project( aktifKam );
			const w = p.etiket.scale.x * P[ 0 ], h = p.etiket.scale.y * P[ 5 ];
			const k = { x0: _ekran.x - w / 2, x1: _ekran.x + w / 2, y0: _ekran.y - h / 2, y1: _ekran.y + h / 2 };
			const cakisma = kutular.some( b => k.x0 < b.x1 && k.x1 > b.x0 && k.y0 < b.y1 && k.y1 > b.y0 );
			if ( ! cakisma && _ekran.z < 1 ) kutular.push( k );
			p.etiket.visible = ! cakisma; p.isaret.visible = cakisma;
		}
	},
	guncelle( simdi ) {
		if ( ! this.noktalar.length ) return;
		this.grup.visible = this.acik;
		enu( durum.pos, _enu );
		let yakin = null;
		for ( const p of this.noktalar ) {
			p.mesafe = Math.hypot( p.e - _enu.e, p.n - _enu.n );
			if ( ! yakin || p.mesafe < yakin.mesafe ) yakin = p;
			const nabiz = p === this.hedef ? 1 + 0.08 * Math.sin( simdi / 220 ) : 1;
			p.etiket.scale.set( 0.036 * p.oran * nabiz, 0.036 * nabiz, 1 );
			// uzaktan da görünsün diye sütun mesafeyle kalınlaşır; yanındayken görüşü kapatmasın diye gizlenir
			const sw = Math.max( 1, p.mesafe * 0.008 );
			p.sutun.scale.x = p.sutun.scale.z = sw;
			p.sutun.visible = p.etiket.visible = p.mesafe > p.yaricap * 1.5;
			p.isaret.visible = false;
		}
		this.etiketDuzenle();
		if ( simdi - this.hedefZaman > 1000 ) {
			this.hedefZaman = simdi;
			this.hedef = this.noktalar.filter( p => ! this.ziyaret.has( p.id ) ).sort( ( a, b ) => a.mesafe - b.mesafe )[ 0 ] || null;
		}
		// karşılama kartı: ilk kalkışta bir kez, ev noktasından uzaklaşınca kapanır
		if ( ! this.girisGosterildi && ! durum.yerde && this.veri.giris ) {
			this.girisGosterildi = this.girisAcik = true;
			this.kartGoster( { tur: 'giris', ...this.veri.giris, sesKaynak: this.girisKaynak } );
		}
		if ( this.girisAcik && Math.hypot( _enu.e - durum.ev.e, _enu.n - durum.ev.n ) > 150 ) this.kartKapat();
		// yerden yüksek uçarken bütün köy aynı anda "ziyaret" sayılmasın
		const yerden = isFinite( durum.yerdenYukseklik ) ? durum.yerdenYukseklik : 0;
		if ( this.aktif && ( this.aktif.mesafe > this.aktif.yaricap * 1.4 || yerden > 110 ) ) this.ayril();
		// yan yana iki yapı varsa (medrese ile cami gibi) belirgin biçimde daha yakın olana geç
		const gecis = this.aktif && yakin !== this.aktif && yakin.mesafe < this.aktif.mesafe - 10;
		if ( ( ! this.aktif || gecis ) && yakin.mesafe < yakin.yaricap && yerden < 90 ) this.var( yakin );
		this.muzikSec( yakin );
	},
	// En yakın ve duyulabilen yapının müziği çalar (meydanda üç yapı üst üste çalmasın).
	// Çalan yapı, başka biri 15 m'den fazla yakın olmadıkça bırakılmaz; böylece sınırda gidip gelmez.
	muzikSec( yakin ) {
		const simdiki = this.calan;
		let sec = yakin.mesafe < yakin.duyma ? yakin : null;
		if ( simdiki && simdiki.mesafe < simdiki.duyma && ( ! sec || sec.mesafe > simdiki.mesafe - 15 ) ) sec = simdiki;
		this.calan = sec;
		if ( sec ) sec.sesKaynak.kenar = THREE.MathUtils.clamp( ( sec.duyma - sec.mesafe ) / ( 0.35 * sec.duyma ), 0, 1 );
		muzik.hedefle( sec ? sec.sesKaynak : this.girisAcik ? this.girisKaynak : null );
	},
	var( p ) {
		this.aktif = p; this.kartKapali = false; this.girisAcik = false;
		this.kartGoster( p );
		if ( this.ziyaret.has( p.id ) ) return;
		this.ziyaret.add( p.id );
		guvenliYaz( 'mustafapasa-drone-ziyaret', JSON.stringify( [ ...this.ziyaret ] ) );
		this.etiketCiz( p ); this.listeYaz();
		const n = this.noktalar.length, k = this.sayi(), tamam = k >= n;
		mesajGoster( tamam ? t( 'geziTamam', n ) : t( 'yeniYer', yerel( p, 'ad' ), k, n ), 'iyi', tamam ? 6000 : 3500 );
		[ 0, 0.12, 0.24 ].forEach( ( g, i ) => setTimeout( () => ses.bip( [ 660, 880, 1100 ][ i ], 0.25, 0.05 ), g * 1000 ) );
		this.hedefZaman = 0;
	},
	ayril() {
		this.aktif = null;
		this.kartKapat();
	},
	kartKapat() {
		this.girisAcik = false;
		$( 'bilgiKart' ).classList.remove( 'acik' );
	},
	// yeniden = dil değişince açık kartı yerinde yenile (kaydırma ve açık/kapalı durumu korunur)
	kartGoster( p, yeniden = false ) {
		this.kart = p;
		$( 'bTur' ).textContent = t( 'turAd' )[ p.tur ] || p.tur || '';
		$( 'bAd' ).textContent = yerel( p, 'ad' );
		$( 'bAlt' ).textContent = yerel( p, 'alt' ) || '';
		$( 'bMetin' ).replaceChildren( ...( yerel( p, 'metin' ) || [] ).map( s => { const e = document.createElement( 'p' ); e.textContent = s; return e; } ) );
		gorev.kartaYaz( p.tur === 'giris' ? null : p.id );
		$( 'bKaynak' ).textContent = p.kaynak ? t( 'kaynak' ) + yerel( p, 'kaynak' ) : '';
		$( 'bMuzik' ).textContent = this.kunye( p.sesKaynak );
		if ( yeniden ) return;
		$( 'bilgiKart' ).scrollTop = 0;
		$( 'bilgiKart' ).classList.add( 'acik' );
	},
	kartTusu() {
		if ( this.girisAcik ) { this.kartKapat(); return; }
		if ( ! this.aktif ) { mesajGoster( t( 'kartUzak' ) ); return; }
		this.kartKapali = ! this.kartKapali;
		$( 'bilgiKart' ).classList.toggle( 'acik', ! this.kartKapali );
	},
	rehberTusu() {
		if ( ! this.noktalar.length ) return;
		this.acik = ! this.acik;
		mesajGoster( t( this.acik ? 'rehberAcik' : 'rehberKapali' ) );
	},
	dilYenile() {
		for ( const p of this.noktalar ) this.etiketCiz( p );
		this.listeYaz();
		if ( this.kart ) this.kartGoster( this.kart, true );
	},
	// eski sürümlerden kalmış, artık listede olmayan ziyaretler sayılmasın
	sayi() { return this.noktalar.filter( p => this.ziyaret.has( p.id ) ).length; },
	listeYaz() {
		const l = $( 'geziListe' );
		if ( ! l ) return;
		l.replaceChildren( ...this.noktalar.map( p => {
			const e = document.createElement( 'li' );
			e.className = this.ziyaret.has( p.id ) ? 'gidildi' : '';
			e.textContent = yerel( p, 'ad' );
			return e;
		} ) );
		$( 'geziSayi' ).textContent = `${ this.sayi() }/${ this.noktalar.length }`;
	},
	sifirla() {
		this.ziyaret.clear(); guvenliYaz( 'mustafapasa-drone-ziyaret', '[]' );
		for ( const p of this.noktalar ) this.etiketCiz( p );
		this.listeYaz(); this.hedefZaman = 0;
	},
};

// ---------------------------------------------------------------- fotoğraf görevleri (Sinasos albümü)
// Görevler data/noktalar.json'daki "gorevler" listesinden gelir. Koşullar gimbal kamerasına (fpvKam) göre denetlenir;
// fotoğraf (P) bütün koşullar sağlanırken çekilirse görev tamamlanır ve görüntünün küçük bir kopyası albüme girer.
const _gp = new THREE.Vector3(), _gd = new THREE.Vector3(), _gy = new THREE.Vector3();
const gorev = {
	liste: [], takip: null, sonuc: null, isaret: null,
	album: ( () => { try { return JSON.parse( guvenliOku( 'mustafapasa-drone-album' ) ) || {}; } catch { return {}; } } )(),
	kur() {
		if ( ! Array.isArray( gezi.veri?.gorevler ) ) return;
		this.liste = gezi.veri.gorevler.map( g => ( { ...g, hedefler: g.hedefler.map( h => {
			const p = tiles.ellipsoid.getCartographicToPosition( h.enlem * DERECE, h.boylam * DERECE, arazi.m.originHeight, new THREE.Vector3() ).applyMatrix4( tiles.group.matrixWorld );
			const { e, n } = enu( p, {} );
			return { e, n, p: dunya( e, n, h.yukseklik ) };
		} ) } ) );
		// hedef işareti: köşeli vizör, binaların arkasında da görünür
		const c = document.createElement( 'canvas' ), x = c.getContext( '2d' );
		c.width = c.height = 128;
		x.strokeStyle = '#fff'; x.lineWidth = 9; x.lineCap = 'round'; x.shadowColor = 'rgba(0,0,0,.7)'; x.shadowBlur = 8;
		for ( const [ sx, sy ] of [ [ 1, 1 ], [ - 1, 1 ], [ 1, - 1 ], [ - 1, - 1 ] ] ) {
			x.beginPath(); x.moveTo( 64 + sx * 50, 64 + sy * 24 ); x.lineTo( 64 + sx * 50, 64 + sy * 50 ); x.lineTo( 64 + sx * 24, 64 + sy * 50 ); x.stroke();
		}
		x.fillStyle = '#fff'; x.beginPath(); x.arc( 64, 64, 7, 0, Math.PI * 2 ); x.fill();
		const doku = new THREE.CanvasTexture( c ); doku.colorSpace = THREE.SRGBColorSpace;
		this.isaret = new THREE.Sprite( new THREE.SpriteMaterial( { map: doku, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false, transparent: true } ) );
		this.isaret.renderOrder = 21; this.isaret.scale.set( 0.045, 0.045, 1 ); this.isaret.visible = false;
		sahne.add( this.isaret );
		this.listeYaz();
	},
	tamam( g ) { return !! this.album[ g.id ]; },
	sayi() { return this.liste.filter( g => this.tamam( g ) ).length; },
	// koşullar ipucu sırasıyla: yükseklik, mesafe, yön, açı, kadraj, görüş, kadrajdaki gezi noktaları
	degerlendir( g, kam = fpvKam ) {
		const K = [], kp = kam.position, h0 = g.hedefler[ 0 ], ke = enu( kp, {} );
		const bakis = kam.getWorldDirection( _gy );
		const kadrajda = ( p, sinir ) => {
			if ( _gd.subVectors( p, kp ).dot( bakis ) <= 0 ) return false;
			_gp.copy( p ).project( kam );
			return Math.abs( _gp.x ) <= sinir && Math.abs( _gp.y ) <= sinir;
		};
		if ( g.yerden ) {
			const y = kam === fpvKam && isFinite( durum.yerdenYukseklik ) ? durum.yerdenYukseklik : kp.y + arazi.m.originHeight - arazi.yukseklik( ke.e, ke.n );
			K.push( { ad: 'kYukseklik', ok: y >= g.yerden[ 0 ] && y <= g.yerden[ 1 ], ipucu: y > g.yerden[ 1 ] ? t( 'iAlcal', g.yerden[ 1 ] ) : t( 'iYuksel', g.yerden[ 0 ] ) } );
		}
		const d = kp.distanceTo( h0.p );
		if ( g.mesafe ) K.push( { ad: 'kMesafe', ok: d >= g.mesafe[ 0 ] && d <= g.mesafe[ 1 ], ipucu: d > g.mesafe[ 1 ] ? t( 'iYaklas', g.mesafe[ 1 ] ) : t( 'iUzaklas', g.mesafe[ 0 ] ) } );
		if ( g.kerteriz ) {
			// hedeften kameraya yön; aralık kuzeyi aşabilir (ör. 300-30)
			const b = ( Math.atan2( ke.e - h0.e, ke.n - h0.n ) / DERECE + 360 ) % 360;
			const [ a1, a2 ] = g.kerteriz, gen = ( a2 - a1 + 360 ) % 360, orta = ( a1 + gen / 2 ) % 360;
			K.push( { ad: 'kYon', ok: ( b - a1 + 360 ) % 360 <= gen, ipucu: t( 'iYon', t( 'yonden' )[ Math.round( orta / 45 ) % 8 ] ) } );
		}
		if ( g.egim ) {
			const e = Math.asin( THREE.MathUtils.clamp( bakis.y, - 1, 1 ) ) / DERECE;
			K.push( { ad: 'kAci', ok: e >= g.egim[ 0 ] - 0.5 && e <= g.egim[ 1 ] + 0.5, ipucu: t( e > g.egim[ 1 ] ? 'iAsagi' : 'iYukari' ) } );
		}
		const onde = g.hedefler.every( h => kadrajda( h.p, 1 ) );
		K.push( { ad: 'kKadraj', ok: g.hedefler.every( h => kadrajda( h.p, g.kadraj ?? 0.6 ) ), ipucu: t( onde ? 'iOrtala' : 'iKadraja' ) } );
		if ( g.gorus !== false ) {
			// hedefe giden ışın, hedefe tolerans kadar yaklaşmadan bir yüzeye çarpıyorsa önü kapalı
			const tol = g.tolerans ?? 5;
			const acik = g.hedefler.every( h => {
				const u = _gd.subVectors( h.p, kp ).length();
				const vur = isin( kp, _gd.divideScalar( u ), u + tol );
				return ! vur || vur.distance >= u - tol;
			} );
			K.push( { ad: 'kGorus', ok: acik, ipucu: t( 'iKapali' ) } );
		}
		if ( g.enAzNokta ) {
			const k = gezi.noktalar.filter( p => kadrajda( dunya( p.e, p.n, arazi.yukseklik( p.e, p.n ) + 8, _gp.clone() ), 1 ) ).length;
			K.push( { ad: 'kYapi', ok: k >= g.enAzNokta, ipucu: t( 'iYapi', k, g.enAzNokta ) } );
		}
		return { kosullar: K, tamam: K.every( k => k.ok ), onde, mesafe: d };
	},
	// panel ve işaret için takip edilen görev: bulunulan yapının görevi, yoksa hedefi yakın olan; panorama yalnız yüksekte
	guncelle() {
		if ( ! this.liste.length ) return;
		const yer = enu( durum.pos, {} );
		let sec = gezi.aktif && this.liste.find( g => g.nokta === gezi.aktif.id && ! this.tamam( g ) ), enIyi = Infinity;
		if ( ! sec ) for ( const g of this.liste ) {
			if ( this.tamam( g ) || ! g.nokta ) continue;
			const h = g.hedefler[ 0 ], m = Math.hypot( h.e - yer.e, h.n - yer.n );
			if ( m < Math.max( 1.6 * ( g.mesafe?.[ 1 ] ?? 100 ), 120 ) && m < enIyi ) { sec = g; enIyi = m; }
		}
		if ( ! sec && durum.yerdenYukseklik > 60 ) sec = this.liste.find( g => ! g.nokta && ! this.tamam( g ) );
		this.takip = sec || null;
		this.sonuc = sec ? this.degerlendir( sec ) : null;
		const goster = !! sec && gezi.acik && sec.gorus !== false;
		this.isaret.visible = goster;
		if ( goster ) {
			this.isaret.position.copy( sec.hedefler[ 0 ].p );
			this.isaret.material.color.set( this.sonuc.tamam ? GEZI_RENK.tamam : '#ffffff' );
		}
	},
	// fotoCek'ten hemen sonra, aynı karede çağrılır: tuval hâlâ gimbal görüntüsünü taşıyor.
	// Bir görev tamamlandıysa ya da ipucu verildiyse true döner (kayıt mesajı onu ezmesin diye).
	fotograf() {
		const yeni = this.liste.filter( g => ! this.tamam( g ) && this.degerlendir( g ).tamam );
		if ( yeni.length ) {
			const resim = this.kucukResim(), zaman = new Date().toISOString();
			for ( const g of yeni ) this.album[ g.id ] = { resim, zaman };
			guvenliYaz( 'mustafapasa-drone-album', JSON.stringify( this.album ) );
			const n = this.liste.length, k = this.sayi();
			mesajGoster( k >= n ? t( 'albumTamam', n ) : t( 'gorevTamam', yeni.map( g => yerel( g, 'baslik' ) ).join( ' + ' ), k, n ), 'iyi', 5000 );
			[ 523, 659, 784, 1047 ].forEach( ( f, i ) => setTimeout( () => ses.bip( f, 0.3, 0.05 ), i * 110 ) );
			this.listeYaz();
			if ( gezi.kart ) gezi.kartGoster( gezi.kart, true );
			this.guncelle();
			return true;
		}
		// görev olmadı: takip edilen görevin hedefi kadrajdaysa eksik olan ilk koşulu söyle
		const g = this.takip, s = g && this.degerlendir( g );
		const eksik = s?.onde && s.kosullar.find( k => ! k.ok );
		if ( eksik ) { mesajGoster( t( 'gorevBaslik', yerel( g, 'baslik' ) ) + ' · ' + eksik.ipucu, 'uyari', 3500 ); return true; }
		return false;
	},
	kucukResim() {
		const k = document.createElement( 'canvas' ), src = renderer.domElement;
		k.width = 320; k.height = Math.round( 320 * src.height / src.width );
		k.getContext( '2d' ).drawImage( src, 0, 0, k.width, k.height );
		return k.toDataURL( 'image/jpeg', 0.82 );
	},
	// bilgi kartındaki görev kutusu (noktaId null: karşılama kartı, noktaya bağlı olmayan görevler)
	kartaYaz( noktaId ) {
		const kutu = $( 'bGorev' ), liste = this.liste.filter( g => ( g.nokta || null ) === noktaId );
		kutu.hidden = ! liste.length;
		kutu.replaceChildren( ...liste.flatMap( g => {
			const tamam = this.tamam( g ), ust = document.createElement( 'div' ), b = document.createElement( 'b' ), p = document.createElement( 'p' );
			ust.className = 'gUst'; ust.textContent = '📷 ' + t( 'fotoGorevi' ) + ( tamam ? ' · ✓ ' + t( 'gorevTamamlandi' ) : '' );
			b.textContent = yerel( g, 'baslik' );
			p.textContent = yerel( g, tamam ? 'basari' : 'gorev' );
			if ( ! tamam ) return [ ust, b, p ];
			const img = new Image(); img.src = this.album[ g.id ].resim; img.alt = yerel( g, 'baslik' );
			return [ ust, b, p, img ];
		} ) );
	},
	// yardım ekranındaki albüm
	listeYaz() {
		const l = $( 'albumListe' );
		if ( ! l ) return;
		l.replaceChildren( ...this.liste.map( g => {
			const li = document.createElement( 'li' ), kare = document.createElement( 'div' ), ad = document.createElement( 'b' ), yer = document.createElement( 'span' );
			const tamam = this.tamam( g ), nokta = gezi.noktalar.find( p => p.id === g.nokta );
			li.className = tamam ? 'tamam' : ''; li.title = yerel( g, 'gorev' );
			kare.className = 'kare';
			if ( tamam ) { const img = new Image(); img.src = this.album[ g.id ].resim; img.alt = ''; kare.append( img ); } else kare.textContent = '📷';
			ad.textContent = yerel( g, 'baslik' );
			yer.textContent = nokta ? yerel( nokta, 'ad' ) : 'Sinasos';
			li.append( kare, ad, yer );
			return li;
		} ) );
		$( 'albumSayi' ).textContent = `${ this.sayi() }/${ this.liste.length }`;
	},
	sifirla() {
		this.album = {}; guvenliYaz( 'mustafapasa-drone-album', '{}' );
		this.listeYaz();
		if ( gezi.kart ) gezi.kartGoster( gezi.kart, true );
	},
};

// ---------------------------------------------------------------- sinematik tur
// Arka plandaki ya da görünmeyen sekmede setTimeout saniyede bire kısılır; MessageChannel kısılmaz.
// Kayıt sırasında hem bekleme hem kütüphanenin iş kuyrukları bununla yürür.
const _kanal = new MessageChannel(), _isler = new Map();
let _isNo = 0;
_kanal.port1.onmessage = e => { const f = _isler.get( e.data ); _isler.delete( e.data ); if ( f ) f( performance.now() ); };
const hemen = f => { const id = ++ _isNo; _isler.set( id, f ); _kanal.port2.postMessage( id ); return id; };
const hemenIptal = id => _isler.delete( id );

// data/tur.json'daki anahtar karelerden (zaman, kamera konumu, bakılan nokta) düzensiz aralıklı Catmull-Rom ile
// yumuşak bir kamera yolu çıkar. Yol tek uzun plan ("kareler", t saniye) ya da kesmelerle bağlanan planlar olabilir
// ("cekimler": her birinin sure, fov, isteğe bağlı karart ve kendi kareleri; karelerin t'si plan içindeki saniye).
// Oyunda gerçek zamanlı oynar (C tuşu); kaydet() ise kare kare çizip yerel bir alıcıya gönderir (her karede
// karoların yüklenmesi beklenir, kare hızı makineden bağımsızdır).
const tur = {
	veri: null, aktif: false, kayitta: false, t0: 0, onceki: null,
	kam: new THREE.PerspectiveCamera( 52, innerWidth / innerHeight, 0.5, 40000 ),
	katman: $( 'turKatman' ),
	_a: new THREE.Vector3(),
	hazirla() {
		const v = this.veri;
		if ( ! v.cekimler ) v.cekimler = [ { sure: v.sure, fov: v.fov, kareler: v.kareler } ];
		let bas = 0;
		for ( const c of v.cekimler ) { c.bas = bas; bas += c.sure; }
		v.sure = bas;
	},
	cekim( t ) {
		const C = this.veri.cekimler;
		let i = 0;
		while ( i < C.length - 1 && t >= C[ i + 1 ].bas ) i ++;
		return C[ i ];
	},
	hermite( K, t, anahtar, hedef ) {
		const n = K.length;
		let i = 0;
		while ( i < n - 2 && t >= K[ i + 1 ].t ) i ++;
		const teget = ( j, k ) => { const a = Math.max( j - 1, 0 ), c = Math.min( j + 1, n - 1 ); return ( K[ c ][ anahtar ][ k ] - K[ a ][ anahtar ][ k ] ) / ( K[ c ].t - K[ a ].t ); };
		const t0 = K[ i ].t, h = K[ i + 1 ].t - t0, u = THREE.MathUtils.clamp( ( t - t0 ) / h, 0, 1 );
		const h00 = 2 * u ** 3 - 3 * u ** 2 + 1, h10 = u ** 3 - 2 * u ** 2 + u, h01 = - 2 * u ** 3 + 3 * u ** 2, h11 = u ** 3 - u ** 2;
		const v = [ 0, 1, 2 ].map( k => h00 * K[ i ][ anahtar ][ k ] + h10 * h * teget( i, k ) + h01 * K[ i + 1 ][ anahtar ][ k ] + h11 * h * teget( i + 1, k ) );
		return dunya( v[ 0 ], v[ 1 ], v[ 2 ], hedef );
	},
	poz( t ) {
		const c = this.cekim( t ), yt = t - c.bas, fov = c.fov || this.veri.fov || 52;
		this.hermite( c.kareler, yt, 'kam', this.kam.position );
		this.kam.lookAt( this.hermite( c.kareler, yt, 'bak', this._a ) );
		if ( this.kam.fov !== fov ) { this.kam.fov = fov; this.kam.updateProjectionMatrix(); }
		this.kam.updateMatrixWorld();
		gok.position.copy( this.kam.position );
	},
	baslat( kayit = false ) {
		if ( ! this.veri || ! durum.hazir || this.aktif ) return;
		this.aktif = true; this.kayitta = kayit;
		this.onceki = { kam: aktifKam, gezi: gezi.acik, sis: [ sahne.fog.near, sahne.fog.far ] };
		if ( yardimAcik ) { yardimAcik = false; arayuz.yardim.classList.add( 'gizli' ); }
		ses.baslat();
		document.body.classList.add( 'sinematik' );
		// model dışını kapatan bej düzlem yerine pus: uzak kenarlar sisin içinde kaybolur
		drone.visible = golge.visible = zemin.visible = false;
		gezi.acik = false; gezi.grup.visible = false; gezi.kartKapat();
		[ sahne.fog.near, sahne.fog.far ] = this.veri.sis || [ 650, 2600 ];
		this.kam.aspect = innerWidth / innerHeight; this.kam.updateProjectionMatrix();
		renderer.domElement.style.filter = this.veri.renk || '';   // gerçek zamanlı turda renk düzenlemesi CSS ile
		tiles.deleteCamera( aktifKam ); aktifKam = this.kam; tiles.setCamera( this.kam ); cozunurlukAyarla();
		this.poz( 0 );
		if ( ! kayit ) {
			const m = this.veri.muzik;
			muzik.hedefle( m ? { ses: m.dosya, yedek: 'konak', hacim: m.hacim, konum: null, kenar: 1, bastan: true } : null );
			this.t0 = performance.now() + 800;   // müziğin başlaması için kısa bir bekleme
			this.katmanBoyutu();
		}
	},
	bitir() {
		if ( ! this.aktif ) return;
		this.aktif = false;
		document.body.classList.remove( 'sinematik' );
		renderer.domElement.style.filter = '';
		this.katman.getContext( '2d' ).clearRect( 0, 0, this.katman.width, this.katman.height );
		[ sahne.fog.near, sahne.fog.far ] = this.onceki.sis;
		gezi.acik = this.onceki.gezi;
		drone.visible = durum.kamera !== 'fpv'; zemin.visible = true;
		tiles.deleteCamera( this.kam ); aktifKam = this.onceki.kam; tiles.setCamera( aktifKam ); cozunurlukAyarla();
		durum.kamYerlesti = false;
		muzik.hedefle( null );
		mesajGoster( t( 'turBitti' ) );
	},
	guncelle( simdi ) {
		// sabitT verilirse yol o anda durur (kamera açılarını denetlemek için)
		const t = this.sabitT ?? Math.max( 0, ( simdi - this.t0 ) / 1000 );
		if ( t >= this.veri.sure ) { this.bitir(); return; }
		this.poz( t );
		muzik.dinleyiciGuncelle( this.kam );
		const c = this.katman, x = c.getContext( '2d' );
		x.clearRect( 0, 0, c.width, c.height );
		this.ciz( x, c.width, c.height, t );
	},
	katmanBoyutu() {
		const pr = Math.min( devicePixelRatio, 2 );
		this.katman.width = Math.round( innerWidth * pr ); this.katman.height = Math.round( innerHeight * pr );
	},
	// alt yazılar, sinema şeritleri ve kararma; hem ekrandaki katmana hem kayıt karesine aynı biçimde çizilir
	ciz( x, W, H, t ) {
		if ( this.veri.ham ) return;   // deneme pozları için: şerit, yazı ve kararma yok
		const S = this.veri.sure, yumusak = v => v * v * ( 3 - 2 * v ), font = 'Segoe UI, system-ui, sans-serif';
		const serit = Math.max( 0, ( H - W / 2.35 ) / 2 );
		if ( this.veri.vinyet ) {
			const vg = x.createRadialGradient( W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.hypot( W, H ) / 2 );
			vg.addColorStop( 0, 'rgba(0,0,0,0)' ); vg.addColorStop( 1, `rgba(0,0,0,${ this.veri.vinyet })` );
			x.fillStyle = vg; x.fillRect( 0, serit, W, H - 2 * serit );
		}
		x.fillStyle = '#000'; x.fillRect( 0, 0, W, serit ); x.fillRect( 0, H - serit, W, serit );
		x.save();
		x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = H * 0.012; x.textBaseline = 'alphabetic';
		for ( const y of this.veri.yazilar ) {
			if ( t < y.bas || t > y.son ) continue;
			const a = yumusak( THREE.MathUtils.clamp( Math.min( t - y.bas, y.son - t ) / 0.9, 0, 1 ) );
			const baslik = yerel( y, 'baslik' ), alt = yerel( y, 'alt' ) || '', kunye = yerel( y, 'kunye' );
			this.artGolge( x, W, H, serit, y.tur, a );
			x.globalAlpha = a;
			x.fillStyle = '#f6f2ea';
			if ( y.tur === 'acilis' || y.tur === 'kapanis' ) {
				x.textAlign = 'center';
				x.font = `300 ${ Math.round( H * 0.105 ) }px ${ font }`; x.letterSpacing = `${ Math.round( H * 0.012 ) }px`;
				x.fillText( baslik.toLocaleUpperCase( dil ), W / 2, H * 0.47 );
				x.font = `500 ${ Math.round( H * 0.031 ) }px ${ font }`; x.letterSpacing = `${ Math.round( H * 0.004 ) }px`;
				x.fillText( alt, W / 2, H * 0.47 + H * 0.065 );
				if ( kunye ) {
					x.letterSpacing = '0px'; x.font = `400 ${ Math.round( H * 0.0165 ) }px ${ font }`; x.fillStyle = 'rgba(246,242,234,.8)';
					x.fillText( kunye, W / 2, H - serit / 2 + H * 0.006, W * 0.92 );
				}
			} else if ( y.tur === 'anlati' ) {
				x.textAlign = 'center'; x.letterSpacing = '0px';
				x.font = `italic 400 ${ Math.round( H * 0.038 ) }px ${ font }`;
				this.satirla( x, baslik, W * 0.62 ).forEach( ( s, i, d ) => x.fillText( s, W / 2, H * 0.5 + ( i - ( d.length - 1 ) / 2 ) * H * 0.05 ) );
			} else {
				// alt üçte bir: ince turkuaz çizgi, başlık, alt satır
				const sol = W * 0.065, taban = H - serit - H * 0.07;
				x.textAlign = 'left'; x.letterSpacing = '0px';
				x.fillStyle = '#3fd0c9'; x.fillRect( sol, taban - H * 0.085, H * 0.05 * a, Math.max( 2, H * 0.003 ) );
				x.fillStyle = '#f6f2ea'; x.font = `600 ${ Math.round( H * 0.046 ) }px ${ font }`;
				x.fillText( baslik, sol, taban - H * 0.025 );
				x.font = `400 ${ Math.round( H * 0.025 ) }px ${ font }`; x.fillStyle = 'rgba(246,242,234,.85)';
				x.fillText( alt, sol, taban + H * 0.018 );
			}
		}
		x.restore();
		// başta karanlıktan açılış, sonda kararma; "karart" işaretli planların başında ve öncesinde kısa kararma
		const c = this.cekim( t ), C = this.veri.cekimler, sonraki = C[ C.indexOf( c ) + 1 ];
		let k = Math.max( 1 - t / 2.5, ( t - ( S - 2.5 ) ) / 2.5, 0 );
		if ( c.karart ) k = Math.max( k, 1 - ( t - c.bas ) / 0.4 );
		if ( sonraki && sonraki.karart ) k = Math.max( k, 1 - ( sonraki.bas - t ) / 0.4 );
		if ( k > 0 ) { x.globalAlpha = Math.min( k, 1 ); x.fillStyle = '#000'; x.fillRect( 0, 0, W, H ); x.globalAlpha = 1; }
	},
	// yazı açık renkli köyün üstünde de okunsun diye arkasına yumuşak bir karartma
	// Orta yazılarda ortada, alt yazılarda sol altta basık bir elips. Daire basık çizilir ve dolgu dairenin
	// tamamını kapsar, böylece kenarda keskin çizgi kalmaz.
	artGolge( x, W, H, serit, tur, a ) {
		const orta = tur === 'acilis' || tur === 'kapanis' || tur === 'anlati', R = W * ( orta ? 0.42 : 0.4 );
		x.save();
		x.shadowColor = 'transparent'; x.globalAlpha = a;
		x.translate( orta ? W / 2 : W * 0.16, orta ? H * 0.5 : H - serit - H * 0.1 );
		// orta elips gökyüzünde leke gibi durmasın diye basık ve hafif
		x.scale( 1, 0.3 );
		const g = x.createRadialGradient( 0, 0, 0, 0, 0, R );
		g.addColorStop( 0, `rgba(0,0,0,${ orta ? 0.36 : 0.55 })` ); g.addColorStop( 0.58, `rgba(0,0,0,${ orta ? 0.14 : 0.24 })` ); g.addColorStop( 1, 'rgba(0,0,0,0)' );
		x.fillStyle = g; x.fillRect( - R, - R, 2 * R, 2 * R );
		x.restore();
	},
	satirla( x, yazi, enGenis ) {
		const satirlar = [];
		let s = '';
		for ( const k of yazi.split( ' ' ) ) {
			if ( s && x.measureText( s + ' ' + k ).width > enGenis ) { satirlar.push( s ); s = k; } else s = s ? s + ' ' + k : k;
		}
		if ( s ) satirlar.push( s );
		return satirlar;
	},
	// Kare kare kayıt. jpeg: her kareyi alıcıya kare_00000.jpg ... olarak POST eder (önizleme için).
	// h264: kareleri tarayıcının video kodlayıcısıyla (WebCodecs, donanım) H.264'e çevirir, Annex B paketlerini alıcıya
	// gönderir; alıcı bunları bir .h264 dosyasının sonuna ekler. (Tarayıcının JPEG kodlayıcısı kare başına ~0,8 sn,
	// ham RGBA gönderimi ~0,35 sn sürüyordu.) İlerleme: tur.kayitDurum, durdurmak: tur.kayitDur = true
	// bulanik: kare başına alt kare sayısı (hareket bulanıklığı, 180 derecelik kapak); 1 = bulanıklık yok
	async kaydet( { fps = 30, w = 1920, h = 1080, adres = 'http://127.0.0.1:8765/kaydet?klasor=tur', bicim = 'jpeg', bas = 0, son = null, kalite = 0.93, hata = 1, beklemeMs = 20000, bulanik = 1 } = {} ) {
		if ( ! this.veri || this.aktif ) return 'tur hazır değil';
		son = son ?? this.veri.sure;
		const bekle = () => new Promise( r => hemen( r ) );
		renderer.setAnimationLoop( null );
		// panel görünmese ya da kare döngüsü kısılsa da karo yüklemesi sürsün diye kütüphanenin zamanlayıcısını kısılmayan kanala bağla
		Scheduler.setXRSession( { requestAnimationFrame: hemen, cancelAnimationFrame: hemenIptal } );
		// sayfa hiç kare çizmediyse (panel gizli) çerçeve kurulmamış olabilir: ana döngüyü elle çalıştır
		const k0 = performance.now();
		while ( ! durum.hazir && performance.now() - k0 < 60000 ) { dongu(); await bekle(); }
		this.baslat( true );
		if ( ! this.aktif ) { Scheduler.setXRSession( null ); renderer.setAnimationLoop( dongu ); return 'oyun hazırlanamadı'; }
		renderer.setPixelRatio( 1 ); renderer.setSize( w, h, false );
		this.kam.aspect = w / h; this.kam.updateProjectionMatrix();
		tiles.setResolution( this.kam, w, h );
		const eskiHata = tiles.errorTarget, eskiMax = tiles.lruCache.maxBytesSize, eskiMin = tiles.lruCache.minBytesSize;
		tiles.errorTarget = hata; tiles.lruCache.maxBytesSize = 6 * 2 ** 30; tiles.lruCache.minBytesSize = 3.6 * 2 ** 30;
		const tuval = document.createElement( 'canvas' ); tuval.width = w; tuval.height = h;
		const x = tuval.getContext( '2d' );
		let kodlayici = null, paketler = [], paketBayt = 0, kodHata = null;
		const gonder = async () => {
			if ( ! paketler.length ) return;
			const govde = new Blob( paketler ); paketler = []; paketBayt = 0;
			const r = await fetch( adres, { method: 'POST', body: govde } );
			if ( ! r.ok ) throw new Error( 'alıcı ' + r.status );
		};
		if ( bicim === 'h264' ) {
			kodlayici = new VideoEncoder( {
				output: p => { const b = new Uint8Array( p.byteLength ); p.copyTo( b ); paketler.push( b ); paketBayt += b.byteLength; },
				error: e => { kodHata = e; },
			} );
			kodlayici.configure( { codec: 'avc1.640033', width: w, height: h, bitrate: 40e6, framerate: fps, hardwareAcceleration: 'prefer-hardware', latencyMode: 'quality', avc: { format: 'annexb' } } );
		}
		const ilk = Math.round( bas * fps ), sonKare = Math.round( son * fps );
		this.kayitDur = false;
		this.kayitDurum = { kare: ilk, ilk, son: sonKare, basladi: performance.now(), uzunBekleme: 0, enUzunMs: 0, hata: null, ms: { yukleme: 0, cizim: 0, kodlama: 0, gonderme: 0 } };
		const ms = this.kayitDurum.ms;
		try {
			for ( let i = ilk; i < sonKare && ! this.kayitDur; i ++ ) {
				const t = i / fps, c = this.cekim( t );
				let yuklemeMs = 0, b1 = performance.now();
				for ( let j = 0; j < bulanik; j ++ ) {
					// alt kareler kare süresinin yarısına yayılır, kesmenin öbür yanına taşmaz
					this.poz( THREE.MathUtils.clamp( t + ( ( j + 0.5 ) / bulanik - 0.5 ) * 0.5 / fps, c.bas, c.bas + c.sure - 1e-4 ) );
					// kaba karolar bitince kütüphane bir sonraki güncellemede daha incelerini ister; bu yüzden
					// art arda iki güncellemede de bekleyen bir şey kalmayınca kare hazır sayılır
					const b0 = performance.now();
					let bos = 0;
					while ( bos < 2 && performance.now() - b0 < beklemeMs ) {
						tiles.update(); await bekle();
						const s = tiles.stats;
						bos = s.queued + s.downloading + s.parsing === 0 && tiles.loadProgress >= 1 ? bos + 1 : 0;
					}
					const sure = performance.now() - b0;
					yuklemeMs += sure;
					if ( sure >= beklemeMs ) this.kayitDurum.uzunBekleme ++;
					this.kayitDurum.enUzunMs = Math.max( this.kayitDurum.enUzunMs, Math.round( sure ) );
					if ( j === 0 ) b1 = performance.now();
					renderer.render( sahne, this.kam );
					// alt karelerin ortalaması adım adım birikir (1, 1/2, 1/3 ...); renk düzenlemesi yalnız görüntüye
					x.globalAlpha = 1 / ( j + 1 ); x.filter = this.veri.renk || 'none';
					x.drawImage( renderer.domElement, 0, 0 );
					x.globalAlpha = 1; x.filter = 'none';
				}
				this.ciz( x, w, h, t );
				const b2 = performance.now();
				if ( kodlayici ) {
					// her parça anahtar kareyle başlar (parçalar uç uca eklenebilsin), sonra her 2 saniyede bir
					const kare = new VideoFrame( tuval, { timestamp: Math.round( i * 1e6 / fps ), duration: Math.round( 1e6 / fps ) } );
					kodlayici.encode( kare, { keyFrame: ( i - ilk ) % ( 2 * fps ) === 0 } ); kare.close();
					while ( kodlayici.encodeQueueSize > 4 ) await bekle();
					if ( kodHata ) throw kodHata;
				}
				const b3 = performance.now();
				if ( kodlayici ) {
					if ( paketBayt > 8e6 ) await gonder();
				} else {
					const blob = await new Promise( r => tuval.toBlob( r, 'image/jpeg', kalite ) );
					const r = await fetch( `${ adres }&ad=kare_${ String( i ).padStart( 5, '0' ) }.jpg`, { method: 'POST', body: blob } );
					if ( ! r.ok ) throw new Error( 'alıcı ' + r.status );
				}
				// aşama süreleri (ms, toplam): darboğazı görmek için
				ms.yukleme += yuklemeMs; ms.cizim += b2 - b1 - yuklemeMs; ms.kodlama += b3 - b2; ms.gonderme += performance.now() - b3;
				this.kayitDurum.kare = i + 1;
			}
			if ( kodlayici ) { await kodlayici.flush(); await gonder(); }
		} catch ( e ) {
			this.kayitDurum.hata = String( e );
		} finally {
			if ( kodlayici && kodlayici.state !== 'closed' ) kodlayici.close();
			tiles.errorTarget = eskiHata; tiles.lruCache.maxBytesSize = eskiMax; tiles.lruCache.minBytesSize = eskiMin;
			this.bitir();
			Scheduler.setXRSession( null );
			boyutAyarla();
			for ( const k of [ takipKam, fpvKam ] ) { k.aspect = innerWidth / innerHeight; k.updateProjectionMatrix(); }
			renderer.setAnimationLoop( dongu );
		}
		this.kayitDurum.bitti = performance.now();
		return this.kayitDurum;
	},
};

// ---------------------------------------------------------------- fizik
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3();
const ASAGI = new THREE.Vector3( 0, - 1, 0 );
const _enu = {};

function yonVektorleri() {
	_f.set( - Math.sin( durum.yaw ), 0, - Math.cos( durum.yaw ) );
	_r.set( Math.cos( durum.yaw ), 0, - Math.sin( durum.yaw ) );
}

function zeminOlc( yukaridan ) {
	// yerdeyken çatıyı bulmak için yukarıdan, uçarken drone'un hemen üstünden aşağı ışın
	_o.copy( durum.pos ).y += yukaridan ? 150 : 0.4;
	const h = isin( _o, ASAGI, yukaridan ? 1200 : 800 );
	if ( h ) {
		durum.zeminY = h.point.y; durum.zeminNormal.copy( h.dunyaNormal ); durum.zeminKaynak = 'model';
	} else {
		enu( durum.pos, _enu );
		const dtm = arazi.yukseklik( _enu.e, _enu.n );
		if ( ! isNaN( dtm ) ) { durum.zeminY = dtm - arazi.m.originHeight; durum.zeminNormal.set( 0, 1, 0 ); durum.zeminKaynak = 'dtm'; }
	}
	durum.yerdenYukseklik = durum.pos.y - AYAR.govde - durum.zeminY;
}

function carpismaOlayi( yazi ) {
	const simdi = performance.now();
	if ( simdi - durum.sonCarpisma < 1000 ) return;
	durum.sonCarpisma = simdi; durum.carpismaSayisi ++;
	flasYap( 'radial-gradient(ellipse at center, rgba(255,60,40,0) 40%, rgba(255,60,40,.55) 100%)' );
	ses.bip( 110, 0.3, 0.2 );
	if ( parkur.aktif && ! parkur.bitti && parkur.baslangic !== null ) parkur.carpisma(); else mesajGoster( yazi, 'uyari' );
}

function fizik( dt ) {
	const m = AYAR.modlar[ durum.mod ];
	yonVektorleri();

	if ( durum.yerde ) {
		zeminOlc( true );
		if ( ! isNaN( durum.zeminY ) ) durum.pos.y = durum.zeminY + AYAR.govde;
		durum.vel.set( 0, 0, 0 );
		if ( girdi.yukari > 0.3 && durum.batarya > 0 ) {
			durum.yerde = false; durum.vel.y = 1.5;
			mesajGoster( t( 'kalkis' ) );
		}
		return;
	}

	durum.yaw -= girdi.donus * m.donus * DERECE * dt;
	yonVektorleri();

	// hedef hız ve yumuşak ivmelenme
	const bitti = durum.batarya <= 0;
	_v.set( 0, 0, 0 ).addScaledVector( _f, girdi.ileri * m.yatay ).addScaledVector( _r, girdi.yan * m.yatay );
	if ( _v.length() > m.yatay ) _v.setLength( m.yatay );
	_v.y = girdi.yukari * ( girdi.yukari > 0 ? m.dikey : m.dikey * 0.8 );
	if ( bitti ) _v.set( 0, - 2, 0 );
	const k = 1 - Math.exp( - m.ivme * dt ), kd = 1 - Math.exp( - 4 * dt );
	durum.vel.x += ( _v.x - durum.vel.x ) * k;
	durum.vel.z += ( _v.z - durum.vel.z ) * k;
	durum.vel.y += ( _v.y - durum.vel.y ) * kd;

	// yatay çarpışma: hareket yönünde üç ışın (merkez, sol, sağ)
	const yatayHiz = Math.hypot( durum.vel.x, durum.vel.z );
	if ( yatayHiz > 0.05 ) {
		_d.set( durum.vel.x / yatayHiz, 0, durum.vel.z / yatayHiz );
		const yanV = new THREE.Vector3( - _d.z, 0, _d.x );
		const uzak = yatayHiz * dt + AYAR.carpismaYaricap;
		let enYakin = null;
		for ( const ofset of [ 0, 0.45, - 0.45 ] ) {
			_o.copy( durum.pos ).addScaledVector( yanV, ofset );
			const h = isin( _o, _d, uzak );
			if ( h && ( ! enYakin || h.distance < enYakin.distance ) ) enYakin = h;
		}
		if ( enYakin ) {
			const n = enYakin.dunyaNormal, vn = durum.vel.dot( n );
			if ( yatayHiz > 7 && vn < 0 ) {
				carpismaOlayi( t( 'carpisma' ) );
				durum.vel.addScaledVector( n, - 1.6 * vn ).multiplyScalar( 0.3 );        // geri sek
			} else if ( vn < 0 ) {
				durum.vel.addScaledVector( n, - vn );                                     // yüzey boyunca kay
			}
			const giris = AYAR.carpismaYaricap - enYakin.distance;
			if ( giris > 0 ) durum.pos.addScaledVector( _d, - giris );
		}
	}
	// yukarı çarpışma (saçak, kaya çıkıntısı)
	if ( durum.vel.y > 0 ) {
		const h = isin( durum.pos, YUKARI, durum.vel.y * dt + 0.3 );
		if ( h ) durum.vel.y = 0;
	}

	// hareket + uçuş sınırı + tavan
	const yeni = _o.copy( durum.pos ).addScaledVector( durum.vel, dt );
	enu( yeni, _enu );
	if ( ! arazi.icinde( _enu.e, _enu.n ) ) {
		yeni.x = durum.pos.x; yeni.z = durum.pos.z;
		durum.vel.x *= - 0.2; durum.vel.z *= - 0.2;
		mesajGoster( t( 'ucusSiniri' ), 'uyari' );
		enu( yeni, _enu );
	}
	const dtm = arazi.yukseklik( _enu.e, _enu.n );
	if ( ! isNaN( dtm ) ) {
		const tavan = dtm - arazi.m.originHeight + AYAR.maxYerdenYukseklik;
		if ( yeni.y > tavan ) {
			yeni.y = tavan; durum.vel.y = Math.min( durum.vel.y, 0 );
			mesajGoster( t( 'yukseklikSiniri', AYAR.maxYerdenYukseklik ), 'uyari' );
		}
	}
	durum.pos.copy( yeni );

	// zemin teması ve iniş
	zeminOlc( false );
	if ( ! isNaN( durum.zeminY ) && durum.pos.y < durum.zeminY + AYAR.govde ) {
		const inisHizi = - durum.vel.y, yatay = Math.hypot( durum.vel.x, durum.vel.z );
		durum.pos.y = durum.zeminY + AYAR.govde;
		if ( durum.vel.y < 0 ) {
			if ( inisHizi > 4 || yatay > 5 ) carpismaOlayi( t( 'sertInis' ) );
			durum.vel.y = 0;
			if ( ( girdi.yukari < 0 || bitti ) && yatay < 2 ) {
				durum.yerde = true; durum.vel.set( 0, 0, 0 );
				mesajGoster( t( bitti ? 'inisBitti' : 'inis' ), bitti ? 'uyari' : '' );
			}
		}
		durum.yerdenYukseklik = 0;
	}

	// batarya
	const hiz = Math.hypot( durum.vel.x, durum.vel.z );
	const tuketim = ( 0.8 + 0.5 * hiz / 12 + 0.3 * Math.max( durum.vel.y, 0 ) / 5 ) * ( durum.mod === 'spor' ? 1.25 : 1 );
	durum.batarya = Math.max( 0, durum.batarya - 100 / AYAR.bataryaSure * tuketim * dt );
	for ( const esik of [ 30, 15 ] ) {
		if ( durum.batarya < esik && durum.bataryaUyari >= esik ) {
			durum.bataryaUyari = esik;
			mesajGoster( t( esik === 15 ? 'bataryaKritik' : 'batarya30' ), 'uyari', 3500 );
		}
	}
	if ( bitti && durum.bataryaUyari > 0 ) { durum.bataryaUyari = 0; mesajGoster( t( 'bataryaBitti' ), 'uyari', 3500 ); }
}

function eveDon() {
	if ( ! durum.hazir ) return;
	dunya( durum.ev.e, durum.ev.n, arazi.yukseklik( durum.ev.e, durum.ev.n ), durum.pos );
	durum.yerde = true; durum.vel.set( 0, 0, 0 );
	durum.batarya = 100; durum.bataryaUyari = 100;
	durum.yaw = Math.atan2( - cerceve.N.x, - cerceve.N.z );
	durum.kamYerlesti = false; durum.iz.length = 0;
	mesajGoster( t( 'evNoktasi' ) );
}

// ---------------------------------------------------------------- görsel güncellemeler
const _hedefKam = new THREE.Vector3(), _bak = new THREE.Vector3();
function droneGorsel( dt, simdi ) {
	const m = AYAR.modlar[ durum.mod ];
	const vf = durum.vel.dot( _f ), vr = durum.vel.dot( _r );
	const hedefX = durum.yerde ? 0 : - THREE.MathUtils.clamp( vf / 21, - 1, 1 ) * 0.42 - THREE.MathUtils.clamp( ( girdi.ileri * m.yatay - vf ) / 21, - 1, 1 ) * 0.12;
	const hedefZ = durum.yerde ? 0 : - THREE.MathUtils.clamp( vr / 21, - 1, 1 ) * 0.42 - THREE.MathUtils.clamp( ( girdi.yan * m.yatay - vr ) / 21, - 1, 1 ) * 0.12;
	const k = 1 - Math.exp( - 6 * dt );
	durum.egimX += ( hedefX - durum.egimX ) * k;
	durum.egimZ += ( hedefZ - durum.egimZ ) * k;
	drone.position.copy( durum.pos );
	drone.rotation.set( durum.egimX, durum.yaw, durum.egimZ, 'YXZ' );
	const { pervaneler, bulanikMat, arkaLed } = drone.userData;
	const donuyor = ! durum.yerde;
	for ( const p of pervaneler ) p.rotation.y += ( donuyor ? 70 : 0 ) * p.userData.yon * dt;
	pervaneler.forEach( p => { p.children[ 0 ].visible = ! donuyor; } );
	bulanikMat.opacity = donuyor ? 0.22 : 0;
	arkaLed.visible = Math.floor( simdi / 500 ) % 2 === 0;
	drone.visible = durum.kamera !== 'fpv';

	// gölge lekesi
	if ( ! isNaN( durum.zeminY ) && durum.yerdenYukseklik < 40 ) {
		golge.visible = true;
		golge.position.set( durum.pos.x, durum.zeminY + 0.04, durum.pos.z );
		golge.lookAt( _bak.copy( golge.position ).add( durum.zeminNormal ) );
		golge.material.opacity = 0.38 * ( 1 - durum.yerdenYukseklik / 40 );
		golge.scale.setScalar( 1 + durum.yerdenYukseklik * 0.02 );
	} else golge.visible = false;
}

function kameraGuncelle( dt ) {
	durum.gimbal = THREE.MathUtils.clamp( durum.gimbal + girdi.gimbal * 45 * DERECE * dt, - 90 * DERECE, 20 * DERECE );
	// FPV / gimbal kamerası her zaman güncel (fotoğraf için)
	fpvKam.position.copy( durum.pos ).addScaledVector( _f, 0.26 ).y -= 0.03;
	fpvKam.rotation.set( durum.gimbal, durum.yaw, 0, 'YXZ' );
	fpvKam.updateMatrixWorld();

	if ( durum.kamera === 'takip' ) {
		const d = durum.takipMesafe;
		_hedefKam.copy( durum.pos ).addScaledVector( _f, - d ).y += d * 0.32 + 0.8;
		// kamera ile drone arasında engel varsa yaklaş
		_o.copy( durum.pos ).y += 0.3;
		_d.subVectors( _hedefKam, _o );
		const uz = _d.length(); _d.divideScalar( uz );
		const h = isin( _o, _d, uz );
		if ( h ) _hedefKam.copy( _o ).addScaledVector( _d, Math.max( h.distance - 0.6, 0.8 ) );
		if ( ! durum.kamYerlesti ) { takipKam.position.copy( _hedefKam ); durum.kamYerlesti = true; } else takipKam.position.lerp( _hedefKam, 1 - Math.exp( - 5 * dt ) );
		_bak.copy( durum.pos ).addScaledVector( _f, 2 ).y += 0.6;
		takipKam.lookAt( _bak );
		takipKam.updateMatrixWorld();
	}
	gok.position.copy( aktifKam.position );
	gunesIsik.position.copy( durum.pos ).addScaledVector( gunesYon, 50 );
	gunesIsik.target.position.copy( durum.pos );
}

// ---------------------------------------------------------------- mini harita
const harita = $( 'harita' ), hctx = harita.getContext( '2d' );
const haritaResim = new Image();
let haritaOlcek = 1, haritaOx = 0, haritaOy = 0;
haritaResim.onload = () => {
	haritaOlcek = Math.min( harita.width / haritaResim.width, harita.height / haritaResim.height );
	haritaOx = ( harita.width - haritaResim.width * haritaOlcek ) / 2;
	haritaOy = ( harita.height - haritaResim.height * haritaOlcek ) / 2;
};
function haritaPx( e, n ) {
	const m = arazi.m;
	return [ haritaOx + ( e - m.e0 ) / m.cell * haritaOlcek, haritaOy + ( m.rows - ( n - m.n0 ) / m.cell ) * haritaOlcek ];
}
function haritaCiz( yonRad ) {
	hctx.clearRect( 0, 0, harita.width, harita.height );
	if ( ! haritaResim.complete || ! arazi ) return;
	hctx.drawImage( haritaResim, haritaOx, haritaOy, haritaResim.width * haritaOlcek, haritaResim.height * haritaOlcek );
	// iz
	if ( durum.iz.length > 1 ) {
		hctx.strokeStyle = 'rgba(255,154,31,.75)'; hctx.lineWidth = 2.5; hctx.beginPath();
		durum.iz.forEach( ( p, i ) => { const [ x, y ] = haritaPx( p.e, p.n ); i ? hctx.lineTo( x, y ) : hctx.moveTo( x, y ); } );
		hctx.stroke();
	}
	// halkalar
	if ( parkur.aktif && ! parkur.bitti ) parkur.halkalar.forEach( ( h, i ) => {
		if ( i < parkur.sira ) return;
		const [ x, y ] = haritaPx( h.e, h.n );
		hctx.beginPath(); hctx.arc( x, y, i === parkur.sira ? 7 : 4.5, 0, Math.PI * 2 );
		if ( i === parkur.sira ) { hctx.fillStyle = '#ffb21e'; hctx.fill(); } else { hctx.strokeStyle = 'rgba(255,255,255,.85)'; hctx.lineWidth = 2; hctx.stroke(); }
	} );
	// gezi noktaları
	if ( gezi.acik ) for ( const p of gezi.noktalar ) {
		const [ x, y ] = haritaPx( p.e, p.n ), gidildi = gezi.ziyaret.has( p.id );
		hctx.beginPath(); hctx.arc( x, y, p === gezi.hedef ? 8 : 6, 0, Math.PI * 2 );
		hctx.fillStyle = gidildi ? GEZI_RENK.ziyaret : 'rgba(14,18,24,.85)'; hctx.fill();
		hctx.lineWidth = 2.5; hctx.strokeStyle = gidildi ? '#1a1205' : GEZI_RENK.yeni; hctx.stroke();
	}
	// ev
	const [ ex, ey ] = haritaPx( durum.ev.e, durum.ev.n );
	hctx.fillStyle = 'rgba(14,18,24,.85)'; hctx.beginPath(); hctx.arc( ex, ey, 9, 0, Math.PI * 2 ); hctx.fill();
	hctx.fillStyle = '#fff'; hctx.font = 'bold 12px Segoe UI, system-ui, sans-serif'; hctx.textAlign = 'center'; hctx.textBaseline = 'middle'; hctx.fillText( 'H', ex, ey + 0.5 );
	// drone
	enu( durum.pos, _enu );
	const [ dx, dy ] = haritaPx( _enu.e, _enu.n );
	hctx.save(); hctx.translate( dx, dy ); hctx.rotate( yonRad );
	hctx.fillStyle = '#ff9a1f'; hctx.strokeStyle = '#1a1205'; hctx.lineWidth = 2;
	hctx.beginPath(); hctx.moveTo( 0, - 12 ); hctx.lineTo( 8, 9 ); hctx.lineTo( 0, 4 ); hctx.lineTo( - 8, 9 ); hctx.closePath(); hctx.fill(); hctx.stroke();
	hctx.restore();
}

// ---------------------------------------------------------------- gösterge paneli
const _geo = {};
function yonDerece() {
	const e = _f.x * cerceve.E.x + _f.z * cerceve.E.z, n = _f.x * cerceve.N.x + _f.z * cerceve.N.z;
	return ( Math.atan2( e, n ) / DERECE + 360 ) % 360;
}
function panelGuncelle( simdi, fps ) {
	const yuk = tiles && isFinite( tiles.loadProgress ) ? tiles.loadProgress : 0;
	arayuz.cubuk.style.width = ( yuk * 100 ).toFixed( 0 ) + '%';
	arayuz.durum.textContent = ! durum.hazir ? t( 'modelYukleniyor' ) : ( yuk < 0.999 ? t( 'karolarYukleniyor', ( yuk * 100 ).toFixed( 0 ) ) : t( 'modelHazir' ) ) + ` · ${ fps.toFixed( 0 ) } FPS`;
	if ( ! durum.hazir ) return;
	// önbellek doluluğu; reddedilen karo varsa ayrıntı o bölgede kaba kalır
	const onb = tiles.lruCache, ret = tiles.stats.refused;
	arayuz.bellek.textContent = t( 'onbellek', ( onb.cachedBytes / 2 ** 30 ).toFixed( 2 ), + ( onb.maxBytesSize / 2 ** 30 ).toFixed( 1 ) ) + ( ret > 0 ? t( 'onbellekDolu', ret ) : '' );
	arayuz.bellek.classList.toggle( 'uyari', ret > 0 );

	const agl = durum.yerdenYukseklik;
	$( 'tAgl' ).firstElementChild.textContent = isFinite( agl ) ? ( durum.zeminKaynak === 'dtm' ? '~' : '' ) + Math.max( agl, 0 ).toFixed( 1 ) : '–';
	$( 'tKot' ).textContent = ( durum.pos.y + arazi.m.originHeight ).toFixed( 0 );
	$( 'tHiz' ).textContent = Math.hypot( durum.vel.x, durum.vel.z ).toFixed( 1 );
	$( 'tDikey' ).textContent = ( durum.vel.y >= 0 ? '+' : '' ) + durum.vel.y.toFixed( 1 );
	const yon = yonDerece();
	$( 'tYon' ).textContent = yon.toFixed( 0 ) + '° ' + yonHarf( yon );
	enu( durum.pos, _enu );
	$( 'tMesafe' ).textContent = Math.hypot( _enu.e - durum.ev.e, _enu.n - durum.ev.n ).toFixed( 0 );
	$( 'tMod' ).textContent = t( 'modAd' )[ durum.mod ];
	const bat = $( 'tBat' ); bat.firstElementChild.textContent = durum.batarya.toFixed( 0 ) + '%'; bat.classList.toggle( 'uyari', durum.batarya < 20 );
	cografi( durum.pos, _geo );
	$( 'kEnlem' ).textContent = ( _geo.lat / DERECE ).toFixed( 6 ) + '°';
	$( 'kBoylam' ).textContent = ( _geo.lon / DERECE ).toFixed( 6 ) + '°';
	const g = durum.gimbal / DERECE;
	$( 'kGimbal' ).textContent = g.toFixed( 0 ) + '°';
	$( 'gimbalYazi' ).textContent = g.toFixed( 0 ) + '°';
	$( 'gimbal' ).firstElementChild.style.top = ( 6 + ( 20 - g ) / 110 * 135 ) + 'px';

	if ( parkur.aktif ) {
		$( 'pHalka' ).textContent = `${ parkur.sira }/${ parkur.halkalar.length }`;
		$( 'pSure' ).textContent = parkur.bitti ? sureYaz( parkur.sonSure ) : sureYaz( parkur.sure( simdi ) );
		$( 'pEnIyi' ).textContent = sureYaz( parkur.enIyi );
		const h = parkur.halkalar[ parkur.sira ];
		if ( h && ! parkur.bitti ) {
			const dE = h.e - _enu.e, dN = h.n - _enu.n;
			const aci = Math.atan2( dE, dN ) / DERECE - yon;
			$( 'yonOk' ).style.transform = `rotate(${ aci }deg)`;
			const dy = h.m.position.y - durum.pos.y;
			$( 'pMesafe' ).textContent = `${ h.m.position.distanceTo( durum.pos ).toFixed( 0 ) } m · ${ dy >= 0 ? '↑' : '↓' }${ Math.abs( dy ).toFixed( 0 ) } m`;
			$( 'pHedefEtiket' ).textContent = t( parkur.sira === 0 ? 'baslangicHalkasi' : 'sonrakiHalka' );
		} else { $( 'pMesafe' ).textContent = t( 'bitti' ); $( 'yonOk' ).style.transform = ''; }
	}
	// gezi paneli (parkur açıkken onun yerini kaplamasın)
	const geziGoster = gezi.acik && gezi.noktalar.length > 0 && ! parkur.aktif;
	$( 'gezi' ).classList.toggle( 'acik', geziGoster );
	if ( geziGoster ) {
		$( 'gSayi' ).textContent = `${ gezi.sayi() }/${ gezi.noktalar.length }`;
		$( 'gAlbum' ).textContent = `${ gorev.sayi() }/${ gorev.liste.length }`;
		$( 'gAlbum' ).parentElement.hidden = ! gorev.liste.length;
		const h = gezi.hedef, ok = $( 'gOk' );
		if ( gezi.aktif ) {
			$( 'gEtiket' ).textContent = t( 'buradasin' ); $( 'gHedef' ).textContent = yerel( gezi.aktif, 'ad' ); ok.style.visibility = 'hidden';
		} else if ( h ) {
			const m = h.mesafe < 1000 ? h.mesafe.toFixed( 0 ) + ' m' : ( h.mesafe / 1000 ).toFixed( 1 ) + ' km';
			$( 'gEtiket' ).textContent = t( 'sonrakiYer' ); $( 'gHedef' ).textContent = `${ yerel( h, 'ad' ) } · ${ m }`;
			ok.style.visibility = 'visible'; ok.style.transform = `rotate(${ Math.atan2( h.e - _enu.e, h.n - _enu.n ) / DERECE - yon }deg)`;
		} else {
			$( 'gEtiket' ).textContent = t( 'geziBitti' ); $( 'gHedef' ).textContent = t( 'hepsiniGordun' ); ok.style.visibility = 'hidden';
		}
	}
	// görev paneli: takip edilen görevin koşulları ve ilk eksik koşul için ipucu
	const gs = geziGoster && gorev.takip ? gorev.sonuc : null;
	$( 'gorevPanel' ).classList.toggle( 'acik', !! gs );
	if ( gs ) {
		$( 'gpBaslik' ).textContent = t( 'gorevBaslik', yerel( gorev.takip, 'baslik' ) );
		$( 'gpKosul' ).replaceChildren( ...gs.kosullar.map( k => {
			const s = document.createElement( 'span' );
			s.className = k.ok ? 'ok' : 'yok'; s.textContent = ( k.ok ? '✓ ' : '✗ ' ) + t( k.ad );
			return s;
		} ) );
		const eksik = gs.kosullar.find( k => ! k.ok ), ip = $( 'gpIpucu' );
		ip.textContent = eksik ? eksik.ipucu + ( durum.kamera === 'takip' ? ' · ' + t( 'vIpucu' ) : '' ) : t( 'hazir' );
		ip.classList.toggle( 'hazir', ! eksik );
	}
	haritaCiz( yon * DERECE );
}

// ---------------------------------------------------------------- fotoğraf + poz (araştırma verisi için)
let fotoIstegi = false, kayitKlasoru = null, klasorSorma = true;
function indir( icerik, ad ) {
	const a = document.createElement( 'a' );
	a.href = typeof icerik === 'string' ? icerik : URL.createObjectURL( icerik ); a.download = ad;
	document.body.appendChild( a ); a.click(); a.remove();
	if ( typeof icerik !== 'string' ) setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
}
// Chrome/Edge: ilk fotoğrafta bir kayıt klasörü seçilir, sonraki fotoğraflar oraya sessizce yazılır.
// Diğer tarayıcılarda dosyalar indirilir.
async function fotoTusu() {
	if ( ! durum.hazir ) return;
	if ( klasorSorma && ! kayitKlasoru && window.showDirectoryPicker ) {
		klasorSorma = false;
		try {
			kayitKlasoru = await window.showDirectoryPicker( { id: 'mustafapasa-drone', mode: 'readwrite' } );
			mesajGoster( t( 'klasor', kayitKlasoru.name ) );
		} catch { kayitKlasoru = null; }
		tuslar.clear();
	}
	fotoIstegi = true;
}
async function klasoreYaz( ad, blob ) {
	const dosya = await kayitKlasoru.getFileHandle( ad, { create: true } );
	const yazici = await dosya.createWritable();
	await yazici.write( blob ); await yazici.close();
}
function fotoCek() {
	// fotoğrafta drone, gezi etiketleri ve görev işareti görünmez
	const gorunur = [ drone, golge, gezi.grup, gorev.isaret ].filter( o => o?.visible );
	for ( const o of gorunur ) o.visible = false;
	renderer.render( sahne, fpvKam );
	for ( const o of gorunur ) o.visible = true;
	const gorevMesaji = gorev.fotograf();
	const W = renderer.domElement.width, H = renderer.domElement.height;
	const dikeyFov = fpvKam.fov * DERECE, yatayFov = 2 * Math.atan( Math.tan( dikeyFov / 2 ) * fpvKam.aspect );
	const g = cografi( fpvKam.position, {} ), p = enu( fpvKam.position, {} );
	const zaman = new Date();
	const ad = 'mustafapasa_' + zaman.toISOString().replace( /[-:]/g, '' ).replace( 'T', '_' ).slice( 0, 15 );
	const poz = {
		zaman: zaman.toISOString(),
		kamera: {
			enlem: + ( g.lat / DERECE ).toFixed( 8 ), boylam: + ( g.lon / DERECE ).toFixed( 8 ), elipsoid_yuksekligi_m: + g.height.toFixed( 3 ),
			yerden_yukseklik_m: isFinite( durum.yerdenYukseklik ) ? + durum.yerdenYukseklik.toFixed( 2 ) : null,
			yon_derece_kuzeyden_saat_yonu: + yonDerece().toFixed( 2 ), gimbal_egim_derece: + ( durum.gimbal / DERECE ).toFixed( 2 ), yuvarlanma_derece: 0,
			yerel_enu_m: { dogu: + p.e.toFixed( 3 ), kuzey: + p.n.toFixed( 3 ), yukari: + ( fpvKam.position.y - cerceve.O.y ).toFixed( 3 ) },
		},
		goruntu: {
			genislik: W, yukseklik: H, yatay_fov_derece: + ( yatayFov / DERECE ).toFixed( 3 ), dikey_fov_derece: fpvKam.fov,
			fx: + ( W / 2 / Math.tan( yatayFov / 2 ) ).toFixed( 3 ), fy: + ( H / 2 / Math.tan( dikeyFov / 2 ) ).toFixed( 3 ), cx: W / 2, cy: H / 2,
		},
		yerel_cerceve: { origin_enlem: arazi.m.originLat, origin_boylam: arazi.m.originLon, origin_elipsoid_yuksekligi_m: arazi.m.originHeight },
		not: 'Görüntü, DJI Terra 3D Tiles modelinden gimbal kamerasıyla işlenmiştir (bozulmasız iğne deliği kamera).',
	};
	const jsonBlob = new Blob( [ JSON.stringify( poz, null, 2 ) ], { type: 'application/json' } );
	flasYap( 'rgba(255,255,255,.85)' );
	ses.bip( 1500, 0.06, 0.06 );
	if ( kayitKlasoru ) {
		const klasor = kayitKlasoru;
		renderer.domElement.toBlob( async png => {
			try {
				await klasoreYaz( ad + '.png', png ); await klasoreYaz( ad + '.json', jsonBlob );
				if ( ! gorevMesaji ) mesajGoster( t( 'kaydedildi', `${ klasor.name }/${ ad }.png` ) );
			} catch ( e ) {
				kayitKlasoru = null; mesajGoster( t( 'klasorHata' ), 'uyari' );
			}
		}, 'image/png' );
	} else {
		indir( renderer.domElement.toDataURL( 'image/png' ), ad + '.png' );
		indir( jsonBlob, ad + '.json' );
		if ( ! gorevMesaji ) mesajGoster( t( 'indirildi' ) );
	}
}

// ---------------------------------------------------------------- yardım ekranı
function basla() {
	yardimAcik = false;
	arayuz.yardim.classList.add( 'gizli' );
	ses.baslat();
	renderer.domElement.focus();
	if ( durum.hazir && durum.yerde ) mesajGoster( t( 'kalkisIcin' ) );
}
function dilDegistir( yeni ) {
	dil = yeni; guvenliYaz( 'mustafapasa-drone-dil', dil );
	dilUygula();
	$( 'kKamera' ).textContent = t( durum.kamera );
	gezi.dilYenile(); gorev.listeYaz();
	if ( ! yardimAcik ) mesajGoster( dil === 'tr' ? 'Türkçe' : 'English' );
}
function yardimAc() {
	yardimAcik = true; tuslar.clear();
	arayuz.yardim.classList.remove( 'gizli' );
}
$( 'basla' ).addEventListener( 'click', basla );
$( 'turBasla' ).addEventListener( 'click', () => tur.baslat() );
const kayitliKalite = guvenliOku( 'mustafapasa-drone-kalite' );
if ( kayitliKalite in AYAR.kalite ) $( 'kalite' ).value = kayitliKalite;
$( 'kalite' ).addEventListener( 'change', e => {
	guvenliYaz( 'mustafapasa-drone-kalite', e.target.value );
	if ( tiles ) kaliteUygula( e.target.value );
} );
$( 'sesAcik' ).addEventListener( 'change', e => ses.ac( e.target.checked ) );
$( 'pervaneAcik' ).checked = ses.pervane;
$( 'pervaneAcik' ).addEventListener( 'change', e => ses.pervaneAc( e.target.checked ) );
const kayitliMuzik = guvenliOku( 'mustafapasa-drone-muzik' );
if ( kayitliMuzik !== null ) $( 'muzikAcik' ).checked = kayitliMuzik === '1';
$( 'muzikAcik' ).addEventListener( 'change', e => guvenliYaz( 'mustafapasa-drone-muzik', e.target.checked ? '1' : '0' ) );
$( 'geziSifirla' ).addEventListener( 'click', () => gezi.sifirla() );
$( 'albumSifirla' ).addEventListener( 'click', () => gorev.sifirla() );
for ( const b of document.querySelectorAll( '#dilSec button' ) ) b.addEventListener( 'click', () => dilDegistir( b.dataset.dil ) );
dilUygula();

addEventListener( 'resize', () => {
	for ( const k of [ takipKam, fpvKam ] ) { k.aspect = innerWidth / innerHeight; k.updateProjectionMatrix(); }
	boyutAyarla();
	if ( tur.aktif && ! tur.kayitta ) { tur.kam.aspect = innerWidth / innerHeight; tur.kam.updateProjectionMatrix(); tur.katmanBoyutu(); }
} );

// ---------------------------------------------------------------- ana döngü
let oncekiZaman = performance.now(), panelZaman = 0, izZaman = 0, fps = 60;
function dongu() {
	const simdi = performance.now();
	const dt = Math.min( ( simdi - oncekiZaman ) / 1000, 0.05 );
	fps += ( 1 / Math.max( ( simdi - oncekiZaman ) / 1000, 1e-3 ) - fps ) * 0.05;
	oncekiZaman = simdi;
	if ( ! tiles ) return;

	if ( ! cerceve.hazir && tiles.root ) {
		if ( cerceveKur() ) {
			const h = arazi.yukseklik( 0, 0 );
			dunya( 0, 0, h, durum.pos );
			durum.ev = { e: 0, n: 0 };
			durum.yaw = Math.atan2( - cerceve.N.x, - cerceve.N.z );
			zemin.position.y = arazi.m.hMin - 14 - arazi.m.originHeight;
			araziOrtusuKur();
			gezi.kur();
			gorev.kur();
			durum.hazir = true;
			if ( ! yardimAcik ) mesajGoster( t( 'kalkisIcin' ) );
		}
	}

	girdiOku();
	if ( tur.aktif ) {
		tur.guncelle( simdi );
	} else if ( durum.hazir ) {
		fizik( dt );
		droneGorsel( dt, simdi );
		kameraGuncelle( dt );
		muzik.dinleyiciGuncelle( aktifKam );
		parkur.guncelle( simdi );
		gezi.guncelle( simdi );
		const gaz = durum.yerde ? 0 : THREE.MathUtils.clamp( 0.45 + durum.vel.y / 8 + Math.hypot( durum.vel.x, durum.vel.z ) / 40, 0, 1 );
		ses.guncelle( gaz, ! durum.yerde );
		if ( simdi - izZaman > 1000 && ! durum.yerde ) { izZaman = simdi; durum.iz.push( enu( durum.pos, {} ) ); if ( durum.iz.length > 600 ) durum.iz.shift(); }
	} else {
		takipKam.updateMatrixWorld();
		gok.position.copy( takipKam.position );
	}

	tiles.update();
	bvhIsle( 4 );
	renderer.render( sahne, aktifKam );
	if ( fotoIstegi && durum.hazir ) { fotoIstegi = false; fotoCek(); }

	if ( simdi - panelZaman > 100 ) {
		panelZaman = simdi;
		if ( durum.hazir && ! tur.aktif ) gorev.guncelle();
		panelGuncelle( simdi, fps ); muzik.guncelle();
	}
}

// ---------------------------------------------------------------- başlat
( async () => {
	try {
		const [ meta, tampon ] = await Promise.all( [
			fetch( AYAR.veri + 'arazi.json' ).then( r => { if ( ! r.ok ) throw new Error( r.status ); return r.json(); } ),
			fetch( AYAR.veri + 'arazi.bin' ).then( r => { if ( ! r.ok ) throw new Error( r.status ); return r.arrayBuffer(); } ),
		] );
		arazi = new Arazi( meta, tampon );
		haritaResim.src = AYAR.veri + 'harita.png';
		// gezi noktaları isteğe bağlı: dosya yoksa ya da bozuksa oyun gezisiz açılır
		gezi.veri = await fetch( AYAR.veri + 'noktalar.json' ).then( r => r.ok ? r.json() : null ).catch( () => null );
		tur.veri = await fetch( AYAR.veri + AYAR.tur ).then( r => r.ok ? r.json() : null ).catch( () => null );
		if ( tur.veri ) tur.hazirla();
	} catch ( e ) {
		hataGoster( t( 'veriHata', e.message ) );
		return;
	}
	tilesKur( arazi.m );
	renderer.setAnimationLoop( dongu );
} )();

// test ve hata ayıklama için
window.oyun = { durum, parkur, gezi, gorev, muzik, ses, tur, cerceve, get tiles() { return tiles; }, get arazi() { return arazi; }, dunya, enu, isin, THREE, renderer, draco, fpvKam, sahne,
	// döngüyü elle ilerletir (tarayıcı sekmesi arka plandayken denemek için)
	adim( n = 1 ) { for ( let i = 0; i < n; i ++ ) dongu(); },
	isinla( e, n, yerden = 20 ) { dunya( e, n, arazi.yukseklik( e, n ) + yerden, durum.pos ); durum.yerde = false; durum.vel.set( 0, 0, 0 ); durum.kamYerlesti = false; },
	// drone'u bir poza koy: elipsoid yüksekliği (m), yön (kuzeyden saat yönü) ve gimbal (derece)
	poz( e, n, yukseklik, yon = 0, gimbal = - 15 ) {
		dunya( e, n, yukseklik, durum.pos ); durum.yerde = false; durum.vel.set( 0, 0, 0 ); durum.kamYerlesti = false;
		const d = new THREE.Vector3().addScaledVector( cerceve.E, Math.sin( yon * DERECE ) ).addScaledVector( cerceve.N, Math.cos( yon * DERECE ) );
		durum.yaw = Math.atan2( - d.x, - d.z ); durum.gimbal = gimbal * DERECE;
	} };
