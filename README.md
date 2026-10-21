# 弦记 Stringnote

一个面向吉他弹唱的浏览器练习工具。输入想弹的歌查找曲谱来源，或者选择本机音频，生成可以试听、修改的和弦草稿，再配合指法图练习。

项目采用 React、TypeScript 和 Vite，构建产物是静态网站，可以部署到 GitHub Pages。当前没有接入用户账户、云端私人谱库或收费 API。

## 本地运行

需要 Node.js 22.12 或更新版本；建议使用 Node.js 24，与 GitHub Actions 一致。

```bash
npm ci
npm run dev
```

打开终端输出的本地地址。开发服务默认只监听本机。

```bash
npm test          # 运行信号处理、音乐语义等自动化测试
npm run check    # TypeScript 检查
npm run build    # 类型检查并生成 dist/
npm run preview  # 查看实际构建产物
```

具体执行结果、浏览器测试和已知限制记录在 [docs/VALIDATION.md](docs/VALIDATION.md)。测试指令存在不代表已经通过；以该记录中的实际结果为准。

## 第一版如何使用

- **找谱**：输入歌曲和歌手，通过 iTunes 公开接口确认歌曲版本，再使用站外曲谱搜索。站内练习曲和站外搜索分别展示；跳转搜索引擎或原站不表示弦记已获得、校验或收录原曲谱。
- **先试一首**：内置《晚风练习曲》等原创练习与《小星星》《欢乐颂》的自行编配练习版。音频在本机合成，没有使用商业歌曲录音或商业录音的伴奏。
- **音频分析**：选择 MP3/WAV 文件，分析声音中的和声，输出带时间位置的和弦草稿。文件留在当前浏览器；分析不会把音频提交到 GitHub。
- **修改和练习**：查看指法、改和弦、调整谱面或变调夹设置、播放和分段练习。修改谱面调性不等于原音频已经移调。
- **保存和导出**：将练习成果保存在本机，并使用页面提供的导出功能备份。需要把音频重新关联时，选择原始本机文件。

移动端的格式解码、播放策略和性能因浏览器、设备而异。建议先用现代 Chrome 或 Edge 验证自己的录音；手机测试应覆盖一首完整音频，而不只看界面。

## 识别能力与数据来源

第一版使用真实的数字信号处理流程：音频解码、频谱与音高类别特征、和弦模板匹配、时间平滑及片段合并。耗时分析在浏览器 Worker 中执行。这是**实验性和弦识别**，不是已训练的神经网络模型，也不代表完整扒谱能力。

复杂乐队混音、强打击乐、现场噪声、转调和复杂和弦都可能导致识别错误。应边听边修改；低确定性或无和弦片段保留相应提示，不能用固定的通用和弦进行替代真实识别结果。

自动化测试中的合成声音用于验证程序行为，**不能证明真实流行歌曲的识别准确率**。当前尚无足够的真实流行歌人工参考标注与准确率评估，因此不承诺任意歌曲都能生成可直接演奏的原曲谱。

内置曲目用途：

| 曲目 | 来源与范围 |
| --- | --- |
| 晚风练习曲 | 本项目原创和弦练习及程序合成声音 |
| 小星星 | 传统旋律的自行编配练习；不包含现代商业录音或受保护的改编歌词 |
| 欢乐颂 | 贝多芬旋律的自行编配练习；不包含现代商业录音 |

外部曲谱的链接、作者和授权属于原来源。找到图片谱并不使其自动变为可编辑、可移调的结构化谱。用户导入的内容默认只在本机使用；发布或分享前应分别确认词、曲、录音和编配的可使用范围。

## 本机数据

练习记录和谱面仅保存在当前浏览器的本机存储中，音频文件不会进入 GitHub 仓库。不同浏览器、设备或不同部署地址之间不会自动同步；清除站点数据可能删除本机记录，隐私模式也可能不保留数据。

重要修改请导出备份。本机存储可用性、空间和原始音频的重新关联行为以实际浏览器为准。GitHub Pages 不提供私人用户数据库，也不保护被打包进浏览器 JavaScript 的 API 密钥。

查找歌曲版本时，搜索关键词发送至 Apple 的公开曲库接口；站外搜索在点击后打开搜索服务。音频识别、编辑和保存均在本机完成。具体实现选择和后续工作见 [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)。

## 部署到 GitHub Pages

当前仓库已准备好 [Pages 工作流](.github/workflows/pages.yml)，但仅有配置文件不表示已上线。需要实际的 GitHub 仓库、推送权限以及仓库中的 Pages 设置。

1. 在 GitHub 创建或选择仓库，将本项目的源文件、`package.json`、`package-lock.json` 与 `.github/workflows/pages.yml` 提交到 `main` 分支。不要提交 `node_modules/`、本机音频、秘密或私人谱库。
2. 打开仓库 **Settings → Pages → Build and deployment**，将 **Source** 设为 **GitHub Actions**。
3. 推送到 `main`，或在 **Actions → Test, build and deploy Pages → Run workflow** 手动运行。
4. 工作流依次执行安装、测试、类型检查、构建，成功后才发布 `dist/`。
5. 在成功的部署任务或仓库 Pages 设置中取得实际网址，并执行线上验收。

普通项目站通常使用 `https://用户名.github.io/仓库名/`；名为 `用户名.github.io` 的用户站使用根路径。构建配置依据 `GITHUB_REPOSITORY` 处理站点基础路径，代码中的资源应使用 Vite 提供的部署基础路径，避免写死 `/assets/...`。

Actions 的构建任务只有读取源代码权限；发布任务才获得 Pages 写入和 OIDC 身份权限。工作流不在构建时执行任何用户上传的音频，也不把 Actions 当作实时分析服务器。发布中的工作流不会被新提交中断。

GitHub Pages 托管静态文件；它不能运行 Python/FastAPI、服务端数据库或需要隐藏密钥的动态接口。浏览器只能直接读取允许相应跨域请求的外部来源。

## 后续扩展

音频分析保留独立接口，后续可在验证后更换浏览器模型，或增加独立托管的 Python 分析服务。前端仍然可以放在 GitHub Pages。更多谱源、歌词对齐、完整六线谱和跨设备同步按 [项目计划](PROJECT_PLAN.md) 的验证结果推进。

## 部署依据

- [GitHub Pages：自定义 Actions 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Pages 是什么](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-node](https://github.com/actions/setup-node)
