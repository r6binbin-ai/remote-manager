# 黑鹰安卓远程 — Web V4

基于用户确认的原版后台预览制作。前端视觉、登录、设备列表、搜索、状态筛选、设备详情入口已接入。尚未部署到用户的 Render 项目。

## Render 配置

保留 SUPABASE_URL（项目根 URL，不含 /rest/v1/）、SUPABASE_KEY（Publishable Key）。

另新增：
- ADMIN_USERNAME：后台登录账号（不填写时默认 admin）
- ADMIN_PASSWORD：自定至少12位的强密码（不要使用之前测试的 admin/123456）
- SESSION_SECRET：至少32个随机字符的会话签名密钥

Build Command: npm install
Start Command: npm start

在线部署要求 GitHub 仓库根目录中有 server.js、package.json、public/。

登录后展示数据库里真实存在的设备（当前只有2台）。界面顶部“布局预览”可切换41台模拟设备，仅用于检查5列卡片布局。

注意：截图中的部分功能只是外观入口。远程控制必须后续通过公司设备上的明确授权机制实现。密码读取、按键捕获、支付信息采集等功能不提供实现。

安全提示：当前用户此前创建的 Supabase `public.users` 和 `public.devices` 表显示 RLS disabled；请在正式上线前启用 RLS / 限制数据 API，不要通过公开 API 暴露用户凭据。登录使用 Render 环境变量，不使用原 users 表密码。
