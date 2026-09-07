// main.js - 游戏入口
// 初始化 Game → Renderer → UI，绑定 Canvas 点击交互
(function (Farm) {
  'use strict';

  window.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('game-canvas');
    // 默认 1x 像素画基准
    canvas.width = 640;
    canvas.height = 480;

    const game = new Farm.Game();
    await game.init();

    const renderer = new Farm.Renderer(canvas, game);
    const ui = new Farm.UI(game);

    // Canvas 点击：根据格子状态智能执行操作
    // 空地 → 开垦；耕地 + 已选种子 → 播种；已种未浇水 → 浇水；成熟 → 收获
    renderer.onClickSlot = (index) => {
      const field = game.activeField;
      const slot = field.getSlot(index);
      if (!slot) return;
      if (slot.state === Farm.SLOT_STATE.EMPTY) {
        game.tillSlot(index);
        ui.toast('开垦一格');
      } else if (slot.state === Farm.SLOT_STATE.TILLED) {
        if (game.selectedSeedId) {
          const r = game.plantSlot(index);
          if (!r.ok) ui.toast(r.message);
          else ui.toast('已播种');
        } else {
          ui.toast('先在背包选中种子');
        }
      } else if (slot.state === Farm.SLOT_STATE.PLANTED) {
        if (slot.crop && slot.crop.isMature) {
          const r = game.harvestSlot(index);
          if (r.ok) ui.toast(`收获 ${Farm.crops.get(r.cropId).name}，+${r.earned} 金`);
        } else if (!slot.watered) {
          game.waterSlot(index);
          ui.toast('浇水');
        } else {
          // 显示进度
          const def = slot.crop.definition;
          const pct = Math.floor(slot.crop.growthProgress * 100);
          ui.toast(`${def.name} 生长 ${pct}%`);
        }
      }
    };

    renderer.start();

    // 暴露给控制台调试
    window.__game = game;
    window.__renderer = renderer;
    window.__ui = ui;

    console.log('像素农场已启动');
  });
})(window.Farm = window.Farm || {});
