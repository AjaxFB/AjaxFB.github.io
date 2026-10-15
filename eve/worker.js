'use strict';
/*
 * worker.js — cálculo de arbitragem cross-region e planejamento de rota.
 *
 * Roda fora da thread principal (a UI não trava). Importa o MESMO sde.js e abre o
 * MESMO IndexedDB (mesma origem), então só o resultado final trafega por postMessage.
 *
 * Protocolo:
 *   in : { seq, kind:'candidates', params:{...} }
 *   out: { seq, ok:true, ms, candidates:[...], stats:{...} }
 *   in : { seq, kind:'route', params:{...} }
 *   out: { seq, ok:true, ms, route:{ legs:[...], totals:{...} } }
 */

importScripts('sde.js');

const S = self.SDE;
const SYS = S.systems, TYPES = S.types, REGS = S.regions, CONSTS = S.constellations,
      STAS = S.stations, STSYS = S.station_sys;

const DB_NAME = 'eveonline';
const DB_VER = 1;
const STORE = 'regions';

/* ------------------------------------------------------------------ */
/* SDE helpers                                                         */
/* ------------------------------------------------------------------ */
function systemName(id) { const s = SYS[id]; return s ? s[0] : String(id); }
function systemSec(id) { const s = SYS[id]; return s ? s[1] : null; }
function systemRegion(id) { const s = SYS[id]; return s ? s[3] : null; }
function systemConst(id) { const s = SYS[id]; return s ? s[2] : null; }
function regionName(id) { return REGS[id] ? REGS[id][0] : String(id); }
function constName(id) { return id && CONSTS[id] ? CONSTS[id][0] : ''; }
function stationName(id) {
  if (id == null) return '';
  if (STAS[id]) return STAS[id];
  // estruturas de jogador (1xxxxxxxxxxxxx) não têm nome público sem auth
  const s = String(id);
  return s.length > 9 ? 'Structure ' + s.slice(2, 8) : 'Station #' + s;
}
function stationSystem(id) { return STSYS[id] || null; }
function typeName(id) { const t = TYPES[id]; return t ? t[0] : String(id); }
function typeVol(id) { const t = TYPES[id]; return t ? (t[1] || 0) : 0; }

/* ------------------------------------------------------------------ */
/* Grafo de saltos (portais)                                           */
/* ------------------------------------------------------------------ */
let _adj = null;
function adj() {
  if (_adj) return _adj;
  const g = new Map();
  for (const [a, nbs] of Object.entries(S.stargates)) {
    const ai = +a;
    let la = g.get(ai); if (!la) { la = []; g.set(ai, la); }
    for (const b of nbs) {
      la.push(b);
      let lb = g.get(b); if (!lb) { lb = []; g.set(b, lb); }
      lb.push(ai);
    }
  }
  _adj = g;
  return g;
}

function bfsFull(src) {
  const g = adj();
  const dist = new Map([[src, 0]]);
  let frontier = [src], d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const n of frontier) {
      const nbs = g.get(n);
      if (!nbs) continue;
      for (const nb of nbs) if (!dist.has(nb)) { dist.set(nb, d); next.push(nb); }
    }
    frontier = next;
  }
  return dist;
}

function bidirJumps(a, b) {
  if (a === b) return 0;
  const g = adj();
  let fa = [a], fb = [b];
  const sa = new Set([a]), sb = new Set([b]);
  let da = 0, db = 0;
  while (fa.length && fb.length) {
    if (fa.length <= fb.length) {
      da++; const nd = [];
      for (const n of fa) { const nbs = g.get(n); if (!nbs) continue;
        for (const nb of nbs) { if (sb.has(nb)) return da + db; if (!sa.has(nb)) { sa.add(nb); nd.push(nb); } } }
      fa = nd;
    } else {
      db++; const nd = [];
      for (const n of fb) { const nbs = g.get(n); if (!nbs) continue;
        for (const nb of nbs) { if (sa.has(nb)) return da + db; if (!sb.has(nb)) { sb.add(nb); nd.push(nb); } } }
      fb = nd;
    }
  }
  return 999;
}

const _jc = new Map();
function jumps(a, b) {
  if (a == null || b == null) return 999;
  const k = a < b ? a * 100000000 + b : b * 100000000 + a;
  let v = _jc.get(k);
  if (v === undefined) { v = bidirJumps(a, b); _jc.set(k, v); }
  return v;
}

/* caminho real (lista de sistemas) via BFS com predecessores */
function pathAB(a, b) {
  if (a === b) return [a];
  const g = adj();
  const prev = new Map([[a, null]]);
  let frontier = [a];
  while (frontier.length) {
    const next = [];
    for (const n of frontier) {
      const nbs = g.get(n); if (!nbs) continue;
      for (const nb of nbs) {
        if (prev.has(nb)) continue;
        prev.set(nb, n);
        if (nb === b) {
          const path = []; let c = b;
          while (c !== null) { path.push(c); c = prev.get(c); }
          return path.reverse();
        }
        next.push(nb);
      }
    }
    frontier = next;
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */
let _idb = null;
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function idbAll(idb) {
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE, 'readonly');
    const r = tx.objectStore(STORE).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

/* ------------------------------------------------------------------ */
/* Candidatos de arbitragem                                            */
/* ------------------------------------------------------------------ */
function computeCandidates(stored, p) {
  const taxBuy = p.taxBuy || 0;          // fração (0.03 = 3%)
  const taxSell = p.taxSell || 0;
  const perSideK = p.perSideK || 10;
  const regionAllow = p.regions && p.regions.length ? new Set(p.regions) : null;
  const typesAllow = p.types && p.types.length ? new Set(p.types) : null;
  const typesDeny = p.typesDeny && p.typesDeny.length ? new Set(p.typesDeny) : null;

  // achata ordens
  const orders = [];
  for (const rec of stored) {
    if (regionAllow && !regionAllow.has(rec.region_id)) continue;
    const arr = rec.orders || [];
    for (let i = 0; i < arr.length; i++) orders.push(arr[i]);
  }

  const byType = new Map();
  for (const o of orders) {
    if (typesAllow && !typesAllow.has(o.type_id)) continue;
    if (typesDeny && typesDeny.has(o.type_id)) continue;
    let a = byType.get(o.type_id); if (!a) { a = []; byType.set(o.type_id, a); }
    a.push(o);
  }

  const raw = [];
  for (const [tid, list] of byType) {
    const vol = typeVol(tid);
    const name = typeName(tid);
    const sells = [], buys = [];
    for (const o of list) (o.is_buy_order ? buys : sells).push(o);
    if (!sells.length || !buys.length) continue;
    sells.sort((a, b) => a.price - b.price);
    buys.sort((a, b) => b.price - a.price);
    const S1 = sells.slice(0, perSideK), B1 = buys.slice(0, perSideK);
    for (const ask of S1) {
      const askNet = ask.price * (1 + taxBuy);
      for (const bid of B1) {
        if (bid.price <= ask.price) continue;
        const net = bid.price * (1 - taxSell) - askNet;   // lucro por unidade
        if (net <= 0) continue;
        const qty = Math.min(bid.volume_remain, ask.volume_remain);
        if (qty < 1) continue;
        const total = net * qty;
        const cap10 = vol > 0 ? Math.floor(10 / vol) : 0;
        const cap600 = vol > 0 ? Math.floor(600 / vol) : 0;
        const cap30k = vol > 0 ? Math.floor(30000 / vol) : 0;
        raw.push({
          type_id: +tid, type_name: name, vol,
          roi: net / askNet,
          net, qty, total,
          ask_price: ask.price, ask_sys: ask.system_id, ask_loc: ask.location_id, ask_qty: ask.volume_remain,
          bid_price: bid.price, bid_sys: bid.system_id, bid_loc: bid.location_id, bid_qty: bid.volume_remain,
          c10: cap10 > 0 ? net * Math.min(qty, cap10) : 0,
          c600: cap600 > 0 ? net * Math.min(qty, cap600) : 0,
          c30k: cap30k > 0 ? net * Math.min(qty, cap30k) : 0,
        });
      }
    }
  }

  raw.sort((a, b) => b.total - a.total);

  const topN = p.topN || 5000;
  const hubs = p.hubs || [];
  const hubD = hubs.map(h => ({ ...h, dist: bfsFull(h.systemId) }));

  const out = [];
  for (let i = 0; i < raw.length && out.length < topN; i++) {
    const r = raw[i];
    const j = jumps(r.ask_sys, r.bid_sys);
    if (j > (p.maxJumps || 999)) continue;
    const askSys = SYS[r.ask_sys], bidSys = SYS[r.bid_sys];
    const jd = {};
    for (const h of hubD) jd[h.key] = h.dist.get(r.ask_sys) ?? 999;
    out.push({
      type_id: r.type_id, type_name: r.type_name, vol: r.vol,
      roi: r.roi, net: r.net, qty: r.qty, total: r.total,
      jumps: j,
      buy_sys: r.ask_sys, buy_sys_name: systemName(r.ask_sys),
      buy_loc: r.ask_loc, buy_loc_name: stationName(r.ask_loc),
      buy_region: r.ask_sys ? regionName(systemRegion(r.ask_sys)) : '',
      buy_sec: askSys ? askSys[1] : null,
      buy_price: r.ask_price, buy_qty: r.ask_qty,
      sell_sys: r.bid_sys, sell_sys_name: systemName(r.bid_sys),
      sell_loc: r.bid_loc, sell_loc_name: stationName(r.bid_loc),
      sell_region: r.bid_sys ? regionName(systemRegion(r.bid_sys)) : '',
      sell_sec: bidSys ? bidSys[1] : null,
      sell_price: r.bid_price, sell_qty: r.bid_qty,
      m3: r.vol * r.qty,
      ppj: r.total / (j || 1),
      hub: jd, c10: r.c10, c600: r.c600, c30k: r.c30k,
    });
  }
  return { candidates: out, stats: { orders: orders.length, raw: raw.length, shown: out.length } };
}

/* ------------------------------------------------------------------ */
/* Planejador de rota (heurística gulosa por lucro/salto)              */
/* ------------------------------------------------------------------ */
function planRoute(cands, p) {
  const cargo = p.cargoM3 || 600;
  const maxLegs = p.maxLegs || 12;
  const maxLegJumps = p.maxLegJumps || 12;
  const minRoi = p.minRoi || 0;
  const minPpj = p.minPpj || 0;
  const startSys = p.startSystemId;
  const noRepeat = p.noRepeat !== false;

  // agrupa por sistema de compra para busca rápida
  const byBuy = new Map();
  for (const c of cands) {
    if (c.roi < minRoi) continue;
    if (c.net <= 0) continue;
    let a = byBuy.get(c.buy_sys); if (!a) { a = []; byBuy.set(c.buy_sys, a); }
    a.push(c);
  }

  let isk = p.budget > 0 ? p.budget : Infinity;
  let cur = startSys;
  const legs = [];
  const used = new Set();

  for (let step = 0; step < maxLegs; step++) {
    let best = null, bestScore = 0, bestToBuy = 0;
    // explora sistemas de compra alcançáveis
    for (const [buySys, list] of byBuy) {
      const toBuy = jumps(cur, buySys);
      if (toBuy > maxLegJumps) continue;
      for (const c of list) {
        if (noRepeat && used.has(c.type_id + ':' + c.buy_loc + ':' + c.sell_loc)) continue;
        if (c.vol <= 0) continue;
        const byCargo = Math.floor(cargo / c.vol);
        const byIsk = isk === Infinity ? Infinity : Math.floor(isk / c.buy_price);
        const qty = Math.min(c.qty, byCargo, byIsk);
        if (qty < 1) continue;
        const legJumps = toBuy + c.jumps;
        if (legJumps < 1) continue;
        const profit = c.net * qty;
        const ppj = profit / legJumps;
        if (ppj < minPpj) continue;
        if (ppj > bestScore) { bestScore = ppj; best = c; bestToBuy = toBuy; }
      }
    }
    if (!best) break;
    const byCargo = Math.floor(cargo / best.vol);
    const byIsk = isk === Infinity ? Infinity : Math.floor(isk / best.buy_price);
    const qty = Math.min(best.qty, byCargo, byIsk);
    const profit = best.net * qty;
    const cost = best.buy_price * qty;
    legs.push({
      step: legs.length + 1,
      type_id: best.type_id, type_name: best.type_name,
      qty, unit_vol: best.vol, m3: best.vol * qty,
      buy_sys: best.buy_sys, buy_sys_name: best.buy_sys_name, buy_loc_name: best.buy_loc_name,
      buy_price: best.buy_price, cost,
      sell_sys: best.sell_sys, sell_sys_name: best.sell_sys_name, sell_loc_name: best.sell_loc_name,
      sell_price: best.sell_price, profit, roi: best.roi,
      jumps_to_buy: bestToBuy, jumps_leg: best.jumps, jumps: bestToBuy + best.jumps,
      ppj: profit / (bestToBuy + best.jumps),
    });
    isk = isk === Infinity ? Infinity : isk - cost + best.buy_price * qty + profit;
    cur = best.sell_sys;
    if (noRepeat) used.add(best.type_id + ':' + best.buy_loc + ':' + best.sell_loc);
  }

  const totals = legs.reduce((t, l) => {
    t.profit += l.profit; t.cost += l.cost; t.jumps += l.jumps; t.m3 += l.m3;
    return t;
  }, { profit: 0, cost: 0, jumps: 0, m3: 0 });
  totals.ppj = totals.profit / (totals.jumps || 1);
  totals.legs = legs.length;
  return { legs, totals };
}

/* ------------------------------------------------------------------ */
/* Melhor origem de compra (logística de corp)                         */
/* ------------------------------------------------------------------ */
function bestBuy(stored, p) {
  const regionAllow = p.regions && p.regions.length ? new Set(p.regions) : null;
  const origin = p.originSystemId;
  const maxJumps = p.maxJumps || 999;
  const sells = new Map();
  for (const rec of stored) {
    if (regionAllow && !regionAllow.has(rec.region_id)) continue;
    for (const o of rec.orders || []) {
      if (o.is_buy_order) continue;
      let a = sells.get(o.type_id); if (!a) { a = []; sells.set(o.type_id, a); }
      a.push(o);
    }
  }
  const lines = [];
  let total = 0, totalJumps = 0, m3 = 0, missing = 0, short = 0;
  for (const it of p.items || []) {
    const list = sells.get(it.type_id) || [];
    let best = null, bestJ = 0;
    for (const o of list) {
      const jj = origin ? jumps(o.system_id, origin) : 0;
      if (jj > maxJumps) continue;
      if (!best || o.price < best.price || (o.price === best.price && jj < bestJ)) { best = o; bestJ = jj; }
    }
    if (!best) { lines.push({ type_id: it.type_id, name: typeName(it.type_id), want: it.qty, missing: true }); missing++; continue; }
    const q = Math.min(it.qty, best.volume_remain);
    const lineTotal = best.price * q;
    const vol = typeVol(it.type_id);
    total += lineTotal; totalJumps += bestJ; m3 += vol * q;
    if (q < it.qty) short++;
    lines.push({
      type_id: it.type_id, name: typeName(it.type_id), want: it.qty, qty: q,
      unit_price: best.price, total: lineTotal, sys: best.system_id, sys_name: systemName(best.system_id),
      loc_name: stationName(best.location_id), jumps: bestJ, vol, m3: vol * q, short: q < it.qty,
    });
  }
  lines.sort((a, b) => (b.total || 0) - (a.total || 0));
  return { lines, totals: { total, jumps: totalJumps, m3, lines: lines.length, missing, short } };
}

/* ------------------------------------------------------------------ */
/* Mensagens                                                           */
/* ------------------------------------------------------------------ */
self.onmessage = async (e) => {
  const { seq, kind, params } = e.data || {};
  const t0 = Date.now();
  try {
    if (!_idb) _idb = await openDB();
    const stored = await idbAll(_idb);
    if (kind === 'bestbuy') {
      const result = bestBuy(stored, params || {});
      self.postMessage({ seq, ok: true, ms: Date.now() - t0, ...result });
      return;
    }
    const { candidates, stats } = computeCandidates(stored, params || {});
    if (kind === 'route') {
      const route = planRoute(candidates, params || {});
      self.postMessage({ seq, ok: true, ms: Date.now() - t0, route, stats });
    } else {
      self.postMessage({ seq, ok: true, ms: Date.now() - t0, candidates, stats });
    }
  } catch (err) {
    self.postMessage({ seq, ok: false, msg: String((err && err.stack) || err) });
  }
};
