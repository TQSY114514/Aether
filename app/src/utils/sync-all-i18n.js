/**
 * sync-all-i18n.js
 * Automatically populates missing translation keys across all 13 supported languages.
 */

const fs = require('fs');
const path = require('path');

const BASE_PATH = path.join(__dirname, 'i18n-en-base.json');
const TRANS_PATH = path.join(__dirname, 'i18n-translations.json');

const base = JSON.parse(fs.readFileSync(BASE_PATH, 'utf-8'));
const transData = JSON.parse(fs.readFileSync(TRANS_PATH, 'utf-8'));

// New keys to ensure in base and zh-CN
const newKeys = {
  "chat.undo_failed": { en: "Undo failed: {0}", zh: "撤销失败：{0}" },
  "chat.unknown_error": { en: "Unknown error", zh: "未知错误" },
  "chat.auto_route_failed": { en: "Auto-routing failed", zh: "自动路由失败" },
  "chat.generation_stopped_hint": { en: "Generation stopped · Press Continue to resume", zh: "生成已停止 · 按 Continue 继续" },
  "chat.remove_sensitive_files": { en: "Remove sensitive files", zh: "一键移除敏感文件" },
  "recipe.title": { en: "Recipe", zh: "配方" },
  "security.title": { en: "Security Panel", zh: "安全面板" },
  "security.subtitle": { en: "Aether is secure by default — hard security policies are always active. Recent agent audit and policy controls are below.", zh: "Aether 默认安全——以下加固始终开启，不需要配置。最近 agent 活动与安全开关在下方。" },
  "security.safe_mode_btn": { en: "One-Click Safe Mode", zh: "一键安全默认 (safe mode)" },
  "security.default_caps": { en: "Default Security Capabilities", zh: "默认安全能力" },
  "security.capability_axes": { en: "Capability Axes", zh: "能力轴" },
  "security.capability_axes_desc": { en: "Configure default agent permissions across filesystem, shell, and network.", zh: "控制 agent 在文件、Shell、网络三类能力上的默认行为。允许 = 自动执行，询问 = 每次确认，拒绝 = 直接拒绝。" },
  "security.flags_title": { en: "Security Switches (Configurable)", zh: "安全开关（可调）" },
  "security.recent_activity": { en: "Recent Agent Activity", zh: "最近 agent 活动" },
  "security.activity_empty": { en: "No agent activity recorded yet. Run a tool loop task to see audits here.", zh: "还没有 agent 活动记录。开个工具循环任务后这里会显示每次调用。" },
  "security.session_n": { en: "Session #{0}", zh: "会话 #{0}" },
  "security.add_rule_failed": { en: "Failed to add rule", zh: "添加规则失败" },
  "security.rule_added": { en: "Added auto-allow rule: {0} ({1})", zh: "已添加自动允许规则: {0} ({1})" },
  "security.add_rule_failed_with": { en: "Failed to add rule: {0}", zh: "添加规则失败: {0}" },
  "security.rule_removed": { en: "Removed rule: {0} ({1})", zh: "已移除规则: {0} ({1})" },
  "security.remove_rule_failed": { en: "Failed to remove rule", zh: "移除规则失败" },
  "security.preset_applied": { en: "Preset applied, added {0} rules", zh: "已启用预设，添加了 {0} 条安全规则" },
  "security.preset_failed": { en: "Failed to apply preset", zh: "启用预设失败" },
  "security.save_failed": { en: "Failed to save", zh: "保存失败" },
  "security.safe_mode_success": { en: "Safe mode written, disabled {0} experimental features", zh: "已写入安全默认，关闭 {0} 项实验能力" },
  "security.safe_mode_failed": { en: "Failed to apply safe mode", zh: "safe mode 执行失败" },
  "security.toggle_failed": { en: "Failed to toggle setting", zh: "切换失败" },
  "agent.permission.allow": { en: "Allow", zh: "允许" },
  "mcp.market.hide": { en: "Hide Market", zh: "收起市场" },
  "mcp.market.show": { en: "Show Market", zh: "展开市场" },
  "slash.clear": { en: "Clear Chat", zh: "清空对话" },
  "slash.clear_desc": { en: "Clear current chat history", zh: "清空当前对话历史" },
  "slash.regenerate": { en: "Regenerate", zh: "重新生成" },
  "slash.regenerate_desc": { en: "Undo last response and regenerate", zh: "撤销最后一条回复并重新生成" }
};

// 1. Inject new keys into base and zh-CN
let zhObj = transData.find(t => t.lang === 'zh-CN');
if (!zhObj) {
  zhObj = { lang: 'zh-CN', strings: {} };
  transData.unshift(zhObj);
}

for (const [key, val] of Object.entries(newKeys)) {
  if (!base[key]) base[key] = val.en;
  if (!zhObj.strings[key]) zhObj.strings[key] = val.zh;
}

fs.writeFileSync(BASE_PATH, JSON.stringify(base, null, 2), 'utf-8');
console.log(`Base keys total: ${Object.keys(base).length}`);

// Sleep helper
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Translation helper via Google Translate API
async function translateBatch(texts, targetLang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=` + encodeURIComponent(texts.join('\n'));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const fullTranslated = data[0].map(x => x[0]).join('');
  const lines = fullTranslated.split('\n');
  return lines;
}

async function run() {
  const allBaseKeys = Object.keys(base);
  const targetLangs = ['ja', 'es', 'fr', 'de', 'pt', 'ru', 'uk', 'ar', 'hi', 'ko'];

  for (const lang of targetLangs) {
    let langItem = transData.find(t => t.lang === lang);
    if (!langItem) {
      langItem = { lang, strings: {} };
      transData.push(langItem);
    }
    const strings = langItem.strings;

    // Find missing keys
    const missingKeys = allBaseKeys.filter(k => !strings[k] || strings[k] === base[k]);
    console.log(`\nProcessing [${lang}]: ${missingKeys.length} keys missing...`);

    if (missingKeys.length === 0) continue;

    const BATCH_SIZE = 40;
    for (let i = 0; i < missingKeys.length; i += BATCH_SIZE) {
      const chunk = missingKeys.slice(i, i + BATCH_SIZE);
      const chunkTexts = chunk.map(k => base[k]);

      try {
        const translated = await translateBatch(chunkTexts, lang);
        chunk.forEach((k, idx) => {
          if (translated[idx] && translated[idx].trim()) {
            strings[k] = translated[idx].trim();
          } else {
            strings[k] = base[k];
          }
        });
        process.stdout.write(`.`);
      } catch (err) {
        console.warn(`\n[${lang}] Batch error at ${i}:`, err.message);
        // Fall back to base English for failed batch
        chunk.forEach(k => { strings[k] = base[k]; });
      }
      await sleep(150);
    }
  }

  // Handle zh-TW via Traditional Chinese conversion
  let zhTWItem = transData.find(t => t.lang === 'zh-TW');
  if (!zhTWItem) {
    zhTWItem = { lang: 'zh-TW', strings: {} };
    transData.push(zhTWItem);
  }
  let OpenCC;
  try {
    const openccModule = require('opencc');
    const converter = new openccModule.OpenCC('s2t.json');
    for (const [k, v] of Object.entries(zhObj.strings)) {
      if (!zhTWItem.strings[k]) {
        zhTWItem.strings[k] = converter.convertSync(v);
      }
    }
    console.log('\nzh-TW updated via OpenCC.');
  } catch (e) {
    // Fallback: copy zh-CN
    for (const [k, v] of Object.entries(zhObj.strings)) {
      if (!zhTWItem.strings[k]) zhTWItem.strings[k] = v;
    }
  }

  // Handle zh-WEN
  let zhWENItem = transData.find(t => t.lang === 'zh-WEN');
  if (!zhWENItem) {
    zhWENItem = { lang: 'zh-WEN', strings: {} };
    transData.push(zhWENItem);
  }
  for (const [k, v] of Object.entries(zhObj.strings)) {
    if (!zhWENItem.strings[k]) zhWENItem.strings[k] = v;
  }

  // Save back to i18n-translations.json
  fs.writeFileSync(TRANS_PATH, JSON.stringify(transData, null, 2), 'utf-8');
  console.log('\nAll languages updated in i18n-translations.json!');

  // Run gen-i18n.js
  require('./gen-i18n.js');
}

run().catch(console.error);
