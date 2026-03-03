// ===== 비밀번호 인증 =====
const AUTH_HASH = '37f6d9c7335d7a61a44de3aef5d6c209d043713bcdcf8ec362fa31764e510bc6';

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function showLogin() {
    const overlay = document.getElementById('loginOverlay');
    const pwInput = document.getElementById('loginPassword');
    const loginBtn = document.getElementById('loginBtn');
    const errorEl = document.getElementById('loginError');

    overlay.classList.remove('hidden');

    async function attemptLogin() {
        const pw = pwInput.value;
        const hash = await sha256(pw);
        if (hash === AUTH_HASH) {
            sessionStorage.setItem('tour-auth', '1');
            overlay.classList.add('hidden');
            document.body.classList.remove('locked');
            App.init().catch(err => console.error('App initialization error:', err));
        } else {
            errorEl.textContent = '비밀번호가 올바르지 않습니다';
            pwInput.value = '';
            pwInput.focus();
        }
    }

    loginBtn.addEventListener('click', attemptLogin);
    pwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });
    pwInput.focus();
}

// ===== 메인 앱 (라우팅, 초기화) =====

const App = {
    state: {
        view: 'posts',       // posts, postDetail, postEdit, postNew, places, placeForm, map, categoryManage, backup, search
        categoryId: null,
        subcategoryId: null,
        postId: null,
        placeId: null,
        searchKeyword: null
    },

    async init() {
        // DB 초기화
        await DB.init();

        // GitHub 동기화: 서버에서 데이터 pull
        if (Sync.isConfigured()) {
            const { ok, hasData } = await Sync.pull();
            if (ok && !hasData) {
                // 서버에 데이터 없으면 로컬 데이터 push
                const local = await DB.exportAll();
                if (local.categories.length || local.posts.length || local.places.length) {
                    await Sync.pushAll();
                }
            }
        }

        // 자동 동기화 시작 (탭 전환 시 + 주기적)
        Sync.startAutoSync();

        // 데모 데이터 시드 (DB 비어있을 때)
        await this.seedDemoData();

        // 크롤링된 영업시간 데이터 반영
        const crawlUpdated = await this.applyCrawledHours();
        if (crawlUpdated > 0 && Sync.isConfigured()) {
            Sync.schedulePush('places');
        }

        // 카테고리 트리 렌더링
        await Category.renderTree();

        // 기본 뷰 렌더링
        this.navigate('posts');

        // 헤더 버튼 이벤트
        document.getElementById('logoBtn').addEventListener('click', () => {
            this.navigate('posts', { categoryId: null, subcategoryId: null });
        });

        document.getElementById('newPostBtn').addEventListener('click', () => {
            this.navigate('postNew');
        });

        document.getElementById('placesBtn').addEventListener('click', () => {
            this.navigate('places');
        });

        document.getElementById('mapBtn').addEventListener('click', () => {
            this.navigate('map');
        });

        document.getElementById('backupBtn').addEventListener('click', () => {
            this.navigate('backup');
        });

        document.getElementById('manageCategoryBtn').addEventListener('click', () => {
            this.navigate('categoryManage');
        });

        // 사이드바 토글 (모바일)
        document.getElementById('sidebarToggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // 사이드바 외부 클릭 시 닫기
        document.getElementById('mainContent').addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('open');
        });

        // 모달 닫기
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) this.closeModal();
        });

        // 확인 다이얼로그 닫기
        document.getElementById('confirmNo').addEventListener('click', () => {
            document.getElementById('confirmOverlay').classList.remove('show');
        });
        document.getElementById('confirmOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                document.getElementById('confirmOverlay').classList.remove('show');
            }
        });
    },

    // 네비게이션
    navigate(view, params = {}) {
        this.state.view = view;

        if (params.categoryId !== undefined) this.state.categoryId = params.categoryId;
        if (params.subcategoryId !== undefined) this.state.subcategoryId = params.subcategoryId;
        if (params.postId !== undefined) this.state.postId = params.postId;
        if (params.placeId !== undefined) this.state.placeId = params.placeId;
        if (params.searchKeyword !== undefined) this.state.searchKeyword = params.searchKeyword;

        // 사이드바 active 상태 업데이트
        Category.renderTree();

        // 뷰 렌더링
        switch (view) {
            case 'posts':
                Post.renderList(this.state.categoryId, this.state.subcategoryId);
                break;
            case 'postDetail':
                Post.renderDetail(params.postId || this.state.postId);
                break;
            case 'postNew':
                Post.renderForm(null);
                break;
            case 'postEdit':
                Post.renderForm(params.postId || this.state.postId);
                break;
            case 'places':
                Place.renderList();
                break;
            case 'placeForm':
                Place.renderForm(params.placeId || this.state.placeId);
                break;
            case 'map':
                MapView.render();
                break;
            case 'categoryManage':
                Category.renderManageView();
                break;
            case 'search':
                Post.renderSearchResults(this.state.searchKeyword);
                break;
            case 'backup':
                this.renderBackupView();
                break;
        }
    },

    // 데모 데이터 시드
    async seedDemoData() {
        const cats = await DB.getCategories();
        const places = await DB.getPlaces();
        if (cats.length > 0 || places.length > 0) return; // 이미 데이터 있으면 스킵

        // 카테고리
        const cat1 = { id: 'cat_city', name: '시내투어', subcategories: [
            { id: 'sub_food', name: '맛집' },
            { id: 'sub_info', name: '투어정보' }
        ], order: 0 };
        const cat2 = { id: 'cat_palace', name: '궁궐투어', subcategories: [
            { id: 'sub_food2', name: '맛집' },
            { id: 'sub_info2', name: '투어정보' }
        ], order: 1 };
        await DB.saveCategory(cat1);
        await DB.saveCategory(cat2);

        // 장소 (크롤링 결과 반영)
        await DB.savePlace({
            id: 'place1', name: '명동교자', type: 'restaurant',
            categoryId: 'cat_city',
            address: '서울 중구 명동10길 29',
            lat: 37.5625608, lng: 126.9856089,
            description: '칼국수, 만두 전문. 명동 대표 맛집. 외국인 관광객 필수 코스.',
            businessHours: {
                mon: { open: '10:30', close: '21:00', dayOff: false },
                tue: { open: '10:30', close: '21:00', dayOff: false },
                wed: { open: '10:30', close: '21:00', dayOff: false },
                thu: { open: '10:30', close: '21:00', dayOff: false },
                fri: { open: '10:30', close: '21:00', dayOff: false },
                sat: { open: '10:30', close: '21:00', dayOff: false },
                sun: { open: '10:30', close: '21:00', dayOff: false },
                holidays: ['추석', '설날']
            },
            isClosed: false, memo: ''
        });

        await DB.savePlace({
            id: 'place2', name: '토속촌삼계탕', type: 'restaurant',
            categoryId: 'cat_palace',
            address: '서울 종로구 자하문로5길 5',
            lat: 37.5776822, lng: 126.9707147,
            description: '경복궁 근처 삼계탕 명소. 인삼주 서비스.',
            businessHours: {
                mon: { open: '10:00', close: '22:00', dayOff: false },
                tue: { open: '10:00', close: '22:00', dayOff: false },
                wed: { open: '10:00', close: '22:00', dayOff: false },
                thu: { open: '10:00', close: '22:00', dayOff: false },
                fri: { open: '10:00', close: '22:00', dayOff: false },
                sat: { open: '10:00', close: '22:00', dayOff: false },
                sun: { open: '10:00', close: '22:00', dayOff: false },
                holidays: ['연중무휴']
            },
            isClosed: false, memo: ''
        });

        await DB.savePlace({
            id: 'place3', name: '진옥화할매원조닭한마리', type: 'restaurant',
            categoryId: 'cat_city',
            address: '서울 종로구 종로5가 395-3',
            lat: 37.5704900, lng: 127.0030100,
            description: '종로 닭한마리 골목 원조. 칼국수 사리 필수.',
            businessHours: {
                mon: { open: '10:30', close: '01:00', dayOff: false },
                tue: { open: '10:30', close: '01:00', dayOff: false },
                wed: { open: '10:30', close: '01:00', dayOff: false },
                thu: { open: '10:30', close: '01:00', dayOff: false },
                fri: { open: '10:30', close: '01:00', dayOff: false },
                sat: { open: '10:30', close: '01:00', dayOff: false },
                sun: { open: '10:30', close: '01:00', dayOff: false },
                holidays: ['추석']
            },
            isClosed: false, memo: ''
        });

        await DB.savePlace({
            id: 'place4', name: '경복궁', type: 'tourspot',
            categoryId: 'cat_palace',
            address: '서울 종로구 사직로 161',
            lat: 37.5788408, lng: 126.9770162,
            description: '조선 제일의 법궁. 근정전, 경회루 등 볼거리 풍부. 한복 착용 시 무료입장.',
            businessHours: {
                mon: { open: '09:00', close: '18:00', dayOff: false },
                tue: { open: '', close: '', dayOff: true },
                wed: { open: '09:00', close: '18:00', dayOff: false },
                thu: { open: '09:00', close: '18:00', dayOff: false },
                fri: { open: '09:00', close: '18:00', dayOff: false },
                sat: { open: '09:00', close: '18:00', dayOff: false },
                sun: { open: '09:00', close: '18:00', dayOff: false },
                holidays: ['매주 화요일 정기휴무', '휴무일이 공휴일이면 익일 휴무']
            },
            isClosed: false, memo: '입장마감 1시간 전. 계절별 운영시간 상이.'
        });

        console.log('데모 데이터 시드 완료');
    },

    // 크롤링된 영업시간 데이터 자동 반영 (업데이트 수 반환)
    async applyCrawledHours() {
        try {
            const res = await fetch('data/business-hours.json?t=' + Date.now());
            if (!res.ok) return 0;

            const data = await res.json();
            if (!data.results || !data.results.length) return 0;

            const places = await DB.getPlaces();
            if (!places.length) return 0;

            let updated = 0;
            for (const crawled of data.results) {
                if (!crawled.hours || Object.keys(crawled.hours).length === 0) continue;

                // id로 매칭, 없으면 이름으로 매칭
                let place = places.find(p => p.id === crawled.id);
                if (!place) place = places.find(p => p.name === crawled.name);
                if (!place) continue;

                // 이미 영업시간이 채워져 있으면 스킵 (places.json에서 이미 반영된 경우)
                const today = ['mon','tue','wed','thu','fri','sat','sun'][new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
                const existing = place.businessHours && place.businessHours[today];
                if (existing && (existing.open || existing.dayOff)) continue;

                // 영업시간 업데이트 (기존 holidays 유지하면서 merge)
                const oldHolidays = (place.businessHours && place.businessHours.holidays) || [];
                place.businessHours = {
                    ...place.businessHours,
                    ...crawled.hours,
                    holidays: crawled.holidays.length > 0 ? crawled.holidays : oldHolidays
                };
                await DB.savePlace(place);
                updated++;
            }

            if (updated > 0) {
                console.log(`크롤링 데이터 반영: ${updated}개 장소 영업시간 업데이트`);
                Utils.showToast(`${updated}개 장소 영업시간이 자동 반영되었습니다.`);
                if (this.state.view === 'places') Place.renderList();
            }
            return updated;
        } catch (e) {
            return 0;
        }
    },

    // 크롤링 결과 주기적 확인 (장소 등록 후 5분간)
    startCrawlPolling() {
        if (this._crawlPolling) return;
        let checks = 0;
        this._crawlPolling = setInterval(async () => {
            checks++;
            const updated = await this.applyCrawledHours();
            if (updated > 0 && Sync.isConfigured()) {
                Sync.schedulePush('places');
            }
            if (checks >= 6) { // 5분간 (50초 간격 × 6회)
                clearInterval(this._crawlPolling);
                this._crawlPolling = null;
            }
        }, 50000);
    },

    // 백업/복원 뷰
    renderBackupView() {
        const main = document.getElementById('mainContent');
        const hasToken = Sync.isConfigured();
        const maskedToken = hasToken ? '****' + Sync.getToken().slice(-4) : '';

        main.innerHTML = `
            <div class="backup-section">
                <h2><i class="fas fa-database"></i> 데이터 관리</h2>

                <!-- GitHub 동기화 설정 -->
                <div class="backup-card sync-card">
                    <h3><i class="fas fa-cloud"></i> GitHub 동기화</h3>
                    <p>모든 기기에서 동일한 데이터를 사용합니다. 글 저장/삭제 시 자동으로 동기화됩니다.</p>
                    <div class="sync-token-row">
                        <input type="password" id="syncTokenInput" class="sync-token-input"
                            placeholder="GitHub Personal Access Token"
                            value="${hasToken ? Sync.getToken() : ''}">
                        <button class="btn btn-primary btn-sm" id="syncTokenSaveBtn">
                            ${hasToken ? '변경' : '저장'}
                        </button>
                        ${hasToken ? '<button class="btn btn-danger btn-sm" id="syncTokenDeleteBtn">해제</button>' : ''}
                    </div>
                    <div class="sync-status-text" id="syncSettingsStatus">
                        ${hasToken ? '<span class="text-success"><i class="fas fa-check-circle"></i> 연결됨 (' + maskedToken + ')</span>' : '<span class="text-muted"><i class="fas fa-times-circle"></i> 미설정</span>'}
                    </div>
                    ${hasToken ? `
                    <div class="sync-actions">
                        <button class="btn btn-secondary btn-sm" id="syncPullBtn">
                            <i class="fas fa-cloud-download-alt"></i> 서버에서 불러오기
                        </button>
                        <button class="btn btn-primary btn-sm" id="syncPushBtn">
                            <i class="fas fa-cloud-upload-alt"></i> 서버에 업로드
                        </button>
                    </div>` : `
                    <div class="sync-help">
                        <details>
                            <summary>토큰 발급 방법</summary>
                            <ol>
                                <li>GitHub.com → Settings → Developer settings</li>
                                <li>Personal access tokens → Fine-grained tokens → Generate</li>
                                <li>Repository: <b>tour-guide</b> 선택</li>
                                <li>Permissions → Contents: <b>Read and write</b></li>
                                <li>Generate token → 복사하여 위에 붙여넣기</li>
                            </ol>
                        </details>
                    </div>`}
                </div>

                <p style="margin-top:24px;">데이터를 JSON 파일로 내보내거나, 백업 파일에서 복원할 수 있습니다.</p>
                <div class="backup-actions">
                    <div class="backup-card">
                        <h3><i class="fas fa-download"></i> 내보내기 (백업)</h3>
                        <p>모든 카테고리, 글, 장소 데이터를 JSON 파일로 저장합니다.</p>
                        <button class="btn btn-primary" id="exportBtn">
                            <i class="fas fa-download"></i> 데이터 내보내기
                        </button>
                    </div>
                    <div class="backup-card">
                        <h3><i class="fas fa-upload"></i> 가져오기 (복원)</h3>
                        <p>백업 JSON 파일에서 데이터를 복원합니다. 기존 데이터는 덮어쓰여집니다.</p>
                        <input type="file" id="importFile" accept=".json" style="display:none">
                        <button class="btn btn-secondary" id="importBtn">
                            <i class="fas fa-upload"></i> 데이터 가져오기
                        </button>
                    </div>
                    <div class="backup-card">
                        <h3><i class="fas fa-clock"></i> 영업시간 크롤링용 내보내기</h3>
                        <p>등록된 장소 목록을 data/places-input.json으로 내보냅니다. GitHub 저장소에 넣으면 자동 크롤링됩니다.</p>
                        <button class="btn btn-secondary" id="exportPlacesBtn">
                            <i class="fas fa-store"></i> 장소 목록 내보내기
                        </button>
                    </div>
                </div>
            </div>`;

        // === 동기화 설정 이벤트 ===
        document.getElementById('syncTokenSaveBtn').addEventListener('click', async () => {
            const input = document.getElementById('syncTokenInput');
            const statusEl = document.getElementById('syncSettingsStatus');
            const token = input.value.trim();

            if (!token) {
                statusEl.innerHTML = '<span class="text-danger">토큰을 입력해주세요</span>';
                return;
            }

            statusEl.innerHTML = '<span class="text-muted"><i class="fas fa-spinner fa-spin"></i> 검증 중...</span>';

            const valid = await Sync.validateToken(token);
            if (valid) {
                Sync.setToken(token);
                statusEl.innerHTML = '<span class="text-success"><i class="fas fa-check-circle"></i> 연결 완료!</span>';
                Utils.showToast('GitHub 동기화가 설정되었습니다');
                // 뷰 새로고침
                setTimeout(() => this.renderBackupView(), 1000);
            } else {
                statusEl.innerHTML = '<span class="text-danger"><i class="fas fa-times-circle"></i> 토큰이 유효하지 않거나 push 권한이 없습니다</span>';
            }
        });

        const deleteBtn = document.getElementById('syncTokenDeleteBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                Sync.removeToken();
                Utils.showToast('동기화가 해제되었습니다');
                this.renderBackupView();
            });
        }

        const pullBtn = document.getElementById('syncPullBtn');
        if (pullBtn) {
            pullBtn.addEventListener('click', async () => {
                pullBtn.disabled = true;
                const { ok } = await Sync.pull();
                if (ok) {
                    Utils.showToast('서버 데이터를 불러왔습니다');
                    await Category.renderTree();
                    this.navigate('backup');
                } else {
                    Utils.showToast('불러오기 실패');
                }
                pullBtn.disabled = false;
            });
        }

        const pushBtn = document.getElementById('syncPushBtn');
        if (pushBtn) {
            pushBtn.addEventListener('click', async () => {
                pushBtn.disabled = true;
                const ok = await Sync.pushAll();
                Utils.showToast(ok ? '서버에 업로드 완료' : '업로드 실패');
                pushBtn.disabled = false;
            });
        }

        // 내보내기
        document.getElementById('exportBtn').addEventListener('click', async () => {
            const data = await DB.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `tour-guide-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
            Utils.showToast('백업 파일이 다운로드되었습니다');
        });

        // 가져오기
        const importFile = document.getElementById('importFile');
        document.getElementById('importBtn').addEventListener('click', () => importFile.click());

        importFile.addEventListener('change', () => {
            const file = importFile.files[0];
            if (!file) return;

            this.showConfirm('기존 데이터가 모두 덮어쓰여집니다. 계속하시겠습니까?', async () => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        await DB.importAll(data);
                        if (Sync.isConfigured()) await Sync.pushAll();
                        Utils.showToast('데이터가 복원되었습니다');
                        Category.renderTree();
                        this.navigate('posts', { categoryId: null, subcategoryId: null });
                    } catch (err) {
                        Utils.showToast('파일 형식이 올바르지 않습니다');
                    }
                };
                reader.readAsText(file);
            });
        });

        // 크롤링용 장소 목록 내보내기
        document.getElementById('exportPlacesBtn').addEventListener('click', async () => {
            const places = await DB.getPlaces();
            const exportData = {
                places: places.map(p => ({
                    id: p.id,
                    name: p.name,
                    address: p.address || '',
                    type: p.type
                }))
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'places-input.json';
            a.click();
            URL.revokeObjectURL(url);
            Utils.showToast('places-input.json 다운로드 완료. data/ 폴더에 넣어주세요.');
        });
    },

    // 확인 다이얼로그
    showConfirm(message, onConfirm) {
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmOverlay').classList.add('show');

        const yesBtn = document.getElementById('confirmYes');
        const newYes = yesBtn.cloneNode(true);
        yesBtn.parentNode.replaceChild(newYes, yesBtn);

        newYes.addEventListener('click', () => {
            document.getElementById('confirmOverlay').classList.remove('show');
            onConfirm();
        });
    },

    // 모달
    showModal(title, bodyHtml) {
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalBody').innerHTML = bodyHtml;
        document.getElementById('modalOverlay').classList.add('show');
    },

    closeModal() {
        document.getElementById('modalOverlay').classList.remove('show');
    },

    // 이미지 라이트박스
    showLightbox(src) {
        let lightbox = document.querySelector('.lightbox');
        if (!lightbox) {
            lightbox = document.createElement('div');
            lightbox.className = 'lightbox';
            lightbox.addEventListener('click', () => lightbox.classList.remove('show'));
            document.body.appendChild(lightbox);
        }
        lightbox.innerHTML = `<img src="${src}" alt="">`;
        lightbox.classList.add('show');
    }
};

// 앱 시작
document.addEventListener('DOMContentLoaded', () => {
    if (!sessionStorage.getItem('tour-auth')) {
        showLogin();
        return;
    }
    document.body.classList.remove('locked');
    document.getElementById('loginOverlay').classList.add('hidden');
    App.init().catch(err => {
        console.error('App initialization error:', err);
    });
});
