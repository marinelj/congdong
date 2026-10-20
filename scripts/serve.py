#!/usr/bin/env python3
"""Static file server for previews and simple deployments (standard library only).

Plain `python3 -m http.server` ignores HTTP Range requests, which Safari needs
before it will play <video>. This adds byte-range support. By default nothing
is cached, so every refresh shows the latest files; with --prod, hashed files
under assets/ are cached for a year and HTML is revalidated on every request.

usage: python3 scripts/serve.py [--dir .] [--port 4321] [--bind 127.0.0.1] [--prod]
       (--dir is relative to the project root, e.g. --dir dist)
"""
import argparse
import os
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RANGE = re.compile(r"bytes=(\d*)-(\d*)$")


class Handler(SimpleHTTPRequestHandler):
    production = False
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mp4": "video/mp4",
        ".woff2": "font/woff2",
    }

    def end_headers(self):
        if not self.production:
            cache = "no-store"
        elif self.path.split("?", 1)[0].startswith("/assets/"):
            cache = "public, max-age=31536000, immutable"
        else:
            cache = "no-cache"
        self.send_header("Cache-Control", cache)
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()

    def send_head(self):
        self._remaining = None
        header = self.headers.get("Range")
        path = self.translate_path(self.path)
        match = RANGE.match(header.strip()) if header else None
        if not match or os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None
        size = os.fstat(f.fileno()).st_size
        first, last = match.groups()
        if first:
            start, end = int(first), int(last) if last else size - 1
        elif last:
            start, end = max(0, size - int(last)), size - 1
        else:
            start, end = 0, size - 1
        end = min(end, size - 1)
        if start >= size or start > end:
            f.close()
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        f.seek(start)
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        if self._remaining is None:
            return super().copyfile(source, outputfile)
        while self._remaining > 0:
            chunk = source.read(min(64 * 1024, self._remaining))
            if not chunk:
                break
            outputfile.write(chunk)
            self._remaining -= len(chunk)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dir", default=".", help="folder to serve, relative to the project root")
    parser.add_argument("--port", type=int, default=4321)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--prod", action="store_true", help="long-cache hashed assets/, revalidate HTML")
    args = parser.parse_args()
    directory = os.path.join(ROOT, args.dir)
    if not os.path.isdir(directory):
        parser.error(f"{directory} does not exist (run `npm run build` first for dist)")
    Handler.production = args.prod
    server = ThreadingHTTPServer((args.bind, args.port), partial(Handler, directory=directory))
    print(f"Serving {directory} at http://{args.bind}:{args.port}/", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
