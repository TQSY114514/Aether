const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..', '..')
const ASSETS_DIR = path.join(ROOT, 'assets')
const RESOURCES_DIR = path.join(ROOT, 'app', 'resources')
const BRAIN_DIR = 'C:/Users/zhrls/.gemini/antigravity/brain/36d64745-8042-49b4-a6a2-fe5e63de4a06'

const HERO_SRC = path.join(BRAIN_DIR, 'readme_hero_banner_1789272543441.jpg')
const LOGO_SRC = path.join(BRAIN_DIR, 'refined_emblem_logo_1789268725359.jpg')

const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function generateTransparentLogo() {
  const { data, info } = await sharp(LOGO_SRC).raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height
  const out = Buffer.alloc(w * h * 4)
  const cx = 512, cy = 500
  const badgeRadius = 436

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const srcIdx = idx * 3
      const dstIdx = idx * 4
      const r = data[srcIdx], g = data[srcIdx + 1], b = data[srcIdx + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b

      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      out[dstIdx] = r
      out[dstIdx + 1] = g
      out[dstIdx + 2] = b

      if (dist <= badgeRadius) {
        // Inside the badge: always 100% opaque white / black
        out[dstIdx + 3] = 255
      } else {
        // Outside the badge: transparent background, keep dark stars and orbit
        if (lum > 240) {
          out[dstIdx + 3] = 0
        } else if (lum < 160) {
          out[dstIdx + 3] = 255
        } else {
          const a = Math.round(((240 - lum) / 80) * 255)
          out[dstIdx + 3] = Math.max(0, Math.min(255, a))
        }
      }
    }
  }

  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()
}

// Build multi-res Windows ICO
async function generateIco(pngBuffer, outIcoPath) {
  const images = []

  for (const size of SIZES) {
    if (size === 256) {
      const pngBuf = await sharp(pngBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      images.push({ size, data: pngBuf, isPng: true })
    } else {
      const { data, info } = await sharp(pngBuffer)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const width = info.width
      const height = info.height
      const xorSize = width * height * 4
      const andRowSize = Math.ceil(width / 32) * 4
      const andSize = andRowSize * height
      const totalSize = 40 + xorSize + andSize

      const dib = Buffer.alloc(totalSize)
      dib.writeUInt32LE(40, 0)
      dib.writeInt32LE(width, 4)
      dib.writeInt32LE(height * 2, 8)
      dib.writeUInt16LE(1, 12)
      dib.writeUInt16LE(32, 14)
      dib.writeUInt32LE(0, 16)
      dib.writeUInt32LE(xorSize + andSize, 20)
      dib.writeInt32LE(0, 24)
      dib.writeInt32LE(0, 28)
      dib.writeUInt32LE(0, 32)
      dib.writeUInt32LE(0, 36)

      let dibOffset = 40
      for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
          const srcOffset = (y * width + x) * 4
          dib[dibOffset] = data[srcOffset + 2]     // B
          dib[dibOffset + 1] = data[srcOffset + 1] // G
          dib[dibOffset + 2] = data[srcOffset]     // R
          dib[dibOffset + 3] = data[srcOffset + 3] // A
          dibOffset += 4
        }
      }

      dib.fill(0, dibOffset, dibOffset + andSize)
      images.push({ size, data: dib, isPng: false })
    }
  }

  const headerSize = 6 + images.length * 16
  let currentOffset = headerSize
  const entries = []
  for (const img of images) {
    entries.push({
      size: img.size,
      offset: currentOffset,
      length: img.data.length,
      data: img.data,
    })
    currentOffset += img.data.length
  }

  const icoBuf = Buffer.alloc(currentOffset)
  icoBuf.writeUInt16LE(0, 0)
  icoBuf.writeUInt16LE(1, 2)
  icoBuf.writeUInt16LE(images.length, 4)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const offset = 6 + i * 16
    icoBuf.writeUInt8(entry.size === 256 ? 0 : entry.size, offset)
    icoBuf.writeUInt8(entry.size === 256 ? 0 : entry.size, offset + 1)
    icoBuf.writeUInt8(0, offset + 2)
    icoBuf.writeUInt8(0, offset + 3)
    icoBuf.writeUInt16LE(1, offset + 4)
    icoBuf.writeUInt16LE(32, offset + 6)
    icoBuf.writeUInt32LE(entry.length, offset + 8)
    icoBuf.writeUInt32LE(entry.offset, offset + 12)
  }

  for (const entry of entries) {
    entry.data.copy(icoBuf, entry.offset)
  }

  fs.writeFileSync(outIcoPath, icoBuf)
}

async function updateReadmeFiles() {
  const readmes = fs.readdirSync(ROOT).filter(f => f.startsWith('README') && f.endsWith('.md'))
  let updatedCount = 0
  for (const file of readmes) {
    const fullPath = path.join(ROOT, file)
    let content = fs.readFileSync(fullPath, 'utf8')
    if (content.includes('./assets/readme-hero.svg')) {
      content = content.replace('./assets/readme-hero.svg', './assets/readme-hero.png')
      fs.writeFileSync(fullPath, content, 'utf8')
      updatedCount++
    }
  }
  console.log(`Updated ${updatedCount} README file(s) to reference readme-hero.png`)
}

async function main() {
  console.log('1. Generating README hero banner...')
  const heroOut = path.join(ASSETS_DIR, 'readme-hero.png')
  await sharp(HERO_SRC).png({ quality: 95 }).toFile(heroOut)
  console.log(` -> ${heroOut}`)

  console.log('2. Generating master transparent logo...')
  const transparentLogoBuf = await generateTransparentLogo()
  const masterLogoPng = path.join(ASSETS_DIR, 'logo.png')
  fs.writeFileSync(masterLogoPng, transparentLogoBuf)
  console.log(` -> ${masterLogoPng}`)

  console.log('3. Generating logo sizes...')
  for (const size of SIZES) {
    const out = path.join(ASSETS_DIR, `logo-${size}.png`)
    await sharp(transparentLogoBuf)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(out)
  }

  console.log('4. Generating dark mode logo (with soft cyan-indigo back glow on dark squircle)...')
  for (const size of SIZES) {
    const innerSize = Math.round(size * 0.86)
    const innerEmblem = await sharp(transparentLogoBuf)
      .resize(innerSize, innerSize, { fit: 'contain' })
      .toBuffer()

    const rx = Math.round(size * 0.2)
    const cx = Math.round(size / 2)
    const cy = Math.round(size * 0.49)
    const haloR = Math.round(size * 0.43)
    const strokeR = Math.round(size * 0.38)

    const glowSvg = Buffer.from(
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs>` +
      `<radialGradient id="g" cx="50%" cy="50%" r="50%">` +
      `<stop offset="70%" stop-color="#38bdf8" stop-opacity="0.38"/>` +
      `<stop offset="90%" stop-color="#818cf8" stop-opacity="0.18"/>` +
      `<stop offset="100%" stop-color="#090d16" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>` +
      `<rect width="${size}" height="${size}" rx="${rx}" fill="#090d16"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${haloR}" fill="url(#g)"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${strokeR}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.5"/>` +
      `</svg>`
    )

    const darkBuf = await sharp(glowSvg)
      .composite([{ input: innerEmblem, gravity: 'center' }])
      .png()
      .toBuffer()

    const darkOut = path.join(ASSETS_DIR, `logo-dark-${size}.png`)
    fs.writeFileSync(darkOut, darkBuf)

    if (size === 256) {
      fs.writeFileSync(path.join(ASSETS_DIR, 'logo-dark.png'), darkBuf)
      fs.writeFileSync(path.join(RESOURCES_DIR, 'icon-dark.png'), darkBuf)
    }
  }

  console.log('5. Generating app/resources/icon.png and icon.ico...')
  const icon256 = path.join(RESOURCES_DIR, 'icon.png')
  await sharp(transparentLogoBuf)
    .resize(256, 256, { fit: 'contain' })
    .png()
    .toFile(icon256)

  const iconIco = path.join(RESOURCES_DIR, 'icon.ico')
  await generateIco(transparentLogoBuf, iconIco)
  console.log(` -> ${iconIco}`)

  console.log('6. Updating README references...')
  await updateReadmeFiles()

  // Clean up test files if any
  for (const f of ['test_transparent.png', 'test_transparent_v2.png', 'test_dark.png', 'test_dark_v2.png']) {
    const fp = path.join(ASSETS_DIR, f)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
  }

  console.log('All brand assets and README references successfully updated!')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
