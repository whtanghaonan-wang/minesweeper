// 一次性脚本：把 icon.svg 栅格化为 PWA 所需的 PNG（产物提交到仓库）
import sharp from "sharp";

const src = "public/icons/icon.svg";
const targets = [
  [192, "public/icons/icon-192.png"],
  [512, "public/icons/icon-512.png"],
  [180, "public/icons/apple-touch-icon.png"],
];

for (const [size, out] of targets) {
  await sharp(src, { density: 300 }).resize(size, size).png().toFile(out);
  console.log("✓", out);
}
