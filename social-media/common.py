"""Small stdlib HTTP client. Secrets stay in headers and never in errors."""
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))


def redact(value):
    text = str(value)
    for name, secret in os.environ.items():
        if any(part in name for part in ('TOKEN', 'SECRET', 'API_KEY')) and len(secret) > 5:
            text = text.replace(secret, '[REDACTED]')
    text = re.sub(r'(?i)(bearer\s+)[^\s"<>]+', r'\1[REDACTED]', text)
    text = re.sub(r'(?i)(access_token|api_key|token)(["\s:=]+)[^\s&,"}]+', r'\1\2[REDACTED]', text)
    text = re.sub(r'sk' + r'-[A-Za-z0-9_-]+|EAA[A-Za-z0-9]+', '[REDACTED]', text)
    return text[:4000]


class HTTPFailure(RuntimeError):
    def __init__(self, status, body):
        self.status = status
        super().__init__(redact(f'HTTP {status}: {body}'))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward authentication or replay a publishing POST to a redirect.
        return None


def request(method, url, *, headers=None, data=None, timeout=60, max_bytes=30_000_000):
    headers = dict(headers or {})
    headers.setdefault('User-Agent', 'EuroFundingSocialPublisher/1.0 (+https://euro-funds.eu)')
    if isinstance(data, (dict, list)):
        data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=timeout) as response:
            body = response.read(max_bytes + 1)
            if len(body) > max_bytes:
                raise RuntimeError('Response exceeds the size limit')
            return body, response.headers
    except urllib.error.HTTPError as exc:
        raise HTTPFailure(exc.code, exc.read(16000).decode('utf-8', 'replace')) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise RuntimeError('Network request did not complete; delivery may be uncertain') from None


def json_request(method, url, **kwargs):
    body, headers = request(method, url, **kwargs)
    return (json.loads(body) if body else {}), headers


def required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise RuntimeError(f'Missing environment variable: {name}')
    return value
