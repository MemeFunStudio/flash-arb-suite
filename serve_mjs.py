import mimetypes
mimetypes.add_type('application/javascript', '.mjs')
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
ThreadingHTTPServer(('', 8000), SimpleHTTPRequestHandler).serve_forever()
