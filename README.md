# 黑鹰安卓远程 — Web V5.0（演示/真实隔离 + 管理功能）

## 基线与目的

本包在已确认的 **Web V4** 上继续开发，不重新设计原版 5 列设备管理界面与设备详情页。

**已实现**
- 后台登录与受保护的管理 API（延用 Render 的 `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`）
- **演示模式**：保留 Supabase 旧 `devices` 表的 RM001 / RM002 演示记录，并明确标注“模拟在线”；可独立预览 41 台虚构卡片的布局
- **真实模式**：只显示经一次性配对码注册的 `be_real_devices` 表记录。在线状态由服务端最后有效心跳时间计算（120 秒），不使用数据库中手工填的 `status`
- 修复详情页的设备状态、型号、网络、Android、电量等字段映射
- 设备搜索、在线/离线筛选、分组筛选、国家筛选、分页和 CSV 导出
- 备注/分组的数据库持久化，分组管理页、操作日志页、控制台概况、服务器诊断
- Android Agent 的服务端配对与心跳接口（**只有接口，还没有 Android APK**）
- 真实设备管理员撤销授权后，旧心跳密钥立即失效
- 原截图中的未实现功能保留外观但明确显示“未接入”；未提供密码、支付信息、键盘内容等隐蔽采集

**尚未实现**：手机 APK、安装后的主动授权 UI、实际屏幕共享/点击、文件/应用管理、真实 AI 分析、功能性 TURN/ADB 通道；不能把 UI 当作手机已连接。

## 安装流程（操作集中在一次，不要分散上传）

建议先保存/备份 GitHub 当前的 V4 commit `7c098ed`，然后按照下列顺序操作：

1. Render `remote-manager` → **Environment**：保留现有 `SUPABASE_URL`, `SUPABASE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`；**仅新增** `SUPABASE_SERVER_KEY`，值为 Supabase 项目的 **服务端 Secret Key (`sb_secret_…`) 或 Legacy `service_role` Key**。此密钥只能保存在 Render，**禁止**放入 HTML/JavaScript、GitHub、聊天、Android APK。切勿覆盖现有 publishable key。
2. Supabase → **SQL Editor**：执行本包提供的 `数据库初始化_V5.sql` **1次**。它建立 V5 的4个新表并启用 RLS，限制匿名访问，**不会删除演示设备**。旧 `users` 表如存在明文密码，请单独处理；V5 登录不读取它。
3. 解压 ZIP，把 `public/`、`server.js`、`package.json`、`README.md` 更新到 GitHub 仓库 `remote-manager` 的根目录；`数据库初始化_V5.sql` 可留本地备份，不必上传到公开仓库（不含密钥）。文件夹结构应保持 `public/index.html`, `public/login.html`, `public/app.js`。
4. Render → Deploys：确认自动部署最新 GitHub commit（如果 Auto-Deploy 未启动，使用 Manual Deploy → **Deploy latest commit**）。启动日志会看到 `Black Eagle remote manager V5 started`。
5. 登录网页：默认是 **演示设备**（仍能看到 RM001 / RM002）；切到 **真实设备** 时，在未有任何授权手机客户端前应显示 **0 台**。点设备→“备注/分组”测试保存；左侧“操作日志”检查记录。

**如果还没有配置服务端密钥/执行 SQL：** 演示设备列表在旧 Supabase 环境下通常仍可只读显示，但备注、分组、审计、配对及真实模式会显示需要配置的错误信息。不要把错误的零台设备解释为已经正常接入。

## Android 客户端接入协议（供下一阶段研发，不代表 APK 已交付）

1. 管理员已登录后台，在“真实设备”模式点击“授权配对”生成8位**一次性**配对码（10分钟有效）。
2. 用户在安卓设备上主动打开未来的客户端并输入配对码，客户端 `POST /api/agent/enroll`：

   ```json
   {"code":"12345678","device_name":"Company phone","model":"Android model","android_version":"Android 15","battery":80,"network":"WiFi"}
   ```

3. 成功后返回设备 ID 和一次性显示的 `agent_token`（必须保存在手机客户端安全存储中，**绝不上传到日志**）。
4. 客户端每40秒向 `POST /api/agent/heartbeat` 发送 JSON `{ "battery": 80, "network": "WiFi" }`，HTTP Authorization: `Bearer bea_<64位小写十六进制随机值>`。
5. 后台真实模式在最近120秒内收到认证心跳才显示在线。管理员可以从设备详情点击“撤销授权”。

必须使用 HTTPS，不能在未获得设备持有人明确同意前采集屏幕等个人数据。企业设备也不等于默认允许未经知情的监视。

## 架构与安全提示

- SQL 中 `be_real_devices.api_token_hash` 保存的是 HMAC 摘要而不是客户端明文 token；配对码也只保留 HMAC 摘要。
- Supabase 服务密钥只在 Render 的 Node 进程中使用，浏览器通过受登录保护的 API 访问。
- 服务端管理员认证是 Render 单管理员模式；多用户角色权限管理尚未实现，不能把“用户设置”的页面等同于多账号权限系统。
- 如需跨周维护，应定期查看依赖安全更新和 Render 服务状态。
- 单机 Render Free 在未访问时会休眠，心跳可能受免费计划约束；真实多设备运行需要评估稳定性。
