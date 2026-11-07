"""Local receiver for batch test output. POST /<name> writes the body to <outdir>/<name>."""
import base64
import http.server
import os
import re
import sys

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        name = re.sub(r"[^\w.\-]", "_", self.path.lstrip("/"))
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        if name.endswith(".jpg") and body.startswith(b"data:"):
            body = base64.b64decode(body.split(b",", 1)[1])
        with open(os.path.join(OUT, name), "wb") as handle:
            handle.write(body)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b"ok")


http.server.ThreadingHTTPServer(("127.0.0.1", 8622), Handler).serve_forever()
