// data.js - 游戏数据层（全部数据驱动，便于未来扩展）
// 挂载到 window.Farm 命名空间，供其它脚本使用
// 设计：所有可扩展内容通过 Registry 管理；新增作物/地区/物品只需 register 一条
(function (Farm) {
  'use strict';

  // ============ Registry 通用注册表 ============
  // 支持注册、查询、按字段过滤；图鉴/解锁判定均基于此
  class Registry {
    constructor(name) {
      this.name = name;
      this.items = new Map();
      this.order = [];
    }
    register(id, def) {
      if (this.items.has(id)) throw new Error(`[${this.name}] 重复 id: ${id}`);
      this.items.set(id, def);
      this.order.push(id);
      return def;
    }
    registerAll(defs) {
      defs.forEach(([id, def]) => this.register(id, def));
      return this;
    }
    get(id) { return this.items.get(id); }
    has(id) { return this.items.has(id); }
    all() { return this.order.map(id => this.items.get(id)); }
    filter(p) { return this.all().filter(p); }
    findBy(field, value) { return this.filter(it => it[field] === value); }
  }

  // ============ 作物定义 ============
  // stages 为各生长阶段进度比例（0~1），渲染器按累积进度匹配阶段
  // color 为像素画主色（暂纯色块占位，未来可替换为 sprite sheet）
  // unlockBy 控制图鉴渐进解锁
  const crops = new Registry('crops');
  crops.registerAll([
    ['wheat', {
      id: 'wheat', name: '小麦', category: 'grain',
      growthTime: 30, seedPrice: 5, sellPrice: 12,
      seasons: ['summer', 'autumn'],
      color: { seed: '#8b6f3a', sprout: '#9ec85a', growing: '#c8b560', mature: '#e6c84c' },
      stages: [0.15, 0.4, 0.85, 1.0],
      description: '最基础的谷物，生长快、利润低，适合练手。',
      unlockBy: { type: 'default' }
    }],
    ['carrot', {
      id: 'carrot', name: '胡萝卜', category: 'root',
      growthTime: 45, seedPrice: 8, sellPrice: 22,
      seasons: ['spring', 'summer'],
      color: { seed: '#7a5230', sprout: '#7ec850', growing: '#5fae3a', mature: '#e87b30' },
      stages: [0.12, 0.35, 0.8, 1.0],
      description: '地下根茎作物，春夏季可种。',
      unlockBy: { type: 'default' }
    }],
    ['tomato', {
      id: 'tomato', name: '番茄', category: 'fruit',
      growthTime: 60, seedPrice: 12, sellPrice: 38,
      seasons: ['summer'],
      color: { seed: '#8a6b3a', sprout: '#6cb83a', growing: '#3a8a2c', mature: '#d63a2c' },
      stages: [0.1, 0.3, 0.75, 1.0],
      description: '夏日红果，利润可观但仅限夏季。',
      unlockBy: { type: 'default' }
    }],
    ['strawberry', {
      id: 'strawberry', name: '草莓', category: 'fruit',
      growthTime: 75, seedPrice: 20, sellPrice: 60,
      seasons: ['spring'],
      color: { seed: '#7a5230', sprout: '#5fae3a', growing: '#3a8a2c', mature: '#e63a5a' },
      stages: [0.1, 0.3, 0.75, 1.0],
      description: '春季限定，色泽诱人，单价较高。',
      unlockBy: { type: 'gold', threshold: 200 }
    }],
    ['pumpkin', {
      id: 'pumpkin', name: '南瓜', category: 'gourd',
      growthTime: 120, seedPrice: 25, sellPrice: 95,
      seasons: ['autumn'],
      color: { seed: '#8a6b3a', sprout: '#6cb83a', growing: '#c89030', mature: '#e67a1c' },
      stages: [0.08, 0.25, 0.7, 1.0],
      description: '秋日巨型果，生长慢但单株暴利。',
      unlockBy: { type: 'gold', threshold: 500 }
    }],
    ['corn', {
      id: 'corn', name: '玉米', category: 'grain',
      growthTime: 90, seedPrice: 15, sellPrice: 50,
      seasons: ['summer'],
      color: { seed: '#8b6f3a', sprout: '#7ec850', growing: '#9ec85a', mature: '#e6c84c' },
      stages: [0.1, 0.3, 0.75, 1.0],
      description: '高大谷物，夏季热门选择。',
      unlockBy: { type: 'gold', threshold: 300 }
    }]
  ]);
  const STAGE_NAMES = ['seed', 'sprout', 'growing', 'mature'];

  // ============ 季节定义 ============
  const seasons = new Registry('seasons');
  seasons.registerAll([
    ['spring', { id: 'spring', name: '春', order: 0, durationDays: 15,
      grassColor: '#7ec850', leafColor: '#5fae3a', allowCrops: ['carrot', 'strawberry'] }],
    ['summer', { id: 'summer', name: '夏', order: 1, durationDays: 15,
      grassColor: '#9ec85a', leafColor: '#3a8a2c',
      allowCrops: ['wheat', 'carrot', 'tomato', 'corn'] }],
    ['autumn', { id: 'autumn', name: '秋', order: 2, durationDays: 15,
      grassColor: '#c89030', leafColor: '#b86a1c', allowCrops: ['wheat', 'pumpkin'] }],
    ['winter', { id: 'winter', name: '冬', order: 3, durationDays: 15,
      grassColor: '#d8e0e8', leafColor: '#a8b0b8', allowCrops: [] }]
  ]);
  const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];

  // ============ 天气定义 ============
  const weather = new Registry('weather');
  weather.registerAll([
    ['sunny', { id: 'sunny', name: '晴', growthMultiplier: 1.0, autoWater: false, particle: null }],
    ['rainy', { id: 'rainy', name: '雨', growthMultiplier: 1.0, autoWater: true, particle: 'rain' }],
    ['snowy', { id: 'snowy', name: '雪', growthMultiplier: 0.5, autoWater: true, particle: 'snow' }]
  ]);
  const WEATHER_WEIGHTS = {
    spring: { sunny: 0.6, rainy: 0.4, snowy: 0.0 },
    summer: { sunny: 0.8, rainy: 0.2, snowy: 0.0 },
    autumn: { sunny: 0.7, rainy: 0.3, snowy: 0.0 },
    winter: { sunny: 0.4, rainy: 0.0, snowy: 0.6 }
  };

  // ============ 地区定义 ============
  // 主田地默认解锁；池塘/果园/温室为中后期扩张目标
  // ignoreSeason=true 的温室可全年种植
  const regions = new Registry('regions');
  regions.registerAll([
    ['default', { id: 'default', name: '主田地',
      gridSize: { w: 4, h: 4 }, soilColor: '#6b4a2c', grassColor: '#5a7a3a',
      description: '农场最基础的耕作区。',
      unlockBy: { type: 'default' },
      slotPrice: { base: 50, growth: 1.15 } }],
    ['pondside', { id: 'pondside', name: '池塘边',
      gridSize: { w: 3, h: 3 }, soilColor: '#5a3c1c', grassColor: '#3a6a8a',
      description: '水源充足，适合水生作物。',
      unlockBy: { type: 'gold', threshold: 1000 },
      slotPrice: { base: 200, growth: 1.2 } }],
    ['orchard', { id: 'orchard', name: '果园',
      gridSize: { w: 3, h: 3 }, soilColor: '#6b4a2c', grassColor: '#4a6a2a',
      description: '果树的乐土，可种植多年生作物。',
      unlockBy: { type: 'gold', threshold: 3000 },
      slotPrice: { base: 500, growth: 1.25 } }],
    ['greenhouse', { id: 'greenhouse', name: '温室',
      gridSize: { w: 3, h: 3 }, soilColor: '#7a5a3c', grassColor: '#8aa0a0',
      description: '不受季节限制，全年可种植任意作物。',
      unlockBy: { type: 'gold', threshold: 8000 },
      slotPrice: { base: 1000, growth: 1.3 }, ignoreSeason: true }]
  ]);

  // ============ 商店物品定义 ============
  // 三大类：seed/expansion/decoration/robot
  const items = new Registry('items');
  items.registerAll([
    ['seed_wheat', { id: 'seed_wheat', name: '小麦种子', category: 'seed', cropId: 'wheat',
      price: 5, description: '夏季/秋季可种，30 秒成熟。' }],
    ['seed_carrot', { id: 'seed_carrot', name: '胡萝卜种子', category: 'seed', cropId: 'carrot',
      price: 8, description: '春季/夏季可种，45 秒成熟。' }],
    ['seed_tomato', { id: 'seed_tomato', name: '番茄种子', category: 'seed', cropId: 'tomato',
      price: 12, description: '夏季限定，60 秒成熟。' }],
    ['seed_strawberry', { id: 'seed_strawberry', name: '草莓种子', category: 'seed', cropId: 'strawberry',
      price: 20, description: '春季限定，需累计赚 200 金解锁。' }],
    ['seed_pumpkin', { id: 'seed_pumpkin', name: '南瓜种子', category: 'seed', cropId: 'pumpkin',
      price: 25, description: '秋季限定，需累计赚 500 金解锁。' }],
    ['seed_corn', { id: 'seed_corn', name: '玉米种子', category: 'seed', cropId: 'corn',
      price: 15, description: '夏季限定，需累计赚 300 金解锁。' }],
    ['expand_slot', { id: 'expand_slot', name: '扩张一格田地', category: 'expansion',
      price: 50, description: '购买相邻一格空地变为可耕地。' }],
    ['deco_scarecrow', { id: 'deco_scarecrow', name: '稻草人', category: 'decoration',
      price: 100, effect: { type: 'pest_resist', radius: 2 }, description: '范围内防虫害（P2 生效）。' }],
    ['deco_flowerbed', { id: 'deco_flowerbed', name: '花坛', category: 'decoration',
      price: 80, effect: { type: 'growth_boost', radius: 1, multiplier: 1.1 },
      description: '范围内作物生长 +10%（P2 生效）。' }],
    ['deco_lamp', { id: 'deco_lamp', name: '路灯', category: 'decoration',
      price: 50, effect: { type: 'light' }, description: '夜晚发光，纯视觉。' }],
    ['robot_water', { id: 'robot_water', name: '浇水机器人', category: 'robot',
      price: 800, effect: { type: 'auto_water' }, description: '自动给所有作物浇水（P2 解锁）。' }],
    ['robot_seed', { id: 'robot_seed', name: '播种机器人', category: 'robot',
      price: 2000, effect: { type: 'auto_seed' }, description: '空地自动补种上次作物（P2 解锁）。' }],
    ['robot_harvest', { id: 'robot_harvest', name: '收获机器人', category: 'robot',
      price: 5000, effect: { type: 'auto_harvest' }, description: '自动收获并出售（P2 解锁）。' }]
  ]);

  // ============ 图鉴预留接口 ============
  // 图鉴系统通过遍历 crops.all() 自动生成条目；解锁状态由 Economy.isCropUnlocked 判定
  // 未来可扩展：additions Registry 用于注册资料片新增内容
  Farm.Registry = Registry;
  Farm.crops = crops;
  Farm.seasons = seasons;
  Farm.weather = weather;
  Farm.regions = regions;
  Farm.items = items;
  Farm.STAGE_NAMES = STAGE_NAMES;
  Farm.SEASON_ORDER = SEASON_ORDER;
  Farm.WEATHER_WEIGHTS = WEATHER_WEIGHTS;
})(window.Farm = window.Farm || {});
