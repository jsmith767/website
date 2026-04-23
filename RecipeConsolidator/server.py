#!/usr/bin/env python3
"""
Recipe server: image extraction + access key auth.
Reads ANTHROPIC_API_KEY and RECIPE_ACCESS_KEY from environment or .env file.

Usage:
    python3 server.py

Runs on http://localhost:8001
"""

import os
import json
import base64
import cgi
import secrets
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Load .env from project root if present
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, val = line.partition('=')
                os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

EXTRACT_PROMPT = """Extract the recipe from this image and return ONLY a valid JSON object with exactly these fields:

{
  "name": "Recipe name",
  "servings": "e.g. '4' or '4-6' or null",
  "description": "Any preamble, headnote, or intro text (null if none)",
  "ingredients": [
    {"quantity": "1", "unit": "cup", "ingredient": "flour", "preparation": "sifted"}
  ],
  "instructions": "Full step-by-step instructions as a single string with newlines between steps",
  "tags": ["inferred tag1", "inferred tag2"]
}

For ingredients: use null for quantity or unit if not present. For preparation, include things like 'chopped', 'sifted', 'melted'.
For tags, infer relevant ones such as: vegan, vegetarian, gluten-free, dairy-free, breakfast, lunch, dinner, dessert, soup, salad, quick, baked, grilled, etc.
If a field is absent from the image, use null or [] as appropriate.

Return ONLY the JSON object — no markdown, no explanation, no code fences."""

PORT = 8001
ALLOWED_ORIGIN = 'http://localhost:8000'
TOKEN_TTL_DAYS = 30


class RecipeHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        if self.path == '/health':
            access_key_set = bool(os.environ.get('RECIPE_ACCESS_KEY'))
            self.send_json(200, {'status': 'ok', 'authEnabled': access_key_set})
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == '/auth':
            self._handle_auth()
        elif self.path == '/api/extract-recipe':
            self._handle_extract()
        else:
            self.send_error(404)

    def _handle_auth(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            passphrase = body.get('passphrase', '')
        except Exception:
            self.send_json(400, {'error': 'Invalid request'})
            return

        access_key = os.environ.get('RECIPE_ACCESS_KEY', '')
        if not access_key:
            self.send_json(503, {'error': 'No access key configured on this server'})
            return

        if passphrase == access_key:
            token = secrets.token_hex(32)
            expires = int(time.time()) + TOKEN_TTL_DAYS * 86400
            self.send_json(200, {'token': token, 'expires': expires})
        else:
            self.send_json(401, {'error': 'Incorrect access key'})

    def _handle_extract(self):
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            self.send_json(500, {'error': 'ANTHROPIC_API_KEY is not set.'})
            return

        try:
            content_type = self.headers.get('Content-Type', '')
            if 'multipart/form-data' in content_type:
                form = cgi.FieldStorage(
                    fp=self.rfile,
                    headers=self.headers,
                    environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': content_type}
                )
                field = form['image']
                image_bytes = field.file.read()
                media_type = field.type or 'image/jpeg'
            else:
                length = int(self.headers.get('Content-Length', 0))
                body = json.loads(self.rfile.read(length))
                image_bytes = base64.b64decode(body['image'])
                media_type = body.get('mediaType', 'image/jpeg')

            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            b64 = base64.standard_b64encode(image_bytes).decode('utf-8')

            message = client.messages.create(
                model='claude-sonnet-4-6',
                max_tokens=2048,
                messages=[{
                    'role': 'user',
                    'content': [
                        {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': b64}},
                        {'type': 'text', 'text': EXTRACT_PROMPT}
                    ]
                }]
            )

            text = message.content[0].text.strip()
            if text.startswith('```'):
                text = text.split('\n', 1)[1]
                text = text.rsplit('```', 1)[0].strip()

            recipe_data = json.loads(text)
            recipe_data['imageData'] = f"data:{media_type};base64,{b64}"
            self.send_json(200, recipe_data)

        except json.JSONDecodeError as e:
            self.send_json(500, {'error': f'Could not parse Claude response as JSON: {e}'})
        except Exception as e:
            self.send_json(500, {'error': str(e)})

    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        print(f'[recipe-server] {fmt % args}')


if __name__ == '__main__':
    print(f'Recipe server → http://localhost:{PORT}')
    print(f'  ANTHROPIC_API_KEY: {"✓ loaded" if os.environ.get("ANTHROPIC_API_KEY") else "⚠  not set"}')
    access_key = os.environ.get('RECIPE_ACCESS_KEY')
    print(f'  RECIPE_ACCESS_KEY: {"✓ loaded" if access_key else "⚠  not set — prep instructions will be visible to all"}')
    HTTPServer(('', PORT), RecipeHandler).serve_forever()
