const config = {
    basePath: '/shop',
    apiEndpoints: {
        products: '/products/list',
        productsByCategory: '/products/list/',
        categories: '/categories/list',
        actions: '/actions/list',
        product: '/product/',
        productCreate: '/product/create',
        productUpdate: '/product/update/',
        productDelete: '/product/delete/',
        categoryCreate: '/category/create',
        categoryUpdate: '/category/update/',
        categoryDelete: '/category/delete/'
    }
};

let currentPurchase = null;
let allProducts = [];
let allCategories = [];
let allActions = [];
let currentCategory = 'all';
let currentForm = null;

async function fetchCategories() {
    try {
        const response = await fetch(`${config.basePath}${config.apiEndpoints.categories}`);
        const data = await response.json();
        return data.error ? [] : (data.categories || []);
    } catch (e) {
        console.error('error fetching categories:', e);
        return [];
    }
}

async function fetchProducts(category = null) {
    try {
        const url = category
            ? `${config.basePath}${config.apiEndpoints.productsByCategory}${category}`
            : `${config.basePath}${config.apiEndpoints.products}`;
        const response = await fetch(url);
        const data = await response.json();
        return data.error ? [] : (data.products || []);
    } catch (e) {
        console.error('error fetching products:', e);
        return [];
    }
}

async function fetchActions() {
    try {
        const response = await fetch(`${config.basePath}${config.apiEndpoints.actions}`, {
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': localStorage.getItem('id'),
                'x-token': localStorage.getItem('token')
            }
        });
        const data = await response.json();
        return data.error ? [] : (data.actions || []);
    } catch (e) {
        console.error('error fetching actions:', e);
        return [];
    }
}

function displayCategories(categories) {
    const categoryNav = document.getElementById('categoryNav');
    categoryNav.innerHTML = '<button class="category-btn active" data-category="all">all products</button>';
    categories.forEach(category => {
        const btn = document.createElement('button');
        btn.className = 'category-btn';
        btn.dataset.category = category.name;
        btn.textContent = category.name;
        btn.addEventListener('click', () => filterByCategory(category.name));
        categoryNav.appendChild(btn);
    });
}

function displayProducts(products) {
    const container = document.getElementById('productsContainer');
    if (products.length === 0) {
        container.innerHTML = '<div class="error">no products found</div>';
        return;
    }
    container.innerHTML = '';
    products.forEach(product => {
        const productEl = document.createElement('div');
        productEl.className = 'product';
        productEl.innerHTML = `
                <div class="product-image">
                    <img src="${product.image_url || 'https://via.placeholder.com/300x200/5865f2/ffffff?text=Product'}" alt="${product.name}">
                </div>
                <div class="product-info">
                    <div class="product-title">${product.name}</div>
                    <div class="product-description">${product.description || ''}</div>
                    <div class="product-footer">
                        <div class="product-price">$${parseFloat(product.price).toFixed(2)}</div>
                        <div class="payment-buttons">
                            <button class="btn-payment btn-paypal" data-payment="paypal">paypal</button>
                            <button class="btn-payment btn-crypto" data-payment="crypto">crypto</button>
                        </div>
                    </div>
                </div>
            `;
        productEl.querySelectorAll('.btn-payment').forEach(btn => {
            btn.addEventListener('click', () => handlePaymentClick(product, btn.dataset.payment));
        });
        container.appendChild(productEl);
    });
}

async function filterByCategory(categoryName) {
    currentCategory = categoryName;
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === categoryName);
    });
    const container = document.getElementById('productsContainer');
    container.innerHTML = '<div class="loading">loading products...</div>';
    const products = categoryName === 'all' ? await fetchProducts() : await fetchProducts(categoryName);
    displayProducts(products);
}

function handlePaymentClick(product, paymentMethod) {
    currentPurchase = {id: product.id, name: product.name, price: product.price, payment: paymentMethod};
    document.getElementById('modalProduct').textContent = product.name;
    document.getElementById('modalPrice').textContent = `$${parseFloat(product.price).toFixed(2)}`;
    document.getElementById('modalPayment').textContent = paymentMethod === 'paypal' ? 'paypal' : 'cryptocurrency';
    document.getElementById('paymentModal').classList.add('show');
}

function closeModal() {
    document.getElementById('paymentModal').classList.remove('show');
    currentPurchase = null;
}

async function processPurchase() {
    if (!currentPurchase) return;
    try {
        const response = await fetch(`${config.basePath}/payment/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': localStorage.getItem('id'),
                'x-token': localStorage.getItem('token')
            },
            body: JSON.stringify({
                product_id: currentPurchase.id,
                payment_method: currentPurchase.payment
            })
        });

        const result = await response.json();

        if (result.error) {
            alert('error: ' + result.error);
        } else {
            const paymentUrl = currentPurchase.payment === 'paypal' ? result.approvalUrl : result.hostedUrl;
            const popup = window.open(paymentUrl, 'payment', 'width=600,height=800,left=100,top=100');
            const checkClosed = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosed);
                    console.log('payment window closed');
                }
            }, 1000);
        }
    } catch (e) {
        alert('error: ' + e.message);
    }
    closeModal();
}

function openAdminPanel() {
    document.getElementById('adminPanel').classList.add('show');
    document.getElementById('adminOverlay').classList.add('show');
    loadAdminData();
}

function closeAdminPanel() {
    document.getElementById('adminPanel').classList.remove('show');
    document.getElementById('adminOverlay').classList.remove('show');
}

function switchTab(tab, e) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    e.target.classList.add('active');
    document.getElementById(tab + 'Tab').classList.add('active');
}

async function loadAdminData() {
    await loadAdminProducts();
    await loadAdminCategories();
}

async function loadAdminProducts() {
    const products = await fetchProducts();
    const list = document.getElementById('productsList');
    if (products.length === 0) {
        list.innerHTML = '<div class="error">no products yet</div>';
        return;
    }
    list.innerHTML = '';
    products.forEach(product => {
        const actionLabel = product.action
            ? (allActions.find(a => a.key === product.action)?.label || product.action)
            : 'none';

        let paramsText = '';
        if (product.action_params) {
            try {
                const p = JSON.parse(product.action_params);
                paramsText = Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(', ');
            } catch (e) {
                paramsText = product.action_params;
            }
        }

        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
                <div class="admin-item-info">
                    <h3>${product.name}</h3>
                    <p><strong>price:</strong> $${parseFloat(product.price).toFixed(2)}</p>
                    <p><strong>category:</strong> ${product.category_name || 'no category'}</p>
                    <p><strong>stock:</strong> ${product.stock}</p>
                    <p><strong>status:</strong> ${product.active ? 'active' : 'inactive'}</p>
                    <p><strong>action:</strong> ${actionLabel}${paramsText ? ` (${paramsText})` : ''}</p>
                </div>
                <div class="admin-item-actions">
                    <button class="btn-edit" onclick="editProduct(${product.id})">edit</button>
                    <button class="btn-delete" onclick="deleteProduct(${product.id})">delete</button>
                </div>
            `;
        list.appendChild(item);
    });
}

async function loadAdminCategories() {
    const categories = await fetchCategories();
    const list = document.getElementById('categoriesList');
    if (categories.length === 0) {
        list.innerHTML = '<div class="error">no categories yet</div>';
        return;
    }
    list.innerHTML = '';
    categories.forEach(category => {
        const item = document.createElement('div');
        item.className = 'admin-item';
        item.innerHTML = `
                <div class="admin-item-info">
                    <h3>${category.name}</h3>
                    <p>${category.description || 'no description'}</p>
                </div>
                <div class="admin-item-actions">
                    <button class="btn-edit" onclick="editCategory(${category.id})">edit</button>
                    <button class="btn-delete" onclick="deleteCategory(${category.id})">delete</button>
                </div>
            `;
        list.appendChild(item);
    });
}

function buildActionParamFields(actionKey, existingParams = {}) {
    const action = allActions.find(a => a.key === actionKey);
    if (!action || !action.params || action.params.length === 0) {
        return '<div class="action-params-none">no params for this action</div>';
    }
    return action.params.map(param => `
            <div class="action-param-field form-group">
                <label>${param.label}</label>
                <input
                    type="${param.type || 'text'}"
                    id="actionParam_${param.key}"
                    value="${existingParams[param.key] !== undefined ? existingParams[param.key] : ''}"
                    placeholder="${param.label}"
                >
            </div>
        `).join('');
}

function onActionChange(selectEl, existingParams = {}) {
    const key = selectEl.value;
    const wrapper = document.getElementById('actionParamsWrapper');
    wrapper.innerHTML = key ? buildActionParamFields(key, existingParams) : '<div class="action-params-none">select an action first</div>';
}

function openProductForm(product = null) {
    closeAdminPanel();

    let existingParams = {};
    if (product?.action_params) {
        try {
            existingParams = JSON.parse(product.action_params);
        } catch (e) {
        }
    }

    const actionOptions = [
        `<option value="">no action</option>`,
        ...allActions.map(a => `<option value="${a.key}" ${product && product.action === a.key ? 'selected' : ''}>${a.label}</option>`)
    ].join('');

    const selectedAction = product?.action || '';
    const initialParams = selectedAction
        ? buildActionParamFields(selectedAction, existingParams)
        : '<div class="action-params-none">select an action first</div>';

    const body = `
            <div class="form-group">
                <label>name</label>
                <input type="text" id="productName" value="${product ? product.name : ''}" placeholder="enter product name">
            </div>
            <div class="form-group">
                <label>description</label>
                <textarea id="productDescription" placeholder="enter product description">${product ? product.description || '' : ''}</textarea>
            </div>
            <div class="form-group">
                <label>price</label>
                <input type="number" step="0.01" id="productPrice" value="${product ? product.price : ''}" placeholder="0.00">
            </div>
            <div class="form-group">
                <label>category</label>
                <select id="productCategory">
                    <option value="">no category</option>
                    ${allCategories.map(cat => `<option value="${cat.id}" ${product && product.category_id === cat.id ? 'selected' : ''}>${cat.name}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>image url</label>
                <input type="text" id="productImageUrl" value="${product ? product.image_url || '' : ''}" placeholder="https://example.com/image.jpg">
            </div>
            <div class="form-group">
                <label>stock</label>
                <input type="number" id="productStock" value="${product ? product.stock : 0}" placeholder="0">
            </div>
            <div class="form-group">
                <label>active</label>
                <select id="productActive">
                    <option value="1" ${!product || product.active === 1 ? 'selected' : ''}>yes</option>
                    <option value="0" ${product && product.active === 0 ? 'selected' : ''}>no</option>
                </select>
            </div>
            <div class="form-group">
                <label>action</label>
                <select id="productAction" onchange="onActionChange(this)">
                    ${actionOptions}
                </select>
            </div>
            <div class="form-group">
                <label>action params</label>
                <div class="action-params-wrapper" id="actionParamsWrapper">
                    ${initialParams}
                </div>
            </div>
        `;

    currentForm = {type: 'product', data: product};
    document.getElementById('formModalTitle').textContent = product ? 'edit product' : 'add product';
    document.getElementById('formModalBody').innerHTML = body;
    document.getElementById('formModal').classList.add('show');
}

function openCategoryForm(category = null) {
    closeAdminPanel();
    const body = `
            <div class="form-group">
                <label>name</label>
                <input type="text" id="categoryName" value="${category ? category.name : ''}" placeholder="enter category name">
            </div>
            <div class="form-group">
                <label>description</label>
                <textarea id="categoryDescription" placeholder="enter category description">${category ? category.description || '' : ''}</textarea>
            </div>
        `;
    currentForm = {type: 'category', data: category};
    document.getElementById('formModalTitle').textContent = category ? 'edit category' : 'add category';
    document.getElementById('formModalBody').innerHTML = body;
    document.getElementById('formModal').classList.add('show');
}

function closeFormModal() {
    document.getElementById('formModal').classList.remove('show');
    currentForm = null;
    openAdminPanel();
}

async function submitForm() {
    if (!currentForm) return;
    currentForm.type === 'product' ? await saveProduct() : await saveCategory();
}

async function saveProduct() {
    const action = document.getElementById('productAction').value || null;

    // action params aus den dynamischen feldern sammeln
    let action_params = null;
    if (action) {
        const actionDef = allActions.find(a => a.key === action);
        if (actionDef && actionDef.params && actionDef.params.length > 0) {
            const params = {};
            actionDef.params.forEach(param => {
                const el = document.getElementById(`actionParam_${param.key}`);
                if (el) params[param.key] = param.type === 'number' ? parseFloat(el.value) : el.value;
            });
            action_params = params;
        }
    }

    const data = {
        name: document.getElementById('productName').value,
        description: document.getElementById('productDescription').value,
        price: parseFloat(document.getElementById('productPrice').value),
        category_id: document.getElementById('productCategory').value || null,
        image_url: document.getElementById('productImageUrl').value,
        stock: parseInt(document.getElementById('productStock').value),
        active: parseInt(document.getElementById('productActive').value),
        action,
        action_params
    };

    const isEdit = currentForm.data && currentForm.data.id;
    const url = isEdit
        ? `${config.basePath}${config.apiEndpoints.productUpdate}${currentForm.data.id}`
        : `${config.basePath}${config.apiEndpoints.productCreate}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': localStorage.getItem('id'),
                'x-token': localStorage.getItem('token')
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.error) {
            alert('error: ' + result.error);
        } else {
            document.getElementById('formModal').classList.remove('show');
            currentForm = null;
            await init();
            openAdminPanel();
        }
    } catch (e) {
        alert('error: ' + e.message);
    }
}

async function saveCategory() {
    const data = {
        name: document.getElementById('categoryName').value,
        description: document.getElementById('categoryDescription').value
    };
    const isEdit = currentForm.data && currentForm.data.id;
    const url = isEdit
        ? `${config.basePath}${config.apiEndpoints.categoryUpdate}${currentForm.data.id}`
        : `${config.basePath}${config.apiEndpoints.categoryCreate}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': localStorage.getItem('id'),
                'x-token': localStorage.getItem('token')
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (result.error) {
            alert('error: ' + result.error);
        } else {
            document.getElementById('formModal').classList.remove('show');
            currentForm = null;
            await init();
            openAdminPanel();
        }
    } catch (e) {
        alert('error: ' + e.message);
    }
}

async function editProduct(id) {
    const response = await fetch(`${config.basePath}${config.apiEndpoints.product}${id}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-user-id': localStorage.getItem('id'),
            'x-token': localStorage.getItem('token')
        }
    });
    const data = await response.json();
    data.error ? alert('error: ' + data.error) : openProductForm(data.product);
}

async function editCategory(id) {
    const category = allCategories.find(c => c.id === id);
    if (category) openCategoryForm(category);
}

async function deleteProduct(id) {
    if (!confirm('delete this product?')) return;
    try {
        const response = await fetch(`${config.basePath}${config.apiEndpoints.productDelete}${id}`, {
            method: 'DELETE', headers: {
                'Content-Type': 'application/json',
                'x-user-id': localStorage.getItem('id'),
                'x-token': localStorage.getItem('token')
            }
        });
        const result = await response.json();
        if (result.error) {
            alert('error: ' + result.error);
        } else {
            await loadAdminProducts();
            await init();
        }
    } catch (e) {
        alert('error: ' + e.message);
    }
}

async function checkAdminStatus() {
    try {
        const response = await fetch(`${config.basePath}/admin/check`, {
            headers: {
                'x-user-id': localStorage.getItem('id'),
                'x-token': localStorage.getItem('token')
            }
        });
        const data = await response.json();
        const btn = document.getElementById('adminBtn');
        if (btn) btn.style.display = data.isAdmin ? 'block' : 'none';
    } catch (e) {
        const btn = document.getElementById('adminBtn');
        if (btn) btn.style.display = 'none';
    }
}

async function deleteCategory(id) {
    if (!confirm('delete this category?')) return;
    try {
        const response = await fetch(`${config.basePath}${config.apiEndpoints.categoryDelete}${id}`, {
            method: 'DELETE', headers: {
                'Content-Type': 'application/json',
                'x-user-id': localStorage.getItem('id'),
                'x-token': localStorage.getItem('token')
            }
        });
        const result = await response.json();
        if (result.error) {
            alert('error: ' + result.error);
        } else {
            await loadAdminCategories();
            await init();
        }
    } catch (e) {
        alert('error: ' + e.message);
    }
}

async function init() {
    allCategories = await fetchCategories();
    allActions = await fetchActions();
    displayCategories(allCategories);
    allProducts = await fetchProducts();
    displayProducts(allProducts);

    await checkAdminStatus();
}

document.getElementById('paymentModal').addEventListener('click', (e) => {
    if (e.target.id === 'paymentModal') closeModal();
});

document.addEventListener("DOMContentLoaded", () => {
    init();
})