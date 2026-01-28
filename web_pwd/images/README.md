# 图标文件说明

上线 Chrome Web Store 前，请在此文件夹中添加以下图标文件：

## 必需图标

| 文件名 | 尺寸 | 用途 |
|--------|------|------|
| icon16.png | 16x16 | 浏览器工具栏图标 |
| icon32.png | 32x32 | Windows 任务栏 |
| icon48.png | 48x48 | 扩展管理页面 |
| icon128.png | 128x128 | Chrome Web Store 商店页 |

## 图标设计建议

1. **格式**：PNG，支持透明背景
2. **风格**：简洁、现代、易识别
3. **颜色**：建议使用蓝色系（与 Google 风格一致）
4. **主题**：可以使用锁、钥匙、盾牌等密码管理相关元素

## 设计参考

- 一个简单的锁图标
- 字母 "P" 或 "W" 的设计变体
- 盾牌 + 钥匙的组合

## 快速生成方法

可以使用以下工具快速生成图标：
- [Figma](https://figma.com) - 免费设计工具
- [Canva](https://canva.com) - 在线设计平台
- [IconKitchen](https://icon.kitchen) - 图标生成器
- [DALL-E / Midjourney](https://openai.com) - AI 生成图标

## 示例代���生成

如需临时测试，可以用 SVG 转换为 PNG：

```html
<svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="24" fill="#1a73e8"/>
  <path d="M64 30 C45 30 30 45 30 60 V70 H25 V105 H103 V70 H98 V60 C98 45 83 30 64 30 Z M64 40 C77 40 88 51 88 60 V70 H40 V60 C40 51 51 40 64 40 Z M64 80 C69 80 73 84 73 89 C73 92 71 95 68 96 V100 H60 V96 C57 95 55 92 55 89 C55 84 59 80 64 80 Z" fill="white"/>
</svg>
```
