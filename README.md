# 丛动体育官网

移动端优先的丛动体育（CONGDONG SPORTS）官方网站。线上地址：https://marinelj.github.io/congdong/

已选定的视觉方向：C「夜场霓虹」的配色和排版，加上 A「赛场蓝」的首屏视频。视频自动播放、一直循环：每次播完淡出回到夜景球场照片，停 10 秒，再从头播放；页面上没有播放按钮和进度条。安卓微信不允许网页自动播放视频，所以在微信里改用 JSMpeg 把同一段视频的 MPEG-1 版本画在画布上，看起来一样；iOS 微信先用视频本身，被拒绝时同样换成画布。

## 开发

Node 装在项目内的 `.tools/node`，npm 缓存放在 `.cache/npm`，镜像源是 npmmirror（见 `.npmrc`）。

```sh
source scripts/env.sh   # 在项目根目录执行，把项目内的 Node 加到 PATH
npm install
npm run dev             # 开发预览 http://127.0.0.1:4321/  （对比页仍在 /design/）
npm run build           # 正式构建，输出到 dist/
npm run preview         # 预览构建结果 http://127.0.0.1:4322/
```

浏览器检查脚本用 DevTools 协议驱动无头 Chrome，不需要额外依赖：

```sh
node scripts/browser-check.mjs video http://127.0.0.1:4321/          # 首屏视频：播完回到夜景照片停 10 秒再重播、没有任何按钮；
                                                                     # 另测滚出屏幕时暂停、横竖屏切换、带 # 的地址从顶部打开、
                                                                     # 自动播放被拒、微信（iOS 桥接、安卓画布、视频被拒、桥接无响应）、
                                                                     # 减少动态效果、慢网速
node scripts/browser-check.mjs ui    http://127.0.0.1:4321/          # 菜单、咨询面板、场地筛选、导航高亮、底部咨询条
node scripts/browser-check.mjs page  http://127.0.0.1:4322/ 390 844  # 控制台错误、图片、锚点、横向溢出、过小的触控目标
node scripts/browser-check.mjs shots http://127.0.0.1:4322/ 844 390 out/land   # 逐屏截图，和访客看到的一样
node scripts/browser-check.mjs shot  http://127.0.0.1:4322/ 390 844 out.png [--full] [--reduced-motion] [--wait=13000]
```

## 部署到 GitHub Pages

运行 `npm run deploy`（即 `bash scripts/deploy-pages.sh`），它会：

1. 确认没有未提交的改动（线上版本总对应一个提交；确实要发布未提交的改动时加 `ALLOW_DIRTY=1`）；
2. 构建网站；
3. 把 `dist/` 推送到公开仓库 `marinelj/congdong` 的 `main` 分支。

推送后大约一分钟，https://marinelj.github.io/congdong/ 就会更新。

源码仓库保持私有：GitHub 免费账号只能从公开仓库发布 Pages，所以公开仓库里只有构建好的文件。它的 Pages 设置为「Deploy from a branch：`main` / 根目录」。不要在公开仓库里直接改文件，下次发布会被覆盖。

## 部署到 Jupyter 服务器

运行 `bash scripts/deploy-jupyter.sh`，它会依次：

1. 拉取最新代码；
2. 如果服务器上没有合适版本的 Node，把它装到 `.tools/node`；
3. 构建网站；
4. 用 `scripts/serve.py --prod` 在后台托管 `dist/`。

默认监听 `127.0.0.1:8000`，通过 `<Jupyter 地址>/proxy/8000/` 访问。

完整步骤，以及可以直接交给 ChatGPT 的提示词，见 `docs/deploy-jupyter-prompt.md`。

## 目录

| 路径 | 内容 |
|---|---|
| `index.html` | 首页 |
| `src/main.js` | 交互：导航菜单和当前栏目高亮、场地筛选、咨询面板、复制咨询模板、栏目渐显、首屏视频循环（微信里用画布） |
| `src/vendor/` | JSMpeg 播放器（微信里在画布上播放首屏视频），原样取自上游，附 MIT 授权 |
| `src/styles/` | `base.css`（色彩变量、公共组件和动效）、`sections.css`（各区块样式）、`fonts.css` |
| `media/` | 网页使用的图片、视频（`.mp4`，以及微信画布用的 MPEG-1 版本 `.m2t`）、logo、合作伙伴 logo、图标和字体，由 `scripts/build-media.sh` 生成 |
| `design/` | 视觉方向 A/B/C 对比页，留作记录，不参与构建 |
| `assets-src/photos/` | 从品牌素材文件夹复制来的原图，按编号命名；编号对照见 `source-manifest.tsv` |
| `assets-src/video/` | 怀柔宣传片原片（105 MB，不提交到 git） |
| `scripts/` | 媒体生成、logo 抠图（`extract_logo.py`、`extract_mark.py`）、预览服务器、浏览器检查、两种部署 |

## 内容原则

- 事实信息（地址、场地、房型、餐单、价格、电话、合作伙伴）只采用丛动提供的海报、价格表和餐单。合作伙伴 logo 取自官方合作伙伴海报（#043）。
- 价格只写「380 元/人/天起」，全站只放一个联系人：贺老师。
- 不使用广告法禁止的绝对化用语，例如「最顶级」。
- 升学规划写成发展目标，不承诺升学、录取或运动员等级认证结果（广告法第二十四条）。

## 字体授权

- 正文用设备自带字体（苹方、鸿蒙、MiSans、微软雅黑等）。
- 英文大标题用 Anton，本地托管，SIL Open Font License 1.1，授权文件在 `media/fonts/` 下。
- 对比页另外用到得意黑、Barlow Condensed、Outfit，也都是 OFL 授权。

## 第三方代码

- JSMpeg（Dominic Szablewski，MIT 授权），取自 github.com/phoboslab/jsmpeg 的 924acfb 提交，未作修改，只在文件开头加了一行授权说明。授权全文见 `src/vendor/jsmpeg-LICENSE`。
