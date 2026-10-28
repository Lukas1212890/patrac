export function stripeKeyMatchesMode(key, mode) {
  return (mode === 'test' || mode === 'live') && typeof key === 'string'
    && new RegExp('^(sk|rk)_' + mode + '_[A-Za-z0-9_]+$').test(key);
}
