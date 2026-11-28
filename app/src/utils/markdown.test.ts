import { describe, it, expect, vi } from 'vitest'
import { renderMarkdown, renderMarkdownTail } from './markdown'
import { collectMarkdownImages, handleMarkdownContainerClick } from './markdownDom'

describe('markdown local image URLs & streaming tail', () => {
  it('renders pre-encoded Windows file:/// URLs without double-encoding %20', () => {
    const html = renderMarkdown('![shot](file:///C:/my%20folder/screen%201.png)')
    expect(html).toContain('src="file:///C:/my%20folder/screen%201.png"')
    expect(html).not.toContain('%2520')
    expect(html).toContain('data-local-path="C:/my folder/screen 1.png"')
  })

  it('sanitizes XSS while caching repeated streaming tail renders', () => {
    const first = renderMarkdownTail('Hello **world** <script>alert(1)</script>')
    const second = renderMarkdownTail('Hello **world** <script>alert(1)</script>')
    expect(first).toBe(second)
    expect(first).toContain('<b>world</b>')
    expect(first).not.toContain('<script')
  })
})

describe('markdown image rendering & safety', () => {
  it('renders https and data:image URLs as zoomable images', () => {
    const html = renderMarkdown('![chart](https://example.com/a.png)\n\n![inline](data:image/png;base64,AAAA)')
    expect(html).toContain('class="mc-zoomable-img"')
    expect(html).toContain('cursor:zoom-in')
    expect(html).toContain('src="https://example.com/a.png"')
    expect(html).toContain('src="data:image/png;base64,AAAA"')
  })

  it('allows safe local Windows image paths and file:/// image URLs with data-local-path', () => {
    const winHtml = renderMarkdown('![shot](C:\\Users\\demo\\shot 1.png)')
    expect(winHtml).not.toContain('[image blocked]')
    expect(winHtml).toContain('file:///C:/Users/demo/shot%201.png')
    expect(winHtml).toContain('data-local-path="C:\\Users\\demo\\shot 1.png"')

    const fileHtml = renderMarkdown('![shot2](file:///D:/screens/test.webp)')
    expect(fileHtml).not.toContain('[image blocked]')
    expect(fileHtml).toContain('file:///D:/screens/test.webp')
    expect(fileHtml).toContain('data-local-path="D:/screens/test.webp"')
  })

  it('blocks XSS schemes, non-image local executables, UNC paths, and parent traversals', () => {
    expect(renderMarkdown('![x](javascript:alert(1))')).toContain('[image blocked]')
    expect(renderMarkdown('![x](data:text/html;base64,PGgxPkZvbzwvaDE+)')).toContain('[image blocked]')
    expect(renderMarkdown('![x](C:\\Windows\\System32\\cmd.exe)')).toContain('[image blocked]')
    expect(renderMarkdown('![x](\\\\server\\share\\pic.png)')).toContain('[image blocked]')
    expect(renderMarkdown('![x](C:\\Users\\a\\..\\b.png)')).toContain('[image blocked]')
  })
})

describe('markdownDom image collection & click delegation', () => {
  it('collects all .mc images with prefixImages and opens at clicked image index', () => {
    const img1 = { alt: 'first', currentSrc: 'https://a/1.png', dataset: {}, getAttribute: () => 'https://a/1.png' } as unknown as HTMLImageElement
    const img2 = { alt: 'second', currentSrc: 'https://a/2.png', dataset: {}, getAttribute: () => 'https://a/2.png' } as unknown as HTMLImageElement
    const root = {
      querySelectorAll: () => [img1, img2],
    } as unknown as HTMLElement

    const { images, index } = collectMarkdownImages(root, img2, [{ name: 'att', preview: 'data:image/png;base64,X' }])
    expect(images).toHaveLength(3)
    expect(index).toBe(2)
    expect(images[0].name).toBe('att')
    expect(images[2].preview).toBe('https://a/2.png')
  })

  it('dispatches onOpenImages when clicking inside .mc img', () => {
    const img = { alt: 'snap', currentSrc: 'https://a/snap.png', dataset: {}, getAttribute: () => 'https://a/snap.png' } as unknown as HTMLImageElement
    const root = { querySelectorAll: () => [img] } as unknown as HTMLElement
    const target = {
      closest: (sel: string) => (sel === '.mc img' ? img : null),
    } as unknown as HTMLElement
    const onOpen = vi.fn()
    const stopPropagation = vi.fn()

    const handled = handleMarkdownContainerClick(
      { target, stopPropagation } as unknown as React.MouseEvent,
      root,
      onOpen
    )

    expect(handled).toBe(true)
    expect(stopPropagation).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith([{ name: 'snap', preview: 'https://a/snap.png' }], 0)
  })
})
