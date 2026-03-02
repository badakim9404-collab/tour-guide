// ===== 장소 관리 =====

const Place = {
    // 로컬 크롤링 서버로 영업시간 가져오기
    async crawlBusinessHours(name, address) {
        const params = new URLSearchParams({ name, address });
        const res = await fetch(`/api/crawl?${params}`);
        if (!res.ok) return null;
        return res.json();
    },

    // 장소 목록 렌더링
    async renderList() {
        const main = document.getElementById('mainContent');
        const places = await DB.getPlaces();
        const categories = await DB.getCategories();

        let html = `<div class="place-section">`;
        html += `<div class="place-list-header">
                    <h2><i class="fas fa-map-pin"></i> 장소 관리</h2>
                    <button class="btn btn-primary" id="addPlaceBtn">
                        <i class="fas fa-plus"></i> 장소 등록
                    </button>
                 </div>`;

        if (places.length === 0) {
            html += `<div class="empty-state">
                        <i class="fas fa-map-marker-alt"></i>
                        <h3>등록된 장소가 없습니다</h3>
                        <p>장소 등록 버튼을 눌러 맛집이나 투어 장소를 추가하세요</p>
                     </div>`;
        } else {
            html += `<table class="place-table">
                        <thead>
                            <tr>
                                <th>이름</th>
                                <th>유형</th>
                                <th>방문</th>
                                <th>평점</th>
                                <th>투어</th>
                                <th>상태</th>
                                <th>주소</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>`;

            for (const place of places) {
                const status = Utils.getBusinessStatus(place);
                const typeBadge = place.type === 'restaurant'
                    ? '<span class="place-type-badge restaurant"><i class="fas fa-utensils"></i> 맛집</span>'
                    : place.type === 'etc'
                    ? '<span class="place-type-badge etc"><i class="fas fa-tag"></i> 기타</span>'
                    : '<span class="place-type-badge tourspot"><i class="fas fa-camera"></i> 투어장소</span>';

                const commissionStar = place.hasCommission ? ' <span class="commission-star">★</span>' : '';

                // 방문 여부 배지
                const visitedBadge = place.visited
                    ? '<span class="visited-badge visited"><i class="fas fa-check"></i> 방문</span>'
                    : '<span class="visited-badge not-visited">미방문</span>';

                // 평점 별
                const rating = place.rating || 0;
                let ratingHtml = '<span class="rating-stars">';
                for (let i = 1; i <= 5; i++) {
                    ratingHtml += `<span class="star ${i <= rating ? 'filled' : ''}">★</span>`;
                }
                ratingHtml += '</span>';
                if (rating === 0) ratingHtml = '<span style="color:var(--gray-400); font-size:0.8rem;">-</span>';

                // 투어 카테고리 이름
                let tourName = '-';
                if (place.categoryId) {
                    const cat = categories.find(c => c.id === place.categoryId);
                    if (cat) tourName = cat.name;
                }

                html += `<tr>
                            <td><strong>${Utils.escapeHtml(place.name)}</strong>${commissionStar}</td>
                            <td>${typeBadge}</td>
                            <td>${visitedBadge}</td>
                            <td>${ratingHtml}</td>
                            <td>${Utils.escapeHtml(tourName)}</td>
                            <td>
                                <span class="status-dot ${status.status}"></span>
                                ${Utils.escapeHtml(status.text)}
                            </td>
                            <td>${Utils.escapeHtml(Utils.truncate(place.address || '', 20))}</td>
                            <td>
                                <button class="btn btn-icon btn-sm edit-place" data-place-id="${place.id}" title="수정">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-icon btn-sm delete-place" data-place-id="${place.id}" title="삭제">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </td>
                         </tr>`;
            }

            html += `</tbody></table>`;
        }

        html += `</div>`;
        main.innerHTML = html;

        // 이벤트
        document.getElementById('addPlaceBtn').addEventListener('click', () => {
            this.renderForm();
        });

        main.querySelectorAll('.edit-place').forEach(btn => {
            btn.addEventListener('click', () => {
                this.renderForm(btn.dataset.placeId);
            });
        });

        main.querySelectorAll('.delete-place').forEach(btn => {
            btn.addEventListener('click', () => {
                App.showConfirm('이 장소를 삭제하시겠습니까?', async () => {
                    await DB.deletePlace(btn.dataset.placeId);
                    Utils.showToast('삭제되었습니다');
                    this.renderList();
                });
            });
        });
    },

    // 장소 등록/편집 폼
    async renderForm(placeId) {
        const main = document.getElementById('mainContent');
        const isEdit = !!placeId;
        let place = null;

        if (isEdit) {
            place = await DB.getPlace(placeId);
            if (!place) {
                main.innerHTML = `<div class="empty-state"><h3>장소를 찾을 수 없습니다</h3></div>`;
                return;
            }
        } else {
            place = {
                name: '', type: 'restaurant', categoryId: '',
                address: '', lat: null, lng: null,
                description: '', memo: '', isClosed: false,
                hasCommission: false, commissionDetail: '',
                visited: false, rating: 0,
                businessHours: {}
            };
        }

        const categories = await DB.getCategories();
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

        let html = `<div class="form-section">`;
        html += `<h2>${isEdit ? '장소 수정' : '장소 등록'}</h2>`;

        // 기본 정보
        html += `<div class="form-group">
                    <label>장소명 *</label>
                    <input type="text" id="placeName" value="${Utils.escapeHtml(place.name)}" placeholder="장소 이름">
                 </div>`;

        html += `<div class="form-row">
                    <div class="form-group">
                        <label>유형</label>
                        <select id="placeType">
                            <option value="restaurant" ${place.type === 'restaurant' ? 'selected' : ''}>맛집</option>
                            <option value="tourspot" ${place.type === 'tourspot' ? 'selected' : ''}>투어장소</option>
                            <option value="etc" ${place.type === 'etc' ? 'selected' : ''}>기타</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>연결 투어</label>
                        <select id="placeCategoryId">
                            <option value="">선택 안함</option>`;
        categories.forEach(cat => {
            html += `<option value="${cat.id}" ${place.categoryId === cat.id ? 'selected' : ''}>${Utils.escapeHtml(cat.name)}</option>`;
        });
        html += `</select></div></div>`;

        // 주소
        html += `<div class="form-group">
                    <label>주소</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="placeAddress" value="${Utils.escapeHtml(place.address || '')}" placeholder="주소 입력" style="flex:1">
                        <button class="btn btn-secondary" id="geocodeBtn" type="button">
                            <i class="fas fa-search"></i> 좌표 변환
                        </button>
                    </div>
                    <div id="geocodeResult" style="font-size: 0.8rem; color: var(--gray-500); margin-top: 4px;">
                        ${place.lat ? `위도: ${place.lat}, 경도: ${place.lng}` : ''}
                    </div>
                    <input type="hidden" id="placeLat" value="${place.lat || ''}">
                    <input type="hidden" id="placeLng" value="${place.lng || ''}">
                 </div>`;

        // 주요 정보
        html += `<div class="form-group">
                    <label>주요 정보</label>
                    <textarea id="placeDesc" style="min-height:80px" placeholder="메뉴, 가격대, 특징 등">${Utils.escapeHtml(place.description || '')}</textarea>
                 </div>`;

        // 방문 여부 & 평점
        const currentRating = place.rating || 0;
        html += `<div class="form-row">
                    <div class="form-group">
                        <label>방문 여부</label>
                        <div style="padding-top:6px;">
                            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-weight:400;">
                                <input type="checkbox" id="placeVisited" ${place.visited ? 'checked' : ''}>
                                <span>방문 완료</span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>내 평점</label>
                        <div class="rating-input" id="ratingInput">
                            <span class="star ${currentRating >= 1 ? 'filled' : ''}" data-value="1">★</span>
                            <span class="star ${currentRating >= 2 ? 'filled' : ''}" data-value="2">★</span>
                            <span class="star ${currentRating >= 3 ? 'filled' : ''}" data-value="3">★</span>
                            <span class="star ${currentRating >= 4 ? 'filled' : ''}" data-value="4">★</span>
                            <span class="star ${currentRating >= 5 ? 'filled' : ''}" data-value="5">★</span>
                        </div>
                        <input type="hidden" id="placeRating" value="${currentRating}">
                    </div>
                 </div>`;

        // 영업시간
        html += `<div class="form-group">
                    <label>영업시간</label>
                    <div class="hours-grid" id="hoursGrid">`;

        days.forEach(day => {
            const h = (place.businessHours && place.businessHours[day]) || {};
            const isDayOff = h.dayOff || false;
            html += `<div class="hours-row">
                        <label>${Utils.dayLabels[day]}</label>
                        <input type="time" class="hour-open" data-day="${day}" value="${h.open || ''}" ${isDayOff ? 'disabled' : ''}>
                        <span>~</span>
                        <input type="time" class="hour-close" data-day="${day}" value="${h.close || ''}" ${isDayOff ? 'disabled' : ''}>
                        <div class="day-off-check">
                            <input type="checkbox" class="day-off" data-day="${day}" title="휴무" ${isDayOff ? 'checked' : ''}>
                        </div>
                     </div>`;
        });

        html += `</div>
                  <p style="font-size:0.75rem; color:var(--gray-500); margin-top:4px;">체크박스 = 해당 요일 휴무</p>
                 </div>`;

        // 휴무일 메모
        html += `<div class="form-group">
                    <label>휴무일/특이사항</label>
                    <input type="text" id="placeHolidays" value="${Utils.escapeHtml((place.businessHours && place.businessHours.holidays) ? place.businessHours.holidays.join(', ') : '')}" placeholder="예: 매주 월요일, 설날, 추석">
                 </div>`;

        // 수수료
        html += `<div class="form-group commission-section">
                    <label>
                        <input type="checkbox" id="placeHasCommission" ${place.hasCommission ? 'checked' : ''}>
                        수수료 있음
                    </label>
                    <textarea id="placeCommissionDetail" style="min-height:60px; margin-top:8px; ${place.hasCommission ? '' : 'display:none;'}" placeholder="수수료 세부 내용">${Utils.escapeHtml(place.commissionDetail || '')}</textarea>
                 </div>`;

        // 폐업 여부
        html += `<div class="form-group">
                    <label>
                        <input type="checkbox" id="placeIsClosed" ${place.isClosed ? 'checked' : ''}>
                        폐업
                    </label>
                 </div>`;

        // 메모
        html += `<div class="form-group">
                    <label>메모</label>
                    <textarea id="placeMemo" style="min-height:60px" placeholder="개인 메모">${Utils.escapeHtml(place.memo || '')}</textarea>
                 </div>`;

        // 버튼
        html += `<div class="form-actions">
                    <button class="btn btn-primary" id="savePlaceBtn">
                        <i class="fas fa-check"></i> ${isEdit ? '수정 완료' : '등록'}
                    </button>
                    <button class="btn btn-secondary" id="cancelPlaceBtn">취소</button>
                 </div>`;

        html += `</div>`;
        main.innerHTML = html;

        // 평점 별 클릭 이벤트
        const ratingInput = document.getElementById('ratingInput');
        const ratingHidden = document.getElementById('placeRating');
        ratingInput.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', () => {
                const val = parseInt(star.dataset.value);
                // 같은 별 다시 클릭하면 해제
                const current = parseInt(ratingHidden.value);
                const newVal = (current === val) ? 0 : val;
                ratingHidden.value = newVal;
                ratingInput.querySelectorAll('.star').forEach(s => {
                    s.classList.toggle('filled', parseInt(s.dataset.value) <= newVal);
                });
            });
            star.addEventListener('mouseenter', () => {
                const val = parseInt(star.dataset.value);
                ratingInput.querySelectorAll('.star').forEach(s => {
                    s.classList.toggle('hovered', parseInt(s.dataset.value) <= val && !s.classList.contains('filled'));
                });
            });
            star.addEventListener('mouseleave', () => {
                ratingInput.querySelectorAll('.star').forEach(s => {
                    s.classList.remove('hovered');
                });
            });
        });

        // 수수료 체크박스 토글
        document.getElementById('placeHasCommission').addEventListener('change', function() {
            const detail = document.getElementById('placeCommissionDetail');
            detail.style.display = this.checked ? '' : 'none';
            if (!this.checked) detail.value = '';
        });

        // 휴무 체크박스 토글
        main.querySelectorAll('.day-off').forEach(cb => {
            cb.addEventListener('change', () => {
                const day = cb.dataset.day;
                const openInput = main.querySelector(`.hour-open[data-day="${day}"]`);
                const closeInput = main.querySelector(`.hour-close[data-day="${day}"]`);
                openInput.disabled = cb.checked;
                closeInput.disabled = cb.checked;
                if (cb.checked) {
                    openInput.value = '';
                    closeInput.value = '';
                }
            });
        });

        // 좌표 변환 공통 함수
        async function geocodeAddress(address) {
            const query = encodeURIComponent(address);
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${query}&format=json&countrycodes=kr&limit=1`,
                { headers: { 'Accept-Language': 'ko' } }
            );
            const data = await res.json();
            if (data.length > 0) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
            return null;
        }

        // 좌표 변환 버튼 (수동)
        document.getElementById('geocodeBtn').addEventListener('click', async () => {
            const address = document.getElementById('placeAddress').value.trim();
            if (!address) {
                Utils.showToast('주소를 입력해주세요');
                return;
            }

            document.getElementById('geocodeResult').textContent = '검색 중...';
            try {
                const result = await geocodeAddress(address);
                if (result) {
                    document.getElementById('placeLat').value = result.lat;
                    document.getElementById('placeLng').value = result.lng;
                    document.getElementById('geocodeResult').textContent = `위도: ${result.lat}, 경도: ${result.lng}`;
                    Utils.showToast('좌표 변환 완료');
                } else {
                    document.getElementById('geocodeResult').textContent = '';
                    Utils.showToast('주소를 찾을 수 없습니다. 좀 더 구체적으로 입력해주세요.');
                }
            } catch (err) {
                document.getElementById('geocodeResult').textContent = '';
                Utils.showToast('좌표 변환 중 오류가 발생했습니다');
            }
        });

        // 저장
        document.getElementById('savePlaceBtn').addEventListener('click', async () => {
            const name = document.getElementById('placeName').value.trim();
            if (!name) {
                Utils.showToast('장소명을 입력해주세요');
                return;
            }

            const address = document.getElementById('placeAddress').value.trim();
            let lat = parseFloat(document.getElementById('placeLat').value) || null;
            let lng = parseFloat(document.getElementById('placeLng').value) || null;

            // 주소가 있는데 좌표가 없으면 자동 변환
            if (address && (!lat || !lng)) {
                Utils.showToast('주소에서 좌표를 변환하는 중...');
                try {
                    const result = await geocodeAddress(address);
                    if (result) {
                        lat = result.lat;
                        lng = result.lng;
                    } else {
                        Utils.showToast('좌표 변환 실패. 주소를 확인해주세요. 좌표 없이 저장됩니다.');
                    }
                } catch (err) {
                    Utils.showToast('좌표 변환 오류. 좌표 없이 저장됩니다.');
                }
            }

            // 영업시간 수집 (폼에 입력된 값)
            const businessHours = {};
            let hasManualHours = false;
            days.forEach(day => {
                const dayOff = main.querySelector(`.day-off[data-day="${day}"]`).checked;
                const open = main.querySelector(`.hour-open[data-day="${day}"]`).value;
                const close = main.querySelector(`.hour-close[data-day="${day}"]`).value;
                businessHours[day] = { open, close, dayOff };
                if (open || close || dayOff) hasManualHours = true;
            });

            const holidaysStr = document.getElementById('placeHolidays').value.trim();
            businessHours.holidays = holidaysStr ? holidaysStr.split(',').map(s => s.trim()).filter(Boolean) : [];

            // 영업시간이 비어있고 장소명+주소가 있으면 자동 크롤링 시도
            if (!hasManualHours && name && address) {
                Utils.showToast('네이버에서 영업시간을 가져오는 중...');
                try {
                    const crawled = await Place.crawlBusinessHours(name, address);
                    if (crawled && crawled.hours && Object.keys(crawled.hours).length > 0) {
                        Object.assign(businessHours, crawled.hours);
                        if (crawled.holidays && crawled.holidays.length > 0) {
                            businessHours.holidays = crawled.holidays;
                        }
                        Utils.showToast('영업시간 자동 입력 완료');
                    } else {
                        Utils.showToast('영업시간을 찾지 못했습니다. 수동 입력해주세요.');
                    }
                } catch (err) {
                    Utils.showToast('크롤링 서버에 연결할 수 없습니다. 수동 입력해주세요.');
                }
            }

            const data = {
                name,
                type: document.getElementById('placeType').value,
                categoryId: document.getElementById('placeCategoryId').value || null,
                address,
                lat,
                lng,
                description: document.getElementById('placeDesc').value.trim(),
                businessHours,
                hasCommission: document.getElementById('placeHasCommission').checked,
                commissionDetail: document.getElementById('placeCommissionDetail').value.trim(),
                visited: document.getElementById('placeVisited').checked,
                rating: parseInt(document.getElementById('placeRating').value) || 0,
                isClosed: document.getElementById('placeIsClosed').checked,
                memo: document.getElementById('placeMemo').value.trim()
            };

            if (isEdit) {
                data.id = place.id;
                data.createdAt = place.createdAt;
            }

            await DB.savePlace(data);
            Utils.showToast(isEdit ? '수정되었습니다' : '등록되었습니다');
            this.renderList();
        });

        // 취소
        document.getElementById('cancelPlaceBtn').addEventListener('click', () => {
            this.renderList();
        });
    }
};
