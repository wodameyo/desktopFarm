// game.js - 游戏逻辑层
// 包含 Crop / Field / Inventory / Economy / TimeSystem / SaveManager / Game
// 全部挂在 window.Farm 命名空间下，由 HTML <script> 按顺序加载
(function (Farm) {
  'use strict';
  const { crops, seasons, weather, regions, items, SEASON_ORDER, WEATHER_WEIGHTS } = Farm;

  // ============ Crop 单株作物 ============
  class Crop {
    constructor(cropId, opts = {}) {
      this.cropId = cropId;
      this.plantedAt = opts.plantedAt || Date.now();
      this.growthProgress = opts.growthProgress || 0;
      this.watered = opts.watered !== undefined ? opts.watered : false;
      this.lastTickAt = opts.lastTickAt || this.plantedAt;
      this.maturedAt = opts.maturedAt || null;
    }
    get definition() { return crops.get(this.cropId); }
    get stageIndex() {
      const def = this.definition;
      if (!def) return 0;
      for (let i = def.stages.length - 1; i >= 0; i--) {
        if (this.growthProgress >= def.stages[i]) return i;
      }
      return 0;
    }
    get isMature() { return this.growthProgress >= 1.0; }
    tick(dt, multiplier = 1.0) {
      if (this.isMature) { if (!this.maturedAt) this.maturedAt = Date.now(); return; }
      const def = this.definition;
      if (!def) return;
      const waterBoost = this.watered ? 1.5 : 1.0;
      const delta = (dt / def.growthTime) * multiplier * waterBoost;
      this.growthProgress = Math.min(1.0, this.growthProgress + delta);
      this.lastTickAt = Date.now();
      if (this.isMature && !this.maturedAt) this.maturedAt = Date.now();
    }
    offlineProgress(offlineSeconds, multiplier = 0.5) {
      if (this.isMature) return 0;
      const def = this.definition;
      if (!def) return 0;
      const delta = (offlineSeconds / def.growthTime) * multiplier;
      const before = this.growthProgress;
      this.growthProgress = Math.min(1.0, this.growthProgress + delta);
      if (this.isMature && !this.maturedAt) this.maturedAt = Date.now();
      return this.growthProgress - before;
    }
    water() { this.watered = true; }
    toJSON() {
      return { cropId: this.cropId, plantedAt: this.plantedAt,
        growthProgress: this.growthProgress, watered: this.watered,
        lastTickAt: this.lastTickAt, maturedAt: this.maturedAt };
    }
    static fromJSON(data) {
      return new Crop(data.cropId, {
        plantedAt: data.plantedAt, growthProgress: data.growthProgress,
        watered: data.watered, lastTickAt: data.lastTickAt, maturedAt: data.maturedAt
      });
    }
  }

  // ============ Field 田地区域 ============
  const SLOT_STATE = { EMPTY: 'empty', TILLED: 'tilled', PLANTED: 'planted', DECO: 'deco' };
  class Field {
    constructor(regionId, opts = {}) {
      this.regionId = regionId;
      const region = regions.get(regionId);
      if (!region) throw new Error(`未知地区: ${regionId}`);
      this.slots = [];
      this.width = opts.width || region.gridSize.w;
      this.height = opts.height || region.gridSize.h;
      this.expandedCount = opts.expandedCount || 0;
      const total = this.width * this.height;
      for (let i = 0; i < total; i++) this.slots.push(this._createEmpty(i));
    }
    get region() { return regions.get(this.regionId); }
    _createEmpty(index) {
      return { index, state: SLOT_STATE.EMPTY, crop: null, decoId: null,
        watered: false, lastCropId: null };
    }
    expandOne() {
      const slot = this._createEmpty(this.slots.length);
      this.slots.push(slot);
      this.width += 1;
      this.expandedCount += 1;
      return slot;
    }
    nextSlotPrice() {
      const r = this.region;
      return Math.floor(r.slotPrice.base * Math.pow(r.slotPrice.growth, this.expandedCount));
    }
    getSlot(i) { return this.slots[i]; }
    till(index) {
      const s = this.getSlot(index);
      if (!s || s.state !== SLOT_STATE.EMPTY) return false;
      s.state = SLOT_STATE.TILLED;
      return true;
    }
    plant(index, cropId) {
      const s = this.getSlot(index);
      if (!s) return false;
      if (s.state !== SLOT_STATE.TILLED && s.state !== SLOT_STATE.PLANTED) return false;
      s.state = SLOT_STATE.PLANTED;
      s.crop = new Crop(cropId);
      s.lastCropId = cropId;
      return true;
    }
    water(index) {
      const s = this.getSlot(index);
      if (!s) return false;
      s.watered = true;
      if (s.crop) s.crop.water();
      return true;
    }
    waterAll() {
      let n = 0;
      for (const s of this.slots) {
        if (s.state === SLOT_STATE.PLANTED && !s.watered) {
          s.watered = true;
          if (s.crop) s.crop.water();
          n++;
        }
      }
      return n;
    }
    harvest(index) {
      const s = this.getSlot(index);
      if (!s || s.state !== SLOT_STATE.PLANTED) return null;
      if (!s.crop || !s.crop.isMature) return null;
      const def = s.crop.definition;
      const r = { cropId: s.crop.cropId, sellPrice: def.sellPrice };
      s.crop = null;
      s.state = SLOT_STATE.TILLED;
      s.watered = false;
      return r;
    }
    harvestAll() {
      const results = [];
      for (const s of this.slots) {
        if (s.state === SLOT_STATE.PLANTED && s.crop && s.crop.isMature) {
          const r = this.harvest(s.index);
          if (r) results.push(r);
        }
      }
      return results;
    }
    reseedAll(inventory) {
      let n = 0;
      for (const s of this.slots) {
        if (s.state === SLOT_STATE.TILLED && s.lastCropId) {
          const seedId = `seed_${s.lastCropId}`;
          if (inventory && inventory.use(seedId)) {
            this.plant(s.index, s.lastCropId);
            n++;
          }
        }
      }
      return n;
    }
    tick(dt, multiplier = 1.0) {
      for (const s of this.slots) {
        if (s.state === SLOT_STATE.PLANTED && s.crop) s.crop.tick(dt, multiplier);
      }
    }
    offlineProgress(offlineSeconds, multiplier = 0.5) {
      let total = 0;
      for (const s of this.slots) {
        if (s.state === SLOT_STATE.PLANTED && s.crop) {
          total += s.crop.offlineProgress(offlineSeconds, multiplier);
        }
      }
      return total;
    }
    wiltForSeason(seasonId) {
      const region = this.region;
      if (region.ignoreSeason) return 0;
      const season = seasons.get(seasonId);
      const allow = season ? season.allowCrops : [];
      let n = 0;
      for (const s of this.slots) {
        if (s.state === SLOT_STATE.PLANTED && s.crop && !s.crop.isMature) {
          if (!allow.includes(s.crop.cropId)) {
            s.crop = null; s.state = SLOT_STATE.TILLED; s.watered = false; n++;
          }
        }
      }
      return n;
    }
    toJSON() {
      return {
        regionId: this.regionId, width: this.width, height: this.height,
        expandedCount: this.expandedCount,
        slots: this.slots.map(s => ({
          index: s.index, state: s.state,
          crop: s.crop ? s.crop.toJSON() : null,
          decoId: s.decoId, watered: s.watered, lastCropId: s.lastCropId
        }))
      };
    }
    static fromJSON(data) {
      const f = new Field(data.regionId, {
        width: data.width, height: data.height, expandedCount: data.expandedCount
      });
      f.slots = data.slots.map(s => ({
        index: s.index, state: s.state,
        crop: s.crop ? Crop.fromJSON(s.crop) : null,
        decoId: s.decoId, watered: s.watered, lastCropId: s.lastCropId
      }));
      return f;
    }
  }

  // ============ Inventory 库存 ============
  class Inventory {
    constructor(initial = {}) { this.counts = new Map(Object.entries(initial)); }
    get(id) { return this.counts.get(id) || 0; }
    add(id, n = 1) { this.counts.set(id, this.get(id) + n); }
    use(id, n = 1) {
      if (this.get(id) < n) return false;
      this.counts.set(id, this.get(id) - n);
      if (this.get(id) === 0) this.counts.delete(id);
      return true;
    }
    has(id, n = 1) { return this.get(id) >= n; }
    seeds() {
      const r = [];
      for (const [id, count] of this.counts) {
        if (count <= 0) continue;
        const it = items.get(id);
        if (it && it.category === 'seed') r.push({ itemId: id, count, item: it });
      }
      return r;
    }
    toJSON() { return Object.fromEntries(this.counts); }
    static fromJSON(data) { return new Inventory(data || {}); }
  }

  // ============ Economy 经济 ============
  class Economy {
    constructor(opts = {}) {
      this.gold = opts.gold !== undefined ? opts.gold : 50;
      this.totalEarned = opts.totalEarned || 0;
      this.ownedUpgrades = new Set(opts.ownedUpgrades || []);
    }
    canAfford(p) { return this.gold >= p; }
    spend(p) { if (!this.canAfford(p)) return false; this.gold -= p; return true; }
    earn(a) { this.gold += a; this.totalEarned += a; }
    isCropUnlocked(cropId) {
      const def = crops.get(cropId);
      if (!def) return false;
      const c = def.unlockBy;
      if (!c || c.type === 'default') return true;
      if (c.type === 'gold') return this.totalEarned >= c.threshold;
      return false;
    }
    isRegionUnlocked(regionId) {
      const r = regions.get(regionId);
      if (!r) return false;
      const c = r.unlockBy;
      if (!c || c.type === 'default') return true;
      if (c.type === 'gold') return this.totalEarned >= c.threshold;
      return false;
    }
    buySeed(seedId, qty = 1) {
      const it = items.get(seedId);
      if (!it || it.category !== 'seed') return { ok: false, message: '物品不是种子' };
      if (!this.isCropUnlocked(it.cropId)) return { ok: false, message: '该作物尚未解锁' };
      const total = it.price * qty;
      if (!this.canAfford(total)) return { ok: false, message: '金币不足' };
      this.spend(total);
      return { ok: true, qty, itemId: seedId, spent: total };
    }
    buyUpgrade(itemId) {
      const it = items.get(itemId);
      if (!it) return { ok: false, message: '未知物品' };
      if (this.ownedUpgrades.has(itemId)) return { ok: false, message: '已拥有' };
      if (!this.canAfford(it.price)) return { ok: false, message: '金币不足' };
      this.spend(it.price);
      this.ownedUpgrades.add(itemId);
      return { ok: true, itemId, spent: it.price };
    }
    ownsUpgrade(id) { return this.ownedUpgrades.has(id); }
    toJSON() {
      return { gold: this.gold, totalEarned: this.totalEarned,
        ownedUpgrades: Array.from(this.ownedUpgrades) };
    }
    static fromJSON(d) {
      return new Economy({ gold: d.gold, totalEarned: d.totalEarned,
        ownedUpgrades: d.ownedUpgrades });
    }
  }

  // ============ TimeSystem 时间天气 ============
  const DAY_DURATION_SEC = 300;
  class TimeSystem {
    constructor(opts = {}) {
      this.totalSeconds = opts.totalSeconds || 0;
      this.dayDurationSec = opts.dayDurationSec || DAY_DURATION_SEC;
      this.lastTickAt = opts.lastTickAt || Date.now();
      this._weatherId = opts.weatherId || 'sunny';
      this._listeners = { dayChange: [], seasonChange: [], weatherChange: [] };
    }
    on(e, fn) { if (this._listeners[e]) this._listeners[e].push(fn); }
    _emit(e, p) { (this._listeners[e] || []).forEach(fn => fn(p)); }
    get timeOfDay() {
      const s = this.totalSeconds % this.dayDurationSec;
      return s / this.dayDurationSec;
    }
    get dayNumber() { return Math.floor(this.totalSeconds / this.dayDurationSec) + 1; }
    get seasonId() {
      let day = this.dayNumber - 1;
      for (const sid of SEASON_ORDER) {
        const s = seasons.get(sid);
        if (day < s.durationDays) return sid;
        day -= s.durationDays;
      }
      return SEASON_ORDER[0];
    }
    get season() { return seasons.get(this.seasonId); }
    get dayOfSeason() {
      let day = this.dayNumber - 1;
      for (const sid of SEASON_ORDER) {
        const s = seasons.get(sid);
        if (day < s.durationDays) return day + 1;
        day -= s.durationDays;
      }
      return 1;
    }
    get year() { return Math.floor((this.dayNumber - 1) / 60) + 1; }
    get isNight() { const t = this.timeOfDay; return t < 0.25 || t > 0.75; }
    get brightness() {
      const t = this.timeOfDay;
      return 0.4 + 0.6 * Math.sin(t * Math.PI);
    }
    get weatherId() { return this._weatherId; }
    get weather() { return weather.get(this._weatherId); }
    setWeather(id) {
      if (!weather.has(id)) return;
      const old = this._weatherId;
      this._weatherId = id;
      if (old !== id) this._emit('weatherChange', { from: old, to: id });
    }
    rollWeatherForDay() {
      const w = WEATHER_WEIGHTS[this.seasonId];
      if (!w) return this.setWeather('sunny');
      const r = Math.random();
      let acc = 0;
      for (const [k, p] of Object.entries(w)) {
        acc += p;
        if (r < acc) { this.setWeather(k); return; }
      }
      this.setWeather('sunny');
    }
    tick(dt) {
      const beforeDay = this.dayNumber;
      const beforeSeason = this.seasonId;
      this.totalSeconds += dt;
      this.lastTickAt = Date.now();
      if (this.dayNumber !== beforeDay) {
        this._emit('dayChange', { day: this.dayNumber, oldDay: beforeDay });
        this.rollWeatherForDay();
        if (this.seasonId !== beforeSeason) {
          this._emit('seasonChange', { from: beforeSeason, to: this.seasonId });
        }
      }
    }
    applyOffline() {
      const now = Date.now();
      const sec = Math.floor((now - this.lastTickAt) / 1000);
      if (sec <= 0) return 0;
      this.totalSeconds += sec;
      this.lastTickAt = now;
      return sec;
    }
    toJSON() {
      return { totalSeconds: this.totalSeconds, dayDurationSec: this.dayDurationSec,
        lastTickAt: this.lastTickAt, weatherId: this._weatherId };
    }
    static fromJSON(d) {
      return new TimeSystem({ totalSeconds: d.totalSeconds,
        dayDurationSec: d.dayDurationSec, lastTickAt: d.lastTickAt,
        weatherId: d.weatherId });
    }
  }

  // ============ SaveManager 存档 ============
  const SAVE_FILENAME = 'farm_save.json';
  const AUTOSAVE_INTERVAL_MS = 30 * 1000;
  class SaveManager {
    constructor() {
      this.useElectron = !!(window.farmAPI && window.farmAPI.save);
    }
    async save(state) {
      const payload = JSON.stringify({ version: 1, savedAt: Date.now(), state });
      if (this.useElectron) return await window.farmAPI.save.write(SAVE_FILENAME, payload);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAVE_FILENAME, payload);
        return true;
      }
      return false;
    }
    async load() {
      let raw = null;
      if (this.useElectron) raw = await window.farmAPI.save.read(SAVE_FILENAME);
      else if (typeof localStorage !== 'undefined') raw = localStorage.getItem(SAVE_FILENAME);
      if (!raw) return null;
      try { return (JSON.parse(raw)).state || null; }
      catch (e) { console.error('存档解析失败:', e); return null; }
    }
    startAutoSave(getStateFn) {
      setInterval(async () => {
        try { await this.save(getStateFn()); }
        catch (e) { console.error('自动保存失败:', e); }
      }, AUTOSAVE_INTERVAL_MS);
    }
  }

  // ============ Game 主控制器 ============
  const TICK_INTERVAL_MS = 1000;
  class Game {
    constructor() {
      this.time = new TimeSystem();
      this.economy = new Economy();
      this.inventory = new Inventory({ seed_wheat: 5, seed_carrot: 3 });
      this.fields = new Map();
      this.fields.set('default', new Field('default'));
      this.activeRegionId = 'default';
      this.selectedSeedId = null;
      this.saveManager = new SaveManager();
      this._tickTimer = null;
      this._listeners = { tick: [], goldChange: [], stateChange: [], toast: [] };
      this.stats = { harvested: 0, earned: 0, planted: 0 };
      this._bindSeasonListeners();
    }
    on(e, fn) { if (this._listeners[e]) this._listeners[e].push(fn); }
    _emit(e, p) { (this._listeners[e] || []).forEach(fn => fn(p)); }
    toast(msg) { this._emit('toast', { msg, at: Date.now() }); }

    _bindSeasonListeners() {
      this.time.on('seasonChange', ({ to }) => {
        for (const f of this.fields.values()) {
          const n = f.wiltForSeason(to);
          if (n > 0) this.toast(`换季枯萎 ${n} 株未熟作物`);
        }
        this._emit('stateChange', { reason: 'seasonChange' });
      });
      this.time.on('dayChange', () => this._emit('stateChange', { reason: 'dayChange' }));
      this.time.on('weatherChange', ({ to }) => {
        if (to === 'rainy') {
          for (const f of this.fields.values()) f.waterAll();
          this.toast('下雨了，所有田地被自动浇灌');
        }
        this._emit('stateChange', { reason: 'weatherChange' });
      });
    }

    async init() {
      const saved = await this.saveManager.load();
      if (saved) this.loadState(saved);
      const offline = this.time.applyOffline();
      if (offline > 60) {
        for (const f of this.fields.values()) f.offlineProgress(offline, 0.5);
        this.toast(`离线 ${Math.floor(offline / 60)} 分钟，作物按 50% 折算进度`);
      }
      this.startLoop();
      this.saveManager.startAutoSave(() => this.serializeState());
      return this;
    }

    startLoop() {
      if (this._tickTimer) return;
      this._tickTimer = setInterval(() => this._tick(), TICK_INTERVAL_MS);
    }
    stopLoop() { if (this._tickTimer) { clearInterval(this._tickTimer); this._tickTimer = null; } }

    _tick() {
      const dt = TICK_INTERVAL_MS / 1000;
      this.time.tick(dt);
      const w = this.time.weather;
      const mult = w ? w.growthMultiplier : 1.0;
      for (const f of this.fields.values()) f.tick(dt, mult);
      this._emit('tick', { dt });
      this._emit('stateChange', { reason: 'tick' });
    }

    get activeField() { return this.fields.get(this.activeRegionId); }
    switchRegion(regionId) {
      if (!regions.has(regionId)) return false;
      if (!this.economy.isRegionUnlocked(regionId)) return false;
      if (!this.fields.has(regionId)) this.fields.set(regionId, new Field(regionId));
      this.activeRegionId = regionId;
      this._emit('stateChange', { reason: 'regionSwitch' });
      return true;
    }

    tillSlot(i) { const ok = this.activeField.till(i); if (ok) this._emit('stateChange', { reason: 'till' }); return ok; }
    selectSeed(id) { if (!this.inventory.has(id)) return false; this.selectedSeedId = id; return true; }

    plantSlot(i) {
      if (!this.selectedSeedId) return { ok: false, message: '未选择种子' };
      const it = items.get(this.selectedSeedId);
      if (!it) return { ok: false, message: '物品不存在' };
      const f = this.activeField;
      if (!f.region.ignoreSeason) {
        const s = this.time.season;
        if (!s.allowCrops.includes(it.cropId)) {
          return { ok: false, message: `${it.name}不能在${s.name}季种植` };
        }
      }
      if (!this.inventory.use(this.selectedSeedId)) return { ok: false, message: '种子不足' };
      const ok = f.plant(i, it.cropId);
      if (ok) {
        this.stats.planted += 1;
        this._emit('stateChange', { reason: 'plant' });
        return { ok: true };
      }
      this.inventory.add(this.selectedSeedId, 1);
      return { ok: false, message: '该格不可种植' };
    }

    waterSlot(i) { const ok = this.activeField.water(i); if (ok) this._emit('stateChange', { reason: 'water' }); return ok; }
    waterAll() { const n = this.activeField.waterAll(); if (n > 0) this._emit('stateChange', { reason: 'waterAll' }); return n; }

    harvestSlot(i) {
      const r = this.activeField.harvest(i);
      if (!r) return { ok: false, message: '无可收获' };
      this.economy.earn(r.sellPrice);
      this.stats.harvested += 1;
      this.stats.earned += r.sellPrice;
      this._emit('goldChange', { gold: this.economy.gold });
      this._emit('stateChange', { reason: 'harvest' });
      return { ok: true, cropId: r.cropId, earned: r.sellPrice };
    }

    harvestAll() {
      const rs = this.activeField.harvestAll();
      let total = 0;
      for (const r of rs) {
        this.economy.earn(r.sellPrice);
        this.stats.harvested += 1;
        this.stats.earned += r.sellPrice;
        total += r.sellPrice;
      }
      if (rs.length > 0) {
        this._emit('goldChange', { gold: this.economy.gold });
        this._emit('stateChange', { reason: 'harvestAll' });
        this.toast(`一键收获 ${rs.length} 株，+${total} 金币`);
      }
      return { count: rs.length, earned: total };
    }

    reseedAll() {
      const n = this.activeField.reseedAll(this.inventory);
      if (n > 0) { this._emit('stateChange', { reason: 'reseed' }); this.toast(`补种 ${n} 株`); }
      else this.toast('没有可补种的种子或空地');
      return n;
    }

    buyExpansion() {
      const f = this.activeField;
      const price = f.nextSlotPrice();
      if (!this.economy.canAfford(price)) return { ok: false, message: '金币不足' };
      this.economy.spend(price);
      f.expandOne();
      this._emit('goldChange', { gold: this.economy.gold });
      this._emit('stateChange', { reason: 'expand' });
      return { ok: true, price };
    }

    buySeed(id, qty = 1) {
      const r = this.economy.buySeed(id, qty);
      if (r.ok) {
        this.inventory.add(id, qty);
        this._emit('goldChange', { gold: this.economy.gold });
        this._emit('stateChange', { reason: 'buySeed' });
      }
      return r;
    }

    buyUpgrade(id) {
      const r = this.economy.buyUpgrade(id);
      if (r.ok) {
        this._emit('goldChange', { gold: this.economy.gold });
        this._emit('stateChange', { reason: 'buyUpgrade' });
      }
      return r;
    }

    serializeState() {
      return {
        time: this.time.toJSON(),
        economy: this.economy.toJSON(),
        inventory: this.inventory.toJSON(),
        fields: Array.from(this.fields.entries()).map(([id, f]) => [id, f.toJSON()]),
        activeRegionId: this.activeRegionId,
        selectedSeedId: this.selectedSeedId,
        stats: this.stats
      };
    }

    loadState(state) {
      if (!state) return;
      try {
        this.time = TimeSystem.fromJSON(state.time);
        this.economy = Economy.fromJSON(state.economy);
        this.inventory = Inventory.fromJSON(state.inventory);
        this.fields = new Map();
        if (state.fields) for (const [id, fd] of state.fields) this.fields.set(id, Field.fromJSON(fd));
        this.activeRegionId = state.activeRegionId || 'default';
        this.selectedSeedId = state.selectedSeedId || null;
        this.stats = state.stats || this.stats;
        this._bindSeasonListeners();
      } catch (e) { console.error('加载存档失败:', e); }
    }

    async manualSave() { return await this.saveManager.save(this.serializeState()); }
  }

  // 导出
  Farm.Crop = Crop;
  Farm.Field = Field;
  Farm.SLOT_STATE = SLOT_STATE;
  Farm.Inventory = Inventory;
  Farm.Economy = Economy;
  Farm.TimeSystem = TimeSystem;
  Farm.SaveManager = SaveManager;
  Farm.Game = Game;
  Farm.TICK_INTERVAL_MS = TICK_INTERVAL_MS;
  Farm.DAY_DURATION_SEC = DAY_DURATION_SEC;
})(window.Farm = window.Farm || {});
