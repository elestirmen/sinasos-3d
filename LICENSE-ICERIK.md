# İçerik lisansı: CC BY 4.0

Bu depodaki **kod dışı içerik** Creative Commons Atıf 4.0 Uluslararası (CC BY 4.0) lisansıyla sunulur:
https://creativecommons.org/licenses/by/4.0/deed.tr (lisans metni: https://creativecommons.org/licenses/by/4.0/legalcode)

Telif hakkı (c) 2026 Ahmet Ertuğrul Arık, Kapadokya Üniversitesi.

## Kapsam

- Sinasos gezisinin bilgi kartı metinleri, karşılama metni ve fotoğraf görevi metinleri (Türkçe ve İngilizce), `data/noktalar.json`
- Gezi noktalarının ve görev hedeflerinin konumları, sinematik tur kamera yolu ve alt yazıları (`data/tur*.json`, `data/gorev_pozlari.json`)
- Arazi verisi ve mini harita (`data/arazi.bin`, `data/arazi.json`, `data/harita.png`); DJI Matrice 4E ile 20 Ekim 2026'da yapılan uçuşun DJI Terra'da işlenmiş sayısal arazi modelinden üretildi
- Görseller (`karsilastirma_20261026/*.jpg`, `video/*.jpg`) ve belgeler (`README.md`, `*.txt`, `*.md`)

## Kapsam dışı

- Kod: `game.js`, `index.html`, `sunucu.py`, `BASLAT.bat`, `araclar/` (MIT, bkz. `LICENSE`)
- Üçüncü taraf kütüphaneler: `lib/` (three.js MIT, 3d-tiles-renderer Apache 2.0, three-mesh-bvh MIT, Draco Apache 2.0; lisans metinleri `lib/` içinde)
- Ses kayıtları: `muzik/` (her kaydın kendi lisansı ve künyesi `muzik/KUNYE.txt` dosyasında; CC BY kayıtlarda künye zorunlu)
- Fotogrametrik 3B model (`terra_b3dms/`, depoda yok) ve ham uçuş verileri: bu lisansa dahil değildir, ayrıca izin gerekir
- Gezi metinlerinde kaynak gösterilerek aktarılan bilgiler ve alıntılar (Rumca kitabe çevirileri gibi) ilgili kaynaklara aittir; kaynaklar her kartın altında ve `data/noktalar.json` içinde yazılıdır

## Atıf

İçeriği kullanırken şu biçimde atıf yeterlidir:

> Sinasos 3D (Mustafapaşa Drone), Ahmet Ertuğrul Arık, Kapadokya Üniversitesi, 2026. CC BY 4.0. https://github.com/elestirmen/sinasos-3d

Türetilmiş çalışmalarda yapılan değişiklikler belirtilmelidir.
