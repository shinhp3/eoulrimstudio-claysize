/**
 * 흙 종류 및 수축률 데이터
 * 실제 데이터는 추후 이 파일만 교체하면 됩니다.
 */
(function (global) {
  'use strict';

  const CLAY_TYPES = [
    { id: 'white', name: '백토', shrinkageRate: 12 },
    { id: 'red', name: '적토', shrinkageRate: 10 },
    { id: 'porcelain', name: '자기토', shrinkageRate: 14 },
    { id: 'stoneware', name: '석기토', shrinkageRate: 11 },
    { id: 'custom', name: '직접 입력', shrinkageRate: 12, custom: true },
  ];

  const CATEGORIES = [
    {
      id: 'plate',
      name: '접시',
      description: '평평한 접시·쟁반 형태',
      presets: [{ id: 'plate', name: '접시', defaultWidth: 19, defaultHeight: 2.5 }],
    },
    {
      id: 'bowl',
      name: '그릇',
      description: '밥그릇·면기 등 그릇 형태',
      presets: [{ id: 'ricebowl', name: '밥그릇', defaultWidth: 11, defaultHeight: 6 }],
    },
    {
      id: 'vase',
      name: '화병',
      description: '화병·병 형태',
      presets: [{ id: 'vase', name: '화병', defaultWidth: 7.5, defaultHeight: 13 }],
    },
    {
      id: 'cylinder',
      name: '기본',
      description: '원통형 기본 형태',
      presets: [{ id: 'cylinder', name: '원통', defaultWidth: 10, defaultHeight: 10 }],
    },
  ];

  function firedToWet(firedCm, shrinkageRate) {
    const factor = 1 - shrinkageRate / 100;
    if (factor <= 0) return firedCm;
    return Math.round((firedCm / factor) * 10) / 10;
  }

  function wetToFired(wetCm, shrinkageRate) {
    const factor = 1 - shrinkageRate / 100;
    return Math.round(wetCm * factor * 10) / 10;
  }

  function getClayById(id) {
    return CLAY_TYPES.find((c) => c.id === id) ?? CLAY_TYPES[0];
  }

  function getCategoryById(id) {
    return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
  }

  function getPreset(categoryId, presetId) {
    const cat = getCategoryById(categoryId);
    return cat.presets.find((p) => p.id === presetId) ?? cat.presets[0];
  }

  global.ClaySizeData = {
    CLAY_TYPES,
    CATEGORIES,
    firedToWet,
    wetToFired,
    getClayById,
    getCategoryById,
    getPreset,
  };
})(window);
