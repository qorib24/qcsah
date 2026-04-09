import { initializeApp as initApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
window.firebase = { database, ref, push, set, onValue };

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
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
let globalFilter = { from: null, to: null };

// Initialize App
function initializeApp() {
    // Hide splash screen after 1.5s
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.classList.add('hidden-splash');
            setTimeout(() => splash.remove(), 500); // Remove from DOM after fade
        }
    }, 1500);

    // Initialize dark mode based on preference
    if (localStorage.getItem('darkMode') === 'true' || 
        (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.add('dark'); // Force dark for premium QCash feel
        localStorage.setItem('darkMode', 'true');
    }

    loadData(); 
    loadCategoriesFromFirebase(); 
    setupEventListeners();
    setDefaultDates();
    
    // Make showPage and other needed functions global so inline onclick works
    window.showPage = showPage;
    window.deleteTransaction = deleteTransaction;
    window.deleteCategory = deleteCategory;
    window.applyGlobalFilter = applyGlobalFilter;
    window.resetGlobalFilter = resetGlobalFilter;
    window.toggleDarkMode = toggleDarkMode;
}

function setupEventListeners() {
    document.getElementById('dark-mode-toggle')?.addEventListener('click', toggleDarkMode);
    
    document.getElementById('income-form')?.addEventListener('submit', handleIncomeSubmit);
    document.getElementById('expense-form')?.addEventListener('submit', handleExpenseSubmit);
    document.getElementById('category-form')?.addEventListener('submit', handleCategorySubmit);

    document.getElementById('filter-type')?.addEventListener('change', applyFilters);
    document.getElementById('filter-category')?.addEventListener('change', applyFilters);
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
}

function applyGlobalFilter() {
    globalFilter.from = document.getElementById('global-filter-from').value || null;
    globalFilter.to = document.getElementById('global-filter-to').value || null;
    updateDashboard();
    if (document.getElementById('riwayat-page').classList.contains('active')) {
        displayTransactions();
    }
}

function resetGlobalFilter() {
    document.getElementById('global-filter-from').value = '';
    document.getElementById('global-filter-to').value = '';
    globalFilter.from = null;
    globalFilter.to = null;
    updateDashboard();
    if (document.getElementById('riwayat-page').classList.contains('active')) {
        displayTransactions();
    }
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

function loadData() {
    const transactionsRef = window.firebase.ref(window.firebase.database, 'transactions');
    window.firebase.onValue(transactionsRef, (snapshot) => {
        const data = snapshot.val();
        transactions = data ? Object.values(data) : [];
        updateDashboard();
    });
}

function saveDataToFirebase(transaction) {
    const transactionsRef = window.firebase.ref(window.firebase.database, 'transactions');
    const newRef = window.firebase.push(transactionsRef);
    window.firebase.set(newRef, transaction);
}

function saveCategoriesToFirebase() {
    window.firebase.set(window.firebase.ref(window.firebase.database, 'categories'), categories);
}

function loadCategoriesFromFirebase() {
    window.firebase.onValue(window.firebase.ref(window.firebase.database, 'categories'), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            categories = data;
        }
        if(!categories.expense) categories.expense = [];
        if(!categories.expense.includes('Investasi')) categories.expense.push('Investasi');
        if(!categories.expense.includes('Tabungan')) categories.expense.push('Tabungan');
        
        updateCategories();
        updateCategorySelects();
    });
}

function showPage(pageId) {
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.remove('active');
    });
    
    document.getElementById(pageId + '-page').classList.add('active');

    // Update bottom nav active state
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Find the corresponding nav button
    const activeBtn = document.querySelector(`.bottom-nav-item[onclick="showPage('${pageId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    if (pageId === 'dashboard') {
        setTimeout(() => {
            updateCharts();
        }, 100);
    }
    if (pageId === 'riwayat') {
        displayTransactions();
        populateFilterCategories();
    }
}

function toggleDarkMode() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', document.documentElement.classList.contains('dark'));
}

function handleIncomeSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('income-amount').value);
    const description = document.getElementById('income-description').value;
    const category = document.getElementById('income-category').value;
    const date = document.getElementById('income-date').value;

    if (!amount || !description || !category || !date) return showToast('error', 'Lengkapi semua field!');

    const transaction = { id: Date.now(), type: 'income', amount, description, category, date, timestamp: new Date().toISOString() };
    transactions.push(transaction);
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

    if (!amount || !description || !category || !expenseType || !date) return showToast('error', 'Lengkapi semua field!');

    const transaction = { id: Date.now(), type: 'expense', expenseType, amount, description, category, date, timestamp: new Date().toISOString() };
    transactions.push(transaction);
    saveDataToFirebase(transaction);
    e.target.reset(); setDefaultDates();
    showToast('success', 'Pengeluaran ditambahkan!');
}

function calculateExpenseByType(src) {
    let pribadi = 0, umum = 0;
    src.forEach(t => {
        if (t.type === 'expense') {
            if (t.expenseType === 'pribadi') pribadi += t.amount;
            if (t.expenseType === 'umum') umum += t.amount;
        }
    });
    return { pribadi, umum };
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

function updateDashboard() {
    const filtered = getFilteredTransactions();
    const totalInc = filtered.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExp = filtered.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const totalBal = totalInc - totalExp;

    let totalTabungan = 0;
    filtered.forEach(t => {
        const isTab = t.category.toLowerCase() === 'investasi' || t.category.toLowerCase() === 'tabungan';
        if (isTab) {
            if (t.type === 'expense') totalTabungan += t.amount;
            else if (t.type === 'income') totalTabungan -= t.amount;
        }
    });

    document.getElementById('total-balance').innerHTML = `<span class="bg-gradient-to-r from-green-500 to-emerald-400 bg-clip-text text-transparent">${formatCurrency(totalBal)}</span>`;
    document.getElementById('total-income').textContent = formatCurrency(totalInc);
    document.getElementById('total-expense').textContent = formatCurrency(totalExp);
    
    if(document.getElementById('total-tabungan')) {
        document.getElementById('total-tabungan').textContent = formatCurrency(totalTabungan);
    }

    const expByType = calculateExpenseByType(filtered);
    document.getElementById('expense-pribadi').textContent = formatCurrency(expByType.pribadi);
    document.getElementById('expense-umum').textContent = formatCurrency(expByType.umum);

    if (document.getElementById('riwayat-page').classList.contains('active')) displayTransactions();
    updateCharts(filtered);
}





function updateCharts(filtered) {
    const data = filtered || getFilteredTransactions();
    if(document.getElementById('income-expense-chart')) {
        updateIncomeExpenseChart(data);
    }
    if(document.getElementById('category-chart')) {
        updateCategoryChart(data);
    }
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

    incomeExpenseChart = new Chart(ctxIE, {
        type: 'line',
        data: { labels, datasets: [
            { label: 'Masuk', data: incData, borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', fill: true, tension: 0.4 },
            { label: 'Keluar', data: expData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.4 }
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
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
        document.getElementById('category-chart').parentElement.style.display = 'block';
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.font = "14px Inter";
        ctx.fillStyle = "#9ca3af";
        ctx.textAlign = "center";
        ctx.fillText("Tidak ada data", ctx.canvas.width/2, ctx.canvas.height/2);
        return;
    }
    document.getElementById('category-chart').parentElement.style.display = 'block';

    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b'];
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ data: data, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } }
            }
        }
    });
}



function displayTransactions(filtered) {
    const list = filtered || getFilteredTransactions();
    const sorted = list.sort((a,b)=> new Date(b.timestamp) - new Date(a.timestamp));
    const container = document.getElementById('transactions-list');
    if (!container) return;
    if (sorted.length === 0) {
        container.innerHTML = '<div class="text-center py-8 text-gray-500">Tidak ada riwayat</div>';
        return;
    }
    container.innerHTML = sorted.map(t => renderTransactionCardFull(t)).join('');
}

function renderTransactionCardFull(t) {
    const isInc = t.type === 'income';
    return `
    <div class="glass-morphism rounded-xl p-4 flex items-center justify-between mb-3">
        <div class="flex flex-col">
            <span class="font-bold text-gray-900 dark:text-white">${escapeHTML(t.description)}</span>
            <span class="text-xs text-gray-500 mt-1">${escapeHTML(t.category)} • ${formatDate(t.date)}</span>
        </div>
        <div class="flex flex-col items-end">
            <span class="font-bold ${isInc ? 'text-green-500' : 'text-red-500'}">
                ${isInc ? '+' : '-'}${formatCurrencyShort(t.amount)}
            </span>
            <button onclick="deleteTransaction(${t.id})" class="text-xs mt-2 text-red-400 bg-red-400/10 px-2 py-1 rounded-md">Hapus</button>
        </div>
    </div>`;
}

function populateFilterCategories() {
    const fc = document.getElementById('filter-category');
    if(!fc) return;
    const cats = [...new Set(transactions.map(t => t.category))];
    fc.innerHTML = '<option value="all">Semua Kategori</option>' + cats.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
}

function applyFilters() {
    const ty = document.getElementById('filter-type').value;
    const ca = document.getElementById('filter-category').value;
    let fi = getFilteredTransactions();
    if (ty !== 'all') fi = fi.filter(t => t.type === ty);
    if (ca !== 'all') fi = fi.filter(t => t.category === ca);
    displayTransactions(fi);
}

function updateCategories() {
    // Only update if DOM exists
    if(document.getElementById('income-categories')) {
        document.getElementById('income-categories').innerHTML = categories.income.map(c => {
            const h = escapeHTML(c); const j = h.replace(/&#039;/g, "\\'");
            return `<div class="p-3 bg-green-500/10 rounded-lg mb-2 flex justify-between"><span>${h}</span><button onclick="deleteCategory('income', '${j}')">X</button></div>`;
        }).join('');
    }
    if(document.getElementById('expense-categories')) {
        document.getElementById('expense-categories').innerHTML = categories.expense.map(c => {
            const h = escapeHTML(c); const j = h.replace(/&#039;/g, "\\'");
            return `<div class="p-3 bg-red-500/10 rounded-lg mb-2 flex justify-between"><span>${h}</span><button onclick="deleteCategory('expense', '${j}')">X</button></div>`;
        }).join('');
    }
}

function updateCategorySelects() {
    const inc = document.getElementById('income-category');
    if(inc) inc.innerHTML = '<option value="">Pilih</option>' + categories.income.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
    const exp = document.getElementById('expense-category');
    if(exp) exp.innerHTML = '<option value="">Pilih</option>' + categories.expense.map(c=>`<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('');
}

function deleteTransaction(id) {
    const tRef = window.firebase.ref(window.firebase.database, 'transactions');
    window.firebase.onValue(tRef, snap => {
        const data = snap.val();
        if(!data) return;
        for(let key in data) {
            if(data[key].id === id) {
                window.firebase.set(window.firebase.ref(window.firebase.database, `transactions/${key}`), null);
                showToast('success', 'Dihapus!');
                return;
            }
        }
    }, {onlyOnce: true});
}

function deleteCategory(t, n) {
    if(confirm('Hapus kategori ini?')){
        categories[t] = categories[t].filter(c => c !== n);
        saveCategoriesToFirebase();
        showToast('success', 'Dihapus!');
    }
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
    toast.textContent = msg;
    toast.className = `fixed top-12 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full text-white font-bold shadow-lg transition-transform duration-300 z-50 ${ty==='error'?'bg-red-500':'bg-emerald-500'}`;
    setTimeout(() => { toast.classList.add('-translate-y-24'); }, 3000);
    toast.classList.remove('-translate-y-24');
}

// Start
initializeApp();
