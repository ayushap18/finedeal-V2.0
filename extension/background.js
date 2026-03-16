// FineDeal Background Service Worker

const API_BASE = 'http://localhost:3000/api';

// Current detected product state
let currentProduct = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[FineDeal BG] Error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case 'PRODUCT_DETECTED':
      return handleProductDetected(message.data);
    case 'GET_PRODUCT':
      return { success: true, product: currentProduct };
    case 'COMPARE_PRICES':
      return handleComparePrices(message.data);
    case 'GET_HISTORY':
      return handleGetHistory(message.data);
    case 'SET_ALERT':
      return handleSetAlert(message.data);
    case 'GET_SETTINGS':
      return handleGetSettings();
    case 'UPDATE_SETTINGS':
      return handleUpdateSettings(message.data);
    default:
      return { success: false, error: 'Unknown message type' };
  }
}

async function handleProductDetected(product) {
  currentProduct = product;

  // Cache in storage
  await chrome.storage.local.set({
    currentProduct: product,
    lastDetected: Date.now()
  });

  // Update badge
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#F97316' });

  // Register extension user (only if we have stored contact info)
  try {
    const stored = await chrome.storage.local.get(['userEmail', 'telegramChatId']);
    if (stored.userEmail || stored.telegramChatId) {
      await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: stored.userEmail || undefined,
          telegram_chat_id: stored.telegramChatId || undefined,
          browser: 'Chrome',
          extension_version: '4.0.0',
        })
      });
    }
  } catch { /* user registration is best-effort */ }

  return { success: true };
}

async function handleComparePrices(data) {
  const product = data || currentProduct;
  if (!product) return { success: false, error: 'No product detected' };

  try {
    // Fast path: check DB for existing price data first
    let cachedResults = [];
    try {
      const dbResp = await fetch(`${API_BASE}/products?search=${encodeURIComponent(product.title.substring(0, 40))}`);
      if (dbResp.ok) {
        const dbData = await dbResp.json();
        if (dbData.products && dbData.products.length > 0) {
          cachedResults = dbData.products
            .filter(p => p.current_price > 0)
            .map(p => ({
              id: p.id,
              title: p.name,
              price: p.current_price,
              originalPrice: p.original_price || 0,
              site: p.platform || 'Unknown',
              url: p.url || '',
              image: '',
              rating: null,
              inStock: true,
              discount: p.original_price > p.current_price ? Math.round((1 - p.current_price / p.original_price) * 100) : 0,
            }));
        }
      }
    } catch { /* DB check is best-effort */ }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${API_BASE}/scraper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        query: product.title.substring(0, 80),
        platforms: ['amazon', 'flipkart', 'croma', 'myntra', 'ajio', 'snapdeal', 'tatacliq', 'nykaa', 'vijaysales']
      })
    });

    clearTimeout(timeout);

    if (!response.ok) throw new Error(`API returned ${response.status}`);

    const apiData = await response.json();
    const results = (apiData.results || [])
      .filter((r) => r.price && r.price > 0)
      .map((r) => ({
        id: r.id || r.url,
        title: r.title || r.name || product.title,
        price: r.price || r.current_price || 0,
        originalPrice: r.original_price || r.mrp || 0,
        site: r.platform || r.site || r.source || 'Unknown',
        url: r.url || r.link || '',
        image: r.image || r.image_url || '',
        rating: r.rating || null,
        inStock: r.in_stock !== false,
        discount: r.discount || 0
      }));

    // Sort by price ascending
    results.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));

    // Calculate deal score from real data
    const prices = results.filter((r) => r.price > 0).map((r) => r.price);
    const lowestPrice = prices.length ? Math.min(...prices) : product.price;
    const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : product.price;
    const dealScore = prices.length
      ? Math.min(99, Math.round(((avgPrice - lowestPrice) / avgPrice) * 100 + 50))
      : 0;

    // Find lowest ever from DB products
    let lowestEver = lowestPrice;
    try {
      const dbResp = await fetch(`${API_BASE}/products?search=${encodeURIComponent(product.title.substring(0, 40))}`);
      if (dbResp.ok) {
        const dbData = await dbResp.json();
        const dbProducts = dbData.products || [];
        for (const p of dbProducts) {
          const pLow = p.lowest_price || p.current_price || Infinity;
          if (pLow < lowestEver) lowestEver = pLow;
        }
      }
    } catch {
      // lowestEver stays as lowestPrice
    }

    const comparisonData = {
      results,
      stats: {
        lowestPrice,
        averagePrice: Math.round(avgPrice),
        sitesFound: results.length,
        dealScore,
        lowestEver: Math.round(lowestEver)
      },
      timestamp: Date.now()
    };

    // Cache results
    await chrome.storage.local.set({ lastComparison: comparisonData });

    return { success: true, ...comparisonData };
  } catch (err) {
    console.error('[FineDeal BG] Compare error:', err);
    // If we have cached results, return those instead of failing
    if (cachedResults.length > 0) {
      cachedResults.sort((a, b) => a.price - b.price);
      const prices = cachedResults.map(r => r.price);
      const lowestPrice = Math.min(...prices);
      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      return {
        success: true,
        results: cachedResults,
        stats: {
          lowestPrice,
          averagePrice: Math.round(avgPrice),
          sitesFound: cachedResults.length,
          dealScore: Math.min(99, Math.round(((avgPrice - lowestPrice) / avgPrice) * 100 + 50)),
          lowestEver: lowestPrice,
        },
        cached: true,
        timestamp: Date.now(),
      };
    }
    return { success: false, error: 'Failed to fetch price comparison: ' + err.message };
  }
}

async function handleGetHistory(data) {
  try {
    const productTitle = data?.title || currentProduct?.title;
    if (!productTitle) return { success: false, error: 'No product title' };

    // Search for the product in DB by name
    const searchResp = await fetch(`${API_BASE}/products?search=${encodeURIComponent(productTitle.substring(0, 40))}`);
    if (!searchResp.ok) throw new Error(`Products API returned ${searchResp.status}`);

    const searchData = await searchResp.json();
    const products = searchData.products || [];
    if (!products.length) return { success: false, error: 'Product not found in database' };

    // Get the best matching product and its history
    const product = products[0];
    const historyResp = await fetch(`${API_BASE}/products/${encodeURIComponent(product.id)}`);
    if (!historyResp.ok) throw new Error(`Product history API returned ${historyResp.status}`);

    const historyData = await historyResp.json();
    const priceHistory = (historyData.price_history || [])
      .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
      .map((ph) => ({
        date: ph.recorded_at.split('T')[0],
        price: ph.price
      }));

    const prices = priceHistory.map((h) => h.price);
    const currentPrice = data?.price || product.current_price || (prices.length ? prices[prices.length - 1] : 0);
    const lowest = prices.length ? Math.min(...prices) : currentPrice;
    const highest = prices.length ? Math.max(...prices) : currentPrice;
    const average = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : currentPrice;

    // Compute trend from history
    let trend = 'stable';
    if (prices.length >= 2) {
      const recent = prices.slice(-3);
      const older = prices.slice(-6, -3);
      if (older.length) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        trend = recentAvg < olderAvg ? 'down' : recentAvg > olderAvg ? 'up' : 'stable';
      }
    }

    return {
      success: true,
      history: priceHistory,
      stats: {
        current: currentPrice,
        lowest,
        average,
        highest
      },
      prediction: {
        trend,
        confidence: prices.length >= 5 ? Math.min(95, prices.length * 10) : 0,
        message: prices.length >= 5
          ? `Based on ${prices.length} data points, the price trend is ${trend}.`
          : 'Not enough data for a reliable prediction.'
      }
    };
  } catch (err) {
    console.error('[FineDeal BG] History error:', err);
    return { success: false, error: 'Failed to fetch price history: ' + err.message };
  }
}

async function handleSetAlert(data) {
  try {
    // First, find or create the product in DB
    const title = data.title || currentProduct?.title;
    const url = data.url || currentProduct?.url;
    const price = data.price || currentProduct?.price || 0;

    let productId = null;

    // Search for existing product
    const searchResp = await fetch(`${API_BASE}/products?search=${encodeURIComponent((title || '').substring(0, 40))}`);
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      if (searchData.products && searchData.products.length > 0) {
        productId = searchData.products[0].id;
      }
    }

    // Create product if not found
    if (!productId && title && url) {
      const createResp = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: title,
          platform: currentProduct?.domain || currentProduct?.site || 'unknown',
          url: url,
          current_price: price,
          original_price: price
        })
      });
      if (createResp.ok) {
        const createData = await createResp.json();
        productId = createData.product?.id;
      }
    }

    if (!productId) {
      return { success: false, error: 'Could not find or create product in database' };
    }

    // Create alert via API
    const response = await fetch(`${API_BASE}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        alert_type: 'target_price',
        target_value: data.targetPrice,
        current_price: price,
        product_name: title,
        notify_email: data.notifyEmail || false,
        notify_telegram: data.notifyTelegram || false
      })
    });

    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const result = await response.json();

    // Show notification
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Price Alert Set!',
      message: `We'll notify you when the price drops below ₹${data.targetPrice}`
    });

    return { success: true, alert: result.alert, immediate_check: result.immediate_check };
  } catch (err) {
    console.error('[FineDeal BG] Alert error:', err);
    return { success: false, error: 'Failed to create alert: ' + err.message };
  }
}

async function handleGetSettings() {
  const defaults = {
    notifications: { priceDrops: true, dealAlerts: true, weeklyReport: false },
    sites: {
      'amazon.in': true,
      'flipkart.com': true,
      'croma.com': true,
      'myntra.com': true,
      'snapdeal.com': true,
      'tatacliq.com': false,
      'ajio.com': false,
      'nykaa.com': false,
      'vijaysales.com': false
    },
    autoCompare: true,
    currency: 'INR'
  };

  try {
    const response = await fetch(`${API_BASE}/settings`);
    if (response.ok) {
      const apiData = await response.json();
      const serverSettings = apiData.settings || {};
      // Merge server settings with extension-specific defaults
      const stored = await chrome.storage.local.get('settings');
      return {
        success: true,
        settings: {
          ...defaults,
          ...stored.settings,
          notifications_enabled: serverSettings.notifications_enabled,
          scrape_interval_minutes: serverSettings.scrape_interval_minutes,
          ai_model: serverSettings.ai_model
        }
      };
    }
  } catch (err) {
    console.error('[FineDeal BG] Settings fetch error:', err);
  }

  // Fallback to local storage only
  const stored = await chrome.storage.local.get('settings');
  return { success: true, settings: { ...defaults, ...stored.settings } };
}

async function handleUpdateSettings(data) {
  // Save extension-specific settings locally
  const current = (await chrome.storage.local.get('settings'))?.settings || {};
  const updated = { ...current, ...data };
  await chrome.storage.local.set({ settings: updated });

  // Sync server-relevant settings to the API
  try {
    const serverPayload = {};
    if (data.notifications_enabled !== undefined) serverPayload.notifications_enabled = data.notifications_enabled;
    if (data.scrape_interval_minutes !== undefined) serverPayload.scrape_interval_minutes = data.scrape_interval_minutes;
    if (data.ai_model !== undefined) serverPayload.ai_model = data.ai_model;

    if (Object.keys(serverPayload).length > 0) {
      await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverPayload)
      });
    }
  } catch (err) {
    console.error('[FineDeal BG] Settings sync error:', err);
  }

  return { success: true, settings: updated };
}
