# Sinematik tur kaydı için yerel alıcı: oyunun tur.kaydet() işlevinin gönderdiklerini diske yazar.
#   POST /ekle?oturum=ad         H.264 (Annex B) paketlerini video/ad.h264 dosyasının sonuna ekler
#   POST /kaydet?ad=..&klasor=.. tek görüntü dosyası (önizleme kareleri, JPEG)
# Kullanım (oyun klasöründen):  python araclar/kayit_alici.py  [port, varsayılan 8765]
# Ayrıntı ve ffmpeg adımı: video/OKUBENI.txt
import http.server, os, re, sys, urllib.parse

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO = os.path.join(KOK, 'video', 'ham')


def temiz(s, ek=''):
    return re.sub(r'[^A-Za-z0-9_' + ek + '-]', '_', s)


class Isleyici(http.server.BaseHTTPRequestHandler):
    def _yanit(self, kod, metin):
        self.send_response(kod)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()
        self.wfile.write(str(metin).encode())

    def do_OPTIONS(self):
        self._yanit(204, '')

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        veri = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        os.makedirs(VIDEO, exist_ok=True)
        if u.path == '/ekle':
            with open(os.path.join(VIDEO, temiz(q.get('oturum', 'tur')) + '.h264'), 'ab') as f:
                f.write(veri)
        elif u.path == '/kaydet':
            hedef = os.path.join(VIDEO, temiz(q.get('klasor', 'onizleme')))
            os.makedirs(hedef, exist_ok=True)
            with open(os.path.join(hedef, temiz(q.get('ad', 'kare.jpg'), '.')), 'wb') as f:
                f.write(veri)
        else:
            return self._yanit(404, 'bilinmiyor')
        self._yanit(200, len(veri))

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print('Kayıt alıcısı:', f'http://127.0.0.1:{port}', '->', VIDEO)
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Isleyici).serve_forever()
