// Keep browser refresh gestures native; lock installed-app screens that fit one viewport.
export function installHomeGestureLock(scope) {
  const installed = scope.navigator?.standalone === true || scope.matchMedia?.('(display-mode: standalone)').matches || scope.matchMedia?.('(display-mode: fullscreen)').matches;
  if (!installed) return () => {};
  const doc = scope.document;
  doc.documentElement.setAttribute('data-patrac-home-locked', '');
  function preventBackgroundPan(event) {
    if (!event.cancelable || event.touches?.length > 1) return;
    // Dialogs have their own bounded scroll area for many saved games / help text.
    if (event.target?.closest?.('.p-modal')) return;
    event.preventDefault();
  }
  doc.addEventListener('touchmove', preventBackgroundPan, { passive: false });
  return () => {
    doc.removeEventListener('touchmove', preventBackgroundPan);
    doc.documentElement.removeAttribute('data-patrac-home-locked');
  };
}
