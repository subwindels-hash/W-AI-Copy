"""Local mirror for binaries.prisma.sh in offline environments.
Returns 404 for .sha256 (skipped when PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1)
and a valid empty gzip for engine binary requests. The API uses driver adapters
+ the WASM engine so the real engine binaries are never needed."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import gzip, io
class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.endswith(".sha256"):
            self.send_response(404); self.end_headers(); return
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb") as gz:
            gz.write(b"\x7fELF" + b"\x00"*1024)
        data = buf.getvalue()
        self.send_response(200)
        self.send_header("Content-Type","application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
    def log_message(self, *a): pass
HTTPServer(("127.0.0.1", 18899), H).serve_forever()
