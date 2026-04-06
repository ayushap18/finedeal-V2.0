// FineDeal Content Script — Product detection for supported e-commerce sites

(function () {
  'use strict';

  const SITE_CONFIGS = {
    'amazon.in': {
      name: 'Amazon',
      selectors: {
        title: ['#productTitle', '#title span', '.product-title-word-break'],
        price: [
          // Selling/deal price selectors FIRST (these are the actual price you pay)
          '.priceToPay .a-offscreen',
          '#corePrice_feature_div .priceToPay .a-offscreen',
          '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
          '#priceblock_dealprice',
          '#priceblock_ourprice',
          '#tp_price_block_total_price_ww .a-offscreen',
          '#corePrice_feature_div .a-offscreen',
          // Generic fallbacks LAST (these may match MRP)
          '.a-price:not(.a-text-price) .a-offscreen',
          '.a-price-whole'
        ],
        image: ['#landingImage', '#imgBlkFront', '#main-image-container img'],
        brand: ['#bylineInfo', '.po-brand .po-break-word'],
        category: ['.a-breadcrumb .a-link-normal', '#wayfinding-breadcrumbs_container a']
      },
      isProductPage: () =>
        !!document.querySelector('#productTitle') || !!document.querySelector('#dp-container')
    },
    'flipkart.com': {
      name: 'Flipkart',
      selectors: {
        title: [
          'span[data-testid="product-title"]',
          'h1[data-testid="product-title"]',
          'div[data-testid="product-title"] span',
          '._35KyD6', '.VU-ZEz', '.B_NuCI', 'h1 span', '.KalC6f'
        ],
        price: [
          'div[data-testid="price-display"] div',
          'div[class*="CEmiEU"] div',
          'div[class*="Nx9bqj"]',
          '._30jeq3',
          '._30jeq3._1_WHN1',
          '.CEmiEU div',
          '._16Jk6d',
          '.Nx9bqj._4b5DiR',
          '.Nx9bqj',
          'div[class*="CxhGGd"]'
        ],
        image: [
          'div[data-testid="image-container"] img',
          '._396cs4 img', '._2r_T1I img', '.CXW8mj img', '._396cs4 ._2r_T1I', '.DByuf4 img'
        ],
        brand: ['._2whKao', '.G6XhRU'],
        category: ['._1MR4o5', '._2whKao']
      },
      isProductPage: () =>
        window.location.pathname.includes('/p/') ||
        !!document.querySelector('meta[property="og:type"][content="product"]') ||
        !!document.querySelector('._35KyD6') ||
        !!document.querySelector('.VU-ZEz') ||
        !!document.querySelector('.B_NuCI') ||
        !!document.querySelector('.KalC6f')
    },
    'croma.com': {
      name: 'Croma',
      selectors: {
        title: ['h1.pd-title', '.product-title h1'],
        price: ['.pdp-price', '.new-price'],
        image: ['.product-gallery img', '.pdp-image img'],
        brand: ['.pd-brand', '.brand-name'],
        category: ['.breadcrumb a']
      },
      isProductPage: () =>
        !!document.querySelector('h1.pd-title') || window.location.pathname.includes('/p/')
    },
    'myntra.com': {
      name: 'Myntra',
      selectors: {
        title: ['.pdp-title', '.pdp-name'],
        price: ['.pdp-price strong', '.pdp-discount-container .pdp-price'],
        image: ['.image-grid-image', '.image-grid-imageContainer img'],
        brand: ['.pdp-title .pdp-name', '.pdp-title'],
        category: ['.breadcrumbs-container a']
      },
      isProductPage: () =>
        !!document.querySelector('.pdp-title') || window.location.pathname.includes('/buy/')
    },
    'snapdeal.com': {
      name: 'Snapdeal',
      selectors: {
        title: ['.pdp-e-i-head', 'h1[itemprop="name"]'],
        price: ['.payBlkBig', '.pdp-final-price'],
        image: ['.cloudzoom', '#bx-slider-left-image-panel img'],
        brand: ['.pdp-e-i-brand a', '.brandName'],
        category: ['.breadCrumb a']
      },
      isProductPage: () =>
        !!document.querySelector('.pdp-e-i-head') || window.location.pathname.includes('/product/')
    },
    'tatacliq.com': {
      name: 'Tata CLiQ',
      selectors: {
        title: ['.ProductDetailsMainBlock__title', 'h1.ProductName'],
        price: ['.ProductDetailsMainBlock__price', '.ProductPrice'],
        image: ['.ProductDetailsMainBlock__image img', '.ProductGallery img'],
        brand: ['.ProductDetailsMainBlock__brandName', '.BrandName'],
        category: ['.Breadcrumb a']
      },
      isProductPage: () =>
        !!document.querySelector('.ProductDetailsMainBlock__title') ||
        window.location.pathname.includes('/p-')
    },
    'ajio.com': {
      name: 'AJIO',
      selectors: {
        title: ['.prod-name', 'h1.prod-name'],
        price: ['.prod-sp', '.prod-price'],
        image: ['.zoom-wrap img', '.rilrtl-products-pdp__image img'],
        brand: ['.brand-name', '.prod-brand'],
        category: ['.breadcrumb a']
      },
      isProductPage: () =>
        !!document.querySelector('.prod-name') || window.location.pathname.includes('/p/')
    },
    'nykaa.com': {
      name: 'Nykaa',
      selectors: {
        title: [
          'h1[class*="product-title"]',
          '.product-detail h1',
          'h1.css-1gc4x7i',
          '.product-name h1',
          'h1'
        ],
        price: [
          'span[class*="price"]',
          'div[class*="price-info"] span',
          '.css-1jczs19',
          '.post-card__content-price-offer'
        ],
        image: [
          '.product-images img',
          'div[class*="product-image"] img',
          '.css-gkjhh3 img',
          'img[class*="product"]'
        ],
        brand: [
          'a[class*="brand"]',
          'h1 + a',
          '.css-rfn48a',
          '.product-brand'
        ],
        category: ['.breadcrumb a']
      },
      isProductPage: () =>
        window.location.pathname.includes('/p/') ||
        !!document.querySelector('meta[property="og:type"][content="product"]') ||
        !!document.querySelector('h1.css-1gc4x7i')
    },
    'vijaysales.com': {
      name: 'Vijay Sales',
      selectors: {
        title: ['.product-name h1', '.product-title'],
        price: ['.product-price .price', '.special-price .price'],
        image: ['.product-image img', '.gallery-image img'],
        brand: ['.product-brand', '.brand'],
        category: ['.breadcrumbs a']
      },
      isProductPage: () =>
        !!document.querySelector('.product-name h1') || window.location.pathname.includes('/product/')
    }
  };

  function getCurrentSite() {
    const hostname = window.location.hostname.replace('www.', '');
    for (const [domain, config] of Object.entries(SITE_CONFIGS)) {
      if (hostname.includes(domain)) return { domain, ...config };
    }
    return null;
  }

  function queryFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function extractText(selectors) {
    const el = queryFirst(selectors);
    return el ? el.textContent.trim() : '';
  }

  function extractImage(selectors) {
    const el = queryFirst(selectors);
    if (!el) return '';
    return el.src || el.getAttribute('data-src') || el.getAttribute('data-old-hires') || '';
  }

  function parsePrice(raw) {
    if (!raw) return 0;
    const match = raw.match(/[\d,]+(?:\.\d{1,2})?/);
    if (!match) return 0;
    return parseFloat(match[0].replace(/,/g, '')) || 0;
  }

  function extractWithMeta() {
    const getMeta = (name) => {
      const el =
        document.querySelector(`meta[property="${name}"]`) ||
        document.querySelector(`meta[name="${name}"]`);
      return el ? el.getAttribute('content') : '';
    };

    // Try to find price from ₹ patterns in the page if meta tags don't have it
    let metaPrice = parsePrice(getMeta('og:price:amount') || getMeta('product:price:amount'));
    if (!metaPrice) {
      const bodyText = document.body ? document.body.innerText : '';
      const priceMatch = bodyText.match(/₹\s?([\d,]+(?:\.\d{1,2})?)/);
      if (priceMatch) {
        metaPrice = parsePrice(priceMatch[1]);
      }
    }

    return {
      title: getMeta('og:title') || getMeta('twitter:title') || document.title,
      price: metaPrice,
      image: getMeta('og:image') || getMeta('twitter:image'),
      brand: getMeta('product:brand') || '',
      category: getMeta('product:category') || ''
    };
  }

  function extractAmazonSellingPrice() {
    // Amazon-specific: get the actual selling price, NOT the MRP
    // The selling price is inside .priceToPay or the first .a-price that isn't strikethrough
    const sellingSelectors = [
      '.priceToPay .a-offscreen',
      '#corePrice_feature_div .priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
      '#priceblock_dealprice',
      '#priceblock_ourprice',
      '#tp_price_block_total_price_ww .a-offscreen',
    ];
    for (const sel of sellingSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const p = parsePrice(el.textContent);
        if (p > 0) return p;
      }
    }
    // Fallback: find .a-price elements that are NOT inside .basisPrice (MRP container)
    const allPrices = document.querySelectorAll('.a-price:not(.a-text-price) .a-offscreen');
    for (const el of allPrices) {
      if (el.closest('.basisPrice') || el.closest('.a-text-price')) continue;
      const p = parsePrice(el.textContent);
      if (p > 0) return p;
    }
    return 0;
  }

  function extractProductInfo(siteConfig) {
    const title = extractText(siteConfig.selectors.title);
    const image = extractImage(siteConfig.selectors.image);
    const brand = extractText(siteConfig.selectors.brand);
    const category = extractText(siteConfig.selectors.category);

    // Use Amazon-specific price extraction to avoid picking MRP
    let price = 0;
    const hostname = window.location.hostname.replace('www.', '');
    if (hostname.includes('amazon.in')) {
      price = extractAmazonSellingPrice();
    } else {
      const priceRaw = extractText(siteConfig.selectors.price);
      price = parsePrice(priceRaw);
    }

    if (!title && !price) {
      return extractWithMeta();
    }

    const meta = extractWithMeta();
    return {
      title: title || meta.title,
      price: price || meta.price,
      image: image || meta.image,
      brand: brand || meta.brand,
      category: category || meta.category
    };
  }

  function detectAndSend() {
    const site = getCurrentSite();
    if (!site) return;
    if (!site.isProductPage()) return;

    // Small delay for dynamic content
    setTimeout(() => {
      const product = extractProductInfo(site);
      if (!product.title) return;

      const payload = {
        type: 'PRODUCT_DETECTED',
        data: {
          ...product,
          site: site.name,
          domain: site.domain,
          url: window.location.href
        }
      };

      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[FineDeal] Could not reach background:', chrome.runtime.lastError.message);
        }
      });
    }, 1500);
  }

  // Listen for active detection requests from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DETECT_PRODUCT') {
      const site = getCurrentSite();
      if (site && site.isProductPage()) {
        const product = extractProductInfo(site);
        if (product.title) {
          const data = { ...product, site: site.name, domain: site.domain, url: window.location.href };
          // Also send to background
          chrome.runtime.sendMessage({ type: 'PRODUCT_DETECTED', data });
          sendResponse({ product: data });
          return;
        }
      }
      sendResponse({ product: null });
    }
  });

  // Run on load
  if (document.readyState === 'complete') {
    detectAndSend();
  } else {
    window.addEventListener('load', detectAndSend);
  }

  // Re-detect on SPA navigation
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(detectAndSend, 2000);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
