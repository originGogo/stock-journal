# 📒 Stock Journal — 交易复盘日记 App

一款面向个人投资者的 Android/iOS 移动端交易复盘工具，支持图文记录、盈亏统计、AI 周报、OCR 自动识图、日历热力图、交易计划提醒以及数据备份恢复。

---

## 目录

- [功能概览](#功能概览)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [文件详解](#文件详解)
  - [根目录文件](#根目录文件)
  - [服务层文件](#服务层文件)
  - [screens/ 页面目录](#screens-页面目录)
- [配置 API Key](#配置-api-key)
- [本地开发](#本地开发)
- [打包发布](#打包发布)
- [数据存储说明](#数据存储说明)

---

## 功能概览

| 功能          | 说明                                                    |
| ------------- | ------------------------------------------------------- |
| 📸 图文复盘   | 拍照或从相册选图，附股票代码、标签、笔记，自动压缩存储  |
| 💰 盈亏记录   | 录入买入/卖出价格、数量、方向，自动计算盈亏金额和百分比 |
| 🔍 OCR 识图   | 拍交割单截图，AI 自动提取股票代码、价格、数量等字段     |
| 📅 日历热力图 | 按日期查看盈亏分布，绿色盈利/红色亏损/蓝色无盈亏数据    |
| 📊 数据看板   | 总览胜率、盈亏比、累计盈亏；支持导入/导出 zip 备份      |
| 🗓️ 周报 + AI  | 汇总本周所有记录，调用 AI 生成交易行为分析和改进建议    |
| 📋 交易计划   | 编写交易预案，设定任意日期+时间的本地推送提醒           |

---

## 技术栈

| 类别       | 库/框架                                      | 版本    |
| ---------- | -------------------------------------------- | ------- |
| 框架       | React Native + Expo                          | SDK ~54 |
| 语言       | TypeScript                                   | ~5.9    |
| 导航       | @react-navigation/native-stack + bottom-tabs | v7      |
| 数据库     | expo-sqlite（异步 API）                      | ~16     |
| 文件系统   | expo-file-system（legacy + OOP API）         | ~19     |
| 图片选取   | expo-image-picker                            | ~17     |
| 图片压缩   | expo-image-manipulator                       | ~14     |
| 通知       | expo-notifications                           | ~0.32   |
| 日期选择器 | @react-native-community/datetimepicker       | 8.4     |
| 分享       | expo-sharing                                 | ~14     |
| 文件选择   | expo-document-picker                         | ~14     |
| Zip 压缩   | jszip                                        | ^3.10   |
| 日历组件   | react-native-calendars                       | ^1.13   |
| AI 接口    | OpenAI 兼容格式（fetch）                     | —       |

---

## 项目结构

```
stock-journal/
├── App.tsx                    # 应用入口，配置通知行为和导航容器
├── index.ts                   # Expo 注册入口（registerRootComponent）
├── app.json                   # Expo 项目配置（图标、包名、插件等）
├── eas.json                   # EAS Build 构建配置
├── package.json               # 依赖声明
├── tsconfig.json              # TypeScript 编译配置
│
├── aiCoach.ts                 # AI 周报生成服务
├── ocrService.ts              # OCR 交割单识别服务
├── database.ts                # SQLite 数据库层（所有增删改查）
├── notificationService.ts     # 本地通知调度服务
├── pickAndSaveImage.ts        # 图片选取、压缩、本地存储
├── plUtils.ts                 # 盈亏计算工具函数
│
├── assets/                    # 静态资源（图标、启动页）
│   ├── icon.png               # iOS 图标 + 通知图标（1024×1024）
│   ├── adaptive-icon.png      # Android 自适应图标前景层（1024×1024）
│   ├── splash-icon.png        # 启动页图片
│   └── favicon.png            # Web 标签页图标
│
└── screens/                   # 页面组件
    ├── MainTabNavigator.tsx   # 底部 Tab 导航 + Journal Stack 导航
    ├── HomeScreen.tsx         # 复盘日记列表页
    ├── AddRecordScreen.tsx    # 新增复盘记录页
    ├── EditRecordScreen.tsx   # 编辑复盘记录页
    ├── CalendarScreen.tsx     # 日历热力图页
    ├── OverviewScreen.tsx     # 数据看板页（统计 + 备份）
    ├── ReportScreen.tsx       # AI 周报页
    └── PlanScreen.tsx         # 交易计划 & 提醒页
```

---

## 文件详解

### 根目录文件

---

#### `App.tsx`

应用根组件。职责：

- 调用 `Notifications.setNotificationHandler` 配置前台通知展示行为（App 在前台时也弹窗+响铃）
- 用 `useEffect` 在启动时预热通知权限查询（不强制弹窗，由 PlanScreen 在用户主动操作时请求）
- 用 `SafeAreaProvider` + `NavigationContainer` 包裹整个应用，挂载 `MainTabNavigator`

---

#### `index.ts`

Expo 应用注册入口，仅一行：

```ts
import { registerRootComponent } from "expo";
import App from "./App";
registerRootComponent(App);
```

`package.json` 的 `"main"` 字段指向此文件。

---

#### `app.json`

Expo 项目配置文件，关键字段：

- `icon` — iOS 图标路径（`./assets/icon.png`）
- `android.adaptiveIcon` — Android 自适应图标前景图 + 背景色
- `android.package` — App 包名（`com.gogo_yjx.stockjournal`）
- `android.versionCode` — 构建版本号，每次发布需递增
- `splash` — 启动页配置
- `plugins` — 声明原生插件：`expo-sqlite`、`expo-notifications`（含通知图标配置）、`@react-native-community/datetimepicker`

---

#### `eas.json`

EAS（Expo Application Services）构建配置，定义 `development`/`preview`/`production` 三个 Build Profile，用于 `eas build` 命令。

---

#### `package.json`

NPM 依赖声明。所有运行时依赖见上方[技术栈](#技术栈)表格。开发依赖仅有 TypeScript 类型包。

---

#### `tsconfig.json`

TypeScript 编译配置，继承自 `expo/tsconfig.base`，开启严格模式。

---

### 服务层文件

---

#### `database.ts`

**整个 App 的数据持久化核心**，封装所有 SQLite 操作。

**数据库文件位置：** `<DocumentDirectory>/SQLite/stockjournal.db`

**数据表：**

| 表名      | 字段                                                                                            | 说明           |
| --------- | ----------------------------------------------------------------------------------------------- | -------------- |
| `records` | id, image_uri, stock_code, tags, note, created_at, entry_price, exit_price, quantity, direction | 交易复盘记录   |
| `plans`   | id, plan_text, target_date, notify_at, notification_id, created_at                              | 交易计划及提醒 |

**导出函数一览：**

| 函数                                          | 说明                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `initDB()`                                    | 建表 + ALTER TABLE 兼容旧版字段迁移，App 启动和每个页面 focus 时调用 |
| `getDatabase()`                               | 获取单例数据库连接（懒初始化）                                       |
| `resetDatabase()`                             | 关闭并重置连接，用于从备份恢复后重新加载                             |
| `insertRecord({...})`                         | 插入一条复盘记录，返回 `lastInsertRowId`                             |
| `updateRecord({...})`                         | 更新指定 id 的复盘记录                                               |
| `deleteRecord(id)`                            | 删除一条复盘记录                                                     |
| `getAllRecords()`                             | 获取所有复盘记录，按 `created_at` 降序                               |
| `getThisWeekRecords()`                        | 获取本周（周一至今）的记录，用于周报                                 |
| `getOverallStats()`                           | 总体统计：记录数、盈利次数、总盈亏、最大盈/亏                        |
| `getTagStats()`                               | 按标签聚合统计次数                                                   |
| `getDailyStats()`                             | 按日期聚合统计次数，用于日历标注                                     |
| `getCalendarStats()`                          | 按日期聚合总盈亏，用于日历热力图颜色                                 |
| `getPLStats()`                                | 按日期聚合盈亏时间序列，用于看板图表                                 |
| `insertPlan(text, date, notifyAt?, notifId?)` | 插入一条交易计划，返回 id                                            |
| `updatePlan(id, ...)`                         | 更新计划内容、日期、通知信息                                         |
| `deletePlan(id)`                              | 删除一条计划                                                         |
| `getAllPlans()`                               | 获取所有计划，按提醒时间降序                                         |
| `getPlanByDate(date)`                         | 按目标日期查询最新一条计划（兼容旧逻辑）                             |

**类型导出：** `PlanRow`（计划行类型）

---

#### `notificationService.ts`

封装 `expo-notifications` 的本地通知逻辑。

**导出函数：**

| 函数                                          | 说明                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `requestNotificationPermission()`             | 请求通知权限；Android 13+ 同时创建 `trade-plan` 高优先级通知渠道              |
| `schedulePlanNotification(text, triggerDate)` | 注册一条一次性本地通知，在指定 `Date` 时间触发；返回通知 identifier（字符串） |
| `cancelNotificationById(id)`                  | 按 identifier 取消单条通知                                                    |
| `cancelPendingPlanNotifications()`            | 取消所有 title 包含"集合竞价"的待触发通知（全量清除入口）                     |

> ⚠️ 国产 Android ROM（华为/小米/OPPO/vivo）受系统电池优化限制，锁屏后本地通知可能被延迟或丢弃。需用户手动在系统设置中关闭该 App 的电池优化。

---

#### `pickAndSaveImage.ts`

图片选取与本地持久化服务。

**流程：**

1. 调用 `expo-image-picker` 打开系统相册（`mediaTypes: 'images'`）
2. 用 `expo-image-manipulator` 压缩：最大宽度 1280px，JPEG 质量 75%
3. 用 `expo-file-system` 新 OOP API（`File` / `Directory` / `Paths`）将压缩后的图片复制到 `<DocumentDirectory>/attachments/att_<timestamp>.jpg`
4. 返回持久化后的本地 URI

**存储路径：** `<DocumentDirectory>/attachments/`  
**文件命名：** `att_<Date.now()>.jpg`

---

#### `aiCoach.ts`

AI 周报生成服务，使用 OpenAI 兼容的 Chat Completions API。

**配置项（顶部常量，需手动填写）：**

```ts
export const AI_API_BASE_URL = "https://api.deepseek.com/v1"; // API 地址
export const AI_API_KEY = "YOUR_API_KEY_HERE"; // API Key
export const AI_MODEL = "deepseek-chat"; // 模型名
```

**支持的 AI 服务：**

- DeepSeek：`https://api.deepseek.com/v1` + `deepseek-chat`
- 通义千问：`https://dashscope.aliyuncs.com/compatible-mode/v1` + `qwen-plus`
- OpenAI：`https://api.openai.com/v1` + `gpt-4o`

**导出函数：**

- `generateWeeklyReport(records)` — 将本周记录拼接成 Prompt，发送给 AI，返回 Markdown 格式的分析总结文字

---

#### `ocrService.ts`

OCR 交割单智能识别服务，使用支持视觉输入的多模态 AI。

**配置项（顶部常量，需手动填写）：**

```ts
export const OCR_API_BASE_URL = "https://dashscope.aliyuncs.com/...";
export const OCR_API_KEY = "YOUR_OCR_API_KEY_HERE";
export const OCR_MODEL = "qwen-vl-plus";
```

> ⚠️ 需要支持图片输入的模型（推荐通义千问 VL 或 GPT-4o），DeepSeek 暂不支持图片输入。

**流程：**

1. 读取图片为 Base64 字符串
2. 构造含图片的多模态 Prompt，要求 AI 以 JSON 格式返回字段
3. 解析返回的 JSON，提取 `stock_code`、`entry_price`、`exit_price`、`quantity`、`direction`

**导出类型：** `OCRResult`（所有字段均为可选）

---

#### `plUtils.ts`

盈亏计算纯函数工具库，无副作用。

**导出函数：**

| 函数                                  | 说明                                                 |
| ------------------------------------- | ---------------------------------------------------- |
| `calcPL(entry, exit, qty, direction)` | 计算盈亏金额和百分比；输入不完整时返回 `null`        |
| `formatPL(pl, plPct)`                 | 格式化为带正负号的展示字符串，如 `+123.45  (+2.34%)` |

**公式：**

- 多头（long）：`pl = (exit - entry) × qty`
- 空头（short）：`pl = (entry - exit) × qty`
- 百分比：`plPct = pl / (entry × qty) × 100`

---

### screens/ 页面目录

---

#### `MainTabNavigator.tsx`

底部 Tab 导航容器，定义 5 个 Tab：

| Tab      | 页面/导航器                                   | Emoji |
| -------- | --------------------------------------------- | ----- |
| 复盘日记 | JournalStack（Home + AddRecord + EditRecord） | 📖    |
| 日历     | CalendarScreen                                | 📅    |
| 数据看板 | OverviewScreen                                | 📊    |
| 周报     | ReportScreen                                  | 🗓️    |
| 明日计划 | PlanScreen                                    | 📋    |

`JournalStack` 是一个嵌套的 `NativeStackNavigator`，包含 `HomeScreen`、`AddRecordScreen`、`EditRecordScreen` 三个页面，在 Tab 内部进行堆栈式跳转。

Tab 图标使用 Emoji 文字实现，无需额外图标库，聚焦态 opacity 为 1，非聚焦态为 0.45。

---

#### `HomeScreen.tsx`

**复盘日记列表页**，是 App 的主页面。

**功能：**

- 用 `FlatList` 展示所有复盘记录，按时间倒序排列
- 每张卡片显示：截图缩略图、股票代码、标签、笔记摘要、日期，以及盈亏徽章（绿色盈利/红色亏损）
- 点击图片缩略图可全屏预览（Modal）
- 长按卡片弹出操作菜单：跳转编辑页 / 删除（含确认弹窗）
- 右上角「＋」按钮跳转 `AddRecordScreen`
- 使用 `useFocusEffect` 每次 Tab 切换回来时刷新数据

---

#### `AddRecordScreen.tsx`

**新增复盘记录页**。

**功能：**

- 调用 `pickAndSaveImage` 选取并压缩图片（必填，无图无法保存）
- 📷 OCR 按钮：对已选图片调用 `ocrService` 自动填充股票代码、价格、数量、方向
- 输入字段：股票代码、标签（逗号分隔）、笔记、买入价、卖出价、持仓数量、方向（多/空切换）
- 实时预览盈亏金额和百分比（调用 `calcPL`）
- 保存时调用 `insertRecord` 写入数据库

---

#### `EditRecordScreen.tsx`

**编辑复盘记录页**，与 `AddRecordScreen` 结构对称。

**特点：**

- 通过 React Navigation 路由参数接收完整的 `record` 对象
- 预填所有字段（含 P/L 字段）
- 可重新选图（替换图片）
- 保存时调用 `updateRecord`
- 导出 `JournalStackParamList` 类型（被 `MainTabNavigator` 引用，定义 Stack 路由参数类型）

---

#### `CalendarScreen.tsx`

**日历热力图页**，直观展示每日交易盈亏。

**功能：**

- 使用 `react-native-calendars`，`markingType="custom"` 自定义标记样式
- 颜色规则：绿色 = 当日盈利、红色 = 当日亏损、蓝色 = 有记录但无 P/L 数据
- 点击某天：底部显示当日所有记录摘要列表
- 点击具体记录可跳转至 `EditRecordScreen`

---

#### `OverviewScreen.tsx`

**数据看板页**，汇总统计数据并提供备份功能。

**统计展示：**

- 总记录数、盈利次数、胜率
- 累计盈亏金额、最大单笔盈利/亏损
- 按标签分布饼图/列表
- 盈亏时间序列（折线趋势）

**备份功能（Header 按钮）：**

- **📥 导入**：调用 `expo-document-picker` 选择 `.zip` 文件 → 用 `jszip` 解压 → 还原 `stockjournal.db` 数据库文件（先关闭连接，再覆盖，再重连）+ 还原所有 `attachments/` 图片文件
- **📤 导出**：将数据库文件 + 所有附件图片打包成 `stockjournal_backup_<timestamp>.zip` → 调用 `expo-sharing` 分享/保存

---

#### `ReportScreen.tsx`

**AI 周报页**，自动生成本周交易行为分析。

**功能：**

- 读取本周（周一至今）所有 `records` 记录
- 将记录格式化为文本 Prompt，调用 `aiCoach.generateWeeklyReport`
- 展示 AI 返回的 Markdown 格式分析报告（支持标题/粗体等基础格式渲染）
- 显示本周记录条数、日期范围

---

#### `PlanScreen.tsx`

**交易计划 & 提醒页**，帮助用户在开盘前回顾预案。

**功能：**

- 以卡片列表展示所有已保存的交易计划，每条卡片显示提醒时间（今天/明天/具体日期 + 时分）
- 已过期的提醒卡片自动灰显
- **「新建计划」**按钮打开编辑 Modal
- **「编辑」**按钮：预填内容和提醒时间，修改后重新调度通知
- **「删除」**按钮：确认后取消该条通知并删除数据库记录
- 编辑 Modal 内置日期选择器 + 时间选择器（使用 `@react-native-community/datetimepicker`）
- 默认提醒时间：明天 09:25（集合竞价结束）
- 保存前校验：提醒时间不能早于当前时间

---

## 配置 API Key

### AI 周报（`aiCoach.ts`）

```ts
export const AI_API_BASE_URL = "https://api.deepseek.com/v1";
export const AI_API_KEY = "sk-xxxxxxxxxxxxxxxx"; // ← 替换为你的 Key
export const AI_MODEL = "deepseek-chat";
```

### OCR 识图（`ocrService.ts`）

```ts
export const OCR_API_BASE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1";
export const OCR_API_KEY = "sk-xxxxxxxxxxxxxxxx"; // ← 替换为你的 Key
export const OCR_MODEL = "qwen-vl-plus";
```

> ⚠️ **安全提醒**：API Key 当前硬编码在源码中，仅供个人本地使用。若开源或分发 App，请将 Key 移至环境变量或服务端代理。

---

## 本地开发

### 环境要求

- Node.js 18+
- Expo CLI（`npm install -g expo-cli`）
- Android Studio（Android 开发）或 Xcode（iOS 开发）

### 启动步骤

```bash
# 安装依赖
npm install

# 启动 Metro（Expo Go 扫码预览）
npm start

# 运行到 Android 设备/模拟器
npm run android

# 运行到 iOS 模拟器（仅 macOS）
npm run ios
```

### 注意事项

- `expo-notifications` 本地通知在 **Expo Go** 中可用，但部分行为（如锁屏弹窗）需要独立打包才完整生效
- 图片存储在设备本地 DocumentDirectory，不会随 Expo Go 重装自动迁移，建议使用备份功能保存数据

---

## 打包发布

### 方式一：EAS Build（推荐）

```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 构建 Android APK/AAB
eas build --platform android --profile preview   # 生成 APK
eas build --platform android --profile production # 生成 AAB（上架用）
```

### 方式二：本地 Gradle 构建

```bash
# 生成原生工程
npx expo prebuild

# 进入 android 目录构建 release APK
cd android
./gradlew assembleRelease
# 输出路径：android/app/build/outputs/apk/release/app-release.apk
```

---

## 数据存储说明

| 存储内容 | 路径                                         | 格式                           |
| -------- | -------------------------------------------- | ------------------------------ |
| 数据库   | `<DocumentDirectory>/SQLite/stockjournal.db` | SQLite 3                       |
| 图片附件 | `<DocumentDirectory>/attachments/att_*.jpg`  | JPEG，最大 1280px              |
| 备份文件 | 用户选择的分享目标                           | `.zip`（含 db + attachments/） |

所有数据仅存储在设备本地，不上传任何服务器（AI/OCR 调用除外，仅发送文本或图片内容到对应 API）。
