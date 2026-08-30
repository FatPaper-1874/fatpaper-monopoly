# @mine-monopoly/map-editor

## 1.3.1

### Patch Changes

- - **MCP 工具**
    - 新增地图项管理工具：`add_map_item` / `update_map_item` / `remove_map_item`，支持放置、移动、旋转和删除地图项
    - 新增地图项绑定工具：`link_map_event`（绑定/解绑地图事件）、`link_map_items` / `unlink_map_item`（地图项间地皮绑定与解除）
    - 新增地图项类型管理工具：`list_map_item_types` / `get_map_item_type` / `add_map_item_type` / `update_map_item_type` / `remove_map_item_type`，支持管理类型名称、模型、颜色（#RRGGBB）与尺寸
  - **编辑器核心**
    - 新增 map-item 与 map-item-type 的 zod 校验器
    - `map-content-service` 新增地图项及类型的完整服务层实现
    - 渲染器监听 `map-item-added` / `map-item-type-updated` 事件，自动重渲染受影响的地图项并刷新预览框

## 1.3.0

### Minor Changes

- - **MapPath V2 路径编辑**
    - 新增有向路径的创建、编辑、渲染与严格校验，支持路线预览、起终点反转、路径 ID 复制及相邻路径生成
    - 提供旧版地图路径迁移提示，并新增 MapPath V2 路径图管理 MCP 接口
  - **地图项 ID 标准化**
    - 新增地图项重命名和关联引用同步工具，避免重命名后出现悬空引用
  - **代码校验与类型库**
    - 代码校验失败时支持确认保存
    - 修复类型库同步和校验后编辑器类型丢失的问题

## 1.2.5

### Patch Changes

- **MCP 服务**
  - 支持自定义 MCP 服务端口（默认 3000），带 1-65535 范围校验，端口被占用时自动尝试后续端口
  - 启动结果、状态查询和状态事件中同步返回实际端口号
- **MCP 控制面板**
  - 新增端口配置输入框，启动服务器前可自定义端口
  - 将"连接命令"改为 AI 配置提示语，支持一键复制给 AI 客户端自动安装配置 MCP 服务

## 1.2.4

### Patch Changes

- - 新增地图更新日志数据编辑与展示支持
  - 扩展地图序列化、上传及地图信息表单，支持维护更新日志内容
  - 完善地图预览和相关类型定义，保持编辑器与客户端地图数据结构一致

## 1.2.3

### Patch Changes

- - **UI 改进**
    - 顶部工具列表改为可折叠 slide 面板，复刻 client `CollapsiblePanel`，复用 `useCollapsible` 共享逻辑
    - 支持 dock/slide 双模式与 gripAlign 端到端把手对齐，工具靠右排列，把手为右下角长方形按钮（grip-align=end）
    - 修复收起动画层级：`map-editor-container` 增加 `overflow:hidden` 裁剪滑出内容，避免工具列表盖过顶部 Header

## 1.2.2

### Patch Changes

- - **地图上传**
    - 新增地图上传审核发布流：支持地图序列化上传、上传对话框（UploadMapDialog）、API Key 校验与上传限额控制
  - **MCP 服务**
    - 重构工具注册机制：新增 registry 统一注册与分类（tools/registry.ts）
    - 新增批量操作工具 `plan_map_changes` / `apply_map_changes`（map-changes.ts）
    - 新增地图校验工具 `validate_map`（validate-map.ts）
    - 新增 properties 工具模块，扩展 map-items、resources、type-libs 等工具能力

## 1.2.1

### Patch Changes

- - 修复地图编辑器预览与窗口缩放异常

## 1.2.0

### Minor Changes

- - 修复 MCP 模板与 TypeScript 校验链路不一致问题，统一代码编辑器、MCP 工具和 Monaco 校验器的模板来源

## 1.1.9

### Patch Changes

- - **保存功能**
    - 保存操作统一使用 `withLoading` 加载状态管理模式
    - save/saveAsNewDir 返回 `.fpmap` 导出路径，保存时提示 dist 同步导出信息
  - **类型安全**
    - 新增 Three.js 示例模块类型声明（`three-examples.d.ts`）
    - 修复 Monaco 编辑器验证器类型、Three.js 渲染器 definite assignment
    - 修复模型烘焙参数类型标注
  - **渲染**
    - 加载遮罩支持动态文本显示
    - 移除未使用的 gsap import，优化相机类型安全
  - **MCP 工具**
    - 新增游戏设置 MCP 工具接口（list/add/update/remove）

## 1.1.8

### Patch Changes

- - 地图序列化时自动清理磁盘残留的孤儿文件，避免垃圾文件堆积
  - 重构掷骰子阶段默认代码模板

## 1.1.7

### Patch Changes

- - **默认代码模板**
    - 重构掷骰子阶段默认代码，使用 `while(true)+Promise.race` 循环替代独立监听函数
    - 统一参数命名规范（`context` → `ctx`）
    - 简化骰子结果处理逻辑，移除多余的动画等待

## 1.1.6

### Patch Changes

- - **游戏阶段**
    - 新增 postRestore 阶段类型，存档恢复后执行
    - 阶段管理界面新增 postRestore 分类支持
  - **MCP 工具**
    - 新增 `get-default-code` 工具，获取各阶段默认代码模板
  - **编辑器核心**
    - 系统阶段改用稳定 ID 常量替代随机生成
    - 存档恢复时正确提取并使用保存的角色 ID
  - **工具模块**
    - 新增 `normalizePhases` 和 `normalizeGameMap` 工具函数

## 1.1.5

### Patch Changes

- - **新功能**: 支持运行时动态管理地图事件及图标渲染

## 1.1.4

### Patch Changes

- - **版本管理**
    - 新增 Git 版本管理（基于 isomorphic-git），支持 init/commit/log/checkout/diff
    - 新增 VersionPanel 版本历史面板，支持提交浏览、差异对比和版本回退
  - **地图存储**
    - 新增目录格式地图：GameMap 序列化为结构化目录，代码与数据分离
    - 支持旧版 .fpmap 文件升级为目录格式项目
    - 地图加载统一入口 loadMapAuto，自动识别格式
  - **编辑器核心**
    - 重构文件菜单：打开项目 / 打开 .fpmap / 保存为项目 / 导出 .fpmap
    - Ctrl+S 保存改为 eventBus 事件驱动，解耦 renderer 与 file 模块

## 1.1.3

### Patch Changes

- - **游戏设置**：新增回合倒计时配置项，内置非法参数保护与旧地图兼容逻辑

## 1.1.2

### Patch Changes

- - 修饰器系统支持实例级上下文数据传递，effectCode 可通过 `ctx.modifierData` 读取实例数据
  - 同步客户端修饰器系统类型定义更新（packages/types），消除编译警告

## 1.1.1

### Patch Changes

- - 修复顶部栏窗口控制按钮（最小化/最大化/关闭）失效的问题

## 1.1.0

### Minor Changes

- - 添加 Capacitor OTA 更新功能及 Android 自动构建流程
  - 移动端关闭抗锯齿、EffectComposer 和模型动画省 GPU
  - 移动端横屏使用 16:9 容器比例并动态计算基准字号
  - 添加 Capacitor Android 构建支持
  - 将 electronAPI 改造为通用 platform 平台接口，移除地图缓存
  - 地图说明支持 Markdown 渲染
  - 修复登录页 CSS transition 与 GSAP 入场动画冲突，优化更新弹窗
  - 修复 Docker 部署时 admin 环境变量缺失及 .mmmap 解密失败

## 1.0.0

### Patch Changes

- 第一个正式版本
