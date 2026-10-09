(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var PAD = { l: 86, t: 74, r: 22, b: 20 };
  var RUST = '#9d341f';
  var INK = '#1c1a17';
  var PALETTE = [
    ['#e4c98a', '#a6843c'],
    ['#b7c9d6', '#5f7f98'],
    ['#e6b29a', '#b15f3d'],
    ['#c7d2b0', '#6d7d52'],
    ['#dcc6e4', '#8a6b9c'],
    ['#ead79a', '#a08638'],
    ['#b5d3cd', '#3f7f76'],
    ['#e6c4c0', '#a15e58'],
    ['#d8c6a2', '#8a7040'],
    ['#c8c6e2', '#66639c']
  ];

  var state = {
    result: null,
    dirty: false,
    zoom: 1,
    hotId: null,
    pinned: null,
    animToken: 0,
    animTimer: 0,
    animDone: 0,
    rowSeq: 1,
    gen: 0
  };
  var tweenToken = 0;

  var sheetW = document.getElementById('sheetW');
  var sheetH = document.getElementById('sheetH');
  var kerfInput = document.getElementById('kerf');
  var partList = document.getElementById('partList');
  var stage = document.getElementById('stage');

  function fmtMm(n) {
    var sign = n < 0 ? '-' : '';
    var v = Math.abs(Math.round(n * 1000) / 1000);
    var bits = String(v).split('.');
    bits[0] = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sign + bits[0] + (bits[1] ? ',' + bits[1] : '');
  }

  function fmtFixed(n, digits) {
    var sign = n < 0 ? '-' : '';
    var parts = Math.abs(n).toFixed(digits).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sign + parts[0] + (parts[1] ? ',' + parts[1] : '');
  }

  function fmtArea(mm2) {
    var m2 = mm2 / 1e6;
    if (Math.abs(m2) >= 0.01 || mm2 === 0) return fmtFixed(m2, 2) + ' m²';
    return fmtFixed(mm2 / 100, 0) + ' cm²';
  }

  function fmtPct(ratio) {
    var v = Math.round(ratio * 1000) / 10;
    if (Number.isInteger(v)) return String(v) + '%';
    return v.toFixed(1).replace('.', ',') + '%';
  }

  function xl(n) {
    return String(Math.round(n * 1000) / 1000).replace('.', ',');
  }

  function setStatus(text) {
    document.getElementById('status').textContent = text;
  }

  function dxfMessage(parsed) {
    if (parsed.error) return parsed.error;
    var extra = parsed.skipped ? ' ' + parsed.skipped + ' şekil dikdörtgen değil. Eklenmedi.' : '';
    if (!parsed.parts.length) return 'DXF içinde kapalı dikdörtgen yok.' + extra;
    var total = 0;
    parsed.parts.forEach(function (part) { total += part.qty; });
    var msg = total + ' parça geldi. ' + parsed.parts.length + ' çeşit.';
    var word = {
      in: 'inç',
      ft: 'fit',
      cm: 'cm',
      m: 'm',
      yd: 'yard',
      um: 'mikron',
      dm: 'dm',
      dam: 'dam'
    }[parsed.unit];
    if (parsed.assumedUnit) msg += ' Birim mm kabul edildi.';
    else if (word) msg += ' Birim ' + word + ', mm ye çevrildi.';
    return msg + extra;
  }

  function setTitle() {
    var result = state.result;
    if (!result || state.dirty || !result.sheets.length) document.title = 'Levha yerleşimi';
    else document.title = result.sheets.length + ' levha · ' + fmtPct(result.yieldRatio) + ' · Levha yerleşimi';
  }

  function field(name, label, placeholder, mode) {
    var input = document.createElement('input');
    input.dataset.field = name;
    input.setAttribute('aria-label', label);
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.inputMode = mode;
    input.className = 'cell';
    return input;
  }

  function addRow(values) {
    var row = document.createElement('div');
    row.className = 'part-row';
    row.dataset.id = 'r' + state.rowSeq++;
    row.appendChild(field('name', 'Ad', 'ad', 'text'));
    row.appendChild(field('w', 'En', 'en', 'decimal'));
    row.appendChild(field('h', 'Boy', 'boy', 'decimal'));
    row.appendChild(field('qty', 'Adet', '1', 'numeric'));
    var sil = document.createElement('button');
    sil.type = 'button';
    sil.className = 'sil';
    sil.textContent = 'Sil';
    sil.addEventListener('click', function () { deleteRow(row); });
    row.appendChild(sil);
    if (values) {
      row.querySelector('[data-field="name"]').value = values.name || '';
      row.querySelector('[data-field="w"]').value = fmtMm(values.width);
      row.querySelector('[data-field="h"]').value = fmtMm(values.height);
      row.querySelector('[data-field="qty"]').value = String(values.qty);
    }
    partList.appendChild(row);
    return row;
  }

  function deleteRow(row) {
    if (partList.children.length === 1) {
      row.querySelectorAll('input').forEach(function (input) { input.value = ''; });
    } else {
      var focus = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      if (focus) focus.querySelector('[data-field="w"]').focus();
    }
    onEdit('part');
  }

  function isRowEmpty(row) {
    return Array.prototype.every.call(row.querySelectorAll('input'), function (input) {
      return !input.value.trim();
    });
  }

  function readRows() {
    return Array.prototype.map.call(partList.querySelectorAll('.part-row'), function (row) {
      return {
        id: row.dataset.id,
        row: row,
        name: row.querySelector('[data-field="name"]').value,
        width: SheetPacker.readNumber(row.querySelector('[data-field="w"]').value),
        height: SheetPacker.readNumber(row.querySelector('[data-field="h"]').value),
        qty: SheetPacker.readNumber(row.querySelector('[data-field="qty"]').value)
      };
    });
  }

  function inspect() {
    document.querySelectorAll('.is-bad').forEach(function (el) { el.classList.remove('is-bad'); });
    var width = SheetPacker.readNumber(sheetW.value);
    var height = SheetPacker.readNumber(sheetH.value);
    var kerf = SheetPacker.readNumber(kerfInput.value);
    var allowRotate = document.getElementById('rotate').checked;
    var mode = document.getElementById('modeGuillotine').checked ? 'guillotine' : 'free';
    var base = { allowRotate: allowRotate, mode: mode, parts: [], pieceCount: 0, sheetWidth: width, sheetHeight: height, kerf: kerf };

    if (width == null || Number.isNaN(width) || width <= 0) return fail(base, 'Levha eni sıfırdan büyük bir sayı olmalı.', sheetW);
    if (height == null || Number.isNaN(height) || height <= 0) return fail(base, 'Levha boyu sıfırdan büyük bir sayı olmalı.', sheetH);
    if (width > 50000 || height > 50000) return fail(base, 'Levha ölçüsü 50 m altında olmalı.');
    if (kerf == null || Number.isNaN(kerf) || kerf < 0) return fail(base, 'Bıçak payı sıfır veya daha büyük olmalı.', kerfInput);

    var parts = [];
    var pieceCount = 0;
    var rows = readRows();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var empty = !row.name.trim() && row.width == null && row.height == null && row.qty == null;
      if (empty) continue;
      if (row.width == null || Number.isNaN(row.width)) return fail(base, (i + 1) + '. satırda en sayı olmalı.', row.row.querySelector('[data-field="w"]'), parts, pieceCount);
      if (row.height == null || Number.isNaN(row.height)) return fail(base, (i + 1) + '. satırda boy sayı olmalı.', row.row.querySelector('[data-field="h"]'), parts, pieceCount);
      if (!(row.width > 0) || !(row.height > 0)) return fail(base, (i + 1) + '. satırda en ve boy sıfırdan büyük olmalı.', row.row.querySelector('[data-field="w"]'), parts, pieceCount);
      if (row.width > 50000 || row.height > 50000) return fail(base, 'Parça ölçüsü 50 m altında olmalı.', null, parts, pieceCount);
      var qty = row.qty == null ? 1 : row.qty;
      if (Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) return fail(base, (i + 1) + '. satırda adet 1 veya daha büyük bir tam sayı olmalı.', row.row.querySelector('[data-field="qty"]'), parts, pieceCount);
      if (qty > 500) return fail(base, 'Bir satırda en fazla 500 adet.', row.row.querySelector('[data-field="qty"]'), parts, pieceCount);
      pieceCount += qty;
      if (pieceCount > 1500) return fail(base, 'En fazla 1.500 parça. Adedi böl.', null, parts, pieceCount);
      parts.push({ id: row.id, name: row.name.trim(), width: row.width, height: row.height, qty: qty });
    }
    if (!parts.length) return fail(base, 'Parça ölçüsü gir.');
    return {
      ok: true,
      message: '',
      sheetWidth: width,
      sheetHeight: height,
      kerf: kerf,
      allowRotate: allowRotate,
      mode: mode,
      parts: parts,
      pieceCount: pieceCount
    };
  }

  function fail(base, message, input, parts, pieceCount) {
    if (input) input.classList.add('is-bad');
    return {
      ok: false,
      message: message,
      sheetWidth: base.sheetWidth,
      sheetHeight: base.sheetHeight,
      kerf: base.kerf,
      allowRotate: base.allowRotate,
      mode: base.mode,
      parts: parts || [],
      pieceCount: pieceCount || 0
    };
  }

  function syncChips(job) {
    document.querySelectorAll('[data-sheet]').forEach(function (btn) {
      var bits = btn.dataset.sheet.split('x').map(Number);
      var on = bits[0] === job.sheetWidth && bits[1] === job.sheetHeight;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-kerf]').forEach(function (btn) {
      var on = Number(btn.dataset.kerf) === job.kerf;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var fit = document.getElementById('zoomFit');
    fit.classList.toggle('is-on', state.zoom === 1);
    fit.setAttribute('aria-pressed', state.zoom === 1 ? 'true' : 'false');
  }

  function renderRunLine(job) {
    var line = document.getElementById('runline');
    if (!job.ok) {
      line.textContent = job.message;
      return;
    }
    var cut = job.mode === 'guillotine' ? 'giyotin' : 'serbest';
    line.textContent = fmtMm(job.sheetWidth) + '×' + fmtMm(job.sheetHeight) + ' mm · pay ' + fmtMm(job.kerf) + ' mm · ' + cut + ' · ' + job.pieceCount + ' parça';
  }

  function renderPartSummary(job) {
    var el = document.getElementById('partSummary');
    if (!job.pieceCount) {
      el.textContent = '';
      return;
    }
    var area = job.parts.reduce(function (sum, part) {
      return sum + part.width * part.height * part.qty;
    }, 0);
    el.textContent = job.pieceCount + ' parça · ' + fmtArea(area);
  }

  function renderHint(job) {
    var kerf = job.kerf;
    var gap = 'Bıçak payını gir.';
    if (typeof kerf === 'number' && !Number.isNaN(kerf) && kerf >= 0) {
      gap = kerf === 0 ? 'Parçalar bitişik.' : 'Parçalar arasında ' + fmtMm(kerf) + ' mm boşluk kalır.';
    }
    var cut = job.mode === 'guillotine' ? 'Kesim boydan boya gider.' : 'Serbest yerleşim fireyi azaltır.';
    document.getElementById('modeHint').textContent = gap + ' ' + cut;
  }

  function refresh() {
    var job = inspect();
    syncChips(job);
    renderRunLine(job);
    renderPartSummary(job);
    renderHint(job);
    renderDetail(job.kerf, state.result && !state.dirty ? state.result : null);
    document.getElementById('optimize').disabled = !job.ok;
    var stale = document.getElementById('stale');
    if (state.result && state.dirty) {
      stale.hidden = false;
      setStatus('Sonuç eski. Yeniden optimize et.');
    } else {
      stale.hidden = true;
      if (!state.result) setStatus('Parçaları gir. Bıçak payını seç. Optimize et.');
    }
    setTitle();
    return job;
  }

  function onEdit(source) {
    if (state.result) {
      state.dirty = true;
    } else if (source === 'sheet') {
      renderGhost();
    }
    refresh();
  }

  function svgEl(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function svgText(parent, x, y, value, attrs) {
    var node = svgEl('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
    node.textContent = value;
    return node;
  }

  function line(parent, x1, y1, x2, y2, stroke) {
    return svgEl('line', { x1: x1, y1: y1, x2: x2, y2: y2, stroke: stroke || RUST, 'stroke-width': '1' }, parent);
  }

  function tick(parent, x, y) {
    line(parent, x - 3, y + 4, x + 3, y - 4);
  }

  function baseFit(sheetWm, sheetHm) {
    var maxW = Math.max(320, stage.clientWidth - 120);
    var maxH = Math.min(760, Math.max(420, window.innerHeight * 0.7));
    return Math.min((maxW - PAD.l - PAD.r) / sheetWm, (maxH - PAD.t - PAD.b) / sheetHm);
  }

  function viewScale(sheetWm, sheetHm) {
    var scale = baseFit(sheetWm, sheetHm) * state.zoom;
    var longest = Math.max(sheetWm, sheetHm) * scale;
    if (longest > 5200) scale *= 5200 / longest;
    return scale;
  }

  function readableZoom(result) {
    var fit = baseFit(result.sheetWidth, result.sheetHeight);
    var sides = [];
    result.sheets.forEach(function (sheet) {
      sheet.placements.forEach(function (piece) {
        sides.push(Math.min(piece.width, piece.height));
      });
    });
    if (!sides.length || !(fit > 0)) return 1;
    sides.sort(function (a, b) { return a - b; });
    var median = sides[Math.floor((sides.length - 1) / 2)];
    var widthCap = ((stage.clientWidth - 96) - PAD.l - PAD.r) / (result.sheetWidth * fit);
    var zoom = Math.min(4, widthCap, (72 / median) / fit);
    if (!(zoom > 1.15)) return 1;
    return zoom;
  }

  function colorMap(result) {
    var map = new Map();
    if (!result) return map;
    result.sheets.forEach(function (sheet) {
      sheet.placements.forEach(function (piece) {
        if (!map.has(piece.partId)) map.set(piece.partId, map.size);
      });
    });
    return map;
  }

  function colorsFor(map, partId) {
    var index = map.has(partId) ? map.get(partId) : 0;
    return { fill: PALETTE[index % PALETTE.length][0], hatch: PALETTE[index % PALETTE.length][1], index: index };
  }

  function drawDims(svg, sx, sy, sw, sh, labelW, labelH) {
    var y = sy - 30;
    var x = sx - 40;
    line(svg, sx, sy - 6, sx, y - 6);
    line(svg, sx + sw, sy - 6, sx + sw, y - 6);
    line(svg, sx, y, sx + sw, y);
    tick(svg, sx, y);
    tick(svg, sx + sw, y);
    svgText(svg, sx + sw / 2, y - 8, labelW, {
      fill: RUST, 'font-size': '14', 'font-weight': '600', 'text-anchor': 'middle'
    });
    line(svg, sx - 6, sy, x - 6, sy);
    line(svg, sx - 6, sy + sh, x - 6, sy + sh);
    line(svg, x, sy, x, sy + sh);
    tick(svg, x, sy);
    tick(svg, x, sy + sh);
    svgText(svg, x - 12, sy + sh / 2, labelH, {
      fill: RUST,
      'font-size': '14',
      'font-weight': '600',
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      transform: 'rotate(-90 ' + (x - 12) + ' ' + (sy + sh / 2) + ')'
    });
  }

  function drawSheetSvg(opts) {
    var scale = viewScale(opts.sheetW, opts.sheetH);
    var sw = opts.sheetW * scale;
    var sh = opts.sheetH * scale;
    var svg = svgEl('svg', {
      class: 'sheet-svg' + (opts.animate ? ' is-play' : ' is-still'),
      width: PAD.l + sw + PAD.r,
      height: PAD.t + sh + PAD.b,
      viewBox: '0 0 ' + (PAD.l + sw + PAD.r) + ' ' + (PAD.t + sh + PAD.b)
    });
    var defs = svgEl('defs', {}, svg);
    var grad = svgEl('linearGradient', { id: 'metal' + opts.gen, x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    svgEl('stop', { offset: '0', 'stop-color': '#e1e5e9' }, grad);
    svgEl('stop', { offset: '1', 'stop-color': '#c5cacf' }, grad);
    var sx = PAD.l;
    var sy = PAD.t;
    svgEl('rect', {
      x: sx, y: sy, width: sw, height: sh,
      fill: 'url(#metal' + opts.gen + ')',
      stroke: INK, 'stroke-width': '1.5'
    }, svg);
    drawDims(svg, sx, sy, sw, sh, fmtMm(opts.sheetW), fmtMm(opts.sheetH));

    var seen = {};
    opts.placements.forEach(function (piece) {
      if (seen[piece.partId]) return;
      seen[piece.partId] = true;
      var tone = colorsFor(opts.colors, piece.partId);
      var pid = 'h' + opts.gen + '-' + piece.partId;
      var pattern = svgEl('pattern', {
        id: pid,
        width: '8',
        height: '8',
        patternUnits: 'userSpaceOnUse',
        patternTransform: 'rotate(' + (35 + (tone.index % 5) * 18) + ')'
      }, defs);
      svgEl('rect', { width: '8', height: '8', fill: tone.fill }, pattern);
      svgEl('path', {
        d: 'M-2 2 L2 -2 M0 8 L8 0 M6 10 L10 6',
        stroke: tone.hatch,
        'stroke-width': '1.2',
        fill: 'none'
      }, pattern);
    });

    opts.placements.forEach(function (piece) {
      var x = sx + piece.x * scale;
      var y = sy + piece.y * scale;
      var w = piece.width * scale;
      var h = piece.height * scale;
      var g = svgEl('g', { class: 'piece' }, svg);
      g.dataset.piece = piece.id;
      g.dataset.part = piece.partId;
      g.dataset.i = String(piece.order);
      if (opts.gap != null) g.style.animationDelay = (piece.order * opts.gap) + 'ms';
      var title = svgEl('title', {}, g);
      title.textContent = piece.name + ' · ' + fmtMm(piece.width) + '×' + fmtMm(piece.height) + ' mm · X ' + fmtMm(piece.x) + ' · Y ' + fmtMm(piece.y);
      svgEl('rect', {
        class: 'face',
        x: x, y: y, width: Math.max(0.5, w), height: Math.max(0.5, h),
        fill: 'url(#h' + opts.gen + '-' + piece.partId + ')',
        stroke: INK, 'stroke-opacity': '0.55', 'stroke-width': '1'
      }, g);
      var sizeText = fmtMm(piece.width) + '×' + fmtMm(piece.height);
      var nameText = piece.rotated ? piece.name + ' · 90°' : piece.name;
      function textFits(value, fontSize) {
        return value.length * fontSize * 0.56 <= w - 8;
      }
      if (w >= 36 && h >= 16) {
        var clipId = 'c' + opts.gen + '-' + piece.id;
        var clip = svgEl('clipPath', { id: clipId }, defs);
        svgEl('rect', { x: x, y: y, width: w, height: h }, clip);
        var labels = svgEl('g', { 'clip-path': 'url(#' + clipId + ')' }, g);
        var nameSize = w >= 70 ? 13 : 11;
        var sizeSize = w >= 70 ? 12 : 11;
        var showName = textFits(nameText, nameSize);
        var showSize = textFits(sizeText, sizeSize);
        if (showName && showSize && h >= 42) {
          svgText(labels, x + w / 2, y + h / 2 - 7, nameText, {
            fill: INK, 'font-size': nameSize, 'font-weight': '600', 'text-anchor': 'middle'
          });
          svgText(labels, x + w / 2, y + h / 2 + 9, sizeText, {
            fill: INK, 'font-size': sizeSize, 'text-anchor': 'middle'
          });
        } else if (showName || showSize) {
          svgText(labels, x + w / 2, y + h / 2, showName ? nameText : sizeText, {
            fill: INK, 'font-size': showName ? nameSize : sizeSize, 'font-weight': showName ? '600' : '400',
            'text-anchor': 'middle', 'dominant-baseline': 'middle'
          });
        }
      }
    });
    return svg;
  }

  function renderGhost() {
    var host = document.getElementById('sheets');
    host.replaceChildren();
    document.getElementById('legend').replaceChildren();
    document.getElementById('cutlist').replaceChildren();
    document.getElementById('warning').replaceChildren();
    var w = SheetPacker.readNumber(sheetW.value);
    var h = SheetPacker.readNumber(sheetH.value);
    if (!(w > 0) || !(h > 0) || w > 50000 || h > 50000) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Levha ölçüsünü gir. Çizim burada durur.';
      host.appendChild(empty);
      return;
    }
    var card = sheetCard('Levha', 'Parçalar optimize edilince buraya oturur.');
    card.appendChild(drawSheetSvg({
      sheetW: w,
      sheetH: h,
      placements: [],
      colors: new Map(),
      animate: false,
      gen: ++state.gen
    }));
    host.appendChild(card);
  }

  function sheetCard(title, sub) {
    var card = document.createElement('article');
    card.className = 'sheet-card' + (state.zoom > 1 ? ' is-zoomed' : '');
    var h2 = document.createElement('h2');
    h2.className = 'card-title';
    h2.textContent = title;
    var p = document.createElement('p');
    p.className = 'sheet-sub';
    p.textContent = sub;
    card.append(h2, p);
    return card;
  }

  function renderStats(result, animate) {
    var sheetsEl = document.getElementById('statSheets');
    var yieldEl = document.getElementById('statYield');
    var wasteEl = document.getElementById('statWaste');
    var token = ++tweenToken;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!result.sheets.length) {
      sheetsEl.textContent = '0';
      yieldEl.textContent = '—';
      wasteEl.textContent = '—';
      return;
    }
    if (!animate || reduce) {
      sheetsEl.textContent = String(result.sheets.length);
      yieldEl.textContent = fmtPct(result.yieldRatio);
      wasteEl.textContent = fmtArea(result.wasteArea);
      return;
    }
    var start = performance.now();
    function frame(now) {
      if (token !== tweenToken) return;
      var t = Math.min(1, (now - start) / 600);
      var e = 1 - Math.pow(1 - t, 3);
      sheetsEl.textContent = String(Math.round(result.sheets.length * e));
      yieldEl.textContent = fmtPct(result.yieldRatio * e);
      wasteEl.textContent = fmtArea(result.wasteArea * e);
      if (t < 1) requestAnimationFrame(frame);
      else {
        sheetsEl.textContent = String(result.sheets.length);
        yieldEl.textContent = fmtPct(result.yieldRatio);
        wasteEl.textContent = fmtArea(result.wasteArea);
      }
    }
    requestAnimationFrame(frame);
  }

  function renderWarning(result) {
    var host = document.getElementById('warning');
    host.replaceChildren();
    if (!result.unplaced.length) return;
    var groups = new Map();
    result.unplaced.forEach(function (item) {
      if (!groups.has(item.partId)) groups.set(item.partId, Object.assign({ count: 0 }, item));
      groups.get(item.partId).count += 1;
    });
    var box = document.createElement('div');
    box.className = 'warning';
    var shown = 0;
    groups.forEach(function (item) {
      if (shown >= 4) return;
      shown += 1;
      var p = document.createElement('p');
      var size = fmtMm(item.width) + '×' + fmtMm(item.height) + ' mm';
      var count = item.count > 1 ? ', ' + item.count + ' adet' : '';
      if (item.fitsIfRotated) {
        p.textContent = item.name + ' ' + size + count + ' sığmıyor. 90° döndür seçeneğini aç.';
      } else {
        p.textContent = item.name + ' ' + size + count + ' sığmıyor. Levha ' + fmtMm(result.sheetWidth) + '×' + fmtMm(result.sheetHeight) + ' mm. Parçayı böl veya levhayı büyüt.';
      }
      box.appendChild(p);
    });
    if (groups.size > shown) {
      var more = document.createElement('p');
      more.textContent = 've ' + (groups.size - shown) + ' çeşit daha.';
      box.appendChild(more);
    }
    host.appendChild(box);
  }

  function doneMessage(result) {
    if (result.unplaced.length && result.sheets.length) return 'Yerleşti. Sığmayan parça var.';
    if (result.unplaced.length) return 'Sığmayan parça var.';
    return 'Yerleşti';
  }

  function renderSheets(result, animate) {
    stopAnim();
    var host = document.getElementById('sheets');
    host.replaceChildren();
    var total = result.sheets.reduce(function (sum, sheet) { return sum + sheet.placements.length; }, 0);
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var motion = animate && !reduce && total > 0;
    var gap = Math.min(110, Math.max(24, 3600 / Math.max(1, total)));
    var colors = colorMap(result);
    var gen = ++state.gen;
    var order = 0;
    result.sheets.forEach(function (sheet) {
      var pct = fmtPct(sheet.partArea / (result.sheetWidth * result.sheetHeight));
      var card = sheetCard(
        'Levha ' + sheet.index,
        fmtMm(result.sheetWidth) + '×' + fmtMm(result.sheetHeight) + ' mm · ' + sheet.placements.length + ' parça · ' + pct + ' · köşe sol üst'
      );
      var placements = sheet.placements.map(function (piece) {
        var copy = Object.assign({}, piece);
        copy.order = order++;
        return copy;
      });
      card.appendChild(drawSheetSvg({
        sheetW: result.sheetWidth,
        sheetH: result.sheetHeight,
        placements: placements,
        colors: colors,
        animate: motion,
        gap: gap,
        gen: gen + '-' + sheet.index
      }));
      host.appendChild(card);
    });
    if (!motion) return;
    var token = state.animToken;
    setStatus('Yerleşiyor · 1/' + total);
    function finish() {
      if (token !== state.animToken || state.animDone === token) return;
      state.animDone = token;
      clearTimeout(state.animTimer);
      document.querySelectorAll('.sheet-svg').forEach(function (svg) {
        svg.classList.remove('is-play');
        svg.classList.add('is-still');
      });
      applyHot();
      setStatus(doneMessage(result));
    }
    state.animTimer = setTimeout(finish, gap * Math.max(0, total - 1) + 700);
    document.querySelectorAll('.sheet-svg').forEach(function (svg) {
      svg.addEventListener('animationstart', function (event) {
        if (token !== state.animToken) return;
        if (!event.target.classList || !event.target.classList.contains('piece')) return;
        setStatus('Yerleşiyor · ' + (Number(event.target.dataset.i) + 1) + '/' + total);
      });
      svg.addEventListener('animationend', function (event) {
        if (event.target.dataset && event.target.dataset.i === String(total - 1)) finish();
      });
    });
  }

  function stopAnim() {
    state.animToken += 1;
    clearTimeout(state.animTimer);
  }

  function renderLegend(result) {
    var host = document.getElementById('legend');
    host.replaceChildren();
    var colors = colorMap(result);
    var groups = new Map();
    result.sheets.forEach(function (sheet) {
      sheet.placements.forEach(function (piece) {
        if (!groups.has(piece.partId)) {
          var ow = piece.rotated ? piece.height : piece.width;
          var oh = piece.rotated ? piece.width : piece.height;
          groups.set(piece.partId, { name: piece.name, width: ow, height: oh, count: 0 });
        }
        groups.get(piece.partId).count += 1;
      });
    });
    groups.forEach(function (part, partId) {
      var tone = colorsFor(colors, partId);
      var li = document.createElement('li');
      var swatch = document.createElement('i');
      swatch.className = 'swatch';
      swatch.style.setProperty('--fill', tone.fill);
      swatch.style.setProperty('--hatch', tone.hatch);
      li.appendChild(swatch);
      li.appendChild(document.createTextNode(part.name + ' · ' + fmtMm(part.width) + '×' + fmtMm(part.height) + ' · ' + part.count + ' adet'));
      host.appendChild(li);
    });
  }

  function renderCutList(result) {
    var host = document.getElementById('cutlist');
    host.replaceChildren();
    if (!result.sheets.length) return;
    var table = document.createElement('table');
    var caption = document.createElement('caption');
    caption.textContent = 'Kesim listesi. X ve Y, levhanın sol üst köşesinden mm.';
    table.appendChild(caption);
    var thead = document.createElement('thead');
    var head = document.createElement('tr');
    ['Levha', 'Parça', 'Ölçü', 'X', 'Y', 'Dönüş'].forEach(function (label, index) {
      var th = document.createElement('th');
      th.textContent = label;
      if (index >= 2 && index <= 4) th.className = 'num';
      head.appendChild(th);
    });
    thead.appendChild(head);
    table.appendChild(thead);
    var body = document.createElement('tbody');
    result.sheets.forEach(function (sheet) {
      sheet.placements.forEach(function (piece) {
        var tr = document.createElement('tr');
        tr.dataset.pieceRow = piece.id;
        tr.dataset.part = piece.partId;
        var values = [
          String(sheet.index),
          piece.name,
          fmtMm(piece.width) + '×' + fmtMm(piece.height),
          fmtMm(piece.x),
          fmtMm(piece.y),
          piece.rotated ? '90°' : '—'
        ];
        values.forEach(function (value, index) {
          var td = document.createElement('td');
          td.textContent = value;
          if (index >= 2 && index <= 4) td.className = 'num';
          tr.appendChild(td);
        });
        tr.addEventListener('click', function () {
          state.pinned = piece.id;
          state.hotId = piece.id;
          applyHot();
          var node = document.querySelector('.piece[data-piece="' + CSS.escape(piece.id) + '"]');
          if (node) node.closest('.sheet-card').scrollIntoView({ block: 'nearest' });
        });
        body.appendChild(tr);
      });
    });
    table.appendChild(body);
    host.appendChild(table);
  }

  function showTools(result) {
    var hasSheets = result.sheets.length > 0;
    document.getElementById('replay').hidden = !hasSheets;
    document.getElementById('printBtn').hidden = !hasSheets;
    document.getElementById('saveSvg').hidden = !hasSheets;
    document.getElementById('copyList').hidden = false;
  }

  function showResult(result, animate) {
    state.hotId = null;
    state.pinned = null;
    renderStats(result, animate);
    renderWarning(result);
    renderSheets(result, animate);
    renderLegend(result);
    renderCutList(result);
    showTools(result);
    renderDetail(result.kerf, result);
    setTitle();
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) setStatus(doneMessage(result));
  }

  function findJoint(result) {
    var eps = 0.05;
    for (var s = 0; s < result.sheets.length; s++) {
      var list = result.sheets[s].placements;
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i];
          var b = list[j];
          var overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          if (overlapY > 1) {
            var left = a.x <= b.x ? a : b;
            var right = left === a ? b : a;
            if (Math.abs(right.x - (left.x + left.width) - result.kerf) < eps) return [left, right];
          }
          var overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          if (overlapX > 1) {
            var top = a.y <= b.y ? a : b;
            var bottom = top === a ? b : a;
            if (Math.abs(bottom.y - (top.y + top.height) - result.kerf) < eps) return [top, bottom];
          }
        }
      }
    }
    return null;
  }

  function renderDetail(kerf, result) {
    var host = document.getElementById('detail');
    host.replaceChildren();
    if (typeof kerf !== 'number' || Number.isNaN(kerf) || kerf < 0) return;
    var pair = ['#e4c98a', '#b7c9d6'];
    if (result && result.sheets.length) {
      var joint = findJoint(result);
      var colors = colorMap(result);
      if (joint) {
        pair = [colorsFor(colors, joint[0].partId).fill, colorsFor(colors, joint[1].partId).fill];
      } else if (result.sheets[0].placements[0]) {
        pair = [colorsFor(colors, result.sheets[0].placements[0].partId).fill, '#d5d8dc'];
      }
    }
    var gap = kerf === 0 ? 0 : 28;
    var width = 16 + 56 + gap + 56 + 16;
    var svg = svgEl('svg', { width: width, height: 78, viewBox: '0 0 ' + width + ' 78' });
    svgEl('rect', { x: 16, y: 28, width: 56, height: 40, fill: pair[0], stroke: INK, 'stroke-width': '1' }, svg);
    svgEl('rect', { x: 16 + 56 + gap, y: 28, width: 56, height: 40, fill: pair[1], stroke: INK, 'stroke-width': '1' }, svg);
    var x1 = 16 + 56;
    var x2 = x1 + gap;
    if (gap > 0) {
      line(svg, x1, 18, x2, 18);
      tick(svg, x1, 18);
      tick(svg, x2, 18);
      svgText(svg, (x1 + x2) / 2, 12, fmtMm(kerf) + ' mm', {
        fill: RUST, 'font-size': '12', 'font-weight': '600', 'text-anchor': 'middle'
      });
    } else {
      svgText(svg, x1, 16, '0 mm', {
        fill: RUST, 'font-size': '12', 'font-weight': '600', 'text-anchor': 'middle'
      });
    }
    var figure = document.createElement('figure');
    figure.className = 'detail';
    var caption = document.createElement('figcaption');
    caption.textContent = kerf === 0 ? 'Parçalar bitişik.' : 'Derz büyük çizildi. Levha ölçeklidir.';
    figure.append(svg, caption);
    host.appendChild(figure);
  }

  function applyHot() {
    var id = state.hotId;
    document.querySelectorAll('.piece').forEach(function (node) {
      node.classList.toggle('is-hot', !!id && node.dataset.piece === id);
    });
    document.querySelectorAll('.sheet-svg').forEach(function (node) {
      node.classList.toggle('has-hot', !!id);
    });
    document.querySelectorAll('[data-piece-row]').forEach(function (node) {
      node.classList.toggle('is-hot', !!id && node.dataset.pieceRow === id);
    });
    var hotPart = null;
    if (id) {
      var piece = document.querySelector('.piece[data-piece="' + CSS.escape(id) + '"]');
      hotPart = piece ? piece.dataset.part : null;
    }
    document.querySelectorAll('.part-row').forEach(function (node) {
      node.classList.toggle('is-hot', !!hotPart && node.dataset.id === hotPart);
    });
  }

  function redrawSheets() {
    if (!state.result) {
      renderGhost();
      return;
    }
    var wasPlaying = !!document.querySelector('.sheet-svg.is-play');
    renderSheets(state.result, false);
    if (wasPlaying && !state.dirty) setStatus(doneMessage(state.result));
  }

  function cutText(result) {
    var lines = ['Levha\tParça\tEn\tBoy\tX\tY\tDönüş'];
    result.sheets.forEach(function (sheet) {
      sheet.placements.forEach(function (piece) {
        lines.push([
          sheet.index,
          piece.name,
          xl(piece.width),
          xl(piece.height),
          xl(piece.x),
          xl(piece.y),
          piece.rotated ? '90' : ''
        ].join('\t'));
      });
    });
    if (result.unplaced.length) {
      lines.push('');
      lines.push('Sığmayan');
      result.unplaced.forEach(function (piece) {
        lines.push([piece.name, xl(piece.width), xl(piece.height)].join('\t'));
      });
    }
    lines.push('');
    lines.push('Levha ' + xl(result.sheetWidth) + ' x ' + xl(result.sheetHeight) + ' mm');
    lines.push('Bıçak payı ' + xl(result.kerf) + ' mm');
    return lines.join('\n');
  }

  function esc(value) {
    return String(value).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  function svgDocument(result) {
    var gap = 36;
    var padL = 70;
    var padR = 16;
    var padB = 16;
    var font = Math.min(32, Math.max(14, result.sheetWidth * 0.016));
    var padT = font + 28;
    var block = padT + result.sheetHeight + padB;
    var width = padL + result.sheetWidth + padR;
    var height = result.sheets.length * block + Math.max(0, result.sheets.length - 1) * gap + font + 28;
    var colors = colorMap(result);
    var defs = '';
    var body = '';
    var seen = {};
    result.sheets.forEach(function (sheet) {
      sheet.placements.forEach(function (piece) {
        if (seen[piece.partId]) return;
        seen[piece.partId] = true;
        var tone = colorsFor(colors, piece.partId);
        defs += '<pattern id="e' + esc(piece.partId) + '" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(' + (35 + (tone.index % 5) * 18) + ')">';
        defs += '<rect width="12" height="12" fill="' + tone.fill + '"/>';
        defs += '<path d="M-2 2 L2 -2 M0 12 L12 0 M8 14 L14 8" stroke="' + tone.hatch + '" stroke-width="1.4" fill="none"/>';
        defs += '</pattern>';
      });
    });
    result.sheets.forEach(function (sheet, index) {
      var y0 = index * (block + gap);
      body += '<text x="' + padL + '" y="' + (y0 + font + 6) + '" font-size="' + font + '" font-family="sans-serif">' + esc('Levha ' + sheet.index) + '</text>';
      body += '<rect x="' + padL + '" y="' + (y0 + padT) + '" width="' + result.sheetWidth + '" height="' + result.sheetHeight + '" fill="#d5d9de" stroke="#1c1a17" stroke-width="1"/>';
      sheet.placements.forEach(function (piece) {
        body += '<rect x="' + (padL + piece.x) + '" y="' + (y0 + padT + piece.y) + '" width="' + piece.width + '" height="' + piece.height + '" fill="url(#e' + esc(piece.partId) + ')" stroke="#1c1a17" stroke-width="0.6"/>';
        if (piece.width > 40 && piece.height > 24) {
          var label = piece.name + (piece.rotated ? ' 90°' : '') + ' ' + fmtMm(piece.width) + '×' + fmtMm(piece.height);
          var size = Math.max(8, Math.min(piece.height * 0.22, piece.width * 0.16, 28));
          body += '<text x="' + (padL + piece.x + piece.width / 2) + '" y="' + (y0 + padT + piece.y + piece.height / 2) + '" text-anchor="middle" dominant-baseline="middle" font-size="' + size + '" font-family="sans-serif">' + esc(label) + '</text>';
        }
      });
    });
    var note = 'Bıçak payı ' + fmtMm(result.kerf) + ' mm. Ölçüler mm. Köşe sol üst.';
    body += '<text x="' + padL + '" y="' + (height - 10) + '" font-size="' + Math.max(10, font * 0.55) + '" font-family="sans-serif">' + esc(note) + '</text>';
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'mm" height="' + height + 'mm" viewBox="0 0 ' + width + ' ' + height + '">' +
      '<defs>' + defs + '</defs>' + body + '</svg>';
  }

  function downloadSvg(result) {
    var blob = new Blob([svgDocument(result)], { type: 'image/svg+xml' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'levha-yerlesim.svg';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  async function copyList() {
    if (!state.result) return;
    var text = cutText(state.result);
    var button = document.getElementById('copyList');
    var ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (err) {
      var area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      ok = document.execCommand('copy');
      area.remove();
    }
    var previous = button.textContent;
    button.textContent = ok ? 'Kopyalandı' : 'Kopyalanamadı';
    setTimeout(function () { button.textContent = previous; }, 1400);
  }

  async function optimize() {
    var job = refresh();
    if (!job.ok) return;
    var button = document.getElementById('optimize');
    button.disabled = true;
    setStatus('Hesaplanıyor');
    await new Promise(function (resolve) { setTimeout(resolve, 40); });
    var result;
    try {
      result = SheetPacker.pack({
        sheetWidth: job.sheetWidth,
        sheetHeight: job.sheetHeight,
        kerf: job.kerf,
        allowRotate: job.allowRotate,
        mode: job.mode,
        parts: job.parts
      });
    } catch (err) {
      setStatus('Yerleşim hesaplanamadı.');
      button.disabled = !inspect().ok;
      return;
    }
    state.result = result;
    state.dirty = false;
    state.zoom = readableZoom(result);
    document.getElementById('stale').hidden = true;
    stage.scrollTop = 0;
    showResult(result, true);
    refresh();
  }

  function bind() {
    sheetW.addEventListener('input', function () { onEdit('sheet'); });
    sheetH.addEventListener('input', function () { onEdit('sheet'); });
    kerfInput.addEventListener('input', function () { onEdit('cut'); });
    document.getElementById('rotate').addEventListener('change', function () { onEdit('cut'); });
    document.getElementById('modeFree').addEventListener('change', function () { onEdit('cut'); });
    document.getElementById('modeGuillotine').addEventListener('change', function () { onEdit('cut'); });
    partList.addEventListener('input', function () { onEdit('part'); });
    partList.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter') return;
      var input = event.target.closest('input');
      if (!input) return;
      event.preventDefault();
      var row = input.closest('.part-row');
      var order = ['name', 'w', 'h', 'qty'];
      var index = order.indexOf(input.dataset.field);
      if (index < order.length - 1) {
        row.querySelector('[data-field="' + order[index + 1] + '"]').focus();
        return;
      }
      var next = row.nextElementSibling || addRow();
      next.querySelector('[data-field="w"]').focus();
    });
    document.getElementById('addRow').addEventListener('click', function () {
      var row = addRow();
      row.querySelector('[data-field="w"]').focus();
    });
    document.getElementById('pasteAdd').addEventListener('click', function () {
      var parsed = SheetPacker.parsePartList(document.getElementById('pasteBox').value);
      if (!parsed.parts.length) {
        setStatus(parsed.errors.length ? parsed.errors[0].line + '. satır okunmadı.' : 'Satır okunmadı.');
        return;
      }
      var rows = Array.prototype.slice.call(partList.querySelectorAll('.part-row'));
      if (rows.every(isRowEmpty)) rows.forEach(function (row) { row.remove(); });
      parsed.parts.forEach(addRow);
      document.getElementById('pasteBox').value = '';
      onEdit('part');
      if (parsed.errors.length) setStatus(parsed.errors[0].line + '. satır okunmadı. Diğer satırlar eklendi.');
      else setStatus(parsed.parts.length + ' çeşit eklendi.');
    });
    document.getElementById('openDxf').addEventListener('click', function () {
      var input = document.getElementById('dxfFile');
      input.value = '';
      input.click();
    });
    document.getElementById('dxfFile').addEventListener('change', function () {
      var input = document.getElementById('dxfFile');
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var parsed;
        try {
          parsed = DxfParts.parseDxf(String(reader.result || ''));
        } catch (err) {
          setStatus('DXF okunamadı.');
          return;
        }
        if (parsed.error || !parsed.parts.length) {
          setStatus(dxfMessage(parsed));
          return;
        }
        var rows = Array.prototype.slice.call(partList.querySelectorAll('.part-row'));
        if (rows.every(isRowEmpty)) rows.forEach(function (row) { row.remove(); });
        parsed.parts.forEach(addRow);
        onEdit('part');
        setStatus(dxfMessage(parsed));
      };
      reader.onerror = function () { setStatus('DXF okunamadı.'); };
      reader.readAsText(file);
    });
    document.querySelectorAll('[data-sheet]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var bits = btn.dataset.sheet.split('x');
        sheetW.value = bits[0];
        sheetH.value = bits[1];
        onEdit('sheet');
      });
    });
    document.querySelectorAll('[data-kerf]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        kerfInput.value = btn.dataset.kerf;
        onEdit('cut');
      });
    });
    document.getElementById('optimize').addEventListener('click', optimize);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        optimize();
      }
    });
    document.getElementById('zoomIn').addEventListener('click', function () {
      state.zoom = Math.min(6, state.zoom * 1.35);
      syncChips(inspect());
      redrawSheets();
    });
    document.getElementById('zoomOut').addEventListener('click', function () {
      state.zoom = Math.max(1, state.zoom / 1.35);
      if (state.zoom < 1.05) state.zoom = 1;
      syncChips(inspect());
      redrawSheets();
    });
    document.getElementById('zoomFit').addEventListener('click', function () {
      state.zoom = 1;
      syncChips(inspect());
      redrawSheets();
    });
    document.getElementById('replay').addEventListener('click', function () {
      if (!state.result || !state.result.sheets.length) return;
      renderSheets(state.result, true);
    });
    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
    document.getElementById('saveSvg').addEventListener('click', function () {
      if (state.result && state.result.sheets.length) downloadSvg(state.result);
    });
    document.getElementById('copyList').addEventListener('click', copyList);
    document.getElementById('sheets').addEventListener('pointerover', function (event) {
      var piece = event.target.closest && event.target.closest('.piece');
      if (!piece) return;
      state.hotId = piece.dataset.piece;
      applyHot();
    });
    document.getElementById('sheets').addEventListener('pointerleave', function () {
      state.hotId = state.pinned;
      applyHot();
    });
    document.getElementById('sheets').addEventListener('click', function (event) {
      var piece = event.target.closest && event.target.closest('.piece');
      if (!piece) {
        state.pinned = null;
        state.hotId = null;
        applyHot();
        return;
      }
      state.pinned = piece.dataset.piece;
      state.hotId = state.pinned;
      applyHot();
      var row = document.querySelector('[data-piece-row="' + CSS.escape(state.pinned) + '"]');
      if (row) row.scrollIntoView({ block: 'nearest' });
    });
    window.addEventListener('resize', function () {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(redrawSheets, 120);
    });
  }

  addRow();
  addRow();
  addRow();
  bind();
  refresh();
  renderGhost();
  var firstWidth = partList.querySelector('[data-field="w"]');
  if (firstWidth) firstWidth.focus();
})();
