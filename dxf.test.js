const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDxf } = require('./dxf');
const { pack } = require('./packer');

function dxf({ header = [], blocks = [], entities = [] } = {}) {
  return [
    '0', 'SECTION', '2', 'HEADER', ...header,
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'BLOCKS', ...blocks,
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES', ...entities,
    '0', 'ENDSEC',
    '0', 'EOF'
  ].join('\n');
}

function lwpoly(pts, opt = {}) {
  const lines = ['0', 'LWPOLYLINE', '8', opt.layer || '0', '90', String(pts.length), '70', opt.closed === false ? '0' : '1'];
  if (opt.paper) lines.push('67', '1');
  pts.forEach((p, i) => {
    lines.push('10', String(p[0]), '20', String(p[1]));
    if (opt.bulge === i) lines.push('42', '0.5');
  });
  return lines;
}

function rect(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

function line(x1, y1, x2, y2, layer = '0') {
  return ['0', 'LINE', '8', layer, '10', String(x1), '20', String(y1), '11', String(x2), '21', String(y2)];
}

function poly(pts, flags = '1') {
  const lines = ['0', 'POLYLINE', '8', '0', '66', '1', '70', String(flags)];
  pts.forEach((p) => {
    lines.push('0', 'VERTEX', '8', '0', '10', String(p[0]), '20', String(p[1]), '30', '0');
  });
  lines.push('0', 'SEQEND');
  return lines;
}

function block(name, body) {
  return ['0', 'BLOCK', '2', name, '70', '0', '10', '0', '20', '0', '30', '0', '3', name, ...body, '0', 'ENDBLK'];
}

function insert(name, opt = {}) {
  const lines = ['0', 'INSERT', '8', '0', '2', name, '10', String(opt.x || 0), '20', String(opt.y || 0)];
  if (opt.sx != null) lines.push('41', String(opt.sx));
  if (opt.sy != null) lines.push('42', String(opt.sy));
  if (opt.rot != null) lines.push('50', String(opt.rot));
  return lines;
}

test('closed LWPOLYLINE 150×300 mm is one part', () => {
  const parsed = parseDxf(dxf({ entities: lwpoly(rect(0, 0, 150, 300)) }));
  assert.equal(parsed.error, null);
  assert.equal(parsed.unit, 'mm');
  assert.equal(parsed.assumedUnit, true);
  assert.equal(parsed.skipped, 0);
  assert.equal(parsed.parts.length, 1);
  assert.deepEqual(parsed.parts[0], { name: '', width: 150, height: 300, qty: 1 });
});

test('two identical sizes group to qty 2', () => {
  const parsed = parseDxf(dxf({
    entities: [...lwpoly(rect(0, 0, 150, 300)), ...lwpoly(rect(400, 0, 150, 300))]
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].qty, 2);
  assert.equal(parsed.parts[0].width, 150);
  assert.equal(parsed.parts[0].height, 300);
});

test('does not swap 150×300 with 300×150', () => {
  const parsed = parseDxf(dxf({
    entities: [...lwpoly(rect(0, 0, 150, 300)), ...lwpoly(rect(0, 400, 300, 150))]
  }));
  assert.equal(parsed.parts.length, 2);
  assert.equal(parsed.parts[0].width, 150);
  assert.equal(parsed.parts[0].height, 300);
  assert.equal(parsed.parts[1].width, 300);
  assert.equal(parsed.parts[1].height, 150);
});

test('inches convert to mm', () => {
  const parsed = parseDxf(dxf({
    header: ['9', '$INSUNITS', '70', '1'],
    entities: lwpoly(rect(0, 0, 10, 4))
  }));
  assert.equal(parsed.unit, 'in');
  assert.equal(parsed.assumedUnit, false);
  assert.equal(parsed.parts.length, 1);
  assert.ok(Math.abs(parsed.parts[0].width - 254) < 0.001);
  assert.ok(Math.abs(parsed.parts[0].height - 101.6) < 0.001);
});

test('measurement 0 without units is inches', () => {
  const parsed = parseDxf(dxf({
    header: ['9', '$MEASUREMENT', '70', '0'],
    entities: lwpoly(rect(0, 0, 10, 4))
  }));
  assert.equal(parsed.unit, 'in');
  assert.equal(parsed.assumedUnit, false);
  assert.ok(Math.abs(parsed.parts[0].width - 254) < 0.001);
});

test('explicit millimetres are not a guess', () => {
  const parsed = parseDxf(dxf({
    header: ['9', '$INSUNITS', '70', '4'],
    entities: lwpoly(rect(0, 0, 150, 300))
  }));
  assert.equal(parsed.unit, 'mm');
  assert.equal(parsed.assumedUnit, false);
  assert.equal(parsed.parts[0].width, 150);
});

test('four LINEs make a 200×80 rectangle', () => {
  const parsed = parseDxf(dxf({
    entities: [
      ...line(0, 0, 200, 0),
      ...line(200, 0, 200, 80),
      ...line(200, 80, 0, 80),
      ...line(0, 80, 0, 0)
    ]
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 200);
  assert.equal(parsed.parts[0].height, 80);
  assert.equal(parsed.parts[0].qty, 1);
});

test('a split side still makes one rectangle', () => {
  const parsed = parseDxf(dxf({
    entities: [
      ...line(0, 0, 100, 0),
      ...line(100, 0, 200, 0),
      ...line(200, 0, 200, 80),
      ...line(200, 80, 0, 80),
      ...line(0, 80, 0, 0)
    ]
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 200);
  assert.equal(parsed.parts[0].height, 80);
});

test('open polyline is not added', () => {
  const parsed = parseDxf(dxf({
    entities: lwpoly(rect(0, 0, 150, 300), { closed: false })
  }));
  assert.equal(parsed.parts.length, 0);
  assert.equal(parsed.skipped, 0);
  assert.equal(parsed.error, null);
});

test('triangle is skipped and the rectangle is kept', () => {
  const parsed = parseDxf(dxf({
    entities: [
      ...lwpoly([[0, 0], [30, 0], [0, 40]]),
      ...lwpoly(rect(100, 0, 200, 80))
    ]
  }));
  assert.equal(parsed.skipped, 1);
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 200);
  assert.equal(parsed.parts[0].height, 80);
});

test('rotated rectangle keeps the two edge lengths', () => {
  const deg = 30 * Math.PI / 180;
  const c = Math.cos(deg);
  const s = Math.sin(deg);
  const pts = [[0, 0], [100, 0], [100, 40], [0, 40]].map(([x, y]) => [x * c - y * s, x * s + y * c]);
  const parsed = parseDxf(dxf({ entities: lwpoly(pts) }));
  assert.equal(parsed.parts.length, 1);
  const dims = [parsed.parts[0].width, parsed.parts[0].height].sort((a, b) => a - b);
  assert.ok(Math.abs(dims[0] - 40) < 0.11, dims.join('x'));
  assert.ok(Math.abs(dims[1] - 100) < 0.11, dims.join('x'));
});

test('INSERT scale 2 doubles the block', () => {
  const parsed = parseDxf(dxf({
    blocks: block('RECT', lwpoly(rect(0, 0, 50, 20))),
    entities: insert('RECT', { sx: 2, sy: 2 })
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 100);
  assert.equal(parsed.parts[0].height, 40);
});

test('INSERT rotation 90 swaps the spans', () => {
  const parsed = parseDxf(dxf({
    blocks: block('RECT', lwpoly(rect(0, 0, 100, 40))),
    entities: insert('RECT', { rot: 90 })
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 40);
  assert.equal(parsed.parts[0].height, 100);
});

test('binary DXF is refused', () => {
  assert.equal(parseDxf('AutoCAD Binary DXF\r\n\u001a').error, 'Bu DXF ikili. ASCII olarak kaydet.');
  assert.equal(parseDxf('\0nope').error, 'Bu DXF ikili. ASCII olarak kaydet.');
});

test('a bulge is skipped', () => {
  const parsed = parseDxf(dxf({
    entities: lwpoly(rect(0, 0, 150, 300), { bulge: 1 })
  }));
  assert.equal(parsed.parts.length, 0);
  assert.equal(parsed.skipped, 1);
});

test('polyline and the same four lines count once', () => {
  const parsed = parseDxf(dxf({
    entities: [
      ...lwpoly(rect(0, 0, 200, 80)),
      ...line(0, 0, 200, 0),
      ...line(200, 0, 200, 80),
      ...line(200, 80, 0, 80),
      ...line(0, 80, 0, 0)
    ]
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].qty, 1);
});

test('POLYLINE VERTEX rectangle is read', () => {
  const parsed = parseDxf(dxf({ entities: poly(rect(0, 0, 60, 40)) }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 60);
  assert.equal(parsed.parts[0].height, 40);
});

test('spline polyline is skipped', () => {
  const parsed = parseDxf(dxf({ entities: poly(rect(0, 0, 60, 40), '5') }));
  assert.equal(parsed.parts.length, 0);
  assert.equal(parsed.skipped, 1);
});

test('layer name is kept when it is shared', () => {
  const parsed = parseDxf(dxf({
    entities: [
      ...lwpoly(rect(0, 0, 80, 40), { layer: 'CEPHE' }),
      ...lwpoly(rect(200, 0, 80, 40), { layer: 'CEPHE' })
    ]
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].name, 'CEPHE');
  assert.equal(parsed.parts[0].qty, 2);
});

test('mixed layers leave the name blank', () => {
  const parsed = parseDxf(dxf({
    entities: [
      ...lwpoly(rect(0, 0, 80, 40), { layer: 'CEPHE' }),
      ...lwpoly(rect(200, 0, 80, 40), { layer: 'KAPI' })
    ]
  }));
  assert.equal(parsed.parts[0].name, '');
  assert.equal(parsed.parts[0].qty, 2);
});

test('paper space and DEFPOINTS are not parts', () => {
  const parsed = parseDxf(dxf({
    entities: [
      ...lwpoly(rect(0, 0, 10, 10), { paper: true }),
      ...lwpoly(rect(0, 0, 12, 12), { layer: 'DEFPOINTS' }),
      ...lwpoly(rect(0, 0, 30, 40))
    ]
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 30);
  assert.equal(parsed.parts[0].height, 40);
});

test('anonymous insert is ignored', () => {
  const parsed = parseDxf(dxf({
    blocks: block('*D1', lwpoly(rect(0, 0, 500, 500))),
    entities: [...insert('*D1'), ...lwpoly(rect(0, 0, 40, 20))]
  }));
  assert.equal(parsed.parts.length, 1);
  assert.equal(parsed.parts[0].width, 40);
  assert.equal(parsed.parts[0].height, 20);
});

test('parsed parts pack on a sheet', () => {
  const parsed = parseDxf(dxf({ entities: lwpoly(rect(0, 0, 150, 300)) }));
  const result = pack({
    sheetWidth: 1000,
    sheetHeight: 2000,
    kerf: 4,
    allowRotate: false,
    mode: 'free',
    parts: parsed.parts.map((part, index) => ({
      id: 'd' + index,
      name: part.name,
      width: part.width,
      height: part.height,
      qty: part.qty
    }))
  });
  assert.equal(result.unplaced.length, 0);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].placements[0].width, 150);
  assert.equal(result.sheets[0].placements[0].height, 300);
});
