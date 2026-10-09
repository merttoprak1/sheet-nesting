// Kapalı dikdörtgen konturları okur. Ölçüler mm olur.
// Eğri, yazı, tarama ve açık çizgi parça olmaz.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DxfParts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var TO_MM = {
    1: { name: 'in', scale: 25.4 },
    2: { name: 'ft', scale: 304.8 },
    4: { name: 'mm', scale: 1 },
    5: { name: 'cm', scale: 10 },
    6: { name: 'm', scale: 1000 },
    10: { name: 'yd', scale: 914.4 },
    13: { name: 'um', scale: 0.001 },
    14: { name: 'dm', scale: 100 },
    15: { name: 'dam', scale: 10000 }
  };
  var RIGHT = Math.sin(Math.PI / 180);
  var CELL = 0.3;

  function resultError(message) {
    return { parts: [], unit: '', assumedUnit: false, skipped: 0, error: message };
  }

  function prepare(text) {
    text = String(text == null ? '' : text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    if (!text) return { pairs: [] };
    if (text.charCodeAt(0) === 0 || text.slice(0, 18) === 'AutoCAD Binary DXF') {
      return { error: 'binary' };
    }
    var nul = text.indexOf('\0');
    if (nul !== -1 && nul < 80) return { error: 'binary' };
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = text.split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    var i = 0;
    while (i < lines.length && lines[i].trim() === '') i++;
    var pairs = [];
    while (i < lines.length) {
      if (lines[i].trim() === '') {
        i++;
        continue;
      }
      if (i + 1 >= lines.length) return { error: 'parse' };
      var codeLine = lines[i].trim();
      if (!/^\d+$/.test(codeLine)) return { error: 'parse' };
      pairs.push({ code: Number(codeLine), value: lines[i + 1].trim() });
      i += 2;
    }
    return { pairs: pairs };
  }

  function splitSections(pairs) {
    var sections = {};
    var i = 0;
    while (i < pairs.length) {
      if (pairs[i].code === 0 && String(pairs[i].value).toUpperCase() === 'SECTION') {
        i++;
        var name = '';
        while (i < pairs.length && pairs[i].code !== 0) {
          var coded = pairs[i].code === 2;
          if (coded && !name) name = String(pairs[i].value).toUpperCase();
          i++;
          if (coded) break;
        }
        var start = i;
        while (i < pairs.length && !(pairs[i].code === 0 && String(pairs[i].value).toUpperCase() === 'ENDSEC')) i++;
        sections[name] = pairs.slice(start, i);
        if (i < pairs.length) i++;
      } else {
        i++;
      }
    }
    return sections;
  }

  function readHeader(pairs) {
    var ins = null;
    var meas = null;
    var i = 0;
    while (i < pairs.length) {
      if (pairs[i].code !== 9) {
        i++;
        continue;
      }
      var key = String(pairs[i].value).toUpperCase();
      i++;
      var bucket = [];
      while (i < pairs.length && pairs[i].code !== 9) {
        bucket.push(pairs[i]);
        i++;
      }
      if (key !== '$INSUNITS' && key !== '$MEASUREMENT') continue;
      var val = null;
      for (var b = 0; b < bucket.length; b++) {
        if (bucket[b].code === 70) {
          val = parseFloat(bucket[b].value);
          break;
        }
      }
      if (!isFinite(val)) val = null;
      if (key === '$INSUNITS') ins = val;
      else meas = val;
    }
    return { ins: ins, meas: meas };
  }

  function resolveUnit(ins, meas) {
    if (ins == null || ins === 0) {
      if (meas === 0) return { name: 'in', scale: 25.4, assumed: false };
      return { name: 'mm', scale: 1, assumed: true };
    }
    var known = TO_MM[ins];
    if (!known) return { name: 'mm', scale: 1, assumed: true };
    return { name: known.name, scale: known.scale, assumed: false };
  }

  function splitEntities(pairs) {
    var out = [];
    var i = 0;
    while (i < pairs.length) {
      if (pairs[i].code !== 0) {
        i++;
        continue;
      }
      var type = String(pairs[i].value).toUpperCase();
      var start = i;
      i++;
      if (type === 'POLYLINE') {
        while (i < pairs.length) {
          if (pairs[i].code === 0 && String(pairs[i].value).toUpperCase() === 'SEQEND') {
            i++;
            break;
          }
          i++;
        }
      } else {
        while (i < pairs.length && pairs[i].code !== 0) i++;
      }
      out.push(pairs.slice(start, i));
    }
    return out;
  }

  function readBlocks(pairs) {
    var blocks = {};
    var entities = splitEntities(pairs);
    var current = null;
    for (var i = 0; i < entities.length; i++) {
      var groups = entities[i];
      var type = String(groups[0].value).toUpperCase();
      if (type === 'BLOCK') {
        var name = '';
        var named = false;
        var baseX = 0;
        var baseY = 0;
        for (var g = 1; g < groups.length; g++) {
          if (groups[g].code === 2 && !named) {
            name = groups[g].value;
            named = true;
          } else if (groups[g].code === 10) {
            var bx = parseFloat(groups[g].value);
            if (isFinite(bx)) baseX = bx;
          } else if (groups[g].code === 20) {
            var by = parseFloat(groups[g].value);
            if (isFinite(by)) baseY = by;
          }
        }
        current = { name: name, baseX: baseX, baseY: baseY, entities: [] };
        if (name) blocks[name] = current;
      } else if (type === 'ENDBLK') {
        current = null;
      } else if (current) {
        current.entities.push(groups);
      }
    }
    return blocks;
  }

  function blockByName(blocks, name) {
    if (!name) return null;
    if (blocks[name]) return blocks[name];
    var upper = String(name).toUpperCase();
    var keys = Object.keys(blocks);
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].toUpperCase() === upper) return blocks[keys[i]];
    }
    return null;
  }

  function findModelBlock(blocks) {
    return blockByName(blocks, '*MODEL_SPACE');
  }

  function skipInsert(name) {
    if (!name) return true;
    if (name.charAt(0) !== '*') return false;
    return String(name).toUpperCase() !== '*MODEL_SPACE';
  }

  function num(value, fallback) {
    var n = parseFloat(value);
    return isFinite(n) ? n : fallback;
  }

  function readInsert(groups) {
    var name = '';
    var named = false;
    var x = 0;
    var y = 0;
    var sx = 1;
    var sy = null;
    var rot = 0;
    for (var i = 1; i < groups.length; i++) {
      var code = groups[i].code;
      var value = groups[i].value;
      if (code === 2 && !named) {
        name = value;
        named = true;
      } else if (code === 10) x = num(value, 0);
      else if (code === 20) y = num(value, 0);
      else if (code === 41) sx = num(value, 1);
      else if (code === 42) sy = num(value, sy);
      else if (code === 50) rot = num(value, 0);
    }
    if (!isFinite(sx)) sx = 1;
    if (sy == null || !isFinite(sy)) sy = sx;
    return { name: name, x: x, y: y, sx: sx, sy: sy, rot: rot };
  }

  function makeLocal(ins, baseX, baseY) {
    var rad = (ins.rot || 0) * Math.PI / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    return function (x, y) {
      var dx = x - baseX;
      var dy = y - baseY;
      return {
        x: ins.x + ins.sx * (cos * dx - sin * dy),
        y: ins.y + ins.sy * (sin * dx + cos * dy)
      };
    };
  }

  function compose(parent, local) {
    if (!parent) return local;
    return function (x, y) {
      var p = local(x, y);
      return parent(p.x, p.y);
    };
  }

  function apply(transform, x, y, scale) {
    var p = transform ? transform(x, y) : { x: x, y: y };
    return { x: p.x * scale, y: p.y * scale };
  }

  function entityMeta(groups) {
    var type = String(groups[0].value).toUpperCase();
    var layer = '0';
    var paper = false;
    var limit = groups.length;
    if (type === 'POLYLINE') {
      for (var i = 1; i < groups.length; i++) {
        if (groups[i].code === 0) {
          limit = i;
          break;
        }
      }
    }
    for (var g = 1; g < limit; g++) {
      if (groups[g].code === 8) layer = groups[g].value;
      else if (groups[g].code === 67 && Number(groups[g].value) === 1) paper = true;
    }
    return { type: type, layer: layer, paper: paper };
  }

  function isGeom(type) {
    return type === 'LINE' || type === 'LWPOLYLINE' || type === 'POLYLINE' || type === 'INSERT';
  }

  function readPoly(groups) {
    var type = String(groups[0].value).toUpperCase();
    var flags = 0;
    var pts = [];
    var bulge = false;
    var curve = false;
    var i;
    if (type === 'LWPOLYLINE') {
      var x = null;
      var y = null;
      var b = 0;
      function flushLw() {
        if (x == null || y == null || !isFinite(x) || !isFinite(y)) {
          x = null;
          y = null;
          b = 0;
          return;
        }
        if (Math.abs(b) > 1e-8) bulge = true;
        pts.push({ x: x, y: y });
        x = null;
        y = null;
        b = 0;
      }
      for (i = 1; i < groups.length; i++) {
        if (groups[i].code === 10) {
          flushLw();
          x = parseFloat(groups[i].value);
        } else if (groups[i].code === 20) y = parseFloat(groups[i].value);
        else if (groups[i].code === 42) b = parseFloat(groups[i].value) || 0;
        else if (groups[i].code === 70) flags = parseInt(groups[i].value, 10) || 0;
      }
      flushLw();
      return { pts: pts, closed: (flags & 1) !== 0, bulge: bulge, curve: false };
    }
    if (type !== 'POLYLINE') return null;
    i = 1;
    for (; i < groups.length; i++) {
      if (groups[i].code === 0) break;
      if (groups[i].code === 70) flags = parseInt(groups[i].value, 10) || 0;
    }
    if ((flags & 4) || (flags & 16) || (flags & 32) || (flags & 64)) curve = true;
    var vx = null;
    var vy = null;
    var vb = 0;
    var vflags = 0;
    var inV = false;
    function flushV() {
      if (!inV) return;
      if ((vflags & 16) === 0 && vx != null && vy != null && isFinite(vx) && isFinite(vy)) {
        if (Math.abs(vb) > 1e-8) bulge = true;
        pts.push({ x: vx, y: vy });
      }
      inV = false;
      vx = null;
      vy = null;
      vb = 0;
      vflags = 0;
    }
    for (; i < groups.length; i++) {
      if (groups[i].code === 0) {
        flushV();
        inV = String(groups[i].value).toUpperCase() === 'VERTEX';
      } else if (inV && groups[i].code === 10) vx = parseFloat(groups[i].value);
      else if (inV && groups[i].code === 20) vy = parseFloat(groups[i].value);
      else if (inV && groups[i].code === 42) vb = parseFloat(groups[i].value) || 0;
      else if (inV && groups[i].code === 70) vflags = parseInt(groups[i].value, 10) || 0;
    }
    flushV();
    return { pts: pts, closed: (flags & 1) !== 0, bulge: bulge, curve: curve };
  }

  function samePoint(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) <= 0.05;
  }

  function toMmPoints(pts, transform, scale) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      if (!isFinite(pts[i].x) || !isFinite(pts[i].y)) return null;
      out.push(apply(transform, pts[i].x, pts[i].y, scale));
    }
    return out;
  }

  function dropColinear(pts) {
    var guard = pts.length + 1;
    while (pts.length >= 3 && guard-- > 0) {
      var next = [];
      var n = pts.length;
      var removed = false;
      for (var i = 0; i < n; i++) {
        var a = pts[(i + n - 1) % n];
        var b = pts[i];
        var c = pts[(i + 1) % n];
        var abx = b.x - a.x;
        var aby = b.y - a.y;
        var bcx = c.x - b.x;
        var bcy = c.y - b.y;
        var lab = Math.hypot(abx, aby);
        var lbc = Math.hypot(bcx, bcy);
        var flat = lab < 0.05 || lbc < 0.05 || Math.abs(abx * bcy - aby * bcx) / (lab * lbc) < 0.02;
        if (flat) {
          removed = true;
          continue;
        }
        next.push(b);
      }
      if (!removed || next.length === pts.length) return pts;
      pts = next;
    }
    return pts;
  }

  function loopOf(parsed, transform, scale) {
    var pts = toMmPoints(parsed.pts, transform, scale);
    if (!pts || pts.length < 2) return null;
    var closed = parsed.closed;
    if (samePoint(pts[0], pts[pts.length - 1])) {
      pts.pop();
      closed = true;
    }
    if (!closed || pts.length < 3) return null;
    return dropColinear(pts);
  }

  function nearLen(a, b) {
    return Math.abs(a - b) <= Math.max(0.05, 0.002 * Math.max(a, b));
  }

  function asRectangle(pts) {
    if (!pts || pts.length !== 4) return null;
    var edges = [];
    var i;
    for (i = 0; i < 4; i++) {
      if (!isFinite(pts[i].x) || !isFinite(pts[i].y)) return null;
      var a = pts[i];
      var b = pts[(i + 1) % 4];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      edges.push({ dx: dx, dy: dy, len: Math.hypot(dx, dy) });
    }
    var turn = 0;
    for (i = 0; i < 4; i++) {
      var e = edges[i];
      var f = edges[(i + 1) % 4];
      if (e.len < 0.05 || f.len < 0.05) return null;
      var cross = e.dx * f.dy - e.dy * f.dx;
      var dot = e.dx * f.dx + e.dy * f.dy;
      if (Math.abs(dot) / (e.len * f.len) > RIGHT) return null;
      if (cross === 0) return null;
      var sign = cross > 0 ? 1 : -1;
      if (turn === 0) turn = sign;
      else if (sign !== turn) return null;
    }
    if (!nearLen(edges[0].len, edges[2].len) || !nearLen(edges[1].len, edges[3].len)) return null;
    var aligned = true;
    for (i = 0; i < 4; i++) {
      var minor = Math.min(Math.abs(edges[i].dx), Math.abs(edges[i].dy));
      if (minor / edges[i].len > 0.02) aligned = false;
    }
    var width;
    var height;
    if (aligned) {
      var minX = pts[0].x;
      var maxX = pts[0].x;
      var minY = pts[0].y;
      var maxY = pts[0].y;
      for (i = 1; i < 4; i++) {
        if (pts[i].x < minX) minX = pts[i].x;
        if (pts[i].x > maxX) maxX = pts[i].x;
        if (pts[i].y < minY) minY = pts[i].y;
        if (pts[i].y > maxY) maxY = pts[i].y;
      }
      width = maxX - minX;
      height = maxY - minY;
    } else {
      width = edges[0].len;
      height = edges[1].len;
    }
    if (!(width >= 2) || !(height >= 2)) return { tiny: true };
    return {
      width: width,
      height: height,
      cx: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4,
      cy: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4
    };
  }

  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  function addRect(ctx, rect, layer) {
    var s0 = round1(Math.min(rect.width, rect.height));
    var s1 = round1(Math.max(rect.width, rect.height));
    var key = round1(rect.cx) + '|' + round1(rect.cy) + '|' + s0 + '|' + s1;
    if (ctx.seen[key]) return;
    ctx.seen[key] = true;
    ctx.rects.push({ width: rect.width, height: rect.height, layer: layer || '' });
  }

  function takePoly(groups, transform, ctx, layer) {
    var parsed = readPoly(groups);
    if (!parsed) return;
    if (parsed.pts.length > 800) {
      if (parsed.closed) ctx.skipped++;
      return;
    }
    if (parsed.curve || parsed.bulge) {
      var closedPts = toMmPoints(parsed.pts, transform, ctx.scale);
      var closed = parsed.closed;
      if (closedPts && closedPts.length >= 2 && samePoint(closedPts[0], closedPts[closedPts.length - 1])) closed = true;
      if (closed) ctx.skipped++;
      return;
    }
    var loop = loopOf(parsed, transform, ctx.scale);
    if (!loop) return;
    var rect = asRectangle(loop);
    if (!rect) ctx.skipped++;
    else if (!rect.tiny) addRect(ctx, rect, layer);
  }

  function takeLine(groups, transform, ctx, layer) {
    var x1 = null;
    var y1 = null;
    var x2 = null;
    var y2 = null;
    for (var i = 1; i < groups.length; i++) {
      var code = groups[i].code;
      var value = parseFloat(groups[i].value);
      if (code === 10) x1 = value;
      else if (code === 20) y1 = value;
      else if (code === 11) x2 = value;
      else if (code === 21) y2 = value;
    }
    if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) return;
    ctx.lines.push({
      a: apply(transform, x1, y1, ctx.scale),
      b: apply(transform, x2, y2, ctx.scale),
      layer: layer || ''
    });
  }

  function walkOne(groups, transform, ctx, depth, stack, markSaw) {
    var meta = entityMeta(groups);
    if (markSaw && !meta.paper && isGeom(meta.type)) ctx.saw = true;
    if (meta.paper || String(meta.layer).toUpperCase() === 'DEFPOINTS') return;
    if (meta.type === 'INSERT') {
      var ins = readInsert(groups);
      if (skipInsert(ins.name) || depth >= 4) return;
      var block = blockByName(ctx.blocks, ins.name);
      if (!block || stack.indexOf(block.name) >= 0) return;
      var next = compose(transform, makeLocal(ins, block.baseX, block.baseY));
      stack.push(block.name);
      for (var i = 0; i < block.entities.length; i++) {
        walkOne(block.entities[i], next, ctx, depth + 1, stack, false);
      }
      stack.pop();
      return;
    }
    if (meta.type === 'LWPOLYLINE' || meta.type === 'POLYLINE') takePoly(groups, transform, ctx, meta.layer);
    else if (meta.type === 'LINE') takeLine(groups, transform, ctx, meta.layer);
  }

  function edgeKey(a, b) {
    return a < b ? a + '-' + b : b + '-' + a;
  }

  function buildGraph(lines) {
    var pts = [];
    var buckets = {};
    function vid(x, y) {
      var ix = Math.floor(x / CELL);
      var iy = Math.floor(y / CELL);
      var dx;
      var dy;
      for (dx = -1; dx <= 1; dx++) {
        for (dy = -1; dy <= 1; dy++) {
          var list = buckets[(ix + dx) + ',' + (iy + dy)];
          if (!list) continue;
          for (var k = 0; k < list.length; k++) {
            var p = pts[list[k]];
            if (Math.hypot(p.x - x, p.y - y) <= CELL) return list[k];
          }
        }
      }
      var id = pts.length;
      pts.push({ x: x, y: y });
      var key = ix + ',' + iy;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(id);
      return id;
    }
    var adj = [];
    var edgeLayer = {};
    var seen = {};
    var maxDeg = 0;
    function addEdge(a, b, layer) {
      if (a === b) return;
      var key = edgeKey(a, b);
      if (seen[key]) {
        if (edgeLayer[key] !== (layer || '')) edgeLayer[key] = '';
        return;
      }
      seen[key] = true;
      edgeLayer[key] = layer || '';
      if (!adj[a]) adj[a] = [];
      if (!adj[b]) adj[b] = [];
      adj[a].push(b);
      adj[b].push(a);
    }
    for (var i = 0; i < lines.length; i++) {
      addEdge(vid(lines[i].a.x, lines[i].a.y), vid(lines[i].b.x, lines[i].b.y), lines[i].layer);
    }
    for (i = 0; i < adj.length; i++) {
      if (adj[i] && adj[i].length > maxDeg) maxDeg = adj[i].length;
    }
    return { pts: pts, adj: adj, edgeLayer: edgeLayer, maxDeg: maxDeg };
  }

  function mergeColinear(graph) {
    var pts = graph.pts;
    var adj = graph.adj;
    var edgeLayer = graph.edgeLayer;
    var dead = {};
    var guard = pts.length + 2;
    var changed = true;
    function unlink(a, b) {
      if (adj[a]) adj[a] = adj[a].filter(function (n) { return n !== b; });
      delete edgeLayer[edgeKey(a, b)];
    }
    function link(a, b, layer) {
      if (a === b) return;
      if (!adj[a]) adj[a] = [];
      if (!adj[b]) adj[b] = [];
      if (adj[a].indexOf(b) < 0) adj[a].push(b);
      if (adj[b].indexOf(a) < 0) adj[b].push(a);
      var key = edgeKey(a, b);
      if (edgeLayer[key] == null) edgeLayer[key] = layer || '';
      else if (edgeLayer[key] !== (layer || '')) edgeLayer[key] = '';
    }
    while (changed && guard-- > 0) {
      changed = false;
      for (var i = 0; i < pts.length; i++) {
        if (dead[i] || !adj[i]) continue;
        var nb = adj[i].filter(function (n) { return !dead[n]; });
        adj[i] = nb;
        if (nb.length !== 2) continue;
        var a = nb[0];
        var b = nb[1];
        var ax = pts[a].x - pts[i].x;
        var ay = pts[a].y - pts[i].y;
        var bx = pts[b].x - pts[i].x;
        var by = pts[b].y - pts[i].y;
        var la = Math.hypot(ax, ay);
        var lb = Math.hypot(bx, by);
        if (la < 1e-9 || lb < 1e-9) continue;
        if (Math.abs(ax * by - ay * bx) / (la * lb) >= 0.02) continue;
        if ((ax * bx + ay * by) / (la * lb) > -0.5) continue;
        var layerA = edgeLayer[edgeKey(a, i)] || '';
        var layerB = edgeLayer[edgeKey(i, b)] || '';
        unlink(a, i);
        unlink(i, a);
        unlink(b, i);
        unlink(i, b);
        dead[i] = true;
        adj[i] = [];
        link(a, b, layerA === layerB ? layerA : '');
        changed = true;
      }
    }
  }

  function linked(adj, a, b) {
    var list = adj[a];
    if (!list) return false;
    for (var i = 0; i < list.length; i++) if (list[i] === b) return true;
    return false;
  }

  function findQuads(graph) {
    var adj = graph.adj;
    var pts = graph.pts;
    var edgeLayer = graph.edgeLayer;
    var seen = {};
    var out = [];
    for (var a = 0; a < pts.length; a++) {
      var na = adj[a];
      if (!na) continue;
      for (var i = 0; i < na.length; i++) {
        var b = na[i];
        if (b < a) continue;
        var nb = adj[b];
        if (!nb) continue;
        for (var j = 0; j < nb.length; j++) {
          var c = nb[j];
          if (c === a) continue;
          var nc = adj[c];
          if (!nc) continue;
          for (var k = 0; k < nc.length; k++) {
            var d = nc[k];
            if (d === a || d === b || d === c) continue;
            if (!linked(adj, d, a)) continue;
            var sig = [a, b, c, d].slice().sort(function (p, q) { return p - q; }).join(',');
            if (seen[sig]) continue;
            seen[sig] = true;
            var layers = [
              edgeLayer[edgeKey(a, b)] || '',
              edgeLayer[edgeKey(b, c)] || '',
              edgeLayer[edgeKey(c, d)] || '',
              edgeLayer[edgeKey(d, a)] || ''
            ];
            var layer = layers[0];
            var same = true;
            for (var t = 1; t < 4; t++) if (layers[t] !== layer) same = false;
            out.push({ pts: [a, b, c, d], layer: same ? layer : '' });
          }
        }
      }
    }
    return out;
  }

  function mergeSegs(segs) {
    var clusters = [];
    var i;
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      var found = null;
      for (var c = 0; c < clusters.length; c++) {
        if (Math.abs(clusters[c].seed - s.pos) <= CELL) {
          found = clusters[c];
          break;
        }
      }
      if (!found) clusters.push({ seed: s.pos, items: [s] });
      else found.items.push(s);
    }
    var out = [];
    for (var n = 0; n < clusters.length; n++) {
      var items = clusters[n].items.slice().sort(function (p, q) { return p.lo - q.lo; });
      var sum = 0;
      for (i = 0; i < items.length; i++) sum += items[i].pos;
      var pos = sum / items.length;
      var cur = null;
      for (i = 0; i < items.length; i++) {
        s = items[i];
        if (!cur) cur = { pos: pos, lo: s.lo, hi: s.hi, layer: s.layer || '' };
        else if (s.lo <= cur.hi + CELL) {
          cur.hi = Math.max(cur.hi, s.hi);
          if ((s.layer || '') !== cur.layer) cur.layer = '';
        } else {
          out.push(cur);
          cur = { pos: pos, lo: s.lo, hi: s.hi, layer: s.layer || '' };
        }
      }
      if (cur) out.push(cur);
    }
    return out;
  }

  function cover(vs, x, yA, yB) {
    var lo = Math.min(yA, yB);
    var hi = Math.max(yA, yB);
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (Math.abs(v.pos - x) > CELL) continue;
      if (v.lo <= lo + CELL && v.hi >= hi - CELL) return v;
    }
    return null;
  }

  function hvRects(ctx, lines) {
    var hs = [];
    var vs = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var dx = ln.b.x - ln.a.x;
      var dy = ln.b.y - ln.a.y;
      var len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      if (Math.abs(dy) / len <= 0.02) {
        hs.push({
          pos: (ln.a.y + ln.b.y) / 2,
          lo: Math.min(ln.a.x, ln.b.x),
          hi: Math.max(ln.a.x, ln.b.x),
          layer: ln.layer
        });
      } else if (Math.abs(dx) / len <= 0.02) {
        vs.push({
          pos: (ln.a.x + ln.b.x) / 2,
          lo: Math.min(ln.a.y, ln.b.y),
          hi: Math.max(ln.a.y, ln.b.y),
          layer: ln.layer
        });
      }
    }
    hs = mergeSegs(hs);
    vs = mergeSegs(vs);
    for (i = 0; i < hs.length; i++) {
      for (var j = i + 1; j < hs.length; j++) {
        var a = hs[i];
        var b = hs[j];
        if (Math.abs(a.lo - b.lo) > CELL || Math.abs(a.hi - b.hi) > CELL) continue;
        if (Math.abs(a.pos - b.pos) < 2) continue;
        var x0 = (a.lo + b.lo) / 2;
        var x1 = (a.hi + b.hi) / 2;
        if (x1 - x0 < 2) continue;
        var left = cover(vs, x0, a.pos, b.pos);
        var right = cover(vs, x1, a.pos, b.pos);
        if (!left || !right) continue;
        var y0 = Math.min(a.pos, b.pos);
        var y1 = Math.max(a.pos, b.pos);
        var rect = asRectangle([
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 }
        ]);
        if (!rect || rect.tiny) continue;
        var layers = [a.layer, b.layer, left.layer, right.layer];
        var layer = layers[0] || '';
        var same = true;
        for (var t = 1; t < layers.length; t++) if ((layers[t] || '') !== layer) same = false;
        addRect(ctx, rect, same ? layer : '');
      }
    }
  }

  function addLineRects(ctx) {
    var lines = ctx.lines;
    if (!lines.length) return;
    if (lines.length > 1500) {
      hvRects(ctx, lines);
      return;
    }
    var graph = buildGraph(lines);
    if (graph.maxDeg > 12) {
      hvRects(ctx, lines);
      return;
    }
    mergeColinear(graph);
    var quads = findQuads(graph);
    for (var i = 0; i < quads.length; i++) {
      var q = quads[i];
      var pts = [
        graph.pts[q.pts[0]],
        graph.pts[q.pts[1]],
        graph.pts[q.pts[2]],
        graph.pts[q.pts[3]]
      ];
      var rect = asRectangle(pts);
      if (!rect) ctx.skipped++;
      else if (!rect.tiny) addRect(ctx, rect, q.layer);
    }
  }

  function cleanLayer(layer) {
    if (layer == null) return '';
    var name = String(layer).trim();
    if (!name || name === '0') return '';
    return name;
  }

  function groupParts(rects) {
    var rows = [];
    var map = {};
    for (var i = 0; i < rects.length; i++) {
      var w = round1(rects[i].width);
      var h = round1(rects[i].height);
      var key = w + 'x' + h;
      var layer = cleanLayer(rects[i].layer);
      if (!map[key]) {
        map[key] = { width: w, height: h, qty: 0, name: layer, layer: layer };
        rows.push(map[key]);
      }
      var row = map[key];
      row.qty += 1;
      if (row.layer !== layer) row.name = '';
    }
    var parts = [];
    for (i = 0; i < rows.length; i++) {
      parts.push({
        name: rows[i].name,
        width: rows[i].width,
        height: rows[i].height,
        qty: rows[i].qty
      });
    }
    return parts;
  }

  function parseDxf(text) {
    var ready = prepare(text);
    if (ready.error) return resultError(ready.error);
    var sections = splitSections(ready.pairs);
    var header = readHeader(sections.HEADER || []);
    var unit = resolveUnit(header.ins, header.meas);
    var blocks = readBlocks(sections.BLOCKS || []);
    var ctx = {
      blocks: blocks,
      scale: unit.scale,
      rects: [],
      lines: [],
      skipped: 0,
      seen: {},
      saw: false
    };
    var entities = splitEntities(sections.ENTITIES || []);
    for (var i = 0; i < entities.length; i++) walkOne(entities[i], null, ctx, 0, [], true);
    if (!ctx.saw) {
      var ms = findModelBlock(blocks);
      if (ms) {
        var shift = makeLocal({ x: 0, y: 0, sx: 1, sy: 1, rot: 0 }, ms.baseX, ms.baseY);
        var stack = [ms.name];
        for (i = 0; i < ms.entities.length; i++) walkOne(ms.entities[i], shift, ctx, 0, stack, false);
      }
    }
    addLineRects(ctx);
    return {
      parts: groupParts(ctx.rects),
      unit: unit.name,
      assumedUnit: unit.assumed,
      skipped: ctx.skipped,
      error: null
    };
  }

  return { parseDxf: parseDxf };
});
