# 丛动体育官网

移动端优先的丛动体育（CONGDONG SPORTS）官方网站。线上地址：https://marinelj.github.io/congdong/

另有英文版 https://marinelj.github.io/congdong/en/ 和日文版 https://marinelj.github.io/congdong/jp/ 。三个页面共用样式、脚本和图片视频，各自是一份完整的 HTML；页眉和页脚有语言切换。改动内容时三个页面要一起改。

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

## 发布到 GitHub Pages

推送到 `main` 后，GitHub Actions（`.github/workflows/pages.yml`）会自动构建并发布，一两分钟后 https://marinelj.github.io/congdong/ 就会更新。也可以在仓库的 Actions 页面手动运行「Deploy to GitHub Pages」。仓库的 Pages 设置为「Source：GitHub Actions」。

这个仓库是公开的。原始照片和海报（包括完整价格表）不放在这里，而是放在私有素材库 `marinelj/assets` 的 `congdong/` 文件夹里，见下文「重新生成图片和视频」。

## 部署到 Jupyter 服务器

运行 `bash scripts/deploy-jupyter.sh`，它会依次：

1. 拉取最新代码；
2. 如果服务器上没有合适版本的 Node，把它装到 `.tools/node`；
3. 构建网站；
4. 用 `scripts/serve.py --prod` 在后台托管 `dist/`。

默认监听 `127.0.0.1:8000`，通过 `<Jupyter 地址>/proxy/8000/` 访问。

完整步骤，以及可以直接交给 ChatGPT 的提示词，见 `docs/deploy-jupyter-prompt.md`。

## 重新生成图片和视频

`media/` 里的文件由 `scripts/build-media.sh` 从原图生成，平时不需要重新生成。原图在私有素材库里：

1. 把 `marinelj/assets` 克隆到这个仓库旁边（`../assets`），或者用环境变量 `CONGDONG_ASSETS` 指向它的 `congdong/` 文件夹；
2. 怀柔宣传片原片有 105 MB，超过 GitHub 的单文件上限，没有放进素材库：从品牌素材文件夹复制到 `congdong/video/huairou-film.mp4`；
3. 运行 `bash scripts/build-media.sh`。

## 目录

| 路径 | 内容 |
|---|---|
| `index.html` | 首页（中文） |
| `en/index.html`、`jp/index.html` | 英文版、日文版，结构和首页相同，图片等路径多一级 `../` |
| `src/strings.js` | 脚本里用到的文字（场地筛选的读屏提示、咨询模板、复制结果），按页面语言取用 |
| `src/main.js` | 交互：导航菜单和当前栏目高亮、场地筛选、咨询面板、复制咨询模板、栏目渐显、首屏视频循环（微信里用画布） |
| `src/vendor/` | JSMpeg 播放器（微信里在画布上播放首屏视频），原样取自上游，附 MIT 授权 |
| `src/styles/` | `base.css`（色彩变量、公共组件和动效）、`sections.css`（各区块样式）、`fonts.css` |
| `media/` | 网页使用的图片、视频（`.mp4`，以及微信画布用的 MPEG-1 版本 `.m2t`）、logo、合作伙伴 logo、图标和字体，由 `scripts/build-media.sh` 生成 |
| `design/` | 视觉方向 A/B/C 对比页，留作记录，不参与构建 |
| `scripts/` | 媒体生成、logo 抠图（`extract_logo.py`、`extract_mark.py`）、预览服务器、浏览器检查、部署到 Jupyter 服务器 |
| `.github/workflows/pages.yml` | 推送到 `main` 时自动构建并发布到 GitHub Pages |

## 内容原则

- 事实信息（地址、场地、房型、餐单、价格、电话、合作伙伴）只采用丛动提供的海报、价格表和餐单。合作伙伴 logo 取自官方合作伙伴海报（#043）。
- 价格只写「380 元/人/天起」，全站只放一个联系人：贺老师。
- 不使用广告法禁止的绝对化用语，例如「最顶级」。
- 升学规划写成发展目标，不承诺升学、录取或运动员等级认证结果（广告法第二十四条）。
- 英文版、日文版按中文版翻译，不增加中文版没有的事实。价格同样只写起价：英文写「From ¥380 per person per day」并注明 RMB；日文写「380元〜」并注明人民元，不用「¥」，以免被看成日元。电话加国际区号 +86。
- 位置示意图是海报上的原图，地名是中文；英文版、日文版在图片说明和替代文字里给出了对应地名。

## 字体授权

- 正文用设备自带字体（苹方、鸿蒙、MiSans、微软雅黑等）；英文版用系统西文字体，日文版优先用日文字体（Hiragino、Noto Sans JP、Yu Gothic 等），汉字按日文字形显示。
- 英文大标题用 Anton，本地托管，SIL Open Font License 1.1，授权文件在 `media/fonts/` 下。
- 对比页另外用到得意黑、Barlow Condensed、Outfit，也都是 OFL 授权。

## 第三方代码

- JSMpeg（Dominic Szablewski，MIT 授权），取自 github.com/phoboslab/jsmpeg 的 924acfb 提交，未作修改，只在文件开头加了一行授权说明。授权全文见 `src/vendor/jsmpeg-LICENSE`。
