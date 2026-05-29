(function () {
  'use strict';

  const D = window.ClaySizeData;
  const { CATEGORIES, CLAY_TYPES, firedToWet, wetToFired, getCategoryById, getPreset } = D;

  const ICONS = {
    plate: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="20" cy="20" rx="16" ry="16" fill="#eff6ff" stroke="#3182f6" stroke-width="1.5"/>
      <ellipse cx="20" cy="20" rx="12" ry="12" fill="#dbeafe" stroke="#3182f6" stroke-width="1"/>
      <ellipse cx="20" cy="20" rx="5" ry="5" fill="#bfdbfe" stroke="#3182f6" stroke-width="1"/>
    </svg>`,
    bowl: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M7 18 Q7 32 20 32 Q33 32 33 18 Z" fill="#eff6ff" stroke="#3182f6" stroke-width="1.5" stroke-linejoin="round"/>
      <ellipse cx="20" cy="18" rx="13" ry="3" fill="#dbeafe" stroke="#3182f6" stroke-width="1.5"/>
      <line x1="12" y1="33" x2="28" y2="33" stroke="#3182f6" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    vase: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M15 8 Q15 10 13 13 Q8 19 8 26 Q8 34 20 34 Q32 34 32 26 Q32 19 27 13 Q25 10 25 8 Z" fill="#eff6ff" stroke="#3182f6" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="15" y1="8" x2="25" y2="8" stroke="#3182f6" stroke-width="1.5" stroke-linecap="round"/>
      <ellipse cx="20" cy="8" rx="5" ry="1.5" fill="#dbeafe" stroke="#3182f6" stroke-width="1"/>
    </svg>`,
    cylinder: `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="10" y="13" width="20" height="20" rx="2" fill="#eff6ff" stroke="#3182f6" stroke-width="1.5"/>
      <ellipse cx="20" cy="13" rx="10" ry="3" fill="#dbeafe" stroke="#3182f6" stroke-width="1.5"/>
      <ellipse cx="20" cy="33" rx="10" ry="3" fill="#dbeafe" stroke="#3182f6" stroke-width="1"/>
    </svg>`,
  };

  const PRESET_ICONS = {
    plate:     ICONS.plate,
    ricebowl:  ICONS.bowl,
    vase:      ICONS.vase,
    cylinder:  ICONS.cylinder,
  };

  const state = {
    step: 1,
    categoryId: null,
    presetId: null,
    clayId: CLAY_TYPES[0].id,
    customShrinkage: 12,
    lastSource: 'wet',
    wetWidth: 19,
    wetHeight: 2.5,
    firedWidth: 16.7,
    firedHeight: 2.2,
  };

  const els = {
    steps: document.querySelectorAll('.step'),
    panels: document.querySelectorAll('.panel'),
    categoryGrid: document.getElementById('categoryGrid'),
    presetGrid: document.getElementById('presetGrid'),
    selectedCategoryName: document.getElementById('selectedCategoryName'),
    claySelect: document.getElementById('claySelect'),
    customShrinkRow: document.getElementById('customShrinkRow'),
    customShrink: document.getElementById('customShrink'),
    wetWidthInput: document.getElementById('setupWetWidthInput'),
    wetHeightInput: document.getElementById('setupWetHeightInput'),
    firedWidthInput: document.getElementById('setupFiredWidthInput'),
    firedHeightInput: document.getElementById('setupFiredHeightInput'),
    shrinkInfo: document.getElementById('shrinkInfo'),
  };

  function getShrinkageRate() {
    const clay = CLAY_TYPES.find((c) => c.id === state.clayId);
    if (clay?.custom) return state.customShrinkage;
    return clay?.shrinkageRate ?? 12;
  }

  const SIZE_LIMIT = 40;

  function clampSize(v) {
    return Math.max(0.5, Math.min(SIZE_LIMIT, Math.round(v * 10) / 10));
  }

  function parseInputValue(raw) {
    if (raw === '' || raw === '-') return null;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : null;
  }

  function formatSize(v) {
    return clampSize(v).toFixed(1);
  }

  function updateShrinkInfo() {
    const rate = getShrinkageRate();
    const clayName = CLAY_TYPES.find((c) => c.id === state.clayId)?.name ?? '';
    els.shrinkInfo.textContent = `수축률 ${rate}% · ${clayName}`;
  }

  function syncAllInputs() {
    els.wetWidthInput.value = formatSize(state.wetWidth);
    els.wetHeightInput.value = formatSize(state.wetHeight);
    els.firedWidthInput.value = formatSize(state.firedWidth);
    els.firedHeightInput.value = formatSize(state.firedHeight);
  }

  /** 입력 중: 편집 중인 칸은 그대로 두고 반대쪽만 갱신 */
  function onWetInput() {
    state.lastSource = 'wet';
    const rate = getShrinkageRate();
    const w = parseInputValue(els.wetWidthInput.value);
    const h = parseInputValue(els.wetHeightInput.value);

    if (w != null) {
      state.wetWidth = w;
      state.firedWidth = wetToFired(w, rate);
      els.firedWidthInput.value = formatSize(state.firedWidth);
    }
    if (h != null) {
      state.wetHeight = h;
      state.firedHeight = wetToFired(h, rate);
      els.firedHeightInput.value = formatSize(state.firedHeight);
    }
    updateShrinkInfo();
  }

  function onFiredInput() {
    state.lastSource = 'fired';
    const rate = getShrinkageRate();
    const w = parseInputValue(els.firedWidthInput.value);
    const h = parseInputValue(els.firedHeightInput.value);

    if (w != null) {
      state.firedWidth = w;
      state.wetWidth = firedToWet(w, rate);
      els.wetWidthInput.value = formatSize(state.wetWidth);
    }
    if (h != null) {
      state.firedHeight = h;
      state.wetHeight = firedToWet(h, rate);
      els.wetHeightInput.value = formatSize(state.wetHeight);
    }
    updateShrinkInfo();
  }

  function commitWetInputs() {
    state.lastSource = 'wet';
    const w = parseInputValue(els.wetWidthInput.value);
    const h = parseInputValue(els.wetHeightInput.value);
    if (w != null) state.wetWidth = clampSize(w);
    if (h != null) state.wetHeight = clampSize(h);
    const rate = getShrinkageRate();
    state.firedWidth = wetToFired(state.wetWidth, rate);
    state.firedHeight = wetToFired(state.wetHeight, rate);
    syncAllInputs();
    updateShrinkInfo();
  }

  function commitFiredInputs() {
    state.lastSource = 'fired';
    const w = parseInputValue(els.firedWidthInput.value);
    const h = parseInputValue(els.firedHeightInput.value);
    if (w != null) state.firedWidth = clampSize(w);
    if (h != null) state.firedHeight = clampSize(h);
    const rate = getShrinkageRate();
    state.wetWidth = firedToWet(state.firedWidth, rate);
    state.wetHeight = firedToWet(state.firedHeight, rate);
    syncAllInputs();
    updateShrinkInfo();
  }

  function recalcFromLastSource() {
    if (state.lastSource === 'fired') commitFiredInputs();
    else commitWetInputs();
  }

  function bindSizeInput(input, onInput, onCommit) {
    input.addEventListener('input', onInput);
    input.addEventListener('change', onCommit);
    input.addEventListener('blur', onCommit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
  }

  function goToStep(n) {
    state.step = n;
    els.steps.forEach((el) => {
      const s = +el.dataset.step;
      el.classList.toggle('active', s === n);
      el.classList.toggle('done', s < n);
    });
    els.panels.forEach((el) => {
      el.classList.toggle('active', el.id === `step${n}`);
    });
  }

  function renderCategories() {
    els.categoryGrid.innerHTML = CATEGORIES.map(
      (cat) => `
      <button type="button" class="card-btn" data-category="${cat.id}">
        <span class="card-btn__icon-wrap">${ICONS[cat.id] ?? ''}</span>
        <span class="card-btn__name">${cat.name}</span>
        <span class="card-btn__desc">${cat.description}</span>
      </button>`
    ).join('');

    els.categoryGrid.querySelectorAll('.card-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.categoryId = btn.dataset.category;
        renderPresets();
        goToStep(2);
      });
    });
  }

  function renderPresets() {
    const cat = getCategoryById(state.categoryId);
    els.selectedCategoryName.textContent = cat.name;

    els.presetGrid.innerHTML = cat.presets
      .map(
        (p) => `
      <button type="button" class="card-btn" data-preset="${p.id}">
        <span class="card-btn__icon-wrap">${PRESET_ICONS[p.id] ?? ''}</span>
        <span class="card-btn__name">${p.name}</span>
        <span class="card-btn__desc">기본 ${p.defaultWidth} × ${p.defaultHeight} cm (성형)</span>
      </button>`
      )
      .join('');

    els.presetGrid.querySelectorAll('.card-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.presetId = btn.dataset.preset;
        const preset = getPreset(state.categoryId, state.presetId);
        state.lastSource = 'wet';
        state.wetWidth = preset.defaultWidth;
        state.wetHeight = preset.defaultHeight;
        const rate = getShrinkageRate();
        state.firedWidth = wetToFired(state.wetWidth, rate);
        state.firedHeight = wetToFired(state.wetHeight, rate);
        syncAllInputs();
        updateShrinkInfo();
        goToStep(3);
      });
    });
  }

  function renderClaySelect() {
    els.claySelect.innerHTML = CLAY_TYPES.map(
      (c) => `<option value="${c.id}">${c.name}${c.custom ? '' : ` (수축 ${c.shrinkageRate}%)`}</option>`
    ).join('');
    els.claySelect.value = state.clayId;
  }

  function startStudio() {
    recalcFromLastSource();
    const rate = getShrinkageRate();
    const params = {
      preset: state.presetId,
      clayId: state.clayId,
      shrinkageRate: rate,
      firedWidth: state.firedWidth,
      firedHeight: state.firedHeight,
      wetWidth: state.wetWidth,
      wetHeight: state.wetHeight,
    };
    window.ClaySize.showStudio(params);
  }

  window.ClaySize = window.ClaySize || {};

  window.ClaySize.showStudio = function showStudio(session) {
    document.body.classList.remove('view-setup');
    document.body.classList.add('view-studio');
    document.title = 'ClaySize Studio';
    window.ClaySize.initStudio(session);
  };

  window.ClaySize.showSetup = function showSetup() {
    document.body.classList.remove('view-studio');
    document.body.classList.add('view-setup');
    document.title = 'ClaySize — 도자기 사이즈 계산';
  };

  els.claySelect.addEventListener('change', () => {
    state.clayId = els.claySelect.value;
    const clay = CLAY_TYPES.find((c) => c.id === state.clayId);
    els.customShrinkRow.hidden = !clay?.custom;
    recalcFromLastSource();
  });

  els.customShrink.addEventListener('input', () => {
    state.customShrinkage = +els.customShrink.value || 12;
    recalcFromLastSource();
  });

  bindSizeInput(els.wetWidthInput, onWetInput, commitWetInputs);
  bindSizeInput(els.wetHeightInput, onWetInput, commitWetInputs);
  bindSizeInput(els.firedWidthInput, onFiredInput, commitFiredInputs);
  bindSizeInput(els.firedHeightInput, onFiredInput, commitFiredInputs);

  document.getElementById('btnBackToCategory').addEventListener('click', () => goToStep(1));
  document.getElementById('btnBackToPreset').addEventListener('click', () => goToStep(2));
  document.getElementById('btnStartStudio').addEventListener('click', startStudio);

  document.body.classList.add('view-setup');
  renderCategories();
  renderClaySelect();
  commitWetInputs();
})();
