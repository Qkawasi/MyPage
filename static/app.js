// 搜索引擎配置
const SEARCH_ENGINES = {
    baidu: {
        url: 'https://www.baidu.com/s?wd='
    },
    google: {
        url: 'https://www.google.com/search?q='
    },
    bing: {
        url: 'https://www.bing.com/search?q='
    }
};

// 保存搜索引擎选择
function saveSearchEngine(engine) {
    localStorage.setItem('preferred_search_engine', engine);
}

// 获取保存的搜索引擎
function getSearchEngine() {
    return localStorage.getItem('preferred_search_engine') || 'baidu';
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 设置保存的搜索引擎
    const searchEngine = document.getElementById('searchEngine');
    searchEngine.value = getSearchEngine();
    
    // 检查并恢复登录状态
    checkLoginStatus();
    
    initializePage();
});

// 检查登录状态
async function checkLoginStatus() {
    const token = getToken();
    if (token) {
        try {
            const response = await fetch(`${API_BASE_URL}/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (response.ok) {
                isAdmin = true;
                isEditMode = false;  // 默认不进入编辑模式
                updateAdminButton();
            } else {
                // Token 无效，清除它
                setToken(null);
            }
        } catch (error) {
            console.error('验证token失败:', error);
            setToken(null);
        }
    }
}

async function initializePage() {
    await loadNavigation();
}

// 添加编辑模式状态
let isAdmin = false;
let isEditMode = false;

// 更新管理员按钮状态
function updateAdminButton() {
    const adminButton = document.getElementById('adminButton');
    if (isAdmin) {
        if (isEditMode) {
            adminButton.innerHTML = `
                <button class="admin-button" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i> 退出登录
                </button>
                <button class="admin-button" onclick="exitEditMode()">
                    <i class="fas fa-times"></i> 退出编辑
                </button>
            `;
        } else {
            adminButton.innerHTML = `
                <button class="admin-button" onclick="handleLogout()">
                    <i class="fas fa-sign-out-alt"></i> 退出登录
                </button>
                <button class="admin-button" onclick="enterEditMode()">
                    <i class="fas fa-edit"></i> 编辑
                </button>
            `;
        }
    } else {
        adminButton.innerHTML = `
            <button class="admin-button" onclick="openAdminModal()">
                <i class="fas fa-user-lock"></i> 管理员登录
            </button>
        `;
    }
}

// 进入编辑模式
function enterEditMode() {
    isEditMode = true;
    updateAdminButton();
    loadNavigation();
}

// 退出编辑模式
function exitEditMode() {
    isEditMode = false;
    updateAdminButton();
    loadNavigation();
}

// 退出登录
function handleLogout() {
    setToken(null);
    isAdmin = false;
    isEditMode = false;
    updateAdminButton();
    loadNavigation();
}

// 搜索处理
function handleSearch(event) {
    event.preventDefault();
    const searchInput = document.getElementById('searchInput');
    const searchEngine = document.getElementById('searchEngine');
    const query = searchInput.value.trim();
    
    if (query) {
        const url = SEARCH_ENGINES[searchEngine.value].url + encodeURIComponent(query);
        window.open(url, '_blank');
    }

    // 保存用户选择
    saveSearchEngine(searchEngine.value);
}

// 管理员登录相关
function openAdminModal() {
    document.getElementById('adminModal').style.display = 'block';
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
}

async function handleLogin(event) {
    event.preventDefault();
    const password = document.getElementById('adminPassword').value;
    
    try {
        await login(password);
        closeAdminModal();
        isAdmin = true;
        updateAdminButton();
        showToast('登录成功');
        await loadNavigation(); // 重新加载导航以显示私密链接
    } catch (error) {
        showToast('登录失败: ' + error.message, 'error');
    }
}

// 链接管理相关
function openLinkModal(linkId = null) {
    if (!isEditMode) {
        showToast('请先登录管理员账号');
        return;
    }
    
    const modal = document.getElementById('linkModal');
    const form = document.getElementById('linkForm');
    
    // 打开时绝对清空所有旧状态
    form.reset();
    form.removeAttribute('data-link-id');
    form.removeAttribute('data-order-num');
    delete form.dataset.linkId;
    delete form.dataset.orderNum;
    
    updateGroupSelect();
    
    if (linkId) {
        loadLinkData(linkId);
    }
    
    // URL 输入框的失焦事件监听
    const urlInput = document.getElementById('linkUrl');
    urlInput.removeEventListener('blur', autoFillLinkInfo); 
    urlInput.addEventListener('blur', autoFillLinkInfo);
    
    modal.style.display = 'block';
}

function closeLinkModal() {
    const modal = document.getElementById('linkModal');
    const form = document.getElementById('linkForm');
    
    modal.style.display = 'none';
    
    // 关闭窗口时立即抹除所有状态
    form.reset();
    form.removeAttribute('data-link-id');
    form.removeAttribute('data-order-num');
    delete form.dataset.linkId;
    delete form.dataset.orderNum;
}

async function handleLinkSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const linkId = form.dataset.linkId || form.getAttribute('data-link-id');
    const groupId = parseInt(document.getElementById('linkGroup').value);
    
    if (!groupId) {
        showToast('请选择分组', 'error');
        return;
    }

    let orderNum;
    const links = await fetchLinks();
    
    if (linkId) {
        // 【核心修复】编辑现有链接
        const currentLink = links.find(l => l.id === parseInt(linkId));
        
        if (currentLink && currentLink.group_id !== groupId) {
            // 如果发生了跨分组移动：
            try {
                // 1. 让原分组内序号大于当前移动链接的其他链接序号自动往前移，填补空缺
                const oldGroupLinks = links.filter(l => l.group_id === currentLink.group_id);
                for (const link of oldGroupLinks) {
                    if (link.order_num > currentLink.order_num) {
                        await updateLink(link.id, {
                            ...link,
                            order_num: link.order_num - 1
                        });
                    }
                }
                
                // 2. 重新获取新目标分组内的最大序号，确保新序号绝对唯一，挂在最末尾，绝对不覆盖他人
                const targetGroupLinks = links.filter(l => l.group_id === groupId);
                const maxOrderNum = targetGroupLinks.reduce((max, link) => Math.max(max, link.order_num || 0), 0);
                orderNum = maxOrderNum + 1;
                
            } catch (error) {
                showToast('跨组转移序号计算失败: ' + error.message, 'error');
                return;
            }
        } else {
            // 同分组内编辑，严格保持原序号不发生变动
            orderNum = parseInt(form.dataset.orderNum) || (currentLink ? currentLink.order_num : 1);
        }
    } else {
        // 添加全新链接：获取目标分组当前最大序号 + 1
        const targetGroupLinks = links.filter(l => l.group_id === groupId);
        const maxOrderNum = targetGroupLinks.reduce((max, link) => Math.max(max, link.order_num || 0), 0);
        orderNum = maxOrderNum + 1;
    }
    
    const formData = {
        name: document.getElementById('linkName').value,
        url: document.getElementById('linkUrl').value,
        logo: document.getElementById('linkLogo').value,
        description: document.getElementById('linkDescription').value,
        group_id: groupId,
        order_num: orderNum
    };
    
    try {
        if (linkId) {
            await updateLink(parseInt(linkId), formData);
            showToast('更新成功');
        } else {
            await createLink(formData);
            showToast('添加成功');
        }
        
        closeLinkModal();
        await loadNavigation();
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

// 分组管理相关
function openGroupModal(groupId = null) {
    if (!isEditMode) {
        showToast('请先登录管理员账号');
        return;
    }
    
    const modal = document.getElementById('groupModal');
    const form = document.getElementById('groupForm');
    form.reset();
    form.removeAttribute('data-group-id');
    form.removeAttribute('data-order-num');
    delete form.dataset.groupId;
    delete form.dataset.orderNum;
    
    if (groupId) {
        loadGroupData(groupId);
    }
    
    modal.style.display = 'block';
}

function closeGroupModal() {
    const modal = document.getElementById('groupModal');
    const form = document.getElementById('groupForm');
    modal.style.display = 'none';
    form.reset();
    form.removeAttribute('data-group-id');
    form.removeAttribute('data-order-num');
    delete form.dataset.groupId;
    delete form.dataset.orderNum;
}

async function handleGroupSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const groupId = form.dataset.groupId || form.getAttribute('data-group-id');
    
    const groups = await fetchGroups();
    const maxOrderNum = Math.max(0, ...groups.map(g => g.order_num || 0));
    
    const formData = {
        name: document.getElementById('groupName').value,
        is_private: document.getElementById('groupPrivate').checked,
        order_num: groupId ? parseInt(form.dataset.orderNum) || 0 : maxOrderNum + 1
    };
    
    try {
        if (groupId) {
            await updateGroup(parseInt(groupId), formData);
            showToast('分组更新成功');
        } else {
            await createGroup(formData);
            showToast('分组创建成功');
        }
        closeGroupModal();
        await loadNavigation();
    } catch (error) {
        showToast('保存失败: ' + error.message, 'error');
    }
}

// 图标缓存
const iconCache = new Map();

// 获取图标URL并缓存
async function getIconUrl({ url }) {
    try {
        const domain = new URL(url).hostname;
        const cacheKey = `icon_cache_${domain}`;
        const cachedUrl = localStorage.getItem(cacheKey);
        if (cachedUrl) {
            return cachedUrl;
        }
        
        const iconUrls = [
            `https://icon.horse/icon/${domain}`,
            `https://api.faviconkit.com/${domain}/144`,
            `https://${domain}/favicon.ico`
        ];
        
        for (const iconUrl of iconUrls) {
            try {
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = iconUrl;
                });
                localStorage.setItem(cacheKey, iconUrl);
                return iconUrl;
            }
            catch (error) {
                continue;
            }
        }
        return null;
    } catch (error) {
        return null;
    }
}

// 导航内容加载
async function loadNavigation() {
    const navigationElement = document.getElementById('navigation');
    const groupNavElement = document.getElementById('groupNav');
    
    const loadingHtml = `
        <div class="nav-loading">
            <div class="nav-loading-dot"></div>
            <div class="nav-loading-dot"></div>
            <div class="nav-loading-dot"></div>
        </div>
    `;
    
    navigationElement.innerHTML = `
        <div class="loading">
            <div class="loading-wave">
                <div></div>
                <div></div>
            </div>
            <div>加载中...</div>
        </div>
    `;
    groupNavElement.innerHTML = loadingHtml;
    
    try {
        const groups = await fetchGroups();
        const links = await fetchLinks();
        
        let html = '';
        let navHtml = '';
        
        if (isEditMode) {
            html += `
                <div class="admin-controls">
                    <button onclick="openGroupModal()">
                        <i class="fas fa-folder-plus"></i> 添加分组
                    </button>
                    <button onclick="openLinkModal()">
                        <i class="fas fa-link"></i> 添加链接
                    </button>
                </div>
            `;
        }
        
        if (groups.length === 0) {
            navigationElement.innerHTML = html + '暂无内容';
            groupNavElement.innerHTML = '暂无分组';
            return;
        }
        
        groups.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
        
        for (const group of groups) {
            if (!group.is_private || isAdmin) {
                const groupLinks = links
                    .filter(link => link.group_id === group.id)
                    .sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
                    
                const groupId = `group-${group.id}`;
                
                html += `
                    <div id="${groupId}" class="group">
                        <div class="group-title">
                            ${getGroupTitle(group)}
                            ${getGroupActions(group.id)}
                        </div>
                        <div class="links">
                            ${groupLinks.map(link => getLinkCard(link)).join('')}
                        </div>
                    </div>
                `;
                
                navHtml += `
                    <a href="#${groupId}" 
                       class="nav-item" 
                       onclick="highlightNavItem(this)"
                       data-group-id="${groupId}">
                        ${group.name}
                        ${group.is_private ? 
                            `<i class="fas fa-lock group-privacy-icon" title="私密分组"></i>` : ''
                        }
                    </a>
                `;
            }
        }
        
        navigationElement.innerHTML = html;
        groupNavElement.innerHTML = navHtml;
        
        await loadIcons();
        window.removeEventListener('scroll', updateActiveNavItem);
        window.addEventListener('scroll', updateActiveNavItem);
    } catch (error) {
        navigationElement.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
        groupNavElement.innerHTML = `<div class="error">加载失败</div>`;
    }
}

// 高亮当前选中的导航项
function highlightNavItem(element) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');
}

// 根据滚动位置更新活动导航项
function updateActiveNavItem() {
    const groups = document.querySelectorAll('.group');
    const navItems = document.querySelectorAll('.nav-item');
    
    groups.forEach((group, index) => {
        const rect = group.getBoundingClientRect();
        if (rect.top <= 100 && rect.bottom >= 100 && navItems[index]) {
            highlightNavItem(navItems[index]);
        }
    });
}

// 提示消息
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '';
    switch (type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i>';
            break;
        case 'error':
            icon = '<i class="fas fa-times-circle"></i>';
            break;
        case 'loading':
            icon = '<i class="fas fa-spinner"></i>';
            break;
    }
    
    toast.innerHTML = `${icon}${message}`;
    container.appendChild(toast);
    
    if (type !== 'loading') {
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    return toast;
}

// 显示确认对话框
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirmDialog');
        if (!dialog) { resolve(true); return; }
        dialog.querySelector('.confirm-title').textContent = title;
        dialog.querySelector('.confirm-message').textContent = message;
        dialog.style.display = 'block';
        
        const handleClick = (result) => {
            dialog.style.display = 'none';
            resolve(result);
        };
        
        dialog.querySelector('.confirm-ok').onclick = () => handleClick(true);
        dialog.querySelector('.confirm-cancel').onclick = () => handleClick(false);
    });
}

// 点击外部关闭模态框
window.addEventListener('click', function(event) {
    const adminModal = document.getElementById('adminModal');
    const linkModal = document.getElementById('linkModal');
    const groupModal = document.getElementById('groupModal');
    
    if (event.target === adminModal) closeAdminModal();
    if (event.target === linkModal) closeLinkModal();
    if (event.target === groupModal) closeGroupModal();
});

// 删除分组确认
async function deleteGroupConfirm(groupId) {
    const confirmed = await showConfirm(
        '删除分组',
        '确定要删除这个分组吗？这将同时删除组内的所有链接！'
    );
    
    if (confirmed) {
        const toast = showToast('正在删除分组...', 'loading');
        try {
            await deleteGroup(groupId);
            if (toast) toast.remove();
            showToast('分组删除成功');
            await loadNavigation();
        } catch (error) {
            if (toast) toast.remove();
            showToast('删除失败: ' + error.message, 'error');
        }
    }
}

// 加载分组数据到表单
async function loadGroupData(groupId) {
    try {
        const groups = await fetchGroups();
        const group = groups.find(g => g.id === parseInt(groupId));
        if (group) {
            const form = document.getElementById('groupForm');
            document.getElementById('groupName').value = group.name;
            document.getElementById('groupPrivate').checked = group.is_private;
            form.dataset.groupId = groupId;
            form.setAttribute('data-group-id', groupId);
            form.dataset.orderNum = group.order_num;
        }
    } catch (error) {
        showToast('加载分组数据失败: ' + error.message, 'error');
    }
}

// 加载链接数据到表单
async function loadLinkData(linkId) {
    try {
        const links = await fetchLinks();
        const link = links.find(l => l.id === parseInt(linkId));
        if (link) {
            const form = document.getElementById('linkForm');
            document.getElementById('linkName').value = link.name;
            document.getElementById('linkUrl').value = link.url;
            document.getElementById('linkLogo').value = link.logo || '';
            document.getElementById('linkDescription').value = link.description || '';
            document.getElementById('linkGroup').value = link.group_id;
            
            form.dataset.linkId = linkId;
            form.setAttribute('data-link-id', linkId);
            form.dataset.orderNum = link.order_num;
        }
    } catch (error) {
        showToast('加载链接数据失败: ' + error.message, 'error');
    }
}

// 更新分组下拉列表
async function updateGroupSelect() {
    const select = document.getElementById('linkGroup');
    try {
        const groups = await fetchGroups();
        groups.sort((a, b) => (a.order_num || 0) - (b.order_num || 0));
        select.innerHTML = '<option value="">选择分组...</option>' +
            groups.map(group => 
                `<option value="${group.id}">${group.name}</option>`
            ).join('');
    } catch (error) {
        console.error('加载分组列表失败:', error);
    }
}

// 删除链接确认
async function deleteLinkConfirm(linkId) {
    const confirmed = await showConfirm(
        '删除链接',
        '确定要删除这个链接吗？'
    );
    
    if (confirmed) {
        const toast = showToast('正在删除链接...', 'loading');
        try {
            await deleteLink(linkId);
            if (toast) toast.remove();
            showToast('链接删除成功');
            await loadNavigation();
        } catch (error) {
            if (toast) toast.remove();
            showToast('删除失败: ' + error.message, 'error');
        }
    }
}

// 链接排序功能
async function moveLinkUp(linkId, groupId) {
    let toast;
    const links = (await fetchLinks()).filter(l => l.group_id === groupId).sort((a,b) => a.order_num - b.order_num);
    const currentIndex = links.findIndex(l => l.id === linkId);
    if (currentIndex === 0) {
        showToast('已经是第一个链接了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentLink = links[currentIndex];
    const prevLink = links[currentIndex - 1];
    try {
        const currentOrder = currentLink.order_num;
        await updateLink(currentLink.id, { ...currentLink, order_num: prevLink.order_num });
        await updateLink(prevLink.id, { ...prevLink, order_num: currentOrder });
        
        if (toast) toast.remove();
        showToast('链接顺序已更新');
        await loadNavigation();
    } catch (error) {
        if (toast) toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

async function moveLinkDown(linkId, groupId) {
    let toast;
    const links = (await fetchLinks()).filter(l => l.group_id === groupId).sort((a,b) => a.order_num - b.order_num);
    const currentIndex = links.findIndex(l => l.id === linkId);
    if (currentIndex === links.length - 1) {
        showToast('已经是最后一个链接了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentLink = links[currentIndex];
    const nextLink = links[currentIndex + 1];
    try {
        const currentOrder = currentLink.order_num;
        await updateLink(currentLink.id, { ...currentLink, order_num: nextLink.order_num });
        await updateLink(nextLink.id, { ...nextLink, order_num: currentOrder });
        
        if (toast) toast.remove();
        showToast('链接顺序已更新');
        await loadNavigation();
    } catch (error) {
        if (toast) toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

// 自动获取网页信息
async function autoFillLinkInfo() {
    const urlInput = document.getElementById('linkUrl');
    const nameInput = document.getElementById('linkName');
    const logoInput = document.getElementById('linkLogo');
    const descriptionInput = document.getElementById('linkDescription');
    const url = urlInput.value.trim();

    if (!url) return;

    const toast = showToast('正在获取网页信息...', 'loading');
    try {
        const iconUrl = await getIconUrl({ url });
        const info = await fetchWebInfo(url);
        
        if (!nameInput.value) nameInput.value = info.title || '';
        if (!logoInput.value) logoInput.value = iconUrl || '';
        if (!descriptionInput.value) descriptionInput.value = info.description || '';
        
        if (toast) toast.remove();
        showToast('获取网页信息成功');
    } catch (error) {
        if (toast) toast.remove();
        showToast('获取网页信息失败: ' + error.message, 'error');
    }
}

// 分组排序功能
async function moveGroupUp(groupId) {
    let toast;
    const groups = (await fetchGroups()).sort((a,b) => a.order_num - b.order_num);
    const currentIndex = groups.findIndex(g => g.id === groupId);
    if (currentIndex === 0) {
        showToast('已经是第一个分组了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentGroup = groups[currentIndex];
    const prevGroup = groups[currentIndex - 1];
    try {
        const currentOrder = currentGroup.order_num;
        await updateGroup(currentGroup.id, { ...currentGroup, order_num: prevGroup.order_num });
        await updateGroup(prevGroup.id, { ...prevGroup, order_num: currentOrder });
        
        if (toast) toast.remove();
        showToast('分组顺序已更新');
        await loadNavigation();
    } catch (error) {
        if (toast) toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

async function moveGroupDown(groupId) {
    let toast;
    const groups = (await fetchGroups()).sort((a,b) => a.order_num - b.order_num);
    const currentIndex = groups.findIndex(g => g.id === groupId);
    if (currentIndex === groups.length - 1) {
        showToast('已经是最后一个分组了', 'error');
        return;
    }
    
    toast = showToast('正在更新顺序...', 'loading');
    const currentGroup = groups[currentIndex];
    const nextGroup = groups[currentIndex + 1];
    try {
        const currentOrder = currentGroup.order_num;
        await updateGroup(currentGroup.id, { ...currentGroup, order_num: nextGroup.order_num });
        await updateGroup(nextGroup.id, { ...nextGroup, order_num: currentOrder });
        
        if (toast) toast.remove();
        showToast('分组顺序已更新');
        await loadNavigation();
    } catch (error) {
        if (toast) toast.remove();
        showToast('更新顺序失败: ' + error.message, 'error');
    }
}

// 生成分组操作按钮
function getGroupActions(groupId) {
    if (!isEditMode) return '';
    
    return `
        <div class="group-actions">
            <div class="order-actions">
                <button onclick="moveGroupUp(${groupId})" title="上移">
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button onclick="moveGroupDown(${groupId})" title="下移">
                    <i class="fas fa-arrow-down"></i>
                </button>
            </div>
            <button onclick="openGroupModal(${groupId})" title="编辑">
                <i class="fas fa-edit"></i>
            </button>
            <button onclick="deleteGroupConfirm(${groupId})" title="删除">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;
}

// 生成分组标题
function getGroupTitle(group) {
    return `
        <div class="group-title-left">
            ${group.name}
            ${group.is_private ? 
                `<i class="fas fa-lock group-privacy-icon" title="私密分组"></i>` : 
                (isEditMode ? `<i class="fas fa-lock-open group-privacy-icon" title="公开分组"></i>` : '')
            }
        </div>
    `;
}

// 生成链接卡片
function getLinkCard(link) {
    const iconSrc = link.logo || '#';
    const defaultIcon = encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="12" fill="#4299e1" opacity="0.1"/>
            <path fill="#4299e1" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
    `.trim());

    return `
        <a href="${link.url}" target="_blank" class="link-card">
            <div class="link-info">
                <div class="link-icon">
                    <img src="${iconSrc}" 
                        data-url="${link.url}"
                        alt="${link.name}" 
                        ${!link.logo ? 'data-auto-icon="true"' : ''}
                        onerror="this.onerror=null; this.src='data:image/svg+xml,${defaultIcon}';">
                </div>
                <div class="link-text">
                    <span class="link-title">
                        ${link.name}
                    </span>
                    <div class="link-description">${link.description || ''}</div>
                </div>
            </div>
            ${isEditMode ? `
                <div class="link-actions" onclick="event.preventDefault(); event.stopPropagation();">
                    <div class="order-actions">
                        <button onclick="moveLinkUp(${link.id}, ${link.group_id})" title="上移">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                        <button onclick="moveLinkDown(${link.id}, ${link.group_id})" title="下移">
                            <i class="fas fa-arrow-down"></i>
                        </button>
                    </div>
                    <button onclick="openLinkModal(${link.id})" title="编辑">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="deleteLinkConfirm(${link.id})" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : ''}
        </a>
    `;
}

// 加载图标
async function loadIcons() {
    const icons = document.querySelectorAll('.link-icon img');
    const defaultIcon = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="12" fill="#4299e1" opacity="0.1"/>
            <path fill="#4299e1" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
        </svg>
    `.trim());

    for (const img of icons) {
        if (img.dataset.autoIcon === 'true') {
            const url = img.dataset.url;
            if (url) {
                try {
                    const iconUrl = await getIconUrl({ url });
                    if (iconUrl) {
                        img.src = iconUrl;
                        img.crossOrigin = 'anonymous';
                    } else {
                        throw new Error('No icon found');
                    }
                } catch (error) {
                    img.src = defaultIcon;
                }
            }
        }
    }
}
