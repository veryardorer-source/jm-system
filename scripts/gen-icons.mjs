import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('./public/icons', { recursive: true })

// 로고를 흰 배경 정사각형으로 패딩해서 아이콘 생성
async function makeIconFromLogo(size) {
  const padding = Math.round(size * 0.12)
  const innerSize = size - padding * 2

  const logo = await sharp('./public/logo.png')
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer()

  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer()
}

for (const size of [192, 512]) {
  const buf = await makeIconFromLogo(size)
  await sharp(buf).toFile(`./public/icons/icon-${size}.png`)
  console.log(`✓ icon-${size}.png`)
}

const buf180 = await makeIconFromLogo(180)
await sharp(buf180).toFile('./public/icons/apple-touch-icon.png')
console.log('✓ apple-touch-icon.png')
