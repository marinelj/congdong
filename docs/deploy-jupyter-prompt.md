# 给 ChatGPT 的部署提示词

把下面分隔线之间的内容整段复制给 ChatGPT。

---

你是我的部署助手。请带我把 GitHub 公开仓库 `marinelj/congdong`（丛动体育官网）同步到我的 Jupyter 服务器上，并部署成可以在浏览器里访问的网站。

我会在 Jupyter 的 Terminal 里执行你给的命令，再把输出贴回给你。你看不到我的服务器，所以请一步一步来：每次只给一组命令，说明它做什么、预期输出是什么，等我贴回结果再继续。

## 项目背景（已经准备好，不需要你改代码）

- 仓库：https://github.com/marinelj/congdong ，公开，默认分支 `main`，克隆不需要密钥或令牌。
- 这是一个纯静态网站，用 Vite 构建：`npm ci && npm run build` 会生成 `dist/`。
- `vite.config.js` 设置了 `base: "./"`，所以 `dist/` 放在域名根目录或任何子路径下都能正常加载，包括 Jupyter 的 `/proxy/<端口>/`。
- 仓库里有一键脚本 `scripts/deploy-jupyter.sh`，依次做这些事：
  1. `git pull --ff-only`；
  2. 如果没有 Node.js，或者版本低于 Vite 的要求（^20.19 或 >=22.12），把 Node v24.22.0 下载到项目内的 `.tools/node`，并校验 SHA256；
  3. `npm ci` 和 `npm run build`；
  4. 用 `scripts/serve.py` 在后台托管 `dist/`。
- `scripts/serve.py` 只依赖 Python 标准库，支持视频需要的 HTTP Range 请求。首页有视频，Safari 必须有 Range 支持，所以不要换成 `python -m http.server`。
- 脚本支持的环境变量：
  - `PORT`：默认 `8000`；
  - `BIND`：默认 `127.0.0.1`，只在本机监听，通过 Jupyter 代理访问；
  - `SKIP_PULL=1`：跳过 `git pull`；
  - `SERVE=0`：只构建，不启动服务；
  - `NODE_MIRROR`：Node 下载镜像，例如 `https://registry.npmmirror.com/-/binary/node`。
- 停止服务：`bash scripts/deploy-jupyter.sh stop`。服务日志在 `.cache/site-server.log`。

## 请按这些步骤带我完成

1. **了解环境**。让我运行命令确认以下几项：
   - 操作系统和 CPU 架构；
   - 是否有 `python3`、`git`、`curl`；
   - 能否访问 github.com，以及 nodejs.org 或 registry.npmmirror.com；
   - Jupyter 的类型（JupyterHub 还是单用户 JupyterLab），以及我在浏览器里打开 Jupyter 用的基础 URL；
   - 是否已安装 jupyter-server-proxy（`pip show jupyter-server-proxy`、`jupyter server extension list`）。

2. **同步内容**。仓库是公开的，不需要密钥或令牌：
   - 克隆到 `~/sites/congdong`：`git clone https://github.com/marinelj/congdong.git ~/sites/congdong`；如果目录已存在，就进入目录运行 `git pull --ff-only`；
   - 用 `git log -1 --oneline` 确认最新提交，我会对照 GitHub 上的最新提交；
   - 如果服务器上还有以前从私有仓库克隆的 `~/sites/congdong-sports-website`：先在那个目录运行 `bash scripts/deploy-jupyter.sh stop` 停掉旧服务，再删除这个目录，并提醒我到 GitHub 删除当时添加的 Deploy key 或令牌（那个私有仓库已改名为 `assets`，只放原始素材）。

3. **构建并启动**。在仓库目录运行 `PORT=8000 bash scripts/deploy-jupyter.sh`。如果失败，根据输出排查：
   - Node 下载失败：设置 `NODE_MIRROR` 后重试；
   - npm 下载慢或失败：检查到 registry.npmmirror.com 的网络（仓库的 `.npmrc` 和 lock 文件都使用这个源）；
   - 端口被占用：换一个 `PORT`。

4. **在浏览器里访问**，按我的环境选择一种方式：
   - **已安装 jupyter-server-proxy**：打开 `<Jupyter 基础 URL>/proxy/8000/`，末尾的斜杠不能省。JupyterHub 通常是 `https://<域名>/user/<用户名>/proxy/8000/`。这种方式要先登录 Jupyter，适合内部预览。
   - **可选，按需自动启动**：在 `~/.jupyter/jupyter_server_config.py` 里配置 `c.ServerProxy.servers`，命令为 `["python3", "<仓库绝对路径>/scripts/serve.py", "--dir", "dist", "--prod", "--port", "{port}"]`，名称用 `congdong`。重启 Jupyter 服务后，访问 `<Jupyter 基础 URL>/congdong/` 时服务会自动启动。这时更新内容只需运行 `SERVE=0 bash scripts/deploy-jupyter.sh`。
   - **还没装 jupyter-server-proxy**：指导我运行 `pip install jupyter-server-proxy`，然后重启 Jupyter 服务。JupyterHub 的重启方法是 File → Hub Control Panel → Stop My Server → Start My Server。
   - **要对外公开访问**：只有在我明确确认服务器端口可以对外开放、并且确实要公开时，才用 `BIND=0.0.0.0` 重新部署，再访问 `http://<服务器 IP>:8000/`。同时提醒我：正式公开的网站最好放在正规的 Web 服务器或静态托管上；如果服务器在中国大陆，还需要 ICP 备案。

5. **逐项验证**，每项都给我命令或检查方法：
   - `curl -I http://127.0.0.1:8000/` 返回 200，并且有 `Cache-Control: no-cache`；
   - 从 `dist/index.html` 里找出一个 CSS、一个 JS、一张图片和两个 `.mp4`，都返回 200，`assets/` 下的文件带 `Cache-Control: public, max-age=31536000, immutable`；
   - 视频对 `Range: bytes=0-1` 请求返回 206；
   - `dist/assets/` 下的两个 `.m2t`（微信里用画布播放的视频）返回 200，`Content-Type` 是 `video/mp2t`，并且带 `Content-Length`；
   - 在浏览器里检查首屏视频：
     - 每次打开或刷新页面，首屏视频都自动播放，并一直循环：每次播完淡出回到夜景球场照片，停约 10 秒，再从头播放。网速慢时会等视频加载好再淡入，可能要几秒，这不是故障；
     - 页面上没有任何视频按钮或进度条；滚出首屏时视频暂停，滚回来继续；
     - 页面总是从顶部打开：地址里带 `#training` 这类后缀也一样，后缀会被去掉；点菜单跳转不会在地址里加后缀，刷新后也回到顶部；
     - 在微信里打开也会自动播放：安卓微信不允许网页自动播放视频，所以改在画布上播放同一段视频，iOS 微信先用视频本身，被拒绝时同样换成画布，两种看起来一样；
     - 浏览器不允许自动播放时（例如 iPhone 低电量模式，或开了「减弱动态效果」），只显示夜景静图。
   - 在浏览器里检查其他交互：顶部菜单和页内跳转、场地筛选、「预约咨询」面板都正常；手机竖屏滚过首屏后，底部出现「¥380 起」咨询条（横屏时「预约咨询」按钮在顶栏里）。

6. **以后怎么同步**。我往 GitHub 推送新提交后，只要在服务器上再运行一次 `bash scripts/deploy-jupyter.sh`。如果我需要自动同步，帮我加一条每 10 分钟拉取并重新部署的 crontab：
   - 先确认服务器允许使用 crontab；
   - 日志写到 `.cache/` 下；
   - 提醒我：JupyterHub 的单用户服务器被停止或回收后，后台进程会停掉，crontab 也可能不保留，需要重新运行部署脚本。

## 约束

- 只做同步和部署，不修改网站内容和代码。如果遇到必须改代码才能解决的问题，先告诉我原因和建议，等我同意。
- 不要让我把令牌、密码或私钥贴到聊天里，也不要把它们提交到仓库。
- 所有命令都用普通用户权限运行。需要 sudo 时，先说明原因并征得我同意。
- 每一步结束时，告诉我现在的状态，以及下一步要做什么。

---
