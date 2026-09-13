/* Race Desk — parameterized AECAR scoring engine, adapted from Lleida 2026. No network, DOM, timers or external packages. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RaceDeskEngine = api; root.LleidaEngine = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(\+?40\)|\(jun\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const clone = value => JSON.parse(JSON.stringify(value));
  function pointsFor(place, scale) {
    if (!Number.isInteger(place) || place < 1) throw new Error('El puesto debe ser un entero positivo.');
    return place <= 90 ? scale[place - 1] : 1;
  }
  function bonusFor(count, table = [0, 0, 50, 100, 150]) { return (Array.isArray(table) ? table : [0,0,50,100,150])[count] ?? 0; }
  function createState(seed) {
    return {
      schemaVersion: 1, eventId: seed.eventId || 'lleida-2026', categoryId: seed.categoryId || 'GT', mode: 'live', reviewed: false, updatedAt: null,
      pilots: seed.pilots.map(p => ({ ...clone(p), active: p.originalToday, position: '',
        qualifying: true, noClassification: false, pointsOverride: '', custom: false }))
    };
  }
  function resultFor(pilot, position, eligibility, scale, rules = {}) {
    const keepCount = rules.countedResults ?? 3;
    const races = pilot.history.map((pos, round) => ({ round, position: pos, points: pos == null ? 0 : pointsFor(pos, scale), participated: pos != null }));
    const credit = pilot.active && pilot.qualifying && eligibility === 'yes';
    let points = credit && position != null && !pilot.noClassification ? pointsFor(position, scale) : 0;
    if (credit && !pilot.noClassification && pilot.pointsOverride !== '') points = Number(pilot.pointsOverride);
    races.push({ round: pilot.history.length, position: points > 0 ? position : null, points, participated: credit });
    const ordered = [...races].sort((a, b) => b.points - a.points || (a.position ?? 1e9) - (b.position ?? 1e9) || a.round - b.round);
    const kept = ordered.slice(0, keepCount), discard = ordered[keepCount];
    const participations = races.filter(r => r.participated).length;
    const bonus = bonusFor(participations, rules.bonusByAttendance);
    const total = kept.reduce((s, r) => s + r.points, 0) + bonus;
    const key = [total, ...[1, 2, 3].map(n => kept.filter(r => r.position === n && r.points > 0).length), discard.points, discard.position == null ? -1000000 : -discard.position];
    return { id: pilot.id, name: pilot.name, shortName: pilot.shortName, races, kept, discard, participations, bonus, total, key, todayPoints: points, rawPosition: pilot.active && !pilot.noClassification ? position : null, eligibility };
  }
  // Negative means A ahead of B; names are NEVER a sporting tie-break.
  function primaryCompare(a, b) {
    for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] > b.key[i] ? -1 : 1;
    return 0;
  }
  function compareDetailed(a, b) {
    const labels = ['puntos totales', 'más victorias puntuables', 'más segundos puntuables', 'más terceros puntuables', 'mejor descarte', 'mejor puesto descartado'];
    for (let i = 0; i < a.key.length; i++) {
      if (a.key[i] !== b.key[i]) return { order: a.key[i] > b.key[i] ? -1 : 1, reason: labels[i] };
    }
    for (let round = Math.min(a.races.length,b.races.length)-1; round >= 0; round--) {
      const pa = a.races[round].position, pb = b.races[round].position;
      if (pa != null && pb != null) return { order: Math.sign(pa - pb), reason: `última carrera común: C${round + 1}` };
    }
    return { order: 0, reason: 'ex aequo: sin criterio que rompa el empate' };
  }
  function rankComplete(results) {
    const sorted = [...results].sort(primaryCompare);
    const output = [];
    for (let i = 0; i < sorted.length;) {
      let end = i + 1;
      while (end < sorted.length && primaryCompare(sorted[i], sorted[end]) === 0) end++;
      const group = sorted.slice(i, end);
      let common = -1;
      for (let r = group[0].races.length-1; r >= 0; r--) if (group.every(s => s.races[r].position != null)) { common = r; break; }
      // A multiway group without a shared race is not sorted using a non-transitive pairwise comparator.
      const review = group.length > 2 && common < 0 && group.some(a => group.some(b => compareDetailed(a, b).order !== 0));
      if (common >= 0) group.sort((a, b) => a.races[common].position - b.races[common].position);
      let local = 0;
      for (let j = 0; j < group.length; j++) {
        if (j > 0 && common >= 0 && group[j].races[common].position !== group[j-1].races[common].position) local = j;
        const tied = group.filter(s => common < 0 || s.races[common].position === group[j].races[common].position).length;
        output.push({ ...group[j], rank: i + local + 1, tieSize: tied, tieReview: review,
          tieReason: review ? 'Empate múltiple: revisar con AECAR; no se inventa un orden.' : group.length > 1 ? common >= 0 ? `Última carrera común: C${common+1}` : 'Ex aequo' : '' });
      }
      i = end;
    }
    return output;
  }
  function parsePosition(raw) {
    if (raw === '') return null;
    return /^\d+$/.test(raw) ? Number(raw) : NaN;
  }
  function validate(state) {
    const errors = [], seen = new Map();
    const active = state.pilots.filter(p => p.active);
    const rankedCount = active.filter(p => !p.noClassification).length;
    for (const p of active) {
      if (p.noClassification) continue;
      const pos = parsePosition(p.position);
      if (p.position !== '' && (!Number.isInteger(pos) || pos < 1 || pos > rankedCount)) {
        errors.push({ ids: [p.id], message: `${p.shortName}: introduce un puesto de 1 a ${rankedCount}. Si falta un piloto, añádelo a la lista.` });
      } else if (pos != null) {
        if (seen.has(pos)) errors.push({ ids: [p.id, seen.get(pos).id], message: `Puesto ${pos} repetido: ${seen.get(pos).shortName} y ${p.shortName}.` });
        else seen.set(pos, p);
      }
      if (p.pointsOverride !== '' && (!/^\d+$/.test(p.pointsOverride) || Number(p.pointsOverride) > 640)) errors.push({ ids: [p.id], message: `${p.shortName}: los puntos oficiales deben ser un entero de 0 a 640.` });
    }
    return { errors, rankedCount, activeCount: active.length, assigned: seen.size };
  }
  // Exact rank bounds for a partial grid. Binary assignment costs are solved by
  // maximum bipartite matching: every missing driver must occupy a DIFFERENT slot.
  // No factorial enumeration or assumptions about the unknown order are used.
  function maximumMatching(edges, size) {
    const owner = Array(size).fill(-1);
    function visit(row, seen) {
      for (const col of edges[row]) {
        if (seen[col]) continue;
        seen[col] = true;
        if (owner[col] < 0 || visit(owner[col], seen)) { owner[col] = row; return true; }
      }
      return false;
    }
    let matched = 0;
    for (let row=0; row<edges.length; row++) if (visit(row, Array(size).fill(false))) matched++;
    return matched;
  }
  function refineAllocationBounds(bundles, available) {
    const variable = b => b.pilot.active && !b.pilot.noClassification && b.pilot.position === '';
    const byPosition = new Map(bundles.map(b => {
      const m = new Map();
      for (const v of b.variants) { const key=v.rawPosition; if (!m.has(key)) m.set(key,[]); m.get(key).push(v); }
      return [b.pilot.id,m];
    }));
    for (const target of bundles) {
      let best=Infinity, worst=-Infinity;
      for (const own of target.variants) {
        const slots=available.filter(s => !variable(target) || s!==own.rawPosition);
        const changing=bundles.filter(b => b!==target && variable(b));
        const fixed=bundles.filter(b => b!==target && !variable(b));
        let minFixed=0,maxFixed=0;
        for (const peer of fixed) {
          const ahead=peer.variants.map(v=>compareDetailed(v,own).order<0);
          if(ahead.every(Boolean)) minFixed++;
          if(ahead.some(Boolean)) maxFixed++;
        }
        const notAhead=[],canAhead=[];
        for (const peer of changing) {
          const no=[],yes=[];
          slots.forEach((slot,col)=>{
            const vars=byPosition.get(peer.pilot.id).get(slot) || [];
            if(!vars.length) throw new Error('No existe una asignación válida de puestos.');
            const ahead=vars.map(v=>compareDetailed(v,own).order<0);
            if(ahead.some(v=>!v))no.push(col);
            if(ahead.some(Boolean))yes.push(col);
          });
          notAhead.push(no);canAhead.push(yes);
        }
        if(changing.length!==slots.length) throw new Error('Parrilla parcial inconsistente.');
        const lo=1+minFixed+changing.length-maximumMatching(notAhead,slots.length);
        const hi=1+maxFixed+maximumMatching(canAhead,slots.length);
        best=Math.min(best,lo);worst=Math.max(worst,hi);
      }
      target.rankMin=best;target.rankMax=worst;
    }
  }
  function calculate(seed, state) {
    const check = validate(state);
    if (check.errors.length) return { valid: false, ...check, rows: [], podium: [], complete: false, finalReady: false };
    const used = new Set(state.pilots.filter(p => p.active && !p.noClassification && p.position !== '').map(p => Number(p.position)));
    const available = Array.from({ length: check.rankedCount }, (_, i) => i + 1).filter(n => !used.has(n));
    const missing = state.pilots.filter(p => p.active && !p.noClassification && p.position === '');
    const eligibilityPending = state.pilots.filter(p => p.active && p.qualifying && p.eligible === 'unknown');
    const bundles = state.pilots.map(p => {
      const positions = !p.active || p.noClassification ? [null] : p.position !== '' ? [Number(p.position)] : available;
      const eligibilities = p.active && p.eligible === 'unknown' && p.qualifying ? ['no', 'yes'] : [p.eligible];
      const variants = positions.flatMap(pos => eligibilities.map(e => resultFor(p, pos, e, seed.points, seed.rules)));
      // Keep exact physical places in variants: different drivers cannot occupy the same slot.
      return { pilot: p, variants, min: Math.min(...variants.map(v => v.total)), max: Math.max(...variants.map(v => v.total)), rankMin: 1, rankMax: 1 };
    });
    const complete = missing.length === 0 && eligibilityPending.length === 0;
    let rows, tieReview = false;
    if (complete) {
      const ranked = rankComplete(bundles.map(b => b.variants[0]));
      rows = ranked.map(s => ({ ...bundles.find(b => b.pilot.id === s.id), rankMin: s.rank, rankMax: s.rank, exact: s, tieSize: s.tieSize, tieReason: s.tieReason }));
      tieReview = ranked.some(s => s.tieReview);
    } else {
      // Pairwise bounds are conservative: extremes need not be simultaneously attainable.
      for (let i = 0; i < bundles.length; i++) for (let j = i + 1; j < bundles.length; j++) {
        const a = bundles[i], b = bundles[j];
        if (a.min > b.max) { b.rankMin++; b.rankMax++; continue; }
        if (b.min > a.max) { a.rankMin++; a.rankMax++; continue; }
        let aAlways = true, bAlways = true, aSome = false, bSome = false, validPairs = 0;
        for (const av of a.variants) for (const bv of b.variants) {
          if (av.rawPosition != null && av.rawPosition === bv.rawPosition) continue;
          validPairs++;
          const order = compareDetailed(av, bv).order;
          if (order >= 0) aAlways = false;
          if (order <= 0) bAlways = false;
          if (order < 0) aSome = true;
          if (order > 0) bSome = true;
        }
        if (validPairs) {
          if (aAlways) b.rankMin++;
          if (aSome) b.rankMax++;
          if (bAlways) a.rankMin++;
          if (bSome) a.rankMax++;
        }
      }
      if (seed.rules?.exactPartialLimit && check.activeCount <= seed.rules.exactPartialLimit) refineAllocationBounds(bundles, available);
      rows = bundles.map(b => ({ ...b, exact: b.variants.length === 1 ? b.variants[0] : null, tieSize: 1, tieReason: '' }))
        .sort((a, b) => a.rankMin - b.rankMin || b.min - a.min || b.max - a.max || (a.pilot.baselineRank ?? 999) - (b.pilot.baselineRank ?? 999));
    }
    // Human-readable tie details for the common, unambiguous two-pilot case, even with lower rows pending.
    for (const a of rows) if (a.exact) {
      const peers = rows.filter(b => b !== a && b.exact && b.exact.total === a.exact.total);
      if (peers.length === 1) {
        const d = compareDetailed(a.exact, peers[0].exact);
        a.tieReason = `${d.order < 0 ? 'Delante de' : d.order > 0 ? 'Detrás de' : 'Empata con'} ${peers[0].pilot.shortName}: ${d.reason}.`;
      }
    }
    const podium = [1, 2, 3, 4].map(rank => {
      const certain = rows.filter(r => r.rankMin === rank && r.rankMax === rank);
      return { rank, certain, candidates: rows.filter(r => r.rankMin <= rank && r.rankMax >= rank) };
    });
    return { valid: true, ...check, rows, podium, missing: missing.map(p => p.id), eligibilityPending: eligibilityPending.map(p => p.id), complete, tieReview, finalReady: complete && !tieReview, available };
  }
  function parseQuick(text, pilots) {
    const lines = String(text).split(/[\n;,]+/).map(s => s.trim()).filter(Boolean);
    const changes = [], errors = [], seen = new Set();
    for (const line of lines) {
      const match = line.match(/^(.+?)\s*(?:[:=]|\s)\s*(\d+)\s*[ºª°]?$/);
      if (!match) { errors.push(`No entiendo «${line}». Usa, por ejemplo, Cristian 4.`); continue; }
      const query = normalize(match[1].replace(/\s+(va|esta|está|puesto)$/i, ''));
      const tokens = query.split(' ').filter(Boolean);
      const found = pilots.filter(p => tokens.length && tokens.every(t => normalize(p.name).split(' ').includes(t) || normalize(p.shortName).split(' ').includes(t)));
      if (!found.length) errors.push(`No encuentro «${match[1]}». Añade el piloto o escribe su nombre completo.`);
      else if (found.length > 1) errors.push(`«${match[1]}» es ambiguo: ${found.map(p => p.shortName).join(', ')}.`);
      else if (seen.has(found[0].id)) errors.push(`Has escrito dos veces a ${found[0].shortName}.`);
      else { seen.add(found[0].id); changes.push({ id: found[0].id, position: String(Number(match[2])) }); }
    }
    if (!lines.length) errors.push('Escribe al menos un nombre y su puesto.');
    return { changes, errors };
  }
  function importState(input, seed) {
    if (!input || input.schemaVersion !== 1 || input.eventId !== (seed.eventId || 'lleida-2026') || !Array.isArray(input.pilots)) throw new Error('Copia incompatible: pertenece a otro evento o versión.');
    if ((input.categoryId || 'GT') !== (seed.categoryId || 'GT')) throw new Error('La copia pertenece a otra categoría. No se mezclan campeonatos.');
    if (input.pilots.length < seed.pilots.length || input.pilots.length > 200) throw new Error('La copia debe conservar la base y contener como máximo 200 pilotos.');
    const ids = new Set(), names = new Set();
    const pilots = input.pilots.map(raw => {
      if (!raw || typeof raw.id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(raw.id) || ids.has(raw.id)) throw new Error('Identificador de piloto inválido o duplicado.');
      ids.add(raw.id);
      const base = seed.pilots.find(p => p.id === raw.id);
      if (typeof raw.name !== 'string' || raw.name.trim().length < 2 || raw.name.length > 120 || names.has(normalize(raw.name))) throw new Error('Nombre vacío, demasiado largo o duplicado.');
      names.add(normalize(raw.name));
      if (base && (JSON.stringify(raw.history) !== JSON.stringify(base.history) || raw.name !== base.name)) throw new Error('La copia modifica datos históricos de la base. No se ha importado.');
      if (!base && (!raw.id.startsWith('custom-') || JSON.stringify(raw.history) !== JSON.stringify(Array((seed.rules?.totalRounds ?? 4)-1).fill(null)))) throw new Error('Los pilotos nuevos deben empezar sin resultados históricos.');
      const clean = base ? clone(base) : { id: raw.id, name: raw.name.trim(), shortName: raw.name.trim(), history: Array((seed.rules?.totalRounds ?? 4)-1).fill(null), baselineTotal: 0, baselineRank: null, originalToday: false, entryRank: null, category: '', licenseNote: 'Añadido manualmente', eligible: 'unknown', favorite: false, historicalSource: 'Alta manual sin histórico' };
      for (const k of ['active','qualifying','noClassification','favorite']) if (typeof raw[k] !== 'boolean') throw new Error(`Campo ${k} inválido.`);
      if (!['yes','no','unknown'].includes(raw.eligible)) throw new Error('Elegibilidad inválida.');
      for (const k of ['position','pointsOverride']) if (typeof raw[k] !== 'string' || raw[k].length > 20) throw new Error(`Campo ${k} inválido.`);
      return { ...clean, active: raw.active, qualifying: raw.qualifying, noClassification: raw.noClassification, favorite: raw.favorite, eligible: raw.eligible, position: raw.position, pointsOverride: raw.pointsOverride, custom: !base };
    });
    if (seed.pilots.some(p => !ids.has(p.id))) throw new Error('Faltan pilotos de la general original.');
    // Imports always re-open the simulation: never trust a remote 'final' flag.
    return { schemaVersion: 1, eventId: seed.eventId || 'lleida-2026', categoryId: seed.categoryId || 'GT', mode: 'live', reviewed: false, updatedAt: null, pilots };
  }
  function assignPosition(state, id, value) {
    const proposed = clone(state), p = proposed.pilots.find(x => x.id === id);
    if (!p || !p.active || p.noClassification) throw new Error('Piloto no editable en la carrera actual.');
    p.position = String(value);
    const check = validate(proposed);
    if (check.errors.length) throw new Error(check.errors.map(e => e.message).join(' '));
    return proposed;
  }
  function stepPosition(state, id, delta) {
    if (delta !== 1 && delta !== -1) throw new Error('Movimiento inválido.');
    const proposed = clone(state), p = proposed.pilots.find(x => x.id === id);
    if (!p || !p.active || p.noClassification || p.position === '') throw new Error('Asigna primero un puesto.');
    const old = Number(p.position), target = old + delta;
    const other = proposed.pilots.find(x => x.id !== id && x.active && !x.noClassification && Number(x.position) === target);
    if (other) other.position = String(old);
    p.position = String(target);
    const check = validate(proposed);
    if (check.errors.length) throw new Error(check.errors.map(e => e.message).join(' '));
    return proposed;
  }
  return { normalize, clone, pointsFor, bonusFor, createState, resultFor, primaryCompare, compareDetailed, rankComplete, parsePosition, validate, calculate, parseQuick, importState, assignPosition, stepPosition, maximumMatching };
});
