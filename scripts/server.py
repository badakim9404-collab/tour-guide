"""
로컬 개발 서버
- 정적 파일 서빙 (기존 python -m http.server 대체)
- /api/crawl 엔드포인트: 장소 1개의 영업시간 즉시 크롤링
"""

import json
import os
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from pathlib import Path

# 프로젝트 루트를 기준으로 서빙
ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)

# crawl_hours 모듈 임포트
sys.path.insert(0, str(ROOT / "scripts"))
from crawl_hours import crawl_place, random_delay
from playwright.sync_api import sync_playwright
import random

# Playwright 브라우저 재사용 (매번 새로 띄우면 느림)
_browser_context = {
    "playwright": None,
    "browser": None,
    "page": None,
}

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]


def get_page():
    """Playwright 페이지 (lazy init, 재사용)"""
    if _browser_context["page"] is None:
        pw = sync_playwright().start()
        browser = pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = browser.new_context(
            user_agent=random.choice(USER_AGENTS),
            viewport={"width": 1920, "height": 1080},
            locale="ko-KR",
            timezone_id="Asia/Seoul",
        )
        context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
        )
        _browser_context["playwright"] = pw
        _browser_context["browser"] = browser
        _browser_context["page"] = context.new_page()
    return _browser_context["page"]


class DevHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)

        # API: 단일 장소 크롤링
        if parsed.path == "/api/crawl":
            self._handle_crawl(parsed)
            return

        # 정적 파일 서빙
        super().do_GET()

    def _handle_crawl(self, parsed):
        params = parse_qs(parsed.query)
        name = params.get("name", [""])[0]
        address = params.get("address", [""])[0]

        if not name:
            self._json_response(400, {"error": "name 파라미터 필요"})
            return

        print(f"[크롤링] {name} ({address})")

        try:
            page = get_page()
            result = crawl_place(page, name, address)
            print(f"[완료] {name}: {len(result.get('hours', {}))}개 요일 수집")
            self._json_response(200, result)
        except Exception as e:
            print(f"[오류] {name}: {e}")
            self._json_response(500, {"error": str(e)})

    def _json_response(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    # 로그 간소화
    def log_message(self, format, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(format, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = HTTPServer(("", port), DevHandler)
    print(f"서버 시작: http://localhost:{port}")
    print(f"장소 등록 시 영업시간 자동 크롤링 활성화")
    print(f"종료: Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")
    finally:
        if _browser_context["browser"]:
            _browser_context["browser"].close()
        if _browser_context["playwright"]:
            _browser_context["playwright"].stop()


if __name__ == "__main__":
    main()
