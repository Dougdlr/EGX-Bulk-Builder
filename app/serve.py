"""Servidor local do EGX Bulk Builder.

Igual ao `python -m http.server`, mas avisa o navegador para sempre conferir
se há versão nova dos arquivos (Cache-Control: no-cache). Assim, depois de
uma atualização, basta recarregar a página — nada de versão antiga presa no cache.

Uso (na pasta do Workspace ou em qualquer lugar):
    python egx-bulk-builder/serve.py
e abra http://localhost:8765/egx-bulk-builder/
"""
import functools
import http.server
import os
import sys

PORT = int(os.environ.get('EGX_PORT', '8765'))
# Serve a pasta do Workspace (a pasta acima de egx-bulk-builder), como antes.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):  # silencioso, só erros
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else ROOT
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler) as srv:
        print(f'EGX em http://localhost:{PORT}/egx-bulk-builder/  (pasta: {root})')
        srv.serve_forever()
