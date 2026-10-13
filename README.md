# 黑鹰安卓远程 Web V5.2 — 真实设备详情与管理

**升级基线：** Web V5.1（GitHub 最新提交 `05648f3`）+ Android Agent V1.1，保持原版控制台布局与演示/真实模式隔离。

## 新增可用功能

- 真实手机详情在服务器端单独查询（`GET /api/devices/:id/overview`），展示注册时间、设备型号、Android、电量、网络、最后有效心跳、在线/离线、分组与备注。
- 设备名称、分组、备注保存到 Supabase（`PATCH /api/devices/:id/manage`）；名称存入现有 `be_real_devices.device_name`，分组/备注存入 `be_device_meta`，无需新 SQL。
- 单设备操作记录：从已有 `be_audit_log` 按设备 ID 读取最近20项（注册、管理修改、授权撤销等）；心跳不逐条保存日志。
- 真实设备详情与列表在页面可见时每20秒自动刷新；手动刷新按钮也实际可用。
- 原有设备撤销按钮保留；撤销将使手机现有凭证无效，是实际操作，勿在正常测试时随意点击。
- 旧的手机注册、授权、心跳及断线恢复接口完全保留，**不需要重新编译或安装 APK**。
- 原先只有占位提示的屏幕共享、远程控制、AI分析等依旧明确标示为未接入，不承诺可用。隐蔽密码/支付/通信采集功能不提供。

## 部署（一次性更新）

1. 确认 GitHub 仓库 `r6binbin-ai/remote-manager` 目前连接 Render 服务。
2. 解压本包，把根目录的 `public/`、`server.js`、`package.json`、`README.md` 拖到 GitHub 仓库**根目录**并提交。上传时 `public/` 保持文件夹结构。
3. Render 自动部署。确认最新提交状态 `Live` 后，打开 `https://remote-manager.onrender.com` 并 Ctrl+F5。
4. 切到「真实设备」，打开 Pixel 3 → 详情右侧「设备信息」。修改名称/备注/分组并保存；点击「操作记录」验证审计记录。不要测试「撤销授权」，除非确实要断开设备。

## 环境变量和数据库

**不新增环境变量，不需要运行 SQL，不要修改 Android 客户端**。继续保留 Render 上 `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`SESSION_SECRET`、`SUPABASE_URL`、`SUPABASE_KEY`、`SUPABASE_SERVER_KEY`、`BE_ENROLL_KEY`。

后端采用已有的 `be_real_devices`、`be_device_meta`、`be_audit_log` 表；读演示设备优先使用服务端管理密钥，避免直接依赖匿名读取。

## 已完成的检验范围

- 服务器和浏览器脚本 Node 语法检查通过。
- 在本地 Chromium 使用**模拟的 Pixel 3 数据**验证：真实模式 → 设备详情 → 名称/分组/备注提交 → 顶部显示更新 → 操作记录切换 → 未接入模块仍显示说明；没有 JavaScript 异常。
- **尚未**使用你的在线 Render / Supabase 凭证做端到端测试，也没有直接更新你的线上仓库。部署后须在 Pixel 3 的真实记录上复测。

## 安全注意

- 客户端安装凭证嵌入私有 APK，不可认为能抵挡逆向提取。只用于自有设备的受控分发，不要公开上传 APK。
- 以前建立的 `public.users` / `public.devices` 如果仍对匿名用户开放，需要单独审查和关闭权限；本次部署不擅自修改旧表，以免中断现有功能。
- 永远不要向聊天发送 Render / Supabase 密钥，或者提交到公开 GitHub。
