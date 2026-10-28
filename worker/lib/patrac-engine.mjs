import { parseCoordinates } from './externalNavigation.mjs';
import { distanceTo } from './navigationMath.js';
export class GameError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
export const normalizeAnswer = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('cs').trim().replace(/\s+/g, ' ');
function text(value, max, name) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new GameError(`Doplňte ${name} (nejvýše ${max} znaků).`);
  return value.trim();
}
export const PENALTY_OPTIONS = [5, 10, 15, 20, 25, 30];
export function validateExpedition(input) {
  const name = text(input.name, 100, 'název výpravy');
  if (!['race', 'treasure'].includes(input.mode)) throw new GameError('Vyberte režim výpravy.');
  if (!Array.isArray(input.stations) || input.stations.length < 1 || input.stations.length > 50) throw new GameError('Výprava musí mít 1 až 50 stanovišť.');
  const stations = input.stations.map((s, index) => {
    const coords = parseCoordinates(s);
    if (!coords) throw new GameError(`Stanoviště ${index + 1}: zadejte platné souřadnice.`);
    const radius = Number(s.radius ?? 25);
    if (!Number.isInteger(radius) || radius < 10 || radius > 100) throw new GameError('Oblast příchodu musí být 10 až 100 metrů.');
    const answers = text(s.answer, 1000, `odpověď u stanoviště ${index + 1}`).split('\n').filter(v => v.trim()).map(normalizeAnswer);
    const hints = Array.isArray(s.hints) ? s.hints.filter(h => h?.content?.trim()).map((h, hi) => {
      if (!['text', 'photo'].includes(h.type)) throw new GameError('Neplatný typ nápovědy.');
      if (h.type === 'text' && h.content.length > 3000) throw new GameError('Textová nápověda je příliš dlouhá.');
      if (h.type === 'photo' && (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(h.content) || h.content.length > 250000)) throw new GameError('Fotografii nápovědy zmenšete pod 180 kB.');
      const minutes = Number(h.minutes ?? 10);
      if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60) throw new GameError('Penalizace musí být 0 až 60 minut.');
      return { id: `h${hi}`, type: h.type, content: h.content, minutes, ...(h.type === 'photo' ? { photoVersion: h.photoVersion === 2 ? 2 : 0, ...(typeof h.photoKey === 'string' ? { photoKey: h.photoKey } : {}) } : {}) };
    }) : [];
    const solutionMinutes = Number(s.solutionMinutes ?? 30);
    if (!PENALTY_OPTIONS.includes(solutionMinutes)) throw new GameError('Penalizace za řešení musí být 5, 10, 15, 20, 25 nebo 30 minut.');
    if (hints.length > 5) throw new GameError('Ke stanovišti lze přidat nejvýše pět nápověd.');
    return { id: `s${index}`, name: text(s.name, 100, `název stanoviště ${index + 1}`), ...coords, radius,
      question: text(s.question, 5000, `hádanku u stanoviště ${index + 1}`), answers, answer: s.answer.trim(), solutionMinutes, hints };
  });
  return { name, mode: input.mode, stations };
}
export function checkArrival(position, station, now) {
  const point = parseCoordinates(position);
  if (!point || !Number.isFinite(position.acc) || position.acc <= 0 || position.acc > Math.min(30, station.radius)) throw new GameError('GPS ještě není dost přesná. Vyčkejte na přesnější polohu.');
  if (!Number.isFinite(position.timestamp) || Math.abs(now - position.timestamp) > 25000) throw new GameError('Poloha je zastaralá. Obnovte GPS.');
  if (distanceTo(point, station) > station.radius) throw new GameError('Ještě nejste v oblasti stanoviště.');
  return true;
}
export function newTeam(id, name, now) { return { id, name, joinedAt: now, index: 0, arrivedAt: null, finishedAt: null, penaltyMs: 0, events: [], lastWrongAt: null }; }
export function applyAction(game, team, action, now) {
  if (game.status !== 'running') throw new GameError('Výprava ještě neběží.', 409);
  if (team.finishedAt) return team;
  if (team.abandonedAt) { if (action.action === 'abandon' && action.confirm === true) return team; throw new GameError('Tento pokus byl ukončený a nelze v něm pokračovat.', 409); }
  if (action.action === 'abandon') {
    if (action.confirm !== true) throw new GameError('Potvrďte trvalé ukončení svého pokusu.');
    return { ...structuredClone(team), abandonedAt: now, events: [...team.events, { type: 'abandon', index: team.index, at: now }] };
  }
  if (action.index !== team.index) throw new GameError('Stanoviště se změnilo. Obnovte průběh.', 409);
  const next = structuredClone(team), station = game.stations[team.index];
  if (action.action === 'arrive') {
    if (next.arrivedAt) return next;
    checkArrival(action.position, station, now); next.arrivedAt = now;
    next.events.push({ type: 'arrive', index: next.index, at: now });
  } else if (action.action === 'hint') {
    if (!next.arrivedAt) throw new GameError('Nápověda se odemkne až na stanovišti.', 403);
    if (game.mode !== 'race') throw new GameError('V honu za pokladem jsou nápovědy vypnuté.', 403);
    const hint = station.hints.find(h => h.id === action.hintId);
    if (!hint) throw new GameError('Nápověda nebyla nalezena.', 404);
    if (!next.events.some(e => e.type === 'hint' && e.index === next.index && e.hintId === hint.id)) {
      next.penaltyMs += hint.minutes * 60000;
      next.events.push({ type: 'hint', index: next.index, hintId: hint.id, hintType: hint.type, penaltyMs: hint.minutes * 60000, at: now });
    }
  } else if (action.action === 'solution') {
    if (!next.arrivedAt) throw new GameError('Řešení se odemkne až na stanovišti.', 403);
    if (game.mode !== 'race') throw new GameError('V honu za pokladem jsou řešení vypnutá.', 403);
    if (!next.events.some(e => e.type === 'solution' && e.index === next.index)) {
      const penaltyMs = (station.solutionMinutes ?? 30) * 60000;
      next.penaltyMs += penaltyMs;
      next.events.push({ type: 'solution', index: next.index, penaltyMs, at: now });
    }
  } else if (action.action === 'answer') {
    if (!next.arrivedAt) throw new GameError('Hádanka se odemkne až po příchodu.', 403);
    if (next.lastWrongAt && now - next.lastWrongAt < 5000) throw new GameError('Před dalším pokusem počkejte 5 sekund.', 429);
    if (!station.answers.includes(normalizeAnswer(action.answer))) { next.lastWrongAt = now; return { ...next, wrongAnswer: true }; }
    next.events.push({ type: 'solve', index: next.index, at: now }); next.index++; next.arrivedAt = null; next.lastWrongAt = null;
    if (next.index === game.stations.length) next.finishedAt = now;
  } else throw new GameError('Neznámá akce.');
  return next;
}
export function score(game, team, now) {
  const startedAt = team.startedAt ?? game.startedAt;
  const elapsed = startedAt ? Math.max(0, (team.finishedAt || team.abandonedAt || now) - startedAt) : 0;
  return { elapsedMs: elapsed, totalMs: elapsed + (game.mode === 'race' ? team.penaltyMs : 0) };
}
export function teamProjection(game, team, now) {
  const station = game.status === 'running' && !team.finishedAt && !team.abandonedAt ? game.stations[team.index] : null;
  return { ...team, ...score(game, team, now), station: station ? {
    id: station.id, name: station.name, lat: station.lat, lng: station.lng, radius: station.radius,
    ...(team.arrivedAt ? { question: station.question, ...(game.mode === 'race' ? { solutionMinutes: station.solutionMinutes ?? 30, ...(team.events.some(e => e.type === 'solution' && e.index === team.index) ? { solution: station.answer.split('\n').find(v => v.trim()).trim() } : {}) } : {}), hints: game.mode === 'race' ? station.hints.map(h => ({
      id: h.id, type: h.type, minutes: h.minutes,
      ...(team.events.some(e => e.type === 'hint' && e.index === team.index && e.hintId === h.id) ? { content: h.content } : {}),
    })) : [] } : {}),
  } : null };
}
export function stationTimings(game, team) {
  return game.stations.slice(0, team.index + (team.arrivedAt ? 1 : 0)).map((station, index) => {
    const arrive = team.events.find(e => e.type === 'arrive' && e.index === index), solve = team.events.find(e => e.type === 'solve' && e.index === index);
    const previous = index === 0 ? (team.startedAt ?? game.startedAt) : team.events.find(e => e.type === 'solve' && e.index === index - 1)?.at;
    return { index, name: station.name, arrivedAt: arrive?.at, solvedAt: solve?.at,
      travelMs: arrive && previous ? arrive.at - previous : null, solveMs: solve && arrive ? solve.at - arrive.at : null,
      hints: team.events.filter(e => e.type === 'hint' && e.index === index), solutions: team.events.filter(e => e.type === 'solution' && e.index === index) };
  });
}
