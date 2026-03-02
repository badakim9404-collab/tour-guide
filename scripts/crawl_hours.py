"""
네이버 지도 API + Playwright 기반 영업시간 크롤러
1단계: instant-search API로 place ID 검색 (정확한 장소 매칭)
2단계: Playwright로 상세 페이지 → 펼쳐보기 클릭 → 요일별 영업시간 추출
"""

import json
import os
import random
import re
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import requests
from playwright.sync_api import sync_playwright

# 프로젝트 루트
ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = ROOT / "data" / "places-input.json"
OUTPUT_FILE = ROOT / "data" / "business-hours.json"

# User-Agent
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

# 요일 매핑
DAY_MAP = {
    "월": "mon", "화": "tue", "수": "wed", "목": "thu",
    "금": "fri", "토": "sat", "일": "sun",
}
ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

# 서울 시청 좌표 (검색 기준점)
COORDS = "37.5665,126.9780"


def random_delay(min_sec=2, max_sec=5):
    time.sleep(random.uniform(min_sec, max_sec))


def search_place_id(name, address=""):
    """네이버 지도 instant-search API로 place ID 검색"""
    ua = random.choice(USER_AGENTS)
    headers = {
        "User-Agent": ua,
        "Referer": "https://map.naver.com/",
        "Accept": "application/json, text/plain, */*",
    }

    # 이름만으로 먼저 검색, 결과가 여러 개면 주소로 매칭
    for query in [name, f"{name} {address}".strip()]:
        encoded = quote(query)
        url = f"https://map.naver.com/p/api/search/instant-search?query={encoded}&coords={COORDS}"
        try:
            r = requests.get(url, headers=headers, timeout=10)
            if r.status_code == 200:
                data = r.json()
                places = data.get("place", [])
                if not places:
                    continue

                # 주소가 있으면 주소 매칭으로 최적 결과 선택
                if address and len(places) > 1:
                    for p in places:
                        road = p.get("roadAddress", "")
                        jibun = p.get("jibunAddress", "")
                        if address in road or address in jibun:
                            return p["id"], p["title"]

                # 첫 번째 결과 반환
                return places[0]["id"], places[0]["title"]
        except Exception:
            continue

    return None, None


def get_current_season_hours(seasonal_entries):
    """현재 월에 해당하는 계절별 영업시간 선택"""
    current_month = datetime.now().month

    for entry in seasonal_entries:
        season_text = entry.get("season", "")
        time_text = entry.get("time", "")

        if not season_text or not time_text:
            continue

        # 계절 범위 파싱: "1~2/11~12월", "3~5/9~10월", "6월~8월"
        # 월 숫자 추출
        months = set()
        # "1~2" 패턴
        ranges = re.findall(r"(\d{1,2})\s*[~\-]\s*(\d{1,2})", season_text)
        for start, end in ranges:
            s, e = int(start), int(end)
            if s <= e:
                months.update(range(s, e + 1))
            else:
                months.update(range(s, 13))
                months.update(range(1, e + 1))

        # 단독 월: "6월" (범위에 포함되지 않은 것)
        singles = re.findall(r"(\d{1,2})월", season_text)
        for m in singles:
            months.add(int(m))

        if current_month in months:
            return time_text

    # 매칭 안 되면 첫 번째 엔트리 사용
    if seasonal_entries:
        return seasonal_entries[0].get("time", "")
    return ""


def parse_hours_section(lines):
    """
    영업시간 섹션의 라인들을 파싱하여 hours dict 반환

    지원 포맷:
    1) 매일 10:00 - 22:00
    2) 월\n09:00 - 17:00  (요일별)
    3) 월\n1~2/11~12월\t09:00 - 17:00  (계절별)
    4) 정기휴무 (매주 화요일)
    5) 10:30 - 익일 01:00  (다음날까지 영업)
    """
    hours = {}
    holidays = []
    notes = []
    current_day = None  # 현재 처리 중인 요일
    seasonal_entries = []  # 계절별 시간 임시 저장

    # 시간 패턴: "09:00 - 17:00", "10:30 - 익일 01:00", "10:30 - 다음 날 01:00"
    TIME_PATTERN = r"(\d{1,2}:\d{2})\s*[-~]\s*(?:(?:익일|다음\s*날)\s*)?(\d{1,2}:\d{2})"

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 무시할 라인
        if line in ["접기", "영업시간 수정 제안하기", "운영 중", "영업 중",
                     "영업 전", "영업종료", "곧 영업종료"]:
            continue

        # 요약 라인 (예: "17:00에 운영 종료", "20:30에 라스트오더") → 건너뛰기
        if re.match(r".*에\s*(운영\s*종료|라스트\s*오더|영업\s*종료)", line):
            continue
        # "20시 30분에 라스트오더" 형태도 건너뛰기
        if re.match(r"\d+시.*라스트\s*오더", line):
            continue

        # 정기휴무 라인
        if "정기휴무" in line or ("휴무" in line and "매주" in line):
            holidays.append(line)
            if current_day:
                hours[current_day] = {"open": "", "close": "", "dayOff": True}
            continue

        # 비고/안내 라인 (- 로 시작)
        if line.startswith("-") or line.startswith("·"):
            text = line.lstrip("-·").strip()
            if text:
                notes.append(text)
                # 특별 휴무 정보 추출
                if "휴무" in text:
                    holidays.append(text)
            continue

        # "매일" 키워드
        if line.startswith("매일"):
            current_day = "all"
            # 같은 줄에 시간 있으면 바로 처리
            time_match = re.search(TIME_PATTERN, line)
            if time_match:
                for d in ALL_DAYS:
                    hours[d] = {"open": time_match.group(1), "close": time_match.group(2), "dayOff": False}
                current_day = None
            continue

        # 요일 키워드 (한 글자: 월, 화, ...)
        if line in DAY_MAP:
            # 이전 요일의 계절별 데이터 처리
            if current_day and seasonal_entries:
                time_text = get_current_season_hours(seasonal_entries)
                time_match = re.search(r"(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})", time_text)
                if time_match:
                    hours[current_day] = {"open": time_match.group(1), "close": time_match.group(2), "dayOff": False}
                seasonal_entries = []

            current_day = DAY_MAP[line]
            continue

        # 현재 요일이 설정된 상태에서 시간 라인 처리
        if current_day:
            # 계절 + 시간: "1~2/11~12월\t09:00 - 17:00"
            season_time = re.match(r"(.+?)\s*[\t]\s*(.+)", line)
            if season_time:
                season_text = season_time.group(1)
                time_text = season_time.group(2)

                # 정기휴무 체크
                if "정기휴무" in time_text or "휴무" in time_text:
                    seasonal_entries.append({"season": season_text, "time": "", "dayOff": True})
                    # 현재 월에 해당하면 휴무 적용
                    current_month = datetime.now().month
                    months = set()
                    ranges = re.findall(r"(\d{1,2})\s*[~\-]\s*(\d{1,2})", season_text)
                    for s, e in ranges:
                        si, ei = int(s), int(e)
                        if si <= ei:
                            months.update(range(si, ei + 1))
                    singles = re.findall(r"(\d{1,2})월", season_text)
                    for m in singles:
                        months.add(int(m))
                    if current_month in months:
                        hours[current_day] = {"open": "", "close": "", "dayOff": True}
                        holiday_text = time_text.strip()
                        if holiday_text and holiday_text not in holidays:
                            holidays.append(holiday_text)
                else:
                    seasonal_entries.append({"season": season_text, "time": time_text})
                continue

            # 단순 시간: "09:00 - 17:00", "10:30 - 21:00", "10:30 - 익일 01:00"
            time_match = re.search(TIME_PATTERN, line)
            if time_match:
                if current_day == "all":
                    for d in ALL_DAYS:
                        hours[d] = {"open": time_match.group(1), "close": time_match.group(2), "dayOff": False}
                else:
                    hours[current_day] = {"open": time_match.group(1), "close": time_match.group(2), "dayOff": False}
                seasonal_entries = []
                continue

            # 라스트오더 정보: "20:30 라스트오더"
            if "라스트오더" in line:
                # 이건 메모로 저장 (시간 변경 안 함)
                continue

    # 마지막 요일의 계절별 데이터 처리
    if current_day and seasonal_entries:
        time_text = get_current_season_hours(seasonal_entries)
        time_match = re.search(r"(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})", time_text)
        if time_match:
            hours[current_day] = {"open": time_match.group(1), "close": time_match.group(2), "dayOff": False}

    return hours, holidays, notes


def crawl_detail_page(page, place_id, name):
    """Playwright로 네이버 플레이스 상세 페이지에서 영업시간 추출"""
    detail_url = f"https://pcmap.place.naver.com/place/{place_id}/home"

    try:
        page.goto(detail_url, wait_until="domcontentloaded")
        random_delay(3, 5)

        # "펼쳐보기" 버튼 클릭 (영업시간 섹션)
        expand_buttons = page.query_selector_all("text=펼쳐보기")
        if expand_buttons:
            try:
                expand_buttons[0].click()
                random_delay(1, 2)
            except Exception:
                pass

        # 전체 텍스트에서 영업시간 섹션 추출
        body = page.inner_text("body")
        lines = body.split("\n")

        # 영업시간 섹션 찾기: "영업시간" 또는 "운영시간" ~ 다음 섹션
        hours_lines = []
        in_section = False
        end_keywords = ["전화번호", "홈페이지", "편의", "설명", "가격표", "메뉴",
                        "TV방송정보", "페이스북", "인스타그램", "지식백과"]

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            if stripped in ["영업시간", "운영시간"]:
                in_section = True
                continue

            if in_section:
                if stripped in end_keywords or stripped.startswith("http"):
                    break
                hours_lines.append(stripped)

        if hours_lines:
            hours, holidays, notes = parse_hours_section(hours_lines)
            return hours, holidays, notes
        else:
            return {}, [], []

    except Exception as e:
        print(f"  [ERR] 상세 페이지 크롤링 실패: {e}")
        return {}, [], []


def crawl_place(page, name, address=""):
    """장소 크롤링: API 검색 → 상세 페이지 추출"""
    result = {"name": name, "hours": {}, "holidays": [], "notes": [], "crawledAt": None}

    # 1단계: API로 place ID 검색
    place_id, matched_name = search_place_id(name, address)
    if not place_id:
        print(f"  [--] place ID를 찾지 못함")
        return result

    print(f"  [ID] {place_id} ({matched_name})")
    result["placeId"] = place_id
    result["matchedName"] = matched_name

    # 2단계: 상세 페이지에서 영업시간 추출
    hours, holidays, notes = crawl_detail_page(page, place_id, name)

    if hours:
        result["hours"] = hours
        result["holidays"] = holidays
        result["notes"] = notes
        result["crawledAt"] = datetime.now().isoformat()
        day_count = sum(1 for v in hours.values() if not v.get("dayOff"))
        off_count = sum(1 for v in hours.values() if v.get("dayOff"))
        print(f"  [OK] 영업 {day_count}일, 휴무 {off_count}일")
    else:
        print(f"  [--] 영업시간 정보 없음")

    return result


def main():
    if not INPUT_FILE.exists():
        print(f"입력 파일 없음: {INPUT_FILE}")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    places = data.get("places", [])
    if not places:
        print("크롤링할 장소가 없습니다.")
        return

    print(f"총 {len(places)}개 장소 크롤링 시작")
    print("=" * 50)

    # 기존 결과 로드
    existing = {}
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            old_data = json.load(f)
            for item in old_data.get("results", []):
                existing[item["name"]] = item

    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
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
        page = context.new_page()

        for i, place in enumerate(places):
            name = place.get("name", "")
            address = place.get("address", "")
            place_id_input = place.get("id", "")

            if not name:
                continue

            print(f"[{i+1}/{len(places)}] {name}")

            result = crawl_place(page, name, address)
            result["id"] = place_id_input

            # 크롤링 실패 시 기존 데이터 유지
            if not result["hours"] and name in existing:
                result["hours"] = existing[name].get("hours", {})
                result["holidays"] = existing[name].get("holidays", [])
                result["notes"] = existing[name].get("notes", [])
                result["crawledAt"] = existing[name].get("crawledAt")
                print(f"  [기존] 이전 크롤링 데이터 유지")

            results.append(result)

            if i < len(places) - 1:
                random_delay(3, 6)

        browser.close()

    # 결과 저장
    output = {
        "updatedAt": datetime.now().isoformat(),
        "totalPlaces": len(places),
        "successCount": sum(1 for r in results if r["hours"]),
        "results": results
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print("=" * 50)
    print(f"완료: {output['successCount']}/{output['totalPlaces']}개 성공")
    print(f"저장: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
