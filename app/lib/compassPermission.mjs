// Call directly from a tap: iOS requires transient user activation for this API.
// Do not put the request behind an effect, GPS lookup, timer, or navigation.
export function requestCompassAccess(scope) {
  const orientation = scope.DeviceOrientationEvent;
  if (!orientation) return Promise.resolve('unsupported');
  if (typeof orientation.requestPermission !== 'function') return Promise.resolve('granted');
  try { return Promise.resolve(orientation.requestPermission()).then(result => result === 'granted' ? 'granted' : 'denied', () => 'denied'); }
  catch { return Promise.resolve('denied'); }
}
