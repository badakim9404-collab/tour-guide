"""
크롤링 결과를 원격 최신 데이터에 병합하는 스크립트.
GitHub Actions에서 rebase 충돌 방지를 위해 사용.

사용법: python scripts/merge_hours.py /tmp/places.json /tmp/business-hours.json
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLACES_FILE = ROOT / "data" / "places.json"
HOURS_FILE = ROOT / "data" / "business-hours.json"


def main():
    if len(sys.argv) != 3:
        print("Usage: python merge_hours.py <crawled_places> <crawled_hours>")
        sys.exit(1)

    crawled_places_path = sys.argv[1]
    crawled_hours_path = sys.argv[2]

    # 1) 크롤링된 places.json에서 businessHours 추출
    with open(crawled_places_path, "r", encoding="utf-8") as f:
        crawled_places = json.load(f)

    hours_by_id = {}
    hours_by_name = {}
    for p in crawled_places:
        bh = p.get("businessHours")
        if bh:
            if p.get("id"):
                hours_by_id[p["id"]] = bh
            if p.get("name"):
                hours_by_name[p["name"]] = bh

    # 2) 원격 최신 places.json 읽기 (git pull 후 상태)
    with open(PLACES_FILE, "r", encoding="utf-8") as f:
        current_places = json.load(f)

    # 3) businessHours 병합
    updated = 0
    for p in current_places:
        bh = hours_by_id.get(p.get("id")) or hours_by_name.get(p.get("name"))
        if bh:
            p["businessHours"] = bh
            updated += 1

    # 4) 저장
    with open(PLACES_FILE, "w", encoding="utf-8") as f:
        json.dump(current_places, f, ensure_ascii=False, indent=2)

    # 5) business-hours.json 복사
    with open(crawled_hours_path, "r", encoding="utf-8") as f:
        hours_data = json.load(f)
    with open(HOURS_FILE, "w", encoding="utf-8") as f:
        json.dump(hours_data, f, ensure_ascii=False, indent=2)

    print(f"Merged businessHours for {updated} places")


if __name__ == "__main__":
    main()
