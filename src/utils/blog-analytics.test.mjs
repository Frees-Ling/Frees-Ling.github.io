import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const SCRIPT_PATH = path.resolve('public/blog-analytics.js');
const scriptSource = fs.readFileSync(SCRIPT_PATH, 'utf8');

function createMockDom({
  dataset = { enabled: 'true', eligible: 'true', measurementId: 'G-005T1QD6Z3' },
  hostname = 'frees-ling.dev',
  origin,
  pathname = '/posts/demo/',
  search = '?utm_source=test&q=secret#heading',
  referrer = 'https://external.example.com/some/path?param=secret#fragment',
  initialStorage = {},
  initialCookies = 'frees-theme=dark; session=abc123xyz',
  storageThrows = false,
  title = 'Demo Post — Frees Ling'
} = {}) {
  const windowListeners = new Map();
  const docListeners = new Map();

  let storageStore = { ...initialStorage };
  const localStorage = {
    getItem(key) {
      if (storageThrows) throw new Error('QuotaExceededError: storage access denied');
      return Object.prototype.hasOwnProperty.call(storageStore, key) ? storageStore[key] : null;
    },
    setItem(key, val) {
      if (storageThrows) throw new Error('QuotaExceededError: storage access denied');
      storageStore[key] = String(val);
    },
    removeItem(key) {
      if (storageThrows) throw new Error('QuotaExceededError: storage access denied');
      delete storageStore[key];
    },
    clear() {
      if (storageThrows) throw new Error('QuotaExceededError: storage access denied');
      storageStore = {};
    }
  };

  const cookieJar = new Map();
  if (initialCookies) {
    for (const part of initialCookies.split(';')) {
      const trimmed = part.trim();
      const idx = trimmed.indexOf('=');
      if (idx > -1) {
        cookieJar.set(trimmed.slice(0, idx), trimmed.slice(idx + 1));
      }
    }
  }

  const appendedScripts = [];
  let reloadCount = 0;

  function makeElement(tag, attrs = {}) {
    const el = {
      tagName: tag.toUpperCase(),
      attributes: { ...attrs },
      dataset: {},
      listeners: new Map(),
      hidden: false,
      style: {},
      textContent: '',
      getAttribute(name) {
        return this.attributes[name] || null;
      },
      setAttribute(name, val) {
        this.attributes[name] = String(val);
      },
      removeAttribute(name) {
        delete this.attributes[name];
      },
      addEventListener(evt, fn) {
        if (!this.listeners.has(evt)) this.listeners.set(evt, []);
        this.listeners.get(evt).push(fn);
      },
      click() {
        const fns = this.listeners.get('click') || [];
        for (const fn of fns) fn.call(this, { type: 'click' });
      }
    };
    return el;
  }

  const statusEl = makeElement('p', { 'data-blog-analytics-status': '' });
  statusEl.textContent = '访问统计尚未启用。';

  const grantBtn = makeElement('button', { 'data-blog-analytics-choice': 'granted' });
  const denyBtn = makeElement('button', { 'data-blog-analytics-choice': 'denied' });
  const bannerEl = makeElement('section', { 'data-blog-analytics-banner': '' });

  const currentScriptEl = makeElement('script', {
    src: '/blog-analytics.js',
    'data-enabled': dataset.enabled,
    'data-eligible': dataset.eligible,
    'data-measurement-id': dataset.measurementId
  });
  currentScriptEl.dataset = { ...dataset };

  const head = {
    appendChild(child) {
      if (child.tagName === 'SCRIPT') {
        appendedScripts.push(child);
      }
    }
  };

  const context = {
    Date,
    Math,
    JSON,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    isFinite,
    setTimeout: (fn, delay) => {
      const t = setTimeout(fn, delay);
      if (t && typeof t.unref === 'function') t.unref();
      return t;
    },
    clearTimeout,
    window: null,
    document: null
  };

  const location = {
    hostname,
    origin: origin || `https://${hostname}`,
    pathname,
    search,
    hash: search.includes('#') ? search.slice(search.indexOf('#')) : '',
    reload() {
      reloadCount++;
    }
  };

  const doc = {
    readyState: 'complete',
    currentScript: currentScriptEl,
    title,
    referrer,
    visibilityState: 'visible',
    head,
    documentElement: head,
    get cookie() {
      const parts = [];
      for (const [k, v] of cookieJar.entries()) {
        parts.push(`${k}=${v}`);
      }
      return parts.join('; ');
    },
    set cookie(raw) {
      const [nameVal, ...params] = raw.split(';');
      const idx = nameVal.indexOf('=');
      const name = idx > -1 ? nameVal.slice(0, idx).trim() : nameVal.trim();
      const val = idx > -1 ? nameVal.slice(idx + 1).trim() : '';

      const isExpired = params.some((p) => {
        const lower = p.trim().toLowerCase();
        return lower.startsWith('expires=') && lower.includes('1970');
      });

      if (isExpired) {
        cookieJar.delete(name);
      } else {
        cookieJar.set(name, val);
      }
    },
    addEventListener(evt, fn) {
      if (!docListeners.has(evt)) docListeners.set(evt, []);
      docListeners.get(evt).push(fn);
    },
    querySelectorAll(selector) {
      if (selector === '[data-blog-analytics-status]') return [statusEl];
      if (selector === '[data-blog-analytics-banner]') return [bannerEl];
      if (selector === '[data-blog-analytics-choice]') return [grantBtn, denyBtn];
      return [];
    },
    querySelector(selector) {
      if (selector === '[data-blog-analytics-status]') return statusEl;
      if (selector === '[data-blog-analytics-banner]') return bannerEl;
      if (selector.includes('blog-analytics.js')) return currentScriptEl;
      return null;
    },
    createElement(tag) {
      return makeElement(tag);
    }
  };

  const win = {
    location,
    localStorage,
    dataLayer: undefined,
    addEventListener(evt, fn) {
      if (!windowListeners.has(evt)) windowListeners.set(evt, []);
      windowListeners.get(evt).push(fn);
    },
    triggerStorage(key, newValue) {
      if (key === null) storageStore = {};
      else if (newValue === null) delete storageStore[key];
      else storageStore[key] = newValue;
      const fns = windowListeners.get('storage') || [];
      for (const fn of fns) {
        fn({ key, newValue });
      }
    },
    triggerVisibility(state) {
      doc.visibilityState = state;
      const fns = docListeners.get('visibilitychange') || [];
      for (const fn of fns) fn();
    }
  };

  context.window = win;
  context.document = doc;
  vm.createContext(context);

  function run() {
    vm.runInContext(scriptSource, context);
  }

  return {
    context,
    win,
    doc,
    statusEl,
    grantBtn,
    denyBtn,
    bannerEl,
    appendedScripts,
    cookieJar,
    getReloadCount: () => reloadCount,
    run
  };
}

test('1. No consent, legacy keys, disabled, preview or ineligible page loads zero scripts', () => {
  // Case A: Fresh page without consent
  {
    const mock = createMockDom();
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'No script should load without consent');
    assert.equal(mock.win.dataLayer, undefined, 'dataLayer must not be initialized');
    assert.equal(mock.bannerEl.hidden, false, 'Banner should be visible for undecided user');
    assert.equal(mock.statusEl.textContent, '访问统计尚未启用。');
  }

  // Case B: Legacy key in storage (e.g. "google-consent": "granted" or legacy string)
  {
    const mock = createMockDom({
      initialStorage: {
        'google-consent': 'granted',
        'fl-blog-consent': 'true',
        'fl-blog-analytics-consent-v1': 'granted' // plain string is invalid JSON
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Legacy or invalid consent must not load scripts');
    assert.equal(mock.win.dataLayer, undefined);
  }

  // Case C: Enabled is false
  {
    const mock = createMockDom({
      dataset: { enabled: 'false', eligible: 'true', measurementId: 'G-005T1QD6Z3' },
      initialStorage: {
        'fl-blog-analytics-consent-v1': JSON.stringify({
          choice: 'granted',
          expires: Date.now() + 86400000
        })
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Disabled page must never load SDK');
  }

  // Case D: Ineligible page (e.g. /privacy or /search)
  {
    const mock = createMockDom({
      dataset: { enabled: 'true', eligible: 'false', measurementId: 'G-005T1QD6Z3' },
      initialStorage: {
        'fl-blog-analytics-consent-v1': JSON.stringify({
          choice: 'granted',
          expires: Date.now() + 86400000
        })
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Ineligible page must never load SDK even with stored consent');
  }

  // Case E: Wrong hostname (preview / local host)
  {
    const mock = createMockDom({
      hostname: 'localhost',
      initialStorage: {
        'fl-blog-analytics-consent-v1': JSON.stringify({
          choice: 'granted',
          expires: Date.now() + 86400000
        })
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Non-production hostname must not load official SDK');
  }

  // Case F: Invalid measurement ID pattern
  {
    const mock = createMockDom({
      dataset: { enabled: 'true', eligible: 'true', measurementId: 'UA-123456-1' },
      initialStorage: {
        'fl-blog-analytics-consent-v1': JSON.stringify({
          choice: 'granted',
          expires: Date.now() + 86400000
        })
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Invalid ID pattern must be rejected');
  }
});

test('2. Grant request dedupes SDK and sanitizes URL and referrer fields', () => {
  const mock = createMockDom({
    pathname: '/posts/transformer/',
    search: '?token=secret&fbclid=xyz#section-2',
    referrer: 'https://search.engine.com/search?q=frees+ling#top'
  });
  mock.run();

  // Click grant
  mock.grantBtn.click();
  assert.equal(mock.appendedScripts.length, 1, 'Exactly one script tag appended');
  assert.ok(mock.appendedScripts[0].src.includes('id=G-005T1QD6Z3'));
  assert.equal(mock.bannerEl.hidden, true, 'Banner must hide after choice');
  assert.equal(mock.statusEl.textContent, '正在加载访问统计。');
  mock.appendedScripts[0].onload();
  assert.ok(mock.statusEl.textContent.includes('已启用'));

  // Inspect dataLayer commands
  const dl = mock.win.dataLayer;
  assert.ok(Array.isArray(dl), 'dataLayer must be initialized');

  // Check consent command
  const consentCall = dl.find((args) => args[0] === 'consent');
  assert.ok(consentCall, 'gtag consent must be called');
  assert.equal(consentCall[1], 'default');
  assert.equal(consentCall[2].ad_storage, 'denied');
  assert.equal(consentCall[2].ad_user_data, 'denied');
  assert.equal(consentCall[2].ad_personalization, 'denied');
  assert.equal(consentCall[2].analytics_storage, 'denied');
  const updateCall = dl.find((args) => args[0] === 'consent' && args[1] === 'update');
  assert.equal(updateCall[2].analytics_storage, 'granted');
  assert.ok(dl.indexOf(consentCall) < dl.indexOf(updateCall));
  assert.ok(dl.findIndex((args) => args[0] === 'js') < dl.findIndex((args) => args[0] === 'config'));

  // Check set command for URL sanitization
  const setCall = dl.find((args) => args[0] === 'set');
  assert.ok(setCall, 'gtag set must be called for global URL sanitization');
  assert.equal(setCall[1].page_location, 'https://frees-ling.dev/posts/transformer/');
  assert.equal(setCall[1].page_referrer, 'https://search.engine.com');

  // Check config command
  const configCall = dl.find((args) => args[0] === 'config');
  assert.ok(configCall, 'gtag config must be called');
  assert.equal(configCall[1], 'G-005T1QD6Z3');
  assert.equal(configCall[2].send_page_view, false);
  assert.equal(configCall[2].allow_google_signals, false);
  assert.equal(configCall[2].allow_ad_personalization_signals, false);
  assert.equal(configCall[2].cookie_prefix, 'fl_blog');
  assert.equal(configCall[2].cookie_flags, 'SameSite=Lax;Secure');
  assert.equal(configCall[2].page_location, 'https://frees-ling.dev/posts/transformer/');
  assert.equal(configCall[2].page_referrer, 'https://search.engine.com');

  // Check page_view event
  const pageViewCalls = dl.filter((args) => args[0] === 'event' && args[1] === 'page_view');
  assert.equal(pageViewCalls.length, 1, 'Exactly one page_view event must be sent');
  assert.equal(pageViewCalls[0][2].page_location, 'https://frees-ling.dev/posts/transformer/');
  assert.equal(pageViewCalls[0][2].page_referrer, 'https://search.engine.com');
  assert.equal(pageViewCalls[0][2].page_title, 'Demo Post — Frees Ling');

  // Click grant again to test deduplication
  mock.grantBtn.click();
  assert.equal(mock.appendedScripts.length, 1, 'Repeated grant must not append duplicate script');
  const pageViewsAfter = dl.filter((args) => args[0] === 'event' && args[1] === 'page_view');
  assert.equal(pageViewsAfter.length, 1, 'Repeated grant must not send duplicate page_view');
});

test('3. Refusal and withdrawal: ga-disable set, only own fl_blog cookies cleared, reload only if SDK loaded', () => {
  // Scenario A: First refusal (SDK never loaded) -> must NOT reload
  {
    const mock = createMockDom({
      initialCookies: 'frees-theme=light; fl_blog_ga=GA1.1.123; other_cookie=val'
    });
    mock.run();

    mock.denyBtn.click();
    assert.equal(mock.getReloadCount(), 0, 'Initial refusal must NOT trigger reload');
    assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], true, 'ga-disable must be set');
    assert.equal(mock.cookieJar.has('fl_blog_ga'), false, 'Own fl_blog cookies must be cleared');
    assert.equal(mock.cookieJar.get('frees-theme'), 'light', 'Unrelated cookies must be preserved');
    assert.equal(mock.cookieJar.get('other_cookie'), 'val', 'Unrelated cookies must be preserved');
  }

  // Scenario B: Withdrawal after SDK was loaded -> MUST reload to eliminate callbacks
  {
    const mock = createMockDom({
      initialCookies: 'frees-theme=light; fl_blog_ga=GA1.1.123'
    });
    mock.run();

    // Grant first
    mock.grantBtn.click();
    assert.equal(mock.appendedScripts.length, 1);
    assert.equal(mock.getReloadCount(), 0);

    // Add cookie created by analytics
    mock.cookieJar.set('fl_blog_gid', 'GID1.1.456');

    // Now withdraw/deny
    mock.denyBtn.click();
    assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], true);
    assert.equal(mock.cookieJar.has('fl_blog_ga'), false);
    assert.equal(mock.cookieJar.has('fl_blog_gid'), false);
    assert.equal(mock.cookieJar.get('frees-theme'), 'light');
    assert.equal(mock.getReloadCount(), 1, 'Withdrawal after SDK loaded MUST reload document');
  }
});

test('4. Cross-tab denial via storage event triggers withdrawal and reload', () => {
  const mock = createMockDom({
    initialStorage: {
      'fl-blog-analytics-consent-v1': JSON.stringify({
        choice: 'granted',
        expires: Date.now() + 86400000
      })
    },
    initialCookies: 'fl_blog_ga_test=1; fl_blog_preferences=keep; user_theme=dark'
  });
  mock.run();

  assert.equal(mock.appendedScripts.length, 1, 'Pre-granted consent loads SDK');
  assert.equal(mock.getReloadCount(), 0);

  // Another tab changes consent to denied
  mock.win.triggerStorage(
    'fl-blog-analytics-consent-v1',
    JSON.stringify({ choice: 'denied', expires: Date.now() + 86400000 })
  );

  assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], true, 'ga-disable must be set on cross-tab denial');
  assert.equal(mock.cookieJar.has('fl_blog_ga_test'), false, 'Own cookie must be cleared on cross-tab denial');
  assert.equal(mock.cookieJar.get('fl_blog_preferences'), 'keep', 'Non-analytics prefix neighbor must survive');
  assert.equal(mock.cookieJar.get('user_theme'), 'dark', 'Unrelated cookie preserved');
  assert.equal(mock.getReloadCount(), 1, 'Cross-tab denial must reload page if SDK was running');
});

test('5. Invalid, expired, and future (>180d) expiry handling', () => {
  // Case A: Expired timestamp
  {
    const mock = createMockDom({
      initialStorage: {
        'fl-blog-analytics-consent-v1': JSON.stringify({
          choice: 'granted',
          expires: Date.now() - 1000 // 1 second ago
        })
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Expired consent must not load scripts');
  }

  // Case B: Future expiry beyond 180 days (e.g. 200 days)
  {
    const mock = createMockDom({
      initialStorage: {
        'fl-blog-analytics-consent-v1': JSON.stringify({
          choice: 'granted',
          expires: Date.now() + 200 * 24 * 60 * 60 * 1000
        })
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Expiry exceeding 180 days must be rejected');
  }

  // Case C: Malformed JSON
  {
    const mock = createMockDom({
      initialStorage: {
        'fl-blog-analytics-consent-v1': '{choice: granted}'
      }
    });
    mock.run();
    assert.equal(mock.appendedScripts.length, 0, 'Malformed JSON must be rejected');
  }
});

test('6. Blocked storage allows explicit in-memory choice without crashing or auto-consent', () => {
  const mock = createMockDom({
    storageThrows: true
  });
  mock.run();

  assert.equal(mock.appendedScripts.length, 0, 'Must not auto-consent when storage throws');
  assert.equal(mock.statusEl.textContent, '访问统计尚未启用。');

  // User explicitly clicks grant in-memory
  mock.grantBtn.click();
  assert.equal(mock.appendedScripts.length, 1, 'In-memory grant functions when storage is blocked');
  assert.equal(mock.bannerEl.hidden, true);
});

test('7. SDK load failure triggers error status in UI without relaxing consent', () => {
  const mock = createMockDom();
  mock.run();

  mock.grantBtn.click();
  assert.equal(mock.appendedScripts.length, 1);
  const scriptTag = mock.appendedScripts[0];

  // Simulate network failure
  scriptTag.onerror();
  assert.equal(mock.statusEl.textContent, '访问统计加载失败。', 'UI should report failure');

  // Verify consent was not relaxed to ads or auto-approval
  const dl = mock.win.dataLayer;
  const consentCall = dl.find((args) => args[0] === 'consent');
  assert.equal(consentCall[2].ad_storage, 'denied');
  assert.equal(consentCall[2].ad_personalization, 'denied');
});

test('Refusing first does not prevent a later explicit grant', () => {
  const mock = createMockDom();
  mock.run();
  mock.denyBtn.click();
  assert.equal(mock.appendedScripts.length, 0);
  mock.grantBtn.click();
  assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], false);
  assert.equal(mock.appendedScripts.length, 1);
  mock.grantBtn.click();
  assert.equal(mock.appendedScripts.length, 1);
  assert.equal(mock.win.dataLayer.filter((args) => args[0] === 'event' && args[1] === 'page_view').length, 1);
});

test('Only the exact HTTPS production origin may load analytics or show a banner', () => {
  for (const origin of ['http://frees-ling.dev', 'https://frees-ling.dev:8443', 'https://frees-ling.dev.example.org']) {
    const mock = createMockDom({ origin });
    mock.run();
    assert.equal(mock.bannerEl.hidden, true);
    mock.grantBtn.click();
    assert.equal(mock.appendedScripts.length, 0);
  }
});

test('Clearing storage in another tab stops an active SDK', () => {
  const mock = createMockDom();
  mock.run();
  mock.grantBtn.click();
  mock.win.triggerStorage(null, null);
  assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], true);
  assert.equal(mock.getReloadCount(), 1);
});

test('Returning to a tab rechecks a denied preference even if its storage event was missed', () => {
  const mock = createMockDom();
  mock.run();
  mock.grantBtn.click();
  mock.win.localStorage.setItem('fl-blog-analytics-consent-v1', JSON.stringify({ choice: 'denied', expires: Date.now() + 86400000 }));
  mock.win.triggerVisibility('visible');
  assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], true);
  assert.equal(mock.getReloadCount(), 1);
});

test('Blocked-storage consent expires, and long timers are clamped and rescheduled', () => {
  const mock = createMockDom({ storageThrows: true });
  let now = Date.now();
  const scheduled = [];
  mock.context.Date = class extends Date { static now() { return now; } };
  mock.context.setTimeout = (fn, delay) => { scheduled.push({ fn, delay }); return scheduled.length; };
  mock.context.clearTimeout = () => {};
  mock.run();
  mock.grantBtn.click();
  assert.equal(scheduled[0].delay, 2147483647);
  now += 2147483647;
  scheduled[0].fn();
  assert.equal(scheduled[1].delay, 2147483647);
  assert.equal(mock.getReloadCount(), 0);
  now += 180 * 86400000;
  mock.win.triggerVisibility('visible');
  assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], true);
  assert.equal(mock.getReloadCount(), 1);
});

test('SDK failure stays visible on repeated grant; a stale load callback cannot undo withdrawal', () => {
  const mock = createMockDom();
  mock.run();
  mock.grantBtn.click();
  mock.appendedScripts[0].onerror();
  mock.grantBtn.click();
  assert.equal(mock.statusEl.textContent, '访问统计加载失败。');
  assert.equal(mock.appendedScripts.length, 1);
  mock.denyBtn.click();
  mock.appendedScripts[0].onload();
  assert.equal(mock.statusEl.textContent, '访问统计已停用。');
  assert.equal(mock.win['ga-disable-G-005T1QD6Z3'], true);
});
