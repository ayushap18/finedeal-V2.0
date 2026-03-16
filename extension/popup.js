// FineDeal Popup — Multi-screen UI Controller

(function () {
  'use strict';

  // ===== State =====
  let currentProduct = null;
  let comparisonResults = null;
  let historyData = null;
  let previousScreen = 'detected';

  const SITES = [
    { domain: 'amazon.in', name: 'Amazon', icon: '🛒' },
    { domain: 'flipkart.com', name: 'Flipkart', icon: '🛍️' },
    { domain: 'croma.com', name: 'Croma', icon: '📱' },
    { domain: 'myntra.com', name: 'Myntra', icon: '👗' },
    { domain: 'snapdeal.com', name: 'Snapdeal', icon: '⚡' },
    { domain: 'tatacliq.com', name: 'Tata CLiQ', icon: '🏬' },
    { domain: 'ajio.com', name: 'AJIO', icon: '👟' },
    { domain: 'nykaa.com', name: 'Nykaa', icon: '💄' },
    { domain: 'vijaysales.com', name: 'Vijay Sales', icon: '📺' }
  ];

  // ===== Screen Management =====
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach((s) => (s.classList.remove('active')));
    const el = document.getElementById('screen-' + name);
    if (el) el.classList.add('active');
  }

  // ===== Helpers =====
  function fmt(price) {
    if (!price && price !== 0) return '₹—';
    return '₹' + Number(price).toLocaleString('en-IN');
  }

  function sendMessage(msg) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[FineDeal Popup]', chrome.runtime.lastError.message);
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp || { success: false });
        }
      });
    });
  }

  // ===== Initialize =====
  async function init() {
    // Try to get current product from background
    const resp = await sendMessage({ type: 'GET_PRODUCT' });
    if (resp.success && resp.product && resp.product.title) {
      currentProduct = resp.product;
      renderProductDetected();
      showScreen('detected');
    } else {
      // Try from storage
      const stored = await chrome.storage.local.get(['currentProduct', 'lastDetected']);
      if (stored.currentProduct && stored.currentProduct.title) {
        currentProduct = stored.currentProduct;
        renderProductDetected();
        showScreen('detected');
      } else {
        showScreen('empty');
      }
    }

    bindEvents();
    initSettings();
  }

  // ===== Screen 1: Product Detected =====
  function renderProductDetected() {
    if (!currentProduct) return;

    const img = document.getElementById('product-image');
    if (currentProduct.image) {
      img.src = currentProduct.image;
    } else {
      img.style.display = 'none';
    }
    document.getElementById('product-site').textContent = currentProduct.site || 'Unknown';
    document.getElementById('product-title').textContent = currentProduct.title;
    document.getElementById('product-price').textContent = fmt(currentProduct.price);

    // Quick stats from cache
    chrome.storage.local.get('lastComparison', (data) => {
      if (data.lastComparison && data.lastComparison.stats) {
        const s = data.lastComparison.stats;
        document.getElementById('stat-lowest').textContent = fmt(s.lowestEver);
        document.getElementById('stat-average').textContent = fmt(s.averagePrice);
        document.getElementById('stat-sites').textContent = s.sitesFound || '—';
      }
    });
  }

  // ===== Screen 2: Searching =====
  function startSearch() {
    showScreen('searching');
    renderSearching();
    runComparison();
  }

  function renderSearching() {
    const list = document.getElementById('site-status-list');
    list.innerHTML = '';
    SITES.forEach((site) => {
      const item = document.createElement('div');
      item.className = 'site-status-item';
      item.id = 'status-' + site.domain.replace('.', '-');
      item.innerHTML = `
        <span class="site-name">${site.icon} ${site.name}</span>
        <span class="site-status-icon waiting">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>
        </span>`;
      list.appendChild(item);
    });
  }

  async function runComparison() {
    const bar = document.getElementById('search-progress');
    const text = document.getElementById('progress-text');

    bar.style.width = '10%';
    text.textContent = 'Searching across 9 platforms...';

    // Animate progress while waiting
    let progress = 10;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + 3, 85);
      bar.style.width = progress + '%';
    }, 500);

    // Fetch results from background (which calls /api/scraper)
    let resp;
    try {
      resp = await Promise.race([
        sendMessage({ type: 'COMPARE_PRICES', data: currentProduct }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Search timed out after 35 seconds')), 35000))
      ]);
    } catch (err) {
      clearInterval(progressInterval);
      bar.style.width = '100%';
      text.textContent = 'Search timed out - showing cached results...';
      // Try to use cached results
      const cached = await chrome.storage.local.get('lastComparison');
      if (cached.lastComparison) {
        comparisonResults = cached.lastComparison;
        renderResults();
        showScreen('results');
      } else {
        alert('Search timed out. The server may be busy. Please try again.');
        showScreen('detected');
      }
      return;
    }

    clearInterval(progressInterval);

    if (resp.success) {
      // Animate site status indicators based on actual results
      const foundSites = new Set((resp.results || []).map((r) => (r.site || '').toLowerCase()));

      for (let i = 0; i < SITES.length; i++) {
        const site = SITES[i];
        const itemId = 'status-' + site.domain.replace('.', '-');
        const item = document.getElementById(itemId);
        if (!item) continue;

        const icon = item.querySelector('.site-status-icon');
        const hasResult = foundSites.has(site.name.toLowerCase());

        if (hasResult) {
          icon.className = 'site-status-icon done';
          icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else {
          icon.className = 'site-status-icon done';
          icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
        }

        bar.style.width = ((i + 1) / SITES.length * 100) + '%';
        text.textContent = `${i + 1} of ${SITES.length} sites checked`;
        await sleep(100);
      }

      comparisonResults = resp;
      renderResults();
      showScreen('results');
    } else {
      bar.style.width = '100%';
      text.textContent = 'Search completed with errors';
      // Show error on the searching screen briefly, then go back
      setTimeout(() => {
        showScreen('detected');
      }, 2000);
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ===== Screen 3: Results =====
  function renderResults() {
    if (!comparisonResults) return;
    const { results, stats } = comparisonResults;

    // Deal score
    const score = stats.dealScore || 0;
    document.getElementById('deal-score-value').textContent = score;

    let scoreDesc = 'This is a fair deal.';
    if (score >= 80) scoreDesc = 'Excellent deal! This is significantly below average price.';
    else if (score >= 60) scoreDesc = 'Good deal. Price is below the average across sites.';
    else if (score >= 40) scoreDesc = 'Average pricing. Consider waiting for a better deal.';
    else scoreDesc = 'Not a great deal right now. Prices have been lower.';
    document.getElementById('deal-score-desc').textContent = scoreDesc;

    // Update deal score ring color
    const ring = document.querySelector('.deal-score-ring');
    if (score >= 70) ring.style.borderColor = '#4ADE80';
    else if (score >= 40) ring.style.borderColor = '#F97316';
    else ring.style.borderColor = '#F87171';

    // Results list
    const list = document.getElementById('results-list');
    list.innerHTML = '';

    // Filter out ₹0 and irrelevant results
    const validResults = (results || []).filter((r) => r.price > 0);
    if (validResults.length === 0) {
      list.innerHTML = '<div class="no-results" style="text-align:center;padding:20px;color:#888;">No valid prices found. Try searching again.</div>';
      return;
    }

    validResults.forEach((r, i) => {
      const isBest = i === 0;
      const item = document.createElement('div');
      item.className = 'result-item' + (isBest ? ' best-price' : '');
      if (r.url && r.url !== '#') {
        item.onclick = () => chrome.tabs.create({ url: r.url });
      }

      const discount = r.discount ? `-${r.discount}%` : '';
      const originalPrice = r.originalPrice ? `<span class="result-original-price">${fmt(r.originalPrice)}</span>` : '';
      const stockHtml = r.inStock === false ? '<span class="result-stock">Out of Stock</span>' : '';
      const discountHtml = discount ? `<span class="result-discount">${discount}</span>` : '';

      item.innerHTML = `
        <span class="result-rank">${i + 1}</span>
        <div class="result-info">
          <p class="result-site">${r.site || 'Unknown'}${isBest ? ' · Best Price' : ''}</p>
          <p class="result-title">${r.title || currentProduct?.title || ''}</p>
        </div>
        <div class="result-price-col">
          <p class="result-price">${fmt(r.price)}</p>
          ${originalPrice}
          ${discountHtml}
          ${stockHtml}
        </div>`;
      list.appendChild(item);
    });

    // Update detected screen stats too
    document.getElementById('stat-lowest').textContent = fmt(stats.lowestEver);
    document.getElementById('stat-average').textContent = fmt(stats.averagePrice);
    document.getElementById('stat-sites').textContent = stats.sitesFound || results.length;
  }

  // ===== Screen 4: Price History =====
  async function loadHistory() {
    showScreen('history');

    const resp = await sendMessage({
      type: 'GET_HISTORY',
      data: currentProduct
    });

    if (resp.success) {
      historyData = resp;
      renderHistory();
    } else {
      // Show error message in chart area
      const canvas = document.getElementById('price-chart');
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#F87171';
      ctx.font = '13px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(resp.error || 'Failed to load price history', canvas.width / 2, canvas.height / 2);
    }
  }

  function renderHistory() {
    if (!historyData) return;
    const { history, stats, prediction } = historyData;

    // Stats
    if (stats) {
      document.getElementById('hist-current').textContent = fmt(stats.current || currentProduct?.price);
      document.getElementById('hist-lowest').textContent = fmt(stats.lowest);
      document.getElementById('hist-average').textContent = fmt(stats.average);
    }

    // Prediction
    if (prediction) {
      document.getElementById('pred-confidence').textContent = prediction.confidence + '% confidence';
      document.getElementById('pred-text').textContent = prediction.message;
    }

    // Draw chart
    drawPriceChart(history || []);
  }

  function drawPriceChart(history) {
    const canvas = document.getElementById('price-chart');
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!history.length) {
      ctx.fillStyle = '#666';
      ctx.font = '13px Manrope, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No history data available', W / 2, H / 2);
      return;
    }

    const prices = history.map((h) => h.price);
    const minP = Math.min(...prices) * 0.95;
    const maxP = Math.max(...prices) * 1.05;
    const range = maxP - minP || 1;

    const padL = 12;
    const padR = 12;
    const padT = 16;
    const padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    // Grid lines
    ctx.strokeStyle = '#2A2A2A';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
    }

    // Gradient fill
    const grad = ctx.createLinearGradient(0, padT, 0, H - padB);
    grad.addColorStop(0, 'rgba(249, 115, 22, 0.2)');
    grad.addColorStop(1, 'rgba(249, 115, 22, 0)');

    ctx.beginPath();
    history.forEach((h, i) => {
      const x = padL + (i / (history.length - 1)) * plotW;
      const y = padT + plotH - ((h.price - minP) / range) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    // Close for fill
    ctx.lineTo(padL + plotW, H - padB);
    ctx.lineTo(padL, H - padB);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    history.forEach((h, i) => {
      const x = padL + (i / (history.length - 1)) * plotW;
      const y = padT + plotH - ((h.price - minP) / range) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#F97316';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Dots at start and end
    [0, history.length - 1].forEach((i) => {
      const x = padL + (i / (history.length - 1)) * plotW;
      const y = padT + plotH - ((prices[i] - minP) / range) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#F97316';
      ctx.fill();
      ctx.strokeStyle = '#0F0F0F';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Min label
    const minIdx = prices.indexOf(Math.min(...prices));
    const minX = padL + (minIdx / (history.length - 1)) * plotW;
    const minY = padT + plotH - ((Math.min(...prices) - minP) / range) * plotH;
    ctx.fillStyle = '#4ADE80';
    ctx.font = '600 10px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(fmt(Math.min(...prices)), minX, minY - 10);

    // Date labels
    ctx.fillStyle = '#666';
    ctx.font = '10px Manrope, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(history[0].date.substring(5), padL, H - 6);
    ctx.textAlign = 'right';
    ctx.fillText(history[history.length - 1].date.substring(5), W - padR, H - 6);
  }

  // ===== Screen 5: Alert Setup =====
  function openAlertSetup() {
    previousScreen = document.querySelector('.screen.active')?.id?.replace('screen-', '') || 'detected';
    showScreen('alert');
    renderAlertSetup();
  }

  function renderAlertSetup() {
    if (!currentProduct) return;

    const img = document.getElementById('alert-product-img');
    if (currentProduct.image) img.src = currentProduct.image;
    document.getElementById('alert-product-name').textContent = currentProduct.title;
    document.getElementById('alert-current-price').textContent = fmt(currentProduct.price);

    // Quick pick chips
    const price = currentProduct.price || 10000;
    const chips = [
      { label: '-5%', value: Math.round(price * 0.95) },
      { label: '-10%', value: Math.round(price * 0.90) },
      { label: '-15%', value: Math.round(price * 0.85) },
      { label: '-20%', value: Math.round(price * 0.80) }
    ];

    const chipRow = document.getElementById('quick-pick-chips');
    chipRow.innerHTML = '';
    chips.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.textContent = `${c.label} (${fmt(c.value)})`;
      btn.onclick = () => {
        document.getElementById('alert-target-price').value = c.value;
        chipRow.querySelectorAll('.chip').forEach((ch) => ch.classList.remove('active'));
        btn.classList.add('active');
      };
      chipRow.appendChild(btn);
    });

    // Reset
    document.getElementById('alert-target-price').value = '';
    document.getElementById('alert-success').style.display = 'none';
  }

  async function submitAlert() {
    const targetPrice = Number(document.getElementById('alert-target-price').value);
    if (!targetPrice || targetPrice <= 0) {
      document.getElementById('alert-target-price').focus();
      return;
    }

    const btn = document.getElementById('btn-submit-alert');
    btn.disabled = true;
    btn.textContent = 'Setting Alert...';

    const resp = await sendMessage({
      type: 'SET_ALERT',
      data: {
        title: currentProduct.title,
        url: currentProduct.url,
        price: currentProduct.price,
        targetPrice,
        notifyEmail: document.getElementById('notify-email').checked,
        notifyTelegram: document.getElementById('notify-telegram').checked
      }
    });

    btn.disabled = false;
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Set Alert`;

    if (resp.success) {
      document.getElementById('alert-success').style.display = 'flex';
    } else {
      alert('Failed to set alert: ' + (resp.error || 'Unknown error'));
    }
  }

  // ===== Screen 6: Settings =====
  async function initSettings() {
    const resp = await sendMessage({ type: 'GET_SETTINGS' });
    if (!resp.success) return;

    const s = resp.settings;

    // Notification toggles
    if (s.notifications) {
      document.getElementById('set-price-drops').checked = s.notifications.priceDrops;
      document.getElementById('set-deal-alerts').checked = s.notifications.dealAlerts;
      document.getElementById('set-weekly-report').checked = s.notifications.weeklyReport;
    }

    // Sites checklist
    const list = document.getElementById('sites-checklist');
    list.innerHTML = '';
    SITES.forEach((site) => {
      const checked = s.sites?.[site.domain] !== false;
      const item = document.createElement('label');
      item.className = 'site-check-item';
      item.innerHTML = `
        <input type="checkbox" data-site="${site.domain}" ${checked ? 'checked' : ''}>
        <span>${site.icon} ${site.name}</span>`;
      list.appendChild(item);
    });

    // Re-bind save on site checkbox changes
    list.querySelectorAll('input[data-site]').forEach((el) => {
      el.addEventListener('change', saveSettings);
    });
  }

  async function saveSettings() {
    const settings = {
      notifications: {
        priceDrops: document.getElementById('set-price-drops').checked,
        dealAlerts: document.getElementById('set-deal-alerts').checked,
        weeklyReport: document.getElementById('set-weekly-report').checked
      },
      sites: {}
    };

    document.querySelectorAll('#sites-checklist input[data-site]').forEach((cb) => {
      settings.sites[cb.dataset.site] = cb.checked;
    });

    const resp = await sendMessage({ type: 'UPDATE_SETTINGS', data: settings });
    if (!resp.success) {
      console.warn('[FineDeal Popup] Failed to save settings:', resp.error);
    }
  }

  // ===== Event Bindings =====
  function bindEvents() {
    // Navigation
    document.getElementById('btn-settings').onclick = () => { previousScreen = 'detected'; showScreen('settings'); };
    document.getElementById('btn-settings-empty').onclick = () => { previousScreen = 'empty'; showScreen('settings'); };
    document.getElementById('btn-back-settings').onclick = () => { saveSettings(); showScreen(previousScreen); };
    document.getElementById('btn-back-results').onclick = () => showScreen('detected');
    document.getElementById('btn-back-history').onclick = () => showScreen(previousScreen);
    document.getElementById('btn-back-alert').onclick = () => showScreen(previousScreen);
    document.getElementById('btn-cancel-search').onclick = () => showScreen('detected');

    // Actions
    document.getElementById('btn-compare').onclick = startSearch;
    document.getElementById('btn-history').onclick = () => { previousScreen = 'detected'; loadHistory(); };
    document.getElementById('btn-history-from-results').onclick = () => { previousScreen = 'results'; loadHistory(); };
    document.getElementById('btn-set-alert-from-results').onclick = openAlertSetup;
    document.getElementById('btn-set-alert-from-history').onclick = openAlertSetup;
    document.getElementById('btn-submit-alert').onclick = submitAlert;

    // Alert toggle on detected screen
    document.getElementById('alert-toggle').onchange = function () {
      if (this.checked) openAlertSetup();
    };

    // Auto-save settings on toggle change
    document.querySelectorAll('#screen-settings .toggle input, #sites-checklist input').forEach((el) => {
      el.addEventListener('change', saveSettings);
    });
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', init);
})();
