const test = require('node:test');
const assert = require('node:assert/strict');
const { pack, parsePartList, readNumber } = require('./packer');

const EPS = 0.02;

function separated(a, b, kerf) {
  return (
    a.x + a.width + kerf <= b.x + EPS ||
    b.x + b.width + kerf <= a.x + EPS ||
    a.y + a.height + kerf <= b.y + EPS ||
    b.y + b.height + kerf <= a.y + EPS
  );
}

function assertValid(result) {
  const seen = new Set();
  let placed = 0;
  for (const sheet of result.sheets) {
    for (const p of sheet.placements) {
      placed += 1;
      assert.equal(seen.has(p.id), false);
      seen.add(p.id);
      assert.ok(p.x >= -EPS, 'x');
      assert.ok(p.y >= -EPS, 'y');
      assert.ok(p.x + p.width <= result.sheetWidth + EPS, 'right');
      assert.ok(p.y + p.height <= result.sheetHeight + EPS, 'bottom');
    }
    const list = sheet.placements;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        assert.ok(separated(list[i], list[j], result.kerf), `${list[i].id} ${list[j].id}`);
      }
    }
  }
  assert.equal(placed + result.unplaced.length, result.pieceCount);
}

function isGuillotine(pieces, x, y, w, h) {
  const inside = pieces.filter((p) =>
    p.x < x + w - 1e-6 && p.x + p.width > x + 1e-6 &&
    p.y < y + h - 1e-6 && p.y + p.height > y + 1e-6
  );
  if (inside.length <= 1) return true;
  const xs = new Set();
  const ys = new Set();
  for (const p of inside) {
    const rx = Math.round(p.x * 1000) / 1000;
    const ry = Math.round(p.y * 1000) / 1000;
    const rw = Math.round((p.x + p.width) * 1000) / 1000;
    const rh = Math.round((p.y + p.height) * 1000) / 1000;
    if (rx > x + 1e-6 && rx < x + w - 1e-6) xs.add(rx);
    if (rw > x + 1e-6 && rw < x + w - 1e-6) xs.add(rw);
    if (ry > y + 1e-6 && ry < y + h - 1e-6) ys.add(ry);
    if (rh > y + 1e-6 && rh < y + h - 1e-6) ys.add(rh);
  }
  for (const cx of xs) {
    if (inside.some((p) => p.x < cx - 1e-6 && p.x + p.width > cx + 1e-6)) continue;
    const left = inside.filter((p) => p.x + p.width <= cx + 1e-6);
    const right = inside.filter((p) => p.x >= cx - 1e-6);
    if (!left.length || !right.length || left.length + right.length !== inside.length) continue;
    if (isGuillotine(left, x, y, cx - x, h) && isGuillotine(right, cx, y, x + w - cx, h)) return true;
  }
  for (const cy of ys) {
    if (inside.some((p) => p.y < cy - 1e-6 && p.y + p.height > cy + 1e-6)) continue;
    const top = inside.filter((p) => p.y + p.height <= cy + 1e-6);
    const bottom = inside.filter((p) => p.y >= cy - 1e-6);
    if (!top.length || !bottom.length || top.length + bottom.length !== inside.length) continue;
    if (isGuillotine(top, x, y, w, cy - y) && isGuillotine(bottom, x, cy, w, y + h - cy)) return true;
  }
  return false;
}

function rand(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('readNumber accepts Turkish marks', () => {
  assert.equal(readNumber('1500'), 1500);
  assert.equal(readNumber('1.500'), 1500);
  assert.equal(readNumber('1,5'), 1.5);
  assert.equal(readNumber('1.500,25'), 1500.25);
  assert.equal(readNumber('1.5'), 1.5);
  assert.equal(readNumber(''), null);
  assert.ok(Number.isNaN(readNumber('abc')));
  assert.equal(readNumber('1,500', 'en'), 1500);
  assert.equal(readNumber('1,500.25', 'en'), 1500.25);
  assert.equal(readNumber('1.5', 'en'), 1.5);
  assert.equal(readNumber('1,5', 'en'), 1.5);
});

test('parsePartList reads shop lines', () => {
  const parsed = parsePartList('150 300\n150x300x4\nKapak 820 2100 2\n2 Kapı 100 200\n# not\nbad line\n');
  assert.equal(parsed.errors.length, 1);
  assert.deepEqual(parsed.parts.map((p) => [p.name, p.width, p.height, p.qty]), [
    ['', 150, 300, 1],
    ['', 150, 300, 4],
    ['Kapak', 820, 2100, 2],
    ['Kapı', 100, 200, 2]
  ]);
});

test('one piece sits on the corner and the edge stays flush', () => {
  const result = pack({
    sheetWidth: 1000,
    sheetHeight: 2000,
    kerf: 4,
    allowRotate: true,
    mode: 'free',
    parts: [{ id: 'a', name: 'A', width: 150, height: 300, qty: 1 }]
  });
  assertValid(result);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.sheets[0].placements[0].x, 0);
  assert.equal(result.sheets[0].placements[0].y, 0);
  assert.equal(result.sheets[0].placements[0].width, 150);
  assert.equal(result.sheets[0].placements[0].height, 300);
});

test('kerf separates two pieces and still fills the sheet edge', () => {
  const result = pack({
    sheetWidth: 205,
    sheetHeight: 100,
    kerf: 5,
    allowRotate: false,
    mode: 'free',
    parts: [{ id: 'a', width: 100, height: 100, qty: 2 }]
  });
  assertValid(result);
  assert.equal(result.sheets.length, 1);
  const xs = result.sheets[0].placements.map((p) => p.x).sort((a, b) => a - b);
  assert.equal(xs[0], 0);
  assert.equal(xs[1], 105);
});

test('kerf blocks a row that would only fit when flush', () => {
  const result = pack({
    sheetWidth: 204,
    sheetHeight: 100,
    kerf: 5,
    allowRotate: false,
    mode: 'free',
    parts: [{ id: 'a', width: 100, height: 100, qty: 2 }]
  });
  assertValid(result);
  assert.equal(result.sheets.length, 2);
});

test('exact pack of four rectangles uses one sheet', () => {
  const result = pack({
    sheetWidth: 100,
    sheetHeight: 100,
    kerf: 0,
    allowRotate: true,
    mode: 'free',
    parts: [
      { id: 'a', width: 60, height: 60, qty: 1 },
      { id: 'b', width: 40, height: 60, qty: 1 },
      { id: 'c', width: 60, height: 40, qty: 1 },
      { id: 'd', width: 40, height: 40, qty: 1 }
    ]
  });
  assertValid(result);
  assert.equal(result.sheets.length, 1);
  assert.equal(result.yieldRatio, 1);
});

test('rotation is optional', () => {
  const base = {
    sheetWidth: 200,
    sheetHeight: 500,
    kerf: 3,
    parts: [{ id: 'a', width: 400, height: 100, qty: 1 }]
  };
  const locked = pack({ ...base, allowRotate: false, mode: 'free' });
  const free = pack({ ...base, allowRotate: true, mode: 'free' });
  assert.equal(locked.unplaced.length, 1);
  assert.equal(locked.unplaced[0].fitsIfRotated, true);
  assert.equal(free.sheets.length, 1);
  assert.equal(free.sheets[0].placements[0].rotated, true);
  assert.equal(free.sheets[0].placements[0].width, 100);
  assert.equal(free.sheets[0].placements[0].height, 400);
});

test('odd sizes and a fractional kerf stay valid', () => {
  const result = pack({
    sheetWidth: 200.5,
    sheetHeight: 300.75,
    kerf: 1.25,
    allowRotate: true,
    mode: 'free',
    parts: [
      { id: 'a', width: 17.5, height: 80.25, qty: 3 },
      { id: 'b', name: 'Lento', width: 40, height: 12.5, qty: 5 }
    ]
  });
  assertValid(result);
  assert.equal(result.unplaced.length, 0);
  assert.ok(result.sheets.length >= 1);
});

test('a part larger than the sheet stays off the sheet', () => {
  const result = pack({
    sheetWidth: 1500,
    sheetHeight: 3000,
    kerf: 3,
    allowRotate: true,
    mode: 'free',
    parts: [{ id: 'a', name: 'Uzun', width: 3200, height: 400, qty: 1 }]
  });
  assert.equal(result.sheets.length, 0);
  assert.equal(result.unplaced[0].fitsIfRotated, false);
});

test('guillotine layouts can be cut through', () => {
  const random = rand(7);
  const parts = [];
  for (let i = 0; i < 14; i++) {
    parts.push({
      id: 'p' + i,
      width: 40 + Math.floor(random() * 180),
      height: 30 + Math.floor(random() * 160),
      qty: 1
    });
  }
  const result = pack({
    sheetWidth: 600,
    sheetHeight: 400,
    kerf: 4,
    allowRotate: true,
    mode: 'guillotine',
    parts
  });
  assertValid(result);
  for (const sheet of result.sheets) {
    assert.equal(isGuillotine(sheet.placements, 0, 0, result.sheetWidth, result.sheetHeight), true);
  }
});

test('guillotine puts a small piece beside its neighbour', () => {
  const parts = [
    { id: '1', width: 300, height: 150, qty: 1 },
    { id: '2', width: 265, height: 50, qty: 1 },
    { id: '3', width: 30, height: 50, qty: 1 },
    { id: '4', width: 50, height: 85, qty: 1 },
    { id: '5', width: 180, height: 70, qty: 1 }
  ];
  for (const kerf of [2, 3, 4]) {
    const result = pack({
      sheetWidth: 1000,
      sheetHeight: 2000,
      kerf,
      allowRotate: true,
      mode: 'guillotine',
      parts
    });
    assertValid(result);
    assert.equal(result.sheets.length, 1);
    assert.equal(isGuillotine(result.sheets[0].placements, 0, 0, result.sheetWidth, result.sheetHeight), true);
    const list = result.sheets[0].placements;
    const small = list.find((p) => p.width === 30 && p.height === 50);
    const neighbour = list.find((p) => p.width === 50 && p.height === 85);
    assert.equal(small.y, neighbour.y);
    assert.ok(small.x >= neighbour.x + neighbour.width - EPS);
    assert.ok(small.x <= neighbour.x + neighbour.width + kerf + EPS);
  }
});

test('mixed strips on a plate stay valid in both modes', () => {
  const heights = [111, 265, 157, 50, 180, 213, 261, 420, 151, 148, 146, 153, 224, 219, 197, 196, 267, 119, 90, 161, 281, 202, 248, 245, 299];
  const parts = heights.map((height, i) => ({ id: 's' + i, width: 150, height, qty: 1 }));
  for (const mode of ['free', 'guillotine']) {
    const result = pack({
      sheetWidth: 1500,
      sheetHeight: 3000,
      kerf: 3,
      allowRotate: true,
      mode,
      parts
    });
    assertValid(result);
    assert.equal(result.unplaced.length, 0);
    assert.ok(result.sheets.length <= 2);
  }
});

test('150 random parts pack without overlap in under two seconds', () => {
  const random = rand(3);
  const parts = [];
  for (let i = 0; i < 150; i++) {
    parts.push({
      id: 'r' + i,
      width: 20 + Math.floor(random() * 240),
      height: 20 + Math.floor(random() * 180),
      qty: 1
    });
  }
  const started = Date.now();
  const result = pack({
    sheetWidth: 1250,
    sheetHeight: 2500,
    kerf: 3,
    allowRotate: true,
    mode: 'free',
    parts
  });
  const elapsed = Date.now() - started;
  assertValid(result);
  assert.equal(result.unplaced.length, 0);
  assert.ok(elapsed < 2000, String(elapsed));
});
