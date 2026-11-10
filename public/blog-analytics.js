(function () {
  'use strict';

  var STORAGE_KEY = 'fl-blog-analytics-consent-v1';
  var MAX_EXPIRY_MS = 180 * 24 * 60 * 60 * 1000;
  var MAX_TIMEOUT_MS = 2147483647; // 2^31 - 1 (signed 32-bit integer limit)
  var COOKIE_PREFIX = 'fl_blog';

  var scriptEl =
    document.currentScript ||
    document.querySelector('script[data-blog-analytics-script]') ||
    document.querySelector('script[src*="blog-analytics.js"]');
  var dataset = (scriptEl && scriptEl.dataset) || {};
  var isEnabled = dataset.enabled === 'true';
  var isEligible = dataset.eligible === 'true';
  var measurementId = dataset.measurementId || '';
  var isValidId = /^G-[A-Z0-9]+$/.test(measurementId);
  var isExactHost =
    typeof window.location !== 'undefined' &&
    window.location.origin === 'https://frees-ling.dev';

  var isEligibleToLoad = isEnabled && isEligible && isExactHost && isValidId;

  var memoryChoice = null;
  var isStorageBlocked = false;
  var sdkHasEverLoaded = false;
  var sdkIsInitializing = false;
  var sdkLoadFailed = false;
  var expiryTimer = null;

  function safeGetStorage() {
    try {
      if (
        typeof window.localStorage === 'undefined' ||
        window.localStorage === null
      ) {
        isStorageBlocked = true;
        return null;
      }
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      isStorageBlocked = true;
      return null;
    }
  }

  function safeSetStorage(val) {
    try {
      if (
        typeof window.localStorage === 'undefined' ||
        window.localStorage === null
      ) {
        isStorageBlocked = true;
        return false;
      }
      window.localStorage.setItem(STORAGE_KEY, val);
      return true;
    } catch (e) {
      isStorageBlocked = true;
      return false;
    }
  }

  function safeRemoveStorage() {
    try {
      if (
        typeof window.localStorage !== 'undefined' &&
        window.localStorage !== null
      ) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      isStorageBlocked = true;
    }
  }

  function parseConsentRecord(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      if (parsed.choice !== 'granted' && parsed.choice !== 'denied')
        return null;
      if (typeof parsed.expires !== 'number' || !isFinite(parsed.expires))
        return null;

      var now = Date.now();
      if (parsed.expires <= now) return null;
      if (parsed.expires > now + MAX_EXPIRY_MS + 5000) return null;

      return parsed;
    } catch (e) {
      return null;
    }
  }

  function getEffectiveConsent() {
    if (isStorageBlocked && memoryChoice) {
      return parseConsentRecord(JSON.stringify(memoryChoice));
    }
    var raw = safeGetStorage();
    var record = parseConsentRecord(raw);
    if (!record) {
      if (raw && !isStorageBlocked) {
        safeRemoveStorage();
      }
      return isStorageBlocked
        ? parseConsentRecord(JSON.stringify(memoryChoice))
        : null;
    }
    return record;
  }

  function clearOwnCookies() {
    try {
      var rawCookies = document.cookie;
      if (!rawCookies || typeof rawCookies !== 'string') return;
      var pairs = rawCookies.split(';');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].trim();
        var eqIdx = pair.indexOf('=');
        var name = eqIdx > -1 ? pair.slice(0, eqIdx) : pair;
        if (
          /^fl_blog_(ga|gid|gat)(_|$)/.test(name) ||
          (isValidId && name === '_ga_' + measurementId.slice(2))
        ) {
          var deletion =
            name +
            '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax; Secure';
          document.cookie = deletion;
          if (isExactHost)
            document.cookie = deletion + '; Domain=frees-ling.dev';
        }
      }
    } catch (e) {}
  }

  function updateUi(statusKey) {
    var statusEls = document.querySelectorAll('[data-blog-analytics-status]');
    var bannerEls = document.querySelectorAll('[data-blog-analytics-banner]');

    var statusText = '';
    var shouldHideBanner = false;

    if (
      !isEligibleToLoad &&
      statusKey !== 'denied' &&
      statusKey !== 'granted'
    ) {
      statusText = '当前页面不包含访问统计。';
    }

    if (statusKey === 'granted') {
      statusText = isEligibleToLoad
        ? '访问统计已启用（Google Analytics）。'
        : '访问统计偏好已设为允许（当前页面不加载统计）。';
      shouldHideBanner = true;
    } else if (statusKey === 'denied') {
      statusText = '访问统计已停用。';
      shouldHideBanner = true;
    } else if (statusKey === 'error') {
      statusText = '访问统计加载失败。';
      shouldHideBanner = true;
    } else if (statusKey === 'pending') {
      statusText = '正在加载访问统计。';
      shouldHideBanner = true;
    } else {
      if (!statusText) {
        statusText = '访问统计尚未启用。';
      }
      shouldHideBanner = false;
    }

    for (var i = 0; i < statusEls.length; i++) {
      statusEls[i].textContent = statusText;
    }

    for (var j = 0; j < bannerEls.length; j++) {
      if (shouldHideBanner || !isEligibleToLoad) {
        bannerEls[j].hidden = true;
        bannerEls[j].setAttribute('hidden', '');
        bannerEls[j].style.display = 'none';
      } else {
        bannerEls[j].hidden = false;
        bannerEls[j].removeAttribute('hidden');
        bannerEls[j].style.display = '';
      }
    }
  }

  function getSanitizedLocation() {
    try {
      return window.location.origin + window.location.pathname;
    } catch (e) {
      return '';
    }
  }

  function getSanitizedReferrer() {
    try {
      if (!document.referrer) return '';
      var url = new URL(document.referrer);
      return url.origin;
    } catch (e) {
      return '';
    }
  }

  function initializeGtag() {
    if (!isEligibleToLoad) return;
    if (sdkLoadFailed) {
      updateUi('error');
      return;
    }
    if (sdkHasEverLoaded || sdkIsInitializing) return;
    sdkIsInitializing = true;
    window['ga-disable-' + measurementId] = false;
    updateUi('pending');

    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });

    var cleanLocation = getSanitizedLocation();
    var cleanReferrer = getSanitizedReferrer();

    var configuration = {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: 'none',
      cookie_prefix: COOKIE_PREFIX,
      cookie_flags: 'SameSite=Lax;Secure',
      cookie_expires: 180 * 24 * 60 * 60,
      cookie_update: false,
      page_location: cleanLocation,
      page_referrer: cleanReferrer,
    };
    // The SDK can initialize its destination while processing the js command.
    // Establish all privacy defaults before that initialization can happen.
    Object.keys(configuration).forEach(function (key) {
      gtag('set', key, configuration[key]);
    });
    gtag('js', new Date());
    gtag('config', measurementId, configuration);

    gtag('event', 'page_view', {
      page_location: cleanLocation,
      page_referrer: cleanReferrer,
      page_title: document.title,
    });

    var script = document.createElement('script');
    script.async = true;
    script.src =
      'https://www.googletagmanager.com/gtag/js?id=' +
      encodeURIComponent(measurementId);

    script.onerror = function () {
      sdkLoadFailed = true;
      window['ga-disable-' + measurementId] = true;
      var consent = getEffectiveConsent();
      updateUi(consent && consent.choice === 'granted' ? 'error' : 'denied');
    };
    script.onload = function () {
      var consent = getEffectiveConsent();
      if (
        consent &&
        consent.choice === 'granted' &&
        !window['ga-disable-' + measurementId]
      ) {
        updateUi('granted');
      }
    };

    var target = document.head || document.documentElement;
    if (target) {
      target.appendChild(script);
    }
    sdkHasEverLoaded = true;
    sdkIsInitializing = false;
  }

  function scheduleExpiry(expires) {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    var delay = expires - Date.now();
    if (delay <= 0) {
      handleExpiry();
      return;
    }
    var waitTime = Math.min(delay, MAX_TIMEOUT_MS);
    expiryTimer = setTimeout(function () {
      if (Date.now() >= expires) {
        handleExpiry();
      } else {
        scheduleExpiry(expires);
      }
    }, waitTime);
  }

  function handleExpiry() {
    safeRemoveStorage();
    memoryChoice = null;
    if (sdkHasEverLoaded) {
      applyDenial(true);
    } else {
      updateUi('none');
    }
  }

  function applyDenial(shouldReloadIfLoaded) {
    if (isValidId) {
      window['ga-disable-' + measurementId] = true;
    }
    clearOwnCookies();
    updateUi('denied');

    if (shouldReloadIfLoaded && sdkHasEverLoaded) {
      try {
        if (typeof window.location.reload === 'function') {
          window.location.reload();
        }
      } catch (e) {}
    }
  }

  function handleChoice(choice) {
    var now = Date.now();
    var expires = now + MAX_EXPIRY_MS;
    var record = { choice: choice, expires: expires };

    memoryChoice = record;
    safeSetStorage(JSON.stringify(record));

    if (choice === 'granted') {
      scheduleExpiry(expires);
      updateUi('granted');
      if (isEligibleToLoad) {
        initializeGtag();
      }
    } else {
      if (expiryTimer) {
        clearTimeout(expiryTimer);
        expiryTimer = null;
      }
      applyDenial(true);
    }
  }

  function syncState() {
    var consent = getEffectiveConsent();
    if (consent && consent.choice === 'granted') {
      scheduleExpiry(consent.expires);
      updateUi('granted');
      if (isEligibleToLoad) {
        initializeGtag();
      }
    } else if (consent && consent.choice === 'denied') {
      applyDenial(false);
    } else {
      updateUi('none');
    }
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('storage', function (e) {
      if (!e || (e.key !== STORAGE_KEY && e.key !== null)) return;
      memoryChoice = null;
      var record = parseConsentRecord(e.newValue);
      if (record && record.choice === 'granted') {
        scheduleExpiry(record.expires);
        updateUi('granted');
        if (isEligibleToLoad) {
          initializeGtag();
        }
      } else {
        if (expiryTimer) {
          clearTimeout(expiryTimer);
          expiryTimer = null;
        }
        applyDenial(true);
      }
    });
  }

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        var consent = getEffectiveConsent();
        if (!consent || consent.choice !== 'granted') {
          if (sdkHasEverLoaded) {
            applyDenial(true);
          } else {
            updateUi('none');
          }
        }
      }
    });
  }

  function bindButtons() {
    var buttons = document.querySelectorAll('[data-blog-analytics-choice]');
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var choice = btn.getAttribute('data-blog-analytics-choice');
          if (choice === 'granted' || choice === 'denied') {
            handleChoice(choice);
          }
        });
      })(buttons[i]);
    }
  }

  if (
    document.readyState === 'loading' &&
    typeof document.addEventListener === 'function'
  ) {
    document.addEventListener('DOMContentLoaded', function () {
      bindButtons();
      syncState();
    });
  } else {
    bindButtons();
    syncState();
  }
})();
