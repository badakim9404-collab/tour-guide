// ===== 글(포스트) 관리 =====

const Post = {
    // 이미지 임시 저장
    _pendingImages: [],

    // 글 목록 렌더링
    async renderList(categoryId, subcategoryId) {
        const main = document.getElementById('mainContent');
        const posts = await DB.getPosts(categoryId, subcategoryId);

        // 헤더 제목 결정
        let title = '전체 글';
        if (categoryId) {
            const cat = await DB.get('categories', categoryId);
            if (cat) {
                title = cat.name;
                if (subcategoryId) {
                    const sub = cat.subcategories.find(s => s.id === subcategoryId);
                    if (sub) title += ` > ${sub.name}`;
                }
            }
        }

        let html = `<div class="post-list-header">
                        <h2>${Utils.escapeHtml(title)}</h2>
                    </div>
                    <form class="search-bar" id="searchForm" action="javascript:void(0)">
                        <div class="search-input-wrapper">
                            <button type="submit" class="search-submit-btn" title="검색">
                                <i class="fas fa-search"></i>
                            </button>
                            <input type="text" id="searchInput" placeholder="글, 장소 통합 검색..." value="">
                            <button type="button" class="search-clear-btn" id="searchClearBtn" style="display:none">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </form>`;

        if (posts.length === 0) {
            html += `<div class="empty-state">
                        <i class="fas fa-file-alt"></i>
                        <h3>아직 글이 없습니다</h3>
                        <p>글쓰기 버튼을 눌러 첫 글을 작성해보세요</p>
                     </div>`;
        } else {
            html += `<div class="post-grid">`;
            for (const post of posts) {
                const thumb = post.images && post.images.length > 0
                    ? `<img src="${post.images[0]}" alt="">`
                    : `<i class="fas fa-file-alt no-image"></i>`;

                // 카테고리 이름 찾기
                let catLabel = '';
                if (post.categoryId) {
                    const cat = await DB.get('categories', post.categoryId);
                    if (cat) {
                        catLabel = cat.name;
                        if (post.subcategoryId) {
                            const sub = cat.subcategories.find(s => s.id === post.subcategoryId);
                            if (sub) catLabel += ` > ${sub.name}`;
                        }
                    }
                }

                html += `<div class="post-card" data-post-id="${post.id}">
                            <div class="post-card-thumb">${thumb}</div>
                            <div class="post-card-body">
                                <h3>${Utils.escapeHtml(post.title)}</h3>
                                <div class="post-card-meta">
                                    ${catLabel ? `<span class="post-card-category">${Utils.escapeHtml(catLabel)}</span>` : ''}
                                    <span>${Utils.formatDate(post.createdAt)}</span>
                                </div>
                            </div>
                         </div>`;
            }
            html += `</div>`;
        }

        main.innerHTML = html;

        // 카드 클릭 이벤트
        main.querySelectorAll('.post-card').forEach(card => {
            card.addEventListener('click', () => {
                App.navigate('postDetail', { postId: card.dataset.postId });
            });
        });

        // 검색 이벤트
        this._bindSearchEvents();
    },

    // 검색 이벤트 바인딩 (공통)
    _bindSearchEvents() {
        const form = document.getElementById('searchForm');
        const input = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (!form || !input) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const keyword = input.value.trim();
            if (keyword) {
                App.navigate('search', { searchKeyword: keyword });
            } else {
                App.navigate('posts', { categoryId: null, subcategoryId: null });
            }
        });

        input.addEventListener('input', () => {
            clearBtn.style.display = input.value ? 'flex' : 'none';
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            App.navigate('posts', { categoryId: null, subcategoryId: null });
        });

        // 자동완성 연결
        Utils.attachAutocomplete(input, async (keyword) => {
            const results = await DB.search(keyword);
            const suggestions = [];
            for (const post of results.posts) {
                suggestions.push({ label: post.title, sub: '글', icon: 'fa-file-alt' });
            }
            for (const place of results.places) {
                suggestions.push({ label: place.name, sub: place.address || '', icon: 'fa-map-marker-alt' });
            }
            return suggestions;
        }, (item) => {
            input.value = item.label;
            form.dispatchEvent(new Event('submit'));
        });
    },

    // 검색 결과 렌더링
    async renderSearchResults(keyword) {
        const main = document.getElementById('mainContent');
        const results = await DB.search(keyword);

        let html = `<form class="search-bar" id="searchForm" action="javascript:void(0)">
                        <div class="search-input-wrapper">
                            <button type="submit" class="search-submit-btn" title="검색">
                                <i class="fas fa-search"></i>
                            </button>
                            <input type="text" id="searchInput" placeholder="글, 장소 통합 검색..." value="${Utils.escapeHtml(keyword)}">
                            <button type="button" class="search-clear-btn" id="searchClearBtn">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </form>
                    <h3 class="search-result-header">"${Utils.escapeHtml(keyword)}" 검색 결과</h3>`;

        // 글 섹션
        html += `<div class="search-section">
                    <div class="search-section-title">
                        <i class="fas fa-file-alt"></i> 글 <span class="search-count">${results.posts.length}</span>
                    </div>`;

        if (results.posts.length === 0) {
            html += `<div class="search-no-result">일치하는 글이 없습니다</div>`;
        } else {
            html += `<div class="post-grid">`;
            for (const post of results.posts) {
                const thumb = post.images && post.images.length > 0
                    ? `<img src="${post.images[0]}" alt="">`
                    : `<i class="fas fa-file-alt no-image"></i>`;

                let catLabel = '';
                if (post.categoryId) {
                    const cat = await DB.get('categories', post.categoryId);
                    if (cat) {
                        catLabel = cat.name;
                        if (post.subcategoryId) {
                            const sub = cat.subcategories.find(s => s.id === post.subcategoryId);
                            if (sub) catLabel += ` > ${sub.name}`;
                        }
                    }
                }

                html += `<div class="post-card" data-post-id="${post.id}">
                            <div class="post-card-thumb">${thumb}</div>
                            <div class="post-card-body">
                                <h3>${Utils.escapeHtml(post.title)}</h3>
                                <div class="post-card-meta">
                                    ${catLabel ? `<span class="post-card-category">${Utils.escapeHtml(catLabel)}</span>` : ''}
                                    <span>${Utils.formatDate(post.createdAt)}</span>
                                </div>
                            </div>
                         </div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;

        // 장소 섹션
        html += `<div class="search-section">
                    <div class="search-section-title">
                        <i class="fas fa-map-marker-alt"></i> 장소 <span class="search-count">${results.places.length}</span>
                    </div>`;

        if (results.places.length === 0) {
            html += `<div class="search-no-result">일치하는 장소가 없습니다</div>`;
        } else {
            html += `<table class="place-table">
                        <thead>
                            <tr>
                                <th>이름</th>
                                <th>유형</th>
                                <th>주소</th>
                            </tr>
                        </thead>
                        <tbody>`;
            for (const place of results.places) {
                const typeLabel = place.type === 'restaurant' ? '맛집' : place.type === 'etc' ? '기타' : '관광지';
                const typeClass = place.type === 'restaurant' ? 'restaurant' : place.type === 'etc' ? 'etc' : 'tourspot';
                html += `<tr class="search-place-row" data-place-id="${place.id}">
                            <td>${Utils.escapeHtml(place.name)}</td>
                            <td><span class="place-type-badge ${typeClass}">${typeLabel}</span></td>
                            <td>${Utils.escapeHtml(place.address || '')}</td>
                         </tr>`;
            }
            html += `</tbody></table>`;
        }
        html += `</div>`;

        main.innerHTML = html;

        // 글 카드 클릭
        main.querySelectorAll('.post-card').forEach(card => {
            card.addEventListener('click', () => {
                App.navigate('postDetail', { postId: card.dataset.postId });
            });
        });

        // 장소 행 클릭
        main.querySelectorAll('.search-place-row').forEach(row => {
            row.addEventListener('click', () => {
                App.navigate('placeForm', { placeId: row.dataset.placeId });
            });
        });

        // 검색 이벤트
        this._bindSearchEvents();
    },

    // 글 상세 렌더링
    async renderDetail(postId) {
        const main = document.getElementById('mainContent');
        const post = await DB.getPost(postId);

        if (!post) {
            main.innerHTML = `<div class="empty-state"><h3>글을 찾을 수 없습니다</h3></div>`;
            return;
        }

        // 카테고리 이름
        let catLabel = '';
        if (post.categoryId) {
            const cat = await DB.get('categories', post.categoryId);
            if (cat) {
                catLabel = cat.name;
                if (post.subcategoryId) {
                    const sub = cat.subcategories.find(s => s.id === post.subcategoryId);
                    if (sub) catLabel += ` > ${sub.name}`;
                }
            }
        }

        let html = `<div class="post-detail">`;
        html += `<div class="post-detail-header">
                    <h1>${Utils.escapeHtml(post.title)}</h1>
                    <div class="post-detail-meta">
                        ${catLabel ? `<span class="post-card-category">${Utils.escapeHtml(catLabel)}</span>` : ''}
                        <span><i class="fas fa-calendar"></i> ${Utils.formatDateTime(post.createdAt)}</span>
                        ${post.updatedAt !== post.createdAt ? `<span>(수정: ${Utils.formatDateTime(post.updatedAt)})</span>` : ''}
                    </div>
                    <div class="post-detail-actions">
                        <button class="btn btn-secondary btn-sm" id="editPostBtn">
                            <i class="fas fa-edit"></i> 수정
                        </button>
                        <button class="btn btn-danger btn-sm" id="deletePostBtn">
                            <i class="fas fa-trash"></i> 삭제
                        </button>
                    </div>
                 </div>`;

        // 이미지
        if (post.images && post.images.length > 0) {
            html += `<div class="post-detail-images">`;
            post.images.forEach((img, i) => {
                html += `<img src="${img}" alt="이미지 ${i + 1}" class="lightbox-trigger">`;
            });
            html += `</div>`;
        }

        // 내용
        html += `<div class="post-detail-content">${Utils.sanitizeHtml(post.content || '')}</div>`;
        html += `</div>`;

        main.innerHTML = html;

        // 수정 버튼
        document.getElementById('editPostBtn').addEventListener('click', () => {
            App.navigate('postEdit', { postId: post.id });
        });

        // 삭제 버튼
        document.getElementById('deletePostBtn').addEventListener('click', () => {
            App.showConfirm('이 글을 삭제하시겠습니까?', async () => {
                await DB.deletePost(post.id);
                Utils.showToast('글이 삭제되었습니다');
                Category.renderTree();
                App.navigate('posts', { categoryId: post.categoryId, subcategoryId: post.subcategoryId });
            });
        });

        // 이미지 라이트박스
        main.querySelectorAll('.lightbox-trigger').forEach(img => {
            img.addEventListener('click', () => {
                App.showLightbox(img.src);
            });
        });
    },

    // 글 작성/편집 폼 렌더링
    async renderForm(postId) {
        const main = document.getElementById('mainContent');
        const isEdit = !!postId;
        let post = null;

        if (isEdit) {
            post = await DB.getPost(postId);
            if (!post) {
                main.innerHTML = `<div class="empty-state"><h3>글을 찾을 수 없습니다</h3></div>`;
                return;
            }
            this._pendingImages = [...(post.images || [])];
        } else {
            this._pendingImages = [];
            post = {
                title: '',
                content: '',
                categoryId: App.state.categoryId || '',
                subcategoryId: App.state.subcategoryId || '',
                images: []
            };
        }

        const categories = await DB.getCategories();

        let html = `<div class="form-section">`;
        html += `<h2>${isEdit ? '글 수정' : '새 글 작성'}</h2>`;

        // 제목
        html += `<div class="form-group">
                    <label>제목</label>
                    <input type="text" id="postTitle" value="${Utils.escapeHtml(post.title)}" placeholder="제목을 입력하세요">
                 </div>`;

        // 카테고리 선택
        html += `<div class="form-row">
                    <div class="form-group">
                        <label>카테고리</label>
                        <select id="postCategory">
                            <option value="">선택 안함</option>`;
        categories.forEach(cat => {
            html += `<option value="${cat.id}" ${post.categoryId === cat.id ? 'selected' : ''}>${Utils.escapeHtml(cat.name)}</option>`;
        });
        html += `</select></div>
                  <div class="form-group">
                    <label>하위 카테고리</label>
                    <select id="postSubcategory">
                        <option value="">선택 안함</option>
                    </select>
                  </div>
                 </div>`;

        // 내용 (리치 텍스트 에디터)
        html += `<div class="form-group">
                    <label>내용</label>
                    <div class="editor-wrapper">
                        <div class="editor-toolbar" id="editorToolbar">
                            <div class="toolbar-group">
                                <button type="button" data-cmd="bold" title="굵게"><b>B</b></button>
                                <button type="button" data-cmd="italic" title="기울임"><i>I</i></button>
                                <button type="button" data-cmd="underline" title="밑줄"><u>U</u></button>
                            </div>
                            <div class="toolbar-divider"></div>
                            <div class="toolbar-group">
                                <select id="fontSizeSelect" title="글씨 크기">
                                    <option value="">크기</option>
                                    <option value="2">작게</option>
                                    <option value="3">보통</option>
                                    <option value="5">크게</option>
                                </select>
                            </div>
                            <div class="toolbar-divider"></div>
                            <div class="toolbar-group">
                                <div class="color-palette">
                                    <button type="button" class="color-palette-btn" id="colorPaletteBtn" title="글씨 색상">
                                        A<span class="color-indicator" id="colorIndicator"></span>
                                    </button>
                                    <div class="color-palette-dropdown" id="colorPaletteDropdown">
                                        <div class="color-swatch" data-color="#000000" style="background:#000000" title="검정"></div>
                                        <div class="color-swatch" data-color="#E74C3C" style="background:#E74C3C" title="빨강"></div>
                                        <div class="color-swatch" data-color="#2980B9" style="background:#2980B9" title="파랑"></div>
                                        <div class="color-swatch" data-color="#27AE60" style="background:#27AE60" title="초록"></div>
                                        <div class="color-swatch" data-color="#F39C12" style="background:#F39C12" title="주황"></div>
                                        <div class="color-swatch" data-color="#8E44AD" style="background:#8E44AD" title="보라"></div>
                                        <div class="color-swatch" data-color="#795548" style="background:#795548" title="갈색"></div>
                                        <div class="color-swatch" data-color="#95A5A6" style="background:#95A5A6" title="회색"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="editor-content" contenteditable="true" id="postContent" data-placeholder="내용을 입력하세요">${post.content || ''}</div>
                    </div>
                 </div>`;

        // 이미지 업로드
        html += `<div class="form-group">
                    <label>이미지</label>
                    <div class="image-upload-area" id="imageUploadArea">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <p>클릭하거나 이미지를 드래그하세요</p>
                    </div>
                    <input type="file" id="imageFileInput" multiple accept="image/*" style="display:none">
                    <div class="image-preview-list" id="imagePreviewList"></div>
                 </div>`;

        // 버튼
        html += `<div class="form-actions">
                    <button class="btn btn-primary" id="savePostBtn">
                        <i class="fas fa-check"></i> ${isEdit ? '수정 완료' : '작성 완료'}
                    </button>
                    <button class="btn btn-secondary" id="cancelPostBtn">취소</button>
                 </div>`;

        html += `</div>`;
        main.innerHTML = html;

        // 하위 카테고리 연동
        this._updateSubcategorySelect(post.subcategoryId);
        document.getElementById('postCategory').addEventListener('change', () => {
            this._updateSubcategorySelect();
        });

        // 리치 텍스트 에디터 이벤트
        this._initEditor();

        // 이미지 업로드 이벤트
        const uploadArea = document.getElementById('imageUploadArea');
        const fileInput = document.getElementById('imageFileInput');

        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
        uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '';
            this._handleFiles(e.dataTransfer.files);
        });
        fileInput.addEventListener('change', () => {
            this._handleFiles(fileInput.files);
            fileInput.value = '';
        });

        // 기존 이미지 프리뷰
        this._renderImagePreviews();

        // 저장
        document.getElementById('savePostBtn').addEventListener('click', async () => {
            const title = document.getElementById('postTitle').value.trim();
            if (!title) {
                Utils.showToast('제목을 입력해주세요');
                return;
            }

            const data = {
                title,
                content: document.getElementById('postContent').innerHTML,
                categoryId: document.getElementById('postCategory').value || null,
                subcategoryId: document.getElementById('postSubcategory').value || null,
                images: this._pendingImages
            };

            if (isEdit) {
                data.id = post.id;
                data.createdAt = post.createdAt;
            }

            await DB.savePost(data);
            Utils.showToast(isEdit ? '수정되었습니다' : '작성되었습니다');
            Category.renderTree();

            if (isEdit) {
                App.navigate('postDetail', { postId: data.id || post.id });
            } else {
                App.navigate('posts', { categoryId: data.categoryId, subcategoryId: data.subcategoryId });
            }
        });

        // 취소
        document.getElementById('cancelPostBtn').addEventListener('click', () => {
            if (isEdit) {
                App.navigate('postDetail', { postId: post.id });
            } else {
                App.navigate('posts');
            }
        });
    },

    async _updateSubcategorySelect(selectedId) {
        const catId = document.getElementById('postCategory').value;
        const subSelect = document.getElementById('postSubcategory');
        subSelect.innerHTML = '<option value="">선택 안함</option>';

        if (catId) {
            const cat = await DB.get('categories', catId);
            if (cat && cat.subcategories) {
                cat.subcategories.forEach(sub => {
                    subSelect.innerHTML += `<option value="${sub.id}" ${selectedId === sub.id ? 'selected' : ''}>${Utils.escapeHtml(sub.name)}</option>`;
                });
            }
        }
    },

    _handleFiles(files) {
        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                this._pendingImages.push(e.target.result);
                this._renderImagePreviews();
            };
            reader.readAsDataURL(file);
        });
    },

    _initEditor() {
        const toolbar = document.getElementById('editorToolbar');
        const editor = document.getElementById('postContent');

        // 볼드/이탤릭/밑줄 버튼
        toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                document.execCommand(btn.dataset.cmd);
                this._updateToolbarState();
            });
        });

        // 글씨 크기
        const fontSizeSelect = document.getElementById('fontSizeSelect');
        fontSizeSelect.addEventListener('change', () => {
            if (fontSizeSelect.value) {
                document.execCommand('fontSize', false, fontSizeSelect.value);
            }
            fontSizeSelect.value = '';
            editor.focus();
        });

        // 색상 팔레트 토글
        const colorBtn = document.getElementById('colorPaletteBtn');
        const colorDropdown = document.getElementById('colorPaletteDropdown');

        colorBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            colorDropdown.classList.toggle('show');
        });

        // 색상 선택
        colorDropdown.querySelectorAll('.color-swatch').forEach(swatch => {
            swatch.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const color = swatch.dataset.color;
                document.execCommand('foreColor', false, color);
                document.getElementById('colorIndicator').style.background = color;
                colorDropdown.classList.remove('show');
            });
        });

        // 에디터 외부 클릭 시 팔레트 닫기
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.color-palette')) {
                colorDropdown.classList.remove('show');
            }
        });

        // 에디터 상태 업데이트 (커서 이동/선택 변경 시)
        editor.addEventListener('keyup', () => this._updateToolbarState());
        editor.addEventListener('mouseup', () => this._updateToolbarState());
    },

    _updateToolbarState() {
        const toolbar = document.getElementById('editorToolbar');
        if (!toolbar) return;

        toolbar.querySelectorAll('button[data-cmd]').forEach(btn => {
            const active = document.queryCommandState(btn.dataset.cmd);
            btn.classList.toggle('active', active);
        });
    },

    _renderImagePreviews() {
        const list = document.getElementById('imagePreviewList');
        if (!list) return;

        list.innerHTML = '';
        this._pendingImages.forEach((img, i) => {
            const item = document.createElement('div');
            item.className = 'image-preview-item';
            item.innerHTML = `
                <img src="${img}" alt="">
                <button class="remove-image" data-index="${i}"><i class="fas fa-times"></i></button>
            `;
            list.appendChild(item);
        });

        list.querySelectorAll('.remove-image').forEach(btn => {
            btn.addEventListener('click', () => {
                this._pendingImages.splice(parseInt(btn.dataset.index), 1);
                this._renderImagePreviews();
            });
        });
    }
};
