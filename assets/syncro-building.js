/* Syncro — exploded-view hero building v2 (canvas web component)
   <syncro-building progress="0..1"></syncro-building>
   Massing 1a: retail podium + twin rounded glass towers linked by a hanging skybridge.
   Camera: orbit + zoom across the scroll; tilts to top view for the 2D plan finale.
   Stages: 1 complete solid building → 2 envelope lifts → 3 MEP systems w/ flow → 4 BIM slab explode + deep piles → 5 plan + ring */
(function () {
  'use strict';
  if (customElements.get('syncro-building')) return;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const win = (p, a, b) => sm((p - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;

  const LIGHT = (a) => 'rgba(214,228,240,' + a + ')';
  const NAVYFILL = (a) => 'rgba(7,23,35,' + a + ')';
  const AMBER = '#F0A63F';
  const AMBER_A = (a) => 'rgba(240,166,63,' + a + ')';
  const GREEN = '#3FA47A';
  const BLUE = '#5B93C9';

  /* ---- massing (meters) ---- */
  const POD = { x0: 0, x1: 34, y0: 0, y1: 26, z0: 0, z1: 6 };            // retail podium
  const FL = [6, 9.6, 13.2, 16.8, 20.4, 24, 27.6, 31.2, 34.8];            // slab elevations
  const TWTOP = 34.8, PAR = 36;
  const BASE = -3.2;
  // twin towers (A = far, B = near) + skybridge
  const TWS = [
    { x0: 20, y0: 5, x1: 31, y1: 21, r: 3, core: [23, 11, 27, 17], cx: 25.5 },
    { x0: 0, y0: 5, x1: 11, y1: 21, r: 3, core: [4, 11, 8, 17], cx: 5.5 }
  ];
  const BR = { x0: 11, x1: 20, y0: 11, y1: 21, z0: 24, z1: 31.2 };
  const COLYS = [7, 13, 19];
  const towerCols = (tw) => [tw.x0 + 2, tw.x0 + 5.5, tw.x0 + 9];
  const STRIPX = [14, 17];                                                // podium-only columns between towers

  // rounded-rect outline in PLAN space
  const towerPlan = (tw) => {
    const r = tw.r, pts = [];
    const arc = (cxx, cyy, a0, a1) => {
      for (let i = 0; i <= 5; i++) {
        const a = a0 + (a1 - a0) * i / 5;
        pts.push([cxx + r * Math.cos(a), cyy + r * Math.sin(a)]);
      }
    };
    pts.push([tw.x0 + r, tw.y0]); pts.push([tw.x1 - r, tw.y0]);
    arc(tw.x1 - r, tw.y0 + r, -Math.PI / 2, 0);
    pts.push([tw.x1, tw.y1 - r]);
    arc(tw.x1 - r, tw.y1 - r, 0, Math.PI / 2);
    pts.push([tw.x0 + r, tw.y1]);
    arc(tw.x0 + r, tw.y1 - r, Math.PI / 2, Math.PI);
    pts.push([tw.x0, tw.y0 + r]);
    arc(tw.x0 + r, tw.y0 + r, Math.PI, Math.PI * 1.5);
    return pts;
  };
  // visible boundary chain (face x0 → visible rounded corner → face y1)
  const towerChain = (tw) => {
    const r = tw.r, pts = [];
    for (let y = tw.y0 + r; y <= tw.y1 - r; y += 2.2) pts.push([tw.x0, y]);
    for (let i = 1; i <= 4; i++) {
      const a = Math.PI - (Math.PI / 2) * (i / 5);
      pts.push([tw.x0 + r + r * Math.cos(a), tw.y1 - r + r * Math.sin(a)]);
    }
    for (let x = tw.x0 + r; x <= tw.x1 - r; x += 2.2) pts.push([x, tw.y1]);
    return pts;
  };

  class SyncroBuilding extends HTMLElement {
    static get observedAttributes() { return ['progress']; }
    constructor() {
      super();
      this._p = 0; this._raf = 0; this._flowT = 0; this._lastT = 0;
      this._reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    connectedCallback() {
      if (!this.canvas) {
        this.style.display = 'block';
        this.style.width = '100%';
        this.style.height = '100%';
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = 'width:100%;height:100%;display:block';
        this.appendChild(this.canvas);
        this._ro = new ResizeObserver(() => this.request());
        this._ro.observe(this);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.request());
      }
      this._p = parseFloat(this.getAttribute('progress')) || 0;
      this.request();
      setTimeout(() => this.request(), 400);
    }
    disconnectedCallback() { if (this._ro) this._ro.disconnect(); if (this._raf) cancelAnimationFrame(this._raf); this._raf = 0; }
    attributeChangedCallback(name) {
      if (name === 'progress') { this._p = parseFloat(this.getAttribute('progress')) || 0; this.request(); }
    }
    set progress(v) { this._p = +v || 0; this.request(); }
    get progress() { return this._p; }
    request() {
      if (this._raf) return;
      this._raf = requestAnimationFrame((t) => { this._raf = 0; this.tick(t); });
    }
    tick(t) {
      const dt = this._lastT ? Math.min(0.05, (t - this._lastT) / 1000) : 0.016;
      this._lastT = t;
      this._flowT += dt;
      this.draw();
      const p = this._p;
      if (!this._reduced && p > 0.30 && p < 0.66 && this.isConnected) this.request();
    }

    draw() {
      const cv = this.canvas; if (!cv) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = this.clientWidth, ch = this.clientHeight;
      if (!cw || !ch) return;
      if (cv.width !== Math.round(cw * dpr) || cv.height !== Math.round(ch * dpr)) {
        cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      // dusk backdrop: sky, amber horizon, city skyline, ground — persistent through the whole loop
      {
        const hy = ch * 0.56;
        const sky = ctx.createLinearGradient(0, 0, 0, hy);
        sky.addColorStop(0, '#0A1728');
        sky.addColorStop(0.5, '#12283F');
        sky.addColorStop(1, '#23394E');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, cw, hy + 1);
        // amber glow band above the horizon
        const gl2 = ctx.createLinearGradient(0, hy - ch * 0.16, 0, hy);
        gl2.addColorStop(0, 'rgba(206,124,32,0)');
        gl2.addColorStop(1, 'rgba(224,150,70,0.55)');
        ctx.fillStyle = gl2; ctx.fillRect(0, hy - ch * 0.16, cw, ch * 0.16 + 1);
        // stars (deterministic)
        const rnd = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
        ctx.fillStyle = 'rgba(214,228,240,0.5)';
        for (let i = 0; i < 46; i++) {
          const sx = rnd(i) * cw, sy = rnd(i + 97) * hy * 0.72;
          ctx.globalAlpha = 0.15 + 0.4 * rnd(i + 41);
          ctx.fillRect(sx, sy, 1.2, 1.2);
        }
        ctx.globalAlpha = 1;
        // city silhouettes on the horizon
        const BLD = [[0.00, 0.052, 0.055], [0.058, 0.10, 0.078], [0.128, 0.088, 0.102], [0.238, 0.058, 0.046], [0.318, 0.072, 0.066], [0.402, 0.05, 0.05], [0.695, 0.06, 0.10], [0.762, 0.05, 0.132], [0.818, 0.078, 0.116], [0.9, 0.05, 0.082], [0.952, 0.048, 0.06]];
        ctx.fillStyle = '#0A1626';
        for (const bd of BLD) ctx.fillRect(bd[0] * cw, hy - bd[2] * ch, bd[1] * cw, bd[2] * ch + 1);
        ctx.fillStyle = 'rgba(220,230,240,0.22)';
        for (let i = 0; i < BLD.length; i++) {
          const bd = BLD[i];
          for (let j = 0; j < 14; j++) {
            const wx = bd[0] * cw + rnd(i * 31 + j) * bd[1] * cw;
            const wy = hy - rnd(i * 17 + j + 5) * bd[2] * ch;
            ctx.globalAlpha = 0.1 + 0.3 * rnd(i * 7 + j + 13);
            ctx.fillRect(wx, wy, 1.1, 1.1);
          }
        }
        ctx.globalAlpha = 1;
        // ground
        const gr = ctx.createLinearGradient(0, hy, 0, ch);
        gr.addColorStop(0, '#0C1C2C');
        gr.addColorStop(0.25, '#091624');
        gr.addColorStop(1, '#06111B');
        ctx.fillStyle = gr; ctx.fillRect(0, hy, cw, ch - hy);
        // soft navy glow around center
        const gl = ctx.createRadialGradient(cw * 0.5, ch * 0.5, 0, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.55);
        gl.addColorStop(0, 'rgba(28,50,72,0.35)');
        gl.addColorStop(1, 'rgba(7,23,35,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(0, 0, cw, ch);
      }

      const p = this._p;
      const t2 = win(p, 0.10, 0.30);
      const t3 = win(p, 0.32, 0.52);
      const t4 = win(p, 0.54, 0.76);
      const t5 = win(p, 0.78, 1.00);

      /* ---- camera: orbit + zoom + tilt-to-plan ---- */
      const thetaDeg = lerp(62, 28, sm(win(p, 0, 0.78))) * (1 - t5);
      const th = thetaDeg * Math.PI / 180;
      const cosT = Math.cos(th), sinT = Math.sin(th);
      const k = lerp(0.52, 1, t5);
      const h = 1 - t5;
      const zoomBump = win(p, 0.32, 0.42) * (1 - win(p, 0.53, 0.62));
      const Z = 1 + 0.05 * sm(p) + 0.14 * zoomBump;
      const s = Math.min(cw * 0.8 / 56, ch * 0.6 / 58) * Z;
      // align with the photoreal render at the complete-building end, easing out as the model takes over
      const align = 1 - win(p, 0.06, 0.22);
      const cx = cw * 0.5, cy = ch * (0.52 + 0.025 * align);
      const CTRX = 15.5, CTRY = 13, CTRZ = 14;
      const P = (x, y, z) => {
        const dx = x - CTRX, dy = y - CTRY;
        const u = dx * cosT + dy * sinT;
        const v = -dx * sinT + dy * cosT;
        return [cx + u * s, cy + v * k * s - (z - CTRZ) * h * s];
      };

      const isoA = 1 - win(p, 0.78, 0.93);

      const line = (a, b, color, lw, alpha) => {
        ctx.strokeStyle = color; ctx.lineWidth = lw;
        ctx.globalAlpha = isoA * (alpha == null ? 1 : alpha);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      };
      const path = (pts, opts) => {
        opts = opts || {};
        ctx.globalAlpha = isoA * (opts.alpha == null ? 1 : opts.alpha);
        ctx.setLineDash(opts.dash || []);
        ctx.lineDashOffset = opts.dashOffset || 0;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        if (opts.close) ctx.closePath();
        if (opts.fill) { ctx.fillStyle = opts.fill; ctx.fill(); }
        if (opts.stroke) { ctx.strokeStyle = opts.stroke; ctx.lineWidth = opts.lw || 1; ctx.stroke(); }
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      };
      const towerPts = (tw, z) => towerPlan(tw).map((q) => P(q[0], q[1], z));
      const boxEdges = (x0, y0, z0, x1, y1, z1, color, lw, alpha) => {
        const t = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
        const b = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0)];
        path(t, { stroke: color, lw: lw, close: true, alpha: alpha });
        path(b, { stroke: color, lw: lw, close: true, alpha: alpha });
        for (let i = 0; i < 4; i++) line(t[i], b[i], color, lw, alpha);
      };
      const treeCircle = (x, y, z, r, alpha) => {
        const q0 = P(x, y, z);
        ctx.globalAlpha = isoA * alpha;
        ctx.strokeStyle = LIGHT(0.7); ctx.lineWidth = 1;
        ctx.save();
        ctx.translate(q0[0], q0[1]);
        ctx.scale(1, k);
        ctx.beginPath(); ctx.arc(0, 0, r * s, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, r * s * 0.25, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      };

      const lift4 = (i) => t4 * 1.7 * i;
      const slabStackIdx = (z) => {
        if (z <= 0) return 0;
        if (z === POD.z1) return 1;
        const j = FL.indexOf(z);
        return j >= 0 ? j + 1 : 1;
      };

      const LX = -0.45, LY = 0.89;
      const glassFill = (br, a) => {
        const R = Math.round(24 + 44 * br), G = Math.round(46 + 56 * br), B = Math.round(70 + 66 * br);
        return 'rgba(' + R + ',' + G + ',' + B + ',' + a + ')';
      };

      // all columns: per tower grid + podium strip
      const allCols = [];
      for (const tw of TWS) for (const x of towerCols(tw)) for (const y of COLYS) allCols.push([x, y, TWTOP]);
      for (const x of STRIPX) for (const y of COLYS) allCols.push([x, y, POD.z1]);

      if (isoA > 0.005) {

        /* ================= A0. site: plaza paving + landscaping (always) ================= */
        {
          const siteA = 1 - 0.5 * t4;
          path([P(-12, -3, 0), P(POD.x1 + 5, -3, 0), P(POD.x1 + 5, POD.y1 + 4, 0), P(-12, POD.y1 + 4, 0)],
            { close: true, stroke: LIGHT(0.14 * siteA), lw: 1 });
          for (let x = -10; x <= -2; x += 4) line(P(x, 0, 0), P(x, POD.y1, 0), LIGHT(0.11 * siteA), 1);
          for (let y = 2; y <= POD.y1 - 1; y += 4) line(P(-10, y, 0), P(-2, y, 0), LIGHT(0.11 * siteA), 1);
          for (const tc of [[-8, 3.2, 1.5], [-4.5, 2.2, 1.2], [-8.5, 13, 1.4], [-8, 22, 1.5], [-4, 24.5, 1.3]]) {
            treeCircle(tc[0], tc[1], 0, tc[2], 0.35 * siteA);
          }
        }

        /* ================= A. ground section + deep foundations (stage 4) ================= */
        if (t4 > 0.01) {
          const gA = t4;
          path([P(-16, -6, 0), P(POD.x1 + 8, -6, 0), P(POD.x1 + 8, POD.y1 + 6, 0), P(-16, POD.y1 + 6, 0)],
            { stroke: LIGHT(0.15 * gA), lw: 1, dash: [3, 8], close: true });
          boxEdges(POD.x0, POD.y0, BASE, POD.x1, POD.y1, 0, LIGHT(0.3 * gA), 1);
          const pd = 11.5 * t4;
          for (const c of allCols) {
            line(P(c[0] - 0.9, c[1], BASE), P(c[0] + 0.9, c[1], BASE), AMBER_A(0.85 * gA), Math.max(2, s * 0.18));
            line(P(c[0], c[1], BASE), P(c[0], c[1], BASE - pd), AMBER, Math.max(2.4, s * 0.26), 0.9 * gA);
            line(P(c[0] - 0.5, c[1], BASE - pd), P(c[0] + 0.5, c[1], BASE - pd), AMBER_A(0.7 * gA), Math.max(1.5, s * 0.12));
          }
          for (let d = 3; d <= 10; d += 3.5) {
            path([P(-16, -6, -d * t4), P(POD.x1 + 8, -6, -d * t4)], { stroke: LIGHT(0.1 * gA), lw: 1, dash: [2, 9] });
          }
        }

        /* ================= B. structure: slabs, columns, cores ================= */
        const stA = 0.3 + 0.62 * Math.max(t2, t3, t4);

        const colA = stA * (1 - 0.75 * t4);
        for (const c of allCols) {
          line(P(c[0], c[1], 0), P(c[0], c[1], c[2]), LIGHT(0.5 * colA), 1.4);
          if (t4 > 0.01 && t4 < 0.6) line(P(c[0], c[1], 0), P(c[0], c[1], c[2]), AMBER_A(0.5 * (1 - t4 / 0.6) * t4 * 4), 1.4);
        }

        if (t4 > 0.05) {
          const top = TWTOP + lift4(FL.length);
          path([P(5.5, 7, 0), P(5.5, 7, top)], { stroke: AMBER_A(0.55), lw: 1, dash: [3, 6], alpha: t4 });
          path([P(25.5, 19, 0), P(25.5, 19, top)], { stroke: AMBER_A(0.55), lw: 1, dash: [3, 6], alpha: t4 });
        }

        const podSlab = (z, i) => {
          const zz = z + lift4(i);
          path([P(POD.x0, POD.y0, zz), P(POD.x1, POD.y0, zz), P(POD.x1, POD.y1, zz), P(POD.x0, POD.y1, zz)],
            { close: true, stroke: LIGHT(0.55 * stA), lw: 1.1, fill: NAVYFILL(0.3 * stA) });
          path([P(POD.x0, POD.y1, zz - 0.35), P(POD.x0, POD.y0, zz - 0.35), P(POD.x1, POD.y0, zz - 0.35)],
            { stroke: LIGHT(0.4 * stA), lw: 1 });
        };
        podSlab(0, 0);
        podSlab(POD.z1, 1);

        // tower slabs (far tower first) + bridge slabs
        for (const tw of TWS) {
          for (let j = 1; j < FL.length; j++) {
            const z = FL[j] + lift4(j + 1);
            path(towerPts(tw, z), { close: true, stroke: LIGHT(0.55 * stA), lw: 1.1, fill: NAVYFILL(0.3 * stA) });
          }
        }
        for (const bz of [24, 27.6, 31.2]) {
          const z = bz + lift4(slabStackIdx(bz));
          path([P(BR.x0, BR.y0, z), P(BR.x1, BR.y0, z), P(BR.x1, BR.y1, z), P(BR.x0, BR.y1, z)],
            { close: true, stroke: LIGHT(0.5 * stA), lw: 1, fill: NAVYFILL(0.26 * stA) });
        }

        for (const tw of TWS) {
          boxEdges(tw.core[0], tw.core[1], 0, tw.core[2], tw.core[3], TWTOP, LIGHT(0.26 * stA * (1 - 0.5 * t4)), 1);
        }

        /* ================= C. MEP systems (stage 3, flow pulses, lift in stage 4) ================= */
        if (t3 > 0.01 && t4 < 0.999) {
          const zo = 14 * t4;
          const sysA = t3 * (1 - t4);
          const SP = (x, y, z) => P(x, y, z + zo);
          const segs = [];
          for (const tw of TWS) {
            const hx = tw.cx + 1.5, ex = tw.x0 + 2.5;
            // HVAC (green): rooftop shaft + per-floor duct runs
            segs.push({ c: GREEN, lw: Math.max(2.2, s * 0.26), pts: [[hx, 13, TWTOP + 1.4], [hx, 13, 7]] });
            for (let j = 1; j < FL.length; j++) {
              const z = FL[j] - 0.6;
              segs.push({ c: GREEN, lw: Math.max(2, s * 0.22), pts: [[tw.x0 + 2, 13, z], [tw.x1 - 2, 13, z]] });
            }
            // electrical (amber): riser + ceiling runs
            segs.push({ c: AMBER, lw: 1.6, pts: [[ex, 7, BASE + 1], [ex, 7, TWTOP]] });
            for (let j = 1; j < FL.length; j++) {
              const z = FL[j] - 0.3;
              segs.push({ c: AMBER, lw: 1.3, pts: [[ex, 7, z], [tw.x1 - 2, 7, z]] });
            }
            // plumbing (blue): wet-core risers + lower-floor branches
            segs.push({ c: BLUE, lw: 1.8, pts: [[tw.cx - 1, 17, BASE + 1], [tw.cx - 1, 17, TWTOP]] });
            segs.push({ c: BLUE, lw: 1.8, pts: [[tw.cx + 0.4, 17, BASE + 1], [tw.cx + 0.4, 17, TWTOP]] });
            for (const j of [1, 3, 5]) {
              const z = FL[j] - 1.2;
              segs.push({ c: BLUE, lw: 1.5, pts: [[tw.cx - 1, 17, z], [tw.x0 + 2, 17, z]] });
            }
          }
          // services crossing the skybridge — the two towers share systems
          segs.push({ c: GREEN, lw: Math.max(2, s * 0.22), pts: [[7, 15, 27], [24.5, 15, 27]] });
          segs.push({ c: AMBER, lw: 1.4, pts: [[2.5, 17, 25.5], [28, 17, 25.5]] });
          // podium retail loops
          segs.push({ c: AMBER, lw: 1.4, pts: [[3, 5.5, 5.4], [31, 5.5, 5.4]] });
          segs.push({ c: GREEN, lw: Math.max(2, s * 0.22), pts: [[31, 8, 5.2], [3, 8, 5.2]] });

          for (const sg of segs) {
            const pts = sg.pts.map((q) => SP(q[0], q[1], q[2]));
            path(pts, { stroke: sg.c, lw: sg.lw, alpha: sysA * 0.85 });
          }
          if (!this._reduced) {
            const off = -this._flowT * 26;
            for (const sg of segs) {
              const pts = sg.pts.map((q) => SP(q[0], q[1], q[2]));
              path(pts, { stroke: '#FFFFFF', lw: Math.max(1, sg.lw * 0.55), alpha: sysA * 0.6, dash: [2.5, 14], dashOffset: off });
            }
          }
          // equipment: rooftop AHUs on both towers + basement pump room
          boxEdges(2.5, 9, TWTOP + zo, 8, 13, TWTOP + 1.8 + zo, 'rgba(63,164,122,' + (0.7 * sysA) + ')', 1.2);
          boxEdges(22.5, 9, TWTOP + zo, 28, 13, TWTOP + 1.8 + zo, 'rgba(63,164,122,' + (0.7 * sysA) + ')', 1.2);
          boxEdges(29, 22, -2.8 + zo * 0.3, 33, 25, -1 + zo * 0.3, 'rgba(91,147,201,' + (0.65 * sysA * (t4 > 0.01 ? (1 - t4) : 1)) + ')', 1.2);
        }

        /* ================= D. envelope: closed solid building (stage 1) that lifts away (stage 2) ================= */
        const eA = Math.pow(1 - t2, 1.4);
        if (t2 < 0.999) {
          const lift = 20 * t2, push = 15 * t2;
          const tie = clamp(t2 * (1 - t2) * 4, 0, 0.5);

          /* --- podium roof terrace --- */
          path([P(POD.x0, POD.y0, POD.z1), P(POD.x1, POD.y0, POD.z1), P(POD.x1, POD.y1, POD.z1), P(POD.x0, POD.y1, POD.z1)],
            { close: true, fill: 'rgba(30,50,70,' + (0.85 * eA) + ')', stroke: LIGHT(0.4 * eA), lw: 1 });
          for (let x = 3; x < POD.x1; x += 4) line(P(x, POD.y0 + 1, POD.z1), P(x, POD.y1 - 1, POD.z1), LIGHT(0.08 * eA), 1);
          line(P(POD.x0, POD.y0, POD.z1 + 1.1), P(POD.x0, POD.y1, POD.z1 + 1.1), LIGHT(0.35 * eA), 1);
          line(P(POD.x0, POD.y1, POD.z1 + 1.1), P(POD.x1, POD.y1, POD.z1 + 1.1), LIGHT(0.35 * eA), 1);
          // roof-garden planting on the strip between the towers
          treeCircle(14, 8, POD.z1, 1.1, 0.5 * eA);
          treeCircle(17, 9.5, POD.z1, 0.9, 0.5 * eA);
          // shadow of the skybridge on the podium terrace
          path([P(BR.x0 + 1, BR.y0 + 1.4, POD.z1 + 0.02), P(BR.x1 - 0.5, BR.y0 + 1.4, POD.z1 + 0.02), P(BR.x1 - 0.5, BR.y1 + 1.4, POD.z1 + 0.02), P(BR.x0 + 1, BR.y1 + 1.4, POD.z1 + 0.02)],
            { close: true, fill: 'rgba(0,0,0,' + (0.24 * eA) + ')' });

          /* --- tower shells: shaded closed glass volumes (far tower, bridge, near tower) --- */
          const drawShell = (tw, withSignage) => {
            const ring = towerPlan(tw);
            const n = ring.length;
            const shellSegs = [];
            for (let i = 0; i < n; i++) {
              const a = ring[i], b = ring[(i + 1) % n];
              const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
              const v = -(mid[0] - CTRX) * sinT + (mid[1] - CTRY) * cosT;
              shellSegs.push({ a: a, b: b, v: v });
            }
            shellSegs.sort((q, w) => q.v - w.v);
            const ctrX2 = (tw.x0 + tw.x1) / 2, ctrY2 = (tw.y0 + tw.y1) / 2;
            for (const sg of shellSegs) {
              const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
              const len = Math.hypot(dx, dy) || 1;
              let nx = dy / len, ny = -dx / len;
              const mx2 = (sg.a[0] + sg.b[0]) / 2 - ctrX2;
              const my2 = (sg.a[1] + sg.b[1]) / 2 - ctrY2;
              if (nx * mx2 + ny * my2 < 0) { nx = -nx; ny = -ny; }
              const br = clamp(0.5 + 0.5 * (nx * LX + ny * LY), 0, 1);
              path([
                P(sg.a[0], sg.a[1], POD.z1 + lift), P(sg.b[0], sg.b[1], POD.z1 + lift),
                P(sg.b[0], sg.b[1], TWTOP + lift), P(sg.a[0], sg.a[1], TWTOP + lift)
              ], { close: true, fill: glassFill(br, 0.94 * eA) });
            }
            for (const z of FL) {
              if (z > POD.z1 && z < TWTOP) {
                path(towerPts(tw, z + lift), { close: true, stroke: NAVYFILL(0.85 * eA), lw: Math.max(1.4, s * 0.14) });
                path(towerPts(tw, z + lift), { close: true, stroke: LIGHT(0.22 * eA), lw: 1 });
              }
            }
            const chain = towerChain(tw);
            for (const q of chain) {
              line(P(q[0], q[1], POD.z1 + lift), P(q[0], q[1], TWTOP + lift), NAVYFILL(0.5 * eA), 1);
            }
            line(P(tw.x0, tw.y0 + tw.r, POD.z1 + lift), P(tw.x0, tw.y0 + tw.r, PAR + lift), LIGHT(0.55 * eA), 1.2);
            line(P(tw.x1 - tw.r, tw.y1, POD.z1 + lift), P(tw.x1 - tw.r, tw.y1, PAR + lift), LIGHT(0.55 * eA), 1.2);
            // roof deck + solid parapet band
            path(towerPts(tw, TWTOP + lift), { close: true, fill: 'rgba(40,60,82,' + (0.95 * eA) + ')', stroke: LIGHT(0.45 * eA), lw: 1 });
            for (const sg of shellSegs) {
              path([
                P(sg.a[0], sg.a[1], TWTOP + lift), P(sg.b[0], sg.b[1], TWTOP + lift),
                P(sg.b[0], sg.b[1], PAR + lift), P(sg.a[0], sg.a[1], PAR + lift)
              ], { close: true, fill: 'rgba(14,28,42,' + (0.92 * eA) + ')' });
            }
            path(towerPts(tw, PAR + lift), { close: true, stroke: LIGHT(0.6 * eA), lw: 1.3 });
            if (withSignage) {
              // SYNCRO wordmark on the front parapet — amber R
              const xm = (tw.x0 + tw.x1) / 2;
              const zSign = PAR - 0.62 + lift;
              const o = P(xm, tw.y1, zSign);
              const axp = P(xm + 1, tw.y1, zSign), azp = P(xm, tw.y1, zSign + 1);
              const ux = [axp[0] - o[0], axp[1] - o[1]];
              const uz = [azp[0] - o[0], azp[1] - o[1]];
              ctx.save();
              ctx.globalAlpha = isoA * eA;
              ctx.transform(ux[0], ux[1], -uz[0], -uz[1], o[0], o[1]);
              ctx.font = '300 0.95px Manrope, "IBM Plex Sans", sans-serif';
              ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
              const word = 'SYNCRO', LS = 0.29;
              const wArr = []; let tws = 0;
              for (const chL of word) { const wi = ctx.measureText(chL).width; wArr.push(wi); tws += wi + LS; }
              tws -= LS;
              let xw = -tws / 2;
              for (let i = 0; i < word.length; i++) {
                ctx.fillStyle = word[i] === 'R' ? AMBER : '#FFFFFF';
                ctx.fillText(word[i], xw, 0);
                xw += wArr[i] + LS;
              }
              ctx.restore();
            }
          };

          drawShell(TWS[0], false);

          /* --- skybridge: glass tube hanging between the towers --- */
          {
            const zb = BR.z0 + lift, zt = BR.z1 + lift;
            // front glass face, flush with the tower fronts
            path([P(BR.x0, BR.y1, zb), P(BR.x1, BR.y1, zb), P(BR.x1, BR.y1, zt), P(BR.x0, BR.y1, zt)],
              { close: true, fill: glassFill(0.9, 0.94 * eA) });
            // top deck
            path([P(BR.x0, BR.y0, zt), P(BR.x1, BR.y0, zt), P(BR.x1, BR.y1, zt), P(BR.x0, BR.y1, zt)],
              { close: true, fill: 'rgba(40,60,82,' + (0.95 * eA) + ')', stroke: LIGHT(0.45 * eA), lw: 1 });
            // mullions + mid floor band
            for (let x = BR.x0 + 1.5; x < BR.x1; x += 1.8) line(P(x, BR.y1, zb), P(x, BR.y1, zt), NAVYFILL(0.45 * eA), 1);
            line(P(BR.x0, BR.y1, 27.6 + lift), P(BR.x1, BR.y1, 27.6 + lift), NAVYFILL(0.85 * eA), Math.max(1.4, s * 0.14));
            // crisp edges + heavy soffit line so it reads as hanging
            line(P(BR.x0, BR.y1, zb), P(BR.x1, BR.y1, zb), LIGHT(0.6 * eA), 1.3);
            line(P(BR.x0, BR.y1, zt), P(BR.x1, BR.y1, zt), LIGHT(0.6 * eA), 1.3);
            line(P(BR.x0, BR.y1, zb - 0.35), P(BR.x1, BR.y1, zb - 0.35), NAVYFILL(0.85 * eA), Math.max(1.8, s * 0.18));
          }

          drawShell(TWS[1], true);

          /* --- podium storefront: solid base with glazed bays (faces slide away) --- */
          const bays = [0, 5.67, 11.33, 17, 22.67, 28.33, 34];
          {
            const fy = POD.y1 + push;
            const F = (x, z) => P(x, fy, z);
            path([F(0, 0), F(POD.x1, 0), F(POD.x1, POD.z1), F(0, POD.z1)],
              { close: true, fill: 'rgba(18,34,50,' + (0.95 * eA) + ')', stroke: LIGHT(0.55 * eA), lw: 1.2 });
            for (let b = 0; b < bays.length - 1; b++) {
              const x0 = bays[b] + 0.5, x1 = bays[b + 1] - 0.5;
              const isEntry = b === 3;
              path([F(x0, 0.35), F(x1, 0.35), F(x1, 4.6), F(x0, 4.6)],
                { close: true, fill: glassFill(isEntry ? 0.35 : 0.8, 0.55 * eA), stroke: LIGHT(0.3 * eA), lw: 1 });
              for (let x = x0 + 1.9; x < x1; x += 1.9) line(F(x, 0.35), F(x, 4.6), NAVYFILL(0.4 * eA), 1);
              if (isEntry) {
                line(F((x0 + x1) / 2, 0.35), F((x0 + x1) / 2, 3.2), LIGHT(0.6 * eA), 1.4);
                line(F(x0 - 0.3, 3.5), F(x1 + 0.3, 3.5), LIGHT(0.7 * eA), Math.max(2, s * 0.2));
              }
            }
            line(F(1, 5.35), F(POD.x1 - 1, 5.35), AMBER_A(0.9 * eA), 2);
          }
          {
            const fx = POD.x0 - push;
            const F = (y, z) => P(fx, y, z);
            path([F(0, 0), F(POD.y1, 0), F(POD.y1, POD.z1), F(0, POD.z1)],
              { close: true, fill: 'rgba(16,30,46,' + (0.95 * eA) + ')', stroke: LIGHT(0.55 * eA), lw: 1.2 });
            const ybays = [0, 6.5, 13, 19.5, 26];
            for (let b = 0; b < ybays.length - 1; b++) {
              const y0 = ybays[b] + 0.5, y1 = ybays[b + 1] - 0.5;
              path([F(y0, 0.35), F(y1, 0.35), F(y1, 4.6), F(y0, 4.6)],
                { close: true, fill: glassFill(0.55, 0.5 * eA), stroke: LIGHT(0.28 * eA), lw: 1 });
              for (let y = y0 + 1.9; y < y1; y += 1.9) line(F(y, 0.35), F(y, 4.6), NAVYFILL(0.4 * eA), 1);
            }
            line(F(1, 5.35), F(POD.y1 - 1, 5.35), AMBER_A(0.9 * eA), 2);
          }

          if (tie > 0.02) {
            path([P(TWS[1].x0, TWS[1].y0 + 3, TWTOP), P(TWS[1].x0, TWS[1].y0 + 3, TWTOP + lift)], { stroke: LIGHT(0.7), lw: 1, dash: [3, 5], alpha: tie });
            path([P(TWS[0].x1 - 3, TWS[0].y1, TWTOP), P(TWS[0].x1 - 3, TWS[0].y1, TWTOP + lift)], { stroke: LIGHT(0.7), lw: 1, dash: [3, 5], alpha: tie });
            path([P(POD.x0 - push, 13, 3), P(POD.x0, 13, 3)], { stroke: LIGHT(0.7), lw: 1, dash: [3, 5], alpha: tie });
            path([P(17, POD.y1, 3), P(17, POD.y1 + push, 3)], { stroke: LIGHT(0.7), lw: 1, dash: [3, 5], alpha: tie });
          }
        }
      }

      /* ================= E. 2D plan + Syncro ring (stage 5) ================= */
      const pA = win(p, 0.82, 0.96);
      if (pA > 0.005) {
        ctx.save();
        const ps = s;
        const M = (x, y) => [cx + (x - CTRX) * ps, cy + (y - CTRY) * ps];
        const g = (o) => clamp((win(p, 0.82, 1) - o) * 4, 0, 1) * Math.min(1, pA * 3);
        const pline = (a, b, color, lw, dash, al) => {
          ctx.globalAlpha = al == null ? pA : al;
          ctx.setLineDash(dash || []);
          ctx.strokeStyle = color; ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          ctx.setLineDash([]);
        };
        const rrect = (x0, y0, x1, y1, r, color, lw, dash, al) => {
          const a = M(x0, y0), b = M(x1, y1), rr = r * ps;
          ctx.globalAlpha = al == null ? pA : al;
          ctx.setLineDash(dash || []);
          ctx.strokeStyle = color; ctx.lineWidth = lw;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(a[0], a[1], b[0] - a[0], b[1] - a[1], rr);
          else ctx.rect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
          ctx.stroke();
          ctx.setLineDash([]);
        };
        ctx.font = '600 10px Manrope, "IBM Plex Sans", sans-serif';
        try { ctx.letterSpacing = '0.12em'; } catch (e) {}
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

        const gWalls = pA * g(0), gGrid = pA * g(0.06), gInner = pA * g(0.12), gDims = pA * g(0.2), gTitle = pA * g(0.28);

        const gridX = towerCols(TWS[1]).concat(towerCols(TWS[0]));
        for (let i = 0; i < gridX.length; i++) {
          const a = M(gridX[i], -3.4), b = M(gridX[i], POD.y1 + 1.5);
          pline(a, b, LIGHT(0.2), 1, [2, 5], gGrid * 0.9);
          ctx.globalAlpha = gGrid;
          ctx.strokeStyle = LIGHT(0.5); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(a[0], a[1] - 10, 9, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = LIGHT(0.85); ctx.fillText(String(i + 1), a[0], a[1] - 9.5);
        }
        const gl = ['A', 'B', 'C'];
        for (let i = 0; i < COLYS.length; i++) {
          const a = M(-11, COLYS[i]), b = M(POD.x1 + 1.5, COLYS[i]);
          pline(a, b, LIGHT(0.2), 1, [2, 5], gGrid * 0.9);
          ctx.globalAlpha = gGrid;
          ctx.strokeStyle = LIGHT(0.5); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(a[0] - 10, a[1], 9, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = LIGHT(0.85); ctx.fillText(gl[i], a[0] - 10, a[1] + 0.5);
        }

        rrect(POD.x0, POD.y0, POD.x1, POD.y1, 0, LIGHT(0.9), 2, null, gWalls);
        rrect(0.45, 0.45, POD.x1 - 0.45, POD.y1 - 0.45, 0, LIGHT(0.42), 1, null, gWalls);
        for (const tw of TWS) rrect(tw.x0, tw.y0, tw.x1, tw.y1, tw.r, LIGHT(0.6), 1.3, null, gWalls);
        // skybridge overhead — dashed
        rrect(BR.x0, BR.y0, BR.x1, BR.y1, 0, LIGHT(0.4), 1, [5, 4], gWalls);

        for (let x = 6; x < POD.x1; x += 7) pline(M(x, POD.y1 - 0.45), M(x, POD.y1 - 6), LIGHT(0.45), 1, null, gInner);
        for (let x = 3; x < POD.x1; x += 7) {
          const hinge = M(x, POD.y1 - 0.45);
          ctx.globalAlpha = gInner;
          ctx.strokeStyle = LIGHT(0.4); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(hinge[0], hinge[1], 1.8 * ps, -Math.PI / 2, 0); ctx.stroke();
          pline(hinge, M(x, POD.y1 - 2.25), LIGHT(0.4), 1, null, gInner);
        }
        for (const tw of TWS) {
          rrect(tw.core[0], tw.core[1], tw.core[2], tw.core[3], 0, LIGHT(0.6), 1.2, null, gInner);
          pline(M(tw.core[0], tw.core[1]), M(tw.core[2], tw.core[3]), LIGHT(0.35), 1, null, gInner);
          pline(M(tw.core[2], tw.core[1]), M(tw.core[0], tw.core[3]), LIGHT(0.35), 1, null, gInner);
        }
        for (const c of allCols) {
          const q = M(c[0], c[1]);
          ctx.globalAlpha = gInner * 0.95;
          ctx.fillStyle = AMBER;
          ctx.fillRect(q[0] - 0.32 * ps, q[1] - 0.32 * ps, 0.64 * ps, 0.64 * ps);
        }

        const d1a = M(POD.x0, POD.y1 + 3.2), d1b = M(POD.x1, POD.y1 + 3.2);
        pline(d1a, d1b, LIGHT(0.5), 1, null, gDims);
        pline(M(POD.x0, POD.y1 + 2.6), M(POD.x0, POD.y1 + 3.8), LIGHT(0.5), 1, null, gDims);
        pline(M(POD.x1, POD.y1 + 2.6), M(POD.x1, POD.y1 + 3.8), LIGHT(0.5), 1, null, gDims);
        ctx.globalAlpha = gDims; ctx.fillStyle = LIGHT(0.85);
        ctx.fillText('34.00', (d1a[0] + d1b[0]) / 2, d1a[1] - 9);
        const d2a = M(POD.x1 + 3.2, POD.y0), d2b = M(POD.x1 + 3.2, POD.y1);
        pline(d2a, d2b, LIGHT(0.5), 1, null, gDims);
        pline(M(POD.x1 + 2.6, POD.y0), M(POD.x1 + 3.8, POD.y0), LIGHT(0.5), 1, null, gDims);
        pline(M(POD.x1 + 2.6, POD.y1), M(POD.x1 + 3.8, POD.y1), LIGHT(0.5), 1, null, gDims);
        ctx.save();
        ctx.globalAlpha = gDims;
        ctx.translate(d2a[0] + 12, (d2a[1] + d2b[1]) / 2);
        ctx.rotate(Math.PI / 2);
        ctx.fillText('26.00', 0, 0);
        ctx.restore();

        ctx.textAlign = 'left';
        const tb = M(-11, POD.y1 + 5.6);
        ctx.globalAlpha = gTitle;
        ctx.fillStyle = AMBER;
        ctx.fillRect(tb[0], tb[1] - 4, 8, 8);
        ctx.fillStyle = LIGHT(0.9);
        ctx.font = '600 11px Manrope, "IBM Plex Sans", sans-serif';
        ctx.fillText('LEVEL 01 \u2014 FLOOR PLAN', tb[0] + 16, tb[1]);
        ctx.fillStyle = LIGHT(0.5);
        ctx.font = '500 10px Manrope, "IBM Plex Sans", sans-serif';
        ctx.fillText('SYNCRO \u00B7 PRJ-04 \u00B7 1:200', tb[0] + 16, tb[1] + 16);

        const ringT = sm(win(p, 0.88, 1));
        if (ringT > 0.01) {
          const rc = M(-6, 3.5);
          const R = Math.min(cw, ch) * 0.085;
          const fills = [0.8, 0.6, 0.4], radii = [R, R * 2 / 3, R / 3];
          ctx.lineCap = 'round';
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = pA * (0.35 + 0.65 * ringT);
            ctx.strokeStyle = AMBER;
            ctx.lineWidth = Math.max(3, R * 0.14);
            ctx.beginPath();
            ctx.arc(rc[0], rc[1], radii[i], Math.PI, Math.PI + Math.PI * 2 * fills[i] * ringT);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    }
  }
  customElements.define('syncro-building', SyncroBuilding);
})();
