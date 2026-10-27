# Mustafapaşa Drone için küçük yerel web sunucusu.
# Bu klasörü (oyun dosyaları ve yanındaki terra_b3dms model klasörü) yayınlar ve oyunu tarayıcıda açar.
# Kullanım:  python sunucu.py  [port]  [--model KLASÖR]
# Model (DJI Terra 3D Tiles çıktısı, terra_b3dms, 4,6 GB) bu klasördeki terra_b3dms'ten okunur. Başka bir yerdeyse:
#   python sunucu.py 8000 --model "E:\...\models\pc\0\terra_b3dms"
#   ya da bu klasöre model_yolu.txt koyup ilk satırına o klasörü yaz (BASLAT.bat olduğu gibi çalışır).
import http.server
import os
import socket
import sys
import threading
import webbrowser

KOK = os.path.dirname(os.path.abspath(__file__))
ARGS = sys.argv[1:]
MODEL = None
if '--model' in ARGS:
    i = ARGS.index('--model')
    MODEL = ARGS[i + 1] if i + 1 < len(ARGS) else None
    del ARGS[i:i + 2]
elif os.path.exists(os.path.join(KOK, 'model_yolu.txt')):
    with open(os.path.join(KOK, 'model_yolu.txt'), encoding='utf-8-sig') as f:
        MODEL = next((s.strip().strip('"') for s in f if s.strip() and not s.lstrip().startswith('#')), None)
MODEL = os.path.abspath(MODEL) if MODEL else None
PORT = int(ARGS[0]) if ARGS else 8000


class Isleyici(http.server.SimpleHTTPRequestHandler):
    # HTTP/1.1: bağlantı karolar arasında yeniden kullanılır, her karo için yeni bağlantı açılmaz
    protocol_version = 'HTTP/1.1'

    # Windows kayıt defteri bazen .js için yanlış tür döndürür; türleri burada sabitliyoruz
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.b3dm': 'application/octet-stream',
        '.bin': 'application/octet-stream',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=KOK, **kwargs)

    def translate_path(self, path):
        # model başka bir yerdeyse /terra_b3dms/ altındaki istekler oradan karşılanır
        yol = super().translate_path(path)
        model_kok = os.path.join(KOK, 'terra_b3dms')
        if MODEL and (yol == model_kok or yol.startswith(model_kok + os.sep)):
            return os.path.join(MODEL, os.path.relpath(yol, model_kok))
        return yol

    def end_headers(self):
        # model karoları değişmez, tarayıcı önbelleğe alabilir; oyun dosyaları her seferinde yenilensin
        if '/terra_b3dms/' in self.path:
            self.send_header('Cache-Control', 'public, max-age=604800')
        else:
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, format, *args):
        pass


def bos_port(baslangic):
    for p in range(baslangic, baslangic + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', p)) != 0:
                return p
    return baslangic


if __name__ == '__main__':
    model_klasoru = MODEL or os.path.join(KOK, 'terra_b3dms')
    if not os.path.exists(os.path.join(model_klasoru, 'tileset.json')):
        print('UYARI: tileset.json bulunamadı:', model_klasoru)
        print('       DJI Terra çıktısındaki terra_b3dms klasörünü bu klasöre kopyala'
              ' ya da --model / model_yolu.txt ile yerini göster (README.md).')
    elif MODEL:
        print('Model buradan okunuyor:', MODEL)
    port = bos_port(PORT)
    # localhost değil 127.0.0.1: Windows'ta tarayıcı localhost için önce IPv6'yı dener, sunucu yalnızca
    # IPv4 dinlediği için her yeni bağlantı yaklaşık 0,3 sn bekler (ölçüm: saniyede 19 karo yerine 800'ün üstü)
    adres = f'http://127.0.0.1:{port}/'
    sunucu = http.server.ThreadingHTTPServer(('127.0.0.1', port), Isleyici)
    print('Mustafapaşa Drone çalışıyor:', adres)
    print('Kapatmak için bu pencereyi kapat ya da Ctrl+C tuşlarına bas.')
    threading.Timer(1.0, lambda: webbrowser.open(adres)).start()
    try:
        sunucu.serve_forever()
    except KeyboardInterrupt:
        pass
