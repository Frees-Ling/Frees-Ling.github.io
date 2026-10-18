// Google Consent Mode v2 default initialization (Advanced Consent Mode v2)
// Initializes consent state before any Google tags execute.
window.dataLayer = window.dataLayer || [];
function gtag() {
  window.dataLayer.push(arguments);
}
window.gtag = gtag;

var initialConsent = 'denied';
try {
  var stored = localStorage.getItem('fl_consent_v2');
  if (stored === 'granted' || stored === 'denied') {
    initialConsent = stored;
  }
} catch (e) {}

gtag('consent', 'default', {
  analytics_storage: initialConsent,
  ad_storage: initialConsent,
  ad_user_data: initialConsent,
  ad_personalization: initialConsent,
});

window.openPrivacyPreferences = function () {
  var existing = document.getElementById('fl-privacy-modal');
  if (existing) {
    existing.style.display = 'flex';
    return;
  }

  var currentStatus = 'denied';
  try {
    currentStatus = localStorage.getItem('fl_consent_v2') || 'denied';
  } catch (e) {}

  var modal = document.createElement('div');
  modal.id = 'fl-privacy-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '隐私偏好设置');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.right = '0';
  modal.style.bottom = '0';
  modal.style.backgroundColor = 'rgba(0, 0, 0, 0.75)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '99999';
  modal.style.padding = '16px';

  var card = document.createElement('div');
  card.style.maxWidth = '480px';
  card.style.width = '100%';
  card.style.backgroundColor = 'var(--bg, #0b1318)';
  card.style.color = 'var(--ink, #e6edf3)';
  card.style.border = '1px solid var(--line-strong, #30363d)';
  card.style.borderRadius = '8px';
  card.style.padding = '24px';
  card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5)';
  card.style.fontFamily = 'var(--font-sans, system-ui, sans-serif)';

  card.innerHTML =
    '<h3 style="margin-top:0;margin-bottom:12px;font-size:18px;">隐私与 Cookie 偏好设置</h3>' +
    '<p style="font-size:13px;line-height:1.6;color:var(--ink-soft, #8b949e);margin-bottom:16px;">' +
    '本站静态接入 Google 发布商审核代码，并遵循 Google Advanced Consent Mode v2 规范。' +
    '在您未主动同意前，所有非必需 Cookie 和个性化广告存储均保持拒绝状态。您可在此随时更新偏好：' +
    '</p>' +
    '<div style="font-size:12px;margin-bottom:20px;padding:10px;background:rgba(255,255,255,0.04);border-radius:4px;">' +
    '当前状态：<strong id="fl-consent-status-text">' +
    (currentStatus === 'granted'
      ? '已允许分析与广告 Cookie'
      : '已拒绝（默认保护）') +
    '</strong>' +
    '</div>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">' +
    '<button type="button" id="fl-consent-deny" style="padding:8px 14px;border:1px solid var(--line-strong, #444);background:transparent;color:inherit;border-radius:4px;cursor:pointer;font-size:12px;">全部拒绝</button>' +
    '<button type="button" id="fl-consent-accept" style="padding:8px 14px;border:none;background:var(--accent, #1f6feb);color:#fff;border-radius:4px;cursor:pointer;font-size:12px;">全部接受</button>' +
    '<button type="button" id="fl-consent-close" style="padding:8px 14px;border:1px solid transparent;background:transparent;color:var(--ink-soft, #888);cursor:pointer;font-size:12px;">关闭</button>' +
    '</div>';

  modal.appendChild(card);
  document.body.appendChild(modal);

  function closeModal() {
    modal.style.display = 'none';
  }

  document.getElementById('fl-consent-close').onclick = closeModal;
  modal.onclick = function (e) {
    if (e.target === modal) closeModal();
  };

  document.getElementById('fl-consent-accept').onclick = function () {
    try {
      localStorage.setItem('fl_consent_v2', 'granted');
    } catch (e) {}
    gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    });
    document.getElementById('fl-consent-status-text').textContent =
      '已允许分析与广告 Cookie';
    setTimeout(closeModal, 400);
  };

  document.getElementById('fl-consent-deny').onclick = function () {
    try {
      localStorage.setItem('fl_consent_v2', 'denied');
    } catch (e) {}
    gtag('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    document.getElementById('fl-consent-status-text').textContent =
      '已拒绝（默认保护）';
    setTimeout(closeModal, 400);
  };
};
