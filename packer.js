// Bıçak payı parçanın sağına ve altına eklenir.
// Levha da aynı pay kadar büyütülür.
// Parçalar arasında pay kadar boşluk kalır. Levha kenarında pay kalmaz.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SheetPacker = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var UNIT = 1000;

  function toU(mm) {
    return Math.round(mm * UNIT);
  }

  function finishNumber(s) {
    var n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  function readTurkish(s) {
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      if (!/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return NaN;
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.indexOf(',') !== -1) {
      if (!/^\d+(,\d+)?$/.test(s)) return NaN;
      s = s.replace(',', '.');
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    } else if (!/^\d+(\.\d+)?$/.test(s)) {
      return NaN;
    }
    return finishNumber(s);
  }

  function readEnglish(s) {
    if (s.indexOf(',') !== -1 && s.indexOf('.') !== -1) {
      if (!/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return NaN;
      s = s.replace(/,/g, '');
    } else if (s.indexOf(',') !== -1) {
      if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
      else if (/^\d+(,\d+)?$/.test(s)) s = s.replace(',', '.');
      else return NaN;
    } else if (!/^\d+(\.\d+)?$/.test(s)) {
      return NaN;
    }
    return finishNumber(s);
  }

  function readNumber(token, locale) {
    if (token == null) return null;
    var s = String(token).trim().replace(/\s/g, '');
    if (!s) return null;
    if (locale === 'en') return readEnglish(s);
    return readTurkish(s);
  }

  function classify(token, locale) {
    if (/[A-Za-zÀ-ÿĞğÜüŞşİıÖöÇç]/.test(token)) return { type: 'word', value: token };
    var n = readNumber(token, locale);
    if (n == null || Number.isNaN(n)) return { type: 'bad' };
    return { type: 'num', value: n };
  }

  function parseLine(raw, locale) {
    var tokens = raw.trim().split(/[×xX*\s]+/).filter(Boolean);
    if (!tokens.length) return null;
    var words = [];
    var nums = [];
    for (var i = 0; i < tokens.length; i++) {
      var c = classify(tokens[i], locale);
      if (c.type === 'bad') return null;
      if (c.type === 'word') words.push(c.value);
      else nums.push(c.value);
    }
    if (nums.length < 2 || nums.length > 3) return null;
    var width;
    var height;
    var qty;
    var firstIsQty = /^\d+$/.test(tokens[0]) && words.length > 0 && nums.length === 3;
    if (firstIsQty) {
      qty = nums[0];
      width = nums[1];
      height = nums[2];
    } else {
      width = nums[0];
      height = nums[1];
      qty = nums.length === 3 ? nums[2] : 1;
    }
    if (!(width > 0) || !(height > 0) || !(qty > 0) || !Number.isInteger(qty)) return null;
    return { name: words.join(' '), width: width, height: height, qty: qty };
  }

  function parsePartList(text, locale) {
    var parts = [];
    var errors = [];
    String(text).split(/\r?\n/).forEach(function (line, index) {
      var raw = line.trim();
      if (!raw || raw.charAt(0) === '#' || raw.indexOf('//') === 0) return;
      var parsed = parseLine(raw, locale);
      if (!parsed) errors.push({ line: index + 1, text: raw });
      else parts.push(parsed);
    });
    return { parts: parts, errors: errors };
  }

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function contains(a, b) {
    return a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;
  }

  function prune(free) {
    var remove = [];
    var i;
    var j;
    for (i = 0; i < free.length; i++) remove[i] = false;
    for (i = 0; i < free.length; i++) {
      for (j = 0; j < free.length; j++) {
        if (i === j || !contains(free[j], free[i])) continue;
        var same = free[j].x === free[i].x && free[j].y === free[i].y && free[j].w === free[i].w && free[j].h === free[i].h;
        if (!same || j < i) {
          remove[i] = true;
          break;
        }
      }
    }
    var kept = [];
    for (i = 0; i < free.length; i++) if (!remove[i]) kept.push(free[i]);
    return kept;
  }

  function betterScore(a, b) {
    if (a.score !== b.score) return a.score < b.score;
    if (a.tie !== b.tie) return a.tie < b.tie;
    if (a.y !== b.y) return a.y < b.y;
    if (a.x !== b.x) return a.x < b.x;
    return false;
  }

  function orientations(item, ctx) {
    var w = toU(item.width);
    var h = toU(item.height);
    var list = [{
      w: w + ctx.kerfU,
      h: h + ctx.kerfU,
      rotated: false,
      rw: item.width,
      rh: item.height
    }];
    if (ctx.allowRotate && w !== h) {
      list.push({
        w: h + ctx.kerfU,
        h: w + ctx.kerfU,
        rotated: true,
        rw: item.height,
        rh: item.width
      });
    }
    return list;
  }

  function scoreOf(heuristic, rect, ori) {
    var dw = rect.w - ori.w;
    var dh = rect.h - ori.h;
    if (heuristic === 'baf') return { score: rect.w * rect.h - ori.w * ori.h, tie: Math.min(dw, dh) };
    if (heuristic === 'bl') return { score: rect.y, tie: rect.x };
    return { score: Math.min(dw, dh), tie: Math.max(dw, dh) };
  }

  function usedScore(bin, x, y, w, h, kerfU) {
    var maxX = x + w - kerfU;
    var maxY = y + h - kerfU;
    var placed = bin.placed;
    for (var i = 0; i < placed.length; i++) {
      var right = placed[i].x + placed[i].w - kerfU;
      var bottom = placed[i].y + placed[i].h - kerfU;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    return maxX * maxY;
  }

  function placedBounds(bin, kerfU) {
    if (!bin.placed.length) return null;
    var maxX = 0;
    var maxY = 0;
    for (var i = 0; i < bin.placed.length; i++) {
      var right = bin.placed[i].x + bin.placed[i].w - kerfU;
      var bottom = bin.placed[i].y + bin.placed[i].h - kerfU;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
    return { maxX: maxX, maxY: maxY };
  }

  function nestsInside(x, y, w, h, bounds, kerfU) {
    return x < bounds.maxX && y < bounds.maxY && x + w - kerfU > 0 && y + h - kerfU > 0;
  }

  // Parça, konmuşların içindeki boşluğa girer. Üstteki ince şerit boş kalır.
  function prefer(a, b, heuristic) {
    if (heuristic === 'nest') {
      var an = a.nestled ? 0 : 1;
      var bn = b.nestled ? 0 : 1;
      if (an !== bn) return an < bn;
      if (an === 0 && a.nestArea !== b.nestArea) return a.nestArea < b.nestArea;
    }
    return betterScore(a, b);
  }

  function searchFree(bin, item, ctx) {
    var best = null;
    var bounds = ctx.heuristic === 'nest' ? placedBounds(bin, ctx.kerfU) : null;
    for (var r = 0; r < bin.free.length; r++) {
      var rect = bin.free[r];
      var oris = orientations(item, ctx);
      for (var o = 0; o < oris.length; o++) {
        var ori = oris[o];
        if (ori.w > rect.w || ori.h > rect.h) continue;
        var scored = scoreOf(ctx.heuristic, rect, ori);
        var spot = {
          x: rect.x,
          y: rect.y,
          w: ori.w,
          h: ori.h,
          rotated: ori.rotated,
          rw: ori.rw,
          rh: ori.rh,
          score: scored.score,
          tie: scored.tie,
          rect: rect,
          item: item
        };
        if (ctx.heuristic === 'nest') {
          spot.nestled = bounds && nestsInside(spot.x, spot.y, spot.w, spot.h, bounds, ctx.kerfU);
          spot.nestArea = usedScore(bin, spot.x, spot.y, spot.w, spot.h, ctx.kerfU);
        }
        if (!best || prefer(spot, best, ctx.heuristic)) best = spot;
      }
    }
    return best;
  }

  function commitMax(bin, spot) {
    var used = { x: spot.x, y: spot.y, w: spot.w, h: spot.h };
    var next = [];
    for (var i = 0; i < bin.free.length; i++) {
      var free = bin.free[i];
      if (!intersects(free, used)) {
        next.push(free);
        continue;
      }
      if (used.x > free.x) next.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
      if (used.x + used.w < free.x + free.w) {
        next.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - (used.x + used.w), h: free.h });
      }
      if (used.y > free.y) next.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
      if (used.y + used.h < free.y + free.h) {
        next.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - (used.y + used.h) });
      }
    }
    var filtered = [];
    for (var j = 0; j < next.length; j++) if (next[j].w > 0 && next[j].h > 0) filtered.push(next[j]);
    bin.free = prune(filtered);
    bin.placed.push(spot);
  }

  function commitGuillotine(bin, spot, ctx) {
    var kept = [];
    for (var i = 0; i < bin.free.length; i++) if (bin.free[i] !== spot.rect) kept.push(bin.free[i]);
    bin.free = kept;
    var dw = spot.rect.w - spot.w;
    var dh = spot.rect.h - spot.h;
    var vertical = ctx.rule === 'offcut' ? offcutVertical(spot.rect, spot) : ctx.rule === 'long' ? dw >= dh : dw < dh;
    if (vertical) {
      if (dw > 0) bin.free.push({ x: spot.x + spot.w, y: spot.rect.y, w: dw, h: spot.rect.h });
      if (dh > 0) bin.free.push({ x: spot.rect.x, y: spot.y + spot.h, w: spot.w, h: dh });
    } else {
      if (dh > 0) bin.free.push({ x: spot.rect.x, y: spot.y + spot.h, w: spot.rect.w, h: dh });
      if (dw > 0) bin.free.push({ x: spot.x + spot.w, y: spot.rect.y, w: dw, h: spot.h });
    }
    bin.placed.push(spot);
  }

  // Kesim, büyük fire dikdörtgenini bırakır.
  function offcutVertical(rect, spot) {
    var dw = rect.w - spot.w;
    var dh = rect.h - spot.h;
    var vertMax = 0;
    var horzMax = 0;
    if (dw > 0) {
      vertMax = dw * rect.h;
      horzMax = dw * spot.h;
    }
    if (dh > 0) {
      if (spot.w * dh > vertMax) vertMax = spot.w * dh;
      if (rect.w * dh > horzMax) horzMax = rect.w * dh;
    }
    if (vertMax === horzMax) return dw >= dh;
    return vertMax > horzMax;
  }

  function skyFind(sky, index, w, h, binW, binH) {
    var x = sky[index].x;
    if (x + w > binW) return null;
    var y = 0;
    var covered = 0;
    for (var i = index; i < sky.length && covered < w; i++) {
      y = Math.max(y, sky[i].y);
      if (y + h > binH) return null;
      covered += sky[i].w;
    }
    if (covered < w) return null;
    return { x: x, y: y };
  }

  function addSky(sky, x, y, w) {
    var x2 = x + w;
    var next = [];
    for (var i = 0; i < sky.length; i++) {
      var s = sky[i];
      var s2 = s.x + s.w;
      if (s2 <= x || s.x >= x2) {
        next.push(s);
        continue;
      }
      if (s.x < x) next.push({ x: s.x, y: s.y, w: x - s.x });
      if (s2 > x2) next.push({ x: x2, y: s.y, w: s2 - x2 });
    }
    next.push({ x: x, y: y, w: w });
    next.sort(function (a, b) { return a.x - b.x; });
    var merged = [];
    for (var j = 0; j < next.length; j++) {
      var seg = next[j];
      var last = merged[merged.length - 1];
      if (last && last.y === seg.y && last.x + last.w === seg.x) last.w += seg.w;
      else merged.push({ x: seg.x, y: seg.y, w: seg.w });
    }
    return merged;
  }

  function assertSky(sky, binW) {
    var x = 0;
    for (var i = 0; i < sky.length; i++) {
      if (sky[i].x !== x || sky[i].w <= 0) throw new Error('skyline broke');
      x += sky[i].w;
    }
    if (x !== binW) throw new Error('skyline broke');
  }

  function searchSky(bin, item, ctx) {
    var best = null;
    var oris = orientations(item, ctx);
    for (var o = 0; o < oris.length; o++) {
      var ori = oris[o];
      for (var i = 0; i < bin.sky.length; i++) {
        var pos = skyFind(bin.sky, i, ori.w, ori.h, ctx.binW, ctx.binH);
        if (!pos) continue;
        var spot = {
          x: pos.x,
          y: pos.y,
          w: ori.w,
          h: ori.h,
          rotated: ori.rotated,
          rw: ori.rw,
          rh: ori.rh,
          score: pos.y,
          tie: pos.x,
          item: item
        };
        if (!best || betterScore(spot, best)) best = spot;
      }
    }
    return best;
  }

  function commitSky(bin, spot, ctx) {
    bin.sky = addSky(bin.sky, spot.x, spot.y + spot.h, spot.w);
    assertSky(bin.sky, ctx.binW);
    bin.placed.push(spot);
  }

  function createFree(ctx) {
    return { free: [{ x: 0, y: 0, w: ctx.binW, h: ctx.binH }], placed: [] };
  }

  function createSky(ctx) {
    return { sky: [{ x: 0, y: 0, w: ctx.binW }], placed: [] };
  }

  function packOrder(order, ctx, strategy) {
    var bins = [];
    var unplaced = [];
    var search = strategy.kind === 'skyline' ? searchSky : searchFree;
    var commit = strategy.kind === 'skyline' ? commitSky : strategy.kind === 'guillotine' ? commitGuillotine : commitMax;
    var create = strategy.kind === 'skyline' ? createSky : createFree;
    var runCtx = {
      binW: ctx.binW,
      binH: ctx.binH,
      kerfU: ctx.kerfU,
      allowRotate: ctx.allowRotate,
      heuristic: strategy.heuristic,
      rule: strategy.rule
    };
    for (var i = 0; i < order.length; i++) {
      var item = order[i];
      var chosen = null;
      var binIndex = -1;
      for (var b = 0; b < bins.length; b++) {
        var spot = search(bins[b], item, runCtx);
        if (!spot) continue;
        chosen = spot;
        binIndex = b;
        break;
      }
      if (!chosen) {
        var bin = create(runCtx);
        var fresh = search(bin, item, runCtx);
        if (!fresh) {
          unplaced.push(item);
          continue;
        }
        commit(bin, fresh, runCtx);
        bins.push(bin);
      } else {
        commit(bins[binIndex], chosen, runCtx);
      }
    }
    return { bins: bins, unplaced: unplaced };
  }

  function toSheets(bins) {
    var sheets = [];
    for (var i = 0; i < bins.length; i++) {
      if (!bins[i].placed.length) continue;
      var placements = [];
      var partArea = 0;
      for (var p = 0; p < bins[i].placed.length; p++) {
        var spot = bins[i].placed[p];
        placements.push({
          id: spot.item.pieceId,
          partId: spot.item.partId,
          name: spot.item.name,
          x: spot.x / UNIT,
          y: spot.y / UNIT,
          width: spot.rw,
          height: spot.rh,
          rotated: spot.rotated
        });
        partArea += spot.rw * spot.rh;
      }
      sheets.push({ index: sheets.length + 1, placements: placements, partArea: partArea });
    }
    return sheets;
  }

  function usedBox(sheet) {
    var maxX = 0;
    var maxY = 0;
    var list = sheet ? sheet.placements : [];
    for (var i = 0; i < list.length; i++) {
      maxX = Math.max(maxX, list[i].x + list[i].width);
      maxY = Math.max(maxY, list[i].y + list[i].height);
    }
    return maxX * maxY;
  }

  function earlyArea(sheets) {
    var area = 0;
    for (var i = 0; i < sheets.length - 1; i++) area += sheets[i].partArea;
    return area;
  }

  function turnCount(sheets) {
    var n = 0;
    for (var i = 0; i < sheets.length; i++) {
      for (var p = 0; p < sheets[i].placements.length; p++) {
        if (sheets[i].placements[p].rotated) n += 1;
      }
    }
    return n;
  }

  function isBetter(a, b) {
    if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length < b.unplaced.length;
    if (a.sheets.length !== b.sheets.length) return a.sheets.length < b.sheets.length;
    if (a.early !== b.early) return a.early > b.early;
    if (Math.abs(a.lastBox - b.lastBox) > 1e-6) return a.lastBox < b.lastBox;
    return a.turns < b.turns;
  }

  function aloneFits(width, height, sheetWidth, sheetHeight) {
    return width <= sheetWidth + 1e-9 && height <= sheetHeight + 1e-9;
  }

  function strategiesFor(mode, count) {
    var list = mode === 'guillotine'
      ? [
          { kind: 'guillotine', heuristic: 'bssf', rule: 'long' },
          { kind: 'guillotine', heuristic: 'bssf', rule: 'short' },
          { kind: 'guillotine', heuristic: 'baf', rule: 'long' },
          { kind: 'guillotine', heuristic: 'bl', rule: 'long' },
          { kind: 'guillotine', heuristic: 'nest', rule: 'offcut' }
        ]
      : [
          { kind: 'maxrects', heuristic: 'bssf' },
          { kind: 'maxrects', heuristic: 'baf' },
          { kind: 'maxrects', heuristic: 'bl' },
          { kind: 'skyline', heuristic: 'bl' }
        ];
    if (count > 250) return list.slice(0, 2);
    if (count > 100) return list.slice(0, 3);
    return list;
  }

  function ordersFor(items) {
    var keys = [
      function (it) { return it.width * it.height; },
      function (it) { return Math.max(it.width, it.height); },
      function (it) { return it.width; },
      function (it) { return it.height; }
    ];
    var use = items.length > 250 ? 1 : items.length > 100 ? 2 : 4;
    var orders = [];
    for (var k = 0; k < use; k++) {
      var fn = keys[k];
      orders.push(items.slice().sort(function (a, b) {
        return fn(b) - fn(a) || a.seq - b.seq;
      }));
    }
    return orders;
  }

  function pack(input) {
    var sheetWidth = Number(input.sheetWidth);
    var sheetHeight = Number(input.sheetHeight);
    var kerf = Number(input.kerf);
    var allowRotate = !!input.allowRotate;
    var mode = input.mode === 'guillotine' ? 'guillotine' : 'free';
    if (!(sheetWidth > 0) || !(sheetHeight > 0) || !(kerf >= 0) || !Number.isFinite(sheetWidth) || !Number.isFinite(sheetHeight) || !Number.isFinite(kerf)) {
      throw new Error('bad input');
    }

    var names = new Map();
    var unnamed = 1;
    var items = [];
    var seq = 0;
    var source = input.parts || [];
    for (var i = 0; i < source.length; i++) {
      var part = source[i];
      var width = Number(part.width);
      var height = Number(part.height);
      var qty = Number(part.qty);
      if (!(width > 0) || !(height > 0) || !(qty > 0)) continue;
      var partId = part.id != null ? String(part.id) : String(i + 1);
      var name = part.name && String(part.name).trim();
      if (!name) {
        if (!names.has(partId)) names.set(partId, 'P' + unnamed++);
        name = names.get(partId);
      }
      var copies = Math.floor(qty);
      for (var n = 0; n < copies; n++) {
        items.push({
          pieceId: partId + '-' + (n + 1),
          partId: partId,
          name: name,
          width: width,
          height: height,
          seq: seq++
        });
      }
    }

    var ctx = {
      binW: toU(sheetWidth) + toU(kerf),
      binH: toU(sheetHeight) + toU(kerf),
      kerfU: toU(kerf),
      allowRotate: allowRotate
    };

    var best = null;
    if (items.length) {
      var orders = ordersFor(items);
      var strategies = strategiesFor(mode, items.length);
      var totalArea = 0;
      for (var t = 0; t < items.length; t++) totalArea += items[t].width * items[t].height;
      var lower = Math.max(1, Math.ceil((totalArea - 1e-6) / (sheetWidth * sheetHeight)));
      var stopEarly = items.length > 80;

      for (var s = 0; s < strategies.length; s++) {
        for (var o = 0; o < orders.length; o++) {
          var run = packOrder(orders[o], ctx, strategies[s]);
          var sheets = toSheets(run.bins);
          var candidate = {
            sheets: sheets,
            unplaced: run.unplaced,
            early: earlyArea(sheets),
            lastBox: usedBox(sheets[sheets.length - 1]),
            turns: turnCount(sheets),
            method: strategies[s].kind + '-' + strategies[s].heuristic + (strategies[s].rule ? '-' + strategies[s].rule : '')
          };
          if (!best || isBetter(candidate, best)) best = candidate;
          if (stopEarly && best.unplaced.length === 0 && best.sheets.length === lower) {
            s = strategies.length;
            break;
          }
        }
      }
    }

    var sheets = best ? best.sheets : [];
    var rawUnplaced = best ? best.unplaced : [];
    var unplaced = rawUnplaced.map(function (item) {
      var direct = aloneFits(item.width, item.height, sheetWidth, sheetHeight);
      var turned = aloneFits(item.height, item.width, sheetWidth, sheetHeight);
      return {
        id: item.pieceId,
        partId: item.partId,
        name: item.name,
        width: item.width,
        height: item.height,
        fitsIfRotated: !direct && turned
      };
    });

    var placedArea = 0;
    for (var a = 0; a < sheets.length; a++) placedArea += sheets[a].partArea;
    var sheetArea = sheets.length * sheetWidth * sheetHeight;
    return {
      sheets: sheets,
      unplaced: unplaced,
      sheetWidth: sheetWidth,
      sheetHeight: sheetHeight,
      kerf: kerf,
      allowRotate: allowRotate,
      mode: mode,
      method: best ? best.method : '',
      placedArea: placedArea,
      sheetArea: sheetArea,
      wasteArea: sheetArea - placedArea,
      yieldRatio: sheetArea > 0 ? placedArea / sheetArea : 0,
      pieceCount: items.length
    };
  }

  return { pack: pack, parsePartList: parsePartList, readNumber: readNumber };
});
