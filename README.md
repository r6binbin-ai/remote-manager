# 黑鹰安卓远程 Web V5.1 — Pixel 3 真机接入

在已部署的 Web V5.0 基础上直接更新。外观不变，2 台演示记录不删除，不需要再执行 SQL。

## 功能
- 手机端首次打开弹出明确授权窗口，点击「同意并连接」才注册。
- 手机没有配对码，也不需要管理员审核。
- 使用 `BE_ENROLL_KEY`（>=32字符）限制谁能从私有 APK 注册；注册后服务器下发每台设备独立令牌。
- 每40秒认证心跳，120秒无心跳标记离线。手机端可主动断开并撤销绑定、后台也可撤销。
- 继续使用既有数据库 `be_real_devices`、`be_audit_log`；无需修改 SQL 或 Supabase。

## 部署（先服务器后 APK）
1. 在 Render / Environment 新增 `BE_ENROLL_KEY`（建议64位随机十六进制），不要改其他环境变量。
2. 上传本 ZIP 内 `server.js`、`package.json`、`README.md`、`public` 到现有 GitHub 仓库根目录并 Commit；等 Render Live。
3. Android Studio 安装 Agent 覆盖包后，在仅本机的 `AgentConfig.kt` 中将 `INSTALL_KEY` 设置为同一个 `BE_ENROLL_KEY`，编译 APK。
4. 安装后点击系统「打开」，在首次授权页面点击「同意并连接」。
5. 网站切换「真实设备」并刷新，确认手机心跳；断开网络大约120秒后转离线。

## 已有 API
- `POST /api/agent/enroll`：首次授权注册，需 `X-BE-Install-Key` 私有安装密钥。
- `POST /api/agent/heartbeat`：设备令牌认证后更新电量、网络、最后心跳。
- `POST /api/agent/disconnect`：手机端主动断开并撤销该设备凭证，设备立即从真实列表移除。
- `POST /api/devices/:id/revoke`：管理员撤销客户端令牌。

## 安全边界
- 私有安装凭证嵌入APK存在被提取的可能，适用于**受控分发的试验版**，不应公开分发。若泄露要在 Render 更换 `BE_ENROLL_KEY`，重新构建新 APK。安装密钥不能访问管理 API。
- 安装授权无法由 APK 在 Android 系统安装程序内弹出；需安装完成点击系统「打开」后显示。拒绝授权不会注册。
- 不获取通讯录、短信、键盘、支付信息、摄像头或屏幕，不执行远程控制。
- Android 15+ 对 `dataSync` 类型前台服务有运行时长限制；长期全天在线需要后续引入符合 Android 平台约束的连接方案。本版先在 Pixel 3 验证。
