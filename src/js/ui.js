// ui.js - UI 控制器
// 负责：顶部信息栏、商店面板、库存面板、设置面板、Toast 提示
// 通过监听 Game 的 stateChange/goldChange 事件刷新 DOM
(function (Farm) {
  'use strict';
  const { crops, items, regions, seasons } = Farm;

  class UI {
    constructor(game) {
      this.game = game;
      this.elements = this._collectElements();
      this._bindGame();
      this._bindUI();
      this._buildShop();
      this._buildRegionTabs();
      this.refresh();
    }

    _collectElements() {
      const $ = (id) => document.getElementById(id);
      return {
        gold: $('top-gold'),
        date: $('top-date'),
        season: $('top-season'),
        weather: $('top-weather'),
        clock: $('top-clock'),
        regionTabs: $('region-tabs'),
        shopList: $('shop-list'),
        inventoryList: $('inventory-list'),
        selectedSeed: $('selected-seed'),
        log: $('toast-container'),
        // 设置
        alwaysOnTop: $('set-always-on-top'),
        scaleSelect: $('set-scale'),
        manualSave: $('set-manual-save'),
        // 面板开关
        btnShop: $('btn-shop'),
        btnInventory: $('btn-inventory'),
        btnCodex: $('btn-codex'),
        btnSettings: $('btn-settings'),
        btnHarvestAll: $('btn-harvest-all'),
        btnWaterAll: $('btn-water-all'),
        btnReseed: $('btn-reseed'),
        btnExpand: $('btn-expand'),
        panelShop: $('panel-shop'),
        panelInventory: $('panel-inventory'),
        panelCodex: $('panel-codex'),
        panelSettings: $('panel-settings'),
        codexList: $('codex-list'),
        canvas: $('game-canvas'),
        slotTip: $('slot-tip')
      };
    }

    _bindGame() {
      this.game.on('stateChange', () => this.refresh());
      this.game.on('goldChange', () => this.refresh());
      this.game.on('toast', ({ msg }) => this.toast(msg));
    }

    _bindUI() {
      const e = this.elements;
      // 面板切换
      const togglePanel = (panel, others) => () => {
        others.forEach(p => p.classList.remove('open'));
        panel.classList.toggle('open');
      };
      e.btnShop.addEventListener('click', togglePanel(e.panelShop, [e.panelInventory, e.panelCodex, e.panelSettings]));
      e.btnInventory.addEventListener('click', togglePanel(e.panelInventory, [e.panelShop, e.panelCodex, e.panelSettings]));
      e.btnCodex.addEventListener('click', () => {
        // 打开图鉴时刷新（解锁状态可能变化）
        this._buildCodex();
        togglePanel(e.panelCodex, [e.panelShop, e.panelInventory, e.panelSettings])();
      });
      e.btnSettings.addEventListener('click', togglePanel(e.panelSettings, [e.panelShop, e.panelInventory, e.panelCodex]));

      // 面板关闭按钮
      document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = document.getElementById(btn.dataset.close);
          if (target) target.classList.remove('open');
        });
      });

      // 一键操作
      e.btnHarvestAll.addEventListener('click', () => {
        const r = this.game.harvestAll();
        if (r.count === 0) this.toast('没有可收获的成熟作物');
      });
      e.btnWaterAll.addEventListener('click', () => {
        const n = this.game.waterAll();
        this.toast(n > 0 ? `浇水 ${n} 格` : '所有田地已浇水');
      });
      e.btnReseed.addEventListener('click', () => this.game.reseedAll());
      e.btnExpand.addEventListener('click', () => {
        const r = this.game.buyExpansion();
        if (!r.ok) this.toast(r.message || '金币不足');
        else this.toast(`扩张一格，花费 ${r.price} 金币`);
      });

      // 设置：窗口置顶
      if (window.farmAPI && window.farmAPI.window) {
        window.farmAPI.window.getAlwaysOnTop().then(v => { e.alwaysOnTop.checked = v; });
        e.alwaysOnTop.addEventListener('change', () => {
          window.farmAPI.window.setAlwaysOnTop(e.alwaysOnTop.checked);
        });
      }
      // 设置：手动保存
      e.manualSave.addEventListener('click', async () => {
        const ok = await this.game.manualSave();
        this.toast(ok ? '已手动保存' : '保存失败');
      });
      // 设置：画面缩放
      e.scaleSelect.addEventListener('change', () => {
        const scale = parseInt(e.scaleSelect.value, 10);
        this._applyScale(scale);
      });
    }

    _applyScale(scale) {
      const canvas = this.elements.canvas;
      const baseW = 640, baseH = 480;
      canvas.style.width = (baseW * scale) + 'px';
      canvas.style.height = (baseH * scale) + 'px';
      canvas.width = baseW;
      canvas.height = baseH;
    }

    _buildShop() {
      const list = this.elements.shopList;
      list.innerHTML = '';
      // 种子类
      const seeds = items.filter(it => it.category === 'seed');
      const seedGroup = this._makeGroup('种子', seeds, (it) => {
        const def = crops.get(it.cropId);
        const unlocked = this.game.economy.isCropUnlocked(it.cropId);
        const card = document.createElement('div');
        card.className = 'shop-card' + (unlocked ? '' : ' locked');
        card.innerHTML = `
          <div class="shop-name">${it.name}</div>
          <div class="shop-desc">${it.description}</div>
          <div class="shop-meta">
            <span>售价 ${it.price}</span>
            <span>卖出 ${def ? def.sellPrice : '?'}</span>
            <span>利润 ${def ? (def.sellPrice - it.price) : '?'}</span>
          </div>
          <button class="shop-buy" ${unlocked ? '' : 'disabled'}>${unlocked ? '买1' : '未解锁'}</button>
        `;
        card.querySelector('.shop-buy').addEventListener('click', () => {
          const r = this.game.buySeed(it.id, 1);
          if (!r.ok) this.toast(r.message);
          else this.toast(`购入 ${it.name} x1`);
        });
        return card;
      });
      list.appendChild(seedGroup);
      // 装饰类
      const decos = items.filter(it => it.category === 'decoration');
      list.appendChild(this._makeGroup('装饰物', decos, (it) => {
        const owned = this.game.economy.ownsUpgrade(it.id);
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `
          <div class="shop-name">${it.name}</div>
          <div class="shop-desc">${it.description}</div>
          <div class="shop-meta"><span>售价 ${it.price}</span></div>
          <button class="shop-buy" ${owned ? 'disabled' : ''}>${owned ? '已拥有' : '买'}</button>
        `;
        card.querySelector('.shop-buy').addEventListener('click', () => {
          const r = this.game.buyUpgrade(it.id);
          if (!r.ok) this.toast(r.message);
          else this.toast(`购入 ${it.name}`);
        });
        return card;
      }));
      // 机器人类
      const robots = items.filter(it => it.category === 'robot');
      list.appendChild(this._makeGroup('机器人（P2 预留）', robots, (it) => {
        const owned = this.game.economy.ownsUpgrade(it.id);
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.innerHTML = `
          <div class="shop-name">${it.name}</div>
          <div class="shop-desc">${it.description}</div>
          <div class="shop-meta"><span>售价 ${it.price}</span></div>
          <button class="shop-buy" ${owned ? 'disabled' : ''}>${owned ? '已拥有' : '买'}</button>
        `;
        card.querySelector('.shop-buy').addEventListener('click', () => {
          const r = this.game.buyUpgrade(it.id);
          if (!r.ok) this.toast(r.message);
          else this.toast(`购入 ${it.name}`);
        });
        return card;
      }));
    }

    _makeGroup(title, defs, makeCard) {
      const wrap = document.createElement('div');
      wrap.className = 'shop-group';
      const h = document.createElement('h4');
      h.textContent = title;
      wrap.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'shop-grid';
      defs.forEach(it => grid.appendChild(makeCard(it)));
      wrap.appendChild(grid);
      return wrap;
    }

    _buildRegionTabs() {
      const tabs = this.elements.regionTabs;
      tabs.innerHTML = '';
      regions.all().forEach(r => {
        const btn = document.createElement('button');
        btn.className = 'region-tab';
        btn.textContent = r.name;
        btn.dataset.regionId = r.id;
        btn.addEventListener('click', () => {
          const ok = this.game.switchRegion(r.id);
          if (!ok) this.toast(`${r.name} 未解锁`);
        });
        tabs.appendChild(btn);
      });
    }

    // 图鉴：遍历 crops.all() 自动生成条目
    // 未来新增作物时只需在 data.js register 一条，图鉴自动包含，无需改本函数
    _buildCodex() {
      const list = this.elements.codexList;
      list.innerHTML = '';
      const allCrops = crops.all();
      const unlockedCount = allCrops.filter(c => this.game.economy.isCropUnlocked(c.id)).length;
      const header = document.createElement('div');
      header.className = 'codex-header';
      header.textContent = `已解锁 ${unlockedCount} / ${allCrops.length} 种作物`;
      list.appendChild(header);

      allCrops.forEach(c => {
        const unlocked = this.game.economy.isCropUnlocked(c.id);
        const card = document.createElement('div');
        card.className = 'codex-card' + (unlocked ? '' : ' locked');
        // 季节标签
        const seasonTags = c.seasons.map(s => {
          const season = seasons.get(s);
          return season ? season.name : s;
        }).join(' / ');
        card.innerHTML = `
          <div class="codex-swatch" style="background:${unlocked ? c.color.mature : '#333'}"></div>
          <div class="codex-info">
            <div class="codex-name">${unlocked ? c.name : '???'}</div>
            <div class="codex-desc">${unlocked ? c.description : '尚未解锁，继续努力赚钱吧'}</div>
            <div class="codex-meta">
              <span>生长 ${c.growthTime}s</span>
              <span>买 ${c.seedPrice} / 卖 ${unlocked ? c.sellPrice : '?'}</span>
              <span>季节 ${seasonTags}</span>
            </div>
            ${unlocked ? '' : `<div class="codex-unlock">解锁条件: 累计赚取 ${c.unlockBy.threshold} 金币</div>`}
          </div>
        `;
        list.appendChild(card);
      });
    }

    refresh() {
      const e = this.elements;
      const g = this.game;
      // 顶部
      e.gold.textContent = g.economy.gold;
      e.date.textContent = `第 ${g.time.dayNumber} 天`;
      e.season.textContent = `${g.time.season.name}季 · 第 ${g.time.dayOfSeason} 天`;
      e.weather.textContent = g.time.weather ? g.time.weather.name : '晴';
      // 游戏内时钟
      const t = g.time.timeOfDay;
      const hour = Math.floor(t * 24);
      const min = Math.floor((t * 24 - hour) * 60);
      e.clock.textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      // 区域标签
      const tabs = e.regionTabs.querySelectorAll('.region-tab');
      tabs.forEach(t => {
        const id = t.dataset.regionId;
        const unlocked = g.economy.isRegionUnlocked(id);
        t.classList.toggle('active', id === g.activeRegionId);
        t.classList.toggle('locked', !unlocked);
      });
      // 库存
      this._refreshInventory();
      // 选中种子
      if (g.selectedSeedId) {
        const it = items.get(g.selectedSeedId);
        e.selectedSeed.textContent = it ? `当前选中: ${it.name}` : '未选中种子';
      } else {
        e.selectedSeed.textContent = '未选中种子';
      }
    }

    _refreshInventory() {
      const list = this.elements.inventoryList;
      const seeds = this.game.inventory.seeds();
      list.innerHTML = '';
      if (seeds.length === 0) {
        list.innerHTML = '<div class="empty">背包空空如也，去商店买种子吧</div>';
        return;
      }
      seeds.forEach(({ itemId, count, item }) => {
        const card = document.createElement('div');
        card.className = 'inv-card';
        const selected = this.game.selectedSeedId === itemId;
        card.innerHTML = `
          <div class="inv-name">${item.name}</div>
          <div class="inv-count">x${count}</div>
          <button class="inv-select ${selected ? 'selected' : ''}">${selected ? '已选' : '选中'}</button>
        `;
        card.querySelector('.inv-select').addEventListener('click', () => {
          if (selected) this.game.selectedSeedId = null;
          else this.game.selectSeed(itemId);
          this.refresh();
        });
        list.appendChild(card);
      });
    }

    toast(msg) {
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      this.elements.log.appendChild(el);
      // 入场动画
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
      }, 2500);
      // 最多保留 5 条
      const all = this.elements.log.querySelectorAll('.toast');
      if (all.length > 5) all[0].remove();
    }
  }

  Farm.UI = UI;
})(window.Farm = window.Farm || {});
