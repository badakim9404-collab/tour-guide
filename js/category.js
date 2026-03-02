// ===== 카테고리 관리 =====

const Category = {
    // 사이드바 카테고리 트리 렌더링
    async renderTree() {
        const tree = document.getElementById('categoryTree');
        const categories = await DB.getCategories();
        const posts = (await DB.getAll('posts')).filter(p => !p._deleted);

        if (categories.length === 0) {
            tree.innerHTML = `
                <div style="padding: 16px; text-align: center; color: var(--gray-500); font-size: 0.85rem;">
                    카테고리를 추가해주세요
                </div>`;
            return;
        }

        // 카테고리별 글 개수 계산
        const countMap = {};
        posts.forEach(p => {
            const key = p.subcategoryId ? `${p.categoryId}_${p.subcategoryId}` : p.categoryId;
            countMap[key] = (countMap[key] || 0) + 1;
            countMap[p.categoryId] = (countMap[p.categoryId] || 0) + (p.subcategoryId ? 0 : 0);
        });
        // 카테고리 전체 글 수
        posts.forEach(p => {
            if (!countMap[`cat_${p.categoryId}`]) countMap[`cat_${p.categoryId}`] = 0;
            countMap[`cat_${p.categoryId}`]++;
        });

        let html = '';
        categories.forEach(cat => {
            const catCount = countMap[`cat_${cat.id}`] || 0;
            const isActive = App.state.categoryId === cat.id && !App.state.subcategoryId;
            const isExpanded = App.state.categoryId === cat.id;

            html += `<div class="cat-item">`;
            html += `<div class="cat-header ${isActive ? 'active' : ''} ${isExpanded ? 'expanded' : ''}"
                         data-cat-id="${cat.id}">`;
            html += `<i class="fas fa-chevron-right cat-icon"></i>`;
            html += `<span>${Utils.escapeHtml(cat.name)}</span>`;
            html += `<span class="cat-count">${catCount}</span>`;
            html += `</div>`;

            if (cat.subcategories && cat.subcategories.length > 0) {
                html += `<div class="subcat-list ${isExpanded ? 'show' : ''}">`;
                cat.subcategories.forEach(sub => {
                    const subCount = countMap[`${cat.id}_${sub.id}`] || 0;
                    const subActive = App.state.subcategoryId === sub.id;
                    html += `<div class="subcat-item ${subActive ? 'active' : ''}"
                                 data-cat-id="${cat.id}" data-subcat-id="${sub.id}">
                                ${Utils.escapeHtml(sub.name)} <span class="cat-count">${subCount}</span>
                            </div>`;
                });
                html += `</div>`;
            }

            html += `</div>`;
        });

        tree.innerHTML = html;

        // 이벤트 바인딩
        tree.querySelectorAll('.cat-header').forEach(el => {
            el.addEventListener('click', (e) => {
                const catId = el.dataset.catId;
                // 토글 확장/축소
                el.classList.toggle('expanded');
                const subcatList = el.nextElementSibling;
                if (subcatList && subcatList.classList.contains('subcat-list')) {
                    subcatList.classList.toggle('show');
                }
                // 해당 카테고리로 글 목록 이동
                App.navigate('posts', { categoryId: catId, subcategoryId: null });
            });
        });

        tree.querySelectorAll('.subcat-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                App.navigate('posts', {
                    categoryId: el.dataset.catId,
                    subcategoryId: el.dataset.subcatId
                });
            });
        });
    },

    // 카테고리 관리 뷰 렌더링
    async renderManageView() {
        const categories = await DB.getCategories();
        const main = document.getElementById('mainContent');

        let html = `<div class="cat-manage-section">`;
        html += `<h2><i class="fas fa-folder-open"></i> 카테고리 관리</h2>`;

        // 새 카테고리 추가
        html += `<div class="add-cat-row" style="margin-bottom: 20px;">
                    <input type="text" id="newCatName" placeholder="새 카테고리 이름">
                    <button class="btn btn-primary" id="addCatBtn">
                        <i class="fas fa-plus"></i> 추가
                    </button>
                 </div>`;

        html += `<div class="cat-manage-list">`;
        categories.forEach(cat => {
            html += `<div class="cat-manage-item" data-cat-id="${cat.id}">`;
            html += `<div class="cat-manage-item-header">
                        <span class="cat-name">${Utils.escapeHtml(cat.name)}</span>
                        <div class="cat-actions">
                            <button class="btn btn-icon btn-sm edit-cat" data-cat-id="${cat.id}" title="이름 수정">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-icon btn-sm delete-cat" data-cat-id="${cat.id}" title="삭제">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                     </div>`;

            // 하위 카테고리 목록
            html += `<div class="cat-manage-subcats">`;
            if (cat.subcategories) {
                cat.subcategories.forEach(sub => {
                    html += `<div class="subcat-manage-item">
                                <span>${Utils.escapeHtml(sub.name)}</span>
                                <div class="cat-actions">
                                    <button class="btn btn-icon btn-sm edit-subcat"
                                            data-cat-id="${cat.id}" data-subcat-id="${sub.id}" title="수정">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-icon btn-sm delete-subcat"
                                            data-cat-id="${cat.id}" data-subcat-id="${sub.id}" title="삭제">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>`;
                });
            }
            html += `</div>`;

            // 하위 카테고리 추가
            html += `<div class="add-subcat-row">
                        <input type="text" class="new-subcat-name" data-cat-id="${cat.id}" placeholder="하위 카테고리 추가">
                        <button class="btn btn-sm btn-secondary add-subcat" data-cat-id="${cat.id}">
                            <i class="fas fa-plus"></i>
                        </button>
                     </div>`;

            html += `</div>`;
        });
        html += `</div></div>`;

        main.innerHTML = html;
        this._bindManageEvents();
    },

    _bindManageEvents() {
        // 새 카테고리 추가
        document.getElementById('addCatBtn').addEventListener('click', async () => {
            const input = document.getElementById('newCatName');
            const name = input.value.trim();
            if (!name) return;

            const categories = await DB.getCategories();
            await DB.saveCategory({
                name,
                subcategories: [],
                order: categories.length
            });
            input.value = '';
            Utils.showToast('카테고리가 추가되었습니다');
            this.renderManageView();
            this.renderTree();
        });

        // Enter 키로도 추가
        document.getElementById('newCatName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('addCatBtn').click();
        });

        // 카테고리 수정
        document.querySelectorAll('.edit-cat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const catId = btn.dataset.catId;
                const cat = await DB.get('categories', catId);
                const newName = prompt('카테고리 이름:', cat.name);
                if (newName && newName.trim()) {
                    cat.name = newName.trim();
                    await DB.saveCategory(cat);
                    Utils.showToast('수정되었습니다');
                    this.renderManageView();
                    this.renderTree();
                }
            });
        });

        // 카테고리 삭제
        document.querySelectorAll('.delete-cat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const catId = btn.dataset.catId;
                App.showConfirm('이 카테고리를 삭제하시겠습니까? 관련 글과 장소는 유지됩니다.', async () => {
                    await DB.deleteCategory(catId);
                    Utils.showToast('삭제되었습니다');
                    this.renderManageView();
                    this.renderTree();
                });
            });
        });

        // 하위 카테고리 추가
        document.querySelectorAll('.add-subcat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const catId = btn.dataset.catId;
                const input = document.querySelector(`.new-subcat-name[data-cat-id="${catId}"]`);
                const name = input.value.trim();
                if (!name) return;

                const cat = await DB.get('categories', catId);
                cat.subcategories.push({ id: Utils.generateId(), name });
                await DB.saveCategory(cat);
                input.value = '';
                Utils.showToast('하위 카테고리가 추가되었습니다');
                this.renderManageView();
                this.renderTree();
            });
        });

        // 하위 카테고리 Enter
        document.querySelectorAll('.new-subcat-name').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.querySelector(`.add-subcat[data-cat-id="${input.dataset.catId}"]`).click();
                }
            });
        });

        // 하위 카테고리 수정
        document.querySelectorAll('.edit-subcat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const catId = btn.dataset.catId;
                const subcatId = btn.dataset.subcatId;
                const cat = await DB.get('categories', catId);
                const sub = cat.subcategories.find(s => s.id === subcatId);
                const newName = prompt('하위 카테고리 이름:', sub.name);
                if (newName && newName.trim()) {
                    sub.name = newName.trim();
                    await DB.saveCategory(cat);
                    Utils.showToast('수정되었습니다');
                    this.renderManageView();
                    this.renderTree();
                }
            });
        });

        // 하위 카테고리 삭제
        document.querySelectorAll('.delete-subcat').forEach(btn => {
            btn.addEventListener('click', async () => {
                const catId = btn.dataset.catId;
                const subcatId = btn.dataset.subcatId;
                App.showConfirm('이 하위 카테고리를 삭제하시겠습니까?', async () => {
                    const cat = await DB.get('categories', catId);
                    cat.subcategories = cat.subcategories.filter(s => s.id !== subcatId);
                    await DB.saveCategory(cat);
                    Utils.showToast('삭제되었습니다');
                    this.renderManageView();
                    this.renderTree();
                });
            });
        });
    }
};
