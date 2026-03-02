// ===== GitHub 동기화 =====

const Sync = {
    OWNER: 'badakim9404-collab',
    REPO: 'tour-guide',
    BRANCH: 'master',
    API: 'https://api.github.com',

    FILES: {
        categories: 'data/categories.json',
        posts: 'data/posts.json',
        places: 'data/places.json'
    },

    _shas: {},
    _pushTimers: {},
    _pushing: false,

    // === 토큰 관리 (localStorage + cookie 이중 저장) ===
    getToken() {
        let token = localStorage.getItem('tour-gh-token');
        if (!token) {
            token = this._getCookie('tour-gh-token');
            if (token) localStorage.setItem('tour-gh-token', token);
        }
        return token;
    },
    setToken(token) {
        localStorage.setItem('tour-gh-token', token);
        this._setCookie('tour-gh-token', token, 365);
        // 브라우저에 저장소 유지 요청
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist();
        }
    },
    removeToken() {
        localStorage.removeItem('tour-gh-token');
        this._setCookie('tour-gh-token', '', -1);
    },
    isConfigured() { return !!this.getToken(); },

    _setCookie(name, value, days) {
        const d = new Date();
        d.setTime(d.getTime() + days * 86400000);
        document.cookie = name + '=' + encodeURIComponent(value) +
            ';expires=' + d.toUTCString() + ';path=/;SameSite=Strict;Secure';
    },
    _getCookie(name) {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    },

    // === 상태 표시 ===
    setStatus(type, msg) {
        const el = document.getElementById('syncStatus');
        if (!el) return;

        if (type === 'syncing') {
            el.innerHTML = '<i class="fas fa-sync fa-spin"></i>';
            el.className = 'sync-status syncing';
            el.title = msg || '동기화 중...';
        } else if (type === 'success') {
            el.innerHTML = '<i class="fas fa-cloud"></i>';
            el.className = 'sync-status success';
            el.title = msg || '동기화 완료';
            setTimeout(() => {
                el.className = 'sync-status idle';
                el.title = '동기화됨';
            }, 2500);
        } else if (type === 'error') {
            el.innerHTML = '<i class="fas fa-exclamation-circle"></i>';
            el.className = 'sync-status error';
            el.title = msg || '동기화 실패';
        } else {
            el.innerHTML = '';
            el.className = 'sync-status';
            el.title = '';
        }
    },

    // === UTF-8 Base64 변환 ===
    _toBase64(str) {
        const bytes = new TextEncoder().encode(str);
        const chars = new Array(bytes.length);
        for (let i = 0; i < bytes.length; i++) chars[i] = String.fromCharCode(bytes[i]);
        return btoa(chars.join(''));
    },

    _fromBase64(b64) {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    },

    // === GitHub API ===
    async _fetch(path, opts = {}) {
        return fetch(`${this.API}${path}`, {
            ...opts,
            headers: {
                'Authorization': `Bearer ${this.getToken()}`,
                'Accept': 'application/vnd.github.v3+json',
                ...(opts.headers || {})
            }
        });
    },

    // 파일 읽기
    async readFile(filePath) {
        const res = await this._fetch(
            `/repos/${this.OWNER}/${this.REPO}/contents/${filePath}?ref=${this.BRANCH}`
        );

        if (res.status === 404) {
            this._shas[filePath] = null;
            return null;
        }
        if (!res.ok) throw new Error(`GitHub ${res.status}`);

        const meta = await res.json();
        this._shas[filePath] = meta.sha;

        if (meta.content) {
            return JSON.parse(this._fromBase64(meta.content.replace(/\n/g, '')));
        }

        // 1MB 초과 파일 — download_url 사용
        const raw = await fetch(meta.download_url);
        return raw.json();
    },

    // 파일 쓰기
    async writeFile(filePath, data, retryCount = 0) {
        const json = JSON.stringify(data, null, 2);
        const content = this._toBase64(json);

        // SHA 캐시 없으면 조회
        if (this._shas[filePath] === undefined) {
            const res = await this._fetch(
                `/repos/${this.OWNER}/${this.REPO}/contents/${filePath}?ref=${this.BRANCH}`
            );
            if (res.ok) {
                const meta = await res.json();
                this._shas[filePath] = meta.sha;
            } else {
                this._shas[filePath] = null;
            }
        }

        const body = {
            message: `sync: ${filePath.split('/').pop()}`,
            content,
            branch: this.BRANCH
        };
        if (this._shas[filePath]) body.sha = this._shas[filePath];

        const res = await this._fetch(
            `/repos/${this.OWNER}/${this.REPO}/contents/${filePath}`,
            { method: 'PUT', body: JSON.stringify(body) }
        );

        // SHA 충돌 → 재시도 (최대 2회)
        if (res.status === 409 && retryCount < 2) {
            this._shas[filePath] = undefined;
            return this.writeFile(filePath, data, retryCount + 1);
        }

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(`GitHub ${res.status}: ${err.message || ''}`);
        }

        const result = await res.json();
        this._shas[filePath] = result.content.sha;
    },

    // === updatedAt 보정 (없으면 createdAt 복사) ===
    _ensureUpdatedAt(items) {
        for (const item of items) {
            if (!item.updatedAt && item.createdAt) {
                item.updatedAt = item.createdAt;
            }
        }
        return items;
    },

    // === 하위카테고리 union 병합 ===
    _mergeSubcategories(localSubs, serverSubs, localWins) {
        const merged = new Map();
        for (const sub of (serverSubs || [])) {
            merged.set(sub.id, sub);
        }
        for (const sub of (localSubs || [])) {
            if (!merged.has(sub.id) || localWins) {
                merged.set(sub.id, sub);
            }
        }
        return Array.from(merged.values());
    },

    // === 데이터 병합 (ID 기준, updatedAt이 최신인 것 우선) ===
    _mergeData(localItems, serverItems, storeName) {
        this._ensureUpdatedAt(localItems);
        this._ensureUpdatedAt(serverItems);

        const merged = new Map();

        // 서버 항목 먼저 추가
        for (const item of serverItems) {
            merged.set(item.id, item);
        }

        // 로컬 항목: 새 항목이거나 더 최신이면 덮어쓰기
        for (const item of localItems) {
            const existing = merged.get(item.id);
            if (!existing) {
                merged.set(item.id, item);
            } else {
                const localTime = item.updatedAt || '';
                const serverTime = existing.updatedAt || '';

                if (storeName === 'categories') {
                    // 카테고리: 하위카테고리 union 병합
                    const localWins = localTime >= serverTime;
                    const winner = localWins ? item : existing;
                    const loser = localWins ? existing : item;
                    const mergedSubs = this._mergeSubcategories(
                        winner.subcategories, loser.subcategories, true
                    );
                    merged.set(item.id, { ...winner, subcategories: mergedSubs });
                } else {
                    if (localTime >= serverTime) {
                        merged.set(item.id, item);
                    }
                }
            }
        }

        return Array.from(merged.values());
    },

    // === 전체 Pull (서버 → 로컬, 병합 방식) ===
    async pull() {
        if (!this.isConfigured()) return { ok: false, hasData: false };

        this.setStatus('syncing', '서버에서 불러오는 중...');

        try {
            const [cats, posts, places] = await Promise.all([
                this.readFile(this.FILES.categories),
                this.readFile(this.FILES.posts),
                this.readFile(this.FILES.places)
            ]);

            const serverData = {
                categories: cats || [],
                posts: posts || [],
                places: places || []
            };
            const hasServerData = (serverData.categories.length + serverData.posts.length + serverData.places.length) > 0;

            // 병합 동기화: 로컬 + 서버 데이터를 ID 기준으로 머지
            DB._suppressSync = true;
            const mergeResult = await DB.mergeImport(serverData);
            DB._suppressSync = false;

            // 로컬이 서버보다 최신이거나 로컬에만 있는 항목 → 서버에 병합 push-back
            if (mergeResult.needsPush.size > 0) {
                for (const storeName of mergeResult.needsPush) {
                    const filePath = this.FILES[storeName];
                    const localData = await DB.getAll(storeName);
                    const freshServer = await this.readFile(filePath);
                    const merged = this._mergeData(localData, freshServer || [], storeName);
                    try {
                        await this.writeFile(filePath, merged);
                    } catch (e) {
                        console.warn(`Push-back ${storeName} failed:`, e);
                    }
                }
            }

            this._lastPullTime = Date.now();
            localStorage.setItem('tour-last-pull', this._lastPullTime.toString());

            const changed = mergeResult.added > 0 || mergeResult.updated > 0;

            this.setStatus('success', '동기화 완료');
            return { ok: true, hasData: hasServerData, changed };
        } catch (e) {
            console.error('Sync pull error:', e);
            this.setStatus('error', '불러오기 실패');
            DB._suppressSync = false;
            return { ok: false, hasData: false };
        }
    },

    // === 전체 Push (로컬 → 서버, 병합 방식) ===
    async pushAll() {
        if (!this.isConfigured()) return false;

        // tombstone(_deleted) 포함 전체 데이터 (동기화용)
        const [localCats, localPosts, localPlaces] = await Promise.all([
            DB.getAll('categories'),
            DB.getAll('posts'),
            DB.getAll('places')
        ]);
        const localData = { categories: localCats, posts: localPosts, places: localPlaces };
        const localTotal = localCats.length + localPosts.length + localPlaces.length;

        if (localTotal === 0) {
            this.setStatus('error', '로컬 데이터가 비어있어 업로드를 중단합니다');
            return false;
        }

        this.setStatus('syncing', '서버에 저장 중...');

        try {
            // 서버 데이터 읽기 (병합용)
            const [serverCats, serverPosts, serverPlaces] = await Promise.all([
                this.readFile(this.FILES.categories),
                this.readFile(this.FILES.posts),
                this.readFile(this.FILES.places)
            ]);

            // 로컬 + 서버 병합 (로컬 우선)
            const mergedCats = this._mergeData(localData.categories, serverCats || [], 'categories');
            const mergedPosts = this._mergeData(localData.posts, serverPosts || [], 'posts');
            const mergedPlaces = this._mergeData(localData.places, serverPlaces || [], 'places');

            // 순차 push (브랜치 충돌 방지)
            await this.writeFile(this.FILES.categories, mergedCats);
            await this.writeFile(this.FILES.posts, mergedPosts);
            await this.writeFile(this.FILES.places, mergedPlaces);

            // 로컬도 병합 결과로 업데이트
            DB._suppressSync = true;
            await DB.importAll({
                categories: mergedCats,
                posts: mergedPosts,
                places: mergedPlaces
            });
            DB._suppressSync = false;

            this.setStatus('success', '업로드 완료');
            return true;
        } catch (e) {
            console.error('Sync push all error:', e);
            this.setStatus('error', '업로드 실패');
            DB._suppressSync = false;
            return false;
        }
    },

    // === 단일 스토어 Push (디바운스, 병합 방식) ===
    schedulePush(storeName) {
        if (!this.isConfigured() || DB._suppressSync) return;

        clearTimeout(this._pushTimers[storeName]);
        this._pushTimers[storeName] = setTimeout(() => this._pushStore(storeName), 1500);
    },

    async _pushStore(storeName) {
        if (this._pushing) {
            // 다른 push 진행 중이면 대기 후 재시도
            setTimeout(() => this._pushStore(storeName), 2000);
            return;
        }

        this._pushing = true;
        this.setStatus('syncing');

        try {
            const filePath = this.FILES[storeName];
            const localData = await DB.getAll(storeName);

            // 서버 데이터 읽기 (병합용)
            const serverData = await this.readFile(filePath);

            // 병합: 로컬 + 서버
            const merged = this._mergeData(localData, serverData || [], storeName);

            if (merged.length === 0) {
                this.setStatus('idle');
                this._pushing = false;
                return;
            }

            await this.writeFile(filePath, merged);

            // 병합 결과가 로컬과 다르면 로컬에도 반영
            if (JSON.stringify(merged) !== JSON.stringify(localData)) {
                DB._suppressSync = true;
                await DB.clear(storeName);
                for (const item of merged) {
                    await DB.put(storeName, item);
                }
                DB._suppressSync = false;
            }

            this.setStatus('success');
        } catch (e) {
            console.error(`Sync push ${storeName} error:`, e);
            this.setStatus('error');
        } finally {
            this._pushing = false;
        }
    },

    // === 자동 동기화 (탭 전환 + 주기적 Pull) ===
    _refreshCurrentView() {
        const view = App.state.view;
        if (view === 'posts') Post.renderList(App.state.categoryId, App.state.subcategoryId);
        else if (view === 'postDetail') Post.renderDetail(App.state.postId);
        else if (view === 'places') Place.renderList();
        // map, categoryManage, backup 등 편집 폼은 갱신하지 않음 (입력 손실 방지)
    },

    startAutoSync() {
        const onPull = ({ ok, changed }) => {
            if (ok) {
                Category.renderTree();
                if (changed) this._refreshCurrentView();
            }
        };

        // 탭이 다시 보일 때 자동 Pull
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isConfigured() && !this._pushing) {
                const lastPull = parseInt(localStorage.getItem('tour-last-pull') || '0');
                if (Date.now() - lastPull > 5000) {
                    this.pull().then(onPull);
                }
            }
        });

        // 30초마다 자동 동기화
        setInterval(() => {
            if (document.visibilityState === 'visible' && this.isConfigured() && !this._pushing) {
                this.pull().then(onPull);
            }
        }, 30000);
    },

    // === 토큰 검증 ===
    async validateToken(token) {
        try {
            // 1단계: 저장소 접근 가능 여부
            const res = await fetch(`${this.API}/repos/${this.OWNER}/${this.REPO}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!res.ok) return false;

            // 2단계: 실제 쓰기 권한 테스트 (contents API 접근)
            const testRes = await fetch(
                `${this.API}/repos/${this.OWNER}/${this.REPO}/contents/data/?ref=${this.BRANCH}`,
                { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github.v3+json' } }
            );
            return testRes.ok || testRes.status === 404;
        } catch {
            return false;
        }
    }
};
