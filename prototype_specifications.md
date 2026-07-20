# “长夏学程”高奢精致界面设计原型与技术重构规范

本文档为“长夏学程”高中暑期学习计划 Web 系统的重构设计原型与前端架构规范。旨在说明如何将前端界面重构成高质感、高奢深夜蓝磨砂玻璃态（Glassmorphism）风格，并列出开发中遇到的关键布局、缓存等技术细节，便于其他工具/人工开发者（如 Codex）直接接手或进行验证。

---

## 1. 核心设计规范 (深夜蓝高奢玻璃态)

重构后的系统以**深夜蓝（Midnight Deep Blue）**作为主基调，全面对齐登录页的奢华科技质感：

### 1.1 基础色彩与多巴胺配色 (:root)
在系统样式表中采用以下 CSS 自定义变量，实现全系统的主题色与学科流光霓虹发光边框：

```css
:root {
  /* 基础暗色与板面色彩 */
  --navy-dark: #0b0f19;       /* 整个网页的底层背景 */
  --navy-panel: #111827;      /* 主要内容区域或侧边栏底色 */
  --navy-card: rgba(23, 35, 59, 0.7);  /* 毛玻璃卡片的背景色，半透明 */
  --border-glass: rgba(255, 255, 255, 0.08); /* 极细磨砂半透明边框 */

  /* 文字颜色体系 */
  --text-primary: #ffffff;    /* 核心文字 */
  --text-secondary: #94a3b8;  /* 辅助/说明文字 */
  --text-muted: #64748b;      /* 暗色占位符或标签文字 */

  /* 多巴胺学科主题色 */
  --dopamine-blue: #00d2ff;   /* 数学 (主天蓝) */
  --dopamine-mint: #2dd4bf;   /* 物理 (薄荷绿) */
  --dopamine-pink: #f43f5e;   /* 化学 (珊瑚粉) */
  --dopamine-purple: #b19ffb; /* 英语 (优雅紫) */
  --dopamine-yellow: #fbbf24; /* 计时/辅助警示色 */

  /* 学科卡片渐变与发光霓虹特效 */
  --subject-math: linear-gradient(135deg, #00d2ff, #0072ff);
  --subject-phys: linear-gradient(135deg, #00f2fe, #4facfe);
  --subject-chem: linear-gradient(135deg, #ff0844, #ffb199);
  --subject-engl: linear-gradient(135deg, #b19ffb, #745dfd);

  --neon-math: 0 0 15px rgba(0, 114, 255, 0.35), 0 0 2px rgba(0, 114, 255, 0.7);
  --neon-physics: 0 0 15px rgba(67, 198, 170, 0.35), 0 0 2px rgba(67, 198, 170, 0.7);
  --neon-chemistry: 0 0 15px rgba(255, 93, 158, 0.35), 0 0 2px rgba(255, 93, 158, 0.7);
  --neon-english: 0 0 15px rgba(140, 112, 237, 0.35), 0 0 2px rgba(140, 112, 237, 0.7);

  /* 高级英文字体与数字等宽 */
  --font-sans: "HarmonyOS Sans SC", "MiSans", "PingFang SC", "Microsoft YaHei UI", sans-serif;
  --font-numeric: "DIN Alternate", "SFMono-Regular", Consolas, monospace;
}
```

### 1.2 玻璃磨砂与发光特效规范
为了在界面中塑造出层次分明的折射感与科技悬浮感：
1. **背景模糊**：半透明面板使用 `backdrop-filter: blur(16px);` 搭配薄边框 `1px solid var(--border-glass)`。
2. **卡片悬浮**：Hover 时，卡片增加微小的上移，并根据科目加上发光的 `box-shadow` 特效：
   ```css
   .task-card-row:hover {
     background: rgba(29, 44, 75, 0.8);
     transform: translateY(-2px);
   }
   .task-card-row.subject-数学:hover { box-shadow: 0 0 20px rgba(0, 210, 255, 0.15); }
   ```

---

## 2. 页面架构与 DOM 布局规范

系统采用双面板架构（左侧侧边栏导航 + 右侧主内容区，自适应屏幕宽度）：

### 2.1 常驻毛玻璃左侧导航栏 (`.app-sidebar`)
*   **结构**：由品牌标志 `.sidebar-brand`、菜单导航 `.sidebar-nav` 和底部登出区 `.sidebar-footer` 组成。
*   **自适应机制**：
    *   在宽屏下，宽度固定为 `260px`，定位于屏幕左侧。
    *   在窄屏（`max-width: 1024px`）下，默认隐藏（`transform: translateX(-100%)`），点击顶部汉堡菜单按钮 `.menu-toggle` 后向右滑出显示（`.app-sidebar.show`）。

### 2.2 任务卡片行布局 (`.task-card-row`) 与折叠细节修复 (关键避坑)
前端的核心在于废除传统的 `<table>` 表格，改为横向流式**发光卡片行**，以 Grid 布局实现表头对齐：

#### 2.2.1 任务行与表头 Grid 参数
表头 `.task-list-header` 和卡片行 `.task-card-row` 均采用如下严格的 Grid 分栏：
```css
grid-template-columns: 60px 140px 1fr 110px 240px 115px 110px;
gap: 12px;
```
列定义依次为：`序号`、`学科/项目`、`任务描述`、`预计用时`、`照片凭证`、`状态`、`操作`。

#### 2.2.2 详情折叠面板 `.card-inner-details` 的正确层级
*   **必须声明为 `.task-card-row` 的直接子级**，不得嵌套在 `.cell-desc` 描述单元格内。
*   **Grid 跨列属性**：为了使其不被分配在某个窄小的单元格内，必须在 CSS 中强制横跨所有 7 列：
  ```css
  .card-inner-details {
    grid-column: 1 / -1; /* 跨越全部列 */
    display: grid;
    grid-template-columns: 1fr 1fr 1fr; /* 内部再划分为三栏 */
    gap: 20px;
  }
  ```
  这三栏分别为：**学习要求**（`.details-section`）、**成果标准**（`.details-section`）与**记录与审核**（`.details-section.note-section`）。

#### 2.2.3 关键 CSS 优先级冲突避免
在卡片中，通用的单元格都会有一些 display-flex 的纵向排版，为了防止通用规则错误覆盖详情面板的 display-grid 布局，必须使用 `:not()` 伪类进行特异性排除：
```css
/* 错误写法（会把 .card-inner-details 也变成纵向 flex 导致栏目重叠）: */
.task-card-row > div { display: flex; ... }

/* 修正后的正确写法: */
.task-card-row > div:not(.card-inner-details) {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}
```

---

## 3. JavaScript 动态渲染逻辑规范

任务列表的核心渲染在 `app/static/app.js` 内实现，其流程及细节包括：

1.  **多巴胺环形进度圈**：使用 CSS `conic-gradient` 按真实完成率绘制：
    ```javascript
    `<div class="mini-ring" style="--progress:${rate * 3.6}deg"></div>`
    ```
2.  **计时专注器的光效**：当任务开始专注计时（`timer.state === 'running'`），通过 `.is-running` 状态类执行学科色光晕动画。
3.  **防抖保存逻辑**：学生记录与审核评语的 textarea 在触发 `focusout` 事件时，异步向后端 PATCH `/api/tasks/<id>`，并实时在对应卡片的 `data-save-for` 元素上渲染“保存中”和“已保存”状态提示。

---

## 4. 后端强制防缓存规范 (Cache-Control)

为了打碎浏览器对 HTML 渲染和静态资源的强缓存，必须在服务器端配置：
1. **HTML 页面不缓存**：在 Flask `app/app.py` 中，对请求增加 `after_request` 钩子，禁止浏览器本地保存 HTML 快照：
   ```python
   @app.after_request
   def add_cache_headers(response):
       response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
       return response
   ```
2. **静态资源缓存穿透**：CSS 或 JavaScript 修改后，保留正式文件名并递增模板中的 `v=` 查询版本：
   ```html
   <link rel="stylesheet" href="{{ url_for('static', filename='app.css', v='18') }}">
   ```
