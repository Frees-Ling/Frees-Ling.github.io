// Compatibility entry for the footer. No tracking SDK or advertising consent is enabled.
// A future ad launch requires a real certified CMP; legacy local values are not consent.
window.openPrivacyPreferences = function () {
  var dialog = document.getElementById('fl-privacy-modal');
  if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
    dialog.showModal();
  }
};
