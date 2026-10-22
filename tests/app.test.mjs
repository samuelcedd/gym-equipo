// Pruebas de la app del gym con jsdom: unidades, metas, calculadora de discos,
// compatibilidad con datos viejos, export/import y adaptador Supabase (mock).
import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";

const APP = process.argv[2] || new URL("../index.html", import.meta.url);
const RAW = fs.readFileSync(APP, "utf8");
const results = [];
let group = "";
const ok = (name, cond, extra) => { results.push({ group, name, pass: !!cond, extra }); };
const eq = (name, a, b) => { const pa = JSON.stringify(a), pb = JSON.stringify(b); ok(name, pa === pb, pa === pb ? "" : `obtenido ${pa}, esperado ${pb}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Supabase falso compartido entre "celulares" ----
function makeServer() {
  const rows = new Map(), subs = [], upserts = [];
  return {
    rows, upserts,
    client() {
      return {
        from() {
          return {
            upsert(row) {
              const r = JSON.parse(JSON.stringify(row));
              rows.set(r.path, r.data); upserts.push(r);
              setTimeout(() => subs.forEach(cb => cb({ eventType: "UPDATE", new: r })), 30);
              return Promise.resolve({ error: null });
            },
            select() { return { eq(_c, path) { return { maybeSingle() {
              return Promise.resolve({ data: rows.has(path) ? { data: JSON.parse(JSON.stringify(rows.get(path))) } : null, error: null });
            } }; } }; }
          };
        },
        channel() {
          const ch = { cbs: [], on(_ev, _f, cb) { this.cbs.push(cb); return this; }, subscribe() { this.cbs.forEach(cb => subs.push(cb)); return this; } };
          return ch;
        }
      };
    }
  };
}

function device({ server = null, storage = null } = {}) {
  let html = RAW;
  if (server) {
    html = html.replace(/const SB_URL="[^"]*";/, 'const SB_URL="https://mock.supabase.co";')
               .replace(/const SB_KEY="[^"]*";/, 'const SB_KEY="mock-anon-key-0123456789abcdef0123456789";');
  }
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", e => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on("error", (...a) => errors.push(a.join(" ")));
  const dom = new JSDOM(html, {
    url: "https://gym.test/", runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      if (storage) Object.entries(storage).forEach(([k, v]) => w.localStorage.setItem(k, JSON.stringify(v)));
      if (server) w.supabase = { createClient: () => server.client() };
    }
  });
  const w = dom.window;
  return { w, dom, errors, ev: code => w.eval(code), $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)] };
}

function saveSet(d, exId, p, k, val, reps) {
  const row = d.$(`.ex[data-id="${exId}"] .srow[data-p="${p}"][data-k="${k}"]`);
  if (!row) throw new Error(`no hay fila ${exId}/${p}/${k}`);
  row.querySelector(".ikg").value = val === null ? "" : String(val);
  row.querySelector(".irp").value = String(reps);
  row.querySelector(".sv").click();
}
function setUnit(d, exId, p, u) {
  d.$(`.ex[data-id="${exId}"] .useg[data-p="${p}"] button[data-u="${u}"]`).click();
}
const daysAgo = (d, n) => d.ev(`(()=>{const x=parseD(TODAY);x.setDate(x.getDate()-${n});return isoDay(x);})()`);

// =====================================================================
group = "1. Carga y modo local";
{
  const d = device();
  await sleep(50);
  eq("Sin Supabase dice 'Guardado en este celular.'", d.$("#sync").textContent, "Guardado en este celular.");
  ok("Renderiza las 5 vistas sin errores", d.errors.length === 0, d.errors.join("\n"));
  ok("Plan tiene la sección Mi gym", !!d.$("#gymBox #gSave"));
  ok("Selector kg|lb|placas en ejercicios con peso", d.$$(".useg").length > 0);
  d.ev("current='mar';renderDay()");
  ok("Rueda abdominal (peso corporal) no muestra selector", !d.$('.ex[data-id="mar-rueda"] .useg'));
}

// =====================================================================
group = "2. Guardar series en kg, lb y placas";
{
  const d = device();
  d.ev("current='lun';renderDay()");
  saveSet(d, "lun-banca", "samuel", 0, 60, 8);
  eq("Serie kg en D.s", d.ev("D.s.samuel['lun-banca'][0]"), { kg: 60, reps: 8, u: "kg" });
  eq("Historial kg sin tercer elemento (compatible)", d.ev("D.w.samuel['lun-banca'].h.slice(-1)[0].s[0]"), [60, 8]);

  setUnit(d, "lun-remo", "samuel", "lb");
  eq("Unidad lb guardada en D.w[p][id].u", d.ev("D.w.samuel['lun-remo'].u"), "lb");
  const lbRow = d.$('.ex[data-id="lun-remo"] .srow[data-p="samuel"][data-k="0"]');
  eq("Fila en lb: step 1 y etiqueta lb", [lbRow.querySelector(".ikg").getAttribute("step"), lbRow.querySelector(".u").textContent], ["1", "lb"]);
  saveSet(d, "lun-remo", "samuel", 0, 135, 8);
  eq("Historial guarda [135, 8, 'lb']", d.ev("D.w.samuel['lun-remo'].h.slice(-1)[0].s[0]"), [135, 8, "lb"]);
  eq("Peso tope con su unidad (v, vu)", d.ev("[D.w.samuel['lun-remo'].v,D.w.samuel['lun-remo'].vu]"), [135, "lb"]);

  setUnit(d, "lun-jalon", "anderson", "placas");
  const plRow = d.$('.ex[data-id="lun-jalon"] .srow[data-p="anderson"][data-k="0"]');
  eq("Fila en placas: step 1 y etiqueta placa", [plRow.querySelector(".ikg").getAttribute("step"), plRow.querySelector(".u").textContent], ["1", "placa"]);
  saveSet(d, "lun-jalon", "anderson", 0, 7, 12);
  eq("Historial guarda [7, 12, 'placas']", d.ev("D.w.anderson['lun-jalon'].h.slice(-1)[0].s[0]"), [7, 12, "placas"]);
  ok("Toast muestra 'Placa 7 × 12'", d.$("#toast").textContent.includes("Placa 7 × 12"), d.$("#toast").textContent);

  // Semana: unidad original y volumen en kg
  d.ev("weekWho='all';renderWeek()");
  const wk = d.$("#v-week").textContent;
  ok("Semana muestra '60 kg × 8'", wk.includes("60 kg × 8"));
  ok("Semana muestra '135 lb × 8'", wk.includes("135 lb × 8"));
  ok("Semana muestra 'Placa 7 × 12'", wk.includes("Placa 7 × 12"));
  const st = d.ev("weekStats('samuel',weekDates(0))");
  eq("Volumen Samuel = 60×8 + 135 lb×0,4536×8 (≈970 kg)", st.vol, Math.round(60 * 8 + 135 * 0.4536 * 8));
  const sa = d.ev("weekStats('anderson',weekDates(0))");
  eq("Placas sin equivalencia no suman volumen (Anderson)", [sa.vol, sa.npl], [0, 1]);
  ok("Nota pequeña de placas sin equivalencia", wk.includes("1 serie en placas sin equivalencia no suma al volumen"));
  ok("Sin errores de consola", d.errors.length === 0, d.errors.join("\n"));
}

// =====================================================================
group = "3. Metas por unidad";
{
  const d = device();
  const prev = daysAgo(d, 7);
  const setH = (p, id, sets, extra = "") => d.ev(`D.w.${p}['${id}']=Object.assign({h:[{d:'${prev}',s:${JSON.stringify(sets)}}]}${extra});`);
  const meta = (p, id, k = 0) => d.ev(`(()=>{const m=metaFor(ALLEX.find(e=>e.id==='${id}'),'${p}',${k},[]);return [m.v,m.u,m.reps,m.tag];})()`);
  const metaTxt = (p, id, k = 0) => d.ev(`(()=>{const m=metaFor(ALLEX.find(e=>e.id==='${id}'),'${p}',${k},[]);return m.txt+' '+m.cv;})()`);

  setH("samuel", "lun-banca", [[60, 8], [60, 7], [60, 6], [60, 5]]);
  eq("kg barra superior: 60×8 → 62,5 kg × 6", meta("samuel", "lun-banca", 0), [62.5, "kg", 6, "up"]);
  eq("kg: 60×7 → mismo peso × 8", meta("samuel", "lun-banca", 1), [60, "kg", 8, "same"]);
  setH("samuel", "mar-sentadilla", [[100, 8]]);
  eq("kg barra inferior: +5 kg", meta("samuel", "mar-sentadilla"), [105, "kg", 6, "up"]);
  setH("lorena", "mar-sentadilla", [[12, 12]]);
  eq("Lorena goblet (mancuerna kg, salto 2): 12 → 14", meta("lorena", "mar-sentadilla"), [14, "kg", 10, "up"]);

  setH("samuel", "lun-banca", [[135, 8, "lb"]], ",{u:'lb'}");
  eq("lb barra superior: +5 lb (135 → 140)", meta("samuel", "lun-banca"), [140, "lb", 6, "up"]);
  setH("samuel", "mar-sentadilla", [[225, 8, "lb"]], ",{u:'lb'}");
  eq("lb barra inferior: +10 lb (225 → 235)", meta("samuel", "mar-sentadilla"), [235, "lb", 6, "up"]);
  setH("anderson", "mar-rumano", [[135, 12, "lb"]], ",{u:'lb'}");
  eq("Anderson rumano lb: salto mínimo +5 lb", meta("anderson", "mar-rumano"), [140, "lb", 10, "up"]);
  setH("samuel", "mie-inclinado", [[40, 12, "lb"]], ",{u:'lb'}");
  eq("lb mancuernas: +5 lb", meta("samuel", "mie-inclinado"), [45, "lb", 8, "up"]);
  setH("samuel", "mie-remo", [[100, 12, "lb"]], ",{u:'lb'}");
  eq("lb máquina sin configurar: +10 lb", meta("samuel", "mie-remo"), [110, "lb", 10, "up"]);
  setH("lorena", "mie-remo", [[100, 12, "lb"]], ",{u:'lb'}");
  eq("Lorena lb máquina: salto mínimo +5 lb", meta("lorena", "mie-remo"), [105, "lb", 10, "up"]);
  setH("lorena", "jue-hip", [[95, 12, "lb"]], ",{u:'lb'}");
  eq("Lorena lb barra: salto mínimo +5 lb (2 × 2,5)", meta("lorena", "jue-hip"), [100, "lb", 10, "up"]);

  setH("samuel", "mie-peck", [[7, 15, "placas"]], ",{u:'placas'}");
  eq("placas: +1 placa", meta("samuel", "mie-peck"), [8, "placas", 12, "up"]);
  setH("lorena", "mie-peck", [[5, 15, "placas"]], ",{u:'placas'}");
  eq("Lorena placas: +1 placa", meta("lorena", "mie-peck"), [6, "placas", 12, "up"]);

  // Cambio de unidad con historial
  setH("samuel", "lun-banca", [[100, 6]], ",{u:'lb'}");
  eq("kg→lb: 100 kg ≈ 220 lb (carga real con barra 45 y discos lb)", meta("samuel", "lun-banca"), [220, "lb", 7, "same"]);
  ok("kg→lb: avisa la conversión", metaTxt("samuel", "lun-banca").includes("Convertido: 100 kg ≈ 220 lb"), metaTxt("samuel", "lun-banca"));
  setH("samuel", "lun-banca", [[135, 8, "lb"]], ",{u:'kg'}");
  eq("lb→kg: 135 lb ≈ 60 kg real, luego +2,5 → 62,5", meta("samuel", "lun-banca"), [62.5, "kg", 6, "up"]);
  setH("samuel", "mar-ext", [[40, 12]], ",{u:'placas'}");
  eq("kg→placas sin equivalencia: meta nueva", meta("samuel", "mar-ext"), [null, "placas", 15, "new"]);
  ok("Mensaje de meta nueva en placas", metaTxt("samuel", "mar-ext").includes("Meta nueva en placas"));
  d.ev("setCfg({mach:{'mar-ext':{w:5,u:'kg',b:5}}})");
  eq("kg→placas con placa de 5 kg: 40 kg = placa 8", meta("samuel", "mar-ext"), [8, "placas", 13, "same"]);
  setH("samuel", "mar-ext", [[8, 15, "placas"]], ",{u:'kg'}");
  eq("placas→kg con equivalencia: placa 8 = 40 kg, +1 placa = 45", meta("samuel", "mar-ext"), [45, "kg", 12, "up"]);
  d.ev("setCfg({})");
  setH("samuel", "mar-ext", [[8, 15, "placas"]], ",{u:'kg'}");
  eq("placas→kg sin equivalencia: meta nueva en kg", meta("samuel", "mar-ext"), [null, "kg", 15, "new"]);

  // La meta siempre es una carga real
  d.ev("setCfg({plates:{kg:[20,10,5]}})");
  setH("samuel", "lun-banca", [[60, 8]], ",{u:'kg'}");
  eq("Sin discos pequeños: 60 → 70 kg (salto mínimo real = 2 × 5)", meta("samuel", "lun-banca"), [70, "kg", 6, "up"]);
  d.ev("setCfg({db:{kg:{min:2.5,max:40,step:2.5}}})");
  setH("samuel", "mie-inclinado", [[20, 12]], ",{u:'kg'}");
  eq("Mancuernas de 2,5 en 2,5: 20 → 22,5", meta("samuel", "mie-inclinado"), [22.5, "kg", 8, "up"]);
  d.ev("setCfg({})");

  // Pref de la persona como unidad por defecto
  d.ev("setCfg({pref:{anderson:'lb'}})");
  eq("Unidad por defecto = preferida (Anderson lb)", d.ev("unitOf(ALLEX.find(e=>e.id==='lun-banca'),'anderson')"), "lb");
  eq("Sin preferida: kg", d.ev("unitOf(ALLEX.find(e=>e.id==='lun-banca'),'lorena')"), "kg");
  d.ev("setCfg({})");

  // Render de la tarjeta con la meta y la calculadora
  setH("samuel", "lun-banca", [[60, 8]], ",{u:'kg'}");
  d.ev("current='lun';renderDay()");
  const row = d.$('.ex[data-id="lun-banca"] .srow[data-p="samuel"][data-k="0"]');
  ok("Tarjeta: 'Meta: 62,5 kg × 6'", row.querySelector(".mset").textContent.includes("Meta: 62,5 kg × 6"), row.querySelector(".mset").textContent);
  eq("Tarjeta: 'Por lado: 20 + 1,25' bajo la meta", row.querySelector(".pc").textContent, "Por lado: 20 + 1,25");
  row.querySelector(".ikg").value = "61";
  row.querySelector(".ikg").dispatchEvent(new d.w.Event("input", { bubbles: true }));
  ok("Calculadora en vivo avisa si no se arma exacto", row.querySelector(".pc").textContent.includes("no se arma exacto"), row.querySelector(".pc").textContent);
  ok("Sin errores de consola", d.errors.length === 0, d.errors.join("\n"));
}

// =====================================================================
group = "4. Calculadora de discos";
{
  const d = device();
  const pc = (p, id, u, v) => d.ev(`(()=>{const c=plateCalc(ALLEX.find(e=>e.id==='${id}'),'${p}','${u}',${v});return c&&[c.txt,c.exact,c.tot];})()`);
  eq("60 kg con barra de 20 → 'Por lado: 20'", pc("samuel", "lun-banca", "kg", 60), ["Por lado: 20", true, 60]);
  eq("135 lb con barra de 45 → 'Por lado: 45'", pc("samuel", "lun-banca", "lb", 135), ["Por lado: 45", true, 135]);
  eq("62,5 kg → 'Por lado: 20 + 1,25'", pc("samuel", "lun-banca", "kg", 62.5), ["Por lado: 20 + 1,25", true, 62.5]);
  eq("100 kg → 'Por lado: 25 + 15'", pc("samuel", "mar-sentadilla", "kg", 100), ["Por lado: 25 + 15", true, 100]);
  eq("225 lb → 'Por lado: 45 + 45'", pc("samuel", "mar-sentadilla", "lb", 225), ["Por lado: 45 + 45", true, 225]);
  eq("20 kg → solo la barra", pc("samuel", "lun-banca", "kg", 20), ["Solo la barra (20 kg)", true, 20]);
  eq("61 kg no exacto → la más cercana 60", pc("samuel", "lun-banca", "kg", 61), ["Por lado: 20", false, 60]);
  ok("Aviso de no exacto con texto claro", d.ev("plateCalc(ALLEX.find(e=>e.id==='lun-banca'),'samuel','kg',61).warn").includes("lo más cercano: 60 kg"));
  eq("Curl con barra EZ de 10 kg: 30 kg → 'Por lado: 10'", pc("samuel", "lun-curl", "kg", 30), ["Por lado: 10", true, 30]);
  eq("Lorena en press banca usa máquina: sin calculadora", pc("lorena", "lun-banca", "kg", 60), null);
  eq("Mancuernas: sin calculadora", pc("samuel", "mie-inclinado", "kg", 20), null);
  d.ev("setCfg({bar:{kg:15},plates:{kg:[20,10,5,2.5]}})");
  eq("Barra de 15 sin disco de 15: 52,5 no exacto → 50 = '10 + 5 + 2,5'", pc("samuel", "lun-banca", "kg", 52.5), ["Por lado: 10 + 5 + 2,5", false, 50]);
}

// =====================================================================
group = "5. Datos viejos sin unidad";
{
  const tmp = device();
  const prev = daysAgo(tmp, 7), prev2 = daysAgo(tmp, 14);
  const old = {
    "lun-banca": { v: 70, d: prev, f: 60, fd: prev2, h: [{ d: prev2, s: [[60, 8], [60, 8]] }, { d: prev, s: [[70, 8], [70, 6]] }] },
    "mar-rueda": { h: [{ d: prev, s: [[null, 10]] }] }
  };
  const d = device({ storage: { "w2:samuel": old, "me": "samuel" } });
  await sleep(30);
  eq("Unidad de datos viejos = kg", d.ev("unitOf(ALLEX.find(e=>e.id==='lun-banca'),'samuel')"), "kg");
  eq("Meta con datos viejos: 70×8 → 72,5 kg", d.ev("metaFor(ALLEX.find(e=>e.id==='lun-banca'),'samuel',0,[]).v"), 72.5);
  d.ev("current='lun';renderDay()");
  ok("Tarjeta muestra 'Último' con kg", d.$('.ex[data-id="lun-banca"] .prow.me .last').textContent.includes("70 kg × 8 · 70 kg × 6"));
  d.ev("progDay='lun';renderProgress()");
  const pg = d.$("#v-prog").textContent;
  ok("Progreso: celda '70 kg × 8'", pg.includes("70 kg × 8"));
  ok("Progreso: total '+10 kg'", pg.includes("+10 kg"));
  ok("Ejercicios principales: '60 kg → 70 kg +17%'", pg.includes("60 kg → 70 kg +17%"));
  ok("Rueda (peso corporal) sigue funcionando", d.ev("metaFor(ALLEX.find(e=>e.id==='mar-rueda'),'samuel',0,[]).reps") === 12);
  ok("Sin errores de consola", d.errors.length === 0, d.errors.join("\n"));
}

// =====================================================================
group = "6. Progreso con unidades mezcladas";
{
  const d = device();
  const p2 = daysAgo(d, 14), p1 = daysAgo(d, 7);
  d.ev(`D.w.samuel['lun-banca']={f:60,fd:'${p2}',v:140,vu:'lb',d:'${p1}',h:[{d:'${p2}',s:[[60,8]]},{d:'${p1}',s:[[140,8,'lb']]}]}`);
  d.ev(`D.w.anderson['lun-banca']={f:100,fu:'lb',fd:'${p2}',v:120,vu:'lb',d:'${p1}',h:[{d:'${p2}',s:[[100,8,'lb']]},{d:'${p1}',s:[[120,8,'lb']]}]}`);
  d.ev(`D.w.lorena['lun-banca']={f:5,fu:'placas',fd:'${p2}',v:7,vu:'placas',d:'${p1}',h:[{d:'${p2}',s:[[5,12,'placas']]},{d:'${p1}',s:[[7,12,'placas']]}]}`);
  d.ev("progDay='lun';renderProgress()");
  const pg = d.$("#v-prog").textContent;
  ok("Mismo ejercicio kg→lb: diferencia convertida a kg (+3,5 kg)", pg.includes("+3,5 kg"), pg.match(/Press banca[^]*?Anderson/)?.[0]);
  ok("lb→lb: '+20 lb'", pg.includes("+20 lb"));
  ok("Placas: 'Placa 7 × 12' y '+2 placas'", pg.includes("Placa 7 × 12") && pg.includes("+2 placas"));
  const g = d.ev("gainOf(ALLEX.find(e=>e.id==='lun-banca'),D.w.samuel['lun-banca'])");
  ok("% mejora convertido a kg: 60 kg → 140 lb = +5,8%", Math.abs(g - (140 * 0.4536 - 60) / 60 * 100) < 0.01, g);
  ok("Principales muestran '60 kg → 140 lb'", pg.includes("60 kg → 140 lb"));
  ok("Principales muestran 'Placa 5 → Placa 7'", pg.includes("Placa 5 → Placa 7"));
  ok("Sin errores de consola", d.errors.length === 0, d.errors.join("\n"));
}

// =====================================================================
group = "7. Mi gym (UI)";
{
  const d = device();
  const box = d.$("#gymBox");
  box.querySelector('#gPref .seg[data-p="anderson"] button[data-u="lb"]').click();
  box.querySelector("#gBarKg").value = "15";
  box.querySelector("#gPlKg").value = "20, 10, 5 2,5;1,25";
  box.querySelector("#gDbLbStep").value = "2.5";
  const mrow = box.querySelector('.mrow[data-id="mar-ext"]');
  mrow.querySelector(".mw").value = "10"; mrow.querySelector(".mu").value = "lb"; mrow.querySelector(".mb").value = "15";
  box.querySelector("#gSave").click();
  eq("Preferida guardada", d.ev("D.g.pref.anderson"), "lb");
  eq("Barra olímpica 15 kg", d.ev("D.g.bar.kg"), 15);
  eq("Discos kg parseados (comas decimales)", d.ev("D.g.plates.kg"), [20, 10, 5, 2.5, 1.25]);
  eq("Salto mancuernas lb", d.ev("D.g.db.lb.step"), 2.5);
  eq("Máquina: placa de 10 lb, placa 1 = 15 lb", d.ev("D.g.mach['mar-ext']"), { w: 10, u: "lb", b: 15 });
  eq("Placa 3 de esa máquina = 35 lb ≈ 15,876 kg", d.ev("Math.round(toKg(3,'placas',ALLEX.find(e=>e.id==='mar-ext'))*1000)/1000"), 15.876);
  eq("Guardado local en g2", JSON.parse(d.w.localStorage.getItem("g2")).bar.kg, 15);
  ok("Lista de máquinas no incluye cardio", !box.querySelector('.mrow[data-id="mie-cardio"]'));
  ok("Lista incluye press banca por la máquina de Lorena", !!d.$('#gymBox .mrow[data-id="lun-banca"]'));
  // El formulario sin guardar sobrevive a un re-render
  d.$("#gymBox #gBarLb").value = "35"; d.$("#gymBox").dispatchEvent(new d.w.Event("input", { bubbles: true }));
  d.ev("renderAll()");
  eq("Cambios sin guardar se conservan al re-renderizar", d.$("#gymBox #gBarLb").value, "35");
  ok("Sin errores de consola", d.errors.length === 0, d.errors.join("\n"));
}

// =====================================================================
group = "8. Export → import";
{
  const a = device();
  a.ev("current='lun';renderDay()");
  setUnit(a, "lun-remo", "samuel", "lb");
  saveSet(a, "lun-remo", "samuel", 0, 135, 8);
  setUnit(a, "lun-jalon", "lorena", "placas");
  a.ev("setCfg({pref:{lorena:'lb'},bar:{kg:15},mach:{'lun-jalon':{w:5,u:'kg',b:5}},at:new Date().toISOString()});persist('g')");
  const html = a.ev("buildExport()");
  ok("El archivo exportado lleva la config (g) en el seed", /"g":\{"pref":\{"lorena":"lb"\}/.test(html));
  ok("El archivo exportado no lleva el script de Supabase CDN", !html.includes("cdn.jsdelivr.net/npm/@supabase"));
  const b = device();
  const n = b.ev(`mergeIn(readSeed(${JSON.stringify(html)}))`);
  ok("Import combina datos", n > 0, n);
  eq("Import conserva serie en lb", b.ev("D.w.samuel['lun-remo'].h.slice(-1)[0].s[0]"), [135, 8, "lb"]);
  eq("Import conserva unidad elegida y peso tope", b.ev("[D.w.samuel['lun-remo'].u,D.w.samuel['lun-remo'].v,D.w.samuel['lun-remo'].vu]"), ["lb", 135, "lb"]);
  eq("Import conserva unidad sin historial (Lorena placas)", b.ev("D.w.lorena['lun-jalon'].u"), "placas");
  eq("Import conserva configuración", b.ev("[D.g.pref.lorena,D.g.bar.kg,D.g.mach['lun-jalon'].w]"), ["lb", 15, 5]);
  // Abrir el archivo exportado como app: el seed se aplica solo
  const c = device(); c.dom.window.close();
  const opened = new JSDOM(html, { url: "https://otro.test/", runScripts: "dangerously", beforeParse(w) { w.HTMLElement.prototype.scrollIntoView = () => {}; } });
  await sleep(30);
  eq("Archivo exportado abierto: aplica seed con unidades", opened.window.eval("[D.w.samuel['lun-remo'].u,D.g.bar.kg]"), ["lb", 15]);
  // Import de un archivo viejo (v1, sin unidades ni g)
  const old = { v: 1, at: "2026-01-01T00:00:00Z", w: { samuel: { "lun-banca": { v: 50, d: "2026-01-01", f: 50, fd: "2026-01-01", h: [{ d: "2026-01-01", s: [[50, 8]] }] } } }, c: {} };
  const d2 = device();
  d2.ev(`mergeIn(${JSON.stringify(old)})`);
  eq("Archivo v1 sin unidades se importa como kg", d2.ev("[D.w.samuel['lun-banca'].v,D.w.samuel['lun-banca'].vu||'kg',unitOf(ALLEX.find(e=>e.id==='lun-banca'),'samuel')]"), [50, "kg", "kg"]);
  eq("Archivo v1 no toca la configuración", d2.ev("D.g.bar.kg"), 20);
  ok("Sin errores de consola", a.errors.length + b.errors.length + d2.errors.length === 0, [...a.errors, ...b.errors, ...d2.errors].join("\n"));
}

// =====================================================================
group = "9. Adaptador Supabase (mock: upsert + realtime)";
{
  const server = makeServer();
  const A = device({ server }), B = device({ server });
  await sleep(80);
  eq("Dice 'Progreso compartido: se guarda para los tres.'", A.$("#sync").textContent, "Progreso compartido: se guarda para los tres.");
  A.ev("current='lun';renderDay()"); B.ev("current='lun';renderDay()");
  setUnit(A, "lun-banca", "samuel", "lb");
  saveSet(A, "lun-banca", "samuel", 0, 135, 8);
  await sleep(60);
  const today = A.ev("TODAY");
  const sDoc = server.rows.get(`s/${today}~samuel`), wDoc = server.rows.get("w/samuel");
  eq("Upsert s/<fecha>~samuel con unidad", sDoc && sDoc["lun-banca"][0], { kg: 135, reps: 8, u: "lb" });
  eq("Upsert w/samuel con [135, 8, 'lb'] y u", wDoc && [wDoc["lun-banca"].u, wDoc["lun-banca"].h.slice(-1)[0].s[0]], ["lb", [135, 8, "lb"]]);
  ok("Upsert incluye updated_at", server.upserts.every(r => typeof r.updated_at === "string"));
  await sleep(2000); // softRender espera 1,5 s sin toques
  eq("Realtime: el otro celular recibe la serie", B.ev("D.s.samuel['lun-banca'][0]"), { kg: 135, reps: 8, u: "lb" });
  const bRow = B.$('.ex[data-id="lun-banca"] .srow[data-p="samuel"][data-k="0"]');
  ok("Realtime: la fila aparece guardada sola en el otro celular", bRow && bRow.classList.contains("done") && bRow.querySelector(".ikg").value === "135", bRow && bRow.outerHTML.slice(0, 200));
  ok("Realtime: el selector del otro celular pasa a lb", B.$('.ex[data-id="lun-banca"] .useg[data-p="samuel"] [aria-pressed="true"]').dataset.u === "lb");
  // Config compartida
  const box = A.$("#gymBox"); box.querySelector("#gBarLb").value = "35"; box.querySelector("#gSave").click();
  await sleep(60);
  eq("Upsert cfg/gym", server.rows.get("cfg/gym") && server.rows.get("cfg/gym").bar.lb, 35);
  await sleep(2000);
  eq("Realtime: config llega al otro celular", B.ev("D.g.bar.lb"), 35);
  // Un celular nuevo lee todo al abrir
  const C = device({ server });
  await sleep(120);
  eq("Celular nuevo carga w, s y cfg desde Supabase", C.ev("[D.w.samuel['lun-banca'].u,D.s.samuel['lun-banca'][0].kg,D.g.bar.lb]"), ["lb", 135, 35]);
  // Eco de una escritura propia vieja no pisa una más nueva
  saveSet(A, "lun-banca", "samuel", 1, 135, 7);
  saveSet(A, "lun-banca", "samuel", 2, 135, 6);
  await sleep(2200);
  eq("Ecos no borran series recientes", A.ev("D.s.samuel['lun-banca'].filter(Boolean).length"), 3);
  ok("Sin errores de consola en ningún celular", A.errors.length + B.errors.length + C.errors.length === 0, [...A.errors, ...B.errors, ...C.errors].join("\n"));
}

// ---- Resumen ----
const groups = [...new Set(results.map(r => r.group))];
let fails = 0;
for (const g of groups) {
  const rs = results.filter(r => r.group === g), p = rs.filter(r => r.pass).length;
  console.log(`\n${p === rs.length ? "✔" : "✘"} ${g}  (${p}/${rs.length})`);
  rs.forEach(r => { if (!r.pass) { fails++; console.log(`   ✘ ${r.name}${r.extra ? "\n      " + r.extra : ""}`); } else console.log(`   ✔ ${r.name}`); });
}
console.log(`\nTOTAL: ${results.length - fails}/${results.length} pruebas OK`);
process.exit(fails ? 1 : 0);
