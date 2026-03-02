// ===== IndexedDB 데이터 레이어 =====

const DB = {
    name: 'TourGuideDB',
    version: 1,
    db: null,
    _suppressSync: false,

    // DB 초기화
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.name, this.version);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;

                // categories 스토어
                if (!db.objectStoreNames.contains('categories')) {
                    const catStore = db.createObjectStore('categories', { keyPath: 'id' });
                    catStore.createIndex('order', 'order', { unique: false });
                }

                // posts 스토어
                if (!db.objectStoreNames.contains('posts')) {
                    const postStore = db.createObjectStore('posts', { keyPath: 'id' });
                    postStore.createIndex('categoryId', 'categoryId', { unique: false });
                    postStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // places 스토어
                if (!db.objectStoreNames.contains('places')) {
                    const placeStore = db.createObjectStore('places', { keyPath: 'id' });
                    placeStore.createIndex('type', 'type', { unique: false });
                    placeStore.createIndex('categoryId', 'categoryId', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };

            request.onerror = (e) => {
                reject(e.target.error);
            };
        });
    },

    // 범용 CRUD
    _getStore(storeName, mode = 'readonly') {
        const tx = this.db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    },

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const store = this._getStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const store = this._getStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const store = this._getStore(storeName, 'readwrite');
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const store = this._getStore(storeName, 'readwrite');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async clear(storeName) {
        return new Promise((resolve, reject) => {
            const store = this._getStore(storeName, 'readwrite');
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    // === Categories ===
    async getCategories() {
        const cats = await this.getAll('categories');
        return cats.filter(c => !c._deleted).sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    async saveCategory(cat) {
        if (!cat.id) cat.id = Utils.generateId();
        if (!cat.createdAt) cat.createdAt = new Date().toISOString();
        cat.updatedAt = new Date().toISOString();
        if (!cat.subcategories) cat.subcategories = [];
        const result = await this.put('categories', cat);
        if (!this._suppressSync) Sync.schedulePush('categories');
        return result;
    },

    async deleteCategory(id) {
        const cat = await this.get('categories', id);
        if (cat) {
            cat._deleted = true;
            cat.updatedAt = new Date().toISOString();
            await this.put('categories', cat);
        }
        if (!this._suppressSync) Sync.schedulePush('categories');
    },

    // === Posts ===
    async getPosts(categoryId, subcategoryId) {
        let posts = await this.getAll('posts');
        posts = posts.filter(p => !p._deleted);
        if (categoryId) {
            posts = posts.filter(p => p.categoryId === categoryId);
        }
        if (subcategoryId) {
            posts = posts.filter(p => p.subcategoryId === subcategoryId);
        }
        return posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getPost(id) {
        return this.get('posts', id);
    },

    async savePost(post) {
        if (!post.id) post.id = Utils.generateId();
        if (!post.createdAt) post.createdAt = new Date().toISOString();
        post.updatedAt = new Date().toISOString();
        const result = await this.put('posts', post);
        if (!this._suppressSync) Sync.schedulePush('posts');
        return result;
    },

    async deletePost(id) {
        const post = await this.get('posts', id);
        if (post) {
            post._deleted = true;
            post.updatedAt = new Date().toISOString();
            await this.put('posts', post);
        }
        if (!this._suppressSync) Sync.schedulePush('posts');
    },

    // === Places ===
    async getPlaces(categoryId) {
        let places = await this.getAll('places');
        places = places.filter(p => !p._deleted);
        if (categoryId) {
            places = places.filter(p => p.categoryId === categoryId);
        }
        return places.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getPlace(id) {
        return this.get('places', id);
    },

    async savePlace(place) {
        if (!place.id) place.id = Utils.generateId();
        if (!place.createdAt) place.createdAt = new Date().toISOString();
        place.updatedAt = new Date().toISOString();
        const result = await this.put('places', place);
        if (!this._suppressSync) Sync.schedulePush('places');
        return result;
    },

    async deletePlace(id) {
        const place = await this.get('places', id);
        if (place) {
            place._deleted = true;
            place.updatedAt = new Date().toISOString();
            await this.put('places', place);
        }
        if (!this._suppressSync) Sync.schedulePush('places');
    },

    // === Search ===
    async search(keyword) {
        const kw = keyword.toLowerCase();
        const stripHtml = (html) => html ? html.replace(/<[^>]*>/g, '') : '';

        const [posts, places] = await Promise.all([
            this.getAll('posts'),
            this.getAll('places')
        ]);

        const matchedPosts = posts.filter(p =>
            !p._deleted &&
            ((p.title && p.title.toLowerCase().includes(kw)) ||
            stripHtml(p.content).toLowerCase().includes(kw))
        );

        const matchedPlaces = places.filter(p =>
            !p._deleted &&
            ((p.name && p.name.toLowerCase().includes(kw)) ||
            (p.address && p.address.toLowerCase().includes(kw)) ||
            (p.description && p.description.toLowerCase().includes(kw)) ||
            (p.memo && p.memo.toLowerCase().includes(kw)))
        );

        return { posts: matchedPosts, places: matchedPlaces };
    },

    // === Export / Import ===
    async exportAll() {
        const categories = (await this.getAll('categories')).filter(i => !i._deleted);
        const posts = (await this.getAll('posts')).filter(i => !i._deleted);
        const places = (await this.getAll('places')).filter(i => !i._deleted);
        return { categories, posts, places, exportedAt: new Date().toISOString() };
    },

    async importAll(data) {
        await this.clear('categories');
        await this.clear('posts');
        await this.clear('places');

        for (const cat of (data.categories || [])) {
            await this.put('categories', cat);
        }
        for (const post of (data.posts || [])) {
            await this.put('posts', post);
        }
        for (const place of (data.places || [])) {
            await this.put('places', place);
        }
    },

    // === 병합 Import (ID 기준, 최신 updatedAt 우선) ===
    async mergeImport(serverData) {
        const result = { added: 0, updated: 0, needsPush: new Set() };

        for (const storeName of ['categories', 'posts', 'places']) {
            const localItems = await this.getAll(storeName);
            const serverItems = serverData[storeName] || [];

            const localMap = new Map(localItems.map(item => [item.id, item]));
            const serverMap = new Map(serverItems.map(item => [item.id, item]));

            // 서버 항목 반영 (새 항목 추가, 최신 항목으로 업데이트)
            for (const [id, serverItem] of serverMap) {
                const localItem = localMap.get(id);
                if (!localItem) {
                    await this.put(storeName, serverItem);
                    result.added++;
                } else {
                    const serverTime = serverItem.updatedAt || serverItem.createdAt || '';
                    const localTime = localItem.updatedAt || localItem.createdAt || '';
                    if (serverTime > localTime) {
                        await this.put(storeName, serverItem);
                        result.updated++;
                    } else if (localTime > serverTime) {
                        // 로컬이 더 최신 → 서버에 push 필요
                        result.needsPush.add(storeName);
                    }
                }
            }

            // 로컬에만 있는 항목 → 서버에 push 필요
            for (const [id] of localMap) {
                if (!serverMap.has(id)) {
                    result.needsPush.add(storeName);
                    break;
                }
            }
        }

        return result;
    }
};
