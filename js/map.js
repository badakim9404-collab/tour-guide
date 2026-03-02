// ===== 지도 연동 (Leaflet + OpenStreetMap) =====

const MapView = {
    map: null,
    markerLayer: null,
    markers: [],
    places: [],

    // 지도 뷰 렌더링
    async render() {
        const main = document.getElementById('mainContent');
        const categories = await DB.getCategories();
        this.places = await DB.getPlaces();

        let html = `<div class="map-container">
                        <div id="leafletMap"></div>`;

        // 검색 바
        html += `<div class="map-search-panel">
                    <form id="mapSearchForm" action="javascript:void(0)">
                        <div class="map-search-wrapper">
                            <button type="submit" class="search-submit-btn" title="검색">
                                <i class="fas fa-search"></i>
                            </button>
                            <input type="text" id="mapSearchInput" placeholder="장소 검색...">
                            <button type="button" class="search-clear-btn" id="mapSearchClear" style="display:none">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </form>
                 </div>`;

        // 필터 패널
        html += `<div class="map-filter-panel">
                    <h4><i class="fas fa-filter"></i> 필터</h4>
                    <div class="filter-item">
                        <input type="checkbox" id="filterRestaurant" checked>
                        <label for="filterRestaurant">맛집</label>
                    </div>
                    <div class="filter-item">
                        <input type="checkbox" id="filterTourspot" checked>
                        <label for="filterTourspot">투어장소</label>
                    </div>
                    <div class="filter-item">
                        <input type="checkbox" id="filterEtc" checked>
                        <label for="filterEtc">기타</label>
                    </div>
                    <hr style="margin:8px 0; border:none; border-top:1px solid var(--gray-200);">
                    <h4>방문 여부</h4>
                    <div class="filter-item">
                        <input type="checkbox" id="filterVisited" checked>
                        <label for="filterVisited">방문</label>
                    </div>
                    <div class="filter-item">
                        <input type="checkbox" id="filterNotVisited" checked>
                        <label for="filterNotVisited">미방문</label>
                    </div>
                    <hr style="margin:8px 0; border:none; border-top:1px solid var(--gray-200);">
                    <h4>투어별</h4>
                    <div class="filter-item">
                        <input type="checkbox" class="filter-cat" value="" checked>
                        <label>전체</label>
                    </div>`;

        categories.forEach(cat => {
            html += `<div class="filter-item">
                        <input type="checkbox" class="filter-cat" value="${cat.id}" checked>
                        <label>${Utils.escapeHtml(cat.name)}</label>
                     </div>`;
        });

        html += `</div>`;

        // 범례
        html += `<div class="map-legend">
                    <div class="legend-item"><div class="legend-marker food"></div> 맛집</div>
                    <div class="legend-item"><div class="legend-marker tour"></div> 투어장소</div>
                    <div class="legend-item"><div class="legend-marker etc"></div> 기타</div>
                    <div class="legend-item"><span class="commission-star">★</span> 수수료</div>
                    <div class="legend-item"><span class="marker-visited-check" style="position:static;width:14px;height:14px;font-size:7px;"><i class="fas fa-check"></i></span> 방문</div>
                    <div class="legend-item"><span class="status-dot open"></span> 영업중</div>
                    <div class="legend-item"><span class="status-dot closed"></span> 영업종료</div>
                    <div class="legend-item"><span class="status-dot permanently-closed"></span> 폐업</div>
                 </div>`;

        html += `</div>`;
        main.innerHTML = html;

        this._initMap();

        // 필터 이벤트
        main.querySelectorAll('#filterRestaurant, #filterTourspot, #filterEtc, #filterVisited, #filterNotVisited, .filter-cat').forEach(cb => {
            cb.addEventListener('change', () => this._applyFilter());
        });

        // 지도 검색 이벤트
        const searchForm = document.getElementById('mapSearchForm');
        const searchInput = document.getElementById('mapSearchInput');
        const searchClear = document.getElementById('mapSearchClear');

        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const keyword = searchInput.value.trim();
            if (keyword) {
                this._searchPlaces(keyword);
                searchClear.style.display = 'flex';
            }
        });

        searchInput.addEventListener('input', () => {
            searchClear.style.display = searchInput.value ? 'flex' : 'none';
        });

        // 자동완성 연결 (이름/주소/주요정보(메뉴) 기반)
        Utils.attachAutocomplete(searchInput, async (keyword) => {
            const kw = keyword.toLowerCase();
            const matched = this.places
                .filter(p => (p.name && p.name.toLowerCase().includes(kw)) ||
                             (p.address && p.address.toLowerCase().includes(kw)) ||
                             (p.description && p.description.toLowerCase().includes(kw)));

            // 메뉴/주요정보 매칭이 2개 이상이면 "전체 검색" 옵션 상단에 추가
            const descMatches = matched.filter(p =>
                p.description && p.description.toLowerCase().includes(kw) &&
                !(p.name && p.name.toLowerCase().includes(kw)));
            const results = [];
            if (descMatches.length >= 2) {
                results.push({
                    label: `'${keyword}' 전체 검색`,
                    sub: `${matched.length}개 장소에서 발견`,
                    icon: 'fa-search',
                    _searchKeyword: keyword
                });
            }

            matched.forEach(p => {
                const nameMatch = p.name && p.name.toLowerCase().includes(kw);
                let sub = p.address || '';
                if (!nameMatch && p.description && p.description.toLowerCase().includes(kw)) {
                    sub = this._getMatchExcerpt(p.description, kw);
                }
                results.push({
                    label: p.name,
                    sub: sub,
                    icon: p.type === 'restaurant' ? 'fa-utensils' : p.type === 'etc' ? 'fa-tag' : 'fa-camera',
                    _searchKeyword: null
                });
            });
            return results;
        }, (item) => {
            // "전체 검색" 항목이면 원래 키워드로, 개별 장소면 장소명으로 검색
            const keyword = item._searchKeyword || item.label;
            searchInput.value = keyword;
            searchClear.style.display = 'flex';
            this._searchPlaces(keyword);
        });

        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            searchClear.style.display = 'none';
            this._clearSearch();
        });
    },

    _initMap() {
        const container = document.getElementById('leafletMap');

        // 서울 중심 좌표
        this.map = L.map(container).setView([37.5665, 126.9780], 12);

        // OpenStreetMap 타일
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);

        this.markerLayer = L.layerGroup().addTo(this.map);

        // Leaflet이 컨테이너 크기를 정확히 인식하도록 지연 호출
        setTimeout(() => {
            this.map.invalidateSize();
            this._renderMarkers();
        }, 200);
    },

    _createIcon(place) {
        const color = place.type === 'restaurant' ? '#E74C3C' : place.type === 'etc' ? '#F39C12' : '#4A90D9';
        const iconClass = place.type === 'restaurant' ? 'fa-utensils' : place.type === 'etc' ? 'fa-tag' : 'fa-camera';
        const commissionStar = place.hasCommission ? '<span class="marker-commission-star">★</span>' : '';
        const visitedCheck = place.visited ? '<span class="marker-visited-check"><i class="fas fa-check"></i></span>' : '';

        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="
                position:relative; width:32px; height:32px; border-radius:50%;
                background:${color}; display:flex; align-items:center;
                justify-content:center; color:white; font-size:13px;
                box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid white;
            "><i class="fas ${iconClass}"></i>${commissionStar}${visitedCheck}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -34]
        });
    },

    // 고정 팝업 없는 호버용 (간략 정보)
    _buildTooltipContent(place) {
        const status = Utils.getBusinessStatus(place);
        const commissionStar = place.hasCommission ? ' <span class="commission-star">★</span>' : '';
        const visitedIcon = place.visited ? ' <i class="fas fa-check-circle" style="color:var(--success);font-size:0.75rem;"></i>' : '';
        const rating = place.rating || 0;
        let ratingText = '';
        if (rating > 0) {
            ratingText = '<span style="color:var(--warning);font-size:0.75rem;">';
            for (let i = 0; i < rating; i++) ratingText += '★';
            ratingText += '</span>';
        }
        return `
            <div class="info-window">
                <h4>${Utils.escapeHtml(place.name)}${commissionStar}${visitedIcon}</h4>
                <div class="info-status">
                    <span class="status-dot ${status.status}"></span>
                    <span>${Utils.escapeHtml(status.text)}</span>
                    ${ratingText}
                </div>
            </div>
        `;
    },

    // 클릭 고정용 (상세 정보 + X 닫기)
    _buildPopupContent(place) {
        const status = Utils.getBusinessStatus(place);
        const today = Utils.getCurrentDay();
        const todayHours = place.businessHours ? place.businessHours[today] : null;
        let hoursText = '영업시간 미등록';
        if (todayHours && todayHours.open && todayHours.close && !todayHours.dayOff) {
            hoursText = `오늘 ${todayHours.open} ~ ${todayHours.close}`;
        } else if (todayHours && todayHours.dayOff) {
            hoursText = '오늘 휴무';
        }

        const commissionStar = place.hasCommission ? ' <span class="commission-star">★</span>' : '';
        const commissionInfo = place.hasCommission && place.commissionDetail
            ? `<div class="info-commission"><span class="commission-star">★</span> 수수료: ${Utils.escapeHtml(place.commissionDetail)}</div>`
            : place.hasCommission
            ? `<div class="info-commission"><span class="commission-star">★</span> 수수료 있음</div>`
            : '';

        // 방문/평점 정보
        let visitedInfo = '';
        if (place.visited) {
            let stars = '';
            if (place.rating > 0) {
                for (let i = 0; i < place.rating; i++) stars += '★';
                stars = ` <span style="color:var(--warning)">${stars}</span>`;
            }
            visitedInfo = `<div class="info-visited"><i class="fas fa-check-circle" style="color:var(--success)"></i> 방문 완료${stars}</div>`;
        }

        return `
            <div class="info-window">
                <h4>${Utils.escapeHtml(place.name)}${commissionStar}</h4>
                <div class="info-status">
                    <span class="status-dot ${status.status}"></span>
                    <span>${Utils.escapeHtml(status.text)}</span>
                </div>
                ${place.description ? `<div class="info-desc">${Utils.escapeHtml(Utils.truncate(place.description, 60))}</div>` : ''}
                <div class="info-hours"><i class="fas fa-clock"></i> ${Utils.escapeHtml(hoursText)}</div>
                ${place.address ? `<div class="info-hours"><i class="fas fa-map-marker-alt"></i> ${Utils.escapeHtml(Utils.truncate(place.address, 30))}</div>` : ''}
                ${visitedInfo}
                ${commissionInfo}
            </div>
        `;
    },

    _renderMarkers() {
        this.markerLayer.clearLayers();
        this.markers = [];
        this._pinnedPopup = null;

        const bounds = [];

        this.places.forEach(place => {
            if (!place.lat || !place.lng) return;

            const latlng = [place.lat, place.lng];
            bounds.push(latlng);

            const marker = L.marker(latlng, { icon: this._createIcon(place) });
            marker.placeData = place;

            // 호버: 툴팁 (마우스 떼면 사라짐)
            marker.bindTooltip(this._buildTooltipContent(place), {
                direction: 'top',
                offset: [0, -34],
                opacity: 0.95,
                className: 'leaflet-tooltip-custom'
            });

            // 클릭: 팝업 고정 (X 버튼으로 닫기)
            marker.bindPopup(this._buildPopupContent(place), {
                maxWidth: 280,
                closeButton: true,
                autoClose: false,
                closeOnClick: false,
                className: 'leaflet-popup-custom'
            });

            // 클릭 시 툴팁 숨기고 팝업 표시
            marker.on('click', () => {
                marker.closeTooltip();
                this._pinnedPopup = marker;
            });

            // 팝업이 고정되어 있으면 호버 툴팁 억제
            marker.on('mouseover', () => {
                if (this._pinnedPopup === marker && marker.isPopupOpen()) {
                    marker.closeTooltip();
                }
            });

            // 팝업 닫힐 때 상태 초기화
            marker.on('popupclose', () => {
                if (this._pinnedPopup === marker) {
                    this._pinnedPopup = null;
                }
            });

            marker.addTo(this.markerLayer);
            this.markers.push(marker);
        });

        // 마커가 있으면 범위에 맞게 줌
        if (bounds.length > 0) {
            this.map.fitBounds(bounds, { padding: [40, 40] });
        }
    },

    // 주요정보(메뉴) 매칭 시 키워드 주변 텍스트 발췌
    _getMatchExcerpt(text, keyword) {
        const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
        if (idx === -1) return text.substring(0, 30);
        const start = Math.max(0, idx - 10);
        const end = Math.min(text.length, idx + keyword.length + 20);
        let excerpt = text.substring(start, end).trim();
        if (start > 0) excerpt = '...' + excerpt;
        if (end < text.length) excerpt = excerpt + '...';
        return excerpt;
    },

    _searchPlaces(keyword) {
        const kw = keyword.toLowerCase();
        const bounds = [];

        this.markers.forEach(marker => {
            const place = marker.placeData;
            const match = (place.name && place.name.toLowerCase().includes(kw)) ||
                          (place.address && place.address.toLowerCase().includes(kw)) ||
                          (place.description && place.description.toLowerCase().includes(kw)) ||
                          (place.memo && place.memo.toLowerCase().includes(kw));

            if (match) {
                this.markerLayer.addLayer(marker);
                bounds.push([place.lat, place.lng]);
            } else {
                this.markerLayer.removeLayer(marker);
            }
        });

        if (bounds.length > 0) {
            if (bounds.length === 1) {
                this.map.setView(bounds[0], 16);
                const matched = this.markers.find(m => this.markerLayer.hasLayer(m));
                if (matched) matched.openPopup();
            } else {
                this.map.fitBounds(bounds, { padding: [40, 40] });
            }
            Utils.showToast(`'${keyword}' 검색 결과: ${bounds.length}개 장소`);
        } else {
            Utils.showToast('일치하는 장소가 없습니다');
        }
    },

    _clearSearch() {
        // 모든 마커 복원 후 필터 재적용
        this.markers.forEach(marker => {
            this.markerLayer.addLayer(marker);
        });
        this._applyFilter();

        if (this.markers.length > 0) {
            const bounds = this.markers
                .filter(m => this.markerLayer.hasLayer(m))
                .map(m => [m.placeData.lat, m.placeData.lng]);
            if (bounds.length > 0) {
                this.map.fitBounds(bounds, { padding: [40, 40] });
            }
        }
    },

    _applyFilter() {
        const showRestaurant = document.getElementById('filterRestaurant').checked;
        const showTourspot = document.getElementById('filterTourspot').checked;
        const showEtc = document.getElementById('filterEtc').checked;
        const showVisited = document.getElementById('filterVisited').checked;
        const showNotVisited = document.getElementById('filterNotVisited').checked;

        const checkedCats = [];
        let allCatsChecked = false;
        document.querySelectorAll('.filter-cat').forEach(cb => {
            if (cb.value === '' && cb.checked) allCatsChecked = true;
            if (cb.value && cb.checked) checkedCats.push(cb.value);
        });

        this.markers.forEach(marker => {
            const place = marker.placeData;
            let visible = true;

            if (place.type === 'restaurant' && !showRestaurant) visible = false;
            if (place.type === 'tourspot' && !showTourspot) visible = false;
            if (place.type === 'etc' && !showEtc) visible = false;

            // 방문 여부 필터
            if (place.visited && !showVisited) visible = false;
            if (!place.visited && !showNotVisited) visible = false;

            if (!allCatsChecked && place.categoryId && !checkedCats.includes(place.categoryId)) {
                visible = false;
            }

            if (visible) {
                this.markerLayer.addLayer(marker);
            } else {
                this.markerLayer.removeLayer(marker);
            }
        });
    }
};
