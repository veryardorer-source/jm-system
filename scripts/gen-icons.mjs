import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'fs'

// SVG로 아이콘 생성 (JM 텍스트, 초록 배경)
function makeSvg(size) {
  const r = Math.round(size * 0.18)
  const fontSize = Math.round(size * 0.42)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="#16a34a"/>
  <text x="${size/2}" y="${size/2 + fontSize*0.35}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">${'JM'}</text>
</svg>`
}

mkdirSync('./public/icons', { recursive: true })

for (const size of [192, 512]) {
  await sharp(Buffer.from(makeSvg(size)))
    .png()
    .toFile(`./public/icons/icon-${size}.png`)
  console.log(`✓ icon-${size}.png`)
}

await sharp(Buffer.from(makeSvg(180)))
  .png()
  .toFile('./public/icons/apple-touch-icon.png')
console.log('✓ apple-touch-icon.png')
