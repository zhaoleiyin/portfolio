# Hero 素材清单（从 Figma 导出后按此放置）

命名规则：全小写 + 连字符（kebab-case）。位图一律 **PNG 透明底 @2x**（大图可用 WebP），线稿一律 **SVG**。

## 页面层级（从后到前）

```
1. 环境光背景        ← 已用代码实现，无需素材
2. float-back/      ← 漂浮元素：在娃娃机和文字"后面"
3. machine/ + products/  ← 娃娃机线稿 + 机器里的产品
4. stickers/        ← 贴在固定位置的标签贴纸（在娃娃机之上）
5. 文字 / 导航       ← 用代码实现，无需素材
6. float-front/     ← 漂浮元素：最前层（会飘过文字前面）
```

## machine/ — 娃娃机（SVG，按可动部件拆开导出）

| 文件名 | 内容 | 备注 |
|---|---|---|
| `machine-body.svg` | 整机线稿 | **不含**抓夹、摇杆杆身、垂直线缆（线缆我用代码画，才能伸缩） |
| `claw-body.svg` | 抓夹主体（顶部圆柱 + 关节结构） | 抓夹要做开合+移动动画，必须拆开 |
| `claw-finger-left.svg` | 左爪指 | 单独导出，围绕关节点旋转做"张开/夹紧" |
| `claw-finger-right.svg` | 右爪指 | 同上 |
| `claw-finger-mid.svg` | 中间爪针（如果线稿里有） | 没有就不用 |
| `joystick-stick.svg` | 摇杆杆身 + 顶部球 | 底座留在 machine-body 里；杆身单独导出才能左右摆动 |

> Figma 里导出 SVG：选中该部件的 Group → Export → SVG。
> 爪指的旋转锚点我会在代码里定位，你只要保证每个部件单独一个文件即可。

## products/ — 机器里的产品（PNG @2x 透明底）

每个产品单独导出，命名 `product-01.png`、`product-02.png` … 按从左到右顺序编号。
（目前稿子里看到：手机 app 截图 ×2、乐高积木、大理石板、汉堡包装盒、金属方块等）

## float-back/ — 漂浮层·后（PNG @2x 透明底）

在娃娃机和标题"后面"飘的元素，命名 `back-01-chain.png` 这种格式（编号 + 简短名）。
例如：紫色链条、齿轮、橙色波浪线……你想放后面的都丢这里。

## float-front/ — 漂浮层·前（PNG @2x 透明底）

飘在最前面（会经过文字之前）的元素，命名 `front-01-blob.png` 格式。
例如：蓝色笑脸毛球……

## stickers/ — 固定位置的标签贴纸（PNG @2x 透明底）

| 文件名 | 内容 |
|---|---|
| `sticker-design.png` | 粉色 design |
| `sticker-thinking.png` | 橙色 thinking |
| `sticker-graphic.png` | 蓝色 graphic |
| `sticker-inspirational.png` | 黄色 inspirational |

## fonts/ — 字体

标题字体 + 等宽字体的字体文件（`.woff2` 最佳，`.ttf/.otf` 也行）。
如果用的是 Google Fonts，不用放文件，**告诉我字体名**即可。
