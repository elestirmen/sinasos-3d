# DJI Terra DEM'inden oyunun arazi verisini uretir: yerel ENU izgarasi (5 m), ucus siniri ve mini harita.
# Baska bir ucus icin yeniden calistirilabilir. Gerekenler: pip install numpy pillow scipy pyproj
#
# Kullanim (proje klasorunun icinden; terra_dem, DJI Terra ciktisindaki DEM klasoru):
#   python araclar/arazi_uret.py <terra_dem>/dem.tif <terra_dem>/dem.tfw <terra_dem>/tile.json data
#
# Not: DEM'in UTM 36N (EPSG:32636) oldugu varsayilir. Farkli bir dilim icin asagidaki 'EPSG:32636' degerlerini degistir.
import json, math, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
from pyproj import Transformer

DEM, TFW, TILE, OUT = sys.argv[1:5]
os.makedirs(OUT, exist_ok=True)
Image.MAX_IMAGE_PIXELS = None
a = np.array(Image.open(DEM)).astype('float64')
valid = a > -1000
tfw = [float(x) for x in open(TFW).read().split()]
px, x0, y0 = tfw[0], tfw[4], tfw[5]          # x0,y0: sol ust pikselin merkezi
lat0, lon0 = json.load(open(TILE))['center coordination']
H0 = 1150.0                                   # oyundaki ReorientationPlugin yuksekligi ile ayni
CELL = 5.0
k = int(round(CELL / px))                     # 10 piksel -> 5 m

# 1) DEM'i 5 m'ye indir (nan-duyarli blok ortalamasi)
R, C = a.shape[0] // k * k, a.shape[1] // k * k
v = valid[:R, :C].reshape(R // k, k, C // k, k)
z = np.where(valid, a, 0)[:R, :C].reshape(R // k, k, C // k, k)
cnt = v.sum(axis=(1, 3)); s = z.sum(axis=(1, 3))
dem5 = np.where(cnt >= k * k * 0.5, s / np.maximum(cnt, 1), np.nan)
ux0 = x0 - px / 2 + CELL / 2                  # 5 m hucre merkezleri (UTM)
uy0 = y0 + px / 2 - CELL / 2

# 2) ENU izgarasi: DEM sinirlarinin ENU karsiligini bul
to_ecef = Transformer.from_crs('EPSG:4979', 'EPSG:4978', always_xy=True)
ecef_to_utm = Transformer.from_crs('EPSG:4978', 'EPSG:32636', always_xy=True)
utm_to_geo = Transformer.from_crs('EPSG:32636', 'EPSG:4326', always_xy=True)
X0, Y0, Z0 = to_ecef.transform(lon0, lat0, H0)
la, lo = math.radians(lat0), math.radians(lon0)
Ev = np.array([-math.sin(lo), math.cos(lo), 0.0])
Nv = np.array([-math.sin(la) * math.cos(lo), -math.sin(la) * math.sin(lo), math.cos(la)])
Uv = np.array([math.cos(la) * math.cos(lo), math.cos(la) * math.sin(lo), math.sin(la)])
def geo_to_enu(lon, lat, h):
    X, Y, Z = to_ecef.transform(lon, lat, h)
    d = np.stack([np.asarray(X) - X0, np.asarray(Y) - Y0, np.asarray(Z) - Z0], -1)
    return d @ Ev, d @ Nv, d @ Uv
cx = np.array([x0, x0 + C * px, x0, x0 + C * px]); cy = np.array([y0, y0, y0 - R * px, y0 - R * px])
glon, glat = utm_to_geo.transform(cx, cy)
ce, cn, _ = geo_to_enu(glon, glat, np.full(4, H0))
e0 = math.floor(ce.min() / CELL) * CELL; e1 = math.ceil(ce.max() / CELL) * CELL
n0 = math.floor(cn.min() / CELL) * CELL; n1 = math.ceil(cn.max() / CELL) * CELL
cols, rows = int((e1 - e0) / CELL), int((n1 - n0) / CELL)
E, N = np.meshgrid(e0 + (np.arange(cols) + 0.5) * CELL, n0 + (np.arange(rows) + 0.5) * CELL)  # satir 0 = guney
P = np.array([X0, Y0, Z0]) + E[..., None] * Ev + N[..., None] * Nv   # u = 0 duzlemi
ux, uy, _uz = ecef_to_utm.transform(P[..., 0], P[..., 1], P[..., 2])
ci = np.round((ux - ux0) / CELL).astype(int); ri = np.round((uy0 - uy) / CELL).astype(int)
ok = (ci >= 0) & (ci < dem5.shape[1]) & (ri >= 0) & (ri < dem5.shape[0])
h = np.full(E.shape, np.nan); h[ok] = dem5[ri[ok], ci[ok]]

# 3) Kapsama (delikleri doldur, en buyuk parca), sinir (25 m iceriden)
cov = ~np.isnan(h)
lab, nl = ndimage.label(cov)
if nl > 1:
    sizes = ndimage.sum(cov, lab, range(1, nl + 1)); cov = lab == (np.argmax(sizes) + 1)
cov = ndimage.binary_fill_holes(cov)
idx = ndimage.distance_transform_edt(np.isnan(h), return_distances=False, return_indices=True)
hf = h[idx[0], idx[1]]                                  # bosluklari en yakin degerle doldur
fence = ndimage.binary_erosion(cov, iterations=5)
lab, nl = ndimage.label(fence)
if nl > 1:
    sizes = ndimage.sum(fence, lab, range(1, nl + 1)); fence = lab == (np.argmax(sizes) + 1)

# kapsama alanina kirp (10 hucre pay)
rr, cc = np.where(cov)
r0, r1 = max(rr.min() - 10, 0), min(rr.max() + 11, rows); c0, c1 = max(cc.min() - 10, 0), min(cc.max() + 11, cols)
hf, cov, fence = hf[r0:r1, c0:c1], cov[r0:r1, c0:c1], fence[r0:r1, c0:c1]
e0, n0 = e0 + c0 * CELL, n0 + r0 * CELL
rows, cols = hf.shape
hBase = math.floor(np.nanmin(hf[cov])) - 1
hq = np.where(cov, np.round((hf - hBase) * 10), 65535).astype('<u2')
with open(os.path.join(OUT, 'arazi.bin'), 'wb') as f:
    f.write(hq.tobytes()); f.write(fence.astype('u1').tobytes()); f.write(cov.astype('u1').tobytes())
meta = dict(aciklama='Terra DEM (DTM) yerel ENU izgarasi. Satir 0 = guney, sutun 0 = bati. Once uint16 yukseklik (dm, hBase uzerine; 65535 = veri yok), sonra uint8 ucus siniri, sonra uint8 kapsama.',
            originLat=lat0, originLon=lon0, originHeight=H0, e0=e0, n0=n0, cell=CELL, cols=cols, rows=rows, hBase=hBase,
            hMin=float(np.nanmin(hf[cov])), hMax=float(np.nanmax(hf[cov])))
json.dump(meta, open(os.path.join(OUT, 'arazi.json'), 'w'), indent=1)

# 4) Mini harita: golgeli kabartma + yukseklik rengi, kuzey yukari
gy, gx = np.gradient(hf, CELL)                          # gy: kuzey yonu (satir artinca kuzey)
az, alt = math.radians(315), math.radians(40)
slope = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gy, gx)
lx, ly = math.sin(az), math.cos(az)                     # isik dogu/kuzey bilesenleri (kuzeybatidan)
shade = np.clip(math.sin(alt) * np.cos(slope) + math.cos(alt) * np.sin(slope) * (-(gx * lx + gy * ly) / np.maximum(np.hypot(gx, gy), 1e-9)), 0, 1)
t = np.clip((hf - meta['hMin']) / (meta['hMax'] - meta['hMin']), 0, 1)[..., None]
low, high = np.array([96, 112, 84]), np.array([226, 204, 160])
col = (low * (1 - t) + high * t) * (0.32 + 0.95 * shade[..., None])
edge = fence & ~ndimage.binary_erosion(fence, iterations=1)
img = np.zeros((rows, cols, 4), 'u1')
img[..., :3] = np.clip(col, 0, 255); img[..., 3] = np.where(cov, 235, 0)
img[~fence & cov, 3] = 120
img[edge] = [255, 150, 40, 255]
Image.fromarray(img[::-1]).save(os.path.join(OUT, 'harita.png'), optimize=True)
print(json.dumps(meta)); print('kapsama km2', round(cov.sum() * CELL * CELL / 1e6, 2), 'sinir ici km2', round(fence.sum() * CELL * CELL / 1e6, 2))
oi = (int((0 - e0) / CELL), int((0 - n0) / CELL)); print('orijinde DTM', hf[oi[1], oi[0]], 'kapsama', cov[oi[1], oi[0]], 'sinir', fence[oi[1], oi[0]])
