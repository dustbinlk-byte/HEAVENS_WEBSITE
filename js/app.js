
// State Management
const state = {
    cart: [],
    products: [],
    vendors: [],
    currentPriceMode: 'retail', // 'retail' or 'wholesale'
    discount: 0,
    discountType: 'fixed' // 'fixed' or 'percent'
};

// Utils
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(amount);
};

const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB') + ' ' + new Date(date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // Initial Load
    await loadProducts();
    await loadVendors();
    loadDashboard();

    // Set Date
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Event Listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Inventory Search
    document.getElementById('inventory-search').addEventListener('input', (e) => {
        loadInventoryTable(e.target.value);
    });

    // POS Search
    document.getElementById('pos-search').addEventListener('input', (e) => {
        renderPOSProducts(e.target.value, document.getElementById('pos-category-filter').value);
    });

    // POS Category Filter
    document.getElementById('pos-category-filter').addEventListener('change', (e) => {
        renderPOSProducts(document.getElementById('pos-search').value, e.target.value);
    });

    // Product Form Submit
    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProduct();
    });

    // Vendor Form Submit
    document.getElementById('vendor-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveVendor();
        document.getElementById('vendor-modal').classList.add('hidden');
    });
}

// --- Navigation ---
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');

    // Update Sidebar Active State
    document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
    const navLink = document.getElementById(`nav-${sectionId}`);
    if (navLink) navLink.classList.add('active');

    // Refresh Data based on section
    if (sectionId === 'dashboard') loadDashboard();
    if (sectionId === 'inventory') loadInventoryTable();
    if (sectionId === 'pos') loadPOS();
    if (sectionId === 'reports') loadReports();
    if (sectionId === 'vendors') loadVendorList();
}


// --- Dashboard Logic ---
async function loadDashboard() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySales = await db.sales.where('timestamp').aboveOrEqual(todayStart.getTime()).toArray();

    const totalRevenue = todaySales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalProfit = todaySales.reduce((sum, sale) => sum + sale.profit, 0);

    document.getElementById('dash-today-sales').textContent = formatCurrency(totalRevenue);
    document.getElementById('dash-today-profit').textContent = formatCurrency(totalProfit);

    // Low Stock
    const lowStockCount = await db.products.filter(p => p.stockQty <= p.minStockLevel).count();
    document.getElementById('dash-low-stock').textContent = lowStockCount;

    // Inventory Value
    const allProducts = await db.products.toArray();
    const inventoryValue = allProducts.reduce((sum, p) => sum + (p.costPrice * p.stockQty), 0);
    document.getElementById('dash-inventory-value').textContent = formatCurrency(inventoryValue);

    // Recent Sales Table
    const recentSales = todaySales.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    const tbody = document.getElementById('dash-recent-sales-table');
    tbody.innerHTML = '';

    if (recentSales.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">No sales today</td></tr>';
    } else {
        recentSales.forEach(sale => {
            const tr = document.createElement('tr');
            tr.className = "border-b border-gray-50 hover:bg-gray-50 transition-colors";
            tr.innerHTML = `
                <td class="p-3">${new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                <td class="p-3"><span class="px-2 py-1 rounded text-xs font-semibold ${sale.customerType === 'wholesale' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}">${sale.customerType.toUpperCase()}</span></td>
                <td class="p-3 text-right font-medium">${formatCurrency(sale.totalAmount)}</td>
                <td class="p-3 text-right text-green-600">+${formatCurrency(sale.profit)}</td>
                <td class="p-3 text-center">
                    <button onclick="reprintReceipt(${sale.id})" class="text-gray-400 hover:text-primary transition-colors"><i class="fa-solid fa-print"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- Chart & Top Products Logic ---
    // 1. Get Last 7 Days Sales
    const dayLabels = [];
    const salesData = [];
    const productCounts = {};

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(d); dayEnd.setHours(23, 59, 59, 999);

        // Simple synchronous-like await inside loop for simplicity or improved query
        const dailySales = await db.sales.where('timestamp').between(dayStart.getTime(), dayEnd.getTime()).toArray();
        const dailyTotal = dailySales.reduce((sum, s) => sum + s.totalAmount, 0);

        dayLabels.push(d.toLocaleDateString('en-GB', { weekday: 'short' }));
        salesData.push(dailyTotal);

        // Aggregate Products
        dailySales.forEach(sale => {
            sale.items.forEach(item => {
                if (productCounts[item.productId]) {
                    productCounts[item.productId].qty += item.qty;
                    productCounts[item.productId].revenue += (item.qty * item.price);
                } else {
                    productCounts[item.productId] = {
                        name: item.name,
                        qty: item.qty,
                        revenue: (item.qty * item.price)
                    };
                }
            });
        });
    }

    // 2. Render Chart
    // Destroy existing chart functionality if using Chart.js global
    if (window.mySalesChart) window.mySalesChart.destroy();

    const ctx = document.getElementById('salesChart').getContext('2d');
    window.mySalesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dayLabels,
            datasets: [{
                label: 'Revenue (LKR)',
                data: salesData,
                borderColor: '#ec4899',
                backgroundColor: 'rgba(236, 72, 153, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            }
        }
    });

    // 3. Render Top Products
    const sortedProducts = Object.values(productCounts).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topProdList = document.getElementById('top-products-list');
    topProdList.innerHTML = '';

    if (sortedProducts.length === 0) {
        topProdList.innerHTML = '<li class="text-sm text-gray-400 text-center py-4">No sales data yet</li>';
    } else {
        sortedProducts.forEach((p, index) => {
            const li = document.createElement('li');
            li.className = "flex items-center justify-between p-3 bg-gray-50 rounded-lg";
            li.innerHTML = `
                <div class="flex items-center">
                    <span class="w-6 h-6 rounded-full bg-pink-100 text-pink-600 text-xs font-bold flex items-center justify-center mr-3">${index + 1}</span>
                    <div>
                        <p class="text-sm font-semibold text-gray-800 line-clamp-1">${p.name}</p>
                        <p class="text-xs text-gray-500">${p.qty} sold</p>
                    </div>
                </div>
                <div class="text-sm font-bold text-gray-700">${formatCurrency(p.revenue)}</div>
            `;
            topProdList.appendChild(li);
        });
    }
}


// --- Inventory Logic ---
async function loadProducts() {
    state.products = await db.products.toArray();
}

async function loadInventoryTable(search = '') {
    await loadProducts(); // Refresh state
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '';

    const filtered = state.products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()));

    filtered.forEach(product => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 transition-colors group";

        // Stock Status
        let stockClass = "text-green-600 font-bold";
        if (product.stockQty <= 0) stockClass = "text-red-500 font-bold";
        else if (product.stockQty <= product.minStockLevel) stockClass = "text-orange-500 font-bold";

        tr.innerHTML = `
            <td class="p-4 font-medium text-gray-800">${product.name}</td>
            <td class="p-4"><span class="px-2 py-1 bg-gray-100 rounded-lg text-xs font-semibold text-gray-600">${product.category}</span></td>
            <td class="p-4 text-xs text-gray-500">${product.type}</td>
            <td class="p-4 text-right text-gray-500">${formatCurrency(product.costPrice)}</td>
            <td class="p-4 text-right">${formatCurrency(product.retailPrice)}</td>
            <td class="p-4 text-right">${formatCurrency(product.wholesalePrice)}</td>
            <td class="p-4 text-center ${stockClass}">${product.stockQty}</td>
            <td class="p-4 text-center relative">
                 <button onclick="editProduct(${product.id})" class="text-blue-500 hover:text-blue-700 mx-1 tooltip"><i class="fa-solid fa-pen-to-square"></i></button>
                 <button onclick="deleteProduct(${product.id})" class="text-red-400 hover:text-red-600 mx-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openProductModal(product = null) {
    const modal = document.getElementById('product-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('product-form');

    form.reset();
    document.getElementById('prod-id').value = '';

    if (product) {
        title.textContent = "Edit Product";
        document.getElementById('prod-id').value = product.id;
        document.getElementById('prod-name').value = product.name;
        document.getElementById('prod-category').value = product.category;
        document.getElementById('prod-type').value = product.type;
        document.getElementById('prod-cost').value = product.costPrice;
        document.getElementById('prod-retail').value = product.retailPrice;
        document.getElementById('prod-wholesale').value = product.wholesalePrice;
        document.getElementById('prod-stock').value = product.stockQty;
        document.getElementById('prod-min').value = product.minStockLevel;
    } else {
        title.textContent = "Add New Product";
    }

    modal.classList.remove('hidden');
}

function closeProductModal() {
    document.getElementById('product-modal').classList.add('hidden');
}

async function saveProduct() {
    const id = document.getElementById('prod-id').value;
    const product = {
        name: document.getElementById('prod-name').value,
        category: document.getElementById('prod-category').value,
        type: document.getElementById('prod-type').value,
        costPrice: parseFloat(document.getElementById('prod-cost').value),
        retailPrice: parseFloat(document.getElementById('prod-retail').value),
        wholesalePrice: parseFloat(document.getElementById('prod-wholesale').value),
        stockQty: parseInt(document.getElementById('prod-stock').value),
        minStockLevel: parseInt(document.getElementById('prod-min').value)
    };

    if (id) {
        await db.products.update(parseInt(id), product);
    } else {
        await db.products.add(product);
    }

    closeProductModal();
    loadInventoryTable();
    // Use Swal for nice alerts? For now, standard alert or just UI update
    // alert('Product Saved!'); 
}

async function editProduct(id) {
    const product = await db.products.get(id);
    openProductModal(product);
}

async function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        await db.products.delete(id);
        loadInventoryTable();
    }
}


// --- POS Logic ---
async function loadPOS() {
    await loadProducts();
    // Populate Categories
    const categories = [...new Set(state.products.map(p => p.category))];
    const catSelect = document.getElementById('pos-category-filter');
    catSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');

    renderPOSProducts();
}

function renderPOSProducts(search = '', category = '') {
    const grid = document.getElementById('pos-product-grid');
    grid.innerHTML = '';

    const filtered = state.products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = category === '' || p.category === category;
        return matchesSearch && matchesCategory;
    });

    filtered.forEach(p => {
        const price = state.currentPriceMode === 'retail' ? p.retailPrice : p.wholesalePrice;
        const lowStock = p.stockQty <= p.minStockLevel;
        const outOfStock = p.stockQty <= 0;

        const card = document.createElement('div');
        card.className = `bg-white p-4 rounded-xl shadow-sm border ${lowStock ? 'border-red-200' : 'border-gray-100'} hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-32 relative overflow-hidden group`;

        if (outOfStock) {
            card.classList.add('opacity-60', 'pointer-events-none', 'grayscale');
        }

        card.innerHTML = `
            <div>
                <h4 class="font-bold text-gray-800 text-sm mb-1 leading-tight line-clamp-2">${p.name}</h4>
                <div class="text-xs text-gray-500 mb-1">${p.category}</div>
            </div>
            <div class="flex justify-between items-center mt-auto">
                 <span class="font-bold text-primary">${formatCurrency(price)}</span>
                 <span class="px-2 py-0.5 rounded text-xs font-semibold ${outOfStock ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}">
                    ${outOfStock ? 'No Stock' : p.stockQty}
                 </span>
            </div>
            <!-- Hover Add Effect -->
            <div class="absolute inset-0 bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <i class="fa-solid fa-plus text-primary text-2xl"></i>
            </div>
        `;
        card.onclick = () => addToCart(p);
        grid.appendChild(card);
    });
}

function togglePriceMode(mode) {
    state.currentPriceMode = mode;
    // Update Cart Prices
    state.cart = state.cart.map(item => {
        const product = state.products.find(p => p.id === item.productId);
        return {
            ...item,
            price: mode === 'retail' ? product.retailPrice : product.wholesalePrice
        };
    });
    renderPOSProducts(document.getElementById('pos-search').value, document.getElementById('pos-category-filter').value);
    renderCart();
}

function addToCart(product) {
    // Check if in cart
    const existing = state.cart.find(item => item.productId === product.id);

    if (existing) {
        if (existing.qty + 1 > product.stockQty) {
            alert('Insufficient stock!');
            return;
        }
        existing.qty++;
    } else {
        if (product.stockQty < 1) {
            alert('Out of stock!');
            return;
        }
        state.cart.push({
            productId: product.id,
            name: product.name,
            price: state.currentPriceMode === 'retail' ? product.retailPrice : product.wholesalePrice,
            cost: product.costPrice,
            qty: 1,
            maxQty: product.stockQty
        });
    }
    renderCart();
}

function removeFromCart(index) {
    state.cart.splice(index, 1);
    renderCart();
}

function updateCartQty(index, newQty) {
    const item = state.cart[index];
    const qty = parseInt(newQty);
    if (qty > 0 && qty <= item.maxQty) {
        item.qty = qty;
    } else if (qty > item.maxQty) {
        alert(`Only ${item.maxQty} in stock.`);
        item.qty = item.maxQty;
    }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('pos-cart-items');
    container.innerHTML = '';

    if (state.cart.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 mt-10">
                <i class="fa-solid fa-basket-shopping text-4xl mb-3 opacity-50"></i>
                <p>Cart is empty</p>
            </div>`;
    } else {
        state.cart.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = "flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 group";
            div.innerHTML = `
                <div class="flex-1">
                    <div class="font-semibold text-sm text-gray-800 line-clamp-1">${item.name}</div>
                    <div class="text-xs text-gray-500">${formatCurrency(item.price)} x ${item.qty}</div>
                </div>
                <div class="flex items-center gap-2">
                    <input type="number" value="${item.qty}" min="1" max="${item.maxQty}" 
                        onchange="updateCartQty(${index}, this.value)"
                        class="w-12 text-center text-sm border rounded py-1 focus:outline-primary">
                    <div class="font-bold text-gray-800 text-sm w-20 text-right">${formatCurrency(item.price * item.qty)}</div>
                    <button onclick="removeFromCart(${index})" class="text-gray-400 hover:text-red-500 transition-colors ml-1"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
            container.appendChild(div);
        });
    }
    updateCartTotals();
}

function updateCartTotals() {
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    const discountInput = parseFloat(document.getElementById('cart-discount').value) || 0;
    const discountType = document.getElementById('cart-discount-type').value; // 'fixed' or 'percent'

    let discountAmount = 0;
    if (discountType === 'percent') {
        discountAmount = (subtotal * discountInput) / 100;
    } else {
        discountAmount = discountInput;
    }

    const total = Math.max(0, subtotal - discountAmount);

    document.getElementById('cart-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('cart-total').textContent = formatCurrency(total);

    // Warn if selling below cost
    const totalCost = state.cart.reduce((sum, item) => sum + (item.cost * item.qty), 0);
    if (total < totalCost && state.cart.length > 0) {
        document.getElementById('cart-total').classList.add('text-red-600');
        document.getElementById('cart-total').classList.remove('text-primary');
        // Optional: show warning toast
    } else {
        document.getElementById('cart-total').classList.remove('text-red-600');
        document.getElementById('cart-total').classList.add('text-primary');
    }

    state.discount = discountAmount;
}

async function processCheckout() {
    if (state.cart.length === 0) {
        alert('Cart is empty!');
        return;
    }

    const totalCost = state.cart.reduce((sum, item) => sum + (item.cost * item.qty), 0);
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const totalAmount = Math.max(0, subtotal - state.discount);
    const profit = totalAmount - totalCost;

    const sale = {
        timestamp: Date.now(),
        customerType: state.currentPriceMode,
        totalAmount: totalAmount,
        discount: state.discount,
        profit: profit,
        items: state.cart
    };

    // 1. Save Sale
    const saleId = await db.sales.add(sale);

    // 2. Update Stock
    for (const item of state.cart) {
        const product = await db.products.get(item.productId);
        if (product) {
            await db.products.update(item.productId, { stockQty: product.stockQty - item.qty });
        }
    }

    // 3. Print Receipt
    printReceipt(sale, saleId);

    // 4. Reset
    state.cart = [];
    document.getElementById('cart-discount').value = '';
    renderCart(); // This calls updateCartTotals which resets display
    loadPOS(); // Reload products to reflect new stock
    alert('Sale successful!');
}

function printReceipt(sale, saleId) {
    const printArea = document.getElementById('receipt-print-area');
    printArea.innerHTML = `
        <div style="font-family: 'Courier New', monospace; width: 300px; padding: 10px; font-size: 12px;">
            <div style="text-align: center; margin-bottom: 10px;">
                <h2 style="margin: 0; font-size: 16px;">HEAVEN'S</h2>
                <p style="margin: 2px;">No. 123, High Level Road, Colombo</p>
                <p style="margin: 2px;">Tel: 011-2345678</p>
                <hr style="border: 1px dashed black; margin: 10px 0;">
                <p style="margin: 5px 0;">Receipt #: ${saleId}</p>
                <p style="margin: 5px 0;">Date: ${formatDate(sale.timestamp)}</p>
                <p style="margin: 5px 0;">Customer: ${sale.customerType.toUpperCase()}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                <thead>
                    <tr style="border-bottom: 1px solid black;">
                        <th style="text-align: left;">Item</th>
                        <th style="text-align: center;">Qty</th>
                        <th style="text-align: right;">Price</th>
                        <th style="text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${sale.items.map(item => `
                        <tr>
                            <td style="padding-top: 5px;">${item.name}</td>
                            <td style="text-align: center;">${item.qty}</td>
                            <td style="text-align: right;">${item.price}</td>
                            <td style="text-align: right;">${item.price * item.qty}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <hr style="border: 1px dashed black; margin: 10px 0;">
            
            <table style="width: 100%;">
                <tr>
                    <td>Subtotal:</td>
                    <td style="text-align: right;">${formatCurrency(sale.totalAmount + sale.discount)}</td>
                </tr>
                <tr>
                    <td>Discount:</td>
                    <td style="text-align: right;">-${formatCurrency(sale.discount)}</td>
                </tr>
                <tr style="font-weight: bold; font-size: 14px;">
                    <td>TOTAL:</td>
                    <td style="text-align: right;">${formatCurrency(sale.totalAmount)}</td>
                </tr>
            </table>

            <div style="text-align: center; margin-top: 20px;">
                <p>Thank you for shopping with us!</p>
                <p style="font-size: 10px;">Software by AntiGravity</p>
            </div>
        </div>
    `;

    // In a real app, we might use a proper print window.
    // For this Single File implementation, let's open a new window or simple print.
    // Quick Hack: Display content in a new window and print.

    // Doing a print simulation:
    const printContent = printArea.innerHTML;
    const win = window.open('', '', 'height=600,width=400');
    win.document.write('<html><head><title>Print Receipt</title></head><body>');
    win.document.write(printContent);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
}

// --- Reports Logic ---
async function loadReports() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('report-date').value = today;
    loadDailyReport();
}

async function loadDailyReport() {
    const dateStr = document.getElementById('report-date').value;
    if (!dateStr) return;

    const start = new Date(dateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateStr);
    end.setHours(23, 59, 59, 999);

    const sales = await db.sales.where('timestamp').between(start.getTime(), end.getTime()).toArray();

    const revenue = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const profit = sales.reduce((sum, s) => sum + s.profit, 0);
    const itemsSold = sales.reduce((sum, s) => sum + s.items.reduce((Acc, i) => Acc + i.qty, 0), 0);

    document.getElementById('report-revenue').textContent = formatCurrency(revenue);
    document.getElementById('report-profit').textContent = formatCurrency(profit);
    document.getElementById('report-items').textContent = itemsSold;

    const tbody = document.getElementById('report-table-body');
    tbody.innerHTML = '';

    sales.forEach(sale => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-50 hover:bg-gray-50";
        tr.innerHTML = `
            <td class="p-3">${new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td class="p-3"><span class="px-2 py-1 rounded text-xs font-semibold ${sale.customerType === 'wholesale' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}">${sale.customerType}</span></td>
            <td class="p-3 text-sm">${sale.items.length} items</td>
            <td class="p-3 text-right font-medium">${formatCurrency(sale.totalAmount)}</td>
            <td class="p-3 text-right text-green-600">+${formatCurrency(sale.profit)}</td>
         `;
        tbody.appendChild(tr);
    });
}

// --- Vendor Logic ---
async function loadVendors() {
    state.vendors = await db.vendors.toArray();
}

async function loadVendorList() {
    await loadVendors();
    const container = document.getElementById('vendor-list');
    container.innerHTML = '';
    state.vendors.forEach(v => {
        const div = document.createElement('div');
        div.className = "p-4 border rounded-lg bg-gray-50 flex flex-col gap-2";
        div.innerHTML = `
            <h4 class="font-bold text-gray-800">${v.name}</h4>
            <p class="text-sm text-gray-600"><i class="fa-solid fa-phone mr-2"></i> ${v.contact}</p>
            <p class="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded w-max">${v.productCategories}</p>
        `;
        container.appendChild(div);
    });
}

function openVendorModal() {
    document.getElementById('vendor-modal').classList.remove('hidden');
}
function closeVendorModal() {
    document.getElementById('vendor-modal').classList.add('hidden');
}
async function saveVendor() {
    const vendor = {
        name: document.getElementById('vend-name').value,
        contact: document.getElementById('vend-contact').value,
        productCategories: document.getElementById('vend-cats').value
    };
    await db.vendors.add(vendor);
    await loadVendors();
    loadVendorList();
}


// --- Data Backup ---
async function backupData() {
    const allData = {
        products: await db.products.toArray(),
        sales: await db.sales.toArray(),
        vendors: await db.vendors.toArray()
    };

    const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `cosmetic_pos_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function reprintReceipt(saleId) {
    const sale = await db.sales.get(saleId);
    if (sale) printReceipt(sale, saleId);
}
