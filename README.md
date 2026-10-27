# Sinasos 3D: Mustafapaşa Drone (prototip)

Mustafapaşa (eski adı Sinasos, Ürgüp) üzerinde, DJI Terra'nın ürettiği fotogrametrik 3D Tiles modelinin üstünde tarayıcıda drone uçuşu.
Model, DJI Matrice 4E ile 20 Ekim 2026'da çekilen 6875 oblik fotoğraftan üretildi (yaklaşık 2 km², kot 1148 ile 1266 m arası).
Oyunda serbest uçuş, halka parkuru, simge yapıları anlatan bir gezi (müzik ve bilgi kartlarıyla), fotoğraf görevleri ve sinematik bir tur var.
Arayüz Türkçe ve İngilizce. Gimbal kamerasıyla çekilen fotoğraflar pozlarıyla (konum, yön, iç parametreler) kaydedildiği için araştırma verisi olarak da kullanılabilir.

three.js, 3d-tiles-renderer ve three-mesh-bvh ile yazıldı. Kütüphaneler `lib` klasöründe, internet gerekmez.

## Çalıştırma

1. Modeli yerine koy (bir kez): DJI Terra çıktısındaki `terra_b3dms` klasörü (4,6 GB, 18.900 dosya) bu klasörün içinde, `terra_b3dms/` adıyla durmalı. Model depoda yoktur (aşağıda "Model").
2. `BASLAT.bat` dosyasına çift tıkla. Python kurulu olmalı.
3. Tarayıcı `http://127.0.0.1:8000/` adresinde kendiliğinden açılır. Adresi elle yazarken de `localhost` yerine `127.0.0.1` kullan: Windows'ta localhost ile karolar çok daha yavaş gelebilir.
4. Pencereyi kapatınca sunucu da kapanır.

`index.html` dosyasını çift tıklayarak açmak işe yaramaz. Tarayıcı güvenlik nedeniyle karoları yüklemez, sunucu şart.

## Klasör yapısı

```
sinasos-3d/
├── index.html    arayüz
├── game.js       oyunun tamamı (tek modül)
├── sunucu.py     yerel web sunucusu
├── BASLAT.bat    Windows başlatıcı
├── data/         DEM'den üretilen 5 m ızgara: arazi.bin, arazi.json, harita.png; gezi noktaları ve fotoğraf görevleri: noktalar.json;
│                 sinematik tur: tur.json; görev deneme pozları: gorev_pozlari.json
├── muzik/        gezi ve tur müzikleri, künyeleri KUNYE.txt'de
├── araclar/      arazi_uret.py: data klasörünü başka bir uçuş için yeniden üretir; tur_uret.py: sinematik tur yolu; kayit_alici.py: video kaydı
├── video/        sinematik tur videoları ve OKUBENI (nasıl üretildiği); videolar depoda yok
├── lib/          three.js, 3d-tiles-renderer, three-mesh-bvh, Draco çözücü
└── terra_b3dms/  DJI Terra 3D Tiles modeli (depoda yok, .gitignore)
```

## Model

Model depoya konmaz: 4,6 GB ve araştırma verisi. Aslı Terra projesinin içinde durur:
`E:\photogrametry\2026-Matrice-4E\ucuslar\2026-10-20_mustafapasa\03_terra\sinasos-obliq\sinasos-obliq\models\pc\0\terra_b3dms`.
Bu klasördeki `terra_b3dms` onun 27 Ekim 2026'da alınmış kopyasıdır (dosya dosya SHA-256 ile doğrulandı). Kopyalamak için:

```
robocopy "E:\photogrametry\2026-Matrice-4E\ucuslar\2026-10-20_mustafapasa\03_terra\sinasos-obliq\sinasos-obliq\models\pc\0\terra_b3dms" "C:\d_surucusu\sinasos-3d\terra_b3dms" /E /R:1 /W:1 /MT:16 /NFL /NDL
```

Modeli başka bir yerden okutmak da mümkün: bu klasöre `model_yolu.txt` koyup ilk satırına model klasörünü yaz (`BASLAT.bat` olduğu gibi çalışır, sunucu penceresinde "Model buradan okunuyor: ..." yazar) ya da `python sunucu.py 8000 --model "KLASÖR"`. `model_yolu.txt` bilgisayara özgü olduğu için depoya girmez.

## Nasıl çalışıyor

- Model, `ReorientationPlugin` ile Mustafapaşa merkezine (38,58503 K, 34,89654 D, 1150 m elipsoid) taşınır. Sahnede Y yukarı, birimler metredir.
- Oyun açılınca drone köyün ortasında, Cami-i Kebir ile medresenin kuzeyinde (yerel 100 m doğu, 95 m güney), yerden 45 m yükseklikte havada ve güneye bakarak bekler; burası ev noktasıdır (`T` yeni bir bataryayla buraya döndürür). Yardım ekranı açıkken batarya harcanmaz. Konum `game.js`'te `AYAR.baslangic`. Halka parkuru eski ev noktasından (`AYAR.parkurMerkez`, yerel 0, 0) üretilmeye devam eder, böylece parkur ve kayıtlı en iyi süre değişmez.
- Çarpışma, yerden yükseklik ve iniş, yüklü karolara atılan ışınlarla (BVH hızlandırmalı) hesaplanır.
- `data/arazi.bin`, Terra'nın `terra_dem/dem.tif` dosyasından üretilen 5 m'lik yerel ENU ızgarasıdır: arazi yüksekliği (DTM), uçuş sınırı (kapsama alanının 25 m içi) ve kapsama maskesi. Mini harita ve halka yerleşimi de buradan gelir.
- `P` tuşu gimbal kamerasından PNG ve aynı ada sahip bir JSON üretir. Chrome ve Edge'de ilk seferde bir kayıt klasörü sorulur, sonraki fotoğraflar oraya sessizce yazılır. JSON'da kameranın enlem, boylam, elipsoid yüksekliği, yön, gimbal açısı ve iç parametreleri (fx, fy, cx, cy) bulunur. Fotoğrafta drone, gezi etiketleri ve görev vizörü görünmez.

## Dil

Oyun Türkçe ve İngilizce. Yardım ekranının sağ üstündeki TR / EN düğmeleri ya da uçarken `L` tuşu dili değiştirir; seçim hatırlanır. Arayüz yazıları `game.js` başındaki `METIN` sözlüğünde. Gezi kartlarının, müzik künyelerinin ve görevlerin İngilizcesi `data/noktalar.json`'da her kaydın `en` alt nesnesinde; sinematik turun yazıları `araclar/tur_uret.py` içindeki `INGILIZCE` tablosundan `tur.json`'a yazılır. İngilizce bir alan yoksa Türkçesi gösterilir.

## Sinasos gezisi

Turkuaz ışık sütunları ve etiketler Mustafapaşa'nın simge yapılarını gösterir. Bir yapının yanına (etiketteki yarıçap içine, yerden 90 m'nin altında) uçunca:
- solda yapının bilgi kartı açılır (`B` ile kapatılır),
- müzik zaten duyuluyordur: yapının ziyaret yarıçapının dört katından (en az 140 m) kısık başlar, yaklaştıkça yükselir, yarıçapın içinde tam sese ulaşır. Ses yapının bulunduğu yönden gelir (kameraya göre; kulaklıkla en iyi). Aynı anda yalnızca en yakın yapının müziği çalar, yapılar arasında yumuşak geçiş olur,
- yapı "ziyaret edildi" olarak işaretlenir; etiket altın rengine döner, ilerleme üstteki panelde ve yardım ekranında görünür (tarayıcıda saklanır).

Üst ortadaki panel en yakın gidilmemiş yere yön gösterir. `N` rehberi (panel, etiketler, ışıklar) açıp kapatır. Yardım ekranında "ziyaretleri sıfırla" bağlantısı var.

Müzik iki yoldan gelir. `data/noktalar.json` içindeki `muzikler` tablosunda bir temaya (`ilahi`, `konak`, `ney`) kayıt tanımlıysa o dosya döngüde çalar, `kunye` satırı bilgi kartının altında görünür. Tanımlı değilse ya da dosya açılamazsa Web Audio ile çalınan özgün kısa ezgiler devreye girer (game.js, `TEMALAR`). Tek bir yapıya ayrı kayıt koymak için o noktanın `muzik` alanına dosya yolunu yaz (ör. `"muzik": "muzik/kilise.mp3"`). Telif hakkı sende ya da serbest lisanslı olmalı; CC BY kayıtlarda künye zorunludur (`muzik/KUNYE.txt`).

Pervane uğultusu ayrı açılıp kapanır: uçarken `U` tuşu ya da yardım ekranındaki "Pervane sesi" kutusu (seçim hatırlanır). `M` bütün sesleri kapatır.

`data/noktalar.json` alanları: `id`, `ad`, `tur` (kilise, manastir, konak, universite, medrese, cami, vadi), `enlem`, `boylam`, `yaricap` (m), `alt` (dönem satırı), `metin` (paragraflar), `kaynak`, isteğe bağlı `muzik`, `duyma` (m, müziğin duyulmaya başladığı mesafe), `etiketYuksekligi` (m, varsayılan 40) ve `en` (İngilizce `ad`, `alt`, `metin`, `kaynak`).

## Fotoğraf görevleri (Sinasos albümü)

1924'te köy terk edilmeden önce fotoğraflatılıp bir albüm hazırlanmıştı; oyundaki görevler de bir albüm kurar. Yapıların çoğunun bir fotoğraf görevi var: belli bir şeyi belli bir yerden ve açıdan çekmek. Görevin yapısına yaklaşınca üstte görev paneli açılır: koşullar (mesafe, yön, açı, yükseklik, kadraj, görüş) yeşil ya da kırmızı görünür, altında eksik olan ilk koşul için bir ipucu yazar ("Batıdan çek", "Biraz yaklaş", "Gimbali aşağı indir (F)" gibi). Hedefte köşeli bir vizör durur; koşulların hepsi tamamsa vizör yeşile döner ve panel "Hazır: şimdi çek (P)" der. Görüntü gimbal kamerasından alındığı için `V` ile kamera görüntüsüne geçmek işi kolaylaştırır.

Tamamlanan görevin küçük bir kopyası albüme girer: bilgi kartında görevin altında ve yardım ekranındaki "Sinasos albümü" bölümünde görünür (tarayıcıda saklanır, "albümü sıfırla" ile silinir). Görevler:

| Yapı | Görev | Koşullar |
|---|---|---|
| Aziz Konstantin ve Eleni | Revaklı batı girişi | 12-60 m, batı-kuzeybatıdan (250-320°), gimbal -40 ile +10 arası |
| Şakir Paşa Medresesi | Anıtsal taç kapı | 10-60 m, batı yarıdan (190-340°), cami araya girmeden |
| Cami-i Kebir | Minare ve cami | minare ve çatı aynı karede, 25-150 m, gimbal -30 ile +15 arası |
| Cansever Konağı | Çokgen konağın avlusu | tam tepeden (gimbal -70 ile -90), 15-90 m |
| Eski Rum Evi | Cumbalı cephe | kuzeybatıdan (280-350°), 12-70 m, yerden en çok 30 m |
| Aziz Vasilios | Kanyondan Aziz Vasilios | güneybatıdan (185-240°), 50-260 m, yerden en çok 60 m |
| Aziz Nikolaos | Manastırın avlusu | yukarıdan (gimbal -45 ile -90), 15-110 m |
| (köy) | Sinasos'un tamamı | yerden en az 100 m, köy merkezine 300-1400 m, en az 5 gezi noktası kadrajda |

Görevler `data/noktalar.json`'daki `gorevler` listesinde; alanların anlamı aynı dosyadaki `gorevAciklama` satırında. Hedefler enlem, boylam ve elipsoid yüksekliğiyle verilir, modelde tepeden ve eğik görüntülerle bulundu. Görüş koşulu, kameradan hedefe bir ışın atar: ışın hedefe `tolerans` metreden daha uzakta bir yüzeye (ağaç, çatı) çarparsa "önü kapalı" sayılır.

Görevleri denemek: `data/gorev_pozlari.json` her görevi karşılaması beklenen sekiz kamera pozunu içerir. Oyunu `http://127.0.0.1:8000/?tur=gorev_pozlari.json` ile açıp konsolda:

```js
for ( let i = 0; i < 8; i ++ ) {
  await oyun.tur.kaydet( { bas: 0.2 * i + 0.08, son: 0.2 * i + 0.14, fps: 25, adres: 'http://127.0.0.1:8765/kaydet?klasor=gorev_test' } );
  const s = oyun.gorev.degerlendir( oyun.gorev.liste[ i ], oyun.tur.kam );
  console.log( oyun.gorev.liste[ i ].id, s.tamam, s.kosullar.filter( k => ! k.ok ).map( k => k.ad ) );
}
```

(kayıt alıcısı `python araclar/kayit_alici.py` açık olmalı; kareler `video/ham/gorev_test/` altına düşer). 27 Ekim 2026'da sekizi de tamam çıktı.

## Sinematik tur

Yardım ekranındaki "Sinematik tur" düğmesi ya da uçarken `C` tuşu, kamerayı 3:40 süren bir tura çıkarır: açılış, köy, simge yapılar, Beydere kanyonu, kuzey panoraması, Manastır Vadisi ve kapanış. Arayüz gizlenir, alt yazılar ve sinema şeritleri görünür (seçili dilde), Nomadic Camp (Sascha Ende, CC BY 4.0) çalar. `Esc` ya da `C` turu bitirir.

Kamera yolu `data/tur.json` dosyasındadır ve `araclar/tur_uret.py` ile üretilir. Tur, kesmelerle birbirine bağlanan planlardan oluşur; her planın süresi, lensi (görüş açısı) ve anahtar kareleri (zaman, kamera, bakılan nokta) vardır. Anahtar kareler yerden yükseklikle yazılır; betik bunları mutlak yüksekliğe çevirir, her planın hızını, araziye yakınlığını ve modelin içinde kalıp kalmadığını denetler. Alt yazılar, renk düzenlemesi (`renk`, CSS filtre dizgesi) ve vinyet de aynı dosyada. Betik istenen planlarla ayrı bir dosya da üretebilir (`python araclar/tur_uret.py tur_deneme.json kilise_tele cadde`); oyunda `?tur=tur_deneme.json` adres parametresiyle denenir.

Turu videoya kaydetmek için: `video/OKUBENI.txt`. Kayıt kare kare yapılır, her karede karolar tamamen yüklenene kadar beklenir; bu yüzden video makinenin hızından bağımsız olarak akıcı ve tam ayrıntılıdır.

Turda modelin dışı pus rengindedir. Fotogrametri modelindeki küçük delikler (dik kaya yüzleri) hem turda hem oyunda, DTM'den üretilmiş krem renkli bir arazi örtüsüyle kapanır.

## Başka bir uçuşa uyarlama

1. Yeni Terra çıktısındaki `terra_b3dms` klasörünü bu klasöre kopyala (ya da `model_yolu.txt` ile göster).
2. `pip install numpy pillow scipy pyproj` ile gerekli paketleri kur.
3. Bu klasörden, Terra çıktısındaki DEM dosyalarıyla: `python araclar/arazi_uret.py <terra_dem>/dem.tif <terra_dem>/dem.tfw <terra_dem>/tile.json data`
4. Yerel çerçeve `data/arazi.json` içindeki merkez koordinattan otomatik gelir. Başlangıç noktası (`AYAR.baslangic`), gezi noktaları, görevler ve tur bu köye özgüdür, yeniden yazılmalıdır.

## Ayarlar

`game.js` başındaki `AYAR` nesnesi: hız modları, batarya süresi, tavan yüksekliği, halka sayısı, parkur tohumu.
`AYAR.kalite`: her kalite düzeyi için karo ayrıntısı (`hata`, 3d-tiles-renderer errorTarget, çizim pikseli), karo önbelleği sınırı (`bellek`, GB) ve en yüksek piksel oranı (`piksel`).
Ultra, 12 GB ve üstü ekran kartları içindir (4K ekranda tam çözünürlük, en çok 6 GB önbellek). Maksimum, orta ve uzak mesafede bir seviye daha ince karo getirir (uzak görünümde ölçülen keskinlik yüzde 28-36 daha yüksek); karşılığı 1,8 kat karo, en çok 10 GB önbellek ve daha uzun ilk yükleme; 16 GB ekran kartı içindir. Yakın planda Ultra ile aynıdır, orada sınır modelin kendisidir. Seçilen kalite bir sonraki açılışta hatırlanır.
Karo geçişleri her ayarda 250 ms'lik solmayla yapılır (yeni karo birden "oturmaz"); fotoğraf ve video karesi alınırken geçişler önce tamamlanır.
Önbellek dolarsa sol üst panelde kırmızı "dolu, N karo bekliyor" uyarısı çıkar; o zaman kaliteyi bir düzey düşür.
Adres çubuğuna `?tileset=...` eklenerek farklı bir tileset denenebilir.
Ayarları ölçmek için `araclar/olcum.js` (konsoldan `const O = await import('./araclar/olcum.js')`; dosyanın başındaki açıklama). 27 Ekim 2026 ölçümleri ve önce/sonra kırpmaları `karsilastirma_20261027/` klasöründe.

## Lisanslar ve künyeler

- Kod (`game.js`, `index.html`, `sunucu.py`, `BASLAT.bat`, `araclar/`): MIT, `LICENSE`.
- İçerik (gezi ve görev metinleri, veriler, tur yolu, arazi verisi, görseller, belgeler): CC BY 4.0, kapsam ve atıf biçimi `LICENSE-ICERIK.md` içinde.
- Kütüphaneler (`lib/`): three.js (MIT), 3d-tiles-renderer (Apache 2.0), three-mesh-bvh (MIT), Draco çözücü (Apache 2.0); lisans metinleri `lib/` içinde.
- Müzikler: her kaydın kendi lisansı, `muzik/KUNYE.txt` (CC BY 4.0 ve kamu malı kayıtlar; CC BY kayıtlarda künye zorunlu).
- 3B model (`terra_b3dms`, depoda yok) ve ham uçuş verileri lisansa dahil değil.
- Gezi metinleri kaynaklardan derlendi, kaynakları her kartın altında ve `data/noktalar.json`'da.
