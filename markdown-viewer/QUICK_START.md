# Markdown Viewer - 快速上线指南

## 📋 上线前准备清单

### ✅ 已完成项目
- [x] 扩展核心功能开发完成
- [x] manifest.json配置完整
- [x] 图标文件创建（16/48/128px）
- [x] 隐私政策文档（PRIVACY.md）
- [x] 详细上线文档（RELEASE.md）
- [x] 商店信息准备（STORE_LISTING.md）
- [x] 安装指南（INSTALL.md）
- [x] 项目说明（README.md）

### ⏳ 待完成项目
- [ ] 创建截图（至少1张，建议3-5张）
- [ ] 注册Chrome Web Store开发者账号
- [ ] 创建发布ZIP包
- [ ] 填写商店信息
- [ ] 提交审核

---

## 🚀 快速上线步骤

### 第一步：创建截图

1. **准备测试文件**

   创建 `demo.md` 文件用于截图：
   ```markdown
   # Markdown Viewer Demo

   ## Beautiful Rendering

   This extension provides **GitHub-style** rendering for your *Markdown* files.

   ### Code Example

   ```javascript
   function greet(name) {
     console.log(`Hello, ${name}!`);
   }
   ```

   ### Features List

   - ✅ Instant rendering
   - ✅ View toggle
   - ✅ Quick copy
   - ✅ Responsive design

   ### Data Table

   | Feature | Status | Priority |
   |---------|--------|----------|
   | Rendering | ✅ Done | High |
   | Copy | ✅ Done | Medium |
   | Themes | 🔄 Planned | Low |
   ```

2. **在Chrome中打开并截图**
   - 在Chrome中打开 `demo.md`
   - 按 `Ctrl+Shift+P`（Mac: `Cmd+Shift+P`）
   - 选择"Capture full size screenshot"
   - 保存为 `screenshot-1.png`

3. **创建更多截图**（可选但推荐）
   - 点击"查看原文"按钮，截图保存为 `screenshot-2.png`
   - 展示工具栏功能，保存为 `screenshot-3.png`

### 第二步：注册开发者账号

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 使用Google账号登录
3. 支付一次性注册费用（$5 USD）
4. 完成开发者信息填写

### 第三步：创建发布包

在项目目录运行以下命令：

```bash
# Windows (PowerShell)
Compress-Archive -Path manifest.json,content.js,marked.min.js,styles.css,icon16.png,icon48.png,icon128.png -DestinationPath markdown-viewer-v1.0.0.zip

# 或使用Git Bash
cd /d/project/google-extension/markdown-viewer
zip markdown-viewer-v1.0.0.zip manifest.json content.js marked.min.js styles.css icon*.png
```

**重要**: 不要包含以下文件：
- `.md` 文档文件
- `.svg` 源文件
- `.git` 目录
- 测试文件

### 第四步：上传到Chrome Web Store

1. **登录开发者控制台**
   - 访问 https://chrome.google.com/webstore/devconsole
   - 点击"新增项目"

2. **上传ZIP文件**
   - 选择 `markdown-viewer-v1.0.0.zip`
   - 等待上传完成

3. **填写商店信息**

   **基本信息**：
   - 名称: `Markdown Viewer`
   - 简短描述: 复制 `STORE_LISTING.md` 中的简短描述
   - 详细描述: 复制 `STORE_LISTING.md` 中的详细描述
   - 类别: `Productivity`
   - 语言: `English`, `中文(简体)`

   **图形资源**：
   - 上传截图（至少1张）
   - 可选：上传宣传图片（440x280）

   **隐私设置**：
   - 选择"不收集用户数据"
   - 提供隐私政策链接（可使用GitHub链接）
   - 说明权限用途（参考 `STORE_LISTING.md`）

   **分发设置**：
   - 可见性: `公开`
   - 地区: `所有地区`

4. **提交审核**
   - 检查所有信息
   - 点击"提交审核"
   - 等待1-3个工作日

---

## 📸 截图创建详细指南

### 方法一：使用Chrome内置工具

1. 打开Chrome DevTools（F12）
2. 按 `Ctrl+Shift+P`（Mac: `Cmd+Shift+P`）
3. 输入 "screenshot"
4. 选择 "Capture full size screenshot"

### 方法二：使用截图工具

推荐工具：
- **Windows**: Snipping Tool, Snagit
- **Mac**: Command+Shift+4
- **跨平台**: Lightshot, ShareX

### 截图要求

- **尺寸**: 1280x800 或 640x400
- **格式**: PNG（推荐）或JPG
- **质量**: 高清，无模糊
- **内容**: 展示核心功能，界面清晰

### 截图建议内容

**截图1 - 主界面**（必需）：
- 展示完整的渲染效果
- 包含标题、段落、代码块
- 显示工具栏

**截图2 - 原文视图**（推荐）：
- 点击"查看原文"后的界面
- 展示Markdown源码

**截图3 - 功能演示**（推荐）：
- 展示表格、列表等复杂元素
- 突出显示渲染质量

---

## 🔍 审核注意事项

### 容易通过审核的要点

✅ **权限说明清晰**
- 在描述中明确说明每个权限的用途
- 参考 `STORE_LISTING.md` 中的权限说明

✅ **隐私政策完整**
- 提供 `PRIVACY.md` 的在线链接
- 明确声明不收集数据

✅ **功能描述准确**
- 描述与实际功能一致
- 不夸大宣传

✅ **截图质量高**
- 清晰展示功能
- 界面美观

### 可能被拒绝的原因

❌ **权限过多或说明不清**
- 解决方案：只请求必要权限，详细说明用途

❌ **隐私政策缺失**
- 解决方案：提供 `PRIVACY.md` 链接

❌ **功能不完整**
- 解决方案：确保所有描述的功能都能正常工作

❌ **截图缺失或质量差**
- 解决方案：提供高质量截图

---

## 📊 发布后运营

### 第一周

- [ ] 监控安装量和评分
- [ ] 回复用户评论
- [ ] 修复紧急bug（如有）
- [ ] 在GitHub添加Chrome Web Store徽章

### 第一个月

- [ ] 收集用户反馈
- [ ] 规划下一版本功能
- [ ] 撰写技术博客介绍扩展
- [ ] 在社交媒体推广

### 持续运营

- [ ] 定期更新（每1-2个月）
- [ ] 及时处理用户问题
- [ ] 关注竞品动态
- [ ] 优化性能和用户体验

---

## 🎯 成功指标

### 短期目标（1个月）
- 安装量: 100+
- 评分: 4.0+
- 评论: 10+

### 中期目标（3个月）
- 安装量: 1,000+
- 评分: 4.5+
- 活跃用户: 500+

### 长期目标（1年）
- 安装量: 10,000+
- 评分: 4.7+
- 活跃用户: 5,000+

---

## 📞 支持资源

### 官方文档
- [Chrome扩展开发文档](https://developer.chrome.com/docs/extensions/)
- [Chrome Web Store发布指南](https://developer.chrome.com/docs/webstore/publish/)
- [Manifest V3迁移指南](https://developer.chrome.com/docs/extensions/mv3/intro/)

### 社区资源
- [Chrome扩展开发者论坛](https://groups.google.com/a/chromium.org/g/chromium-extensions)
- [Stack Overflow - Chrome扩展标签](https://stackoverflow.com/questions/tagged/google-chrome-extension)

### 项目文档
- `README.md` - 项目概述
- `INSTALL.md` - 安装指南
- `RELEASE.md` - 完整上线文档
- `STORE_LISTING.md` - 商店信息
- `PRIVACY.md` - 隐私政策

---

## ✅ 最终检查

在提交前，请确认：

- [ ] 扩展在Chrome中正常工作
- [ ] 所有文件都已准备好
- [ ] 截图已创建
- [ ] ZIP包已生成
- [ ] 开发者账号已注册
- [ ] 商店信息已准备
- [ ] 隐私政策已提供
- [ ] 已阅读审核指南

**准备好了？点击提交审核！** 🚀

---

**预计上线时间**: 提交后1-3个工作日
**文档版本**: 1.0.0
**创建日期**: 2026-03-17
