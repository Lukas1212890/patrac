import { bearingTo } from './navigationMath.js';
import { parseCoordinates } from './externalNavigation.mjs';

// Screen top is the phone's heading, not geographic north.
export function compassTarget(position, target, heading) {
  if (!parseCoordinates(position) || !parseCoordinates(target) || !Number.isFinite(heading)) return null;
  const angle = ((bearingTo(position, target) - heading) % 360 + 360) % 360;
  const radians = angle * Math.PI / 180;
  return { angle, left: 50 + Math.sin(radians) * 43, top: 50 - Math.cos(radians) * 43 };
}
export function nearestAngle(previous, next) {
  return previous + ((next - previous + 180) % 360 + 360) % 360 - 180;
}
export function phoneHeading(event, screenAngle = 0) {
  const heading = Number.isFinite(event.webkitCompassHeading) ? event.webkitCompassHeading
    : event.absolute === true && Number.isFinite(event.alpha) ? 360 - event.alpha : null;
  if (heading === null) return null;
  return ((heading + (Number.isFinite(screenAngle) ? screenAngle : 0)) % 360 + 360) % 360;
}
