(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    file: $('#imgFile'), longEdge: $('#longEdge'), sizeResult: $('#sizeResult'),
    palette221: $('#palette221Btn'), palette291: $('#palette291Btn'), baseCount: $('#baseCount'), fullCount: $('#fullCount'),
    tolerance: $('#colorTol'), toleranceValue: $('#tolValue'), analyze: $('#analyzeBtn'), download: $('#downloadBtn'),
    container: $('#cropContainer'), image: $('#cropImage'), cropBox: $('#cropBox'), cropEmpty: $('#cropEmpty'),
    sourceStatus: $('#sourceStatus'), cropStatus: $('#cropStatus'), resultStatus: $('#resultStatus'), result: $('#resultContainer'),
    startCrop: $('#startCropBtn'), applyCrop: $('#applyCropBtn'), cancelCrop: $('#cancelCropBtn'),
    zoomIn: $('#zoomInBtn'), zoomOut: $('#zoomOutBtn'), zoomValue: $('#zoomValue'),
  };

  const state = {
    image: null, source: null, useCrop: false, cropMode: false, crop: null, cropped: null, zoom: 1,
    paletteMode: '221', finalCanvas: null, drag: null,
  };

  const EXPORT_CELL = 24;

  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function numberValue(element, fallback) { return Number(element.value) || fallback; }
  function currentPalette() { return getPalette(state.paletteMode); }
  function getActiveImage() { return state.useCrop && state.cropped ? state.cropped : state.image; }

  function imageBounds() {
    if (!state.image) return { left: 0, top: 0, width: 0, height: 0 };
    const area = elements.container.getBoundingClientRect();
    const width = state.image.width * state.zoom;
    const height = state.image.height * state.zoom;
    return { left: (area.width - width) / 2, top: (area.height - height) / 2, width, height };
  }

  function setSourceStatus() {
    if (!state.image) return;
    if (state.useCrop) {
      elements.sourceStatus.textContent = `当前使用裁剪区域：${state.crop.width} × ${state.crop.height} 像素。`;
      elements.cropStatus.textContent = '已使用裁剪构图';
    } else {
      elements.sourceStatus.textContent = `当前使用整张图片：${state.image.width} × ${state.image.height} 像素。`;
      elements.cropStatus.textContent = '整图模式';
    }
  }

  function dimensions() {
    const source = getActiveImage();
    if (!source) return null;
    const longest = clamp(Math.round(numberValue(elements.longEdge, 30)), 10, 120);
    const ratio = source.width / source.height;
    const width = ratio >= 1 ? longest : Math.max(1, Math.round(longest * ratio));
    const height = ratio >= 1 ? Math.max(1, Math.round(longest / ratio)) : longest;
    return { width, height, longest };
  }

  function updateSize() {
    const size = dimensions();
    if (!size) return;
    elements.longEdge.value = size.longest;
    elements.sizeResult.textContent = `预计成品：${size.width} × ${size.height} 颗（共 ${size.width * size.height} 颗）`;
  }

  function renderPalette() {
    const base = getPalette('221').length;
    const full = getPalette('291').length;
    elements.baseCount.textContent = `(${base} 色)`;
    elements.fullCount.textContent = `(${full} 色)`;
    elements.palette221.className = `btn ${state.paletteMode === '221' ? 'btn-primary' : 'btn-secondary'}`;
    elements.palette291.className = `btn ${state.paletteMode === '291' ? 'btn-primary' : 'btn-secondary'}`;
  }

  function renderImage() {
    if (!state.image) return;
    const bounds = imageBounds();
    elements.image.style.left = `${bounds.left}px`;
    elements.image.style.top = `${bounds.top}px`;
    elements.image.style.width = `${bounds.width}px`;
    elements.image.style.height = `${bounds.height}px`;
    elements.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
  }

  function renderCrop() {
    const visible = state.cropMode && state.crop;
    elements.cropBox.hidden = !visible;
    if (!visible) return;
    const c = state.crop;
    elements.cropBox.style.left = `${c.x}px`;
    elements.cropBox.style.top = `${c.y}px`;
    elements.cropBox.style.width = `${c.width}px`;
    elements.cropBox.style.height = `${c.height}px`;
  }

  function clampCrop() {
    const bounds = imageBounds();
    const c = state.crop;
    c.width = clamp(c.width, 40, bounds.width);
    c.height = clamp(c.height, 40, bounds.height);
    c.x = clamp(c.x, bounds.left, bounds.left + bounds.width - c.width);
    c.y = clamp(c.y, bounds.top, bounds.top + bounds.height - c.height);
  }

  function resetCropToWholeImage() {
    if (!state.image) return;
    const bounds = imageBounds();
    state.crop = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  }

  function loadImage(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        state.image = image;
        state.source = reader.result;
        state.useCrop = false;
        state.cropped = null;
        state.cropMode = false;
        state.finalCanvas = null;
        const area = elements.container.getBoundingClientRect();
        state.zoom = Math.min(area.width / image.width, area.height / image.height);
        elements.image.src = reader.result;
        elements.image.hidden = false;
        elements.cropEmpty.hidden = true;
        resetCropToWholeImage();
        renderImage();
        renderCrop();
        setSourceStatus();
        updateSize();
        elements.analyze.disabled = false;
        elements.startCrop.disabled = false;
        elements.applyCrop.disabled = true;
        elements.cancelCrop.disabled = false;
        elements.download.disabled = true;
        elements.resultStatus.textContent = '等待识别';
        elements.result.innerHTML = '<p class="empty-state">尺寸已按原图比例计算。点击“识别颜色并预览”。</p>';
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function beginCrop() {
    if (!state.image) return;
    state.cropMode = true;
    const bounds = imageBounds();
    state.crop = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
    renderCrop();
    elements.startCrop.disabled = true;
    elements.applyCrop.disabled = false;
    elements.cropStatus.textContent = '裁剪模式：拖动框调整构图，四边和四角均可改变范围。';
  }

  function cropImage() {
    const bounds = imageBounds();
    const c = state.crop;
    const scale = state.image.width / bounds.width;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(c.width * scale));
    canvas.height = Math.max(1, Math.round(c.height * scale));
    canvas.getContext('2d').drawImage(state.image, (c.x - bounds.left) * scale, (c.y - bounds.top) * scale, c.width * scale, c.height * scale, 0, 0, canvas.width, canvas.height);
    const image = new Image();
    image.onload = () => {
      state.cropped = image;
      state.useCrop = true;
      state.cropMode = false;
      renderCrop();
      setSourceStatus();
      updateSize();
      elements.startCrop.disabled = false;
      elements.applyCrop.disabled = true;
      invalidatePreview();
    };
    image.src = canvas.toDataURL('image/png');
  }

  function cancelCrop() {
    if (!state.image) return;
    state.useCrop = false;
    state.cropped = null;
    state.cropMode = false;
    resetCropToWholeImage();
    renderCrop();
    setSourceStatus();
    updateSize();
    elements.startCrop.disabled = false;
    elements.applyCrop.disabled = true;
    invalidatePreview();
  }

  function invalidatePreview() {
    state.finalCanvas = null;
    elements.download.disabled = true;
    elements.resultStatus.textContent = '参数已更新，等待重新识别';
    elements.result.innerHTML = '<p class="empty-state">参数或取景已改变，请重新识别颜色。</p>';
  }

  function moveZoom(delta) {
    if (!state.image) return;
    state.zoom = clamp(state.zoom + delta, 0.1, 3);
    renderImage();
    if (state.cropMode) { clampCrop(); renderCrop(); }
  }

  function startPointer(event) {
    if (!state.cropMode || !state.crop) return;
    const handle = event.target.dataset.handle || 'move';
    state.drag = { handle, x: event.clientX, y: event.clientY, crop: { ...state.crop } };
    elements.cropBox.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function movePointer(event) {
    if (!state.drag || !state.cropMode) return;
    const d = state.drag;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    let next = { ...d.crop };
    if (d.handle === 'move') { next.x += dx; next.y += dy; }
    else {
      if (d.handle.includes('left')) { next.x += dx; next.width -= dx; }
      if (d.handle.includes('right')) { next.width += dx; }
      if (d.handle.includes('top')) { next.y += dy; next.height -= dy; }
      if (d.handle.includes('bottom')) { next.height += dy; }
      if (d.handle === 'tl') { next.x += dx; next.y += dy; next.width -= dx; next.height -= dy; }
      if (d.handle === 'tr') { next.y += dy; next.width += dx; next.height -= dy; }
      if (d.handle === 'bl') { next.x += dx; next.width -= dx; next.height += dy; }
      if (d.handle === 'br') { next.width += dx; next.height += dy; }
    }
    state.crop = next;
    clampCrop();
    renderCrop();
  }

  function stopPointer() { state.drag = null; }

  function closestMardColor(rgb, palette) {
    let closest = palette[0];
    let distance = Infinity;
    for (const color of palette) {
      const next = (rgb.r - color.r) ** 2 + (rgb.g - color.g) ** 2 + (rgb.b - color.b) ** 2;
      if (next < distance) { closest = color; distance = next; }
    }
    return closest;
  }

  function sampleCell(context, x, y, width, height) {
    const image = context.getImageData(x, y, width, height).data;
    let r = 0, g = 0, b = 0, total = 0;
    for (let i = 0; i < image.length; i += 4) {
      if (image[i + 3] === 0) continue;
      r += image[i]; g += image[i + 1]; b += image[i + 2]; total += 1;
    }
    return { r: Math.round(r / total), g: Math.round(g / total), b: Math.round(b / total) };
  }

  function drawGrid(canvas, grid, size, showCodes) {
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(8, size * .38)}px Arial, sans-serif`;
    grid.forEach((row, y) => row.forEach((color, x) => {
      const px = x * size, py = y * size;
      ctx.fillStyle = color.hex;
      ctx.fillRect(px, py, size, size);
      ctx.strokeStyle = 'rgb(100 116 139 / .45)';
      ctx.strokeRect(px, py, size, size);
      if (showCodes) {
        ctx.fillStyle = (color.r + color.g + color.b) / 3 > 140 ? '#111827' : '#fff';
        ctx.fillText(color.code, px + size / 2, py + size / 2);
      }
    }));
  }

  function makeDownloadCanvas(grid, counts, size) {
    const diagramW = size.width * EXPORT_CELL;
    const diagramH = size.height * EXPORT_CELL;
    const colors = [...counts.values()].sort((a, b) => a.color.code.localeCompare(b.color.code, undefined, { numeric: true }));
    const columns = colors.length > 10 ? 3 : 2;
    const itemW = 150, itemH = 28, padding = 20, titleH = 34;
    const rows = Math.ceil(colors.length / columns);
    const statsW = columns * itemW + padding * 2;
    const statsH = rows * itemH + titleH + padding * 2;
    const gap = 24;
    const canvas = document.createElement('canvas');
    canvas.width = diagramW + gap + statsW;
    canvas.height = Math.max(diagramH, statsH);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const chart = document.createElement('canvas'); chart.width = diagramW; chart.height = diagramH;
    drawGrid(chart, grid, EXPORT_CELL, true);
    ctx.drawImage(chart, 0, (canvas.height - diagramH) / 2);
    const sx = diagramW + gap, sy = (canvas.height - statsH) / 2;
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(sx, sy, statsW, statsH);
    ctx.fillStyle = '#1f2937'; ctx.font = '700 15px Arial'; ctx.textBaseline = 'middle';
    ctx.fillText(`颜色统计（${colors.length} 种）`, sx + padding, sy + 22);
    ctx.font = '700 12px Arial';
    colors.forEach((entry, index) => {
      const column = Math.floor(index / rows), row = index % rows;
      const x = sx + padding + column * itemW, y = sy + titleH + padding + row * itemH;
      ctx.fillStyle = entry.color.hex; ctx.fillRect(x, y - 9, 18, 18);
      ctx.strokeStyle = '#94a3b8'; ctx.strokeRect(x, y - 9, 18, 18);
      ctx.fillStyle = '#1f2937'; ctx.fillText(`${entry.color.code}  ${entry.count} 颗`, x + 25, y);
    });
    return canvas;
  }

  function renderStats(counts) {
    const panel = document.createElement('div'); panel.className = 'stats-panel';
    const values = [...counts.values()].sort((a, b) => a.color.code.localeCompare(b.color.code, undefined, { numeric: true }));
    panel.innerHTML = `<p class="stats-title">颜色用量（共 ${values.length} 种色号）</p>`;
    values.forEach(({ color, count }) => {
      const item = document.createElement('span'); item.className = 'stat-item';
      item.innerHTML = `<i class="color-chip" style="background:${color.hex}"></i>${color.code} <b>${count}</b> 颗`;
      panel.append(item);
    });
    return panel;
  }

  function analyze() {
    const source = getActiveImage();
    const size = dimensions();
    if (!source || !size) return;
    const sampling = document.createElement('canvas');
    sampling.width = size.width; sampling.height = size.height;
    const context = sampling.getContext('2d');
    context.imageSmoothingEnabled = true;
    context.drawImage(source, 0, 0, size.width, size.height);
    const palette = currentPalette();
    const tolerance = numberValue(elements.tolerance, 24);
    // 每个格子先直接映射到最近的标准色号；容差仅在色号已经相同或颜色
    // 几乎相同的情况下复用结果，绝不让遍历顺序决定不同的目标色号。
    const cachedMatches = [];
    const grid = Array.from({ length: size.height }, () => []);
    const counts = new Map();
    const sampleScale = 4;
    const detail = document.createElement('canvas');
    detail.width = size.width * sampleScale; detail.height = size.height * sampleScale;
    const detailCtx = detail.getContext('2d'); detailCtx.drawImage(source, 0, 0, detail.width, detail.height);
    for (let y = 0; y < size.height; y += 1) {
      for (let x = 0; x < size.width; x += 1) {
        const raw = sampleCell(detailCtx, x * sampleScale, y * sampleScale, sampleScale, sampleScale);
        const nearest = closestMardColor(raw, palette);
        const cached = tolerance > 0 && cachedMatches.find((item) => item.color.code === nearest.code && Math.hypot(raw.r - item.raw.r, raw.g - item.raw.g, raw.b - item.raw.b) <= tolerance);
        const color = cached ? cached.color : nearest;
        if (!cached && tolerance > 0) cachedMatches.push({ raw, color });
        grid[y][x] = color;
        const entry = counts.get(color.code) || { color, count: 0 };
        entry.count += 1; counts.set(color.code, entry);
      }
    }
    // 预览是实际制作时看的图纸，和下载版一样，每一格都必须有 MARD 色号。
    // 控制在 24～42px 之间：颗数较多时允许横向滚动，也不牺牲编号可读性。
    const previewCell = clamp(Math.floor(840 / Math.max(size.width, size.height)), 24, 42);
    const preview = document.createElement('canvas'); preview.width = size.width * previewCell; preview.height = size.height * previewCell;
    drawGrid(preview, grid, previewCell, true);
    state.finalCanvas = makeDownloadCanvas(grid, counts, size);
    elements.result.innerHTML = '';
    const summary = document.createElement('p'); summary.className = 'result-summary';
    summary.textContent = `${size.width} × ${size.height} 颗 · ${size.width * size.height} 个色块 · ${counts.size} 种 MARD 色号`;
    elements.result.append(summary, preview, renderStats(counts));
    elements.download.disabled = false;
    elements.resultStatus.textContent = '已识别，可检查色块与色号';
  }

  function download() {
    if (!state.finalCanvas) return;
    const link = document.createElement('a');
    link.download = `拼豆图纸_${dimensions().width}x${dimensions().height}.png`;
    link.href = state.finalCanvas.toDataURL('image/png');
    link.click();
  }

  elements.file.addEventListener('change', (event) => event.target.files[0] && loadImage(event.target.files[0]));
  elements.longEdge.addEventListener('input', () => { updateSize(); invalidatePreview(); document.querySelectorAll('.preset').forEach((button) => button.classList.toggle('is-selected', Number(button.dataset.size) === numberValue(elements.longEdge, 30))); });
  document.querySelectorAll('.preset').forEach((button) => button.addEventListener('click', () => { elements.longEdge.value = button.dataset.size; updateSize(); invalidatePreview(); document.querySelectorAll('.preset').forEach((item) => item.classList.toggle('is-selected', item === button)); }));
  elements.palette221.addEventListener('click', () => { state.paletteMode = '221'; renderPalette(); invalidatePreview(); });
  elements.palette291.addEventListener('click', () => { state.paletteMode = '291'; renderPalette(); invalidatePreview(); });
  elements.tolerance.addEventListener('input', () => { elements.toleranceValue.textContent = elements.tolerance.value; invalidatePreview(); });
  elements.startCrop.addEventListener('click', beginCrop);
  elements.applyCrop.addEventListener('click', cropImage);
  elements.cancelCrop.addEventListener('click', cancelCrop);
  elements.zoomIn.addEventListener('click', () => moveZoom(.1));
  elements.zoomOut.addEventListener('click', () => moveZoom(-.1));
  elements.cropBox.addEventListener('pointerdown', startPointer);
  document.addEventListener('pointermove', movePointer);
  document.addEventListener('pointerup', stopPointer);
  document.addEventListener('pointercancel', stopPointer);
  elements.analyze.addEventListener('click', analyze);
  elements.download.addEventListener('click', download);
  window.addEventListener('resize', () => { if (state.image) { const area = elements.container.getBoundingClientRect(); state.zoom = Math.min(area.width / state.image.width, area.height / state.image.height); resetCropToWholeImage(); renderImage(); renderCrop(); } });
  renderPalette();
})();
