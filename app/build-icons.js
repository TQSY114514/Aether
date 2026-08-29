const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const ROOT = path.resolve(__dirname, '..')
const ASSETS_DIR = path.join(ROOT, 'assets')
const RESOURCES_DIR = path.join(__dirname, 'resources')
const ICONS = ['logo', 'logo-dark', 'logo-mark']
const SIZES = [16, 24, 32, 48, 64, 128, 256]

async function generateIco(svgPath, outIcoPath) {
  const images = []

  for (const size of SIZES) {
    if (size === 256) {
      const pngBuf = await sharp(svgPath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer()
      images.push({ size, data: pngBuf, isPng: true })
    } else {
      const { data, info } = await sharp(svgPath)
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
      // BITMAPINFOHEADER (40 bytes)
      dib.writeUInt32LE(40, 0)
      dib.writeInt32LE(width, 4)
      dib.writeInt32LE(height * 2, 8) // double height for ICO (XOR + AND mask)
      dib.writeUInt16LE(1, 12)
      dib.writeUInt16LE(32, 14) // 32 bpp
      dib.writeUInt32LE(0, 16) // BI_RGB
      dib.writeUInt32LE(xorSize + andSize, 20)
      dib.writeInt32LE(0, 24)
      dib.writeInt32LE(0, 28)
      dib.writeUInt32LE(0, 32)
      dib.writeUInt32LE(0, 36)

      // XOR mask: bottom-up BGRA
      let dibOffset = 40
      for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
          const srcOffset = (y * width + x) * 4
          const r = data[srcOffset]
          const g = data[srcOffset + 1]
          const b = data[srcOffset + 2]
          const a = data[srcOffset + 3]
          dib[dibOffset] = b
          dib[dibOffset + 1] = g
          dib[dibOffset + 2] = r
          dib[dibOffset + 3] = a
          dibOffset += 4
        }
      }

      // AND mask: all 0 for 32bpp alpha icons
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
  // ICONDIR header
  icoBuf.writeUInt16LE(0, 0) // Reserved
  icoBuf.writeUInt16LE(1, 2) // Type 1 = ICO
  icoBuf.writeUInt16LE(images.length, 4) // Count

  // ICONDIRENTRY array
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const offset = 6 + i * 16
    icoBuf.writeUInt8(entry.size === 256 ? 0 : entry.size, offset)
    icoBuf.writeUInt8(entry.size === 256 ? 0 : entry.size, offset + 1)
    icoBuf.writeUInt8(0, offset + 2) // Color count (0 for >=8bpp)
    icoBuf.writeUInt8(0, offset + 3) // Reserved
    icoBuf.writeUInt16LE(1, offset + 4) // Planes
    icoBuf.writeUInt16LE(32, offset + 6) // Bit count
    icoBuf.writeUInt32LE(entry.length, offset + 8) // Image bytes
    icoBuf.writeUInt32LE(entry.offset, offset + 12) // Image offset
  }

  // Copy image payloads
  for (const entry of entries) {
    entry.data.copy(icoBuf, entry.offset)
  }

  if (!fs.existsSync(path.dirname(outIcoPath))) {
    fs.mkdirSync(path.dirname(outIcoPath), { recursive: true })
  }
  fs.writeFileSync(outIcoPath, icoBuf)
}

async function main() {
  if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true })
  }

  for (const name of ICONS) {
    const src = path.join(ASSETS_DIR, `${name}.svg`)
    if (!fs.existsSync(src)) {
      console.log(`[skip] ${src} not found`)
      continue
    }

    for (const size of SIZES) {
      const out = path.join(ASSETS_DIR, `${name}-${size}.png`)
      console.log(`[${name}] ${size}px -> ${path.relative(ROOT, out)}`)
      await sharp(src)
        .resize(size, size, { fit: 'contain', background: name === 'logo-dark' ? '#0a0a0f' : { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(out)
    }
  }

  // Generate app/resources/icon.png and icon-dark.png (256x256)
  const logoSvg = path.join(ASSETS_DIR, 'logo.svg')
  const logoDarkSvg = path.join(ASSETS_DIR, 'logo-dark.svg')

  if (fs.existsSync(logoSvg)) {
    const iconPng = path.join(RESOURCES_DIR, 'icon.png')
    await sharp(logoSvg)
      .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(iconPng)
    console.log(`[resource] 256px -> ${path.relative(ROOT, iconPng)}`)

    const iconIco = path.join(RESOURCES_DIR, 'icon.ico')
    await generateIco(logoSvg, iconIco)
    console.log(`[resource] multi-res ICO -> ${path.relative(ROOT, iconIco)}`)
  }

  if (fs.existsSync(logoDarkSvg)) {
    const iconDarkPng = path.join(RESOURCES_DIR, 'icon-dark.png')
    await sharp(logoDarkSvg)
      .resize(256, 256, { fit: 'contain', background: '#0a0a0f' })
      .png()
      .toFile(iconDarkPng)
    console.log(`[resource] 256px -> ${path.relative(ROOT, iconDarkPng)}`)
  }

  // On Windows dev, patch electron.exe PE binary icon using rcedit and register Start Menu shortcut with AppUserModelId
  if (process.platform === 'win32') {
    const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe')
    const rcedit = path.join(__dirname, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe')
    const iconIco = path.join(RESOURCES_DIR, 'icon.ico')
    const { spawnSync } = require('child_process')

    if (fs.existsSync(electronExe) && fs.existsSync(rcedit) && fs.existsSync(iconIco)) {
      try {
        const res = spawnSync(rcedit, [electronExe, '--set-icon', iconIco], { stdio: 'pipe' })
        if (res.status === 0) {
          console.log(`[patch] electron.exe PE icon updated with Aether logo`)
        }
      } catch (e) {
        console.log(`[patch] electron.exe patch skipped:`, e.message)
      }
    }

    // Register Start Menu shortcut with System.AppUserModel.ID = "com.aetherai.app"
    // so Windows Taskbar directly maps dev instances to Aether icon instead of Electron fallback.
    try {
      const programs = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      const lnkPath = path.join(programs, 'Aether.lnk')
      const targetPath = path.join(ROOT, 'start.bat')
      const psCode = `
$source = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public class DevShortcutHelper {
    [ComImport]
    [Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLink {}
    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cchMaxPath, out IntPtr pfd, uint fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cchMaxName);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cchMaxPath);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cchMaxPath);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cchIconPath, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
        void Resolve(IntPtr hwnd, uint fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }
    [ComImport]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    internal interface IPropertyStore {
        void GetCount(out uint cProps);
        void GetAt(uint iProp, out PROPERTYKEY pkey);
        void GetValue(ref PROPERTYKEY key, [Out] PROPVARIANT pv);
        void SetValue(ref PROPERTYKEY key, [In] PROPVARIANT pv);
        void Commit();
    }
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    internal struct PROPERTYKEY { public Guid fmtid; public uint pid; }
    [StructLayout(LayoutKind.Explicit)]
    internal class PROPVARIANT : IDisposable {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pwszVal;
        public static PROPVARIANT FromString(string val) {
            PROPVARIANT pv = new PROPVARIANT();
            pv.vt = 31;
            pv.pwszVal = Marshal.StringToCoTaskMemUni(val);
            return pv;
        }
        public void Dispose() { if (pwszVal != IntPtr.Zero) { Marshal.FreeCoTaskMem(pwszVal); pwszVal = IntPtr.Zero; } }
    }
    public static void CreateShortcut(string shortcutPath, string appId, string targetPath, string iconPath, string workingDir) {
        if (File.Exists(shortcutPath)) File.Delete(shortcutPath);
        IShellLinkW link = (IShellLinkW)new ShellLink();
        if (!string.IsNullOrEmpty(targetPath)) link.SetPath(targetPath);
        if (!string.IsNullOrEmpty(iconPath)) link.SetIconLocation(iconPath, 0);
        if (!string.IsNullOrEmpty(workingDir)) link.SetWorkingDirectory(workingDir);
        IPropertyStore store = (IPropertyStore)link;
        PROPERTYKEY key = new PROPERTYKEY { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 };
        using (PROPVARIANT pv = PROPVARIANT.FromString(appId)) { store.SetValue(ref key, pv); }
        store.Commit();
        ((IPersistFile)link).Save(shortcutPath, true);
    }
}
"@
Add-Type -TypeDefinition $source
[DevShortcutHelper]::CreateShortcut('${lnkPath.replace(/'/g, "''")}', 'com.aetherai.app', '${targetPath.replace(/'/g, "''")}', '${iconIco.replace(/'/g, "''")}', '${ROOT.replace(/'/g, "''")}')
`
      spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCode], { stdio: 'pipe' })
      console.log(`[shortcut] Start Menu shortcut registered with AppUserModelID: com.aetherai.app`)
    } catch (e) {
      console.log(`[shortcut] shortcut creation skipped:`, e.message)
    }
  }

  console.log('Done — all icons and resources successfully generated.')
}

main().catch(err => {
  console.error('build-icons error:', err)
  process.exit(1)
})

