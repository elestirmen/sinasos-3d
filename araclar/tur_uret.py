# Sinematik tur kamera yolunu üretir: data/tur.json (ya da verilen ad)
# Tur, kesmelerle birbirine bağlanan planlardan oluşur. Her planın süresi, lensi (dikey görüş açısı) ve kendi
# anahtar kareleri vardır; anahtar kareler yerden yükseklikle (DTM'nin 25 m çevresindeki en yüksek noktası +
# yükseklik) yazılır, betik mutlak elipsoid yüksekliğine çevirir ve her planı denetler (hız, araziye uzaklık,
# kapsama). Plan süreleri müziğin bölümlerine göre SURELER ile ölçeklenebilir.
# Kullanım (oyun klasöründen):  python araclar/tur_uret.py  [çıktı adı, varsayılan tur.json]  [plan adları ...]
import json, math, os, sys
import numpy as np

OYUN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERI = os.path.join(OYUN, 'data')

m = json.load(open(os.path.join(VERI, 'arazi.json')))
n = m['cols'] * m['rows']
b = np.fromfile(os.path.join(VERI, 'arazi.bin'), dtype=np.uint8)
H = b[:2 * n].view(np.uint16).reshape(m['rows'], m['cols']).astype(float)
KAP = b[3 * n:4 * n].reshape(m['rows'], m['cols'])
H[H == 65535] = np.nan
H = m['hBase'] + H / 10


def hucre(e, nn):
    return int((nn - m['n0']) // m['cell']), int((e - m['e0']) // m['cell'])


def maks(e, nn, R=25):
    r, c = hucre(e, nn)
    k = int(R // m['cell']) + 1
    pen = H[max(r - k, 0):r + k + 1, max(c - k, 0):c + k + 1]
    return float(np.nanmax(pen)) if np.isfinite(pen).any() else float('nan')


def yer(e, nn):
    r, c = hucre(e, nn)
    return float(H[r, c]) if 0 <= r < m['rows'] and 0 <= c < m['cols'] else float('nan')


def kapsamada(e, nn):
    r, c = hucre(e, nn)
    return 0 <= r < m['rows'] and 0 <= c < m['cols'] and KAP[r, c] == 1


# yapılar (ENU, m; gezi noktalarıyla aynı)
KILISE, MEDRESE, CAMI = (63, -173), (161, -172), (132, -163)
CANSEVER, KONAK, VASILIOS = (161, -47), (290, -397), (92, 603)
STEFANOS, NIKOLAOS, MERKEZ = (-50, -726), (-81, -881), (100, -120)


def K(t, kam, bak, mutlak=False):
    """kam = (e, n, yerden) ya da mutlak=True ise (e, n, elipsoid yüksekliği); bak = (e, n, yerden) ya da (e, n)"""
    ke, kn, ky = kam
    be, bn = bak[0], bak[1]
    by = bak[2] if len(bak) > 2 else 8
    return {'t': t, 'kam': [round(ke, 1), round(kn, 1), round(ky if mutlak else maks(ke, kn) + ky, 1)],
            'bak': [round(be, 1), round(bn, 1), round(yer(be, bn) + by, 1)]}


def yorunge(sure, merkez, R, a0, a1, yerden, adim=3, bakYerden=8):
    """merkez çevresinde a0 -> a1 derece (doğudan saat tersine) dönüş"""
    k = max(2, round(sure / adim))
    return [K(round(sure * i / k, 2), (merkez[0] + R * math.cos(math.radians(a0 + (a1 - a0) * i / k)),
                                        merkez[1] + R * math.sin(math.radians(a0 + (a1 - a0) * i / k)), yerden),
              (*merkez, bakYerden)) for i in range(k + 1)]


def tepeden(sure, merkez, yerden, a0, a1, adim=2):
    """merkezin üstünden dik aşağı bakarken a0 -> a1 derece dönen plan (bakış noktası 1 m kaydırılarak döndürülür)"""
    k = max(2, round(sure / adim))
    z = maks(*merkez) + yerden
    return [K(round(sure * i / k, 2), (merkez[0], merkez[1] - 0.5, z),
              (merkez[0] + math.cos(math.radians(a0 + (a1 - a0) * i / k)), merkez[1] + math.sin(math.radians(a0 + (a1 - a0) * i / k)), 0),
              mutlak=True) for i in range(k + 1)]


# planlar: ad, süre (sn), lens (dikey görüş açısı, derece), anahtar kareler, isteğe bağlı yazı
PLANLAR = [
    dict(ad='acilis', sure=10, fov=55, kareler=[K(0, (-560, -640, 215), (*MERKEZ, 5)), K(10, (-450, -510, 195), (*MERKEZ, 5))],
         yazi=dict(tur='acilis', baslik='Sinasos', alt='Mustafapaşa · Ürgüp · Kapadokya', bas=1.5, son=9.5)),
    # batı platosunun kenarından yükselerek köyü açan plan
    dict(ad='yukselis', sure=8, fov=50, kareler=[K(0, (-235, -150, 5), (*KILISE, 25)), K(8, (-125, -165, 42), (*KILISE, 8))]),
    # dar açıyla (tele) kilisenin çevresinde ağır dönüş: perspektif sıkışır, kilise öne çıkar
    dict(ad='kilise_tele', sure=9, fov=26, kareler=yorunge(9, KILISE, 165, 200, 250, 85, bakYerden=6),
         yazi=dict(baslik='Aziz Konstantin ve Eleni Kilisesi', alt='1729 · onarım 1850 · köy meydanı', bas=1, son=8.3)),
    # cadde üstünden alçak geçiş, medrese ve camiye doğru
    dict(ad='cadde', sure=6, fov=62, kareler=[K(0, (35, -232, 24), (*MEDRESE, 6)), K(6, (128, -222, 24), (*CAMI, 14))]),
    # meydanın tepesinden dik bakan, dönen plan
    dict(ad='meydan_tepe', sure=7, fov=50, kareler=tepeden(7, (147, -170), 120, 100, 130),
         yazi=dict(baslik='Mehmet Şakir Paşa Medresesi', alt='1899 · bugün Kapadokya Üniversitesi', bas=0.8, son=6.5)),
    dict(ad='cami', sure=6, fov=34, kareler=[K(0, (215, -235, 55), (*CAMI, 16)), K(6, (195, -255, 50), (*CAMI, 12))],
         yazi=dict(baslik='Cami-i Kebir', alt='kitabesi 1601 · köşk minaresiyle', bas=0.6, son=5.6)),
    # konakların önünden yanal kayış (paralaks)
    dict(ad='konak_yan', sure=8, fov=38, kareler=[K(0, (225, -325, 48), (*KONAK, 6)), K(8, (335, -335, 48), (*KONAK, 6))],
         yazi=dict(baslik='Sinasos konakları', alt='19. yüzyıl Rum taş ustalığı', bas=1, son=7.3)),
    # üniversiteye vinç inişi
    dict(ad='vinc', sure=8, fov=45, kareler=[K(0, (235, -125, 115), (*CANSEVER, 4)), K(8, (210, -85, 45), (*CANSEVER, 6))],
         yazi=dict(baslik='Kapadokya Üniversitesi', alt="Cansever Konağı · 1884'ten önce", bas=1.2, son=7.4)),
    # çatıların üstünden kuzeye hızlı geçiş
    dict(ad='kuzey_gecis', sure=5, fov=64, kareler=[K(0, (150, 50, 38), (110, 330, -5)), K(5, (115, 250, 38), (60, 520, -10))]),
    # Beydere kanyonu: ağzının 20 m kadar üstünden, kanyon boyunca (daha alçakta dik duvarlardaki model delikleri görünüyor)
    dict(ad='kanyon', sure=10, fov=58, kareler=[K(0, (-15, 430, 1205), (45, 510, -10), mutlak=True), K(4, (40, 485, 1203), (75, 570, -12), mutlak=True),
                                              K(7, (62, 528, 1202), (95, 610, -8), mutlak=True), K(10, (70, 560, 1203), (*VASILIOS, 2), mutlak=True)]),
    dict(ad='vasilios', sure=8, fov=40, kareler=[K(0, (40, 540, 55), (*VASILIOS, 4)), K(8, (25, 625, 55), (*VASILIOS, 4))],
         yazi=dict(baslik='Aziz Vasilios Kilisesi', alt='Beydere vadisinin yamacına oyulmuş kaya kilisesi', bas=0.8, son=7.4)),
    # kuzeyden bütün köye panorama
    dict(ad='panorama', sure=10, fov=50, kareler=[K(0, (-35, 700, 120), (*MERKEZ, 5)), K(10, (-50, 540, 175), (60, -160, 5))],
         yazi=dict(tur='anlati', baslik="Sinasos, 1924'e kadar Rumların ve Türklerin birlikte yaşadığı bir ticaret köyüydü.", bas=1, son=9.4)),
    dict(ad='guney_gecis', sure=7, fov=55, kareler=[K(0, (-40, 160, 190), (0, -320, 0)), K(7, (-40, -150, 165), (*STEFANOS, 0))]),
    # Manastır Vadisi boyunca alçaktan
    dict(ad='manastir_vadisi', sure=9, fov=55, kareler=[K(0, (-45, -470, 32), (*STEFANOS, 0)), K(9, (-30, -640, 30), (*STEFANOS, 3))],
         yazi=dict(baslik='Aziz Stefanos Şapeli', alt="kaya oyma · Manastır Vadisi'nin başı", bas=3, son=8.6)),
    dict(ad='nikolaos', sure=8, fov=34, kareler=[K(0, (-20, -760, 135), (*NIKOLAOS, -6)), K(8, (-75, -775, 140), (*NIKOLAOS, -8))],
         yazi=dict(baslik='Aziz Nikolaos Manastırı', alt="Sinasos'un koruyucu azizi", bas=0.8, son=7.4)),
    # köyün doğusunda yüksekten geniş bir yay
    dict(ad='koy_dogu', sure=10, fov=50, kareler=yorunge(10, MERKEZ, 450, 50, 10, 200, bakYerden=5)),
    # konak mahallesinin tepesinden dönen plan
    dict(ad='tepe_konaklar', sure=7.5, fov=50, kareler=tepeden(7.5, (260, -340), 110, 200, 235)),
    # Manastır Vadisi'ne yüksekten giriş
    dict(ad='manastir_giris', sure=7.5, fov=55, kareler=[K(0, (-40, -200, 120), (*STEFANOS, 0)), K(7.5, (-45, -430, 60), (*STEFANOS, 0))]),
    # doruk: vadiden köye alçak ve hızlı dönüş
    dict(ad='vadi_donus', sure=10, fov=62, kareler=[K(0, (-30, -640, 35), (-10, -300, 0)), K(10, (-20, -330, 35), (60, -150, 5))]),
    # doruk: meydanın çevresinde geniş açılı dönüş
    dict(ad='meydan_yorunge', sure=10, fov=48, kareler=yorunge(10, (110, -170), 140, 280, 190, 70, bakYerden=8)),
    # doruk: kuzeyden Beydere kanyonunun üstünden güneye; kanyon ön planda, köy arkada
    dict(ad='kanyon_kanat', sure=10, fov=56, kareler=[K(0, (130, 730, 95), (70, 520, -10)), K(5, (95, 640, 80), (60, 380, -5)),
                                                      K(10, (60, 540, 85), (*MERKEZ, 5))]),
    # doruk: köyün çevresinde büyük dönüş
    dict(ad='buyuk_yorunge', sure=10, fov=52, kareler=yorunge(10, MERKEZ, 520, 160, 200, 260, bakYerden=5)),
    # kapanış: köyün üstünden yükselerek geri çekilme
    dict(ad='kapanis', sure=13, fov=55, kareler=[K(0, (40, -330, 90), (*MERKEZ, 5)), K(13, (-60, -560, 320), (*MERKEZ, 5))],
         yazi=dict(tur='kapanis', baslik='Mustafapaşa', alt='Sinasos', bas=1.5, son=12.8,
                   kunye="DJI Matrice 4E ile 20 Ekim 2026'da çekilen 6875 fotoğraftan üretilen 3B model · Müzik: Nomadic Camp, Sascha Ende (ende.app), CC BY 4.0")),
]

# Kurgu müziğe göre: Nomadic Camp (Sascha Ende), 220 sn, ~95,7 BPM. Ses zarfı ve vuruş analizinden ölçü 2,508 sn,
# ilk ölçü başı 1,947 sn. Bölümler ölçü başlarına oturuyor: giriş 0-22,0; yükselen 22,0-47,1; ana bölüm (perküsyon)
# 47,1-144,9; sakin ara bölüm 144,9-165,0; doruk 165,0-205,1; son vuruş 210,1; sönüş 220. Her plan tam ölçü sayısı
# kadar sürer, böylece kesmeler ölçü başlarına denk gelir. Son plan müziğin sonuna kadar uzar.
MUZIK = dict(dosya='muzik/nomadic_camp_sascha_ende.mp3', hacim=0.55, sure=220.0, olcu=2.508, ilk=1.947)
KURGU = [('acilis', 4), ('yukselis', 4),                                                  # giriş
         ('kilise_tele', 4), ('cami', 3), ('meydan_tepe', 3),                             # yükselen bölüm
         ('cadde', 2), ('konak_yan', 4), ('vinc', 4), ('kuzey_gecis', 2), ('kanyon', 5),  # ana bölüm
         ('vasilios', 4), ('panorama', 5), ('koy_dogu', 4), ('tepe_konaklar', 3), ('guney_gecis', 3), ('manastir_giris', 3),
         ('manastir_vadisi', 4), ('nikolaos', 4),                                          # sakin ara bölüm
         ('vadi_donus', 4), ('meydan_yorunge', 4), ('kanyon_kanat', 4), ('buyuk_yorunge', 4),  # doruk
         ('kapanis', None)]                                                               # son vuruş ve sönüş
SURELER, _t = {}, 0.0
for _i, (_ad, _olcu) in enumerate(KURGU):
    _son = MUZIK['sure'] if _olcu is None else (MUZIK['ilk'] if _i == 0 else _t) + _olcu * MUZIK['olcu']
    SURELER[_ad] = round(_son - _t, 3)
    _t = _son


def hermite(K_, t, anahtar):
    ts = [k['t'] for k in K_]
    P = [np.array(k[anahtar], float) for k in K_]
    i = max(0, min(len(ts) - 2, np.searchsorted(ts, t, side='right') - 1))

    def teget(j):
        a, c = max(j - 1, 0), min(j + 1, len(ts) - 1)
        return (P[c] - P[a]) / (ts[c] - ts[a])
    t0, t1 = ts[i], ts[i + 1]
    h = t1 - t0
    u = (t - t0) / h
    return (2 * u**3 - 3 * u**2 + 1) * P[i] + (u**3 - 2 * u**2 + u) * h * teget(i) + (-2 * u**3 + 3 * u**2) * P[i + 1] + (u**3 - u**2) * h * teget(i + 1)


# oyunda dil English seçilince gösterilen yazılar; anahtar Türkçe başlık, olmayan alan Türkçesiyle kalır
INGILIZCE = {
    'Sinasos': dict(alt='Mustafapaşa · Ürgüp · Cappadocia'),
    'Aziz Konstantin ve Eleni Kilisesi': dict(baslik='Church of Saints Constantine and Helena', alt='1729 · restored 1850 · village square'),
    'Mehmet Şakir Paşa Medresesi': dict(baslik='Mehmet Şakir Pasha Madrasa', alt='1899 · today Cappadocia University'),
    'Cami-i Kebir': dict(baslik='Cami-i Kebir (Great Mosque)', alt='inscription dated 1601 · with its kiosk minaret'),
    'Sinasos konakları': dict(baslik='The mansions of Sinasos', alt='19th-century Greek stonemasonry'),
    'Kapadokya Üniversitesi': dict(baslik='Cappadocia University', alt='Cansever Mansion · before 1884'),
    'Aziz Vasilios Kilisesi': dict(baslik='Church of St. Basil', alt='rock-cut church carved into the slope of the Beydere valley'),
    "Sinasos, 1924'e kadar Rumların ve Türklerin birlikte yaşadığı bir ticaret köyüydü.":
        dict(baslik='Until 1924, Sinasos was a trading village where Greeks and Turks lived side by side.'),
    'Aziz Stefanos Şapeli': dict(baslik='Chapel of St. Stephen', alt='rock-cut · head of the Monastery Valley'),
    'Aziz Nikolaos Manastırı': dict(baslik='Monastery of St. Nicholas', alt='the patron saint of Sinasos'),
    'Mustafapaşa': dict(kunye='3D model built from 6,875 photos taken with a DJI Matrice 4E on 20 October 2026 · '
                              'Music: Nomadic Camp, Sascha Ende (ende.app), CC BY 4.0'),
}

cikti = sys.argv[1] if len(sys.argv) > 1 else 'tur.json'
secili = sys.argv[2:]
adla = {p['ad']: p for p in PLANLAR}
planlar = [adla[a] for a, _ in KURGU if not secili or a in secili]
cekimler, yazilar, bas = [], [], 0.0
print(f'{"plan":16} {"süre":>5} {"lens":>4} {"en hızlı":>9} {"en alçak":>9} kapsama')
for p in planlar:
    sure = SURELER.get(p['ad'], p['sure'])
    olcek = sure / p['sure']
    kareler = [dict(k, t=round(k['t'] * olcek, 3)) for k in p['kareler']]
    hizlar, alcak, disari = [], 1e9, 0
    onceki = None
    for t in np.arange(0, sure, 0.1):
        q = hermite(kareler, t, 'kam')
        alcak = min(alcak, q[2] - maks(q[0], q[1], 15))
        disari += not kapsamada(q[0], q[1])
        if onceki is not None:
            hizlar.append(np.linalg.norm(q - onceki) / 0.1)
        onceki = q
    print(f'{p["ad"]:16} {sure:5.1f} {p["fov"]:4d} {max(hizlar):7.1f}m/s {alcak:7.1f} m {"tamam" if not disari else f"{disari} örnek dışarıda"}')
    cekimler.append({'ad': p['ad'], 'sure': sure, 'fov': p['fov'], 'kareler': kareler, **({'karart': True} if p.get('karart') else {})})
    if 'yazi' in p:
        y = dict(p['yazi'])
        y['bas'], y['son'] = round(bas + y['bas'] * olcek, 2), round(bas + y['son'] * olcek, 2)
        if y['baslik'] in INGILIZCE:
            y['en'] = INGILIZCE[y['baslik']]
        yazilar.append(y)
    bas += sure
print(f'toplam {bas:.1f} sn, {len(cekimler)} plan')

json.dump({
    'aciklama': 'Sinematik tur. Bu dosya araclar/tur_uret.py ile üretildi; kam ve bak ENU metre + elipsoid yüksekliği, t plan içindeki saniye.',
    'fov': 52, 'sis': [650, 2600],
    'renk': 'contrast(1.08) saturate(1.15) sepia(0.06) brightness(1.03)', 'vinyet': 0.35,
    'muzik': {'dosya': MUZIK['dosya'], 'hacim': MUZIK['hacim']},
    'cekimler': cekimler, 'yazilar': yazilar,
}, open(os.path.join(VERI, cikti), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('yazıldı: data/' + cikti)
