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

    // === 토큰 관리 ===
    getToken() { return localStorage.getItem('tour-gh-token'); },
    setToken(token) { localStorage.setItem('tour-gh-token', token); },
    removeToken() { localStorage.removeItem('tour-gh-token'); },
    isConfigured() { return !!this.getToken(); },

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

    // === 전체 Pull (서버 → 로컬) ===
    async pull() {
        if (!this.isConfigured()) return { ok: false, hasData: false };

        this.setStatus('syncing', '서버에서 불러오는 중...');

        try {
            const [cats, posts, places] = await Promise.all([
                this.readFile(this.FILES.categories),
                this.readFile(this.FILES.posts),
                this.readFile(this.FILES.places)
            ]);

            const hasData = !!((cats && cats.length) || (posts && posts.length) || (places && places.length));

            if (hasData) {
                DB._suppressSync = true;
                await DB.importAll({
                    categories: cats || [],
                    posts: posts || [],
                    places: places || []
                });
                DB._suppressSync = false;
            }

            this.setStatus('success', '동기화 완료');
            return { ok: true, hasData };
        } catch (e) {
            console.error('Sync pull error:', e);
            this.setStatus('error', '불러오기 실패');
            DB._suppressSync = false;
            return { ok: false, hasData: false };
        }
    },

    // === 전체 Push (로컬 → 서버) ===
    async pushAll() {
        if (!this.isConfigured()) return false;

        this.setStatus('syncing', '서버에 저장 중...');

        try {
            const data = await DB.exportAll();

            // 순차 push (브랜치 충돌 방지)
            await this.writeFile(this.FILES.categories, data.categories);
            await this.writeFile(this.FILES.posts, data.posts);
            await this.writeFile(this.FILES.places, data.places);

            this.setStatus('success', '업로드 완료');
            return true;
        } catch (e) {
            console.error('Sync push all error:', e);
            this.setStatus('error', '업로드 실패');
            return false;
        }
    },

    // === 단일 스토어 Push (디바운스) ===
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
            this._shas[filePath] = undefined; // SHA 새로 조회
            const data = await DB.getAll(storeName);
            await this.writeFile(filePath, data);
            this.setStatus('success');
        } catch (e) {
            console.error(`Sync push ${storeName} error:`, e);
            this.setStatus('error');
        } finally {
            this._pushing = false;
        }
    },

    // === 토큰 검증 ===
    async validateToken(token) {
        try {
            const res = await fetch(`${this.API}/repos/${this.OWNER}/${this.REPO}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            if (!res.ok) return false;
            const data = await res.json();
            return data.permissions && data.permissions.push;
        } catch {
            return false;
        }
    }
};
