# 黑鹰安卓远程 — Web V5.3（手机端系统授权屏幕共享）

继承已经验证的 Web V5.2 和 Android Agent V1.1：设备注册、心跳、名称/分组/备注、操作日志和演示/真实设备隔离不变。

## 新功能

- Android Pixel 3 用户在客户端独立启动 MediaProjection；Android 系统授权是必需的，后台**无法远程启动**屏幕共享。
- 仅对持有单台设备令牌的 Agent 接收 JPEG 帧；仅对已登录管理员提供该设备预览。
- 仅在 Node 进程内存中保留最近1张 JPG，8秒后失效，手机端停止时立即删除。不保存在 Supabase/Render 磁盘。
- 手机端持续显示“正在共享”通知，并支持立即停止。
- 共享帧约每1.6秒上传1张，宽/高最大640像素；用于验证可用性，**不是高帧率 WebRTC**。
- 左侧第1屏显示授权共享；其他两个占位屏幕和未实现按钮继续明确禁用。

## 安全限制

远程控制、后台远程开启、音频、持久录屏、敏感数据抓取均未实现。APK 下载/安装阶段无法获得 MediaProjection 授权，只有用户打开 App 后才能同意 Android 系统提示。

**顺序：先升级服务器，再用 Android Studio 生成 V1.2 APK。**

将本文件夹根目录的 `public/`、`server.js`、`package.json`、`README.md` 上传 GitHub 仓库根目录，Render 自动部署。
保留 Render 的 `SUPABASE_URL`、`SUPABASE_KEY`、`SUPABASE_SERVER_KEY`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`SESSION_SECRET`、`BE_ENROLL_KEY` 不变；**不需要运行 SQL**。

部署后看 `/api/health` 的 `version` 为 `5.3.0`。该接口仅显示配置布尔值，不泄漏密钥。

注意：已有 APK 内的 BE_ENROLL_KEY 是试验环境分发凭据，并非适合大规模公开分发的安全认证方法。真实商业推广前应部署设备级安装授权/硬件证明、独立服务隔离和密钥轮换。

## 验证

1. 登录现有 Web V5.3，切到真实设备，确认 Google Pixel 3 仍在且心跳正常。
2. Pixel 3 更新安装同一项目编译的 V1.2 APK，手机端打开客户端并点击“开始屏幕共享”。
3. Android 显示系统共享/录制屏幕确认弹窗，同意后后台设备详情左侧第1块黑屏出现低帧率实时画面。
4. 点击手机端“停止屏幕共享”或下拉通知栏点“停止共享”。网页几秒内恢复黑屏。
5. 在右侧“操作记录”核对 `screen_share_started`、`screen_share_stopped`（网络中断时日志可能延迟，画面依靠8秒过期自动消失）。

手机屏幕可能包含私密信息，只在设备所有者明确同意时开启，共享期间保持可见并能随时停止。
