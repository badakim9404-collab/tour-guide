// ===== 유틸리티 함수들 =====

const Utils = {
    // ID 생성
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // 날짜 포맷
    formatDate(dateStr) {
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}.${m}.${day}`;
    },

    formatDateTime(dateStr) {
        const d = new Date(dateStr);
        return `${this.formatDate(dateStr)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    // 요일 이름
    dayNames: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    dayLabels: { mon: '월', tue: '화', wed: '수', thu: '목', fri: '금', sat: '토', sun: '일' },

    // 현재 요일 키
    getCurrentDay() {
        return this.dayNames[new Date().getDay()];
    },

    // 현재 시간 (HH:MM)
    getCurrentTime() {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    },

    // 영업 상태 계산
    // 반환: { status: 'open'|'closed'|'permanently-closed', text: string }
    getBusinessStatus(place) {
        if (place.isClosed) {
            return { status: 'permanently-closed', text: '폐업' };
        }

        const hours = place.businessHours;
        if (!hours) {
            return { status: 'closed', text: '영업시간 미등록' };
        }

        const currentDay = this.getCurrentDay();
        const dayHours = hours[currentDay];

        if (!dayHours || !dayHours.open || !dayHours.close) {
            return { status: 'closed', text: '오늘 휴무' };
        }

        if (dayHours.dayOff) {
            return { status: 'closed', text: '오늘 휴무' };
        }

        const currentTime = this.getCurrentTime();

        if (currentTime >= dayHours.open && currentTime <= dayHours.close) {
            return { status: 'open', text: `영업중 (${dayHours.close}까지)` };
        } else if (currentTime < dayHours.open) {
            return { status: 'closed', text: `영업 전 (${dayHours.open} 오픈)` };
        } else {
            return { status: 'closed', text: '영업 종료' };
        }
    },

    // 토스트 메시지
    showToast(message) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    // HTML 이스케이프
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // 텍스트 줄임
    truncate(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
    },

    // 자동완성 헬퍼
    // input: 대상 input 요소
    // dataFn(keyword): async, [{ label, sub, icon }] 반환
    // onSelect(item): 항목 선택 시 콜백
    attachAutocomplete(input, dataFn, onSelect) {
        const wrapper = input.closest('.search-input-wrapper') || input.closest('.map-search-wrapper');
        if (!wrapper) return;

        // wrapper에 position: relative 보장
        const pos = getComputedStyle(wrapper).position;
        if (pos === 'static') wrapper.style.position = 'relative';

        // 드롭다운 생성
        const dropdown = document.createElement('div');
        dropdown.className = 'autocomplete-dropdown';
        wrapper.appendChild(dropdown);

        let items = [];
        let activeIdx = -1;
        let debounceTimer = null;

        const show = () => { dropdown.style.display = 'block'; };
        const hide = () => { dropdown.style.display = 'none'; activeIdx = -1; };

        const render = (results) => {
            items = results.slice(0, 7);
            activeIdx = -1;
            if (items.length === 0) { hide(); return; }

            dropdown.innerHTML = items.map((item, i) => `
                <div class="autocomplete-item" data-index="${i}">
                    <div class="autocomplete-item-icon">
                        <i class="fas ${Utils.escapeHtml(item.icon || 'fa-search')}"></i>
                    </div>
                    <div class="autocomplete-item-text">
                        <span class="autocomplete-label">${Utils.escapeHtml(item.label)}</span>
                        ${item.sub ? `<span class="autocomplete-sub">${Utils.escapeHtml(item.sub)}</span>` : ''}
                    </div>
                </div>
            `).join('');
            show();

            // 클릭 이벤트
            dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
                el.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const idx = parseInt(el.dataset.index);
                    onSelect(items[idx]);
                    hide();
                });
            });
        };

        const setActive = (idx) => {
            const els = dropdown.querySelectorAll('.autocomplete-item');
            els.forEach(el => el.classList.remove('active'));
            if (idx >= 0 && idx < els.length) {
                els[idx].classList.add('active');
                els[idx].scrollIntoView({ block: 'nearest' });
            }
            activeIdx = idx;
        };

        // input 이벤트 (한국어 IME 조합 중에도 동작)
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const keyword = input.value.trim();
            if (!keyword) { hide(); return; }

            debounceTimer = setTimeout(async () => {
                const results = await dataFn(keyword);
                render(results);
            }, 200);
        });

        // 키보드 탐색
        input.addEventListener('keydown', (e) => {
            if (dropdown.style.display !== 'block') return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive(activeIdx < items.length - 1 ? activeIdx + 1 : 0);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive(activeIdx > 0 ? activeIdx - 1 : items.length - 1);
            } else if (e.key === 'Enter') {
                if (activeIdx >= 0 && activeIdx < items.length) {
                    e.preventDefault();
                    onSelect(items[activeIdx]);
                    hide();
                }
            } else if (e.key === 'Escape') {
                hide();
            }
        });

        // 외부 클릭 시 닫기
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) hide();
        });

        // focus 시 기존 결과가 있으면 다시 표시
        input.addEventListener('focus', () => {
            if (items.length > 0 && input.value.trim()) show();
        });
    },

    // HTML 새니타이즈 (XSS 방지)
    sanitizeHtml(html) {
        if (!html) return '';
        const voidTags = ['br', 'img'];
        const allowedTags = ['b', 'i', 'u', 'strong', 'em', 'span', 'br', 'p', 'div', 'font', 'img'];
        const allowedAttrs = {
            span: ['style'],
            font: ['color', 'size'],
            div: ['style'],
            p: ['style'],
            img: ['src', 'alt', 'style', 'width', 'height']
        };
        const allowedStyleProps = ['color', 'font-size', 'width', 'height', 'max-width', 'display', 'margin'];

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        function cleanNode(node) {
            const frag = document.createDocumentFragment();
            node.childNodes.forEach(child => {
                if (child.nodeType === Node.TEXT_NODE) {
                    frag.appendChild(document.createTextNode(child.textContent));
                } else if (child.nodeType === Node.ELEMENT_NODE) {
                    const tag = child.tagName.toLowerCase();
                    if (allowedTags.includes(tag)) {
                        // img src 보안: data:image/ 만 허용
                        if (tag === 'img') {
                            const src = child.getAttribute('src') || '';
                            if (!src.startsWith('data:image/')) return;
                        }
                        const el = document.createElement(tag);
                        const attrs = allowedAttrs[tag] || [];
                        attrs.forEach(attr => {
                            if (child.hasAttribute(attr)) {
                                if (attr === 'style') {
                                    const safeStyle = allowedStyleProps
                                        .map(prop => {
                                            const val = child.style.getPropertyValue(prop);
                                            return val ? `${prop}: ${val}` : '';
                                        })
                                        .filter(Boolean)
                                        .join('; ');
                                    if (safeStyle) el.setAttribute('style', safeStyle);
                                } else {
                                    el.setAttribute(attr, child.getAttribute(attr));
                                }
                            }
                        });
                        // void 요소는 자식 재귀 불필요
                        if (!voidTags.includes(tag)) {
                            el.appendChild(cleanNode(child));
                        }
                        frag.appendChild(el);
                    } else {
                        // 허용되지 않는 태그는 자식만 유지
                        frag.appendChild(cleanNode(child));
                    }
                }
            });
            return frag;
        }

        const container = document.createElement('div');
        container.appendChild(cleanNode(doc.body));
        return container.innerHTML;
    }
};
