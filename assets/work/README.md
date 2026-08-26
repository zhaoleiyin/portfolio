# Work 素材放置规则

每个案例一个文件夹，文件夹名 = 案例的 slug（英文短横线命名，比如 `rise-streak`）。

```
assets/work/
├── rise-streak/
│   └── hero.jpg   （或 hero.mp4）← 右侧大图/视频，放这一个文件即可
├── 下一个案例/
│   └── hero.jpg
```

**图片**：`hero.jpg`（或 `.png`），建议横向、至少 1600px 宽，会铺满整个右侧面板（`object-fit: cover`，太小会糊）。

**视频**：`hero.mp4`，静音自动循环播放（无声、无控件），建议 <8MB、竖屏或横屏都行，会按面板比例裁切填满。

放好文件后，在 `index.html` 的 `#work` 区块里加一个新的 `.work-case`（复制 Rise Streak 那一份改文字和路径就行），我这边会把动画和过渡跟上。
