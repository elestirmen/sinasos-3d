# Mustafapaşa Drone: proje notları

Bu dosya, projeyi devralan Claude Code oturumu için hazırlandı. Kullanıcıyla Türkçe, açıklayıcı ve doğal bir dille konuş. Uzun tire (em dash) kullanma.

## Proje nedir

DJI Terra'nın Mustafapaşa (Sinasos, Ürgüp) için ürettiği fotogrametrik 3B modelin üzerinde tarayıcıda oynanan bir drone uçuş oyunu (prototip).
Veri: DJI Matrice 4E, 6875 oblik fotoğraf, 20 Ekim 2026 uçuşu. Model yaklaşık 2 km², kot 1148 ile 1266 m arası.
Kullanıcı bir akademisyen (uzaktan algılama, GNSS'siz İHA konumlandırma). Oyun eğlence amaçlı, ama P tuşuyla alınan pozlu görüntüler araştırma verisi olarak da kullanılabilir.

## Klasör yapısı

27 Ekim 2026'dan beri proje `C:\d_surucusu\sinasos-3d` klasöründe ve bir git deposu (GitHub hesabı `elestirmen`). Önceden Terra projesinin
içindeki `E:\photogrametry\2026-Matrice-4E\ucuslar\2026-10-20_mustafapasa\03_terra\sinasos-obliq\sinasos-obliq\models\pc\0\oyun` klasöründeydi;
kullanıcının isteğiyle taşındı (dosyalar SHA-256 ile doğrulandı). Eski `oyun` klasörü (aynı içerik) silinme onayı bekliyor; yanında `OKUBENI_oyun_tasindi.txt` var. Claude onu silmedi (otomatik izin reddetti).

```
sinasos-3d/
├── index.html     arayüz, CSS, import map
├── game.js        oyunun tamamı (tek modül)
├── sunucu.py      yerel sunucu (bu klasörü yayınlar, MIME türlerini sabitler; --model / model_yolu.txt ile model başka yerden)
├── BASLAT.bat     Windows başlatıcı: python sunucu.py 8000
├── data/          arazi.bin, arazi.json, harita.png (DEM'den üretildi); noktalar.json (gezi + görevler, TR/EN);
│                  tur.json (sinematik tur); gorev_pozlari.json (görev deneme pozları)
├── araclar/       arazi_uret.py (data/ üretir), tur_uret.py (tur.json), kayit_alici.py (video kaydı)
├── muzik/, video/ (videolar ve video/ham depoda yok), karsilastirma_20261026/
├── lib/           three 0.186.1, 3d-tiles-renderer 0.5.3, three-mesh-bvh 0.9.16, Draco çözücü (npm yok, dosyalar kopyalandı)
└── terra_b3dms/   modelin kopyası (4,58 GB, 18.900 dosya; .gitignore). Aslı Terra projesinde (models/pc/0/terra_b3dms), ona DOKUNMA.
```

Terra çıktısının geri kalanı (terra_dem: dem.tif 0,5 m, UTM 36N, aslında çıplak arazi DTM; terra_ply, terra_las_1_4 ...) Terra projesinde kaldı;
oyun çalışırken gerekmez, yalnız `araclar/arazi_uret.py` DEM'i okur.

Çalıştırma: `python sunucu.py 8000` sonra `http://127.0.0.1:8000/` (localhost değil, aşağıdaki sunucu notuna bak). index.html dosya olarak açılırsa çalışmaz.
localStorage kökene bağlı (http://127.0.0.1:8000); taşınmadan önceki ziyaretler, albüm ve ayarlar aynı adreste korunur.

## Mimari

- Tileset: `./terra_b3dms/tileset.json`. Kök tileset 32 blok içerir. Blok kökleri ENU dönüşüm matrisi taşır, `gltfUpAxis: Z`, `asset.version: 0.0`.
- Karolar b3dm: Draco sıkıştırma, WebP dokular (EXT_texture_webp bildirmeden), KHR_materials_unlit (MeshBasicMaterial olarak açılıyor). Hepsi çalışıyor.
- Terra'ya özgü bir tuhaflık: harici tileset'e (.json) bağlanan karoların geometricError değeri 1e10. Testlerde sorun çıkarmadı.
- `GLTFExtensionsPlugin` (Draco) ve `ReorientationPlugin({ lat, lon, height: 1150, recenter: true })` kullanılıyor. Orijin 38.58502804 K, 34.89653507 D, 1150 m elipsoid (değerler data/arazi.json içinde).
- Sahne çerçevesi: Y yukarı, birim metre. Doğu = -X, Kuzey = +Z (çalışırken `cerceveKur()` ile hesaplanıyor, `cerceve.E` ve `cerceve.N`).
- DEM ile mesh aynı yükseklik sisteminde. Ev noktasında DTM 1190,97 m, mesh 1192,29 m.
- `data/arazi.bin`: yerel ENU ızgarası, 5 m hücre, satır 0 = güney. Sırasıyla uint16 yükseklik (dm, hBase üzerine, 65535 = veri yok), uint8 uçuş sınırı, uint8 kapsama. Meta veriler arazi.json'da.
- Fizik `fizik(dt)` içinde: hedef hıza üstel yaklaşma; Cine, Normal, Spor modları 4, 12 ve 21 m/s. Çarpışma, yük ve iniş, yüklü karolara atılan ışınlarla (`isin()`, three-mesh-bvh ile; BVH'ler `bvhKuyrugu` ile kare başına 4 ms bütçeyle kuruluyor). Uçuş sınırı ve 150 m tavan DTM'den.
- Kameralar: `takipKam` (takip) ve `fpvKam` (gimbal). TilesRenderer'a yalnızca aktif kamera kayıtlı.
- Parkur: tohumlu rastgele 10 halka (`parkur` nesnesi), en iyi süre localStorage'da.
- Fotoğraf: `fotoCek()` gimbal kamerasından PNG ve poz JSON'u yazıyor (enlem, boylam, elipsoid yüksekliği, yön, gimbal açısı, fx, fy, cx, cy). Chrome ve Edge'de showDirectoryPicker ile klasöre yazıyor, diğer tarayıcılarda indiriyor.
- Hata ayıklama için `window.oyun` açık: durum, parkur, gezi, gorev, muzik, ses, tur, tiles, arazi, isin, dunya, enu, THREE, renderer, sahne, fpvKam, draco,
  isinla(e, n, yerden), poz(e, n, elipsoidYuksekligi, yonDerece, gimbalDerece) ve adim(n) (döngüyü elle ilerletir; panel gizliyken rAF durduğu için).
- Gezi (27 Ekim): `gezi` nesnesi `data/noktalar.json`'daki simge yapıları sahneye etiket (Sprite, sizeAttenuation kapalı, depthTest kapalı) ve ışık sütunu olarak koyar; çakışan etiketler `etiketDuzenle()` ile noktaya iner. Yarıçap içinde ve yerden 90 m altında `var()`: bilgi kartı (`#bilgiKart`), müzik, ziyaret kaydı (localStorage `mustafapasa-drone-ziyaret`). Konumlar OSM'den, ENU'ya `tiles.ellipsoid` ile çevriliyor. Tuşlar: N rehber, B kart.
- Gezi içeriği (`data/noktalar.json`, 27 Ekim): karşılama kartı (`giris`, ilk kalkışta bir kez, ev noktasından 150 m uzaklaşınca kapanır, ziyarete sayılmaz) ve 8 nokta: Aziz Konstantin ve Eleni Kilisesi, Mehmet Şakir Paşa Medresesi, Cami-i Kebir, Kapadokya Üniversitesi (Cansever Konağı + Oktay Sinanoğlu Binası), Sinasos Konakları (Temel Öztürk Konağı / Old Greek House noktasında; Serafim Konağı kitabesi), Aziz Vasilios Kilisesi, Aziz Stefanos Şapeli (OSM'deki "Ayos Stepanos"; Cemil'deki değil), Aziz Nikolaos Manastırı (uçuş sınırının 25 m dışında, yarıçap 45 m ile erişilir). Konumlar modelde tepeden bakılarak doğrulandı. Metinlerin ana kaynakları: Pekak 2009 (Hacettepe Üniv. Edebiyat Fak. Dergisi 26/1) ve Kapadokya Üniversitesi'nin mustafapasakapadokya.org envanteri; çelişkili bilgiler (Vasilios için 11./12. yy, medrese için 1890, "Atatürk" ad açıklaması, manastır için 10. yy) bilerek alınmadı. Cansever ve Sinanoğlu bilgisi tek kaynaklı; kullanıcı Kapadokya Üniversitesi'nde, gözden geçirmesi istendi. Kullanıcı 27 Ekim'de kendi tarayıcısında denedi, müziği ve kartları beğendi (metinlerin tek tek içerik kontrolünü yaptığını ayrıca söylemedi). Kendi müzik kaydı: `muzik/` + noktanın `muzik` alanı (test edildi).
- Müzik: `muzik` nesnesi Web Audio ile makam aralıklı (sent) özgün ezgiler çalar (`TEMALAR`: ilahi/Hicaz koro + ison, konak/Uşşak mızrap + sofyan def, ney/Rast). Türe göre seçilir (`TUR_TEMA`); noktanın `muzik` alanı ses dosyası yolu olabilir. Temaların ölçülen RMS'i yaklaşık 0,04 olacak şekilde `hacim` ayarlı. `ses.acik` (M) ve `#muzikAcik` kutusu kapatır.
- Gerçek müzik kayıtları (27 Ekim): `noktalar.json` içinde `muzikler` tablosu (tema başına `dosya`, `hacim`, `kunye`; künye kartta `#bMuzik`). İndirilenler: `muzik/ilahi_byzantine_chant_rtb45.mp3` (Freesound RTB45, CC BY 4.0, konser kaydı, icracı izni gri alan) ve `muzik/konak_huseyni_saz_semaisi.ogg` (Commons, kamu malı). Ney (Sousinak Taxim 1928) ve karşılama (Aravisos/Yoldjoglou 1927) Gallica'da; Gallica Cloudflare doğrulaması arkasında olduğu için Claude indiremedi, kullanıcı elle indirecek (adlar ve bağlantılar `muzik/KUNYE.txt`). Dosya yoksa üretilen ezgiye döner, karşılamada susar. Kullanıcı ezan ya da tilavet istemedi, kullanılmamalı.
- Konumsal müzik (27 Ekim): `muzik.kazanc` → `PannerNode` (HRTF, inverse, refDistance = yapının yarıçapı) → çıkış; dinleyici her karede aktif kamera (`muzik.dinleyiciGuncelle`). Gezi `muzikSec()` ile en yakın, duyulabilen yapıyı seçer (duyma = max(140, 4 x yarıçap); 15 m eşik), `kenar` ile sınırda söndürür ve `muzik.hedefle(kaynak)` der; kaynak değişince `muzik.guncelle` önce söndürür sonra başlatır. Karşılama kaydı yönsüz (dinleyicinin önünde). Ölçüm: kilisenin 60 m batısında kuzeye bakınca sağ/sol RMS 2,4, güneye bakınca 0,58; 70, 40 ve 10 m'de düzey 0,011, 0,022, 0,042.
- Sinematik tur (27 Ekim): `tur` nesnesi, `data/tur.json` (üreten: `araclar/tur_uret.py`, 29 anahtar kare, 189,4 sn = Hüseyni Saz Semaisi süresi, en az 31,8 m DTM açıklığı). Kamera `tur.kam`, düzensiz aralıklı Catmull-Rom (Hermite) ile; yazılar, şeritler ve kararma `tur.ciz()` ile 2B tuvale (`#turKatman` ya da kayıt tuvali). Turda `zemin` gizli, sis 650/2600. C tuşu / `#turBasla`; `tur.sabitT` ile yol dondurulup açılar denetlenebilir.
- Tur v2 (27 Ekim, kullanıcı ilk videoyu 'müzik eski, çekimler daha iyi olabilir' diye buldu): plan tabanlı kurgu (`cekimler`: sure, fov, karart, kareler; `tur.hazirla()` başlangıçları hesaplar, `tur.cekim(t)`), plan başına lens (tele 26-34, geniş 60-64), tepeden dönen plan (bakış noktası 1 m kaydırılıp döndürülür), hareket bulanıklığı (`kaydet({ bulanik: 4 })`, 180 derece kapak, kesmeyi aşmaz), renk `contrast(1.08) saturate(1.15) sepia(0.06) brightness(1.03)` ve vinyet 0,35. Fotogrametri modelinde dik kaya duvarları (kanyon, kilise arkası) delikli; alçak ve yakın planlar bunları gösteriyor, kanyon planı ağzın ~20 m üstüne alındı. Deneme klibi `video/deneme_yeni_cekimler.mp4` (48 sn, müziksiz).
- Tur v2 son hali (27 Ekim): kullanıcı müzik olarak Nomadic Camp'i (Sascha Ende, ende.app, CC BY 4.0, 3:40) seçti (önceki adaylar Scott Buckley parçaları ona "aşırı epik" geldi). Dosya sayfadaki 128 kbps oynatıcı MP3'ü (`muzik/nomadic_camp_sascha_ende.mp3`); yüksek kaliteli sürüm ziyaretçi doğrulamalı indirme penceresinde, Claude onu atlatmaya çalışmadı. Ses zarfı ve vuruş analizi: ~95,7 BPM, ölçü 2,508 sn, ilk ölçü başı 1,947 sn; bölümler 22,0 / 47,1 / 144,9 / 165,0 / 205,1 / 210,1 sn. `tur_uret.py` içinde `MUZIK` ve `KURGU` (23 plan, ölçü sayılarıyla) kesmeleri ölçü başlarına oturtur; `data/tur.json` artık v2, eskisi `data/tur_v1.json`. Video: `video/mustafapasa_sinematik_tur_v2.mp4`. Gizli panelde kayıt saniyede ~2,6 kareye düşüyor (açıkken ~11).
  Kayıt ara dosyaları (`video/ham/` 2,6 GB: tur2_*.h264, deneme_*.h264, önizleme kareleri; Claude'un geçici klasöründe 2,0 GB) kullanıcının isteğiyle şimdilik duruyor (27 Ekim); silmeden önce sor.
  Görev hedeflerini bulurken alınan deneme kareleri de orada: `video/ham/gorev_tepe`, `gorev_egik`, `gorev_test` (29 MB, uzantısız JPEG).
  Tur dosyasına `"ham": true` yazılırsa `tur.ciz()` şerit, yazı ve kararma çizmez (deneme pozları için).
- Video kaydı: `tur.kaydet({ bicim: 'h264' | 'jpeg', bas, son, fps, w, h, hata })`. Animasyon döngüsünü durdurur, `Scheduler.setXRSession()` ile kütüphanenin kuyruklarını `MessageChannel` tabanlı `hemen()`e bağlar (gizli panelde setTimeout saniyede bire kısılıyordu), her karede art arda iki boş güncellemeye kadar yükleme bekler, WebCodecs donanım H.264 (Annex B, 40 Mbps) ile kodlayıp `araclar/kayit_alici.py`'ye (`/ekle`) gönderir. Ölçümler: tarayıcı JPEG toBlob kare başına ~840 ms, ham RGBA gönderimi ~350 ms, WebCodecs ile 5682 kare 227 sn. Çıktı `video/mustafapasa_sinematik_tur.mp4` (x264 CRF 19, AAC, 571 MB). Panel gizliyken sayfa hiç kare çizmezse kaydet() ilk kurulumu `dongu()`yu elle çağırarak yapar.
- Arazi örtüsü (`araziOrtusuKur()`): arazi.bin'den modelin 3 m altında, krem renkli, gölgelendirilmiş ızgara; model deliklerini kapatır, çarpışmaya girmez.
- Pervane sesi (27 Ekim): `ses.pervane`, `U` tuşu ve `#pervaneAcik` kutusu, localStorage `mustafapasa-drone-pervane`. Kullanıcı uğultuyu rahatsız edici buldu; süzgeç 520 Hz, kazanç 0,025'e indirildi.
- Fotoğraf görevleri / Sinasos albümü (27 Ekim, kullanıcı istedi): `gorev` nesnesi, veri `noktalar.json` "gorevler" (alan açıklaması dosyadaki
  "gorevAciklama"da). 8 görev: kilisenin revaklı batı girişi (narteks), medresenin taç kapısı, minare + cami, Cansever Konağı avlusu tepeden,
  Eski Rum Evi'nin cumbalı KB cephesi, kanyondan Aziz Vasilios (GB), Nikolaos avlusu yukarıdan, köy panoraması (yerden >= 100 m, en az 5 gezi
  noktası kadrajda). Stefanos'a görev yok (şapelin kapısı modelde seçilemiyor). Hedefler modelde tepeden ve eğik pozlarla bulundu (piksel ->
  ENU -> enlem/boylam, mutlak elipsoid yüksekliği). Koşullar gimbal kamerasına göre: mesafe, kerteriz (hedeften kameraya), gimbal eğimi,
  yerden yükseklik, kadraj (NDC), görüş ışını (`isin`, tolerans m) ve enAzNokta. `gorev.guncelle()` panel döngüsünde (10 Hz) takip edilen görevi
  seçer (bulunulan yapının görevi, yoksa hedefi yakın olan; panorama yerden 60 m üstünde), `#gorevPanel`de koşullar ve ilk eksik koşulun ipucu,
  hedefte köşeli vizör (yeşil = hazır). `fotoCek()` gezi etiketlerini ve vizörü gizleyip çizer, sonra `gorev.fotograf()`: görev tamamlanırsa
  320 px JPEG küçük resim localStorage `mustafapasa-drone-album`a (~38 KB/görev), kartta (`#bGorev`) ve yardım ekranındaki albümde görünür;
  olmazsa hedef kadrajdaysa ipucu mesajı. Sınama: 8 doğru pozun hepsi tamam, 7 yanlış pozda doğru ipucu (`data/gorev_pozlari.json`, README.md).
  Medrese pozu minare görevini de karşılıyor (iki görev birden, mesajda "A + B").
- İki dil (27 Ekim, kullanıcı: Türkçe ve İngilizce, Rumca yok): `METIN.tr/en` sözlüğü ve `t(anahtar, ...)` game.js başında; index.html'de
  `data-t` (metin) ve `data-h` (kbd içeren HTML) anahtarları `dilUygula()` ile dolar. JSON yazıları `yerel(nesne, alan)`: Türkçesi ana alanda,
  İngilizcesi `en` alt nesnesinde (noktalar, giris, muzikler.kunye, gorevler; tur.json yazıları `tur_uret.py`deki `INGILIZCE` tablosundan).
  Seçim: yardım ekranında TR/EN düğmeleri ya da `L` tuşu, localStorage `mustafapasa-drone-dil` (varsayılan tr). Açık kart dil değişince yerinde yenilenir.
  Araştırma JSON'unun alan adları Türkçe kaldı. İngilizce metinler Claude'un çevirisi; kullanıcı gözden geçirmedi.
- Düzeltilen hata (27 Ekim): konumsal müzik eklenirken `nokta.kaynak` müzik nesnesiyle ezilmişti, kartın kaynakça satırı "[object Object]"
  yazıyordu. Müzik kaynağı artık `nokta.sesKaynak`; açılamayan müzik dosyaları `muzik.bozuk`ta, künyeleri gösterilmez.
- Model yeri (27 Ekim): proje C: sürücüsüne taşınırken model de `terra_b3dms/` altına kopyalandı (E: USB HDD'den soğuk okuma ~26 MB/s idi).
  `sunucu.py --model KLASÖR` ya da proje klasöründe `model_yolu.txt` (ilk satır klasör) varsa `/terra_b3dms/` istekleri oradan karşılanır
  (`translate_path`); sahte klasörle denendi (tileset ve alt klasör oradan, oyun dosyaları yerinden, `..` kaçışı 404).
- Kullanıcının bilgisayarı: RTX 5060 Ti 16 GB, 64 GB RAM, 24 çekirdek, 4K monitör (%175 ölçek, 59 Hz). Model C: sürücüsünde (taşınmadan önce E:, USB harici HDD).
- Git (27 Ekim): depo kökü bu klasör, uzak depo `origin` = https://github.com/elestirmen/sinasos-3d (özel; kullanıcı açtı, GitHub Apache 2.0
  `LICENSE` ile "Initial commit" ekledi, yerel commit'ler onun üzerine alındı). Claude'un `git push`u otomatik izin denetiminde beş kez
  reddedildi (kullanıcı izin verdiğini söyledikten sonra da); gönderimi kullanıcı kendi terminalinden yapıyor.
  Lisans (27 Ekim, kullanıcı kararı): kod MIT (`LICENSE`), içerik CC BY 4.0 (`LICENSE-ICERIK.md`); GitHub'ın koyduğu Apache 2.0 metni MIT ile
  değiştirildi. Kütüphaneler ve müzikler kendi lisanslarında, model ve ham veri lisans dışı. Depoya girmeyenler `.gitignore`da: terra_b3dms/, model_yolu.txt, video/*.mp4, video/ham/, __pycache__.
  Commit mesajlarının sonuna `Co-Authored-By: Claude ...` satırı eklenir. Byzantine Chant kaydında icracı izni gri alan (muzik/KUNYE.txt):
  depo herkese açılacaksa önce kullanıcıya sor.

## ÇÖZÜLDÜ (26 Ekim 2026): model kaba, düşük poligonlu görünüyordu

Teşhis (yerel bilgisayar, RTX 5060 Ti, ekran ölçeği %175, tarayıcı paneli 1024x768):
- **LRU önbelleği sorun değildi.** Eski ayarlarla (errorTarget 8, 0,5/0,8 GB) dört test noktasında ve modeli boydan boya geçen 31 noktalık uçuşta `stats.refused` hep 0 kaldı; kullanılan karolar en fazla 191 MB, önbellek 0,5 GB'ta dengeleniyordu.
- **Asıl neden LOD seçimi.** Terra'nın geometricError değerleri küçük (blok kökü L13 yaklaşık 8 m, L17 0,45 m, L19 0,1 m, L20 0,045 m, L21 0,028 m). errorTarget 8 ve CSS çözünürlüğüyle (1024x768; tuval ise 1536x1152 çiziliyor) yakın planda bile çoğunlukla L14 ile L18 seçiliyordu.
- Önbellek ancak ayrıntı artırılınca önem kazanıyor: errorTarget 2 ile 4K tam ekranda kullanılan karolar 1,06 GB'a çıkıyor. Sınır 0,8 GB kalsaydı karolar reddedilip görüntü kaba seviyede takılırdı.

Yapılanlar (game.js, index.html):
- `AYAR.kalite` artık `{ hata, bellek, piksel }`: Düşük 6 / 1 GB, Orta 3 / 2 GB, Yüksek 2 / 3 GB (üçü de piksel oranı en çok 1,5), Ultra 1 / 6 GB / piksel oranı en çok 2 (4K %175 ekranda tam çözünürlük). errorTarget çizim pikseli cinsinden. `kaliteUygula()` errorTarget, LRU sınırı (min = 0,6 x max) ve piksel oranını birlikte ayarlıyor; `boyutAyarla()` resize'da da çağrılıyor. Seçilen kalite localStorage'da (`mustafapasa-drone-kalite`).
- `cozunurlukAyarla()`: `tiles.setResolution(kamera, renderer.getDrawingBufferSize())`; tilesKur, kamera değişimi ve resize'da çağrılıyor. Resize'da piksel oranı da yenileniyor.
- Karo dokularına anizotropik süzme (`getMaxAnisotropy()`, load-model içinde); eğik bakışta zemin dokusu netleşiyor.
- Sol üst panelde `#bellekYazi`: önbellek doluluğu ve reddedilen karo varsa "dolu, N karo bekliyor" uyarısı (kırmızı).

Ölçümler (4K tam ekranı taklit eden 2194x1150 CSS, 31 noktalık uçuş, 1,5 sn'de 40 m sıçrayarak): Orta en fazla 0,62 GB kullanılan, Yüksek 1,06 GB, Ultra (3839x2012 çizim pikseli) 4,25 GB; hepsinde reddedilen karo 0.
GPU süresi (EXT_disjoint_timer_query ile, 4K): Orta yaklaşık 3 ms, Yüksek 3,7-4 ms, Ultra 4,8-6 ms (yüzde 95'lik dilim 7,6 ms) kare başına. Ekran kartı Ultra'da bile 120 FPS'in üstünü kaldırır.
Yakın planda (yerden 10 m) Orta, Yüksek ve Ultra neredeyse aynı: orada zaten L21 yüklü, tavan modelin kendi çözünürlüğü. Ultra'nın farkı orta ve uzak mesafede.
Önce/sonra görüntüleri: `karsilastirma_20261026/` (A-D noktaları, üstte tam kare, altta yakın plan).
Not: 27 Ekim gece yarısından sonra panel saniyede 0,5 kare çizdi (ana iş parçacığı boş, GPU kare başına 3-7 ms); ekran kilitliyken ya da uzak masaüstü küçültülmüşken Windows çizimi kısıyor olmalı. Testlerde sabit süre yerine `renderer.info.render.frame` ile kare sayısı beklenmeli.
USB HDD'den soğuk okuma saniyede ~119 karo (26 MB/s), önbellekten 8.800; ilk kez gidilen bölgelerde yükleme bu yüzden yavaş. Gerekirse sunucu açılışta karoları okuyup Windows önbelleğine alabilir (yapılmadı).
Not: tarayıcı paneli kareyi en çok yaklaşık 32 FPS çiziyor (bilgisayarda 32 Hz'lik bir Microsoft Remote Display Adapter var, sınır büyük olasılıkla o) ve gizliyken hiç çizmiyor.

Sunucu (sunucu.py) yavaşlığı, aynı gün düzeltildi: `localhost` üzerinden saniyede yalnızca 19 karo geliyordu (127.0.0.1 ile 822). Windows'ta tarayıcı localhost için önce IPv6 (::1) deniyor, sunucu yalnızca 127.0.0.1 dinliyor ve HTTP/1.0 her karo için yeni bağlantı açtığından her istek yaklaşık 0,3 sn bekliyordu. Disk (USB HDD) darboğaz değildi. Düzeltme: `protocol_version = 'HTTP/1.1'` (bağlantı yeniden kullanımı; localhost'ta bile saniyede 441 karo) ve tarayıcı `http://127.0.0.1:<port>/` ile açılıyor (taşınmadan önce `/oyun/`). Ultra'da yükleme süreleri 29,7 / 9,4 / 13,9 sn'den 6,0 / 1,6 / 3,6 sn'ye indi (A, B, C). Not: localStorage adrese bağlı, localhost'ta kayıtlı en iyi parkur süresi 127.0.0.1'de görünmez.

Kuyruk ayarları denendi, eklenmedi: sunucu düzeltildikten sonra Ultra uçuşunda çözme kuyruğunda 320 karo birikiyor, ama `parseQueue.maxJobs` 16 ve Draco işçisi 8 yapılınca uçuş boyunca ortalama yüklü oran değişmedi (0,744 ve 0,743, her deneme sayfa yenilenerek).

Kalan fikirler: LOD geçişleri için `TilesFadePlugin`; bellek dolarsa errorTarget'ı kendiliğinden artıran bir koruma.

## Test edilenler (bulutta, modelin bir kısmıyla, SwiftShader ile)

Karo yükleme, Draco ve WebP, kalkış ve iniş, engelden geçmeme, uçuş sınırı, parkur sayımı, fotoğraf ve JSON (klasör ve indirme yolları), batarya bitince zorunlu iniş.
Test edilmedi: gerçek ekran kartında tam modelle performans ve oyun kumandası (Gamepad API, Mod 2 eşlemesi yazıldı).
26 Ekim: yerel bilgisayarda (RTX 5060 Ti) Claude'un tarayıcı panelinde tam modelle karo yükleme ve bellek ölçüldü (yukarıdaki ÇÖZÜLDÜ bölümü). FPS orada ölçülemedi.
Yerel test için `.claude/launch.json` içinde "oyun" ayarı var: sunucu.py'yi tarayıcı açtırmadan çalıştırır (8000 doluysa 8001'e geçer).

## Kullanıcının olası sonraki istekleri

27 Ekim: kullanıcı "şimdilik sadece oyun tarafına odaklanalım" dedi. Bekleyenler: görevlerin ve İngilizce metinlerin kullanıcının kendi
tarayıcısında denenmesi.
Diğer olasılıklar: gezi içeriğinin genişletilmesi (yeni noktalar, kullanıcının kendi müzik kayıtları), yeni görevler, uçuş hissinin ayarı,
gerçek zamanlı ışık ve gölge, araştırma için toplu pozlu görüntü üretimi.
Gaussian Splatting: kullanıcının Terra lisansında yok (27 Ekim), önerme.
