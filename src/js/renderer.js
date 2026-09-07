// renderer.js - Canvas 渲染器
// 负责绘制：草地、田地格子、作物各阶段、夜晚遮罩、天气粒子
// 像素画风格：禁用平滑、整数倍放大；作物暂用纯色块占位（未来可换 sprite sheet）
// 渲染器只读 Game 状态，不修改数据
(function (Farm) {
  'use strict';
  const { crops, seasons, regions, STAGE_NAMES } = Farm;

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = game;
      this.ctx.imageSmoothingEnabled = false;     // 像素画不模糊
      this.tileSize = 64;                          // 每格基础像素尺寸
      this.hoveredSlot = -1;
      this.particles = [];
      this._lastParticleSpawn = 0;
      this._rafId = null;
      // 监听鼠标移动以追踪悬停格子
      canvas.addEventListener('mousemove', (e) => this._handleHover(e));
      canvas.addEventListener('mouseleave', () => { this.hoveredSlot = -1; });
      canvas.addEventListener('click', (e) => this._handleClick(e));
    }

    // 计算田地网格在画布上的偏移（居中）
    getFieldOffset() {
      const f = this.game.activeField;
      const cols = f.width;
      const rows = Math.ceil(f.slots.length / f.width);
      const fw = cols * this.tileSize;
      const fh = rows * this.tileSize;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      return {
        x: Math.floor((cw - fw) / 2),
        y: Math.floor((ch - fh) / 2),
        cols, rows, fw, fh
      };
    }

    // 由画布坐标反查格子索引
    pickSlot(mx, my) {
      const o = this.getFieldOffset();
      if (mx < o.x || my < o.y) return -1;
      const col = Math.floor((mx - o.x) / this.tileSize);
      const row = Math.floor((my - o.y) / this.tileSize);
      if (col < 0 || col >= o.cols || row < 0 || row >= o.rows) return -1;
      const idx = row * o.cols + col;
      if (idx >= this.game.activeField.slots.length) return -1;
      return idx;
    }

    _handleHover(e) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      this.hoveredSlot = this.pickSlot(mx, my);
    }

    _handleClick(e) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
      const my = (e.clientY - rect.top) * (this.canvas.height / rect.height);
      const idx = this.pickSlot(mx, my);
      if (idx >= 0 && this.onClickSlot) this.onClickSlot(idx);
    }

    // 主动画循环
    start() {
      const loop = () => {
        this.render();
        this._rafId = requestAnimationFrame(loop);
      };
      loop();
    }
    stop() { if (this._rafId) cancelAnimationFrame(this._rafId); }

    render() {
      const ctx = this.ctx;
      const cw = this.canvas.width;
      const ch = this.canvas.height;
      // 1. 背景：草地（按季节着色）
      this._drawGround(ctx, cw, ch);
      // 2. 田地格子
      this._drawField(ctx);
      // 3. 天气粒子（前景）
      this._updateAndDrawParticles(ctx, cw, ch);
      // 4. 夜晚遮罩
      this._drawNightOverlay(ctx, cw, ch);
      // 5. 悬停高亮
      this._drawHoverHighlight(ctx);
    }

    _drawGround(ctx, cw, ch) {
      const season = this.game.time.season;
      const grass = season ? season.grassColor : '#5a7a3a';
      ctx.fillStyle = grass;
      ctx.fillRect(0, 0, cw, ch);
      // 草点纹理：随机固定噪点
      ctx.fillStyle = this._shade(grass, -10);
      for (let i = 0; i < 80; i++) {
        const x = (i * 73 + 13) % cw;
        const y = (i * 137 + 41) % ch;
        ctx.fillRect(x, y, 3, 3);
      }
    }

    _drawField(ctx) {
      const o = this.getFieldOffset();
      const field = this.game.activeField;
      const region = field.region;
      // 田地底色
      ctx.fillStyle = region.soilColor;
      ctx.fillRect(o.x, o.y, o.fw, o.fh);
      // 格子
      for (let i = 0; i < field.slots.length; i++) {
        const s = field.slots[i];
        const col = i % o.cols;
        const row = Math.floor(i / o.cols);
        const sx = o.x + col * this.tileSize;
        const sy = o.y + row * this.tileSize;
        this._drawSlot(ctx, s, sx, sy);
      }
      // 网格线
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      for (let c = 0; c <= o.cols; c++) {
        ctx.beginPath();
        ctx.moveTo(o.x + c * this.tileSize, o.y);
        ctx.lineTo(o.x + c * this.tileSize, o.y + o.fh);
        ctx.stroke();
      }
      for (let r = 0; r <= o.rows; r++) {
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + r * this.tileSize);
        ctx.lineTo(o.x + o.fw, o.y + r * this.tileSize);
        ctx.stroke();
      }
    }

    _drawSlot(ctx, slot, sx, sy) {
      const ts = this.tileSize;
      if (slot.state === Farm.SLOT_STATE.EMPTY) {
        // 草地格子：覆盖回草地色
        const season = this.game.time.season;
        ctx.fillStyle = season ? season.grassColor : '#5a7a3a';
        ctx.fillRect(sx, sy, ts, ts);
        return;
      }
      // 耕地：深色土
      ctx.fillStyle = '#5a3c1c';
      ctx.fillRect(sx + 1, sy + 1, ts - 2, ts - 2);
      // 耕地纹理：横纹
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(sx + 4, sy + 8 + i * 18, ts - 8, 2);
      }
      // 浇水状态：深色湿润
      if (slot.watered) {
        ctx.fillStyle = 'rgba(40, 80, 160, 0.25)';
        ctx.fillRect(sx + 1, sy + 1, ts - 2, ts - 2);
      }
      // 作物
      if (slot.state === Farm.SLOT_STATE.PLANTED && slot.crop) {
        this._drawCrop(ctx, slot.crop, sx, sy);
        // 成熟标记：闪光边框
        if (slot.crop.isMature) {
          const t = (Date.now() % 1000) / 1000;
          const alpha = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 230, 80, ${alpha})`;
          ctx.lineWidth = 3;
          ctx.strokeRect(sx + 2, sy + 2, ts - 4, ts - 4);
        }
      }
    }

    _drawCrop(ctx, crop, sx, sy) {
      const def = crop.definition;
      if (!def) return;
      const stage = crop.stageIndex;
      const stageName = STAGE_NAMES[stage];
      const color = def.color[stageName];
      const ts = this.tileSize;
      const cx = sx + ts / 2;
      const cy = sy + ts / 2;
      if (stage === 0) {
        // 种子：小棕点
        ctx.fillStyle = def.color.seed;
        ctx.fillRect(cx - 3, cy - 1, 6, 4);
      } else if (stage === 1) {
        // 发芽：小绿芽
        ctx.fillStyle = def.color.sprout;
        ctx.fillRect(cx - 4, cy - 4, 8, 10);
        ctx.fillRect(cx - 8, cy - 2, 4, 4);
        ctx.fillRect(cx + 4, cy - 2, 4, 4);
      } else if (stage === 2) {
        // 成长：中等植株
        ctx.fillStyle = def.color.growing;
        ctx.fillRect(cx - 6, cy - 14, 12, 18);
        ctx.fillStyle = def.color.sprout;
        ctx.fillRect(cx - 10, cy - 10, 6, 6);
        ctx.fillRect(cx + 4, cy - 10, 6, 6);
      } else {
        // 成熟：饱满色块（按类别微调形状）
        ctx.fillStyle = def.color.mature;
        if (def.category === 'grain') {
          ctx.fillRect(cx - 8, cy - 20, 16, 22);
          ctx.fillStyle = def.color.growing;
          ctx.fillRect(cx - 4, cy - 4, 8, 12);
        } else if (def.category === 'root') {
          ctx.fillRect(cx - 8, cy - 4, 16, 14);
          ctx.fillStyle = def.color.sprout;
          ctx.fillRect(cx - 6, cy - 16, 12, 14);
        } else if (def.category === 'gourd') {
          ctx.fillRect(cx - 12, cy - 12, 24, 22);
        } else {
          // fruit
          ctx.fillRect(cx - 8, cy - 16, 16, 18);
        }
      }
    }

    _drawHoverHighlight(ctx) {
      if (this.hoveredSlot < 0) return;
      const o = this.getFieldOffset();
      const field = this.game.activeField;
      if (this.hoveredSlot >= field.slots.length) return;
      const col = this.hoveredSlot % o.cols;
      const row = Math.floor(this.hoveredSlot / o.cols);
      const sx = o.x + col * this.tileSize;
      const sy = o.y + row * this.tileSize;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, this.tileSize - 2, this.tileSize - 2);
    }

    _drawNightOverlay(ctx, cw, ch) {
      const b = this.game.time.brightness;       // 0.4~1.0
      const darkness = 1 - b;
      if (darkness <= 0.05) return;
      ctx.fillStyle = `rgba(10, 15, 40, ${darkness * 0.55})`;
      ctx.fillRect(0, 0, cw, ch);
    }

    _updateAndDrawParticles(ctx, cw, ch) {
      const w = this.game.time.weather;
      if (!w || !w.particle) return;
      // 生成粒子
      const now = Date.now();
      if (now - this._lastParticleSpawn > 60) {
        this._lastParticleSpawn = now;
        const count = w.particle === 'rain' ? 8 : 4;
        for (let i = 0; i < count; i++) {
          this.particles.push({
            x: Math.random() * cw,
            y: -5,
            vx: w.particle === 'rain' ? -2 : 1,
            vy: w.particle === 'rain' ? 14 : 6,
            life: 1
          });
        }
      }
      // 更新与绘制
      ctx.fillStyle = w.particle === 'rain' ? 'rgba(160, 190, 230, 0.8)' : 'rgba(255, 255, 255, 0.9)';
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > ch || p.x < 0 || p.x > cw) {
          this.particles.splice(i, 1);
          continue;
        }
        if (w.particle === 'rain') {
          ctx.fillRect(p.x, p.y, 1, 8);
        } else {
          ctx.fillRect(p.x, p.y, 3, 3);
        }
      }
      // 上限清理
      if (this.particles.length > 200) this.particles.splice(0, this.particles.length - 200);
    }

    // 工具：颜色加亮/变暗
    _shade(hex, percent) {
      const n = parseInt(hex.slice(1), 16);
      const r = Math.max(0, Math.min(255, (n >> 16) + percent));
      const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + percent));
      const b = Math.max(0, Math.min(255, (n & 0xff) + percent));
      return `rgb(${r},${g},${b})`;
    }
  }

  Farm.Renderer = Renderer;
})(window.Farm = window.Farm || {});
