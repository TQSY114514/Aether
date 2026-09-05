import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { OFFICIAL_RECIPES, listRecipes, getRecipe } from '../electron/recipes/registry.js'

describe('Curated Recipes System (P1-07)', () => {
  let tmpDir = null

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-recipes-test-'))
  })

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('provides 8 curated official recipes out of the box', () => {
    expect(OFFICIAL_RECIPES.length).toBe(8)
    const ids = OFFICIAL_RECIPES.map(r => r.id)
    expect(ids).toContain('fix-failing-tests')
    expect(ids).toContain('git-commit-craft')
    expect(ids).toContain('pr-review-audit')
    expect(ids).toContain('doc-sync-translate')
    expect(ids).toContain('dependency-upgrade-check')
    expect(ids).toContain('security-vulnerability-scan')
    expect(ids).toContain('refactor-extract-component')
    expect(ids).toContain('generate-unit-tests')
  })

  it('can retrieve official recipes by id', () => {
    const fixTest = getRecipe('fix-failing-tests')
    expect(fixTest).toBeDefined()
    expect(fixTest.title).toContain('修测试')
    expect(fixTest.suggestedMode).toBe('auto')
    expect(fixTest.permissions).toContain('run_command')
  })

  it('loads project-level custom recipes from .aether/recipes/*.json', () => {
    const recipesDir = path.join(tmpDir, '.aether', 'recipes')
    fs.mkdirSync(recipesDir, { recursive: true })

    const customRecipe = {
      id: 'custom-deploy-staging',
      category: 'ops',
      title: '部署到预发环境 (Deploy Staging)',
      description: '自动化构建并发布到 Staging',
      prompt: '执行 npm run build 然后运行发布脚本',
      suggestedMode: 'ask',
      permissions: ['run_command']
    }
    fs.writeFileSync(path.join(recipesDir, 'staging.json'), JSON.stringify(customRecipe), 'utf8')

    const list = listRecipes(tmpDir)
    expect(list.length).toBe(9)
    const custom = getRecipe('custom-deploy-staging', tmpDir)
    expect(custom).toBeDefined()
    expect(custom.custom).toBe(true)
    expect(custom.title).toBe('部署到预发环境 (Deploy Staging)')
  })

  it('custom recipe overrides official recipe when id matches', () => {
    const recipesDir = path.join(tmpDir, '.aether', 'recipes')
    fs.mkdirSync(recipesDir, { recursive: true })

    const overrideRecipe = {
      id: 'fix-failing-tests',
      category: 'testing',
      title: '团队定制修测试 (Custom Fix Tests)',
      description: '使用定制的 mvn test 运行并修复',
      prompt: '执行 mvn test 并修复所有失败用例',
      suggestedMode: 'auto',
      permissions: ['run_command']
    }
    fs.writeFileSync(path.join(recipesDir, 'fix-tests.json'), JSON.stringify(overrideRecipe), 'utf8')

    const list = listRecipes(tmpDir)
    expect(list.length).toBe(8)
    const overridden = getRecipe('fix-failing-tests', tmpDir)
    expect(overridden.title).toBe('团队定制修测试 (Custom Fix Tests)')
    expect(overridden.custom).toBe(true)
  })
})
