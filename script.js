import { initializeApp as initApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCcoQ_AEYbO-5n9W0Ce9lQZzB_OZkbZFuM",
    authDomain: "keuangan-d5bb9.firebaseapp.com",
    databaseURL: "https://keuangan-d5bb9-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "keuangan-d5bb9",
    storageBucket: "keuangan-d5bb9.firebasestorage.app",
    messagingSenderId: "10814628176",
    appId: "1:10814628176:web:99e679091a322419e00c55",
    measurementId: "G-JZYJCPF2LY"
};

const app = initApp(firebaseConfig);
const database = getDatabase(app);
window.firebase = { database, ref, push, set, onValue, update };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(e => console.log('SW registration failed: ', e));
  });
}

// Global Variables
let incomeExpenseChart = null;
let categoryChart = null;
let transactions = [];
let categories = {
    income: ['Gaji', 'Bonus', 'Freelance', 'Investasi', 'Bisnis', 'Lainnya'],
    expense: ['Makanan', 'Transport', 'Belanja', 'Hiburan', 'Tagihan', 'Kesehatan', 'Pendidikan', 'Investasi', 'Tabungan', 'Lainnya']
};
let budgets = {}; 
let targetsList = {}; 
let hutangList = {};
let currentHutangFilter = 'all';
let globalFilter = { from: null, to: null };
let currentQuickFilter = 'all';
let currentFilteredTransactions = [];

function initializeApp() {
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.classList.add('hidden-splash');
            setTimeout(() => splash.remove(), 500);
        }
    }, 1500);

    initDarkMode();

    loadData(); 
    loadCategoriesFromFirebase(); 
    loadBudgetsFromFirebase();
    loadTargetsFromFirebase();
    loadHutangFromFirebase();
    setupEventListeners();
    setDefaultDates();
    
    if(window.lucide) window.lucide.createIcons();

    window.showPage = showPage;
    window.deleteTransaction = deleteTransaction;
    window.deleteCategory = deleteCategory;
    window.applyGlobalFilter = applyGlobalFilter;
    window.resetGlobalFilter = resetGlobalFilter;
    window.applyDashboardFilter = applyDashboardFilter;
    window.resetDashboardFilter = resetDashboardFilter;
    window.exportExcel = exportExcel;
    window.exportPDF = exportPDF;
    window.openEditModal = openEditModal;
    window.closeEditModal = closeEditModal;
    window.quickFilterDate = quickFilterDate;
    window.toggleDarkMode = toggleDarkMode;
    window.deleteTarget = deleteTarget;
    window.openUpdateTargetModal = openUpdateTargetModal;
    window.closeUpdateTargetModal = closeUpdateTargetModal;
    window.deleteHutang = deleteHutang;
    window.toggleHutangStatus = toggleHutangStatus;
    window.filterHutang = filterHutang;
}

function initDarkMode() {
    const savedTheme = localStorage.getItem('theme');
    const icon = document.getElementById('theme-icon');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        if(icon) icon.setAttribute('data-lucide', 'sun');
    } else {
        document.documentElement.classList.remove('dark');
        if(icon) icon.setAttribute('data-lucide', 'moon');
    }
}

function toggleDarkMode() {
    const icon = document.getElementById('theme-icon');
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        if(icon) icon.setAttribute('data-lucide', 'moon');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        if(icon) icon.setAttribute('data-lucide', 'sun');
    }
    if(window.lucide) window.lucide.createIcons();
}

function setupEventListeners() {
    document.getElementById('income-form')?.addEventListener('submit', handleIncomeSubmit);
    document.getElementById('expense-form')?.addEventListener('submit', handleExpenseSubmit);
    document.getElementById('category-form')?.addEventListener('submit', handleCategorySubmit);
    document.getElementById('budget-form')?.addEventListener('submit', handleBudgetSubmit);
    document.getElementById('edit-form')?.addEventListener('submit', handleEditSubmit);
    
    document.getElementById('target-form')?.addEventListener('submit', handleTargetSubmit);
    document.getElementById('update-target-form')?.addEventListener('submit', handleUpdateTargetSubmit);
    document.getElementById('hutang-form')?.addEventListener('submit', handleHutangSubmit);

    document.getElementById('filter-type')?.addEventListener('change', applyFilters);
    document.getElementById('filter-expense-type')?.addEventListener('change', applyFilters);
    document.getElementById('filter-category')?.addEventListener('change', applyFilters);
    document.getElementById('search-transaction')?.addEventListener('input', applyFilters);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function setDefaultDates() {
    const today = new Date();
    const localDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    if(document.getElementById('income-date')) document.getElementById('income-date').value = localDate;
    if(document.getElementById('expense-date')) document.getElementById('expense-date').value = localDate;
    
    // Set min deadline for target to current month
    const monthStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    if(document.getElementById('target-deadline')) document.getElementById('target-deadline').setAttribute('min', monthStr);
}

function applyDashboardFilter() {
    globalFilter.from = document.getElementById('dashboard-date-from')?.value || null;
    globalFilter.to = document.getElementById('dashboard-date-to')?.value || null;
    updateDashboard();
    if(document.getElementById('riwayat-page')?.classList.contains('active')) applyFilters();
}

function resetDashboardFilter() {
    if(document.getElementById('dashboard-date-from')) document.getElementById('dashboard-date-from').value = '';
    if(document.getElementById('dashboard-date-to')) document.getElementById('dashboard-date-to').value = '';
    globalFilter.from = null;
    globalFilter.to = null;
    updateDashboard();
    if(document.getElementById('riwayat-page')?.classList.contains('active')) applyFilters();
}

/* --- Firebase Data Loading --- */
function loadData() {
    const transactionsRef = window.firebase.ref(window.firebase.database, 'transactions');
    window.firebase.onValue(transactionsRef, (snapshot) => {
        const data = snapshot.val();
        transactions = data ? Object.values(data) : [];
        updateDashboard();
    });
}

function loadCategoriesFromFirebase() {
    window.firebase.onValue(window.firebase.ref(window.firebase.database, 'categories'), (snapshot) => {
        const data = snapshot.val();
        if (data) categories = data;
        
        if(!categories.expense) categories.expense = [];
        if(!categories.expense.includes('Investasi')) categories.expense.push('Investasi');
        if(!categories.expense.includes('Tabungan')) categories.expense.push('Tabungan');
        
        updateCategories();
        updateCategorySelects();
    });
}

function loadBudgetsFromFirebase() {
    window.firebase.onValue(window.firebase.ref(window.firebase.database, 'budgets'), (snapshot) => {
        const data = snapshot.val();
        if (data) budgets = data;
        if (document.getElementById('budget-page').classList.contains('active')) updateBudgetList();
    });
}

function loadTargetsFromFirebase() {
    window.firebase.onValue(window.firebase.ref(window.firebase.database, 'targets'), (snapshot) => {
        const data = snapshot.val();
        targetsList = data ? data : {};
        if (document.getElementById('target-page').classList.contains('active')) renderTargets();
    });
}

function saveDataToFirebase(transaction) {
    const transactionsRef = window.firebase.ref(window.firebase.database, 'transactions');
    const newRef = window.firebase.push(transactionsRef);
    transaction.firebaseKey = newRef.key;
    window.firebase.set(newRef, transaction);
}

function saveCategoriesToFirebase() {
    window.firebase.set(window.firebase.ref(window.firebase.database, 'categories'), categories);
}

function saveBudgetsToFirebase() {
    window.firebase.set(window.firebase.ref(window.firebase.database, 'budgets'), budgets);
}

function saveTargetsToFirebase() {
    window.firebase.set(window.firebase.ref(window.firebase.database, 'targets'), targetsList);
}

/* --- Form Handlers --- */
function handleIncomeSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('income-amount').value);
    const description = document.getElementById('income-description').value;
    const category = document.getElementById('income-category').value;
    const date = document.getElementById('income-date').value;

    if (!amount || amount <= 0 || !description || !category || !date) return showToast('error', 'Lengkapi data dengan benar!');

    const transaction = { id: Date.now(), type: 'income', amount, description, category, date, timestamp: new Date().toISOString() };
    saveDataToFirebase(transaction);
    e.target.reset(); setDefaultDates();
    showToast('success', 'Pemasukan ditambahkan!');
}

function handleExpenseSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const description = document.getElementById('expense-description').value;
    const category = document.getElementById('expense-category').value;
    const expenseType = document.getElementById('expense-type').value;
    const date = document.getElementById('expense-date').value;

    if (!amount || amount <= 0 || !description || !category || !expenseType || !date) return showToast('error', 'Lengkapi data dengan benar!');

    const transaction = { id: Date.now(), type: 'expense', expenseType, amount, description, category, date, timestamp: new Date().toISOString() };
    saveDataToFirebase(transaction);
    e.target.reset(); setDefaultDates();
    showToast('success', 'Pengeluaran ditambahkan!');
    checkBudgetWarning(category, amount, date);
}

function handleCategorySubmit(e) {
    e.preventDefault();
    const name = document.getElementById('category-name').value.trim();
    const type = document.getElementById('category-type').value;
    if (!name || !type) return showToast('error', 'Lengkapi semua field!');
    if (categories[type].includes(name)) return showToast('error', 'Kategori sudah ada!');
    categories[type].push(name);
    saveCategoriesToFirebase(); updateCategories(); updateCategorySelects();
    e.target.reset(); showToast('success', 'Kategori ditambahkan!');
}

function handleBudgetSubmit(e) {
    e.preventDefault();
    const category = document.getElementById('budget-category').value;
    const amount = parseFloat(document.getElementById('budget-amount').value);
    
    if(!category || !amount || amount <= 0) return showToast('error', 'Data tidak valid!');
    
    budgets[category] = amount;
    saveBudgetsToFirebase();
    e.target.reset();
    showToast('success', 'Budget disimpan!');
    updateBudgetList();
}

function handleTargetSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('target-name').value;
    const amount = parseFloat(document.getElementById('target-amount').value);
    const current = parseFloat(document.getElementById('target-current').value) || 0;
    const deadline = document.getElementById('target-deadline').value;
    
    if(!name || !amount || amount <= 0 || !deadline) return showToast('error', 'Data tidak valid!');
    if(current > amount) return showToast('error', 'Terkumpul melebihi target!');

    const newTargetId = 'target_' + Date.now();
    targetsList[newTargetId] = {
        id: newTargetId,
        name: name,
        targetAmount: amount,
        currentAmount: current,
        deadline: deadline, // YYYY-MM
        createdAt: new Date().toISOString()
    };
    
    saveTargetsToFirebase();
    e.target.reset();
    showToast('success', 'Target berhasil dibuat!');
    renderTargets();
}

/* --- Edit Logic --- */
function openEditModal(id) {
    const t = transactions.find(tx => tx.id === id);
    if(!t) return;
    
    document.getElementById('edit-id').value = t.id;
    document.getElementById('edit-type').value = t.type;
    document.getElementById('edit-amount').value = t.amount;
    document.getElementById('edit-description').value = t.description;
    document.getElementById('edit-date').value = t.date;
    
    const catSelect = document.getElementById('edit-category');
    catSelect.innerHTML = categories[t.type].map(c => `<option value="${escapeHTML(c)}" ${c===t.category?'selected':''}>${escapeHTML(c)}</option>`).join('');
    
    const typeContainer = document.getElementById('edit-expense-type-container');
    if(t.type === 'expense') {
        typeContainer.style.display = 'block';
        document.getElementById('edit-expense-type').value = t.expenseType || 'pribadi';
    } else {
        typeContainer.style.display = 'none';
    }
    
    const modal = document.getElementById('edit-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        document.getElementById('edit-modal-content').classList.remove('translate-y-full');
    }, 10);
}

function closeEditModal() {
    document.getElementById('edit-modal-content').classList.add('translate-y-full');
    setTimeout(() => {
        const modal = document.getElementById('edit-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function handleEditSubmit(e) {
    e.preventDefault();
    const id = parseInt(document.getElementById('edit-id').value);
    const type = document.getElementById('edit-type').value;
    const amount = parseFloat(document.getElementById('edit-amount').value);
    const description = document.getElementById('edit-description').value;
    const category = document.getElementById('edit-category').value;
    const date = document.getElementById('edit-date').value;
    const expenseType = type === 'expense' ? document.getElementById('edit-expense-type').value : null;

    if (!amount || amount <= 0 || !description || !category || !date) return showToast('error', 'Lengkapi data dengan benar!');

    const t = transactions.find(tx => tx.id === id);
    if(!t || !t.firebaseKey) return showToast('error', 'Transaksi tidak dapat diedit');

    const updatedData = { amount, description, category, date };
    if(expenseType) updatedData.expenseType = expenseType;

    const tRef = window.firebase.ref(window.firebase.database, `transactions/${t.firebaseKey}`);
    window.firebase.update(tRef, updatedData).then(() => {
        showToast('success', 'Transaksi diperbarui!');
        closeEditModal();
    }).catch(err => {
        showToast('error', 'Gagal update: ' + err.message);
    });
}

function deleteTransaction(id) {
    if(!confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) return;
    const t = transactions.find(tx => tx.id === id);
    if(!t || !t.firebaseKey) return;

    window.firebase.set(window.firebase.ref(window.firebase.database, `transactions/${t.firebaseKey}`), null);
    showToast('success', 'Dihapus!');
}

function deleteCategory(t, n) {
    if(confirm('Hapus kategori ini?')){
        categories[t] = categories[t].filter(c => c !== n);
        saveCategoriesToFirebase();
        showToast('success', 'Dihapus!');
    }
}

/* --- UI Updates & Logic --- */

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(page => page.classList.remove('active'));
    document.getElementById(pageId + '-page').classList.add('active');

    document.querySelectorAll('.bottom-nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.bottom-nav-item[onclick="showPage('${pageId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    if (pageId === 'dashboard') {
        setTimeout(updateCharts, 100);
    } else if (pageId === 'riwayat') {
        applyFilters();
        populateFilterCategories();
    } else if (pageId === 'budget') {
        updateBudgetList();
    } else if (pageId === 'target') {
        renderTargets();
    } else if (pageId === 'hutang') {
        renderHutang();
    }
    
    if(window.lucide) window.lucide.createIcons();
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = formatCurrency(Math.floor(progress * (end - start) + start));
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = formatCurrency(end);
        }
    };
    window.requestAnimationFrame(step);
}

function updateDashboard() {
    const filtered = getFilteredTransactions();

    const totalInc = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExp = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const totalBal = totalInc - totalExp;

    const balEl = document.getElementById('total-balance');
    if(balEl) animateValue(balEl, 0, totalBal, 800);
    
    document.getElementById('total-income').textContent = formatCurrency(totalInc);
    document.getElementById('total-expense').textContent = formatCurrency(totalExp);

    let pribadi = 0, umum = 0;
    filtered.forEach(t => {
        if (t.type === 'expense') {
            if (t.expenseType === 'pribadi') pribadi += t.amount;
            if (t.expenseType === 'umum') umum += t.amount;
        }
    });
    
    if(document.getElementById('expense-pribadi')) document.getElementById('expense-pribadi').textContent = formatCurrency(pribadi);
    if(document.getElementById('expense-umum')) document.getElementById('expense-umum').textContent = formatCurrency(umum);

    const condEl = document.getElementById('financial-condition');
    if(condEl) {
        if(totalInc === 0 && totalExp === 0) {
            condEl.innerHTML = '<span class="text-gray-400">Belum Ada Data</span>';
        } else {
            const ratio = totalInc > 0 ? (totalExp / totalInc) : 2;
            if(ratio <= 0.6) condEl.innerHTML = '<span class="text-emerald-500"><i data-lucide="shield-check" class="inline w-5 h-5 mr-1"></i>Aman</span>';
            else if(ratio <= 0.8) condEl.innerHTML = '<span class="text-amber-500"><i data-lucide="alert-triangle" class="inline w-5 h-5 mr-1"></i>Waspada</span>';
            else condEl.innerHTML = '<span class="text-rose-500"><i data-lucide="siren" class="inline w-5 h-5 mr-1"></i>Boros</span>';
            if(window.lucide) window.lucide.createIcons();
        }
    }

    generateSmartInsights(filtered);

    if (document.getElementById('riwayat-page').classList.contains('active')) displayTransactions();
    updateCharts(filtered);
}

function generateSmartInsights(filtered) {
    const container = document.getElementById('smart-insights-container');
    if(!container) return;
    
    const expT = filtered.filter(t => t.type === 'expense');
    const incT = filtered.filter(t => t.type === 'income');
    
    if(expT.length === 0 && incT.length === 0) {
        container.innerHTML = '<div class="text-sm text-gray-500 py-4">Catat transaksi untuk melihat insight pintar.</div>';
        return;
    }

    let insightsHTML = '';

    const ct = {};
    expT.forEach(t => { ct[t.category] = (ct[t.category] || 0) + t.amount; });
    const maxCat = Object.keys(ct).reduce((a, b) => ct[a] > ct[b] ? a : b, null);
    if(maxCat) {
        insightsHTML += `
        <div class="bg-gradient-to-br from-rose-50 to-red-100 dark:from-rose-900/20 dark:to-red-900/20 p-4 rounded-2xl min-w-[240px] border border-rose-100 dark:border-rose-900/50 snap-center">
            <div class="flex items-center space-x-2 text-rose-500 mb-2 font-bold text-xs"><i data-lucide="flame"></i><span>Paling Boros</span></div>
            <div class="text-lg font-bold text-gray-800 dark:text-gray-200">${escapeHTML(maxCat)}</div>
            <div class="text-sm text-gray-500">${formatCurrencyShort(ct[maxCat])}</div>
        </div>`;
    }

    const savingsCat = incT.reduce((sum,t)=>sum+t.amount,0) > 0 ? (expT.filter(t=>['Investasi','Tabungan'].includes(t.category)).reduce((s,t)=>s+t.amount,0) / incT.reduce((s,t)=>s+t.amount,0)) * 100 : 0;
    insightsHTML += `
    <div class="bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-emerald-900/20 dark:to-teal-900/20 p-4 rounded-2xl min-w-[240px] border border-emerald-100 dark:border-emerald-900/50 snap-center">
        <div class="flex items-center space-x-2 text-emerald-600 mb-2 font-bold text-xs"><i data-lucide="piggy-bank"></i><span>Rasio Tabungan</span></div>
        <div class="text-lg font-bold text-gray-800 dark:text-gray-200">${savingsCat.toFixed(1)}%</div>
        <div class="text-sm text-gray-500">${savingsCat >= 20 ? 'Sangat Bagus!' : 'Usahakan minimal 20%'}</div>
    </div>`;

    const maxExp = expT.reduce((max, t) => t.amount > max.amount ? t : max, {amount: 0});
    if(maxExp.amount > 0) {
        insightsHTML += `
        <div class="bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-900/20 dark:to-orange-900/20 p-4 rounded-2xl min-w-[240px] border border-amber-100 dark:border-amber-900/50 snap-center">
            <div class="flex items-center space-x-2 text-amber-600 mb-2 font-bold text-xs"><i data-lucide="receipt"></i><span>Transaksi Terbesar</span></div>
            <div class="text-lg font-bold text-gray-800 dark:text-gray-200 truncate">${escapeHTML(maxExp.description)}</div>
            <div class="text-sm text-gray-500">${formatCurrencyShort(maxExp.amount)}</div>
        </div>`;
    }

    container.innerHTML = insightsHTML;
    if(window.lucide) window.lucide.createIcons();
}

/* --- Budgets --- */
function checkBudgetWarning(category, amount, date) {
    if(!budgets[category]) return;
    const dateObj = new Date(date);
    const month = dateObj.getMonth();
    const year = dateObj.getFullYear();
    
    const totalSpent = transactions.filter(t => 
        t.type === 'expense' && t.category === category && 
        new Date(t.date).getMonth() === month && new Date(t.date).getFullYear() === year
    ).reduce((sum, t) => sum + t.amount, 0);

    const limit = budgets[category];
    if(totalSpent > limit) {
        showToast('error', `Budget ${category} sudah melebih batas!`);
    }
}

function updateBudgetList() {
    const container = document.getElementById('budget-list');
    if(!container) return;

    if(Object.keys(budgets).length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">Belum ada budget diatur</div>';
        return;
    }

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    let html = '';
    for(const cat in budgets) {
        const limit = budgets[cat];
        const spent = transactions.filter(t => 
            t.type === 'expense' && t.category === cat && 
            new Date(t.date).getMonth() === currentMonth && new Date(t.date).getFullYear() === currentYear
        ).reduce((s,t) => s + t.amount, 0);

        let pct = (spent / limit) * 100;
        let colorClass = 'bg-emerald-500';
        if(pct > 80) colorClass = 'bg-amber-500';
        if(pct > 100) colorClass = 'bg-rose-500';
        pct = Math.min(pct, 100);

        html += `
        <div class="glass-morphism modern-card p-4 border border-gray-100 dark:border-gray-800">
            <div class="flex justify-between items-end mb-2">
                <div>
                    <div class="font-bold text-gray-800 dark:text-gray-200">${escapeHTML(cat)}</div>
                    <div class="text-xs text-gray-500 mt-1">${formatCurrencyShort(spent)} / ${formatCurrencyShort(limit)}</div>
                </div>
                <button onclick="deleteBudget('${escapeHTML(cat)}')" class="text-gray-400 hover:text-rose-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-3">
                <div class="${colorClass} h-2 rounded-full transition-all duration-1000" style="width: ${pct}%"></div>
            </div>
        </div>`;
    }
    container.innerHTML = html;
    if(window.lucide) window.lucide.createIcons();
}

/* --- Targets --- */
function renderTargets() {
    const container = document.getElementById('target-list');
    if(!container) return;

    const tKeys = Object.keys(targetsList);
    if(tKeys.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">Belum ada target dibuat</div>';
        return;
    }

    const today = new Date();
    
    let html = '';
    tKeys.forEach(key => {
        const t = targetsList[key];
        const dlDate = new Date(t.deadline + '-01');
        
        let monthDiff = (dlDate.getFullYear() - today.getFullYear()) * 12 + (dlDate.getMonth() - today.getMonth());
        monthDiff = monthDiff < 1 ? 1 : monthDiff; // At least 1 month
        
        const remaining = t.targetAmount - t.currentAmount;
        const requiredPerMonth = remaining > 0 ? (remaining / monthDiff) : 0;
        
        let pct = (t.currentAmount / t.targetAmount) * 100;
        pct = Math.min(Math.max(pct, 0), 100);
        
        html += `
        <div class="glass-morphism modern-card p-5 relative overflow-hidden group">
            <div class="flex justify-between items-start mb-4">
                <div>
                    <h4 class="font-bold text-lg text-gray-900 dark:text-white">${escapeHTML(t.name)}</h4>
                    <span class="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md inline-block mt-1"><i data-lucide="calendar" class="w-3 h-3 inline mr-1"></i>${t.deadline}</span>
                </div>
                <button onclick="deleteTarget('${t.id}')" class="text-gray-400 hover:text-rose-500 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
            
            <div class="mb-4">
                <div class="flex justify-between text-xs mb-1">
                    <span class="font-bold text-emerald-500">${formatCurrencyShort(t.currentAmount)}</span>
                    <span class="text-gray-500">${formatCurrencyShort(t.targetAmount)}</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div class="bg-emerald-500 h-2 rounded-full transition-all duration-1000" style="width: ${pct}%"></div>
                </div>
            </div>
            
            <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3 flex justify-between items-center text-xs">
                <div>
                    <div class="text-gray-500 mb-1">Perlu ditabung</div>
                    <div class="font-bold text-indigo-600 dark:text-indigo-400">${formatCurrency(requiredPerMonth)} / bln</div>
                </div>
                <button onclick="openUpdateTargetModal('${t.id}')" class="bg-indigo-500 text-white px-3 py-1.5 rounded-lg shadow-sm active:scale-95 transition-transform"><i data-lucide="plus" class="w-4 h-4"></i></button>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
    if(window.lucide) window.lucide.createIcons();
}

function openUpdateTargetModal(id) {
    const t = targetsList[id];
    if(!t) return;
    document.getElementById('update-target-id').value = id;
    document.getElementById('update-target-amount').value = t.currentAmount;
    
    const modal = document.getElementById('update-target-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => document.getElementById('update-target-modal-content').classList.remove('translate-y-full'), 10);
}

function closeUpdateTargetModal() {
    document.getElementById('update-target-modal-content').classList.add('translate-y-full');
    setTimeout(() => {
        const modal = document.getElementById('update-target-modal');
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
}

function handleUpdateTargetSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('update-target-id').value;
    const amount = parseFloat(document.getElementById('update-target-amount').value);
    
    if(!targetsList[id]) return;
    
    targetsList[id].currentAmount = amount;
    saveTargetsToFirebase();
    closeUpdateTargetModal();
    showToast('success', 'Progress diperbarui!');
    renderTargets();
}

function deleteTarget(id) {
    if(confirm('Hapus target ini?')) {
        delete targetsList[id];
        saveTargetsToFirebase();
        renderTargets();
        showToast('success', 'Target dihapus!');
    }
}


/* --- History, Filters & Render --- */
function quickFilterDate(type) {
    document.querySelectorAll('.quick-filter-btn').forEach(b => {
        b.classList.remove('active', 'bg-indigo-50', 'text-indigo-600', 'dark:bg-indigo-900/30', 'border-indigo-200', 'dark:border-indigo-800');
        b.classList.add('bg-white', 'text-gray-600', 'dark:bg-gray-800', 'dark:text-gray-300', 'border-gray-200', 'dark:border-gray-700');
    });
    const btn = event.target;
    btn.classList.add('active', 'bg-indigo-50', 'text-indigo-600', 'dark:bg-indigo-900/30', 'border-indigo-200', 'dark:border-indigo-800');
    btn.classList.remove('bg-white', 'text-gray-600', 'dark:bg-gray-800', 'dark:text-gray-300', 'border-gray-200', 'dark:border-gray-700');

    currentQuickFilter = type;
    applyFilters();
}

function applyFilters() {
    const search = document.getElementById('search-transaction')?.value.toLowerCase() || '';
    const ty = document.getElementById('filter-type')?.value || 'all';
    const ety = document.getElementById('filter-expense-type')?.value || 'all';
    const ca = document.getElementById('filter-category')?.value || 'all';
    
    let fi = getFilteredTransactions(); 

    if(currentQuickFilter !== 'all') {
        const today = new Date();
        fi = fi.filter(t => {
            const d = new Date(t.date);
            if(currentQuickFilter === 'today') return d.toDateString() === today.toDateString();
            if(currentQuickFilter === 'week') {
                const diff = Math.floor((today - d) / (1000 * 60 * 60 * 24));
                return diff >= 0 && diff <= 7;
            }
            if(currentQuickFilter === 'month') return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
            return true;
        });
    }

    if (ty !== 'all') fi = fi.filter(t => t.type === ty);
    if (ety !== 'all') fi = fi.filter(t => t.expenseType === ety);
    if (ca !== 'all') fi = fi.filter(t => t.category === ca);
    
    if (search) {
        fi = fi.filter(t => t.description.toLowerCase().includes(search) || t.category.toLowerCase().includes(search));
    }
    
    displayTransactions(fi);
}

function displayTransactions(filtered) {
    const list = filtered || getFilteredTransactions();
    currentFilteredTransactions = list;
    const sorted = [...list].sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
    const container = document.getElementById('transactions-list');
    if (!container) return;
    if (sorted.length === 0) {
        container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 opacity-60">
            <i data-lucide="inbox" class="w-16 h-16 text-gray-400 mb-4"></i>
            <span class="text-sm text-gray-500">Tidak ada riwayat transaksi</span>
        </div>`;
        if(window.lucide) window.lucide.createIcons();
        return;
    }
    container.innerHTML = sorted.map(t => renderTransactionCardFull(t)).join('');
    if(window.lucide) window.lucide.createIcons();
}

function getIconForCategory(cat, type) {
    cat = cat.toLowerCase();
    if(type === 'income') {
        if(cat.includes('gaji')) return 'banknote';
        if(cat.includes('bonus')) return 'gift';
        if(cat.includes('investasi')) return 'trending-up';
        return 'arrow-down-left';
    } else {
        if(cat.includes('makan')) return 'utensils';
        if(cat.includes('transport')) return 'car';
        if(cat.includes('belanja')) return 'shopping-bag';
        if(cat.includes('hiburan')) return 'gamepad-2';
        if(cat.includes('tagihan')) return 'receipt';
        if(cat.includes('kesehatan')) return 'activity';
        if(cat.includes('pendidikan')) return 'book-open';
        return 'arrow-up-right';
    }
}

function renderTransactionCardFull(t) {
    const isInc = t.type === 'income';
    const icon = getIconForCategory(t.category, t.type);
    const colorClass = isInc ? 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30' : 'text-rose-500 bg-rose-100 dark:bg-rose-900/30';
    
    return `
    <div class="glass-morphism modern-card p-4 flex items-center justify-between mb-3 animate-slide-in relative group cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
        <div class="flex items-center space-x-4 flex-1">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center ${colorClass}">
                <i data-lucide="${icon}"></i>
            </div>
            <div class="flex flex-col flex-1">
                <span class="font-bold text-gray-900 dark:text-white truncate pr-4 text-sm">${escapeHTML(t.description)}</span>
                <span class="text-xs text-gray-500 mt-1">${escapeHTML(t.category)}${t.expenseType ? ` • ${escapeHTML(t.expenseType)}` : ''}</span>
            </div>
        </div>
        <div class="flex flex-col items-end">
            <span class="font-bold ${isInc ? 'text-emerald-500' : 'text-rose-500'} text-sm mb-1">
                ${isInc ? '+' : '-'}${formatCurrencyShort(t.amount)}
            </span>
            <span class="text-[10px] text-gray-400">${formatDate(t.date)}</span>
        </div>

        <div class="absolute right-2 top-1/2 -translate-y-1/2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm p-1.5 rounded-xl shadow-sm">
            <button onclick="openEditModal(${t.id})" class="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"><i data-lucide="pencil" class="w-4 h-4"></i></button>
            <button onclick="deleteTransaction(${t.id})" class="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
    </div>`;
}

/* --- Charts --- */
function updateCharts(filtered) {
    const data = filtered || getFilteredTransactions();
    if(document.getElementById('income-expense-chart')) updateIncomeExpenseChart(data);
    if(document.getElementById('category-chart')) updateCategoryChart(data);
}

function updateIncomeExpenseChart(filtered) {
    const ctxIE = document.getElementById('income-expense-chart').getContext('2d');
    if (incomeExpenseChart) incomeExpenseChart.destroy();
    
    const incData = [], expData = [], labels = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        labels.push(d.toLocaleDateString('id-ID', { month: 'short' }));
        const mT = filtered.filter(t => new Date(t.date).getMonth() === d.getMonth() && new Date(t.date).getFullYear() === d.getFullYear());
        incData.push(mT.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0));
        expData.push(mT.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0));
    }

    const gradientInc = ctxIE.createLinearGradient(0, 0, 0, 200);
    gradientInc.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
    gradientInc.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    
    const gradientExp = ctxIE.createLinearGradient(0, 0, 0, 200);
    gradientExp.addColorStop(0, 'rgba(244, 63, 94, 0.4)');
    gradientExp.addColorStop(1, 'rgba(244, 63, 94, 0.0)');

    incomeExpenseChart = new Chart(ctxIE, {
        type: 'line',
        data: { labels, datasets: [
            { label: 'Masuk', data: incData, borderColor: '#10b981', backgroundColor: gradientInc, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 0, pointHitRadius: 10 },
            { label: 'Keluar', data: expData, borderColor: '#f43f5e', backgroundColor: gradientExp, fill: true, tension: 0.4, borderWidth: 3, pointRadius: 0, pointHitRadius: 10 }
        ]},
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, border: { display: false } },
                y: { grid: { borderDash: [5, 5], color: '#e5e7eb' }, border: { display: false }, ticks: { display: false } }
            }
        }
    });
}

function updateCategoryChart(filtered) {
    if(!document.getElementById('category-chart')) return;
    const ctx = document.getElementById('category-chart').getContext('2d');
    if (categoryChart) categoryChart.destroy();

    const expT = filtered.filter(t => t.type === 'expense');
    const ct = {};
    expT.forEach(t => { ct[t.category] = (ct[t.category] || 0) + t.amount; });
    const labels = Object.keys(ct);
    const data = Object.values(ct);

    if (labels.length === 0) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = "14px Inter";
        ctx.fillStyle = "#9ca3af";
        ctx.textAlign = "center";
        ctx.fillText("Tidak ada data", ctx.canvas.width/2, ctx.canvas.height/2);
        return;
    }

    const colors = ['#6366f1', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#3b82f6'];
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 4 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, cutout: '75%',
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true, font: { size: 11, family: 'Inter' } } }
            }
        }
    });
}

/* --- Utilities --- */
function updateCategories() {
    if(document.getElementById('income-categories')) {
        document.getElementById('income-categories').innerHTML = categories.income.map(c => {
            const h = escapeHTML(c); const j = h.replace(/&#039;/g, "\\'");
            return `<div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl flex justify-between text-sm font-medium"><span>${h}</span><button onclick="deleteCategory('income', '${j}')" class="text-rose-500"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
        }).join('');
    }
    if(document.getElementById('expense-categories')) {
        document.getElementById('expense-categories').innerHTML = categories.expense.map(c => {
            const h = escapeHTML(c); const j = h.replace(/&#039;/g, "\\'");
            return `<div class="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-xl flex justify-between text-sm font-medium"><span>${h}</span><button onclick="deleteCategory('expense', '${j}')" class="text-rose-500"><i data-lucide="x" class="w-4 h-4"></i></button></div>`;
        }).join('');
    }
    if(window.lucide) window.lucide.createIcons();
}

function updateCategorySelects() {
    const inOpt = '<option value="">Pilih</option>' + categories.income.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    const exOpt = '<option value="">Pilih</option>' + categories.expense.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    
    if(document.getElementById('income-category')) document.getElementById('income-category').innerHTML = inOpt;
    if(document.getElementById('expense-category')) document.getElementById('expense-category').innerHTML = exOpt;
    if(document.getElementById('budget-category')) document.getElementById('budget-category').innerHTML = exOpt;
}

function populateFilterCategories() {
    const fc = document.getElementById('filter-category');
    if(!fc) return;
    const cats = [...new Set(transactions.map(t => t.category))];
    fc.innerHTML = '<option value="all">Semua Kategori</option>' + cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
}

function getFilteredTransactions() {
    if (!globalFilter.from && !globalFilter.to) return transactions;
    return transactions.filter(t => {
        let isValid = true;
        if (globalFilter.from) isValid = isValid && (t.date >= globalFilter.from);
        if (globalFilter.to) isValid = isValid && (t.date <= globalFilter.to);
        return isValid;
    });
}

function applyGlobalFilter() {
    globalFilter.from = document.getElementById('global-filter-from').value || null;
    globalFilter.to = document.getElementById('global-filter-to').value || null;
    updateDashboard();
}

function resetGlobalFilter() {
    document.getElementById('global-filter-from').value = '';
    document.getElementById('global-filter-to').value = '';
    globalFilter.from = null;
    globalFilter.to = null;
    updateDashboard();
}

function formatCurrency(v) { return 'Rp ' + v.toLocaleString('id-ID'); }
function formatCurrencyShort(v) { 
    if(v >= 1000000) return 'Rp ' + (v/1000000).toFixed(1) + ' Jt';
    if(v >= 1000) return 'Rp ' + (v/1000).toFixed(0) + ' Rb';
    return formatCurrency(v);
}
function formatDate(d) { return new Date(d).toLocaleDateString('id-ID', {day:'numeric',month:'short'}); }

function showToast(ty, msg) {
    const toast = document.getElementById('toast');
    if(!toast) return;
    toast.innerHTML = `<div class="flex items-center space-x-2"><i data-lucide="${ty==='error'?'alert-circle':'check-circle'}" class="w-5 h-5"></i><span>${msg}</span></div>`;
    if(window.lucide) window.lucide.createIcons();
    
    toast.className = `fixed top-12 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full text-white font-bold shadow-lg transition-transform duration-300 z-50 ${ty==='error'?'bg-rose-500':'bg-emerald-500'}`;
    setTimeout(() => { toast.classList.add('-translate-y-24'); }, 3000);
    toast.classList.remove('-translate-y-24');
}

/* --- Exports --- */
function exportExcel() {
    const data = currentFilteredTransactions; 
    if(data.length === 0) return showToast('error', 'Tidak ada data!');
    
    const rows = data.map((t, i) => ({
        'No': i + 1, 'Tanggal': t.date, 'Tipe': t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
        'Jenis': t.type === 'expense' && t.expenseType ? (t.expenseType === 'pribadi' ? 'Pribadi' : 'Umum') : '-',
        'Kategori': t.category, 'Deskripsi': t.description, 'Nominal (Rp)': t.amount
    }));
    
    const summary = {};
    let totalInc = 0, totalExp = 0;
    data.forEach(t => {
        if(!summary[t.category]) summary[t.category] = { type: t.type, amount: 0 };
        summary[t.category].amount += t.amount;
        if(t.type === 'income') totalInc += t.amount;
        else totalExp += t.amount;
    });

    const sumRows = Object.keys(summary).map(cat => ({
        'Kategori': cat, 'Tipe': summary[cat].type === 'income' ? 'Pemasukan' : 'Pengeluaran', 'Total (Rp)': summary[cat].amount
    }));
    sumRows.push({ 'Kategori': 'TOTAL PEMASUKAN', 'Tipe': '', 'Total (Rp)': totalInc });
    sumRows.push({ 'Kategori': 'TOTAL PENGELUARAN', 'Tipe': '', 'Total (Rp)': totalExp });
    sumRows.push({ 'Kategori': 'SALDO BERSIH', 'Tipe': '', 'Total (Rp)': totalInc - totalExp });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wsSum = XLSX.utils.json_to_sheet(sumRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Riwayat");
    XLSX.utils.book_append_sheet(wb, wsSum, "Ringkasan Kategori");
    XLSX.writeFile(wb, "QCash_Laporan.xlsx");
    showToast('success', 'Excel diunduh!');
}

function exportPDF() {
    const data = currentFilteredTransactions;
    if(data.length === 0) return showToast('error', 'Tidak ada data!');
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Laporan QCash", 14, 15);
    
    const tableData = data.map((t, i) => [
        i + 1, t.date, t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
        t.type === 'expense' && t.expenseType ? (t.expenseType === 'pribadi' ? 'Pribadi' : 'Umum') : '-',
        t.category, t.description, 'Rp ' + t.amount.toLocaleString('id-ID')
    ]);
    
    doc.autoTable({
        startY: 20, head: [['No', 'Tanggal', 'Tipe', 'Jenis', 'Kategori', 'Deskripsi', 'Nominal']],
        body: tableData, theme: 'striped', headStyles: { fillColor: [99, 102, 241] } 
    });

    const finalY = doc.lastAutoTable.finalY || 20;
    
    const summary = {};
    let totalInc = 0, totalExp = 0;
    data.forEach(t => {
        if(!summary[t.category]) summary[t.category] = { type: t.type, amount: 0 };
        summary[t.category].amount += t.amount;
        if(t.type === 'income') totalInc += t.amount;
        else totalExp += t.amount;
    });

    const sumTableData = Object.keys(summary).map(cat => [
        cat, summary[cat].type === 'income' ? 'Pemasukan' : 'Pengeluaran', 'Rp ' + summary[cat].amount.toLocaleString('id-ID')
    ]);
    sumTableData.push(['TOTAL PEMASUKAN', '', 'Rp ' + totalInc.toLocaleString('id-ID')]);
    sumTableData.push(['TOTAL PENGELUARAN', '', 'Rp ' + totalExp.toLocaleString('id-ID')]);
    sumTableData.push(['SALDO BERSIH', '', 'Rp ' + (totalInc - totalExp).toLocaleString('id-ID')]);

    doc.text("Ringkasan per Kategori", 14, finalY + 10);
    doc.autoTable({
        startY: finalY + 15, head: [['Kategori', 'Tipe', 'Total Nominal']],
        body: sumTableData, theme: 'striped', headStyles: { fillColor: [16, 185, 129] }
    });

    doc.save("QCash_Laporan.pdf");
    showToast('success', 'PDF diunduh!');
}

/* --- Hutang / Piutang --- */
function loadHutangFromFirebase() {
    window.firebase.onValue(window.firebase.ref(window.firebase.database, 'hutang'), (snapshot) => {
        const data = snapshot.val();
        hutangList = data ? data : {};
        if (document.getElementById('hutang-page').classList.contains('active')) renderHutang();
    });
}

function saveHutangToFirebase() {
    window.firebase.set(window.firebase.ref(window.firebase.database, 'hutang'), hutangList);
}

function handleHutangSubmit(e) {
    e.preventDefault();
    const type = document.getElementById('hutang-type').value;
    const name = document.getElementById('hutang-name').value;
    const amount = parseFloat(document.getElementById('hutang-amount').value);
    
    if(!name || !amount || amount <= 0) return showToast('error', 'Data tidak valid!');

    const newId = 'hutang_' + Date.now();
    hutangList[newId] = {
        id: newId,
        type: type,
        name: name,
        amount: amount,
        status: 'belum_lunas', // belum_lunas | lunas
        createdAt: new Date().toISOString()
    };
    
    saveHutangToFirebase();
    e.target.reset();
    showToast('success', 'Catatan berhasil disimpan!');
    renderHutang();
}

function filterHutang(filterType) {
    currentHutangFilter = filterType;
    
    document.getElementById('btn-filter-hutang-all').className = "flex-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 font-bold py-2 rounded-lg text-xs transition-colors";
    document.getElementById('btn-filter-hutang-belum').className = "flex-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 font-bold py-2 rounded-lg text-xs transition-colors";
    document.getElementById('btn-filter-hutang-lunas').className = "flex-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 font-bold py-2 rounded-lg text-xs transition-colors";

    let activeBtn = 'btn-filter-hutang-all';
    if(filterType === 'belum_lunas') activeBtn = 'btn-filter-hutang-belum';
    else if(filterType === 'lunas') activeBtn = 'btn-filter-hutang-lunas';
    
    const btn = document.getElementById(activeBtn);
    if(btn) {
        btn.className = "flex-1 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 font-bold py-2 rounded-lg text-xs transition-colors";
    }
    
    renderHutang();
}

function toggleHutangStatus(id) {
    if(!hutangList[id]) return;
    hutangList[id].status = hutangList[id].status === 'lunas' ? 'belum_lunas' : 'lunas';
    saveHutangToFirebase();
    showToast('success', 'Status diperbarui!');
    renderHutang();
}

function deleteHutang(id) {
    if(confirm('Hapus catatan ini?')) {
        delete hutangList[id];
        saveHutangToFirebase();
        showToast('success', 'Catatan dihapus!');
        renderHutang();
    }
}

function renderHutang() {
    const container = document.getElementById('hutang-list');
    if(!container) return;

    let items = Object.values(hutangList);
    if(currentHutangFilter !== 'all') {
        items = items.filter(item => item.status === currentHutangFilter);
    }
    
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if(items.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm">Tidak ada data ditemukan</div>';
        return;
    }

    let html = '';
    items.forEach(t => {
        const isLunas = t.status === 'lunas';
        const isSayaHutang = t.type === 'saya_hutang';
        
        const typeBadge = isSayaHutang 
            ? '<span class="bg-rose-100 text-rose-600 dark:bg-rose-900/30 text-[10px] font-bold px-2 py-1 rounded-md mb-1 inline-block">Saya Hutang</span>'
            : '<span class="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 text-[10px] font-bold px-2 py-1 rounded-md mb-1 inline-block">Orang Hutang</span>';
            
        const statusBadge = isLunas
            ? '<span class="text-emerald-500 font-bold text-xs"><i data-lucide="check-circle" class="w-4 h-4 inline mr-1"></i>Lunas</span>'
            : '<span class="text-amber-500 font-bold text-xs"><i data-lucide="clock" class="w-4 h-4 inline mr-1"></i>Belum Lunas</span>';
            
        const opacityClass = isLunas ? 'opacity-60' : '';

        html += `
        <div class="glass-morphism modern-card p-4 flex flex-col mb-3 ${opacityClass} transition-all">
            <div class="flex justify-between items-start mb-2">
                <div>
                    ${typeBadge}
                    <h4 class="font-bold text-gray-900 dark:text-white">${escapeHTML(t.name)}</h4>
                </div>
                <div class="text-right">
                    <span class="font-bold text-gray-900 dark:text-white block">${formatCurrencyShort(t.amount)}</span>
                </div>
            </div>
            
            <div class="flex justify-between items-center mt-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div class="flex items-center space-x-3">
                    ${statusBadge}
                    <div class="w-px h-6 bg-gray-200 dark:bg-gray-700"></div>
                    <button onclick="toggleHutangStatus('${t.id}')" class="text-indigo-500 hover:text-indigo-600" title="Tandai ${isLunas ? 'Belum Lunas' : 'Lunas'}"><i data-lucide="${isLunas ? 'rotate-ccw' : 'check'}" class="w-4 h-4"></i></button>
                    <button onclick="deleteHutang('${t.id}')" class="text-rose-400 hover:text-rose-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
    if(window.lucide) window.lucide.createIcons();
}

initializeApp();
