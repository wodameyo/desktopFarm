# 像素农场 (desktopFarm)

桌面上的挂机农场小游戏，用于上班间隙挂机消磨时间。2D 像素画风格，单机运行，无联网无账号。

## 启动方式

```bash
# 安装依赖
npm install

# 开发模式启动（自动打开 DevTools）
npm run dev

# 普通启动
npm start

# 打包为 Windows exe（需在 Windows 环境）
npm run build
```

## 玩法

- 点击空地开垦 → 在背包选中种子 → 点击耕地播种 → 等待生长 → 成熟后点击收获（自动出售）
- 雨天自动浇水；雪天生长减半；换季时未成熟的非当季作物会枯萎
- 离线后回归按 50% 折算作物进度
- 顶部按钮：一键收获 / 一键浇水 / 一键补种 / 扩张田地
- 设置：窗口置顶（上班挂在屏幕角落）/ 1x-3x 画面缩放 / 立即保存

## 项目结构

```
/workspace
├── main.js              # Electron 主进程：窗口壳、置顶、存档目录
├── preload.js           # contextBridge 安全 API 暴露
├── package.json
└── src/
    ├── index.html       # 游戏 UI 结构
    ├── styles.css       # 田园像素风样式
    └── js/
        ├── data.js      # 数据层：Registry + 作物/季节/天气/地区/物品定义
        ├── game.js      # 逻辑层：Crop/Field/Inventory/Economy/TimeSystem/SaveManager/Game
        ├── renderer.js  # 渲染层：Canvas 像素画、昼夜遮罩、天气粒子
        ├── ui.js        # UI 控制器：商店/背包/图鉴/设置面板
        └── main.js      # 入口：装配 Game+Renderer+UI、点击交互
```

## 扩展设计（数据驱动）

所有可扩展内容通过 `Registry` 管理，新增内容无需改动核心代码。

### 新增一种作物

编辑 `src/js/data.js`，在 `crops.registerAll([...])` 数组中追加一条：

```js
['blueberry', {
  id: 'blueberry', name: '蓝莓', category: 'fruit',
  growthTime: 50, seedPrice: 18, sellPrice: 55,
  seasons: ['summer'],
  color: { seed: '#7a5230', sprout: '#5fae3a', growing: '#3a5a8a', mature: '#3a4a9a' },
  stages: [0.1, 0.3, 0.75, 1.0],
  description: '夏季限定浆果。',
  unlockBy: { type: 'gold', threshold: 400 }
}]
```

同时在 `items.registerAll` 追加对应种子条目即可。图鉴、商店、季节校验会自动包含新作物。

### 新增一个地区

在 `regions.registerAll` 追加一条，设置 `unlockBy` 解锁条件和 `slotPrice` 扩张价格曲线。

### 新增季节 / 天气

在 `seasons` / `weather` Registry 追加定义，并在 `SEASON_ORDER` / `WEIGHTS` 中调整权重。

## 实现进度对照（设计文档）

| 优先级 | 内容 | 状态 |
|--------|------|------|
| P0 | 桌面窗口骨架、田地、3 种作物、种/收/卖、金币、昼夜、存档 | 已完成（6 种作物） |
| P1 | 四季、天气、扩田、商店、一键收获、窗口置顶 | 已完成 |
| P2 | 装饰、机器人、离线收益、音效、exe 打包 | 数据已预留；逻辑待实现 |

## 技术栈

- Electron 28 + Canvas + 原生 JS（无构建步骤，无框架依赖）
- 存档：JSON 文件位于 Electron `userData/desktopFarm/farm_save.json`，每 30 秒自动保存
