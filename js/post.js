// ===== 글(포스트) 관리 =====

const Post = {
    // 이미지 임시 저장
    _pendingImages: [],
    _draggingImage: null,

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
                const thumbSrc = this._getPostThumbnail(post);
                const thumb = thumbSrc
                    ? `<img src="${thumbSrc}" alt="">`
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
                const thumbSrc = this._getPostThumbnail(post);
                const thumb = thumbSrc
                    ? `<img src="${thumbSrc}" alt="">`
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

        // 이미지 라이트박스 (별도 이미지 그리드 + 본문 인라인 이미지)
        main.querySelectorAll('.lightbox-trigger').forEach(img => {
            img.addEventListener('click', () => {
                App.showLightbox(img.src);
            });
        });
        main.querySelectorAll('.post-detail-content img').forEach(img => {
            img.style.cursor = 'pointer';
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
                            <div class="toolbar-divider"></div>
                            <div class="toolbar-group">
                                <button type="button" id="insertImageBtn" title="이미지 삽입"><i class="fas fa-image"></i></button>
                            </div>
                        </div>
                        <div class="editor-content" contenteditable="true" id="postContent" data-placeholder="내용을 입력하세요">${post.content || ''}</div>
                        <input type="file" id="inlineImageInput" multiple accept="image/*" style="display:none">
                    </div>
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

        // 저장
        document.getElementById('savePostBtn').addEventListener('click', async () => {
            const title = document.getElementById('postTitle').value.trim();
            if (!title) {
                Utils.showToast('제목을 입력해주세요');
                return;
            }

            // 저장 전 리사이즈 UI 정리
            this._removeImageResizeUI();

            const data = {
                title,
                content: document.getElementById('postContent').innerHTML,
                categoryId: document.getElementById('postCategory').value || null,
                subcategoryId: document.getElementById('postSubcategory').value || null,
                images: []
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

    // 인라인 이미지 삽입 (파일 → 압축 → 커서 위치에 삽입)
    _insertInlineImages(files) {
        const editor = document.getElementById('postContent');
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        const sel = window.getSelection();
        let savedRange = sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

        const promises = imageFiles.map(file => new Promise(resolve => {
            this._compressImage(file, resolve);
        }));

        Promise.all(promises).then(dataUrls => {
            editor.focus();

            // 이미지들을 순서대로 커서 위치에 삽입
            const frag = document.createDocumentFragment();
            dataUrls.forEach(dataUrl => {
                const img = document.createElement('img');
                img.src = dataUrl;
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                frag.appendChild(img);
            });

            if (savedRange) {
                savedRange.deleteContents();
                savedRange.insertNode(frag);
            } else {
                editor.appendChild(frag);
            }

            // 삽입된 이미지에 리사이즈 바인딩
            editor.querySelectorAll('img').forEach(img => {
                if (!img._resizable) {
                    this._makeImageResizable(img);
                    img._resizable = true;
                }
            });
        });
    },

    // 이미지 압축 (Canvas API, 최대 1200px, JPEG 70%)
    _compressImage(file, callback) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxSize = 1200;
                let w = img.width;
                let h = img.height;

                if (w > maxSize || h > maxSize) {
                    if (w > h) {
                        h = Math.round(h * maxSize / w);
                        w = maxSize;
                    } else {
                        w = Math.round(w * maxSize / h);
                        h = maxSize;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);

                // PNG 투명도 유지 필요 시 png, 아니면 jpeg 압축
                const isPng = file.type === 'image/png';
                const dataUrl = isPng
                    ? canvas.toDataURL('image/png')
                    : canvas.toDataURL('image/jpeg', 0.7);
                callback(dataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    // 이미지 클릭 시 리사이즈, 드래그로 이동
    _makeImageResizable(img) {
        if (img._resizable) return;
        img._resizable = true;
        img.style.cursor = 'pointer';
        img.draggable = true;

        img.addEventListener('click', (e) => {
            if (this._draggingImage) return;
            e.preventDefault();
            e.stopPropagation();
            this._showImageResizeUI(img);
        });

        // 드래그 시작 — 이동 모드
        img.addEventListener('dragstart', (e) => {
            this._removeImageResizeUI();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/x-move', '1');
            this._draggingImage = img;
            setTimeout(() => { img.style.opacity = '0.4'; }, 0);
        });

        img.addEventListener('dragend', () => {
            img.style.opacity = '';
            this._draggingImage = null;
        });
    },

    // 리사이즈 UI 표시
    _showImageResizeUI(img) {
        // 기존 UI 제거
        this._removeImageResizeUI();

        const editor = document.getElementById('postContent');

        // 현재 이미지의 크기를 에디터 기준 퍼센트로 계산
        const currentPct = Math.round(img.offsetWidth / editor.offsetWidth * 100);

        // 래퍼로 감싸기 — 래퍼에 크기 적용, img는 100% 채움
        const wrapper = document.createElement('span');
        wrapper.className = 'image-resize-wrapper';
        wrapper.contentEditable = 'false';
        wrapper.style.width = currentPct + '%';
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);

        // 래퍼 안 img는 래퍼를 꽉 채움
        img.style.width = '100%';
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        // 드래그 리사이즈 핸들
        const handle = document.createElement('span');
        handle.className = 'image-resize-handle';
        wrapper.appendChild(handle);

        // 크기 버튼 툴바
        const toolbar = document.createElement('div');
        toolbar.className = 'image-resize-toolbar';
        toolbar.innerHTML = `
            <button type="button" data-size="25">25%</button>
            <button type="button" data-size="50">50%</button>
            <button type="button" data-size="75">75%</button>
            <button type="button" data-size="100">100%</button>
            <button type="button" data-action="delete" class="resize-delete-btn"><i class="fas fa-trash"></i></button>
        `;
        wrapper.appendChild(toolbar);

        // 크기 버튼 이벤트 — 래퍼 크기 변경
        toolbar.querySelectorAll('button[data-size]').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pct = parseInt(btn.dataset.size);
                wrapper.style.width = pct + '%';
            });
        });

        // 삭제 버튼
        toolbar.querySelector('[data-action="delete"]').addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            wrapper.remove();
        });

        // 드래그 리사이즈 — 래퍼 크기 변경
        let startX, startWidth;
        const onMouseDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            startX = e.clientX || (e.touches && e.touches[0].clientX);
            startWidth = wrapper.offsetWidth;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchmove', onMouseMove, { passive: false });
            document.addEventListener('touchend', onMouseUp);
        };
        const onMouseMove = (e) => {
            e.preventDefault();
            const clientX = e.clientX || (e.touches && e.touches[0].clientX);
            const diff = clientX - startX;
            const newWidth = Math.max(50, startWidth + diff);
            const editorWidth = editor.offsetWidth;
            const pct = Math.min(100, Math.round(newWidth / editorWidth * 100));
            wrapper.style.width = pct + '%';
        };
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onMouseMove);
            document.removeEventListener('touchend', onMouseUp);
        };
        handle.addEventListener('mousedown', onMouseDown);
        handle.addEventListener('touchstart', onMouseDown, { passive: false });
    },

    // 리사이즈 UI 정리 (저장 전 호출) — 래퍼 크기를 img에 옮김
    _removeImageResizeUI() {
        document.querySelectorAll('.image-resize-wrapper').forEach(wrapper => {
            const img = wrapper.querySelector('img');
            if (img) {
                // 래퍼의 퍼센트 크기를 img에 적용
                img.style.width = wrapper.style.width || '';
                img.style.maxWidth = wrapper.style.width || '100%';
                img.style.height = 'auto';
                wrapper.parentNode.insertBefore(img, wrapper);
            }
            wrapper.remove();
        });
    },

    // 인라인 이미지에서 첫 번째 이미지 추출 (썸네일용)
    _getPostThumbnail(post) {
        // 기존 images 배열 우선
        if (post.images && post.images.length > 0) {
            return post.images[0];
        }
        // 본문에서 인라인 이미지 추출
        if (post.content) {
            const match = post.content.match(/<img[^>]+src="([^"]+)"/);
            if (match) return match[1];
        }
        return null;
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

        // === 인라인 이미지 기능 ===
        const imageBtn = document.getElementById('insertImageBtn');
        const imageInput = document.getElementById('inlineImageInput');

        // 이미지 버튼 클릭 → 파일 선택
        imageBtn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            imageInput.click();
        });

        imageInput.addEventListener('change', () => {
            this._insertInlineImages(imageInput.files);
            imageInput.value = '';
        });

        // 드래그&드롭 — 내부 이미지 이동 + 외부 파일 삽입
        editor.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = this._draggingImage ? 'move' : 'copy';
            editor.classList.add('drag-over');
        });
        editor.addEventListener('dragleave', () => {
            editor.classList.remove('drag-over');
        });
        editor.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            editor.classList.remove('drag-over');

            // 내부 이미지 이동
            if (this._draggingImage) {
                const img = this._draggingImage;
                this._draggingImage = null;
                img.style.opacity = '';

                // 드롭 위치 계산
                let range = null;
                if (document.caretRangeFromPoint) {
                    range = document.caretRangeFromPoint(e.clientX, e.clientY);
                } else if (document.caretPositionFromPoint) {
                    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
                    if (pos) {
                        range = document.createRange();
                        range.setStart(pos.offsetNode, pos.offset);
                        range.collapse(true);
                    }
                }

                if (range && editor.contains(range.startContainer)) {
                    img.remove();
                    range.insertNode(img);
                }
                return;
            }

            // 외부 파일 드롭
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this._insertInlineImages(files);
            }
        });

        // 클립보드 붙여넣기 (캡처도구 포함)
        editor.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            const imageFiles = [];
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    imageFiles.push(item.getAsFile());
                }
            }
            if (imageFiles.length > 0) {
                this._insertInlineImages(imageFiles);
            }
        });

        // 에디터 내 기존 이미지에 리사이즈 바인딩
        editor.querySelectorAll('img').forEach(img => {
            this._makeImageResizable(img);
        });

        // 에디터 외부 클릭 시 리사이즈 UI 닫기
        document.addEventListener('mousedown', (e) => {
            if (!e.target.closest('.image-resize-wrapper') && !e.target.closest('.image-resize-toolbar')) {
                this._removeImageResizeUI();
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
        // 하위 호환: 미사용 (인라인 이미지로 대체)
    }
};
