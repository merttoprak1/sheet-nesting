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
    lang: storedLang(),
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

  function groupSep() { return state.lang === 'tr' ? '.' : ','; }

  function decSep() { return state.lang === 'tr' ? ',' : '.'; }

  function fmtMm(n) {
    var sign = n < 0 ? '-' : '';
    var v = Math.abs(Math.round(n * 1000) / 1000);
    var bits = String(v).split('.');
    bits[0] = bits[0].replace(/\B(?=(\d{3})+(?!\d))/g, groupSep());
    return sign + bits[0] + (bits[1] ? decSep() + bits[1] : '');
  }

  function fmtFixed(n, digits) {
    var sign = n < 0 ? '-' : '';
    var parts = Math.abs(n).toFixed(digits).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, groupSep());
    return sign + parts[0] + (parts[1] ? decSep() + parts[1] : '');
  }

  function fmtArea(mm2) {
    var m2 = mm2 / 1e6;
    if (Math.abs(m2) >= 0.01 || mm2 === 0) return fmtFixed(m2, 2) + ' m²';
    return fmtFixed(mm2 / 100, 0) + ' cm²';
  }

  function fmtPct(ratio) {
    var v = Math.round(ratio * 1000) / 10;
    if (Number.isInteger(v)) return String(v) + '%';
    var text = v.toFixed(1);
    return (state.lang === 'tr' ? text.replace('.', ',') : text) + '%';
  }

  function xl(n) {
    var text = String(Math.round(n * 1000) / 1000);
    return state.lang === 'tr' ? text.replace('.', ',') : text;
  }

  function setStatus(text) {
    document.getElementById('status').textContent = text;
  }

  function storedLang() {
    try {
      var saved = localStorage.getItem('sheet-lang');
      if (saved === 'en' || saved === 'tr') return saved;
    } catch (err) {}
    return 'en';
  }

  var COPY = {
    en: {
      title: 'Sheet nesting',
      lede: 'Places rectangular parts on a sheet, with a kerf gap between them.',
      sheet: 'Sheet',
      parts: 'Parts',
      kerfHead: 'Kerf',
      sheetW: 'Width (mm)',
      sheetH: 'Height (mm)',
      colName: 'Name',
      colW: 'W',
      colH: 'H',
      colQty: 'Qty',
      addRow: 'Add row',
      openDxf: 'Open DXF',
      dxfTitle: 'Reads closed rectangular outlines.',
      pasteSummary: 'Paste a list',
      pasteHint: 'One part per line.',
      pasteAdd: 'Add',
      pastePh: '150 300\n150x300x4\nCover 820 2100 2',
      kerfAria: 'Kerf, mm',
      rotate: 'Allow 90°',
      modeFree: 'Free',
      modeGuillotine: 'Guillotine',
      optimize: 'Optimize',
      statSheets: 'Sheets',
      statYield: 'Yield',
      statWaste: 'Offcut',
      fine: 'Fewer sheets is the aim. The result may not be the best possible.',
      statusIdle: 'Enter the parts. Choose the kerf. Optimize.',
      zoomOut: 'Zoom out',
      zoomFit: 'Fit',
      zoomIn: 'Zoom in',
      replay: 'Replay',
      print: 'Print',
      saveSvg: 'Download SVG',
      copyList: 'Copy for Excel',
      copied: 'Copied',
      copyFail: 'Could not copy',
      stale: 'Result is old. Optimize again.',
      phName: 'name',
      phW: 'w',
      phH: 'h',
      del: 'Remove',
      sheetWBad: 'Sheet width must be a number greater than zero.',
      sheetHBad: 'Sheet height must be a number greater than zero.',
      sheetLimit: 'Sheet size must be under 50 m.',
      kerfBad: 'Kerf must be zero or greater.',
      rowW: 'Row {n}: width must be a number.',
      rowH: 'Row {n}: height must be a number.',
      rowPos: 'Row {n}: width and height must be greater than zero.',
      partLimit: 'Part size must be under 50 m.',
      rowQty: 'Row {n}: quantity must be a whole number of 1 or more.',
      qtyCap: 'At most 500 per row.',
      countCap: 'At most 1,500 parts. Split the quantity.',
      needParts: 'Enter a part size.',
      modeFreeWord: 'free',
      modeGuillotineWord: 'guillotine',
      runLine: '{sheet} mm · kerf {kerf} mm · {mode} · {n} parts',
      summary: '{n} parts · {area}',
      kerfMissing: 'Enter the kerf.',
      flush: 'Parts sit flush.',
      gap: 'A {kerf} mm gap stays between parts.',
      guillotineHint: 'Cuts run through.',
      freeHint: 'Free nesting leaves less offcut.',
      calculating: 'Working',
      packFail: 'Could not place the parts.',
      placing: 'Placing · {i}/{n}',
      placed: 'Placed',
      placedSome: 'Placed. Some parts do not fit.',
      noneFit: 'Some parts do not fit.',
      countSuffix: ', {n} pcs',
      rotateHint: '{name} {size}{count} does not fit. Turn on 90°.',
      noFit: '{name} {size}{count} does not fit. Sheet is {sheet}. Split the part or use a larger sheet.',
      moreTypes: 'and {n} more.',
      ghostBad: 'Enter the sheet size. The drawing stays here.',
      ghostWait: 'Parts land here after you nest.',
      sheetN: 'Sheet {n}',
      sheetMeta: '{size} mm · {n} parts · {pct} of the sheet · corner at top left',
      yieldTip: 'Part area divided by the full sheet area.',
      pcs: '{n} pcs',
      cutCaption: 'Cut list. X and Y are millimetres from the top-left corner.',
      cutSheet: 'Sheet',
      cutPart: 'Part',
      cutSize: 'Size',
      cutTurn: 'Turn',
      turnNo: '—',
      detailGap: 'Gap drawn large. The sheet is to scale.',
      tsvHead: 'Sheet\tPart\tW\tH\tX\tY\tTurn',
      tsvMiss: 'Does not fit',
      tsvSheet: 'Sheet {size} mm',
      tsvKerf: 'Kerf {kerf} mm',
      svgNote: 'Kerf {kerf} mm. Sizes in mm. Corner at top left.',
      svgFile: 'sheet-nesting.svg',
      titleResult: '{n} sheets · {pct} · Sheet nesting',
      dxfBinary: 'This DXF is binary. Save it as ASCII.',
      dxfBad: 'Could not read the DXF.',
      dxfNone: 'No closed rectangle in the DXF.',
      dxfSkip: '{n} shapes are not rectangles. Left out.',
      dxfGot: '{n} parts came in. {m} sizes.',
      dxfAssume: 'Unit taken as mm.',
      dxfConverted: 'Unit was {unit}, converted to mm.',
      unit_in: 'inch',
      unit_ft: 'ft',
      unit_cm: 'cm',
      unit_m: 'm',
      unit_yd: 'yd',
      unit_um: 'micron',
      unit_dm: 'dm',
      unit_dam: 'dam',
      lineBad: 'Line {n} was not read.',
      lineNone: 'No line was read.',
      lineSome: 'Line {n} was not read. The other lines were added.',
      lineAdded: '{n} sizes added.'
    },
    tr: {
      title: 'Levha yerleşimi',
      lede: 'Dikdörtgen parçaları, aralarında bıçak payı bırakarak levhaya dizer.',
      sheet: 'Levha',
      parts: 'Parçalar',
      kerfHead: 'Bıçak payı',
      sheetW: 'En (mm)',
      sheetH: 'Boy (mm)',
      colName: 'Ad',
      colW: 'En',
      colH: 'Boy',
      colQty: 'Adet',
      addRow: 'Satır ekle',
      openDxf: 'DXF aç',
      dxfTitle: 'Kapalı dikdörtgen konturları okur.',
      pasteSummary: 'Liste yapıştır',
      pasteHint: 'Her satır bir çeşittir.',
      pasteAdd: 'Ekle',
      pastePh: '150 300\n150x300x4\nKapak 820 2100 2',
      kerfAria: 'Bıçak payı, mm',
      rotate: '90° döndür',
      modeFree: 'Serbest',
      modeGuillotine: 'Giyotin',
      optimize: 'Optimize et',
      statSheets: 'Levha',
      statYield: 'Verim',
      statWaste: 'Fire',
      fine: 'Az levha hedeflenir. Sonuç kesin en iyi olmayabilir.',
      statusIdle: 'Parçaları gir. Bıçak payını seç. Optimize et.',
      zoomOut: 'Küçült',
      zoomFit: 'Sığdır',
      zoomIn: 'Büyüt',
      replay: 'Oynat',
      print: 'Yazdır',
      saveSvg: 'SVG indir',
      copyList: 'Excel\'e kopyala',
      copied: 'Kopyalandı',
      copyFail: 'Kopyalanamadı',
      stale: 'Sonuç eski. Yeniden optimize et.',
      phName: 'ad',
      phW: 'en',
      phH: 'boy',
      del: 'Sil',
      sheetWBad: 'Levha eni sıfırdan büyük bir sayı olmalı.',
      sheetHBad: 'Levha boyu sıfırdan büyük bir sayı olmalı.',
      sheetLimit: 'Levha ölçüsü 50 m altında olmalı.',
      kerfBad: 'Bıçak payı sıfır veya daha büyük olmalı.',
      rowW: '{n}. satırda en sayı olmalı.',
      rowH: '{n}. satırda boy sayı olmalı.',
      rowPos: '{n}. satırda en ve boy sıfırdan büyük olmalı.',
      partLimit: 'Parça ölçüsü 50 m altında olmalı.',
      rowQty: '{n}. satırda adet 1 veya daha büyük bir tam sayı olmalı.',
      qtyCap: 'Bir satırda en fazla 500 adet.',
      countCap: 'En fazla 1.500 parça. Adedi böl.',
      needParts: 'Parça ölçüsü gir.',
      modeFreeWord: 'serbest',
      modeGuillotineWord: 'giyotin',
      runLine: '{sheet} mm · pay {kerf} mm · {mode} · {n} parça',
      summary: '{n} parça · {area}',
      kerfMissing: 'Bıçak payını gir.',
      flush: 'Parçalar bitişik.',
      gap: 'Parçalar arasında {kerf} mm boşluk kalır.',
      guillotineHint: 'Kesim boydan boya gider.',
      freeHint: 'Serbest yerleşim fireyi azaltır.',
      calculating: 'Hesaplanıyor',
      packFail: 'Yerleşim hesaplanamadı.',
      placing: 'Yerleşiyor · {i}/{n}',
      placed: 'Yerleşti',
      placedSome: 'Yerleşti. Sığmayan parça var.',
      noneFit: 'Sığmayan parça var.',
      countSuffix: ', {n} adet',
      rotateHint: '{name} {size}{count} sığmıyor. 90° döndür seçeneğini aç.',
      noFit: '{name} {size}{count} sığmıyor. Levha {sheet}. Parçayı böl veya levhayı büyüt.',
      moreTypes: 've {n} çeşit daha.',
      ghostBad: 'Levha ölçüsünü gir. Çizim burada durur.',
      ghostWait: 'Parçalar optimize edilince buraya oturur.',
      sheetN: 'Levha {n}',
      sheetMeta: '{size} mm · {n} parça · levhanın {pct} kadarı · köşe sol üst',
      yieldTip: 'Parça alanı, tüm levha alanına bölünür.',
      pcs: '{n} adet',
      cutCaption: 'Kesim listesi. X ve Y, levhanın sol üst köşesinden mm.',
      cutSheet: 'Levha',
      cutPart: 'Parça',
      cutSize: 'Ölçü',
      cutTurn: 'Dönüş',
      turnNo: '—',
      detailGap: 'Derz büyük çizildi. Levha ölçeklidir.',
      tsvHead: 'Levha\tParça\tEn\tBoy\tX\tY\tDönüş',
      tsvMiss: 'Sığmayan',
      tsvSheet: 'Levha {size} mm',
      tsvKerf: 'Bıçak payı {kerf} mm',
      svgNote: 'Bıçak payı {kerf} mm. Ölçüler mm. Köşe sol üst.',
      svgFile: 'levha-yerlesim.svg',
      titleResult: '{n} levha · {pct} · Levha yerleşimi',
      dxfBinary: 'Bu DXF ikili. ASCII olarak kaydet.',
      dxfBad: 'DXF okunamadı.',
      dxfNone: 'DXF içinde kapalı dikdörtgen yok.',
      dxfSkip: '{n} şekil dikdörtgen değil. Eklenmedi.',
      dxfGot: '{n} parça geldi. {m} çeşit.',
      dxfAssume: 'Birim mm kabul edildi.',
      dxfConverted: 'Birim {unit}, mm ye çevrildi.',
      unit_in: 'inç',
      unit_ft: 'fit',
      unit_cm: 'cm',
      unit_m: 'm',
      unit_yd: 'yard',
      unit_um: 'mikron',
      unit_dm: 'dm',
      unit_dam: 'dam',
      lineBad: '{n}. satır okunmadı.',
      lineNone: 'Satır okunmadı.',
      lineSome: '{n}. satır okunmadı. Diğer satırlar eklendi.',
      lineAdded: '{n} çeşit eklendi.'
    }
  };

  function t(key, vars) {
    var text = (COPY[state.lang] && COPY[state.lang][key]) || COPY.en[key] || key;
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (_, name) {
      return vars[name] == null ? '' : String(vars[name]);
    });
  }

  function num(value) {
    return SheetPacker.readNumber(value, state.lang);
  }

  function reformatNumbers(readLocale) {
    function fix(input) {
      if (!input || !String(input.value).trim()) return;
      var value = SheetPacker.readNumber(input.value, readLocale);
      if (typeof value === 'number') input.value = fmtMm(value);
    }
    fix(sheetW);
    fix(sheetH);
    fix(kerfInput);
    partList.querySelectorAll('.part-row').forEach(function (row) {
      fix(row.querySelector('[data-field="w"]'));
      fix(row.querySelector('[data-field="h"]'));
      fix(row.querySelector('[data-field="qty"]'));
    });
  }

  function applyCopy() {
    document.documentElement.lang = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      var on = btn.dataset.lang === state.lang;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-sheet]').forEach(function (btn) {
      var bits = btn.dataset.sheet.split('x');
      btn.textContent = fmtMm(Number(bits[0])) + '×' + fmtMm(Number(bits[1]));
    });
    partList.querySelectorAll('.part-row').forEach(labelRow);
    setTitle();
  }

  function labelRow(row) {
    var name = row.querySelector('[data-field="name"]');
    var w = row.querySelector('[data-field="w"]');
    var h = row.querySelector('[data-field="h"]');
    var qty = row.querySelector('[data-field="qty"]');
    name.placeholder = t('phName');
    name.setAttribute('aria-label', t('colName'));
    w.placeholder = t('phW');
    w.setAttribute('aria-label', t('colW'));
    h.placeholder = t('phH');
    h.setAttribute('aria-label', t('colH'));
    qty.setAttribute('aria-label', t('colQty'));
    row.querySelector('.sil').textContent = t('del');
  }

  function setLang(next) {
    if ((next !== 'en' && next !== 'tr') || next === state.lang) return;
    var prev = state.lang;
    state.lang = next;
    try { localStorage.setItem('sheet-lang', next); } catch (err) {}
    reformatNumbers(prev);
    applyCopy();
    refresh();
    if (state.result) {
      showResult(state.result, false);
      if (!state.dirty) setStatus(doneMessage(state.result));
    } else {
      renderGhost();
    }
  }

  function dxfMessage(parsed) {
    if (parsed.error === 'binary') return t('dxfBinary');
    if (parsed.error) return t('dxfBad');
    var extra = parsed.skipped ? ' ' + t('dxfSkip', { n: parsed.skipped }) : '';
    if (!parsed.parts.length) return t('dxfNone') + extra;
    var total = 0;
    parsed.parts.forEach(function (part) { total += part.qty; });
    var msg = t('dxfGot', { n: total, m: parsed.parts.length });
    var word = t('unit_' + parsed.unit);
    if (parsed.assumedUnit) msg += ' ' + t('dxfAssume');
    else if (parsed.unit && parsed.unit !== 'mm' && word !== 'unit_' + parsed.unit) {
      msg += ' ' + t('dxfConverted', { unit: word });
    }
    return msg + extra;
  }

  function setTitle() {
    var result = state.result;
    if (!result || state.dirty || !result.sheets.length) document.title = t('title');
    else document.title = t('titleResult', { n: result.sheets.length, pct: fmtPct(result.yieldRatio) });
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
    row.appendChild(field('name', t('colName'), t('phName'), 'text'));
    row.appendChild(field('w', t('colW'), t('phW'), 'decimal'));
    row.appendChild(field('h', t('colH'), t('phH'), 'decimal'));
    row.appendChild(field('qty', t('colQty'), '1', 'numeric'));
    var sil = document.createElement('button');
    sil.type = 'button';
    sil.className = 'sil';
    sil.textContent = t('del');
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
        width: num(row.querySelector('[data-field="w"]').value),
        height: num(row.querySelector('[data-field="h"]').value),
        qty: num(row.querySelector('[data-field="qty"]').value)
      };
    });
  }

  function inspect() {
    document.querySelectorAll('.is-bad').forEach(function (el) { el.classList.remove('is-bad'); });
    var width = num(sheetW.value);
    var height = num(sheetH.value);
    var kerf = num(kerfInput.value);
    var allowRotate = document.getElementById('rotate').checked;
    var mode = document.getElementById('modeGuillotine').checked ? 'guillotine' : 'free';
    var base = { allowRotate: allowRotate, mode: mode, parts: [], pieceCount: 0, sheetWidth: width, sheetHeight: height, kerf: kerf };

    if (width == null || Number.isNaN(width) || width <= 0) return fail(base, t('sheetWBad'), sheetW);
    if (height == null || Number.isNaN(height) || height <= 0) return fail(base, t('sheetHBad'), sheetH);
    if (width > 50000 || height > 50000) return fail(base, t('sheetLimit'));
    if (kerf == null || Number.isNaN(kerf) || kerf < 0) return fail(base, t('kerfBad'), kerfInput);

    var parts = [];
    var pieceCount = 0;
    var rows = readRows();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var empty = !row.name.trim() && row.width == null && row.height == null && row.qty == null;
      if (empty) continue;
      if (row.width == null || Number.isNaN(row.width)) return fail(base, t('rowW', { n: i + 1 }), row.row.querySelector('[data-field="w"]'), parts, pieceCount);
      if (row.height == null || Number.isNaN(row.height)) return fail(base, t('rowH', { n: i + 1 }), row.row.querySelector('[data-field="h"]'), parts, pieceCount);
      if (!(row.width > 0) || !(row.height > 0)) return fail(base, t('rowPos', { n: i + 1 }), row.row.querySelector('[data-field="w"]'), parts, pieceCount);
      if (row.width > 50000 || row.height > 50000) return fail(base, t('partLimit'), null, parts, pieceCount);
      var qty = row.qty == null ? 1 : row.qty;
      if (Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) return fail(base, t('rowQty', { n: i + 1 }), row.row.querySelector('[data-field="qty"]'), parts, pieceCount);
      if (qty > 500) return fail(base, t('qtyCap'), row.row.querySelector('[data-field="qty"]'), parts, pieceCount);
      pieceCount += qty;
      if (pieceCount > 1500) return fail(base, t('countCap'), null, parts, pieceCount);
      parts.push({ id: row.id, name: row.name.trim(), width: row.width, height: row.height, qty: qty });
    }
    if (!parts.length) return fail(base, t('needParts'));
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
    var cut = job.mode === 'guillotine' ? t('modeGuillotineWord') : t('modeFreeWord');
    line.textContent = t('runLine', {
      sheet: fmtMm(job.sheetWidth) + '×' + fmtMm(job.sheetHeight),
      kerf: fmtMm(job.kerf),
      mode: cut,
      n: job.pieceCount
    });
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
    el.textContent = t('summary', { n: job.pieceCount, area: fmtArea(area) });
  }

  function renderHint(job) {
    var kerf = job.kerf;
    var gap = t('kerfMissing');
    if (typeof kerf === 'number' && !Number.isNaN(kerf) && kerf >= 0) {
      gap = kerf === 0 ? t('flush') : t('gap', { kerf: fmtMm(kerf) });
    }
    var cut = job.mode === 'guillotine' ? t('guillotineHint') : t('freeHint');
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
      setStatus(t('stale'));
    } else {
      stale.hidden = true;
      if (!state.result) setStatus(t('statusIdle'));
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
    var w = num(sheetW.value);
    var h = num(sheetH.value);
    if (!(w > 0) || !(h > 0) || w > 50000 || h > 50000) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = t('ghostBad');
      host.appendChild(empty);
      return;
    }
    var card = sheetCard(t('sheet'), t('ghostWait'));
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
      var count = item.count > 1 ? t('countSuffix', { n: item.count }) : '';
      var vars = {
        name: item.name,
        size: size,
        count: count,
        sheet: fmtMm(result.sheetWidth) + '×' + fmtMm(result.sheetHeight) + ' mm'
      };
      p.textContent = item.fitsIfRotated ? t('rotateHint', vars) : t('noFit', vars);
      box.appendChild(p);
    });
    if (groups.size > shown) {
      var more = document.createElement('p');
      more.textContent = t('moreTypes', { n: groups.size - shown });
      box.appendChild(more);
    }
    host.appendChild(box);
  }

  function doneMessage(result) {
    if (result.unplaced.length && result.sheets.length) return t('placedSome');
    if (result.unplaced.length) return t('noneFit');
    return t('placed');
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
        t('sheetN', { n: sheet.index }),
        t('sheetMeta', {
          size: fmtMm(result.sheetWidth) + '×' + fmtMm(result.sheetHeight),
          n: sheet.placements.length,
          pct: pct
        })
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
    setStatus(t('placing', { i: 1, n: total }));
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
        setStatus(t('placing', { i: Number(event.target.dataset.i) + 1, n: total }));
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
      li.appendChild(document.createTextNode(part.name + ' · ' + fmtMm(part.width) + '×' + fmtMm(part.height) + ' · ' + t('pcs', { n: part.count })));
      host.appendChild(li);
    });
  }

  function renderCutList(result) {
    var host = document.getElementById('cutlist');
    host.replaceChildren();
    if (!result.sheets.length) return;
    var table = document.createElement('table');
    var caption = document.createElement('caption');
    caption.textContent = t('cutCaption');
    table.appendChild(caption);
    var thead = document.createElement('thead');
    var head = document.createElement('tr');
    [t('cutSheet'), t('cutPart'), t('cutSize'), 'X', 'Y', t('cutTurn')].forEach(function (label, index) {
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
          piece.rotated ? '90°' : t('turnNo')
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
    caption.textContent = kerf === 0 ? t('flush') : t('detailGap');
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
    var lines = [t('tsvHead')];
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
      lines.push(t('tsvMiss'));
      result.unplaced.forEach(function (piece) {
        lines.push([piece.name, xl(piece.width), xl(piece.height)].join('\t'));
      });
    }
    lines.push('');
    lines.push(t('tsvSheet', { size: xl(result.sheetWidth) + ' x ' + xl(result.sheetHeight) }));
    lines.push(t('tsvKerf', { kerf: xl(result.kerf) }));
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
      body += '<text x="' + padL + '" y="' + (y0 + font + 6) + '" font-size="' + font + '" font-family="sans-serif">' + esc(t('sheetN', { n: sheet.index })) + '</text>';
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
    var note = t('svgNote', { kerf: fmtMm(result.kerf) });
    body += '<text x="' + padL + '" y="' + (height - 10) + '" font-size="' + Math.max(10, font * 0.55) + '" font-family="sans-serif">' + esc(note) + '</text>';
    return '<?xml version="1.0" encoding="UTF-8"?>' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + 'mm" height="' + height + 'mm" viewBox="0 0 ' + width + ' ' + height + '">' +
      '<defs>' + defs + '</defs>' + body + '</svg>';
  }

  function downloadSvg(result) {
    var blob = new Blob([svgDocument(result)], { type: 'image/svg+xml' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = t('svgFile');
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
    button.textContent = ok ? t('copied') : t('copyFail');
    setTimeout(function () {
      var label = button.querySelector('[data-i18n]');
      if (label) label.textContent = t('copyList');
      else button.textContent = t('copyList');
    }, 1400);
  }

  async function optimize() {
    var job = refresh();
    if (!job.ok) return;
    var button = document.getElementById('optimize');
    button.disabled = true;
    setStatus(t('calculating'));
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
      setStatus(t('packFail'));
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
    document.querySelectorAll('[data-lang]').forEach(function (btn) {
      btn.addEventListener('click', function () { setLang(btn.dataset.lang); });
    });
    document.getElementById('addRow').addEventListener('click', function () {
      var row = addRow();
      row.querySelector('[data-field="w"]').focus();
    });
    document.getElementById('pasteAdd').addEventListener('click', function () {
      var parsed = SheetPacker.parsePartList(document.getElementById('pasteBox').value, state.lang);
      if (!parsed.parts.length) {
        setStatus(parsed.errors.length ? t('lineBad', { n: parsed.errors[0].line }) : t('lineNone'));
        return;
      }
      var rows = Array.prototype.slice.call(partList.querySelectorAll('.part-row'));
      if (rows.every(isRowEmpty)) rows.forEach(function (row) { row.remove(); });
      parsed.parts.forEach(addRow);
      document.getElementById('pasteBox').value = '';
      onEdit('part');
      if (parsed.errors.length) setStatus(t('lineSome', { n: parsed.errors[0].line }));
      else setStatus(t('lineAdded', { n: parsed.parts.length }));
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
          setStatus(t('dxfBad'));
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
      reader.onerror = function () { setStatus(t('dxfBad')); };
      reader.readAsText(file);
    });
    document.querySelectorAll('[data-sheet]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var bits = btn.dataset.sheet.split('x');
        sheetW.value = fmtMm(Number(bits[0]));
        sheetH.value = fmtMm(Number(bits[1]));
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
  reformatNumbers(state.lang);
  applyCopy();
  refresh();
  renderGhost();
  var firstWidth = partList.querySelector('[data-field="w"]');
  if (firstWidth) firstWidth.focus();
})();
