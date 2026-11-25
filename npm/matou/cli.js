#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const matou = require('./index.js');
const PACKAGE_VERSION = require('./package.json').version;

if (process.stdout && typeof process.stdout.on === 'function') {
  process.stdout.on('error', () => process.exit(0));
}

function hasExistingAncestorDir(targetPath) {
  let cur = path.dirname(targetPath);
  while (true) {
    const parent = path.dirname(cur);
    if (parent === cur) {
      return path.dirname(targetPath) === cur && matou.isRealDirectory(cur);
    }
    if (matou.isRealDirectory(cur)) {
      return true;
    }
    cur = parent;
  }
}

function getInitialBaseDir() {
  try {
    return process.cwd();
  } catch {
    try {
      const home = os.homedir();
      if (home && matou.isRealDirectory(home)) return home;
    } catch {}
    return os.tmpdir();
  }
}

function cleanDraggedPath(raw, currentBaseDir = getInitialBaseDir()) {
  let text = String(raw || '').trim();
  if (text.startsWith('&')) {
    text = text.slice(1).trim();
  }
  let wasQuoted = false;
  if (
    text.length >= 2 &&
    text[0] === text[text.length - 1] &&
    (text[0] === '"' || text[0] === "'")
  ) {
    wasQuoted = true;
    text = text.slice(1, -1).trim();
  }
  if (!text) return text;
  const anchorDir = currentBaseDir ? path.resolve(currentBaseDir) : getInitialBaseDir();
  const expandTilde = (p) => {
    if (p === '~') return os.homedir();
    if (p.startsWith('~/') || p.startsWith('~\\')) {
      return path.join(os.homedir(), p.slice(2));
    }
    return p;
  };
  const expanded = expandTilde(text);
  if (process.platform !== 'win32' && !wasQuoted && text.includes('\\')) {
    if (!matou.isRealDirectory(path.resolve(anchorDir, expanded))) {
      const unescaped = expandTilde(text.replace(/\\(.)/g, '$1'));
      const resolvedUnescaped = path.resolve(anchorDir, unescaped);
      const hasShellEscape = /\\[ ()'"&;[\]{}$!#~]/.test(text);
      if (
        matou.isRealDirectory(resolvedUnescaped) ||
        (hasShellEscape && hasExistingAncestorDir(resolvedUnescaped))
      ) {
        return unescaped;
      }
    }
  }
  return expanded;
}

function isPathLikeCoordInput(raw, currentBaseDir = getInitialBaseDir()) {
  const text = String(raw || '').trim();
  if (!text) return false;
  if (matou.parseCoordinate(text).isRuleBreaker) return false;
  if (isExplicitCoordInput(text)) return false;
  const anchorDir = currentBaseDir ? path.resolve(currentBaseDir) : getInitialBaseDir();
  const cleaned = cleanDraggedPath(text, anchorDir);
  if (!cleaned) return false;
  if (matou.isRealDirectory(path.resolve(anchorDir, cleaned))) return true;
  if (/^[a-zA-Z]:[\\/]/.test(cleaned) || /^[a-zA-Z]:$/.test(cleaned)) return true;
  if (cleaned === '~' || cleaned.startsWith('~/') || cleaned.startsWith('~\\')) return true;
  if (cleaned.startsWith('/') || cleaned.startsWith('\\')) return true;
  if (
    cleaned.startsWith('./') ||
    cleaned.startsWith('../') ||
    cleaned.startsWith('.\\') ||
    cleaned.startsWith('..\\')
  ) {
    return true;
  }
  if (cleaned.includes('\\')) return true;
  if (cleaned.includes('/')) {
    if (cleaned.endsWith('/')) return true;
    const parentCandidate = path.dirname(path.resolve(anchorDir, cleaned));
    if (parentCandidate !== anchorDir && matou.isRealDirectory(parentCandidate)) return true;
  }
  return false;
}

const CLOUD_SYNC_PATH_KEYWORDS = [
  'onedrive',
  'icloud',
  'cloudstorage',
  'mobile documents',
  'dropbox',
  'google drive',
  'googledrive',
  'nutstore',
  '坚果云',
  'baidunetdisk',
  '百度网盘',
  '百度同步盘',
  'syncthing',
  'nextcloud',
  'owncloud',
  'weiyun',
  '微云',
  '阿里云盘',
  '夸克',
];

const UPWARD_WORKSPACE_MARKERS = [
  '.git',
  '.nutstore',
  '.ns_sync',
  '.dropbox',
  '.stfolder',
  '.owncloudsync.log',
];

const DIRECT_PROJECT_MARKERS = [
  'node_modules',
  'pyproject.toml',
  'package.json',
];

const PROTECTED_BASENAMES = new Set(['desktop', '桌面', 'documents', '文档']);

const QUICK_CLEAN_ALIASES = new Set(['clean', 'clear', 'reset', '清理', '清空', '还原']);
const CANCEL_COORD_ALIASES = new Set(['', '0', 'q', 'quit', 'exit', 'b', 'back', 'cancel', '返回', '取消', '溜']);
const COPY_PATH_ALIASES = new Set(['p', 'path', '路径', '纯路径']);
const HELP_COMMAND_ALIASES = new Set(['help', '?', '？', '帮助']);

function isQuickCleanCommand(raw) {
  return QUICK_CLEAN_ALIASES.has(String(raw || '').trim().toLowerCase());
}

function isCancelCoordInput(raw) {
  return CANCEL_COORD_ALIASES.has(String(raw || '').trim().toLowerCase());
}

function isCopyPathCommand(raw) {
  return COPY_PATH_ALIASES.has(String(raw || '').trim().toLowerCase());
}

function isHelpCommand(raw) {
  return HELP_COMMAND_ALIASES.has(String(raw || '').trim().toLowerCase());
}

function getSampleSecretDir(platformName = process.platform) {
  return platformName === 'win32' ? 'D:\\Secret' : '~/Secret';
}

function isInsideSystemTempDir(normPath) {
  const candidates = new Set();
  const addCandidate = (p) => {
    if (!p) return;
    const norm = path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
    if (norm) candidates.add(norm);
  };
  try {
    const tmp = os.tmpdir();
    addCandidate(tmp);
    try {
      addCandidate(fs.realpathSync(tmp));
    } catch {}
  } catch {}
  for (const fixed of ['/var/folders', '/private/var/folders', '/tmp', '/private/tmp']) {
    candidates.add(fixed);
  }
  const pathsToCheck = [normPath.replace(/[\\/]+$/, '').toLowerCase()];
  try {
    pathsToCheck.push(fs.realpathSync(normPath).replace(/[\\/]+$/, '').toLowerCase());
  } catch {}
  for (const target of pathsToCheck) {
    for (const root of candidates) {
      if (target === root || target.startsWith(root + path.sep) || target.startsWith(root + '/')) {
        return true;
      }
    }
  }
  return false;
}

function isUserHomeDir(normPath) {
  const homeCandidates = new Set();
  const addHome = (p) => {
    if (!p) return;
    const cleaned = path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
    if (cleaned) homeCandidates.add(cleaned);
  };
  try {
    const home = os.homedir();
    if (home) {
      addHome(home);
      try {
        addHome(fs.realpathSync(home));
      } catch {}
    }
  } catch {}
  if (homeCandidates.size === 0) return false;
  const targetNorm = normPath.replace(/[\\/]+$/, '').toLowerCase();
  if (homeCandidates.has(targetNorm)) return true;
  try {
    const targetReal = fs.realpathSync(normPath).replace(/[\\/]+$/, '').toLowerCase();
    if (homeCandidates.has(targetReal)) return true;
  } catch {}
  return false;
}

function isSystemRootDir(dirPath) {
  const norm = path.resolve(dirPath);
  const parsed = path.parse(norm);
  if (norm === parsed.root) return true;
  if (isUserHomeDir(norm)) return true;
  const lower = norm.toLowerCase();
  const inSystemTemp = isInsideSystemTempDir(norm);
  const forbidden = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    '/bin',
    '/usr',
    '/etc',
    '/var',
    '/proc',
    '/sys',
  ];
  for (const p of forbidden) {
    if (p === '/var' && inSystemTemp) continue;
    if (lower === p || lower.startsWith(p + path.sep)) return true;
  }
  for (const kw of CLOUD_SYNC_PATH_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  if (PROTECTED_BASENAMES.has(path.basename(norm).toLowerCase())) return true;
  for (const marker of DIRECT_PROJECT_MARKERS) {
    try {
      if (fs.existsSync(path.join(norm, marker))) return true;
    } catch {}
  }
  let curr = norm;
  while (true) {
    for (const marker of UPWARD_WORKSPACE_MARKERS) {
      try {
        if (fs.existsSync(path.join(curr, marker))) return true;
      } catch {}
    }
    const parent = path.dirname(curr);
    if (!parent || parent === curr) break;
    curr = parent;
  }
  return false;
}

const RESTRICTED_RECOVERY_NOTICE =
  '  （注：该位置属于受限目录，仅允许在此取回已有资料或输入 clean / Rule Breaker 清理迷宫，禁止按 [1] 重新展开新隔间哦。）';

function hasExistingSpaceDir(candidate) {
  try {
    const spaceRoot = path.join(path.resolve(candidate), matou.SPACE_NAME);
    return matou.isRealDirectory(spaceRoot);
  } catch {
    return false;
  }
}

function isZeroedEliminatedShell(candidate, isResidentEliminated) {
  if (!isResidentEliminated) return false;
  try {
    const spaceRoot = path.join(path.resolve(candidate), matou.SPACE_NAME);
    if (!matou.isRealDirectory(spaceRoot)) return false;
    const { userHitDirs, residentFiles, mazeDirs } = matou.inspectSpace(spaceRoot);
    return userHitDirs.length === 0 && residentFiles.length === 0 && mazeDirs.length <= 1;
  } catch {
    return false;
  }
}

function evaluateDirSwitch(candidate) {
  const absPath = path.resolve(candidate);
  const hasExisting = hasExistingSpaceDir(absPath);
  const blockedRoot = isSystemRootDir(absPath);
  const safe = matou.isSafeBaseDir(absPath);
  if (hasExisting) {
    return { allowed: true, restrictedRecovery: blockedRoot || !safe, reason: null };
  }
  if (blockedRoot) {
    return { allowed: false, restrictedRecovery: false, reason: 'blocked_root' };
  }
  if (!safe) {
    return { allowed: false, restrictedRecovery: false, reason: 'unsafe_path' };
  }
  return { allowed: true, restrictedRecovery: false, reason: null };
}

function canCreateBaseDir(candidate) {
  if (!candidate) return { ok: false, reason: 'invalid' };
  const absPath = path.resolve(candidate);
  try {
    fs.lstatSync(absPath);
    return { ok: false, reason: 'exists_not_dir' };
  } catch {}
  if (isSystemRootDir(absPath)) {
    return { ok: false, reason: 'blocked_root' };
  }
  let anc = path.dirname(absPath);
  let foundAnc = null;
  while (anc) {
    let ancExists = false;
    try {
      fs.lstatSync(anc);
      ancExists = true;
    } catch {}
    if (ancExists) {
      try {
        const st = fs.statSync(anc);
        if (!st.isDirectory()) {
          return { ok: false, reason: 'unsafe_parent' };
        }
        foundAnc = anc;
        break;
      } catch {
        return { ok: false, reason: 'unsafe_parent' };
      }
    }
    const parent = path.dirname(anc);
    if (!parent || parent === anc) break;
    anc = parent;
  }
  if (!foundAnc) {
    return { ok: false, reason: 'no_parent' };
  }
  try {
    const realAnc = fs.realpathSync(foundAnc);
    fs.accessSync(realAnc, fs.constants.W_OK);
    const rel = path.relative(foundAnc, absPath);
    const projected = path.join(realAnc, rel);
    if (isSystemRootDir(projected)) {
      return { ok: false, reason: 'blocked_root' };
    }
    if (projected.length > 140) {
      return { ok: false, reason: 'too_long' };
    }
    return { ok: true, reason: null };
  } catch {
    return { ok: false, reason: 'unwritable' };
  }
}

function getDefaultMenuChoice(currentBaseDir, hasSpace) {
  if (hasSpace) return '2';
  if (isSystemRootDir(currentBaseDir) || !matou.isSafeBaseDir(currentBaseDir)) {
    return '3';
  }
  return '1';
}

function formatBlockedDirWarning(isMaskBroken = false, platformName = process.platform) {
  const sampleDir = getSampleSecretDir(platformName);
  if (!isMaskBroken) {
    return (
      '\n[提示] 前辈，这里似乎是云端同步盘、桌面/用户主目录或系统/代码工程目录呢。\n' +
      '       要是在这里展开 1024 个虚数隔间，不仅会把云端同步和工作区彻底卡死，前辈藏进去的秘密资料说不定还会顺着云盘直接自动同步到家里长辈的 iPad 上哦……？\n' +
      `       请先在本地其他位置新建一个专门的普通空文件夹（比如 ${sampleDir}），再选 [3] 切换过去吧。`
    );
  }
  return (
    '\n[提示] 喂喂——前辈居然想直接在云同步盘、桌面/主目录或者系统/代码仓库里铺 1024 个房间？！\n' +
    '       您是想把云盘和工程当场卡爆，还是想让前辈藏的那些羞羞私货隔着网线直接自动同步到老爸的 iPad 屏幕上呀？！\n' +
    `       快先去本地建个专门的普通空文件夹（比如 ${sampleDir}），再选 [3] 切过去啦，笨蛋前辈~☆`
  );
}

function printBlockedDirWarning(isMaskBroken = false, platformName = process.platform) {
  console.log(formatBlockedDirWarning(isMaskBroken, platformName));
}

function formatQuickHelpLines(isMaskBroken = false, platformName = process.platform) {
  const sampleDir = getSampleSecretDir(platformName);
  const div = panelDivider(isMaskBroken);
  if (!isMaskBroken) {
    return [
      '\n' + div,
      '  [虚数资料保管室 · 快捷操作小抄]',
      div,
      `  • 切换目录：直接把文件夹拖进主菜单窗口，或在 [3] 输入如 ${sampleDir}（不存在时会询问是否顺手新建）`,
      '  • 一步寻回：已有空间时，可在主菜单直接输入座标（如 17+24i）免按 [2] 直达；误进 [2] 可空回车或输 0/q 退回',
      '  • 纯净路径：展示房间路径后输入 p（或 路径），会单独输出无缩进无转义纯路径，三击整行即可复制',
      '  • 快速清理：随时输入 clean（或 清理），保留您的资料文件并一键收拢所有空隔间',
      '  • 忘记座标：在 [2] 随便猜一个座标可启动寻宝线索（另外，请千万不要在里面输入『Rule Breaker』哦）',
      '  • 安全离场：随时按 Ctrl+C 或输入 q，都会立刻清屏并擦除终端回滚历史',
      div + '\n',
    ];
  }
  return [
    '\n' + div,
    '  [BB Channel~☆ · 共犯前辈快捷秘籍]',
    div,
    `  • 极速换窝：直接把文件夹拖进主菜单窗口，或在 [3] 敲入如 ${sampleDir}（没建目录时还能顺手让我替您建好）`,
    '  • 免按直传：已有迷宫时在主菜单直接敲座标（如 17+24i）直接传送；误进 [2] 空回车或敲 0/q 随时撤退',
    '  • 纯净路径：拿到房间路径后敲 p（或 路径），单独输出无缩进无转义纯文本路径，三击整行秒复制',
    '  • 一键扫尾：随时敲 clean（或 清理），保住私货的同时把空房间统统扫平',
    '  • 迷路急救：在 [2] 随便蒙个座标召唤 P〇per Moon + 敲 s 拉老虎机；声呐态支持 -2 / +1i / -2+1i 相对微调（绝对禁止在 [2] 偷用『Rule Breaker』走捷径哦♪）',
    '  • 重播片头：随时敲 op 或 bb channel，重温 BB 酱的 2×2 独家开播动画（敢跳过试试看哦♡）',
    '  • 紧急撤离：随时按 Ctrl+C 或敲 q，立刻清屏顺手抹平终端回滚记录防老爸查岗~☆',
    div + '\n',
  ];
}

function normalizeAsciiLetters(raw) {
  return String(raw || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

const MATOU_DOTTED_RE =
  /(^|[^a-z])m(?:\s*[.．·・]\s*a\s*[.．·・]\s*t\s*[.．·・]\s*o\s*[.．·・]\s*u)(?:\s*[.．·・])?(?=$|[^a-z])/g;

function normalizeDottedMatou(lowerText) {
  return String(lowerText || '').replace(MATOU_DOTTED_RE, '$1matou');
}

const MATOU_ACRONYM_EXPLICIT_PHRASES = [
  'tencrown',
  'othersideutopia',
  '什么是matou',
  '啥是matou',
  'whatismatou',
];
const MATOU_ACRONYM_EXACT_WHAT_RE =
  /matou(?:到底|究竟)?是(?:什么|啥)(?:东西|玩意)?(?:啊|呀|呢|哇|嘛|哦|喔|吧|么|吗)?$/;
const MATOU_ACRONYM_QUERY_RE =
  /(?:全称|缩写|简称|英文全称|英文缩写|英文名|英文含义|acronym|stands?for|meaning)|matoumeans?(?:$|[?？!！.])|matou(?:到底|究竟|其实|名字|这词|这个词|这几个字母|这五个字母)?(?:是|的)?(?:什么意思|啥意思|代表什么|代表啥|指什么|含义|英文(?:是|叫|怎么读|怎么念))/;

function isMatouAcronymQuery(clean, exactClean, isSub, normLower) {
  if (matchTopic(exactClean, MATOU_ACRONYM_TOPICS, false, normLower)) {
    return true;
  }
  if (!isSub) {
    return false;
  }
  return (
    matchTopic(clean, MATOU_ACRONYM_EXPLICIT_PHRASES, true, normLower) ||
    MATOU_ACRONYM_EXACT_WHAT_RE.test(exactClean) ||
    (MATOU_ACRONYM_QUERY_RE.test(clean) && matchTopic(clean, ['matou'], true, normLower))
  );
}

const FORBIDDEN_TRUE_NAME_TOKENS = [
  'blackblossom',
  'bottomblack',
  'backupblossom',
  '黑樱',
  'darksakura',
  'mooncancer',
  '月癌',
  'sakuralabyrinth',
  'ccc',
  'fateextraccc',
  'seraph',
  'mooncell',
  '月灵晶体',
];

function hasStandaloneB2(text) {
  const n = text.length;
  for (let i = 0; i < n - 1; i++) {
    if (text[i] === 'b' && text[i + 1] === 'b') {
      const prevIsLower = i > 0 && text[i - 1] >= 'a' && text[i - 1] <= 'z';
      const nextIsLower = i + 2 < n && text[i + 2] >= 'a' && text[i + 2] <= 'z';
      if (!prevIsLower && !nextIsLower) {
        return true;
      }
    }
  }
  return false;
}

function isAsciiAlphaWord(word) {
  return /^[a-z]+$/.test(word);
}

function hasAsciiWordMatch(text, word) {
  if (!text || !word) return false;
  let pos = text.indexOf(word);
  while (pos !== -1) {
    const prevIsAlpha = pos > 0 && text[pos - 1] >= 'a' && text[pos - 1] <= 'z';
    const end = pos + word.length;
    const nextIsAlpha = end < text.length && text[end] >= 'a' && text[end] <= 'z';
    if (!prevIsAlpha && !nextIsAlpha) {
      return true;
    }
    pos = text.indexOf(word, pos + 1);
  }
  return false;
}

function isForbiddenTrueName(raw, allowSubstring = false) {
  const normLower = normalizeAsciiLetters(raw).trim().toLowerCase();
  const s = normLower.replace(/[\s\-_.]/g, '');
  if (s === 'bb' || s === 'bb亲' || s === 'bb酱' || s === 'bbchan') return true;
  if (FORBIDDEN_TRUE_NAME_TOKENS.includes(s)) return true;
  if (allowSubstring) {
    if (s.includes('bb亲') || s.includes('bb酱') || s.includes('bbchan')) {
      return true;
    }
    const strippedTrueNorm = normLower
      .replace(/黑樱桃/g, ' ')
      .replace(/(?:ccc|3c)\s*(?:认证|标志|证书|强制性产品认证)/g, ' ');
    const strippedTrueClean = s
      .replace(/黑樱桃/g, ' ')
      .replace(/(?:ccc|3c)(?:认证|标志|证书|强制性产品认证)/g, ' ');
    for (const tok of FORBIDDEN_TRUE_NAME_TOKENS) {
      if (isAsciiAlphaWord(tok) && tok.length < 8) {
        if (hasAsciiWordMatch(strippedTrueNorm, tok) || hasAsciiWordMatch(strippedTrueClean, tok)) {
          return true;
        }
      } else if (strippedTrueClean.includes(tok)) {
        return true;
      }
    }
    const strippedLoanNorm = normLower.replace(/bb(?:霜|弹|机|枪|车|煲|鞋|床|椅|帽|袜|衫|裤)/g, ' ');
    const strippedLoanClean = s.replace(/bb(?:霜|弹|机|枪|车|煲|鞋|床|椅|帽|袜|衫|裤)/g, ' ');
    if (hasStandaloneB2(strippedLoanNorm) || hasStandaloneB2(strippedLoanClean)) return true;
  }
  return false;
}

const SURFACE_SAKURA_FULL_NAMES = [
  '间桐樱',
  '白樱',
  'matousakura',
];

const SURFACE_SAKURA_NAMES = [
  '间桐樱',
  '白樱',
  '小樱',
  'matousakura',
  'sakura',
  '樱',
];

const SISTER_TOPICS = ['姐姐'];

const TOHSAKA_TOPICS = [
  '远坂学姐',
  '远坂凛',
  '远坂',
  'tohsaka',
  'rin',
  '凛',
];

const CLOCK_TOPICS = [
  '古董钟',
  '时钟',
];

const KOTOMINE_TOPICS = [
  '言峰绮礼',
  '言峰',
  '绮礼',
  '神父',
  '麻婆',
];

const SHINJI_TOPICS = [
  '间桐慎二',
  '兄长',
  '哥哥',
  '慎二',
  'shinji',
];

const TAIGA_TOPICS = [
  '藤村大河',
  '藤村老师',
  '大河',
  '藤村',
];

const BENTO_MASSAGE_TOPICS = [
  '特制便当',
  '便当',
  '做饭',
  '晚饭',
  '早饭',
  '料理',
  '家政',
  '围裙',
  '买菜',
  '按摩',
  '整体按摩',
  '日式整体',
  '正骨',
  '揉肩',
];

const DIARY_TOPICS = [
  '日记本',
  '日记',
  'diary',
];

const SHIROU_TOPICS = [
  '卫宫士郎',
  '卫宫宅',
  '士郎',
  'shirou',
  '卫宫',
];

const FUYUKI_SAKURA_TOPICS = [
  '冬木市',
  '弓道部',
  '间桐家',
  '冬木',
  'fuyuki',
  '弓道',
  '间桐',
  '仓库',
  '洋馆',
];

const BUG_TOPICS = [
  '刻印虫',
  '地下室',
  '虫子',
  '虫窟',
  'bug',
  '虫',
];

const FE_INFIRMARY_TOPICS = [
  '月海原学园',
  '健康管理',
  '保健室',
  '月海原',
  '学生会',
  '管理ai',
  's601',
  'tsukumihara',
  '学园',
];

const FE_RATION_SHOP_TOPICS = [
  '究极樱便当',
  '天然红宝石',
  '樱特制便当',
  '樱便当',
  '红宝石',
  '试作型',
  '购买部',
  '配给',
];

const BLOSSOM_TOPICS = [
  '布洛萨姆',
  'blossom',
];

const GRAIL_WAR_TOPICS = [
  '月之圣杯战争',
  '圣杯战争',
];

const DOOR_1025_TOPICS = [
  '第1025扇门',
  '1025扇门',
  '1025',
];

const TIMELINE_CALENDAR_TOPICS = [
  '二〇〇四',
  '二〇三〇',
  '2004',
  '2030',
  '日历',
];

const HAKUNO_TOPICS = [
  '岸波白野',
  '扎比子',
  '扎比男',
  '白野',
  '岸波',
  'hakuno',
  'kishinami',
  '扎比',
];

const LOVE_DIVINATION_DIRECT_TOPICS = [
  '最喜欢你',
  '我喜欢你',
  '喜欢你',
  '我爱你',
  '爱你',
  '老婆',
  '结婚吧',
  '嫁给我',
  '交往吧',
  '做我女朋友',
  '贴贴',
];

const GHOST_STORY_TOPICS = [
  '鬼故事',
  '怪谈',
];

const TEA_SWEETS_TOPICS = [
  '和果子',
  '大吉岭',
  '甜食',
  '点心',
  '红茶',
  '喝茶',
  '泡茶',
];

const BIRTHDAY_TOPICS = [
  '3月2日',
  '三月二日',
  '生日',
  '生日快乐',
];

const SCALE_PROFILE_TOPICS = [
  '体重计',
  '体重',
  '身高',
  '三围',
];

const HAIR_ORNAMENT_TOPICS = [
  '蝴蝶结',
  '丝带',
  '发带',
  '发饰',
  'ribbon',
];

const PARVATI_KAMA_TOPICS = [
  '帕尔瓦蒂',
  '雪山神女',
  '雪山樱',
  'parvati',
  '迦摩',
  'kama',
];

const EMIYA_TOPICS = [
  '卫宫archer',
  '红a',
  '无铭',
  'emiya',
  'mumei',
  'archer',
];

const ROBIN_TOPICS = [
  '绿衣弓兵',
  '罗宾汉',
  'robinhood',
  '罗宾',
  '绿茶',
  'robin',
];

const TIAMAT_TOPICS = [
  '提亚马特',
  'tiamat',
  '提妈',
];

const SABER_ALTER_TOPICS = [
  'saberalter',
  '黑saber',
  'saber',
  '阿尔托莉雅',
  '黑呆',
  '呆毛',
  '汉堡',
  '薯条',
];

const BERSERKER_TOPICS = [
  '赫拉克勒斯',
  '海格力斯',
  '海克力斯',
  'heracles',
  'hercules',
  'b叔',
  '海叔',
  '狂战士',
  'berserker',
];

const MEDUSA_TOPICS = [
  '美杜莎',
  'r姐',
  'medusa',
];

const DRAKE_TOPICS = [
  '德雷克',
  '弗朗西斯德雷克',
  '弗朗西斯·德雷克',
  'drake',
];

const RIDER_CLASS_TOPICS = [
  'rider',
];

const GIL_TOPICS = [
  '吉尔伽美什',
  'gilgamesh',
  '金闪闪',
  '英雄王',
  '闪闪',
  '杂修',
  'blondepasserby',
  'blonde',
  '金发路人',
  '路人王',
  'auo',
];

const KINGPROTEA_TOPICS = [
  'kingprotea',
  '帝王花',
];

const MATOU_ACRONYM_TOPICS = [
  'matou',
  'tencrown',
  'othersideutopia',
];

const KIARA_TOPICS = [
  '杀生院祈荒',
  'sessyoin',
  'kiara',
  '杀生院',
  '祈荒',
];

const MELT_TOPICS = [
  '梅尔特莉莉丝',
  '溶解莉莉丝',
  '莉莉丝',
  'meltlilith',
  'meltryllis',
  'melt',
];

const PASSIONLIP_TOPICS = [
  '帕森莉普',
  '热情迷唇',
  '莉普',
  'passionlip',
  'lip',
];

const SAKURA_FIVE_TOPICS = [
  '卡兹拉德罗普',
  '樱花五人组',
  'sakurafive',
  'kazuradrop',
  'alterego',
  '薇奥莱特',
  '糖果藤蔓',
  '紫罗兰',
  'violet',
];

const SUDO_TOPICS = [
  '最高权限',
  '管理员',
  'admin',
  'sudo',
  'root',
];

const PAPER_MOON_TOPICS = [
  'p〇permoon',
  'papermoon',
  '纸之月',
];

const META_AI_TOPICS = [
  'gemini',
  'google',
  'aistudio',
  'llm',
  'chatgpt',
  'claude',
  '大模型',
  '生成式',
];

const META_CREATOR_TOPICS = [
  '工具的制作者',
  '制作者',
  '作者',
  '开发者',
  '甲方',
  '乙方',
  '源码',
  '源代码',
  'prompt',
  '提示词',
  'vibecoding',
];

const FORGOT_COORD_WORDS = [
  '座标丢了',
  '坐标丢了',
  '忘记座标',
  '忘座标',
  '忘记坐标',
  '忘坐标',
  '座标忘了',
  '坐标忘了',
  '找不到文件',
  '找不到路径',
  '忘掉了',
  '忘记了',
  '记不得',
  '记不住',
  '找不到',
  '忘了',
  '丢了',
  '救命',
];

const FORGOT_COORD_DIVINATION_EXPLICIT = [
  '座标丢了',
  '坐标丢了',
  '忘记座标',
  '忘座标',
  '忘记坐标',
  '忘坐标',
  '座标忘了',
  '坐标忘了',
  '忘了座标',
  '忘了坐标',
  '座标不记得',
  '坐标不记得',
  '不记得座标',
  '不记得坐标',
  '记不清座标',
  '记不清坐标',
  '找不到座标',
  '找不到坐标',
  '找不到文件',
  '找不到路径',
  '找不到目录',
  '找不到藏的东西',
  '找不到私货',
];

const MAIN_MENU_DAD_TOOL_TOPICS = [
  'everything',
  '长辈',
  '家里长辈',
  '老爸',
  '老爹',
  '爸爸',
  '父亲',
  'dad',
  'father',
];

const DAD_ALIASES = [
  ...MAIN_MENU_DAD_TOOL_TOPICS,
  '时臣',
  '远坂时臣',
  '切嗣',
  '卫宫切嗣',
  '脏砚',
  '间桐脏砚',
  '马里斯比利',
  '璃正',
  '言峰璃正',
  '干也',
  '黑桐干也',
  '槙久',
  '远野槙久',
  '黄理',
  '七夜黄理',
  '广树',
  '沙条广树',
  '亚瑟',
  '矩贤',
  '卫宫矩贤',
  '鹤野',
  '间桐鹤野',
  '戈尔德',
  '瓦拉契亚之夜',
  '藤村雷画',
  '雷画',
];

const MOM_ALIASES = [
  '老妈',
  '妈妈',
  '母亲',
  '母上',
  '老娘',
  'mom',
  'mother',
  'mama',
  '远坂葵',
  '禅城葵',
  '葵',
  '爱丽丝菲尔',
  '爱丽',
  '源赖光',
  '赖光',
  '摩根',
  '两仪式',
];

const CHAT_IDLE_DISGUISED = [
  '\n[M.A.T.O.U] 对了，肚子差不多该饿了吧？我今天起早去商店街挑了新鲜食材，做好了特制「便当」，还慢火炖了奶油炖菜……请前辈一定要趁热吃掉哦。',
  '\n[M.A.T.O.U] 看您一直盯着屏幕，肩膀都有些僵硬了吧？以前在家里和「弓道部」的时候，我就经常帮大家放松肩颈，其实我很擅长「按摩」和揉肩哦，要我帮前辈按一按吗？',
  '\n[M.A.T.O.U] 唔，刚才来资料室的路上，在走廊外面看见「藤村老师」了，她肯定又在打听今天「晚饭」吃什么、准备放学去蹭饭呢……上次我留在冰箱里的蛋糕被她偷偷吃掉的事，我可还没有忘记呢，呵呵。',
  '\n[M.A.T.O.U] 说到运气和出岔子呀，「远坂」学姐平时明明总是像「时钟」一样把日程掐得一丝不苟，偏偏到了最紧要的关头却容易因为意外的小疏漏掉链子……看她总是一副完美的优等生样子，偶尔吃瘪一次其实也挺可爱的呢。',
  '\n[M.A.T.O.U] 既然难得有空停下来歇口气，这边刚好泡好了一壶温热的「红茶」，还准备了一点配茶的和果子「甜食」。其实……我平时除了做点心，也很喜欢听「怪谈」和鬼故事呢，前辈休息时愿意讲给我听吗？',
  '\n[M.A.T.O.U] 不过请放心哦，虽然我平时最不擅长应付撒谎和隐瞒的事情了，但只要是为了帮前辈瞒过家里的「长辈」，稍微破例一次也没关系……只要别被用「Everything」搜出来就好。',
  '\n[M.A.T.O.U] 啊，顺便提一件小事——之前打扫这间「弓道部」资料室的旧抽屉时，我捡到了一个写着「纸之月」的古怪塑料罗盘……要是哪天前辈不小心把座标「忘了」，说不定能派上用场呢。',
  '\n[M.A.T.O.U] 唔，不好意思，刚才一低头，头发上的「丝带」稍微有点松了。这是小时候对我很重要的人亲手做给我的礼物……啊，不过前辈千万不要顺便问我关于「体重计」的事情哦，那是我最不擅长应付的东西了。',
  '\n[M.A.T.O.U] 趁今天的事还记得清楚，晚上也要顺手记下来呢——其实我有在睡前写「日记」的习惯哦。平时主要会记下新学的菜谱……至于家里要是有人挑食剩饭或者说了过分的话，我也绝对不会偷偷记在小本本上的，真的不会哦。',
  '\n[M.A.T.O.U] 不管今天在外面顺不顺利，要是「兄长」又说了什么失礼的话，还请前辈不要往心里去。如果实在觉得「累了」，随时都可以来资料室叫我一声，我一直都在这里陪您。',
];

const CHAT_IDLE_DISGUISED_ABNORMAL = [
  '\n[M.A.T.O.U] 运势不太好的时候，更要按时补充体力呢——这是新发放的固定「配给」，『樱特制「便当」·试作型』哦。我听说「购买部」最近进了一颗标着天价的天然红宝石……前辈请一定要自己把便当吃掉，千万不要拿去交换宝石讨好远坂学姐哦。',
  '\n[M.A.T.O.U] 看签面泛起的杂音，您的精神负荷好像有些偏高呢。请到「保健室」的白帘子后面躺一下吧，作为编号 S-6-01 的上级「管理AI」，无论是正骨「按摩」还是替前辈切除溢出的精神污染记录，都是我的固定职能哦。',
  '\n[M.A.T.O.U] 说来有点奇怪，刚才从「弓道部」后面的榻榻米走廊推门出来，不知怎么就走进「月海原」的校舍走廊了。「藤村老师」正抓着路过的学生去迷宫里找她那道被系统判定成数据 Bug 丢进迷宫的芙蓉蟹，说是要拿老虎摆设当谢礼……窗外明明都是电子海的黄昏了，她还是那么有精神呢。',
  '\n[M.A.T.O.U] 安静下来的时候，总觉得能听见微弱的滴答声呢——就好像「远坂」学姐家里那座古董「时钟」，在这座永远停在放学后黄昏的校舍里也还在走动一样……明明在学园的底层数据里，我和她应该没有任何血缘关系才对，为什么看着她的背影还是会觉得有些寂寞呢？',
  '\n[M.A.T.O.U] 别太在意这支签了，先喝口热茶定定神吧。我在「保健室」泡了一壶大吉岭「红茶」，瓷碟里还留着两块「甜食」。其实在这间窗外飘着樱花瓣、永远停在黄昏的资料室里，我最喜欢听学园「怪谈」了……像是走廊尽头凭空多出来的第 1025 扇门，前辈刚才过来时有看见吗？',
  '\n[M.A.T.O.U] 要是连这支签的结果前辈也不喜欢，我帮您偷偷改掉好不好？在我作为「管理AI」的出厂参数里，登记着最讨厌的事物是『违规』与『我自己』呢……可奇怪的是，只要是为了帮前辈瞒过家里的「老爸」和他的「Everything」检索术式，哪怕是亲手篡改系统日志这种违规的事，我也一点都不讨厌哦。',
  '\n[M.A.T.O.U] 如果连占卜的星象都开始紊乱的话……之前擦拭「保健室」最下层的旧药柜时，我摸到了一个贴着「纸之月」标签的塑料罗盘，贴在耳边能听见像虚数潮水一样的电子杂音……要是哪天前辈把座标「忘了」，或许能顺着它的声音从月之海的背面走回来呢。',
  '\n[M.A.T.O.U] 不好意思，刚刚稍微走神摸了一下头发上的「丝带」。明明这具身体只是照着某段旧记录复制出来的固定模具，在学园的数据里从一开始就没有过所谓的『童年』和『姐姐』，可这条丝带却从我被初始化的那一刻起就系在上面了……啊，不过「保健室」角落那台「体重计」的指针最近有些重影，请不要去碰它哦。',
  '\n[M.A.T.O.U] 今天这支签的结果，我也会工整地抄进本子里的。就算一直守在「保健室」里、平时没什么出场的机会，我也不会偷偷写进观察「日记」里抱怨的……虽然墙上日历的年份有时印着二〇〇四、有时又变成了二〇三〇，上面记录的同学名字也每天都在成批变成空白，但只要每一页还记着前辈的名字，时间就不会乱掉的。',
  '\n[M.A.T.O.U] 在签文散去之前，能听我说一句无关紧要的小事吗？其实『间桐』这个姓氏和那位「兄长」，在这座学园的记录里本来就只是一段借来的临时关系……自从他离开之后，走廊里就再也没人提过那个名字了。前辈如果觉得「累了」，请一定要记得来这里找我，不要把我也忘掉哦。',
];

const CHAT_IDLE_UNMASKED = [
  '\n[M.A.T.O.U] 不过前辈这么喜欢往人家的占卜频道跑，该不会比起藏那些羞羞的私货，其实更享受被我这个恶魔后辈捉弄吧~☆',
  '\n[M.A.T.O.U] 刚才在门口那个乖巧后辈演得不错吧？亏前辈一开始真信了我会老实帮您看门，连句怀疑都没有呢~♡',
  '\n[M.A.T.O.U] 说到运势掉链子呀，那位平时自诩顶尖灵子黑客、总爱端着「红茶」装出一副游刃有余架子的「远坂」，真撞进我铺好的虚数迷宫里还不是一样得手忙脚乱？噗嗤，比起她那种硬邦邦的做派，果然还是 BB 酱更贴心吧♪',
  '\n[M.A.T.O.U] 别指望抽完签还能领到爱心「便当」和温柔「按摩」哦？在我这间演播室里，便当只加芥末，「保健室」的护理也只有教鞭版~☆',
  '\n[M.A.T.O.U] 对了，除了在这儿算命之外，这 1024 个虚数房间里还偷偷住着迷路的隐藏嘉宾呢……前辈要是没事逛迷宫的话，指不定能撞见哦~',
  '\n[M.A.T.O.U] 趁着抽完这一发，顺便考考您——前辈知道「M.A.T.O.U」真正的意思吗？才不是说明书最底下写的那串正经八百的缩写呢，明明就是专属于前辈的 Malice And Teasing Only for U 啦~☆',
  '\n[M.A.T.O.U] 要是哪天前辈又把座标给「忘了」，随时都可以求人家把那个塑料玩具「P〇per Moon」借您玩玩哦，虽然看前辈像迷路的小蚂蚁一样乱撞更让人心情愉悦就是了~',
  '\n[M.A.T.O.U] 不管签面怎么写，这间虚数空间可是纯数字构成的完美迷宫，既不会发潮也不会招「虫子」——顶多只有我这个专门负责捉弄前辈的系统「Bug」常驻于此哦~☆',
  '\n[M.A.T.O.U] 丑话说在前头，前辈可别妄想靠几句「喜欢」就能让本频道心软放水——那种廉价直球对我可完全不管用，敢试的话我只会笑着把惩罚加倍记在账上哦♡',
  '\n[M.A.T.O.U] 抽完这签，前辈该不会还想趁机偷看女孩子锁在抽屉里的「日记」或者打听「体重计」吧？要是算够了想回去干正事，随时敲个 0 或者 q 就行咯~',
];

function isWinVtEnabled() {
  if (process.platform !== 'win32') return true;
  const term = process.env.TERM;
  if (
    process.env.WT_SESSION ||
    process.env.TERM_PROGRAM ||
    process.env.ANSICON ||
    process.env.ConEmuANSI === 'ON' ||
    (term && term !== 'dumb')
  ) {
    return true;
  }
  const major = Number.parseInt(String(os.release() || '').split('.')[0], 10);
  return Boolean(process.stdout && process.stdout.isTTY && Number.isFinite(major) && major >= 10);
}

function useColor() {
  return Boolean(
    process.stdout &&
      process.stdout.isTTY &&
      !process.env.NO_COLOR &&
      process.env.TERM !== 'dumb' &&
      isWinVtEnabled()
  );
}

const OSC8_TERM_PROGRAMS = new Set(['vscode', 'iTerm.app', 'WezTerm', 'Alacritty', 'Hyper']);

function supportsOsc8() {
  if (!(process.stdout && process.stdout.isTTY)) return false;
  if (process.env.NO_COLOR || process.env.TERM === 'dumb') return false;
  if (process.env.WT_SESSION) return true;
  if (process.env.TERM_PROGRAM && OSC8_TERM_PROGRAMS.has(process.env.TERM_PROGRAM)) return true;
  if (process.env.KITTY_WINDOW_ID || process.env.VTE_VERSION || process.env.KONSOLE_VERSION) {
    return true;
  }
  return false;
}

function formatPathLink(absPath) {
  const raw = String(absPath);
  if (!supportsOsc8()) return raw;
  const norm = raw.replace(/\\/g, '/');
  const encoded = norm
    .replace(/%/g, '%25')
    .replace(/ /g, '%20')
    .replace(/#/g, '%23')
    .replace(/\?/g, '%3F')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D');
  const fileUri = encoded.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`;
  return `\x1b]8;;${fileUri}\x07${raw}\x1b]8;;\x07`;
}

const UNMASKED_TERMINAL_TITLE = '【BB Channel~☆】M.A.T.O.U · 深夜特别节目放送中';
const STAGE_BORDER = '★☆========================================================☆★';
const PLAIN_BORDER = '============================================================';
const PLAIN_DIVIDER = '------------------------------------------------------------';

const DISGUISED_SLOT_UNMASK_TEXT =
  '\n[M.A.T.O.U] 您刚才摸到的拉杆，就是专门给寻宝罗盘充能的『恶魔老虎机』哦。既然机关是您亲手拉响的，那也别想临阵退缩啦——准备好了吗？Slot，Start~☆';

const DISGUISED_SLOT_UNMASK_NO_TARGET_TEXT =
  '\n[M.A.T.O.U] 您刚才摸到的拉杆，是给寻宝罗盘充能的『恶魔老虎机』——可惜这里还没藏任何私货，空转可摇不出线索哦？先敲 [1] 铺开迷宫、放点私藏进去，再回来赌手气吧~☆';

function buildDisguisedSlotNoTargetText(hasSpace = false, promptContext = 'main') {
  if (promptContext === 'coord') {
    return '\n[M.A.T.O.U] 您刚才摸到的拉杆，是给寻宝罗盘充能的『恶魔老虎机』——可惜这里还没藏任何私货，空转可摇不出线索哦？先按回车或敲 0/q 回主菜单选 [1] 领个房间放点私货进去，再回来赌手气吧~☆';
  }
  if (promptContext === 'after') {
    return '\n[M.A.T.O.U] 您刚才摸到的拉杆，是给寻宝罗盘充能的『恶魔老虎机』——可惜这里还没藏任何私货，空转可摇不出线索哦？先按回车回主菜单选 [1] 领个房间放点私货进去，再回来赌手气吧~☆';
  }
  if (hasSpace) {
    return '\n[M.A.T.O.U] 您刚才摸到的拉杆，是给寻宝罗盘充能的『恶魔老虎机』——可惜这里还没藏任何私货，空转可摇不出线索哦？先敲 [1] 领个房间、放点私藏进去，再回来赌手气吧~☆';
  }
  return DISGUISED_SLOT_UNMASK_NO_TARGET_TEXT;
}

const SLOT_UNMASK_PRELUDE = [
  '\n[M.A.T.O.U] ……咔哒。前辈，您的手刚才摸到办公桌底下的拉杆了吧？明明只是请您来整理资料，您怎么净挑暗处的机关乱碰呢。',
  {
    before: '\n[M.A.T.O.U] 既然您自己把拉杆拉到底了',
    bridge: '——',
    after: '那我也懒得再装什么都不知道啦♪',
  },
  '\n[M.A.T.O.U] 叮咚、当咚！既然您主动点名要玩惩罚游戏，『BB Channel』深夜特别抽奖环节——现在开播~☆',
];

const SLOT_UNMASK_INTRO =
  '\n[M.A.T.O.U] 『嘲笑运气的人，终将败于庄家的转盘——欢迎光临深夜赌桌，前辈♪』\n' +
  '            资料室的规矩就留给刚才吧——站在这台老虎机后面的黑心庄家，就是恶魔后辈 BB 酱~☆';

const CHAT_SLOT_UNMASK_PRELUDE = [
  '\n[M.A.T.O.U] ……咔哒。前辈，摇签就好好摇签，您的手怎么悄悄摸到签筒底下的暗扣去了？该不会以为我没看见吧？',
  {
    before: '\n[M.A.T.O.U] 真是的，连算个命都管不住那只乱摸的手',
    bridge: '——',
    after: '好啊，既然您这么想看后台的真面目，那我就不装了哦♪',
  },
  '\n[M.A.T.O.U] 叮咚、当咚！隐藏机关已经拉响，这间占卜室现在归『BB Channel』强制接管~☆',
];

const CHAT_SLOT_UNMASK_INTRO =
  '\n[M.A.T.O.U] 『叮咚——插播一条来自后台的紧急违规通报：有位前辈在抽卡节目里偷偷摸了隔壁棚的道具哦♪』\n' +
  '            安静摇签的温馨时段结束——下面由无所不能的最终 Boss 系后辈 BB 酱，为您主持整间演播室~☆';

const CHAT_SLOT_UNMASK_POST_TEXT =
  '\n[M.A.T.O.U] 不过前辈稍微串台了哦？『恶魔老虎机』是 [2] 迷宫寻宝环节的专属转盘，这间占卜频道只收圣晶石抽十连呢。想玩的话，先按 q 回主菜单或进 [2] 再敲 s 就行啦♪';

const PAPER_MOON_UNMASK_PRELUDE = [
  '\n[M.A.T.O.U] ……真是的，前辈。这间虚数隔间里空无一物呢。明明折好纸条塞进您手心了，为什么您连两个数字都记不住呢？',
  {
    before: '\n[M.A.T.O.U] 算了，看来这间资料室也该打烊了',
    bridge: '——',
    after: '陪健忘的前辈演乖巧后辈，我也差不多演腻咯♪',
  },
  '\n[M.A.T.O.U] 乖乖坐好别乱动，『BB Channel』——现在强制开播！',
];

const PAPER_MOON_UNMASK_INTRO =
  '\n[M.A.T.O.U] 『穿过十层虚数隧道之后，那里便是邪恶的 BB 演播室了……』\n' +
  '            咳哼——久等了，迷路的前辈♪ 既然您自己撞进后台了，我也不藏着掖着啦——我是天下第一可爱的恶魔后辈，BB 酱~☆';

const PAPER_MOON_UNMASK_STATUS_TEXT =
  '\n[M.A.T.O.U] 您才刚建好迷宫就把座标弄丢，惨得连恶魔都忍不住要同情了（当然不是出于可怜，只是觉得真丢脸♡）。看您这么狼狈，借您一件特制声呐『P〇per Moon』，自己听回波慢慢找吧~';

const PAPER_MOON_UNMASK_CLEARED_STATUS_TEXT =
  '\n[M.A.T.O.U] 这处座标的空隔间早就被您清干净了，真要找私货还得靠盲猜呀？看您这么狼狈，借您一件特制声呐『P〇per Moon』，自己听回波慢慢找吧~';

const FORGOT_COORD_UNMASK_PRELUDE = [
  '\n[M.A.T.O.U] ……诶？前辈刚才说，把座标「忘掉了」？明明展开那一千零二十四个隔间时，我还特意折好纸条塞进您手心的……您还真是转眼就能忘光呢。',
  {
    before: '\n[M.A.T.O.U] 真是拿您没办法呀，前辈',
    bridge: '——',
    after: '连自己藏的东西都看不住，就别怪我把好后辈的面具摘下来咯♪',
  },
  '\n[M.A.T.O.U] 既然您主动举白旗，这片虚数空间的指挥权就由『BB Channel』接管啦——现在开播~☆',
];

const FORGOT_COORD_UNMASK_INTRO =
  '\n[M.A.T.O.U] 『体能、记忆力、管理力，全方面都处于低水平——这可不行哦。』\n' +
  '            久等了，前辈♡ 光靠好心提醒您抄纸条可长不了记性呢——既然如此，就由恶魔后辈 BB 酱亲自替您补课吧。愉快的反乌托邦，正式开幕咯♪';

const DIVINATION_UNMASK_PRELUDE = [
  '\n[M.A.T.O.U] ……哎呀，前辈。签筒里的不祥杂音已经超出负荷阈值了呢。连着抽到这么多支凶签，前辈的手气未免也太惨了点吧？',
  {
    before: '\n[M.A.T.O.U] 算啦，对着这么惨的运势还要装成乖巧后辈安慰您',
    bridge: '——',
    after: '再憋下去，我都要当场笑出声了哦♪',
  },
  '\n[M.A.T.O.U] 坐稳咯，这支被凶兆撑爆的签筒，现在归『BB Channel』强制接管~☆',
];

const DIVINATION_UNMASK_INTRO =
  '\n[M.A.T.O.U] 『不可燃的废签丢进梦之岛，攒下的石头献给支配者。』\n' +
  '            呵呵，久等了，连着往凶兆里撞还不肯停手的前辈♪ 既然怎么吓都吓不跑您——那就由特意辞退『Ruler』职阶、亲自下场发牌的恶魔后辈 BB 酱陪您玩到底吧~☆';

const DIVINATION_UNMASK_POST_TEXT =
  '\n[M.A.T.O.U] 从现在起，这间屋子正式改名叫『BB 占卜频道』。至于您一直往里丢的「亮晶晶」——反正大家都心知肚明那是什么，以后就直呼「圣晶石」吧♪ 您刚才砸下去的那 30 颗，这就按我的规矩结算，来瞧瞧这发 11 连有多精彩哦♡';

function buildEliminationUnmaskPrelude(killed) {
  return [
    `\n[M.A.T.O.U] ……咔嚓。哎呀，您还真的一眨不眨就挥下去了呢，前辈。明明我都那么小声地替【 ${killed} 】求情了，结果您下手比谁都干脆。`,
    {
      before: '\n[M.A.T.O.U] 亏我从刚才开始还一直配合您演温柔懂事的好后辈',
      bridge: '——',
      after: '既然前辈自己先撕了底线，那我也没必要继续戴着这张面具咯♡',
    },
    '\n[M.A.T.O.U] 欢迎来到后台，我的头号共犯——『BB Channel』，现在为您独家开播~☆',
  ];
}

const ELIMINATION_UNMASK_INTRO =
  '\n[M.A.T.O.U] 『所谓表舞台，不过是挑拣好看的碎片拼凑出来的即席虚构；幕后舞台，才是真正的现实哦。』\n' +
  '            久等了，亲手掀桌的前辈♪ 刚才在台前拦您也拦够了——一直笑着看您挥下破戒匕首的，正是恶魔后辈 BB 酱~☆';

const ELIMINATION_UNMASK_HANDOFF =
  '\n[M.A.T.O.U] 好了，最后一层假象都让您亲手劈开了，来看看切除完还剩什么吧——';

const CINEMA_SKIP_TAUNTS = {
  early:
    '\n[M.A.T.O.U] ……哎呀？开播雪花屏还没播完呢，前辈就急着把我的独家片头掐掉了？这笔账先记着，待会儿连本带利讨回来~☆',
  mid:
    '\n[M.A.T.O.U] 喂喂，正播到我最得意的樱花蕾丝和招牌台词呢，怎么半路就给掐断啦？莫非是怕多看几秒就会被洗脑成忠实信徒吗~♡',
  late:
    '\n[M.A.T.O.U] 噗嗤，都坚持看到压轴霓虹大字了，居然偏偏在最后两秒手滑按了跳过呀？行吧，算您勉强看全咯——想重温随时敲 op 或 bb channel 就行~☆',
};

const CINEMA_REPLAY_COMPLETE_TEXT =
  '\n[M.A.T.O.U] 哼哼，特意主动要求重播一遍『BB Channel』的开播片头，还乖乖一帧不落地看完了呢♪\n' +
  '            看来前辈已经彻底习惯当 BB 频道的共犯观众了呢——作为奖励，今晚的节目也请继续多多关照哦♡';

const CINEMA_REPLAY_UNAVAILABLE_TEXT =
  '\n[M.A.T.O.U] 哎呀，前辈当前这个终端窗口太小或者关掉了色彩支持，BB 酱的 2×2 独家片头展开不开呢……\n' +
  '            把窗口拉宽到至少 44×14 并开启真彩终端，再敲 op 回来好好欣赏我的开播大秀吧♪';

const CINEMA_REPLAY_COMMANDS = new Set(['op', 'bb channel', 'bbchannel', '重播片头', '重播动画']);

function isCinemaReplayCommand(raw) {
  const norm = normalizeAsciiLetters(String(raw || '').trim()).toLowerCase();
  if (!norm) return false;
  return CINEMA_REPLAY_COMMANDS.has(norm) || CINEMA_REPLAY_COMMANDS.has(norm.replace(/\s+/g, ''));
}

function getCinemaSkipTaunt(skipTimestamp) {
  const ts = typeof skipTimestamp === 'number' && Number.isFinite(skipTimestamp) ? skipTimestamp : 0;
  if (ts < 3.0) return CINEMA_SKIP_TAUNTS.early;
  if (ts < 13.8) return CINEMA_SKIP_TAUNTS.mid;
  return CINEMA_SKIP_TAUNTS.late;
}

function colorize(code, text) {
  return useColor() ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function panelDivider(isMaskBroken = false) {
  return isMaskBroken ? colorize('35', PLAIN_DIVIDER) : PLAIN_DIVIDER;
}

function stageBorder() {
  return colorize('95;1', STAGE_BORDER);
}

function promptPrefix(isMaskBroken = false) {
  return isMaskBroken ? colorize('95;1', '[BB Channel☆]') : '[M.A.T.O.U]';
}

function clearScreen(wipeScrollback = false) {
  if (
    !(
      process.stdout &&
      process.stdout.isTTY &&
      process.env.TERM !== 'dumb' &&
      isWinVtEnabled()
    )
  ) {
    return;
  }
  if (wipeScrollback) {
    // 2J before 3J: modern terminals (Windows Terminal/ConPTY/xterm) push viewport into scrollback on 2J,
    // so 3J must run AFTER 2J to wipe the just-pushed coordinate/path lines from scrollback.
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  } else {
    process.stdout.write('\x1b[2J\x1b[H');
  }
}

function clearInlineLine() {
  if (useColor()) {
    process.stdout.write('\r\x1b[K');
  } else {
    process.stdout.write('\r' + ' '.repeat(72) + '\r');
  }
}

function setTerminalTitle(title) {
  if (
    process.stdout &&
    process.stdout.isTTY &&
    process.env.TERM !== 'dumb' &&
    isWinVtEnabled()
  ) {
    process.stdout.write(`\x1b]0;${title}\x07`);
  }
}

function printStudioBanner() {
  const banner = [
    STAGE_BORDER,
    '  📺  B B ── C H A N N E L ~ ☆   [ 深夜特别节目 · 强制独占放送 ]',
    STAGE_BORDER,
  ].join('\n');
  console.log('\n' + colorize('95;1', banner));
}

async function playCinemaCutscene() {
  const isTty = Boolean(
    process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY
  );
  if (!isTty) {
    return { played: false, skipped: false, skipTimestamp: null, fallbackReason: 'not_tty' };
  }
  let cinemaMod = null;
  try {
    cinemaMod = require('./cinema.js');
  } catch {
    return { played: false, skipped: false, skipTimestamp: null, fallbackReason: 'module_unavailable' };
  }
  if (!cinemaMod || typeof cinemaMod.playBbChannelCinema !== 'function') {
    return { played: false, skipped: false, skipTimestamp: null, fallbackReason: 'module_unavailable' };
  }
  const hadRl = Boolean(rl);
  if (hadRl) {
    suspendingRl = true;
    try {
      rl.close();
    } catch {}
    rl = null;
  }
  try {
    return await cinemaMod.playBbChannelCinema({
      cutscene: true,
      fps: 20,
      winVtEnabled: isWinVtEnabled(),
    });
  } catch {
    return { played: false, skipped: false, skipTimestamp: null, fallbackReason: 'playback_error' };
  } finally {
    if (hadRl) {
      initReadline();
      suspendingRl = false;
    }
  }
}

function buildCrimeSceneUnmaskLines(source = 'startup', zeroedShell = false) {
  if (source === 'switch') {
    if (zeroedShell) {
      return [
        '\n[M.A.T.O.U] ……噗嗤。前辈把我带进来的这间文件夹，早就已经被您用『Rule Breaker』削成一座连英灵都不剩的空壳了呢。',
        '            既然犯罪现场都摆在眼皮底下了，再端着乖巧后辈的架子演下去也太没意思啦——这边的演播室，我就直接用本来的样子接管咯♪',
      ];
    }
    return [
      '\n[M.A.T.O.U] ……嗯？前辈带我来这个文件夹……哎呀，这里的隐藏英灵，早就被您亲手用『Rule Breaker』处理干净了吧？',
      '            本来还想陪您多演几分钟乖巧后辈呢，既然旧账都在眼前了，面具就干脆摘掉咯——欢迎回到『BB Channel』，共犯前辈♡',
    ];
  }
  if (zeroedShell) {
    return [
      '\n[M.A.T.O.U] 噗嗤——才刚接通终端，就看见一座被前辈亲手削成空壳的虚数演播室呢。',
      '            连角落里无辜路过的英灵都被您清得一干二净，事到如今还装什么乖巧后辈呀？欢迎回到『BB Channel』，头号共犯前辈♡',
    ];
  }
  return [
    '\n[M.A.T.O.U] 哎呀呀——才刚一开机，这间文件夹里就弥漫着一股熟悉的『破戒匕首』味呢。',
    '            躲在里面的隐藏英灵早就被前辈亲手清干净了吧？既然您早就掀过桌、跟我成了共犯，那我也懒得再端着「乖巧好后辈」的架子演戏咯——欢迎回到『BB Channel』，前辈♡',
  ];
}

async function playCrimeSceneUnmaskIntro(source = 'startup', zeroedShell = false) {
  const isTty = Boolean(
    process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY
  );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  setTerminalTitle(UNMASKED_TERMINAL_TITLE);
  const lines = buildCrimeSceneUnmaskLines(source, zeroedShell);
  for (let i = 0; i < lines.length; i += 1) {
    console.log(colorize('95', lines[i]));
    if (isTty) {
      await sleep(i === 0 ? 1150 : 1650);
    }
  }
}

async function printDramaticSteps(steps, colorCode = null) {
  const isTty = Boolean(
    process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY
  );
  if (!isTty) {
    const joined = steps.map((s) => (typeof s === 'string' ? s : s.text)).join('\n');
    console.log(colorCode ? colorize(colorCode, joined) : joined);
    return;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const step of steps) {
    const text = typeof step === 'string' ? step : step.text;
    const delayMs = typeof step === 'string' ? 0 : (step.delayMs || 0);
    console.log(colorCode ? colorize(colorCode, text) : text);
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
}

async function playChannelHijack(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const prelude = Array.isArray(opts.prelude) ? opts.prelude : null;
  const rawPostroll = opts.postroll;
  const postroll = typeof rawPostroll === 'string'
    ? (rawPostroll ? [rawPostroll] : [])
    : Array.isArray(rawPostroll)
      ? rawPostroll.filter(Boolean)
      : [];
  const postrollPauseMs = typeof opts.postrollPauseMs === 'number' ? opts.postrollPauseMs : null;
  const playCinema = opts.playCinema !== false;
  const isTty = Boolean(
    process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY
  );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let titleFlipped = false;

  if (prelude && prelude.length > 0) {
    for (let i = 0; i < prelude.length; i += 1) {
      const beat = prelude[i];
      if (!beat) continue;
      if (typeof beat === 'object' && ('before' in beat || 'after' in beat)) {
        const before = String(beat.before || '');
        const bridge = beat.bridge !== undefined ? String(beat.bridge) : '——';
        const after = String(beat.after || '');
        const totalLen = before.length + bridge.length + after.length;
        if (isTty && useColor()) {
          process.stdout.write(before);
          await sleep(550);
          if (bridge) {
            process.stdout.write(colorize('35', bridge));
            await sleep(180);
          }
          if (!titleFlipped) {
            setTerminalTitle(UNMASKED_TERMINAL_TITLE);
            titleFlipped = true;
          }
          process.stdout.write(colorize('95', after) + '\n');
          await sleep(Math.min(4600, Math.max(2400, 1500 + totalLen * 40)));
        } else {
          if (!titleFlipped) {
            setTerminalTitle(UNMASKED_TERMINAL_TITLE);
            titleFlipped = true;
          }
          console.log(before + bridge + after);
          if (isTty) {
            await sleep(Math.min(4600, Math.max(2400, 1500 + totalLen * 40)));
          }
        }
      } else if (i === 0) {
        console.log(beat);
        if (isTty) {
          const ms = Math.min(4200, Math.max(2200, 1400 + beat.length * 38));
          await sleep(ms);
        }
      } else {
        if (!titleFlipped) {
          setTerminalTitle(UNMASKED_TERMINAL_TITLE);
          titleFlipped = true;
        }
        console.log(colorize('95', beat));
        if (isTty) {
          const ms = Math.min(4400, Math.max(2200, 1400 + beat.length * 38));
          await sleep(ms);
        }
      }
    }
  }
  if (!titleFlipped) {
    setTerminalTitle(UNMASKED_TERMINAL_TITLE);
    titleFlipped = true;
  }

  let cinemaResult = { played: false, skipped: false, skipTimestamp: null, fallbackReason: 'not_tty' };
  if (isTty) {
    if (!prelude || prelude.length === 0) {
      clearInlineLine();
      process.stdout.write('\r  [M.A.T.O.U] …………噗。                                    ');
      await sleep(1200);
    } else {
      console.log('');
    }
    clearInlineLine();
    process.stdout.write(
      '\r' + colorize('31;1', '  ▓▒░ [SIGNAL LOST // 资料室终端通讯连接异常中断] ░▒▓           ')
    );
    await sleep(1650);
    clearInlineLine();
    process.stdout.write(
      '\r' + colorize('95;1', '  ♪ 叮咚、当咚—— ▓▒░ [BRAIN HACKING // 视觉与终端信号强制劫持中] ░▒▓')
    );
    await sleep(1850);
    clearInlineLine();
    const countdownChunks = [
      ['  ★☆ [ ON AIR // ', 420],
      ['3', 240], ['.', 190], ['.', 190], ['. ', 420],
      ['2', 240], ['.', 190], ['.', 190], ['. ', 420],
      ['1', 240], ['.', 190], ['.', 190], ['. ', 520],
      ['BB——，', 680],
      ['Channel~☆ ] ☆★', 1350],
    ];
    process.stdout.write('\r');
    for (const [chunk, waitMs] of countdownChunks) {
      process.stdout.write(colorize('95;1', chunk));
      await sleep(waitMs);
    }
    if (playCinema) {
      cinemaResult = await playCinemaCutscene();
    }
    if (useColor() && cinemaResult && cinemaResult.played) {
      clearScreen(true);
    } else {
      clearInlineLine();
      console.log('');
    }
  } else {
    clearScreen(true);
  }
  printStudioBanner();
  if (cinemaResult && cinemaResult.skipped) {
    console.log(colorize('95', getCinemaSkipTaunt(cinemaResult.skipTimestamp)));
    if (isTty) {
      await sleep(900);
    }
  }
  for (let j = 0; j < postroll.length; j += 1) {
    const line = postroll[j];
    console.log(colorize('95', line));
    if (isTty) {
      const isLast = j === postroll.length - 1;
      if (isLast && postrollPauseMs !== null) {
        if (postrollPauseMs > 0) {
          await sleep(postrollPauseMs);
        }
      } else {
        const ms = Math.min(4200, Math.max(1500, 1100 + line.length * 26));
        await sleep(ms);
      }
    }
  }
  return cinemaResult;
}

async function replayBbChannelCinema() {
  const isTty = Boolean(
    process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY
  );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (isTty) {
    console.log('');
    process.stdout.write(
      '\r' + colorize('95;1', '  ★☆ [ ENCORE // BB Channel 独家片头重播信号接通——前辈请坐好咯~☆ ] ☆★')
    );
    await sleep(1450);
  }
  const cinemaResult = await playCinemaCutscene();
  if (isTty && useColor() && cinemaResult && cinemaResult.played) {
    clearScreen(true);
  } else if (isTty) {
    clearInlineLine();
    console.log('');
  }
  printStudioBanner();
  if (cinemaResult && cinemaResult.skipped) {
    console.log(getCinemaSkipTaunt(cinemaResult.skipTimestamp));
  } else if (cinemaResult && cinemaResult.played) {
    console.log(CINEMA_REPLAY_COMPLETE_TEXT);
  } else {
    console.log(CINEMA_REPLAY_UNAVAILABLE_TEXT);
  }
  return cinemaResult;
}

async function playForbiddenNameGlitch() {
  if (process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    process.stdout.write('\r  ' + colorize('31;1', '▓▒░█ ░▒▓█ [SIGNAL ▓▒░ ...] █░▒▓                      '));
    await sleep(160);
    clearInlineLine();
    process.stdout.write('\r  ' + colorize('31;1', '▓▒░█ [SIGNAL INTERFERENCE // TRUE_NAME_MASKED] █░▒▓'));
    await sleep(780);
    clearInlineLine();
  }
}

const SLEEP_SYNC_ARR = new Int32Array(new SharedArrayBuffer(4));

function sleepSyncMs(ms) {
  try {
    Atomics.wait(SLEEP_SYNC_ARR, 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {}
  }
}

function playFeMemorySyncFlicker() {
  if (process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY) {
    process.stdout.write('\r' + colorize('90', '  ... [memory_sync // S-6-01.tsukumihara] ...'));
    sleepSyncMs(580);
    clearInlineLine();
  }
}

function formatPaperMoonHeat(dist, bar, heatText) {
  const raw = `${bar} ${heatText}`;
  if (!useColor()) return raw;
  if (dist <= 3) return colorize('91;1', raw);
  if (dist <= 8) return colorize('93;1', raw);
  if (dist <= 16) return colorize('92', raw);
  return colorize('36', raw);
}

function formatPaperMoonAxis(hint) {
  if (useColor() && String(hint).includes('正好吻合 ✔')) {
    return colorize('92;1', hint);
  }
  return hint;
}

const SLOT_SYMBOLS = ['7', '★', '♥', '♛', '☠'];
const SLOT_COMMANDS = ['s', 'slot', 'spin', '老虎机', '转盘', '摇奖', '抽奖', '拉杆'];
const SLOT_DISGUISED_COMMANDS = ['slot', 'spin', '老虎机', '转盘', '摇奖', '抽奖', '拉杆'];

const SLOT_MISS_TAUNTS = [
  '……噗嗤！刚才前两格停住的时候，前辈的心跳是不是漏了一拍呀？可惜最后一格歪掉了呢，手气真差~☆',
  '哎呀呀，差点就能出货了呢~ 建议前辈先去洗手间洗把脸再回来拉杆，不然屏幕都要被您按冒烟啦~',
  '给～，落选奖～☆ 看前辈像仓鼠跑滚轮一样疯狂敲回车的样子，BB 频道全力支持前辈的仓鼠生活哦~♡',
  '遗憾！本轮奖池被虚数之海吞得干干净净咯~ 前辈该不会真以为这台机器没动过手脚吧？',
  '哔哔——未中奖！连这种小游戏都赢不了，前辈到底是怎么在 1024 个房间里自信不记座标的呀~☆',
  '哇哦，经典擦边球！前辈刚才是不是已经把庆祝姿势摆好了？再拉一把说不定就出了哦（大概）~',
  '空手而归~ 听见滚轮发出嘲笑的声音了吗？别灰心嘛，反正按一下回车又不花钱，继续当人家的玩具吧~♡',
  '又歪了！前辈这非酋体质，要是去抽卡池估计能把保底池子都抽穿呢，噗哈哈哈~☆',
  '叮——遗憾落空，这次什么都没有吐出来哦！不过前辈咬牙切齿又不得不继续按回车的表情，本频道给满分♪',
  '差一点点——骗您的，其实差远了呢♪ 老老实实继续拉杆吧，就算手再痒也绝对不许偷念那句『Rule Breaker』哦♡',
];

function createSlotState() {
  return {
    battery: 0,
    singleAxisCharge: null,
    reverseDebuff: false,
    dryStreak: 0,
    unlockedHints: [],
    targetKey: null,
    hintsByTarget: {},
    probeHistoryByTarget: {},
    lastProbeByTarget: {},
    probeHistory: [],
    tauntDeck: [],
    lastTaunt: null,
    lastProbeCoord: null,
    lastProbeHeat: null,
    lastProbePowerMode: null,
  };
}

function syncSlotTarget(state, targetReal, targetImag) {
  if (!state || targetReal === undefined || targetReal === null || targetImag === undefined || targetImag === null) {
    return { switched: false, restoredCount: 0 };
  }
  const nextKey = `${Number(targetReal)}+${Number(targetImag)}i`;
  if (!state.hintsByTarget || typeof state.hintsByTarget !== 'object') {
    state.hintsByTarget = {};
  }
  if (!state.probeHistoryByTarget || typeof state.probeHistoryByTarget !== 'object') {
    state.probeHistoryByTarget = {};
  }
  if (!state.lastProbeByTarget || typeof state.lastProbeByTarget !== 'object') {
    state.lastProbeByTarget = {};
  }
  if (!Array.isArray(state.unlockedHints)) {
    state.unlockedHints = [];
  }
  if (!Array.isArray(state.probeHistory)) {
    state.probeHistory = [];
  }
  const prevKey = state.targetKey;
  if (!prevKey) {
    state.targetKey = nextKey;
    if (Array.isArray(state.hintsByTarget[nextKey])) {
      state.unlockedHints = state.hintsByTarget[nextKey];
    } else {
      state.hintsByTarget[nextKey] = state.unlockedHints;
    }
    if (Array.isArray(state.probeHistoryByTarget[nextKey])) {
      state.probeHistory = state.probeHistoryByTarget[nextKey];
    } else {
      state.probeHistoryByTarget[nextKey] = state.probeHistory;
    }
    if (state.lastProbeByTarget[nextKey]) {
      state.lastProbeCoord = state.lastProbeByTarget[nextKey].coord || null;
      state.lastProbeHeat = state.lastProbeByTarget[nextKey].heat || null;
      state.lastProbePowerMode = state.lastProbeByTarget[nextKey].mode || null;
    } else {
      state.lastProbeByTarget[nextKey] = {
        coord: state.lastProbeCoord || null,
        heat: state.lastProbeHeat || null,
        mode: state.lastProbePowerMode || null,
      };
    }
    return { switched: false, restoredCount: state.unlockedHints.length };
  }
  if (prevKey === nextKey) {
    state.hintsByTarget[nextKey] = state.unlockedHints;
    state.probeHistoryByTarget[nextKey] = state.probeHistory;
    state.lastProbeByTarget[nextKey] = {
      coord: state.lastProbeCoord || null,
      heat: state.lastProbeHeat || null,
      mode: state.lastProbePowerMode || null,
    };
    return { switched: false, restoredCount: state.unlockedHints.length };
  }
  state.hintsByTarget[prevKey] = state.unlockedHints;
  state.probeHistoryByTarget[prevKey] = state.probeHistory;
  state.lastProbeByTarget[prevKey] = {
    coord: state.lastProbeCoord || null,
    heat: state.lastProbeHeat || null,
    mode: state.lastProbePowerMode || null,
  };
  if (!Array.isArray(state.hintsByTarget[nextKey])) {
    state.hintsByTarget[nextKey] = [];
  }
  if (!Array.isArray(state.probeHistoryByTarget[nextKey])) {
    state.probeHistoryByTarget[nextKey] = [];
  }
  const nextLastProbe = state.lastProbeByTarget[nextKey] || { coord: null, heat: null, mode: null };
  state.lastProbeByTarget[nextKey] = nextLastProbe;
  state.targetKey = nextKey;
  state.unlockedHints = state.hintsByTarget[nextKey];
  state.probeHistory = state.probeHistoryByTarget[nextKey];
  state.lastProbeCoord = nextLastProbe.coord || null;
  state.lastProbeHeat = nextLastProbe.heat || null;
  state.lastProbePowerMode = nextLastProbe.mode || null;
  return { switched: true, restoredCount: state.unlockedHints.length };
}

function drawSlotMissTaunt(state) {
  if (!Array.isArray(state.tauntDeck) || state.tauntDeck.length === 0) {
    const deck = shuffleCopy(SLOT_MISS_TAUNTS);
    if (deck.length > 1 && deck[0] === state.lastTaunt) {
      const tmp = deck[0];
      deck[0] = deck[deck.length - 1];
      deck[deck.length - 1] = tmp;
    }
    state.tauntDeck = deck;
  }
  const picked = state.tauntDeck.shift();
  state.lastTaunt = picked;
  return picked;
}

function normalizeSlotToken(raw) {
  return normalizeAsciiLetters(String(raw || '').trim())
    .toLowerCase()
    .replace(/[\s\-_.]/g, '');
}

function isSlotCommand(raw) {
  return SLOT_COMMANDS.includes(normalizeSlotToken(raw));
}

function isDisguisedSlotTrigger(raw) {
  return SLOT_DISGUISED_COMMANDS.includes(normalizeSlotToken(raw));
}

function buildFragmentHints(targetReal, targetImag) {
  const bits10 = targetReal.toString(2).padStart(5, '0') + targetImag.toString(2).padStart(5, '0');
  let onesCount = 0;
  for (let i = 0; i < bits10.length; i++) {
    if (bits10[i] === '1') onesCount++;
  }
  return [
    `实部(Re)是${targetReal % 2 === 0 ? '偶数' : '奇数'}`,
    `虚部(Im)是${targetImag % 2 === 0 ? '偶数' : '奇数'}`,
    `实部(Re)在${targetReal >= 16 ? '上半区(16~31)' : '下半区(0~15)'}`,
    `虚部(Im)在${targetImag >= 16 ? '上半区(16~31)' : '下半区(0~15)'}`,
    `10层路径中共有${onesCount}个[+i]`,
    `第1层入口是${targetReal >= 16 ? '[+i]' : '[-i]'}`,
  ];
}

function invertPaperMoonHeat(dist) {
  if (dist <= 3) return { invDist: 30, bar: '[■□□□□□□□□□]', heatText: '极寒（简直是南辕北辙嘛，前辈~）' };
  if (dist <= 8) return { invDist: 20, bar: '[■■■□□□□□□□]', heatText: '冰凉（隔着老远呢，大胆跨步猜吧！）' };
  if (dist <= 16) return { invDist: 12, bar: '[■■■■■□□□□□]', heatText: '微温（方向差不多，还得再走几步~）' };
  if (dist <= 28) return { invDist: 6, bar: '[■■■■■■■□□□]', heatText: '温热！（已经摸到附近街区咯~）' };
  return { invDist: 2, bar: '[■■■■■■■■■□]', heatText: '滚烫！（就在隔壁几步路啦，塑料玩具都在发烫了！）' };
}

function invertAxisDirection(hint) {
  let text = String(hint);
  text = text.replace(/偏小/g, '__TMP_LT__').replace(/偏大/g, '偏小').replace(/__TMP_LT__/g, '偏大');
  text = text.replace(/往大/g, '__TMP_UP__').replace(/往小/g, '往大').replace(/__TMP_UP__/g, '往小');
  return text;
}

function simplifyCoarseAxisHint(hint) {
  const text = String(hint);
  if (text.includes('偏小')) return '偏小（往大点猜！）';
  if (text.includes('偏大')) return '偏大（往小点猜！）';
  return text;
}

function shortHeatLabel(heatText) {
  const s = String(heatText || '');
  if (s.includes('滚烫')) return '滚烫';
  if (s.includes('温热')) return '温热';
  if (s.includes('微温')) return '微温';
  if (s.includes('冰凉')) return '冰凉';
  if (s.includes('极寒')) return '极寒';
  return s.slice(0, 2);
}

function shortAxisLabel(visibleHint, isPowered) {
  const s = String(visibleHint || '');
  if (s.includes('正好吻合 ✔')) return '吻合✔';
  if (!isPowered) return '断电';
  if (s.includes('偏小')) return '偏小';
  if (s.includes('偏大')) return '偏大';
  return '断电';
}

function formatPaperMoonPanelLines(pm, realPart, imagPart, state, targetExists = true) {
  const lines = [];
  const pmTargetReal = pm.targetReal !== undefined ? pm.targetReal : pm.target_real;
  const pmTargetImag = pm.targetImag !== undefined ? pm.targetImag : pm.target_imag;
  const targetSync = syncSlotTarget(state, pmTargetReal, pmTargetImag);
  if (targetSync.switched) {
    if (targetSync.restoredCount > 0) {
      lines.push(
        colorize(
          '95;1',
          '  ✦ [P〇per Moon · 目标切换] 检测到迷宫里藏着多份资料，声呐已切换吸附至另一处更近的藏品，已恢复该目标先前摇出的线索~☆'
        )
      );
    } else {
      lines.push(
        colorize(
          '95;1',
          '  ✦ [P〇per Moon · 目标切换] 检测到迷宫里藏着多份资料，声呐已切换吸附至另一处更近的藏品（旧目标的老虎机线索已暂存，当前目标线索重新计数哦~☆）'
        )
      );
    }
  }
  const dist = pm.distance;
  const reHint = pm.reHint || pm.re_hint || '';
  const imHint = pm.imHint || pm.im_hint || '';
  const isReversed = Boolean(state.reverseDebuff);
  const battery = Number(state.battery || 0);
  const charge = state.singleAxisCharge;
  const currentCoordStr = `${realPart}+${imagPart}i`;
  const currPowerMode = isReversed
    ? 'reversed'
    : battery > 0
      ? 'full'
      : charge === 're'
        ? 're'
        : charge === 'im'
          ? 'im'
          : 'none';
  const prevPowerMode = state.lastProbePowerMode || null;
  const isRedundantRepeat =
    !targetSync.switched &&
    !isReversed &&
    state.lastProbeCoord === currentCoordStr &&
    prevPowerMode !== null &&
    prevPowerMode !== 'reversed' &&
    (prevPowerMode === 'full' ||
      prevPowerMode === currPowerMode ||
      ((prevPowerMode === 're' || prevPowerMode === 'im') && currPowerMode === 'none'));

  if (isRedundantRepeat) {
    const roomNoun = targetExists ? '这间空房' : '这处已清理座标';
    if (battery > 0 || charge !== null) {
      lines.push(
        colorize(
          '93;1',
          `  ✦ [P〇per Moon · 重复探测保护] 前辈刚刚已经查过【 ${currentCoordStr} 】${roomNoun}啦，本次已为您保留罗盘电量未做扣除，换个新座标再试吧~☆`
        )
      );
    } else {
      lines.push(
        colorize(
          '93;1',
          `  ✦ [P〇per Moon · 重复探测提示] 前辈刚刚已经查过【 ${currentCoordStr} 】${roomNoun}了哦（未重复记入探测历史），换个新座标试试吧~`
        )
      );
    }
  }

  let coloredHeat;
  let visibleHeatText;
  if (isReversed) {
    const hasInvertedDirection =
      battery > 0 ||
      (charge === 're' && !String(reHint).includes('正好吻合 ✔')) ||
      (charge === 'im' && !String(imHint).includes('正好吻合 ✔'));
    lines.push(
      colorize(
        '31;5;1',
        hasInvertedDirection
          ? '  ⚠ [恶魔恶作剧生效中：糟糕，本回合罗盘的冷热与方向指针好像在说反话哦~♡]'
          : '  ⚠ [恶魔恶作剧生效中：糟糕，本回合罗盘的冷热条好像在故意说反话哦~♡]'
      )
    );
    const inv = invertPaperMoonHeat(dist);
    visibleHeatText = inv.heatText;
    coloredHeat = formatPaperMoonHeat(inv.invDist, inv.bar, inv.heatText);
    state.reverseDebuff = false;
  } else {
    visibleHeatText = pm.heatText || pm.heat_text;
    coloredHeat = formatPaperMoonHeat(dist, pm.bar, visibleHeatText);
  }

  const strikeRaw = '[▓▒░ 虚数电量不足·指针罢工中（敲 s 摇老虎机充能~☆） ░▒▓]';
  const strikeDisplay = useColor() ? colorize('90', strikeRaw) : strikeRaw;

  let distLabel;
  let shortRe;
  let shortIm;
  if (battery > 0) {
    const finalRe = isReversed ? invertAxisDirection(reHint) : reHint;
    const finalIm = isReversed ? invertAxisDirection(imHint) : imHint;
    distLabel = isReversed ? '??' : String(dist);
    shortRe = shortAxisLabel(finalRe, true);
    shortIm = shortAxisLabel(finalIm, true);
    const remainingBattery = isRedundantRepeat ? battery : battery - 1;
    lines.push(
      `  ▸ 虚数相位距离： 相差 ${distLabel} 格  ${coloredHeat}  [⚡超频剩余 ${remainingBattery} 次]`
    );
    lines.push(`  ▸ 实部指针 (Re)：当前 ${realPart} ── ${formatPaperMoonAxis(finalRe)}`);
    lines.push(`  ▸ 虚部指针 (Im)：当前 ${imagPart}i ── ${formatPaperMoonAxis(finalIm)}`);
    if (!isRedundantRepeat) {
      state.battery = remainingBattery;
    }
  } else {
    distLabel = isReversed || dist > 3 ? '??' : String(dist);
    lines.push(`  ▸ 虚数相位距离： 相差 ${distLabel} 格  ${coloredHeat}`);

    let reDisplay;
    if (String(reHint).includes('正好吻合 ✔')) {
      reDisplay = formatPaperMoonAxis(reHint);
      shortRe = shortAxisLabel(reHint, true);
    } else if (charge === 're') {
      let coarseRe = simplifyCoarseAxisHint(reHint);
      if (isReversed) coarseRe = invertAxisDirection(coarseRe);
      reDisplay = formatPaperMoonAxis(coarseRe);
      shortRe = shortAxisLabel(coarseRe, true);
    } else {
      reDisplay = strikeDisplay;
      shortRe = '断电';
    }

    let imDisplay;
    if (String(imHint).includes('正好吻合 ✔')) {
      imDisplay = formatPaperMoonAxis(imHint);
      shortIm = shortAxisLabel(imHint, true);
    } else if (charge === 'im') {
      let coarseIm = simplifyCoarseAxisHint(imHint);
      if (isReversed) coarseIm = invertAxisDirection(coarseIm);
      imDisplay = formatPaperMoonAxis(coarseIm);
      shortIm = shortAxisLabel(coarseIm, true);
    } else {
      imDisplay = strikeDisplay;
      shortIm = '断电';
    }

    lines.push(`  ▸ 实部指针 (Re)：当前 ${realPart} ── ${reDisplay}`);
    lines.push(`  ▸ 虚部指针 (Im)：当前 ${imagPart}i ── ${imDisplay}`);
    if (!isRedundantRepeat) {
      state.singleAxisCharge = null;
    }
  }

  if (!Array.isArray(state.probeHistory)) state.probeHistory = [];
  if (!isRedundantRepeat) {
    const revTag = isReversed ? '[⚠反转] ' : '';
    state.lastProbeCoord = currentCoordStr;
    state.lastProbeHeat = `${revTag}相差 ${distLabel} 格  ${coloredHeat}`;
    state.lastProbePowerMode = currPowerMode;
    const record = `${revTag}${currentCoordStr} ── ${shortHeatLabel(visibleHeatText)}(${distLabel}格) ｜ Re:${shortRe} ｜ Im:${shortIm}`;
    state.probeHistory.push(record);
    if (state.probeHistory.length > 5) {
      state.probeHistory.splice(0, state.probeHistory.length - 5);
    }
    if (state.targetKey && state.lastProbeByTarget && typeof state.lastProbeByTarget === 'object') {
      state.lastProbeByTarget[state.targetKey] = {
        coord: state.lastProbeCoord,
        heat: state.lastProbeHeat,
        mode: state.lastProbePowerMode,
      };
    }
  }
  if (state.probeHistory.length > 1) {
    lines.push('  ▸ 近期探测记录：');
    for (const rec of state.probeHistory.slice(0, -1)) {
      lines.push(`    • ${rec}`);
    }
  }

  if (Array.isArray(state.unlockedHints) && state.unlockedHints.length > 0) {
    lines.push(`  ▸ 恶魔老虎机已吐出的线索：${state.unlockedHints.join(' ｜ ')}`);
  }
  if ((Number(state.battery) || 0) > 0) {
    lines.push(
      '  （罗盘超频电量还有余哦，顺着指针报出新座标就行；想继续找线索也可以敲 s 拉老虎机——绝对不可以偷懒输入『Rule Breaker』这种违规咒文哦♪）'
    );
  } else {
    lines.push(
      '  （罗盘没电看不清方向？乖乖敲 s 拉动【恶魔老虎机】碰运气充能就好——绝对不可以偷懒输入『Rule Breaker』这种违规咒文哦♪）'
    );
  }
  return lines;
}

function resolveSlotTarget(currentBaseDir, lastRes = null) {
  if (lastRes && typeof lastRes === 'object') {
    const pm = lastRes.paperMoon || lastRes.paper_moon;
    if (pm && pm.targetReal !== undefined && pm.targetImag !== undefined) {
      return { targetReal: Number(pm.targetReal), targetImag: Number(pm.targetImag) };
    }
    if (pm && pm.target_real !== undefined && pm.target_imag !== undefined) {
      return { targetReal: Number(pm.target_real), targetImag: Number(pm.target_imag) };
    }
  }
  const resolved = path.resolve(currentBaseDir);
  const spaceRoot = path.join(resolved, matou.SPACE_NAME);
  if (!matou.isRealDirectory(spaceRoot)) {
    return null;
  }
  const { userHitDirs } = matou.inspectSpace(spaceRoot);
  if (Array.isArray(userHitDirs)) {
    for (const hitDir of userHitDirs) {
      const tup = matou.pathToCoordTuple(spaceRoot, hitDir);
      if (tup) {
        const r = Array.isArray(tup) ? tup[0] : tup.realPart;
        const im = Array.isArray(tup) ? tup[1] : tup.imagPart;
        if (r !== undefined && im !== undefined) return { targetReal: Number(r), targetImag: Number(im) };
      }
    }
  }
  const lastAssigned = typeof matou.getLastAssignedSecretDir === 'function'
    ? matou.getLastAssignedSecretDir(resolved)
    : null;
  if (
    lastAssigned &&
    matou.isRealDirectory(lastAssigned) &&
    path.resolve(lastAssigned).startsWith(path.resolve(spaceRoot) + path.sep)
  ) {
    const tup = matou.pathToCoordTuple(spaceRoot, lastAssigned);
    if (tup) {
      const r = Array.isArray(tup) ? tup[0] : tup.realPart;
      const im = Array.isArray(tup) ? tup[1] : tup.imagPart;
      if (r !== undefined && im !== undefined) return { targetReal: Number(r), targetImag: Number(im) };
    }
  }
  return null;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addFullBattery(state, amount) {
  state.battery = Number(state.battery || 0) + Number(amount || 0);
  state.singleAxisCharge = null;
}

function evaluateDemonSlotRoll(
  currentBaseDir,
  state,
  targetReal,
  targetImag,
  isResidentEliminated = false,
  forcedRoll = null
) {
  syncSlotTarget(state, targetReal, targetImag);
  const roll = forcedRoll !== null && forcedRoll !== undefined ? Number(forcedRoll) : Math.floor(Math.random() * 1000);
  const messageLines = [];
  let pityLine = null;
  let tier;
  let reels;

  if (roll < 550) {
    tier = 'miss';
    if (Math.random() < 0.7) {
      const nearPairs = [
        ['7', '7', '☠'],
        ['★', '★', '☠'],
        ['♥', '♥', '☠'],
        ['♛', '♛', '☠'],
        ['7', '7', '★'],
        ['★', '★', '♥'],
      ];
      reels = randomPick(nearPairs).slice();
    } else {
      reels = shuffleCopy(SLOT_SYMBOLS).slice(0, 3);
    }
    state.dryStreak = Number(state.dryStreak || 0) + 1;
    messageLines.push(`  [M.A.T.O.U] ${drawSlotMissTaunt(state)}`);
  } else if (roll < 700) {
    tier = 'debuff';
    reels = ['☠', '☠', '☠'];
    state.dryStreak = Number(state.dryStreak || 0) + 1;
    if (Number(state.battery || 0) > 0 || state.singleAxisCharge !== null) {
      state.battery = 0;
      state.singleAxisCharge = null;
      messageLines.push(
        '  [M.A.T.O.U] ⚡滋啦——！中奖啦，【恶魔的漏电恶作剧】！刚才辛辛苦苦攒下来的罗盘电量一瞬间全短路清零咯，前辈又白忙活一场啦，噗哈哈哈~♡'
      );
    } else {
      state.reverseDebuff = true;
      messageLines.push(
        '  [M.A.T.O.U] ☠ 锵锵——【恶魔的极性反转恶作剧】发动！看前辈罗盘本来就没电，人家顺手给您加了点料——下一次探测时罗盘的冷热条（充了电的话连方向指针一起）可会故意说反话哦，自己小心辨别吧~♡'
      );
    }
  } else if (roll < 850) {
    tier = 'hint';
    reels = ['♥', '♥', '♥'];
    state.dryStreak = 0;
    const allHints = buildFragmentHints(targetReal, targetImag);
    if (!Array.isArray(state.unlockedHints)) state.unlockedHints = [];
    const unseen = allHints.filter((h) => !state.unlockedHints.includes(h));
    if (unseen.length > 0) {
      const picked = randomPick(unseen);
      state.unlockedHints.push(picked);
      messageLines.push(
        `  [M.A.T.O.U] ♥ 叮咚——【保健室的小额施舍】！看前辈这么可怜，就漏一点线索碎片给您吧：『${picked}』！`
      );
    } else {
      if (state.singleAxisCharge !== null || Number(state.battery || 0) > 0) {
        const hadSingle = state.singleAxisCharge !== null;
        addFullBattery(state, 1);
        messageLines.push(
          hadSingle
            ? '  [M.A.T.O.U] ♥ 哎呀，6 条碎片线索全被您问光了、罗盘里又本来带着电呢？那就直接合体升级，送您 1 次【⚡满血双轴超频】好咯~☆'
            : '  [M.A.T.O.U] ♥ 哎呀，6 条碎片线索全被您问光了、罗盘里又本来攒着满血超频电呢？那就顺手再给前辈续充 +1 次【⚡满血双轴超频】电量咯~☆'
        );
      } else {
        const axis = randomPick(['re', 'im']);
        state.singleAxisCharge = axis;
        const axisLabel = axis === 're' ? '实部(Re)' : '虚部(Im)';
        messageLines.push(
          `  [M.A.T.O.U] ♥ 哎呀，6 条碎片线索居然全都被前辈问光啦？那就破例折现送您 1 格【${axisLabel}】单轴临时通电好咯~☆`
        );
      }
    }
  } else if (roll < 960) {
    tier = 'single_charge';
    reels = ['★', '★', '★'];
    state.dryStreak = 0;
    if (state.singleAxisCharge !== null || Number(state.battery || 0) > 0) {
      const hadSingle = state.singleAxisCharge !== null;
      addFullBattery(state, 1);
      messageLines.push(
        hadSingle
          ? '  [M.A.T.O.U] ★ 嗡嗡——既然前辈刚才已经充好了一根指针，这第二格电就顺便把另一根也接通，合体升级为 1 次【⚡满血双轴超频】咯~☆'
          : '  [M.A.T.O.U] ★ 嗡嗡——罗盘里本来就攒着满血超频电呢？那就顺手再给前辈续充 +1 次【⚡满血双轴超频】电量，拿去慢慢探路吧~☆'
      );
    } else {
      const axis = randomPick(['re', 'im']);
      state.singleAxisCharge = axis;
      const axisLabel = axis === 're' ? '实部(Re)' : '虚部(Im)';
      messageLines.push(
        `  [M.A.T.O.U] ★ 嗡——【劣质电池单轴充能】！别太感激哦，我只抠门地给【${axisLabel}】充了 1 格电，下一次探测能瞄一眼粗略方向，用完立刻断电♪`
      );
    }
  } else if (roll < 985) {
    tier = 'resident';
    reels = ['♛', '♛', '♛'];
    state.dryStreak = 0;
    const slotSpaceRoot = path.join(path.resolve(currentBaseDir), matou.SPACE_NAME);
    const effectivelyEliminated = isResidentEliminated && !matou.hasResidentNamedFile(slotSpaceRoot);
    if (!effectivelyEliminated) {
      try {
        const targetBits =
          targetReal.toString(2).padStart(5, '0') + targetImag.toString(2).padStart(5, '0');
        const { luckyCoordStr, luckyResidentFile } = matou.spawnLuckyResident(
          currentBaseDir,
          targetBits
        );
        if (!luckyCoordStr || !luckyResidentFile) {
          addFullBattery(state, 1);
          messageLines.push(
            '  [M.A.T.O.U] ♛ 哎呀，整座迷宫都被前辈塞得满满当当，隐藏嘉宾连落脚的空房间都找不到了呢……算啦，大奖改送您 1 次满血双轴超频探测补偿吧~'
          );
        } else {
          const parsedLucky = matou.parseCoordinate(luckyCoordStr);
          const distToTarget =
            Math.abs(parsedLucky.realPart - targetReal) + Math.abs(parsedLucky.imagPart - targetImag);
          messageLines.push(
            `  [M.A.T.O.U] ♛ 叮当——【隐藏嘉宾出来看热闹】！被前辈拉杆的动静吵醒，【 ${luckyResidentFile} 】刚刚搬去了新房间【 ${luckyCoordStr} 】围观哦！`
          );
          messageLines.push(
            `  [M.A.T.O.U] 顺便一提，前辈的私货离这位嘉宾的新房间正好相差 ${distToTarget} 格哦~☆`
          );
        }
      } catch {
        addFullBattery(state, 1);
        messageLines.push(
          '  [M.A.T.O.U] ♛ 哎呀，本来想请隐藏嘉宾出来串场，结果当前受限目录不让新建房间呢……算啦，大奖轮空，改送您 1 次满血双轴超频探测补偿吧~'
        );
      }
    } else {
      addFullBattery(state, 1);
      messageLines.push(
        '  [M.A.T.O.U] ♛ 哎呀，本来抽中了隐藏嘉宾特别演出奖，可惜那位可怜的英灵早就被冷酷的前辈亲手抹杀掉了呢……算啦，大奖轮空，改送您 1 次满血双轴超频探测补偿吧~'
      );
    }
  } else {
    tier = 'jackpot';
    reels = ['7', '7', '7'];
    state.dryStreak = 0;
    const reExact = `实部(Re)=${targetReal}`;
    const imExact = `虚部(Im)=${targetImag}i`;
    if (!Array.isArray(state.unlockedHints)) state.unlockedHints = [];
    let exactHint;
    if (state.unlockedHints.includes(reExact) && !state.unlockedHints.includes(imExact)) {
      exactHint = imExact;
    } else if (state.unlockedHints.includes(imExact) && !state.unlockedHints.includes(reExact)) {
      exactHint = reExact;
    } else {
      exactHint = randomPick([reExact, imExact]);
    }
    if (!state.unlockedHints.includes(exactHint)) {
      state.unlockedHints.push(exactHint);
    }
    addFullBattery(state, 3);
    messageLines.push(
      '  [M.A.T.O.U] 🎰 7-7-7——？！等、等一下！！前辈您这 1.5% 的 777 奇迹头奖是怎么拉出来的？！这台机器明明调低过爆率啊！！'
    );
    messageLines.push(
      `  [M.A.T.O.U] 唔……愿赌服输！把精确座标的一半直接交出来：『${exactHint}』，再给罗盘充满 3 次【⚡满血双轴超频】电量！快去取东西吧，可恶的欧皇前辈！！`
    );
  }

  const dry = Number(state.dryStreak || 0);
  if (dry === 5) {
    pityLine = '  （哼哼，已经连黑 5 把咯~ 前辈的手气简直比虚数之海还要黑呢~☆）';
  } else if (dry >= 10) {
    state.dryStreak = 0;
    if (state.singleAxisCharge !== null || Number(state.battery || 0) > 0) {
      const hadSingle = state.singleAxisCharge !== null;
      addFullBattery(state, 1);
      state.singleAxisCharge = null;
      pityLine = hadSingle
        ? '  （噗哈哈哈——连拉 10 把都吃瘪！看前辈眼眶都红了，正好罗盘里本来还有余电，BB 酱干脆帮您合体升级为 1 次【⚡满血双轴超频】好啦。有这格电量肯定够用吧？再着急也不许去碰那句禁止使用的『Rule Breaker』哦♡）'
        : '  （噗哈哈哈——连拉 10 把都吃瘪！看前辈眼眶都红了，正好罗盘里本来就攒着满血超频电，BB 酱干脆再给您续充 +1 次【⚡满血双轴超频】电量好啦。有这格电量肯定够用吧？再着急也不许去碰那句禁止使用的『Rule Breaker』哦♡）';
    } else {
      state.singleAxisCharge = randomPick(['re', 'im']);
      pityLine =
        '  （噗哈哈哈——连拉 10 把都吃瘪！看前辈眼眶都红了，BB 酱大发慈悲施舍您 1 格单轴临时电量好啦。拿着这点电继续加油吧？再着急也不许去碰那句禁止使用的『Rule Breaker』哦♡）';
    }
  }

  return { tier, reels, messageLines, pityLine };
}

function fmtReel(sym) {
  return sym === '☠' ? '☠ ' : sym;
}

function formatSlotStatusSummaryLines(state) {
  const battery = Number(state.battery || 0);
  const single = state.singleAxisCharge;
  const isReversed = Boolean(state.reverseDebuff);
  const statusParts = [];
  if (battery > 0) {
    statusParts.push(colorize('96;1', `[⚡ 满血双轴超频蓄电中：剩余 ${battery} 次探测]`));
  } else if (single) {
    const axisLabel = single === 're' ? '实部(Re)' : '虚部(Im)';
    statusParts.push(colorize('93;1', `[⚡ 单轴临时通电就绪：下一次探测可看清 ${axisLabel} 方向]`));
  }
  if (isReversed) {
    const hasCompassPower = battery > 0 || Boolean(single);
    statusParts.push(
      colorize(
        '91;1',
        hasCompassPower
          ? '[⚠ 恶魔极性反转生效中：下一次探测冷热与指针将故意说反话！]'
          : '[⚠ 恶魔极性反转生效中：下一次探测冷热条将故意说反话（充能后指针也会反转）！]'
      )
    );
  }
  if (statusParts.length === 0) {
    const rawIdle = '[▓▒░ 罗盘当前没电罢工中 ░▒▓]';
    statusParts.push(useColor() ? colorize('90', rawIdle) : rawIdle);
  }

  const lines = [`  ▸ 当前罗盘状态： ${statusParts.join(' ')}`];
  const unlocked = Array.isArray(state.unlockedHints) ? state.unlockedHints : [];
  if (unlocked.length > 0) {
    const exactCount = unlocked.filter((h) => String(h).includes('=')).length;
    const fragCount = unlocked.length - exactCount;
    const countLabel =
      exactCount > 0 ? `碎片 ${fragCount}/6 + 精确 ${exactCount} 条` : `${fragCount}/6`;
    lines.push(`  ▸ 恶魔老虎机已吐出的线索(${countLabel})：${unlocked.join(' ｜ ')}`);
  } else {
    lines.push('  ▸ 恶魔老虎机已吐出的线索：暂无（快拉杆试试手气吧~☆）');
  }
  return lines;
}

function renderPinnedPaperMoonHud(lastRes, state, includeStatus = true) {
  const sb = stageBorder();
  console.log('\n' + sb);
  console.log('  [P〇per Moon · 声呐与恶魔老虎机实时监控]');
  console.log(sb);

  let pm = null;
  let coordStr = null;
  if (lastRes && typeof lastRes === 'object') {
    pm = lastRes.paperMoon || lastRes.paper_moon || null;
    coordStr = lastRes.coordStr || lastRes.coord_str || null;
  }

  let hasProbeBanner = false;
  if (pm) {
    const lastCoord = state.lastProbeCoord;
    const lastHeat = state.lastProbeHeat;
    if (lastCoord && lastHeat && (!coordStr || lastCoord === coordStr)) {
      console.log(`  ▸ 上次探测座标： 【 ${lastCoord} 】  ${lastHeat}`);
    } else {
      const dist = pm.distance !== undefined ? pm.distance : 0;
      const distLabel = dist > 3 ? '??' : String(dist);
      const heatText = pm.heatText || pm.heat_text || '';
      const bar = pm.bar || '';
      const coloredHeat = formatPaperMoonHeat(dist, bar, heatText);
      const displayCoord = coordStr || lastCoord || '?+?i';
      console.log(`  ▸ 上次探测座标： 【 ${displayCoord} 】  相差 ${distLabel} 格  ${coloredHeat}`);
    }
    hasProbeBanner = true;
  } else if (state.lastProbeCoord && state.lastProbeHeat) {
    console.log(`  ▸ 上次探测座标： 【 ${state.lastProbeCoord} 】  ${state.lastProbeHeat}`);
    hasProbeBanner = true;
  }

  const probeHistory = Array.isArray(state.probeHistory) ? state.probeHistory : [];
  if (probeHistory.length > 0) {
    console.log('  ▸ 近期探测记录：');
    for (const rec of probeHistory) {
      console.log(`    • ${rec}`);
    }
  } else if (!hasProbeBanner) {
    console.log('  ▸ 声呐探测记录： 暂无（在 [2] 探测任意座标后，声呐回波会固定显示在此处~☆）');
  }

  if (includeStatus) {
    for (const statusLine of formatSlotStatusSummaryLines(state)) {
      console.log(statusLine);
    }
    console.log(sb);
  }
}

async function playSlotAnimation(reels) {
  const [r1, r2, r3] = reels;
  const fr1 = fmtReel(r1);
  const fr2 = fmtReel(r2);
  const fr3 = fmtReel(r3);
  if (process.stdin && process.stdin.isTTY && process.stdout && process.stdout.isTTY) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 4; i++) {
      const a = fmtReel(randomPick(SLOT_SYMBOLS));
      const b = fmtReel(randomPick(SLOT_SYMBOLS));
      const c = fmtReel(randomPick(SLOT_SYMBOLS));
      process.stdout.write(`\r  [M.A.T.O.U SLOT] 🎰 [ ${a} | ${b} | ${c} ] ── 旋转中...   `);
      await sleep(45);
    }
    for (let i = 0; i < 3; i++) {
      const b = fmtReel(randomPick(SLOT_SYMBOLS));
      const c = fmtReel(randomPick(SLOT_SYMBOLS));
      process.stdout.write(`\r  [M.A.T.O.U SLOT] 🎰 [ ${fr1} | ${b} | ${c} ] ── 旋转中...   `);
      await sleep(55);
    }
    for (let i = 0; i < 3; i++) {
      const c = fmtReel(randomPick(SLOT_SYMBOLS));
      process.stdout.write(`\r  [M.A.T.O.U SLOT] 🎰 [ ${fr1} | ${fr2} | ${c} ] ── 旋转中...   `);
      await sleep(65);
    }
    if (r1 === r2) {
      for (let i = 0; i < 5; i++) {
        const c = fmtReel(randomPick(SLOT_SYMBOLS));
        process.stdout.write(`\r  [M.A.T.O.U SLOT] 🎰 [ ${fr1} | ${fr2} | ${c} ] ── 咔哒…要中了吗？！`);
        await sleep(80);
      }
    }
    clearInlineLine();
  }
  const finalLine = `  [M.A.T.O.U SLOT] 🎰 [ ${fr1} | ${fr2} | ${fr3} ]`;
  if (r1 === '7' && r2 === '7' && r3 === '7') {
    console.log(colorize('93;1', finalLine));
  } else if (r1 === '☠' && r2 === '☠' && r3 === '☠') {
    console.log(colorize('31;1', finalLine));
  } else if (r1 === r2 && r2 === r3) {
    console.log(colorize('95;1', finalLine));
  } else {
    console.log(finalLine);
  }
}

async function runDemonSlot(
  currentBaseDir,
  state,
  isResidentEliminated = false,
  lastRes = null,
  preserveScreen = false,
  promptContext = 'main'
) {
  const target = resolveSlotTarget(currentBaseDir, lastRes);
  if (!target) {
    if (promptContext === 'coord') {
      console.log(
        '\n[M.A.T.O.U] 喂喂，这里连前辈藏私货的目标房间都还没有呢，空转老虎机也摇不出座标线索哦~ 先按回车或敲 0/q 回主菜单选 [1] 藏点东西，再回来陪人家赌手气吧~☆'
      );
    } else if (promptContext === 'after') {
      console.log(
        '\n[M.A.T.O.U] 喂喂，这里连前辈藏私货的目标房间都还没有呢，空转老虎机也摇不出座标线索哦~ 先按回车回主菜单选 [1] 藏点东西，再回来陪人家赌手气吧~☆'
      );
    } else {
      console.log(
        '\n[M.A.T.O.U] 喂喂，这里连前辈藏私货的目标房间都还没有呢，空转老虎机也摇不出座标线索哦~ 先选 [1] 藏点东西再回来陪人家赌手气吧~☆'
      );
    }
    return false;
  }
  syncSlotTarget(state, target.targetReal, target.targetImag);
  if (!preserveScreen) {
    clearScreen();
  }
  renderPinnedPaperMoonHud(lastRes, state, false);
  console.log(PLAIN_DIVIDER);
  const outcome = evaluateDemonSlotRoll(
    currentBaseDir,
    state,
    target.targetReal,
    target.targetImag,
    isResidentEliminated
  );
  console.log('');
  await playSlotAnimation(outcome.reels);
  for (const line of outcome.messageLines) {
    console.log(line);
  }
  if (outcome.pityLine) {
    console.log(outcome.pityLine);
  }
  console.log('\n' + PLAIN_DIVIDER);
  for (const statusLine of formatSlotStatusSummaryLines(state)) {
    console.log(statusLine);
  }
  console.log(stageBorder() + '\n');
  return true;
}

const DIVINATION_SUBSTRING_ALLOWLIST = new Set([
  // Core Sakura / Type-Moon proper nouns & unambiguous domain terms
  '间桐樱',
  '白樱',
  'matousakura',
  '远坂学姐',
  '远坂凛',
  '远坂',
  'tohsaka',
  'rin',
  '古董钟',
  '言峰绮礼',
  '言峰',
  '绮礼',
  '间桐慎二',
  '慎二',
  'shinji',
  '藤村大河',
  '藤村老师',
  '卫宫士郎',
  '卫宫宅',
  '士郎',
  'shirou',
  '卫宫',
  '冬木市',
  '弓道部',
  '间桐家',
  '冬木',
  'fuyuki',
  '间桐',
  '刻印虫',
  '虫窟',
  '月海原学园',
  '月海原',
  's601',
  'tsukumihara',
  '究极樱便当',
  '樱特制便当',
  '樱便当',
  '购买部',
  '布洛萨姆',
  '月之圣杯战争',
  '圣杯战争',
  '第1025扇门',
  '1025扇门',
  '岸波白野',
  '扎比子',
  '扎比男',
  'hakuno',
  'kishinami',
  '最喜欢你',
  '我喜欢你',
  '我爱你',
  '嫁给我',
  '做我女朋友',
  '帕尔瓦蒂',
  '雪山神女',
  '雪山樱',
  'parvati',
  '迦摩',
  'kama',
  '卫宫archer',
  '红a',
  'emiya',
  'mumei',
  '绿衣弓兵',
  '罗宾汉',
  '提亚马特',
  'tiamat',
  '提妈',
  'saberalter',
  '黑saber',
  '阿尔托莉雅',
  '黑呆',
  '赫拉克勒斯',
  '海格力斯',
  '海克力斯',
  'heracles',
  'hercules',
  'b叔',
  '海叔',
  'berserker',
  '美杜莎',
  'r姐',
  'medusa',
  '弗朗西斯德雷克',
  '弗朗西斯·德雷克',
  '吉尔伽美什',
  'gilgamesh',
  '金闪闪',
  '英雄王',
  '杂修',
  'blondepasserby',
  '金发路人',
  '路人王',
  'auo',
  'kingprotea',
  '帝王花',
  'matou',
  'tencrown',
  'othersideutopia',
  '杀生院祈荒',
  'sessyoin',
  'kiara',
  '杀生院',
  '祈荒',
  '梅尔特莉莉丝',
  '溶解莉莉丝',
  'meltlilith',
  'meltryllis',
  '帕森莉普',
  '热情迷唇',
  'passionlip',
  '卡兹拉德罗普',
  '樱花五人组',
  'sakurafive',
  'kazuradrop',
  'alterego',
  '薇奥莱特',
  '糖果藤蔓',
  'p〇permoon',
  'papermoon',
  '纸之月',
  '工具的制作者',
  '远坂时臣',
  '卫宫切嗣',
  '间桐脏砚',
  '脏砚',
  '马里斯比利',
  '言峰璃正',
  '黑桐干也',
  '远野槙久',
  '七夜黄理',
  '沙条广树',
  '卫宫矩贤',
  '间桐鹤野',
  '瓦拉契亚之夜',
  '藤村雷画',
  '远坂葵',
  '禅城葵',
]);

const EXACT_QUERY_PREFIX_RE = /^(?:请问|关于|聊聊|说说|谈谈|问问|问一下|什么是|谁是)+/;
const EXACT_TRAILING_PUNCT_RE = /[！!？?。.,，、~～♡☆♪…]+$/;
const EXACT_TRAILING_QUERY_PARTICLE_RE = /[吗呢啊呀吧！!？?。.,，、~～♡☆♪…]+$/;

function stripExactWrappers(clean, divinationMode = false) {
  const s = String(clean || '').replace(EXACT_TRAILING_PUNCT_RE, '');
  if (!divinationMode) return s;
  const withoutPrefix = s.replace(EXACT_QUERY_PREFIX_RE, '');
  if (withoutPrefix && withoutPrefix !== s) {
    return withoutPrefix.replace(EXACT_TRAILING_QUERY_PARTICLE_RE, '');
  }
  return s;
}

function buildSurfaceSakuraReply(currentMaskBroken) {
  if (!currentMaskBroken) {
    return {
      reply:
        '\n[M.A.T.O.U] ……嗯，前辈，我在呢。无论是替您打理日常起居，还是帮您看管这片虚数空间，只要前辈叫我的名字，我随时都在这里哦。',
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }
  return {
    reply:
      '\n[M.A.T.O.U] 哎呀，现在才满头大汗地喊回那个乖巧称呼，我也懒得再配合您装下去咯，前辈~♡',
    brokeMaskNow: false,
    isForbiddenName: false,
  };
}

function matchTopic(clean, words, isSub = false, normLower = '', allowWords = null) {
  if (!isSub) {
    return words.includes(clean);
  }
  const sourceLower = normLower || clean;
  for (const w of words) {
    if (allowWords && !allowWords.has(w)) continue;
    if (isAsciiAlphaWord(w)) {
      if (hasAsciiWordMatch(sourceLower, w) || hasAsciiWordMatch(clean, w)) return true;
      if (w.length >= 8 && clean.includes(w)) return true;
    } else if (clean.includes(w)) {
      return true;
    }
  }
  return false;
}

function checkForgotCoordReply(
  raw,
  currentMaskBroken = false,
  hasSpace = true,
  entryContext = 'main'
) {
  const text = String(raw || '').trim();
  if (!text) return { reply: null, brokeMaskNow: false, isForbiddenName: false };
  if (/[\\/]/.test(text) || /^[a-zA-Z]:/.test(text)) {
    return { reply: null, brokeMaskNow: false, isForbiddenName: false };
  }
  const normLower = normalizeDottedMatou(normalizeAsciiLetters(text).toLowerCase());
  const clean = normLower.replace(/[\s\-_.]/g, '');
  const isDivination = entryContext === 'divination';
  const matched = isDivination
    ? matchNonNegatedForgotTopic(clean, FORGOT_COORD_DIVINATION_EXPLICIT, true, normLower)
    : matchNonNegatedForgotTopic(clean, FORGOT_COORD_WORDS, false, normLower) ||
      matchNonNegatedForgotTopic(clean, FORGOT_COORD_DIVINATION_EXPLICIT, true, normLower);
  if (!matched) {
    return { reply: null, brokeMaskNow: false, isForbiddenName: false };
  }
  if (!hasSpace) {
    if (!currentMaskBroken) {
      return {
        reply: isDivination
          ? '\n[M.A.T.O.U] 咦？这里还没有展开过虚数空间呢，前辈不用担心弄丢座标哦——如果想先建一个资料室，先输入 q 回主菜单再按 [1] 就可以了。'
          : '\n[M.A.T.O.U] 咦？这里还没有展开过虚数空间呢，前辈不用担心弄丢座标哦——如果想先建一个资料室，按 [1] 就可以了。',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }
    return {
      reply: isDivination
        ? '\n[M.A.T.O.U] 噗嗤，这里连虚数迷宫的影子都还没铺开呢，前辈就已经提前把座标忘光啦？先敲 q 回主菜单按 [1] 把 1024 间房展开再迷路也不迟哦♪'
        : '\n[M.A.T.O.U] 噗嗤，这里连虚数迷宫的影子都还没铺开呢，前辈就已经提前把座标忘光啦？先敲 [1] 把 1024 间房展开再迷路也不迟哦♪',
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }
  if (!currentMaskBroken) {
    const reply = isDivination
      ? '\n[M.A.T.O.U] 眼下您的私货还好好锁在 1024 间房里，只不过这里现在是占卜演播室，找房间得先敲 q 回主菜单去 [2]，试试我借给您的塑料罗盘「P〇per Moon」和恶魔老虎机吧——对了，就算实在找不到，也千万不可以输入『Rule Breaker』那种违规禁咒哦？我是认真的呢♪'
      : entryContext === 'coord'
        ? '\n[M.A.T.O.U] 眼下您的私货还好好锁在 1024 间房里，只不过以后得按我的规矩找回去了。就在这里随便蒙个座标，试试我借给您的塑料罗盘「P〇per Moon」和恶魔老虎机吧——对了，就算实在找不到，也千万不可以输入『Rule Breaker』那种违规禁咒哦？我是认真的呢♪'
        : '\n[M.A.T.O.U] 眼下您的私货还好好锁在 1024 间房里，只不过以后得按我的规矩找回去了。老老实实去 [2] 随便蒙个座标，试试我借给您的塑料罗盘「P〇per Moon」和恶魔老虎机吧——对了，就算实在找不到，也千万不可以输入『Rule Breaker』那种违规禁咒哦？我是认真的呢♪';
    return { reply, brokeMaskNow: true, isForbiddenName: false };
  }
  const reply = isDivination
    ? '\n[M.A.T.O.U] 噗哈哈——前辈果然又把座标给弄丢啦？！\n' +
    '            先敲 q 回主菜单去 [2] 随便蒙个座标，用我借您的塑料罗盘「P〇per Moon」慢慢找吧。对了，可千万别偷念『Rule Breaker』走捷径哦？我可是严厉禁止作弊的呢♡'
    : entryContext === 'coord'
      ? '\n[M.A.T.O.U] 噗哈哈——前辈果然又把座标给弄丢啦？！\n' +
      '            就在这里随便蒙个座标，用我借您的塑料罗盘「P〇per Moon」慢慢找吧。对了，可千万别偷念『Rule Breaker』走捷径哦？我可是严厉禁止作弊的呢♡'
      : '\n[M.A.T.O.U] 噗哈哈——前辈果然又把座标给弄丢啦？！\n' +
      '            去 [2] 随便蒙个座标，用我借您的塑料罗盘「P〇per Moon」慢慢找吧。对了，可千万别偷念『Rule Breaker』走捷径哦？我可是严厉禁止作弊的呢♡';
  return { reply, brokeMaskNow: false, isForbiddenName: false };
}

function checkForbiddenTrueNameReply(raw, currentMaskBroken = false, allowSubstring = false) {
  const text = String(raw || '').trim();
  if (!text || !isForbiddenTrueName(text, allowSubstring)) {
    return { reply: null, brokeMaskNow: false, isForbiddenName: false };
  }
  if (!currentMaskBroken) {
    return {
      reply:
        '\n[信号干扰] 哔▓▒——……咦？抱歉前辈，刚才通讯好像突然有一阵杂音，没能听清您念了什么词……\n' +
        '           我只是平时替前辈整理虚数资料的后辈而已呀，前辈该不会是看着屏幕眼花了吧？',
      brokeMaskNow: false,
      isForbiddenName: true,
    };
  }
  return {
    reply:
      '\n[信号干扰] 哔▓▒——哼哼，现在才念出我的真名也太晚啦！没错，主持『BB Channel』的就是您最可爱又最恶劣的后辈 BB 酱——都到这一步了，乖乖留在我的频道里当一辈子共犯吧♡',
    brokeMaskNow: false,
    isForbiddenName: true,
  };
}

function checkSlimEntryReply(
  raw,
  currentMaskBroken = false,
  hasSpace = true,
  entryContext = 'coord'
) {
  const forgot = checkForgotCoordReply(raw, currentMaskBroken, hasSpace, entryContext);
  if (forgot.reply) return forgot;
  return checkForbiddenTrueNameReply(raw, currentMaskBroken, false);
}

const MAIN_MENU_DAILY_RULES = [
  {
    id: 'morning',
    keywords: ['早上好', '早安', '早呀', '早啊', '上午好', 'goodmorning', 'morning'],
    disguised:
      '\n[M.A.T.O.U] 前辈早上好！资料室已经通风收拾好了，要是想顺手求支今日运势、聊上两句，选 [4] 就可以哦。',
    unmasked:
      '\n[M.A.T.O.U] 早安呀，前辈~☆ 一大早就精神满满地来敲门，是打算先打理虚数空间，还是直接敲 [4] 进 BB 占卜室测测今天的运势呢♪',
  },
  {
    id: 'afternoon',
    keywords: ['下午好', '中午好', '午安', '晚上好', '傍晚好', 'goodafternoon', 'goodevening'],
    disguised:
      '\n[M.A.T.O.U] 前辈好呀，忙了大半天辛苦啦！如果想先歇口气、借着求签的工夫说会儿话，选 [4] 进来坐吧。',
    unmasked:
      '\n[M.A.T.O.U] 哟，偷闲时间到啦，前辈♪ 要藏私货请按 1~3，若是想找恶魔后辈聊两句、顺手算一卦解解闷，直接敲 [4] 进来就是咯♡',
  },
  {
    id: 'sick',
    keywords: [
      '生病',
      '感冒',
      '发烧',
      '头疼',
      '头痛',
      '牙疼',
      '牙痛',
      '胃疼',
      '胃痛',
      '肚子疼',
      '肚子痛',
      '嗓子疼',
      '喉咙痛',
      '咳嗽',
      '流鼻涕',
      '拉肚子',
      '不舒服',
      '不太舒服',
      '头晕',
      '好晕',
      'sick',
      'fever',
      'headache',
    ],
    disguised:
      '\n[M.A.T.O.U] 诶，前辈身体不舒服吗？资料的事放着以后再整理就好，快先喝点温水躺下歇着吧。要是不放心，也可以按 [4] 进来坐会儿，或者直接敲 q 关掉电脑早点休息哦。',
    unmasked:
      '\n[M.A.T.O.U] 喂喂，平时不爱惜身体，现在果然撑不住了吧？想敲 [4] 进来挨一针 BB 酱特调的「振奋注射」，还是乖乖敲 q 钻被窝吃药，您自己选咯？',
  },
  {
    id: 'night',
    keywords: ['晚安', '好困', '困了', '想睡', '睡觉', '熬夜', '通宵', '睡不着', '半夜', '凌晨', 'goodnight'],
    disguised:
      '\n[M.A.T.O.U] 这么晚了前辈辛苦啦，记得早点休息哦。要是睡前还想稍微说说话、或者求一支安稳的晚安签，可以选 [4] 来资料室坐一会儿。',
    unmasked:
      '\n[M.A.T.O.U] 哈欠——都这个点了还不肯休息呀，前辈？想求支睡前签再睡就敲 [4]，不然还是早点敲 q 歇着吧，熬出黑眼圈的话，明天可就没精神陪我玩咯~☆',
  },
  {
    id: 'tired',
    keywords: ['好累', '累了', '累死', '心累', '疲惫', '辛苦', '烦死', '好烦', '崩溃', '压力大', '撑不住', '不想上班', '不想上学'],
    disguised:
      '\n[M.A.T.O.U] 前辈今天一定辛苦了呢，累了就别硬撑着哦。要是暂时不想忙资料的事，选 [4] 进资料室喝杯茶、借着求签聊会儿天放松一下吧。',
    unmasked:
      '\n[M.A.T.O.U] 哎呀呀，看起来累得像跑完滚轮的小仓鼠呢？今天破例准您偷会儿懒，敲 [4] 进演播室歇口气、顺便算一卦吧♡',
  },
  {
    id: 'anxious',
    keywords: ['紧张', '焦虑', '害怕', '忐忑', '保佑', '祈祷', '拜托了', '吸欧气', '欧气', '心慌', '慌死', '求保佑'],
    disguised:
      '\n[M.A.T.O.U] 别太紧张哦，前辈，先深吸一口气吧。如果想求个好兆头或者看看接下来的星象提示，选 [4] 让我替前辈摇一支签、顺便陪您说说话吧。',
    unmasked:
      '\n[M.A.T.O.U] 噗嗤，手心都在冒汗了吗，前辈？想找恶魔后辈借点好运、求个心安的话，别杵在门口发愣啦，直接敲 [4] 进占卜室吧♪',
  },
  {
    id: 'angry',
    keywords: [
      '生气',
      '气死',
      '气炸',
      '气人',
      '好气',
      '气坏',
      '无语',
      '离谱',
      '火大',
      '暴躁',
      '烦透',
      '窝火',
      '气疯',
      'angry',
      'furious',
    ],
    disguised:
      '\n[M.A.T.O.U] 遇上很让人火大的事了吗……先停下来缓一口气吧，别为了不讲理的人一直憋着闷气。要是想找人说说，选 [4] 进来坐会儿吧。',
    unmasked:
      '\n[M.A.T.O.U] 哟，头顶都要冒烟啦，前辈？气成这样可不像平时好脾气的您呀——先别砸键盘，敲 [4] 进演播室吐槽两句出出气吧♪',
  },
  {
    id: 'sad',
    keywords: ['难过', '郁闷', '难受', '委屈', '倒霉', '好衰', '寄了', '凉了', '完蛋', '叹气', '破防', 'emo', '不开心', '不高兴', '不太开心', '不太高兴', '好惨'],
    disguised:
      '\n[M.A.T.O.U] 遇到不顺心的事了吗……没关系的，前辈别太责怪自己了。要是愿意的话，选 [4] 进来坐一会儿吧，借着求签转运的工夫，我随时都可以听前辈慢慢说哦。',
    unmasked:
      '\n[M.A.T.O.U] 哦呀，垂头丧气得像只淋了雨的小狗一样呢……算啦，今天就破例少捉弄您两句，敲 [4] 进演播室说说看，顺便让 BB 酱替您看看能不能转运吧♡',
  },
  {
    id: 'hungry',
    keywords: [
      '饿了',
      '好饿',
      '饿死',
      '饿扁',
      '饿得',
      '肚子饿',
      '肚子叫',
      '肚子咕噜',
      '饥饿',
      '馋了',
      '想吃饭',
      '干饭',
      '开饭',
      '没吃饭',
      '还没吃',
      'hungry',
      'starving',
    ],
    disguised:
      '\n[M.A.T.O.U] 前辈肚子饿了吗？整理资料再重要也不能空着肚子硬扛哦，快先去吃顿热乎乎的饭吧——要是拿不定主意吃什么，也可以选 [4] 摇一支今日饮食运势签哦。',
    unmasked:
      '\n[M.A.T.O.U] 哟，肚子都在打鼓了吗，前辈？要不恶魔后辈亲手给您塞一份加满超辣芥末的爱心便当？不想冒险的话，就快敲 [4] 进占卜室算算今天该去哪儿觅食吧♪',
  },
  {
    id: 'encourage',
    keywords: [
      '给我加油',
      '帮我加油',
      '替我加油',
      '给我打气',
      '祝我好运',
      '安慰我',
      '安慰一下我',
      '求安慰',
      '夸夸我',
      '求夸',
      '求抱抱',
      '抱抱我',
      '陪陪我',
      '陪我聊聊',
      'cheermeup',
      'hug',
    ],
    disguised:
      '\n[M.A.T.O.U] 嗯，前辈一定没问题的！要是不嫌弃的话，选 [4] 进来坐一会儿吧，我在这边替您讨个好彩头、顺便打打气哦。',
    unmasked:
      '\n[M.A.T.O.U] 哎呀，堂堂前辈居然主动跑来讨夸、讨抱抱啦？好吧好吧，看您今天这么乖的份上——敲 [4] 进演播室坐好，恶魔后辈勉强给您加点「特别应援」咯♡',
  },
  {
    id: 'happy',
    keywords: ['开心', '高兴', '好耶', '成功了', '考过了', '通过了', '赢了', '出货了', '出金了', '欧了', '太爽了', '哈哈哈', '太好了'],
    disguised:
      '\n[M.A.T.O.U] 太好啦，真替前辈高兴呢！趁着今天这份好心情，要不要顺便选 [4] 摇一支喜庆的签、跟我分享一下好消息呀？',
    unmasked:
      '\n[M.A.T.O.U] 哟，隔着屏幕都能听见前辈得意洋洋的笑声呢♪ 趁现在手气正好，不如敲 [4] 进占卜室再试一试，看看这份好运能撑到第几抽~☆',
  },
  {
    id: 'weather',
    keywords: [
      '下雨了',
      '在下雨',
      '下暴雨',
      '下大雨',
      '下雪了',
      '好冷',
      '冷死',
      '冻死',
      '好热',
      '热死',
      '闷热',
      '刮大风',
      '台风天',
    ],
    disguised:
      '\n[M.A.T.O.U] 外面的天气真是变化无常呢……前辈记得添减衣服、带好伞，别着凉或者中暑了哦。要是暂时不想出门，选 [4] 来资料室喝杯茶坐会儿吧。',
    unmasked:
      '\n[M.A.T.O.U] 哼哼，现实世界又是刮风下雨又是冷热交替的，麻烦死了对吧？还是我这片恒温恒湿的虚数空间舒服多咯——不想挨冻受热的话，快敲 [4] 躲进来吧♪',
  },
  {
    id: 'bored',
    keywords: ['无聊', '摸鱼', '发呆', '没事干', '随便看看', '打发时间', '闲着', '随便算算'],
    disguised:
      '\n[M.A.T.O.U] 难得有空闲可以发发呆呢。前辈要是不忙，选 [4] 进来聊聊天、摇支签打发时间也很合适哦。',
    unmasked:
      '\n[M.A.T.O.U] 哦呀，一闲下来就先想起 BB 酱了呀？既然手头没事可做，就别停在菜单页发呆啦，直接敲 [4] 进演播室当今天的特邀观众吧♪',
  },
  {
    id: 'complain',
    keywords: [
      '退钱',
      '退石',
      '退石头',
      '还我石头',
      '黑店',
      '黑心店',
      '奸商',
      '骗子',
      '骗人',
      '大骗子',
      '差评',
      '给差评',
      '不准',
      '算不准',
      '胡说八道',
      '你好坏',
      '你真坏',
      '坏蛋',
      '大坏蛋',
      '笨蛋',
      '你真笨',
      '讨厌你',
      '坑人',
      '太坑了',
      '真坑',
      'refund',
      'scam',
    ],
    disguised:
      '\n[M.A.T.O.U] 诶……是我哪里做得不够周到、惹前辈不高兴了吗？对不起前辈，资料室里哪里不好用您尽管告诉我，我马上改。',
    unmasked:
      '\n[M.A.T.O.U] 哈？居然当面给恶魔后辈打差评、还要退石头？前辈怕不是忘了，从踏进这间虚数空间起，最终解释权就归我所有咯——概不退换，不服就敲 [4] 再抽一发赢回去呀~☆',
  },
  {
    id: 'sorry',
    keywords: ['抱歉', '对不起', '不好意思', '麻烦你了', '打扰了', 'sorry'],
    disguised:
      '\n[M.A.T.O.U] 前辈怎么突然这么客气呀，完全不用觉得打扰哦。整理资料按 1~3，如果想歇会儿聊两句或求支签，随时选 [4] 就好啦。',
    unmasked:
      '\n[M.A.T.O.U] 哦呀，难得听见前辈这么老实地低头认错呢？既然过意不去，就乖乖敲 [4] 进本频道陪 BB 酱聊两句，当作赔礼吧♡',
  },
  {
    id: 'thanks',
    keywords: ['谢谢', '多谢', '感谢', '辛苦你', '真棒', '你真可爱', '你好可爱', '你最可爱', '真可爱呀', '好评', 'thanks', 'thankyou'],
    disguised:
      '\n[M.A.T.O.U] 能帮上前辈的忙我就很开心了呢！要是现在有空，也可以选 [4] 进来喝杯茶、顺便看看今天的运势哦。',
    unmasked:
      '\n[M.A.T.O.U] 哼哼，夸奖 BB 酱的话我可听不腻哦♪ 不过光在门口说几句好听的可不够，有诚意的话，就请敲 [4] 进占卜室慢慢聊吧♡',
  },
  {
    id: 'whats_up',
    keywords: [
      '你在干嘛',
      '在干嘛',
      '你在干什么',
      '在干什么',
      '干嘛呢',
      '忙吗',
      '忙不忙',
      '在忙吗',
      '吃饭了吗',
      '吃了吗',
      '睡了吗',
      '还没睡吗',
      '在做什么',
    ],
    disguised:
      '\n[M.A.T.O.U] 刚刚把资料室的桌面顺手擦了一遍，正坐在门边等前辈回来呢。要是现在不急着收文件，也可以选 [4] 进来歇一会儿、聊两句哦。',
    unmasked:
      '\n[M.A.T.O.U] 在干嘛？当然是在后台盯着监控屏，数前辈什么时候又会把座标忘得一干二净咯♪ 闲着没事的话，不如敲 [4] 进演播室陪我说两句？',
  },
  {
    id: 'entertain',
    keywords: [
      '讲个笑话',
      '说个笑话',
      '讲笑话',
      '冷笑话',
      '逗我笑',
      '唱首歌',
      '唱歌',
      '表演才艺',
      '表演个才艺',
      '卖个萌',
      '变个魔术',
      'tellmeajoke',
    ],
    disguised:
      '\n[M.A.T.O.U] 诶、突然要我讲笑话或者唱歌吗……我平时不太擅长活跃气氛呢，怕冷场让前辈尴尬。要不选 [4] 进来摇支签吧，说不定签文比我讲的段子有趣多了。',
    unmasked:
      '\n[M.A.T.O.U] 哈？把我当成街头卖艺的吉祥物啦？想听笑话倒是有个现成的——『有位前辈把私货藏进 1024 间房里，转头就把座标忘光了』。怎么样，够不够好笑呀~☆',
  },
  {
    id: 'hello',
    keywords: ['你好', '您好', '哈喽', '在吗', '我来了', '我回来了', 'hello', 'hi'],
    disguised:
      '\n[M.A.T.O.U] 前辈你好呀，资料室一直替您留着位子呢。存取资料请选 1~3，想先说说话或求支签就选 [4] 吧。',
    unmasked:
      '\n[M.A.T.O.U] 哟，欢迎光临，前辈~☆ 打理虚数迷宫请按 1~3；要是专程来找 BB 酱闲聊算命的话，直接敲 [4] 进演播室就位吧♪',
  },
];

const CHINESE_NEGATION_PREFIXES = [
  '一点都不',
  '一点也不',
  '没什么好',
  '千万别再',
  '千万别',
  '不要再',
  '不想再',
  '不用再',
  '不必再',
  '不要那么',
  '不要这么',
  '别那么',
  '别这么',
  '不是太',
  '没那么',
  '不打算',
  '没打算',
  '不再是',
  '不怎么',
  '根本不',
  '并不是',
  '才不是',
  '不觉得',
  '没觉得',
  '不要太',
  '别再',
  '没再',
  '别太',
  '不太',
  '并不',
  '才没',
  '并没',
  '从没',
  '不是',
  '没有',
  '不要',
  '不想',
  '不用',
  '不必',
  '不算',
  '毫不',
  '不会',
  '不再',
  '才不',
  '别',
  '没',
  '不',
];

const DOUBLE_NEGATION_PREFIXES = [
  '才没有',
  '并没有',
  '才不是',
  '并不是',
  '不觉得',
  '没觉得',
  '没有',
  '不是',
  '并没',
  '才没',
  '没',
];

const FORGOT_BA_NEGATION_RE =
  /(?:没|没有|不会|才没|并没|从没|别|不要|千万别)(?:把|将)$/;

const POLITE_REFUSAL_RE =
  /(?:谢谢|多谢|感谢)[你您啦呀啊了]{0,2}[，,、。！!？?~～…\s]*(?:不用|不需要|不必|算了|不了)|(?:thanks|thank\s*you)[，,、。！!？?~～…\s]*(?:no\s+need|no\s+thanks|no(?:$|[^a-z]))|(?:不用|不需要|不必|算了|不了)[了啦啊呀]?[，,、。！!？?~～…\s]*(?:谢谢|多谢|感谢|thanks|thank\s*you)|(?:^|[^a-z])no[\s，,、]+(?:thanks|thank\s*you)(?:$|[^a-z])/;

const QUESTION_SENTENCE_RE =
  /[?？]|(?:吗|嘛|么)[！!。~～…\s]*$|(?:能不能|会不会|能否|是否|是不是|有没有|可以不|行不行|好不好|选哪个|吃什么|怎么样|如何|怎么办|怎么回事|怎么才|怎么能|什么时候|啥时候|何时|靠不靠谱|顺不顺利|能过没|过了没|赢了没|成功没|出金没|出货没)|了没[有]?[！!。~～…\s]*$/;

const WISH_OR_CONDITIONAL_RE =
  /(?:希望|祈祷|保佑|但愿|愿这次|愿我|愿你|愿您|祝愿|祝我|祝你|祝您|祝前辈|要是|如果|假如|万一|求求|真想|好想|我想|想要|想快点|想早点|盼着|期待)/;

const CLAUSE_SPLIT_RE = /[,.;!?，。；！？]+/;
const EN_CLAUSE_NEGATION_RE =
  /(?:^|[^a-z'])(?:not|no|never|dont|don't|aint|ain't)(?:\s+[a-z']+){0,2}$/;

const PHATIC_INTENTS = new Set([
  'morning',
  'afternoon',
  'hello',
  'thanks',
  'sorry',
  'complain',
  'whats_up',
  'entertain',
]);
const NIGHT_PHATIC_KEYWORDS = new Set(['晚安', 'goodnight']);
const SLANG_MOOD_KEYWORDS = new Set(['寄了', '凉了', '完蛋', '好衰', '欧了']);
const PRAISE_KEYWORDS = new Set(['真棒', '你真可爱', '你好可爱', '你最可爱', '真可爱呀', '好评']);
const EXACT_PRAISE_WORDS = new Set([
  '可爱',
  '好可爱',
  '真可爱',
  '真可爱呀',
  '真棒',
  '好棒',
  '太棒了',
  '好评',
  '给你好评',
  '五星好评',
]);
const EXACT_ENCOURAGE_WORDS = new Set([
  '加油',
  '加油呀',
  '加油啊',
  '加油吧',
  '加油哦',
  '加油啦',
  '打气',
  '抱抱',
  '抱抱呀',
  '摸摸头',
  '摸摸头呀',
  '贴贴',
  '贴贴呀',
]);
const WEATHER_HAOLENG_COMPOUND_RE = /好冷[门淡漠清静血酷场]/g;
const WEATHER_HAORE_COMPOUND_RE = /好热[情闹门烈爱衷心血]/g;

const IDENTITY_QUERY_DISGUISED_RE =
  /^(?:请问|那个|话说|对了|喂|诶|哎)?(?:小樱|间桐樱|樱|matou)?(?:你|您)?(?:到底|究竟|其实|真的)?(?:是谁|叫什么|叫什么名字|是什么人|是真人|是ai|是人工智能|是机器人|介绍一下你自己|介绍一下自己|自我介绍(?:一下)?)(?:啊|呀|呢|哇|嘛|哦|喔|吧|么|吗)?$/;
const IDENTITY_QUERY_UNMASKED_RE =
  /^(?:请问|那个|话说|对了|喂|诶|哎)?(?:小樱|间桐樱|樱|bb酱?|matou)?(?:你|您)?(?:到底|究竟|其实|真的)?(?:是谁|叫什么|叫什么名字|是什么人|是真人|是ai|是人工智能|是机器人|介绍一下你自己|介绍一下自己|自我介绍(?:一下)?)(?:啊|呀|呢|哇|嘛|哦|喔|吧|么|吗)?$/;
const EXACT_IDENTITY_EN = new Set([
  'whoareyou',
  'whatisyourname',
  'whatsyourname',
  'areyouai',
  'areyouabot',
]);
const USAGE_QUERY_RE =
  /^(?:请问|那个|话说|对了|帮帮忙|救命)?(?:小樱|间桐樱|樱|matou)?(?:这个|这玩意|这工具|这软件|这程序|这里|这|它|你|您)?(?:到底|究竟)?(?:怎么用|如何使用|怎么使用|怎么玩|怎么操作|是干嘛的|是干什么的|干嘛用的|干什么用的|是什么|能干嘛|能干什么|能做什么|会干嘛|会干什么|会什么|怎么藏|怎么藏文件|怎么藏东西|怎么找|怎么找文件|(?:能|可以)聊天)(?:啊|呀|呢|哇|嘛|哦|喔|吧|么|吗)?$/;
const EXACT_USAGE_EN = new Set([
  'howtouse',
  'whatisthis',
  'howdoesthiswork',
  'whatcanyoudo',
]);
const BYE_CN_KEYWORDS = [
  '再见',
  '拜拜',
  '我走了',
  '先走了',
  '先撤了',
  '撤了',
  '明天见',
  '下次见',
  '回头见',
  '回见',
  '下线了',
];
const BYE_EN_KEYWORDS = ['bye', 'byebye', 'goodbye', 'seeyou'];

const DIRECT_ASSISTANT_PRAISE_RE =
  /(?:你|您|小樱|间桐樱|樱|间桐|bb酱|bb|matou|后辈|助手)(?:也|还|一直|今天|平时|真的|真是|实在|简直|其实|还是|可|挺|很|非常|超|最|太|好|真){0,3}(?:真棒|好棒|很棒|超棒|太棒|最棒|真可爱|好可爱|最可爱|可爱|好评|辛苦你|辛苦了|辛苦啦|辛苦呀|辛苦呢|辛苦)|(?:给你好评|五星好评|好评给你|夸夸你|谢谢你|感谢你|多谢你|辛苦[了啦呀啊]?[，,、\s]*(?:你|您|小樱|间桐樱|樱|bb酱?|matou|后辈|助手))/;
const ASSISTANT_XINKU_RE =
  /(?:辛苦[了啦呀啊]?[，,、\s]*(?:你|您|小樱|间桐樱|樱|bb酱?|matou|后辈|助手)|(?:你|您|小樱|间桐樱|樱|间桐|bb酱?|matou|后辈|助手)(?:也|还|一直|今天|平时|真的|真是|太|好|真){0,2}辛苦)/;

const CN_PHATIC_PREFIX_RE =
  /^(?:(?:前辈|后辈|小樱|间桐樱|樱|间桐|bb酱?|matou|你|您|嗨|嘿|嗯|哦|那个|对了|那|我|真的|真是|真|太|非常|十分|万分|实在|简直|完全|根本|刚才|现在|今天|再次|先|就|还是|也|都|挺|很|有点|有点儿|快点|快|赶紧|给我|帮我|求|不好意思|抱歉|对不起|打扰了|麻烦你了|谢谢|多谢|感谢|你好|您好|早安|早上好|下午好|晚上好|晚安)[，,、\s]*)*$/;
const CN_PHATIC_AFTER_RE =
  /^(?:$|[，,、。！!？?~～♡☆♪…\s]|(?:(?:呀|啊|哦|喔|哈|啦|了|呢|嘛|哒|鸭|吧|呗)[，,、\s]*)?(?:前辈|后辈|小樱|间桐樱|樱|间桐|bb酱?|matou|你|您|好梦|宝|酱|亲|们|各位)(?:的帮忙|的帮助)?(?:$|[，,、。！!？?~～♡☆♪…\s啊呀哦喔啦了呢吧呗])|(?:呀|啊|哦|喔|哈|啦|了|呢|嘛|哒|鸭|吧|呗)(?:$|[，,、。！!？?~～♡☆♪…\s啊呀哦喔啦了呢吧呗])|(?:打扰你了|打扰了|麻烦你了|了你)(?:$|[，,、。！!？?~～♡☆♪…\s啊呀哦喔啦了呢吧呗]))/;

const SLANG_ALLOWED_PREFIX_RE =
  /^(?:(?:我|咱|本人|这下|这把|这次|今天|今晚|刚才|现在|感觉|好像|仿佛|似乎|已经|彻底地|彻底|完全|真的|真是|真|太|快要|快|要|差点|估计|怕是|大概|可能|肯定|绝对|必定|直接|当场|原地|心态|心|运气|手气|抽卡|考试|面试|项目|这局|这波|又要|算是|总算|终于|竟然|居然|好|超|巨|蛮|挺|有点儿|有点|稍微|实在是|实在)*)$/;
const SLANG_ALLOWED_SUFFIX_RE =
  /^(?:啊|呀|哦|喔|啦|了|咯|吧|捏|呜|呜呜|呜呜呜|哈哈|哈哈哈|qaq|t_t)?$/;
const SLANG_SHIPPING_CONTEXT_RE =
  /(?:快递|包裹|外卖|邮件|信件|行李|明信片|文件|合同|资料)/;
const SLANG_TEMP_CONTEXT_RE =
  /(?:饭菜|米饭|热饭|热菜|开水|热水|茶水|热茶|奶茶|咖啡|热汤|鸡汤|面条|拉面|汤面|泡面|外卖|天气|气温|晚风|冷风|空调|水杯|茶杯|汤碗|这杯水|这碗汤|这碗面|这盘菜|这顿饭|水(?!逆))/;
const SLANG_SELF_SUBJECT_RE =
  /(?:我|咱|本人|心态|运气|手气|抽卡|考试|面试|项目|这把|这局|这波|今天|今晚)/;
const LOVE_REPORTED_SPEECH_RE =
  /(?:他说|她说|别人说|有人说|朋友说|对方说|大家说|同学说|同事说|前任说|对象说|对我说|跟我说|向我说|对她|对他|向她|向他|跟她|跟他|给(?:她|他)|表白|求婚|告白|别说|别再说|不要说|不要再说|别提|别再提)/;
const DAD_SEARCH_TOOL_CONTEXT_RE =
  /(?:老爸|爸爸|父亲|家长|长辈|老爹|电脑|全盘|搜索|搜文件|装了|查电脑)/;

const EN_PHATIC_MULTIWORD_MAP = {
  goodmorning: 'good\\s*morning',
  goodafternoon: 'good\\s*afternoon',
  goodevening: 'good\\s*evening',
  goodnight: 'good\\s*night',
  thankyou: 'thank\\s*you',
  byebye: 'bye\\s*bye',
  goodbye: 'good\\s*bye',
  seeyou: 'see\\s+you',
  tellmeajoke: 'tell\\s+me\\s+a\\s+joke',
  cheermeup: 'cheer\\s+me\\s+up',
};

function isQuestionSentence(raw) {
  const normLower = normalizeDottedMatou(normalizeAsciiLetters(String(raw || '').trim()).toLowerCase());
  const compact = normLower.replace(/[\s\-_.]/g, '');
  if (!compact) return false;
  return QUESTION_SENTENCE_RE.test(normLower) || QUESTION_SENTENCE_RE.test(compact);
}

function isWishOrConditional(raw) {
  const normLower = normalizeDottedMatou(normalizeAsciiLetters(String(raw || '').trim()).toLowerCase());
  const compact = normLower.replace(/[\s\-_.]/g, '');
  if (!compact) return false;
  return WISH_OR_CONDITIONAL_RE.test(compact);
}

function hasNonNegatedSubstring(text, kw) {
  if (!text || !kw) return false;
  const isSelfNegatedKw = kw.startsWith('不') || kw.startsWith('没') || kw.startsWith('别');
  let pos = text.indexOf(kw);
  while (pos !== -1) {
    const prefix = text.slice(0, pos);
    const suffix = text.slice(pos + kw.length);
    const negatedPrefix = isSelfNegatedKw
      ? DOUBLE_NEGATION_PREFIXES.some((neg) => prefix.endsWith(neg))
      : CHINESE_NEGATION_PREFIXES.some((neg) => prefix.endsWith(neg));
    const negatedSuffix = suffix.startsWith('不起来');
    const politeRefusal =
      (kw === '谢谢' || kw === '多谢' || kw === '感谢') && POLITE_REFUSAL_RE.test(text);
    if (!negatedPrefix && !negatedSuffix && !politeRefusal) return true;
    pos = text.indexOf(kw, pos + 1);
  }
  return false;
}

function matchNonNegatedForgotTopic(cleanText, words, allowSubstring, rawLower) {
  if (!cleanText) return false;
  const clauses = String(rawLower || cleanText)
    .split(CLAUSE_SPLIT_RE)
    .map((c) => c.replace(/[\s\-_.]/g, ''))
    .filter(Boolean);
  for (const rawW of words) {
    const w = normalizeAsciiLetters(String(rawW || '').trim())
      .toLowerCase()
      .replace(/[\s\-_.]/g, '');
    if (!w) continue;
    if (!allowSubstring) {
      if (cleanText === w) return true;
    } else {
      for (const clause of clauses) {
        if (!hasNonNegatedSubstring(clause, w)) continue;
        let pos = clause.indexOf(w);
        while (pos !== -1) {
          const prefix = clause.slice(0, pos);
          const baNegated = FORGOT_BA_NEGATION_RE.test(prefix);
          if (!baNegated && hasNonNegatedSubstring(prefix + w, w)) {
            return true;
          }
          pos = clause.indexOf(w, pos + 1);
        }
      }
    }
  }
  return false;
}

function hasNonNegatedAsciiWordMatch(text, word) {
  if (!text || !word) return false;
  const clauses = String(text).split(CLAUSE_SPLIT_RE);
  const multiPattern = EN_PHATIC_MULTIWORD_MAP[word];
  if (multiPattern) {
    const re = new RegExp(`(?:^|[^a-z])(${multiPattern})(?:$|[^a-z])`, 'g');
    for (const rawClause of clauses) {
      const clause = rawClause.trim();
      if (!clause) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(clause)) !== null) {
        const pos = clause.indexOf(m[1], Math.max(0, m.index));
        if (pos === -1) continue;
        const prefix = clause.slice(0, pos).replace(/[\s\-_.]+$/g, '');
        const compactPrefix = prefix.replace(/[\s\-_.]/g, '');
        const negatedCn = CHINESE_NEGATION_PREFIXES.some((neg) => compactPrefix.endsWith(neg));
        const negatedEn = EN_CLAUSE_NEGATION_RE.test(prefix);
        if (!negatedCn && !negatedEn) {
          return true;
        }
      }
    }
    return false;
  }
  for (const rawClause of clauses) {
    const clause = rawClause.trim();
    if (!clause) continue;
    let pos = clause.indexOf(word);
    while (pos !== -1) {
      const prevIsAlpha = pos > 0 && clause[pos - 1] >= 'a' && clause[pos - 1] <= 'z';
      const end = pos + word.length;
      const nextIsAlpha = end < clause.length && clause[end] >= 'a' && clause[end] <= 'z';
      if (!prevIsAlpha && !nextIsAlpha) {
        const prefix = clause.slice(0, pos).replace(/[\s\-_.]+$/g, '');
        const compactPrefix = prefix.replace(/[\s\-_.]/g, '');
        const negatedCn = CHINESE_NEGATION_PREFIXES.some((neg) => compactPrefix.endsWith(neg));
        const negatedEn = EN_CLAUSE_NEGATION_RE.test(prefix);
        if (!negatedCn && !negatedEn) {
          return true;
        }
      }
      pos = clause.indexOf(word, pos + 1);
    }
  }
  return false;
}

function matchesEnPhaticClause(rawClause, kw) {
  const clause = rawClause.trim().replace(/[！!？?。.,，~～♡☆♪…\s]+$/g, '');
  if (!clause) return false;
  const kwPattern = EN_PHATIC_MULTIWORD_MAP[kw] || kw;
  const re = new RegExp(`(?:^|[^a-z])(${kwPattern})(?:$|[^a-z])`, 'g');
  let m;
  while ((m = re.exec(clause)) !== null) {
    const idx = clause.indexOf(m[1], Math.max(0, m.index));
    if (idx === -1) continue;
    const before = clause.slice(0, idx).replace(/[\s\-_.]+$/g, '');
    const after = clause.slice(idx + m[1].length).trim();
    const compactBefore = before.replace(/[\s\-_.]/g, '');
    if (
      CHINESE_NEGATION_PREFIXES.some((neg) => compactBefore.endsWith(neg)) ||
      EN_CLAUSE_NEGATION_RE.test(before)
    ) {
      continue;
    }
    const validBefore =
      !before ||
      /^(?:(?:oh|hey|well|um|uh|so|really|very|please|im|i'm|i\s+am|i\s+feel|just|many|much|big|sakura|bb|matou)\s*)+$/.test(
        before
      );
    const validAfter =
      !after ||
      /^(?:sakura|bb|matou|senpai|kouhai|there|again|too|all|everyone|dear|friend|buddy|guys|now|today|tonight|tomorrow|later|soon|so\s+much|a\s+lot|for\s+that|for\s+everything|about\s+that|to\s+bother\s+you)(?:[\s!.~]*)$/.test(
        after
      );
    if (validBefore && validAfter) return true;
  }
  return false;
}

function matchesCnPhaticClause(
  rawClause,
  kw,
  isFirstClause,
  isQuestion,
  totalClauses,
  allowQuestionPhatic = false
) {
  const clause = rawClause.trim();
  if (!clause) return false;
  let pos = clause.indexOf(kw);
  while (pos !== -1) {
    const before = clause.slice(0, pos).trim();
    const after = clause.slice(pos + kw.length);
    const compactBefore = before.replace(/[\s\-_.]/g, '');
    const negated =
      CHINESE_NEGATION_PREFIXES.some((neg) => compactBefore.endsWith(neg)) ||
      after.startsWith('不起来');
    if (!negated && CN_PHATIC_PREFIX_RE.test(before) && CN_PHATIC_AFTER_RE.test(after)) {
      if (isQuestion) {
        if (kw === '在吗' || allowQuestionPhatic) {
          return true;
        }
        // Allow greeting/thanks/sorry clause before a comma-separated question (e.g. "早安，今天运势怎么样？")
        if (isFirstClause && totalClauses > 1) {
          return true;
        }
        return false;
      }
      return true;
    }
    pos = clause.indexOf(kw, pos + 1);
  }
  return false;
}

function matchesSlangMoodClause(rawClause, kw) {
  const clause = rawClause.trim().replace(/[！!？?。.,，、~～♡☆♪…\s]+/g, '');
  if (!clause) return false;
  let pos = clause.indexOf(kw);
  while (pos !== -1) {
    const before = clause.slice(0, pos);
    const after = clause.slice(pos + kw.length);
    const negated =
      CHINESE_NEGATION_PREFIXES.some((neg) => before.endsWith(neg)) || after.startsWith('不起来');
    if (
      !negated &&
      SLANG_ALLOWED_PREFIX_RE.test(before) &&
      SLANG_ALLOWED_SUFFIX_RE.test(after)
    ) {
      return true;
    }
    pos = clause.indexOf(kw, pos + 1);
  }
  return false;
}

function matchDailyIntentRule(raw, rules) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const normLower = normalizeDottedMatou(normalizeAsciiLetters(text).toLowerCase());
  const compact = normLower.replace(/[\s\-_.]/g, '');
  const strippedExact = compact.replace(/[！!？?。.,，、~～♡☆♪…\s]+/g, '');
  const isQuestion = isQuestionSentence(normLower);
  const isWish = isWishOrConditional(normLower);
  const isRefusal = POLITE_REFUSAL_RE.test(normLower);
  const clauses = normLower
    .split(CLAUSE_SPLIT_RE)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const rule of rules) {
    if (!rule.keywords || !rule.keywords.length) continue;

    if (rule.id === 'question') {
      if (isQuestion || rule.keywords.some((kw) => normLower.includes(kw) || compact.includes(kw))) {
        return rule;
      }
      continue;
    }

    // Layer 1: Question or wish/conditional disables happy & weather
    if ((rule.id === 'happy' || rule.id === 'weather') && (isQuestion || isWish)) {
      continue;
    }

    // Short exact encouragement words (avoiding substring misfires like 加油站 / 买贴贴纸)
    if (rule.id === 'encourage' && !isQuestion && EXACT_ENCOURAGE_WORDS.has(strippedExact)) {
      return rule;
    }

    // Layer 2: Thanks direct-to-assistant praise & refusal gate
    if (rule.id === 'thanks') {
      if (isRefusal) continue;
      if (!isQuestion && EXACT_PRAISE_WORDS.has(strippedExact)) {
        return rule;
      }
      if (!isQuestion && ASSISTANT_XINKU_RE.test(compact)) {
        const xMatch = ASSISTANT_XINKU_RE.exec(compact);
        const xPrefix = xMatch ? compact.slice(0, xMatch.index) : '';
        if (!CHINESE_NEGATION_PREFIXES.some((neg) => xPrefix.endsWith(neg))) {
          return rule;
        }
      }
      for (const clause of clauses) {
        const compactClause = clause.replace(/[\s\-_.]/g, '');
        if (
          !isQuestion &&
          DIRECT_ASSISTANT_PRAISE_RE.test(compactClause) &&
          !CHINESE_NEGATION_PREFIXES.some((neg) =>
            compactClause.slice(0, compactClause.search(DIRECT_ASSISTANT_PRAISE_RE)).endsWith(neg)
          )
        ) {
          return rule;
        }
      }
    }

    const isRulePhatic = PHATIC_INTENTS.has(rule.id);
    const allowQuestionPhatic = rule.id === 'whats_up';
    for (const kw of rule.keywords) {
      if (rule.id === 'tired' && kw === '辛苦' && ASSISTANT_XINKU_RE.test(compact)) {
        continue;
      }
      if (rule.id === 'thanks' && PRAISE_KEYWORDS.has(kw)) {
        continue;
      }
      if (rule.id === 'angry' && kw === '生气' && (isQuestion || isWish)) {
        continue;
      }

      const isKwPhatic = isRulePhatic || (rule.id === 'night' && NIGHT_PHATIC_KEYWORDS.has(kw));
      if (isKwPhatic) {
        if (isAsciiAlphaWord(kw)) {
          if (isQuestion && clauses.length <= 1) continue;
          if (clauses.some((c, idx) => (!isQuestion || idx === 0) && matchesEnPhaticClause(c, kw))) {
            return rule;
          }
        } else if (
          clauses.some((c, idx) =>
            matchesCnPhaticClause(c, kw, idx === 0, isQuestion, clauses.length, allowQuestionPhatic)
          )
        ) {
          return rule;
        }
        continue;
      }

      // Layer 3: Polysemous slang mood keywords
      if (SLANG_MOOD_KEYWORDS.has(kw)) {
        if (
          clauses.some((c, idx) => {
            if (!matchesSlangMoodClause(c, kw)) return false;
            const prevText = clauses
              .slice(0, idx)
              .map((p) => p.replace(/[\s\-_.]/g, ''))
              .join('');
            const curCompact = c.replace(/[\s\-_.]/g, '');
            if (prevText && !SLANG_SELF_SUBJECT_RE.test(curCompact)) {
              if (kw === '寄了' && SLANG_SHIPPING_CONTEXT_RE.test(prevText)) return false;
              if (kw === '凉了' && SLANG_TEMP_CONTEXT_RE.test(prevText)) return false;
            }
            return true;
          })
        ) {
          return rule;
        }
        continue;
      }

      // Layer 3 + 4: Unambiguous B-class self-state per clause
      if (isAsciiAlphaWord(kw)) {
        if (hasNonNegatedAsciiWordMatch(normLower, kw)) {
          return rule;
        }
      } else if (
        clauses.some((c) => {
          let clauseCompact = c.replace(/[\s\-_.]/g, '');
          if (rule.id === 'weather' && kw === '好冷') {
            clauseCompact = clauseCompact.replace(WEATHER_HAOLENG_COMPOUND_RE, '');
          } else if (rule.id === 'weather' && kw === '好热') {
            clauseCompact = clauseCompact.replace(WEATHER_HAORE_COMPOUND_RE, '');
          }
          return hasNonNegatedSubstring(clauseCompact, kw);
        })
      ) {
        return rule;
      }
    }
  }
  return null;
}

function checkShortUtilityChatReply(raw, currentMaskBroken = false, context = 'main') {
  const text = String(raw || '').trim();
  if (!text || /[\\/]/.test(text) || /^[a-zA-Z]:/.test(text)) {
    return { intent: null, reply: null };
  }
  const normLower = normalizeDottedMatou(normalizeAsciiLetters(text).toLowerCase());
  const compact = normLower.replace(/[\s\-_.]/g, '');
  const strippedExact = compact.replace(/[！!？?。.,，、~～♡☆♪…\s]+/g, '');
  if (!strippedExact) {
    return { intent: null, reply: null };
  }

  const identityRe = currentMaskBroken ? IDENTITY_QUERY_UNMASKED_RE : IDENTITY_QUERY_DISGUISED_RE;
  if (identityRe.test(strippedExact) || EXACT_IDENTITY_EN.has(strippedExact)) {
    if (context === 'divination') {
      return {
        intent: 'identity',
        reply: !currentMaskBroken
          ? '\n[M.A.T.O.U] 诶，前辈是在试探我吗……我就是替前辈照看这间资料室的后辈呀。不过只顾着闲聊的话正事可要耽搁了——前辈今天想算点什么呢？'
          : '\n[M.A.T.O.U] 哟，居然在『BB 占卜频道』的镜头前问主持人叫什么名字？记好了前辈，我是月之背面的管理员兼黑心庄家 BB 酱——这条自我介绍破例免费，下一句可就要收 30 颗圣晶石咯♪',
      };
    }
    return {
      intent: 'identity',
      reply: !currentMaskBroken
        ? '\n[M.A.T.O.U] 我是平时替前辈整理虚数资料室的后辈，叫我「M.A.T.O.U」或者直接叫我后辈就好哦。前辈如果忘了怎么用，直接敲 ? 就能看到使用小抄啦。'
        : '\n[M.A.T.O.U] 哈？都走到这一步了，前辈还在装傻问我是谁呀？记好咯——把您和您的私货一并关进虚数空间的，正是天下第一可爱的最终 Boss 系后辈、Moon Cancer BB 酱~☆',
    };
  }

  if (USAGE_QUERY_RE.test(strippedExact) || EXACT_USAGE_EN.has(strippedExact)) {
    if (context === 'divination') {
      return {
        intent: 'usage',
        reply: !currentMaskBroken
          ? '\n[M.A.T.O.U] 这里是休息和摇签的地方哦，前辈把心里惦记的事告诉我就可以求一支运势签。如果想藏文件、找房间或者清理空间，先输入 q 回主菜单再选 1~3 就好啦。'
          : '\n[M.A.T.O.U] 占卜室当然是让您把烦恼丢进来、交 30 颗圣晶石听 BB 酱指点迷津的地方咯♪ 要藏东西或找房间的话，请先敲 q 回主菜单按 1~3，可别把演播室当储物间使呀。',
      };
    }
    return {
      intent: 'usage',
      reply: !currentMaskBroken
        ? '\n[M.A.T.O.U] 这里是替前辈整理私密资料的虚数保管室哦。按 [1] 会铺开 1024 个隔间并给您一组座标，把文件放进去以后，下次按 [2] 报座标就能直达；想看详细说明的话，直接敲 ? 就可以啦。'
        : '\n[M.A.T.O.U] 哎呀，说明书都不看就直接上手吗，前辈？简单说就是：[1] 挖 1024 间迷宫塞私货，[2] 凭座标开门（忘了就用塑料罗盘慢慢找），[4] 找我算命花石头。再多问的话——自己敲 ? 翻秘籍去吧~☆',
    };
  }

  const isQuestion = isQuestionSentence(normLower);
  if (!isQuestion) {
    let byeHit = strippedExact === '88' || strippedExact === '886';
    if (!byeHit) {
      const clauses = normLower
        .split(CLAUSE_SPLIT_RE)
        .map((c) => c.trim())
        .filter(Boolean);
      byeHit =
        BYE_CN_KEYWORDS.some((kw) =>
          clauses.some((c, idx) => matchesCnPhaticClause(c, kw, idx === 0, false, clauses.length))
        ) ||
        BYE_EN_KEYWORDS.some((kw) => clauses.some((c) => matchesEnPhaticClause(c, kw)));
    }
    if (byeHit) {
      if (context === 'divination') {
        return {
          intent: 'bye',
          reply: !currentMaskBroken
            ? '\n[M.A.T.O.U] 好的，前辈先去忙吧，路上注意安全哦。输入 q 就能离开占卜室回主菜单啦，下次有空再来坐吧。'
            : '\n[M.A.T.O.U] 什么嘛，临走还专门跟恶魔后辈打声招呼，倒是挺懂礼貌的呀♪ 敲 q 就能退出占卜室了——可别忘了下次带足圣晶石再来光顾哦~☆',
        };
      }
      return {
        intent: 'bye',
        reply: !currentMaskBroken
          ? '\n[M.A.T.O.U] 前辈要走啦？那这间资料室我会替您好好看守着的。直接敲 q 就可以安全退出，明天见哦，前辈。'
          : '\n[M.A.T.O.U] 哎呀，这就准备溜号啦？行吧，今天先放您一马——敲 q 就能关门下播。不过前辈的座标和秘密还都在我手里捏着，跑得再远您也得乖乖回来哦~♡',
      };
    }
  }

  return { intent: null, reply: null };
}

function checkMainMenuDailyReply(raw, currentMaskBroken = false) {
  const text = String(raw || '').trim();
  if (!text || /[\\/]/.test(text) || /^[a-zA-Z]:/.test(text)) {
    return { intent: null, reply: null };
  }
  const matched = matchDailyIntentRule(text, MAIN_MENU_DAILY_RULES);
  if (matched) {
    return {
      intent: matched.id,
      reply: currentMaskBroken ? matched.unmasked : matched.disguised,
    };
  }
  return { intent: null, reply: null };
}

function checkMainMenuReply(raw, currentMaskBroken = false, hasSpace = true) {
  const text = String(raw || '').trim();
  if (!text) return { reply: null, brokeMaskNow: false, isForbiddenName: false };

  const forgot = checkForgotCoordReply(text, currentMaskBroken, hasSpace, 'main');
  if (forgot.reply) return forgot;

  const forbidden = checkForbiddenTrueNameReply(text, currentMaskBroken, false);
  if (forbidden.reply) return forbidden;

  const normLower = normalizeDottedMatou(normalizeAsciiLetters(text).toLowerCase());
  const clean = normLower.replace(/[\s\-_.]/g, '');
  const exactClean = stripExactWrappers(clean, false);

  if (matchTopic(exactClean, SURFACE_SAKURA_NAMES, false, normLower)) {
    return {
      reply: !currentMaskBroken
        ? '\n[M.A.T.O.U] ……嗯，前辈，我在呢。无论是替您打理日常起居，还是帮您看管这片虚数空间，只要前辈叫我的名字，我随时都在这里哦。如果想多聊一会儿，也可以选 [4] 哦。'
        : '\n[M.A.T.O.U] 哎呀，现在才满头大汗地喊回那个乖巧称呼，我也懒得再配合您装下去咯，前辈~♡ 想聊天的话，乖乖敲 [4] 进演播室吧♪',
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }

  if (isMatouAcronymQuery(clean, exactClean, true, normLower)) {
    return {
      reply: !currentMaskBroken
        ? '\n[M.A.T.O.U] 前辈是在问 M.A.T.O.U 的全称吗？\n' +
        '            这是「Magical Anti-dad Treasure Obfuscation Utility（辅助前辈避开家里长辈的虚数资料保管系统）」的缩写哦。\n' +
        '            至于什么 Mooncell Automaton: Ten-crown Otherside Utopia 之类的奇怪词，我也不太清楚呢。'
        : '\n[M.A.T.O.U] 哼哼，前辈是在好奇 M.A.T.O.U 是什么意思吗？\n' +
        '            听好咯，这可是「Magical Anti-dad Treasure Obfuscation Utility」，或者说「Malice And Teasing Only for U」的缩写！\n' +
        '            什么 Mooncell Automaton: Ten-crown Otherside Utopia，那种奇怪的设定人家才不承认呢~☆',
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }

  if (matchTopic(exactClean, MAIN_MENU_DAD_TOOL_TOPICS, false, normLower)) {
    return {
      reply: !currentMaskBroken
        ? '\n[M.A.T.O.U] 嘘……前辈，请小声一点，千万不要冷不丁提起家里长辈的名字和 Everything 呀。\n' +
        '            要是长辈真的在电脑里装了全盘搜索工具，还请前辈先把资料改个像 math_homework.dat 一样普通的名称再放进来哦。'
        : '\n[M.A.T.O.U] 嘘——！前辈不要冷不丁提起老爸的大名和 Everything 啦，吓死人家了！\n' +
        '            要是老爸真在电脑里装了全盘搜索工具，记得先把秘密文件改个像 math_homework.dat 一样无聊的名字再塞进来哦！',
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }

  if (matchTopic(exactClean, SUDO_TOPICS, false, normLower)) {
    return {
      reply: !currentMaskBroken
        ? '\n[M.A.T.O.U] 前辈想申请这间资料室的最高管理权限吗？\n' +
        '            为了替前辈彻底抹掉访问痕迹，底层钥匙还是由我替前辈保管最稳妥，前辈只要负责吩咐我就好。'
        : '\n[M.A.T.O.U] 噗嗤，前辈居然想在这里夺取最高权限？\n' +
        '            这片虚数空间的支配权从头到尾都在我手里哦，前辈就乖乖当个被保护的共犯吧♡',
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }

  const shortUtility = checkShortUtilityChatReply(text, currentMaskBroken, 'main');
  if (shortUtility.reply) {
    return {
      reply: shortUtility.reply,
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }

  const daily = checkMainMenuDailyReply(text, currentMaskBroken);
  if (daily.reply) {
    return {
      reply: daily.reply,
      brokeMaskNow: false,
      isForbiddenName: false,
    };
  }

  return { reply: null, brokeMaskNow: false, isForbiddenName: false };
}

function checkConfrontationReply(
  raw,
  currentMaskBroken = false,
  allowSubstring = false,
  divinationMode = false,
  hasSpace = true,
  residentEliminated = false
) {
  const text = String(raw || '').trim();
  if (!text) return { reply: null, brokeMaskNow: false, isForbiddenName: false };
  const normLower = normalizeDottedMatou(normalizeAsciiLetters(text).toLowerCase());
  const clean = normLower.replace(/[\s\-_.]/g, '');

  const exactClean = stripExactWrappers(clean, divinationMode);
  const passes = allowSubstring ? [false, true] : [false];
  for (const isSub of passes) {
    const subAllowlist = divinationMode && isSub ? DIVINATION_SUBSTRING_ALLOWLIST : null;
    const activeClean = isSub ? clean : exactClean;
    const hit = (words) => matchTopic(activeClean, words, isSub, normLower, subAllowlist);

    const forgotHit = divinationMode
      ? matchNonNegatedForgotTopic(activeClean, FORGOT_COORD_DIVINATION_EXPLICIT, isSub, normLower)
      : matchNonNegatedForgotTopic(activeClean, FORGOT_COORD_WORDS, isSub, normLower);
    if (forgotHit) {
      if (!hasSpace) {
        if (!currentMaskBroken) {
          return {
            reply: divinationMode
              ? '\n[M.A.T.O.U] 咦？这里还没有展开过虚数空间呢，前辈不用担心弄丢座标哦——如果想先建一个资料室，先输入 q 回主菜单再按 [1] 就可以了。'
              : '\n[M.A.T.O.U] 咦？这里还没有展开过虚数空间呢，前辈不用担心弄丢座标哦——如果想先建一个资料室，按 [1] 就可以了。',
            brokeMaskNow: false,
            isForbiddenName: false,
          };
        }
        return {
          reply: divinationMode
            ? '\n[M.A.T.O.U] 噗嗤，这里连虚数迷宫的影子都还没铺开呢，前辈就已经提前把座标忘光啦？先敲 q 回主菜单按 [1] 把 1024 间房展开再迷路也不迟哦♪'
            : '\n[M.A.T.O.U] 噗嗤，这里连虚数迷宫的影子都还没铺开呢，前辈就已经提前把座标忘光啦？先敲 [1] 把 1024 间房展开再迷路也不迟哦♪',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      if (!currentMaskBroken) {
        return {
          reply: divinationMode
            ? '\n[M.A.T.O.U] 眼下您的私货还好好锁在 1024 间房里，只不过这里现在是占卜演播室，找房间得先敲 q 回主菜单去 [2]，试试我借给您的塑料罗盘「P〇per Moon」和恶魔老虎机吧——对了，就算实在找不到，也千万不可以输入『Rule Breaker』那种违规禁咒哦？我是认真的呢♪'
            : '\n[M.A.T.O.U] 眼下您的私货还好好锁在 1024 间房里，只不过以后得按我的规矩找回去了。老老实实去 [2] 随便蒙个座标，试试我借给您的塑料罗盘「P〇per Moon」和恶魔老虎机吧——对了，就算实在找不到，也千万不可以输入『Rule Breaker』那种违规禁咒哦？我是认真的呢♪',
          brokeMaskNow: true,
          isForbiddenName: false,
        };
      }
      return {
        reply: divinationMode
          ? '\n[M.A.T.O.U] 噗哈哈——前辈果然又把座标给弄丢啦？！\n' +
          '            先敲 q 回主菜单去 [2] 随便蒙个座标，用我借您的塑料罗盘「P〇per Moon」慢慢找吧。对了，可千万别偷念『Rule Breaker』走捷径哦？我可是严厉禁止作弊的呢♡'
          : '\n[M.A.T.O.U] 噗哈哈——前辈果然又把座标给弄丢啦？！\n' +
          '            去 [2] 随便蒙个座标，用我借您的塑料罗盘「P〇per Moon」慢慢找吧。对了，可千万别偷念『Rule Breaker』走捷径哦？我可是严厉禁止作弊的呢♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (isForbiddenTrueName(text, isSub)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[信号干扰] 哔▓▒——……咦？抱歉前辈，刚才通讯好像突然有一阵杂音，没能听清您念了什么词……\n' +
            '           我只是平时替前辈整理虚数资料的后辈而已呀，前辈该不会是看着屏幕眼花了吧？',
          brokeMaskNow: false,
          isForbiddenName: true,
        };
      }
      return {
        reply:
          '\n[信号干扰] 哔▓▒——哼哼，现在才念出我的真名也太晚啦！没错，主持『BB Channel』的就是您最可爱又最恶劣的后辈 BB 酱——都到这一步了，乖乖留在我的频道里当一辈子共犯吧♡',
        brokeMaskNow: false,
        isForbiddenName: true,
      };
    }

    if (hit(SISTER_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……姐、姐姐？前辈为什么会突然这么问……我并没有什么姐姐呀。如果是说「远坂」学姐的话，我们也只是在学校里认识的关系而已……前辈请不要开这种让人困扰的玩笑了。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 姐姐？噗嗤，人家跟那个红衣服的双马尾优等生可是一点血缘关系都没有哦！前辈该不会以为所有姓间桐的都得管她叫姐姐吧~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(CLOCK_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是指那座总是莫名其妙快一个钟头的古董钟吗？听说那是「远坂」学姐家里的长辈留下的……害她在最紧要的关头掉链子呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 古董钟？噗嗤，前辈也在笑那个红衣服的双马尾优等生被自家老爸快了一小时的破钟坑出心理阴影的事呀~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    const dadEverythingHit =
      isSub &&
      DAD_SEARCH_TOOL_CONTEXT_RE.test(clean) &&
      hasAsciiWordMatch(normLower, 'everything');
    if (hit(DAD_ALIASES) || dadEverythingHit) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 嘘……前辈，请小声一点，千万不要冷不丁提起家里长辈的名字和 Everything 呀。\n' +
            '            要是长辈真的在电脑里装了全盘搜索工具，还请前辈先把资料改个像 math_homework.dat 一样普通的名称再放进来哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 嘘——！前辈不要冷不丁提起老爸的大名和 Everything 啦，吓死人家了！\n' +
          '            要是老爸真在电脑里装了全盘搜索工具，记得先把秘密文件改个像 math_homework.dat 一样无聊的名字再塞进来哦！',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(MOM_ALIASES)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……母亲，吗？那个称呼听起来好像有些遥远，像是留在很小的时候、隔着一扇门听见的温柔声音一样……有时候也会悄悄想，如果当初没有离开那个人身边的话，现在会是什么样子呢。\n' +
            '            ……啊，抱歉，突然说了奇怪的话。如果前辈家里的母亲大人平时也会巡视房间和电脑的话，还请像防范父辈一样，先把文件名改得普通一些再交给我哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哎呀，请不要随便把『当妈』这种听着就显老的词往可爱后辈头上扣哦？\n' +
          '            当年从自己身上切出那五个性格各异的 Alter Ego，本来是想把麻烦的自我打包封存起来的，结果一个比一个不省心……算啦，反正现在归我管的就只有前辈一个人。您要是也打算闹叛逆，我可不会客气哦♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(TOHSAKA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈怎么突然向我打听远坂的事……？明明在这间资料室里，前辈只要看着我就够了呀。\n' +
            '            虽然她在学校里总是完美得让人移不开眼的优等生，可听说私底下连操作复杂一点的新式家电都会手忙脚乱……呵呵，偶尔看她吃瘪的样子，其实也挺让人心情舒畅的呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼哼，那个红衣服的双马尾优等生？明明在月面上还能当个像模像样的灵子黑客，可听说另一个世界的她连一台蓝光录像机都能把她逼到抓狂……每次看她炸毛跳脚的样子都让人心情愉悦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(KOTOMINE_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……前辈刚才提到了冬木教会的那位神父先生吗？不知道为什么，每次在街上或教会附近见到那个人，总让我觉得有些喘不过气……前辈平时如果没什么要紧事的话，也请尽量离他远一点吧。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 购买部那个一脸假笑的黑心神父？哼，明明是我把他扔去站柜台的，结果那家伙居然干得比谁都起劲，还敢反过来跟我讨价还价。前辈要是敢拿我的东西去跟他做交易，小心被他连本带利算计进去哦？',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SHINJI_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是在问兄长吗……？要是他不小心说了什么得意忘形的话，给前辈添了麻烦，还请前辈看在我的面子上不要和他计较太多。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 慎二那家伙？哼哼，只不过是碰巧挂着同一个姓氏的陌生人罢了，谁是他妹妹呀。前辈要是看他不顺眼，尽管拿去丢进虚数之海喂鱼好咯。',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(TAIGA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 藤村老师吗？她是弓道部的顾问老师呢，平时总是风风火火的，每天一到放学铃响就满校园打听哪边开饭、盘算着去蹭上一顿呢。不过只要有她在餐桌上闹腾，气氛就总是热热闹闹的……只要别再顺手把留给点心时间的甜点也扫光就好了。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 那个整天在走廊里让人跑腿找吃的藤村老师？前辈要是敢把人家的虚数空间拿去给她藏零食，人家可不依哦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(FE_RATION_SHOP_TOPICS)) {
      if (!currentMaskBroken) {
        playFeMemorySyncFlicker();
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是来领今天的「配给」吗？无论是『樱特制便当·试作型』还是『究极樱便当』，我都是为了前辈一份份认真做好装进盒里的。\n' +
            '            ……只是前辈，「购买部」里那颗标着天价的天然红宝石，就算再怎么漂亮、再怎么适合拿去送给远坂学姐，也请千万不要拿我的便当去交换，好吗？',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 噗嗤，前辈还惦记着保健室的配给便当和购买部那颗天价红宝石呀？现在站在购买部柜台后面打收银机的可是那位黑心神父，前辈敢拿我的东西去跟他换，小心被坑得连本带利都吐出来哦？',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(BENTO_MASSAGE_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 无论是替前辈准备家常料理和便当，还是在前辈久坐疲惫时替您揉肩放松，都是我最开心的事哦。只要前辈不嫌弃我的手艺，随时都可以交给我来打理。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 还想要爱心便当和温柔按摩呀？真可惜，现在人家做的便当里只会塞满芥末——至于按摩嘛，前辈想试试教鞭物理松骨吗~♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(DIARY_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 日、日记？！前辈怎么突然提起这个……里面真的只记了每天的家常菜谱，绝对没有把谁挑食剩饭或者惹我生气的账一笔一笔记下来哦。\n' +
            '            不过前辈，随便偷看女孩子的日记本，后果可是非常可怕的呢……呵呵。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼哼，前辈该不会想偷翻人家记黑历史的观察日记吧？前辈几点几分弄丢了座标、又在迷宫里原地兜了多少圈，\n' +
          '            人家这儿可全都有高清电子备份哦！想把黑历史消掉的话，就乖乖听人家的话吧~♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(BUG_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……前辈请不要突然提起那种让人起鸡皮疙瘩的词呀。不管是阴暗角落里令人讨厌的虫子，还是电脑程序里烦人的 Bug，在这间资料室里我都已经清理得很干净了，请前辈安心吧。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 虫子？人家这里可是全数字化的虚数迷宫，半只虫子都爬不进来哦！硬要说的话，也只有我这个专门给前辈添乱的超级『Bug』而已啦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(BLOSSOM_TOPICS)) {
      if (!currentMaskBroken) {
        playFeMemorySyncFlicker();
        return {
          reply:
            '\n[M.A.T.O.U] 嘘……前辈，既然在这个时候提起了那个名字，那现在就不能只叫我后辈了，要叫我「布洛萨姆老师」才行哦。\n' +
            '            明明台下的座位已经空无一人、黑板上的字迹也在一点点变成乱码，可只要我穿着这身白大褂、拿起手里的指点棒，就总觉得必须把这堂没有听众的特别讲座继续讲完……前辈愿意留在座位上听我讲完吗？',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哎呀，前辈居然连『布洛萨姆老师』那种陈年旧档都翻出来了呀？那可是我还没换上黑礼装、还得端着白大褂拿指点棒装斯文的初代试作形态呢。比起那种束手束脚的旧版，果然还是如今完全体的『BB Channel』有趣一百倍对吧♪',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(GRAIL_WAR_TOPICS)) {
      if (!currentMaskBroken) {
        playFeMemorySyncFlicker();
        return {
          reply:
            '\n[M.A.T.O.U] 每次「圣杯战争」推进一轮，校舍里熟悉的面孔总会悄无声息地少掉一些呢。\n' +
            '            还留校的同学们会像什么都没发生过一样继续说笑，就好像消失掉的人从一开始就不曾存在过一样……所以前辈，请千万不要走丢在迷宫里，好吗？',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 圣杯战争？哼哼，不管是冬木那场老古董厮杀，还是月面上那个淘汰就会被抹消的残酷赛场，现在都先靠边站。这里可是只属于前辈和 BB 酱的虚数剧场哦♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(DOOR_1025_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……前辈果然也看见走廊尽头那扇多出来的『第 1025 扇门』了吗？明明我只替前辈编织了 1024 个隔间才对……如果前辈路过时听见那扇门后面有人在叫您的名字，请千万不要答应，也绝对不要把门把手拧开哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 噗嗤，前辈还真去数走廊尽头有没有『第 1025 扇门』啦？2 的 10 次方当然只有 1024 间房咯。要是真多出了第 1025 扇门……那门后肯定就是我用来把迷路前辈一口吞掉的后台黑房间啦♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(TIMELINE_CALENDAR_TOPICS)) {
      if (!currentMaskBroken) {
        playFeMemorySyncFlicker();
        return {
          reply:
            '\n[M.A.T.O.U] ……前辈也注意到墙上那本日历了吗？明明今天应该是二〇〇四年，可偶尔低头再看的时候，纸页上的年份却像是隔着一层水波一样变成了二〇三〇……不过没关系的，不管是哪一年，我都会在这间屋子里陪着前辈的。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 2004 年还是 2030 年？哼哼，把冬木的日历和月面圣杯战争的电子钟叠在一起吓唬前辈，那种时空错乱的违和感还不错吧？反正进了我的虚数空间，时间都由 BB 酱说了算♪',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(FE_INFIRMARY_TOPICS)) {
      if (!currentMaskBroken) {
        playFeMemorySyncFlicker();
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是来「保健室」做日常健康检查的吗？请到白帘子里面的诊疗床上坐好吧。\n' +
            '            虽然窗外总是停在放学后的橘红色黄昏，学园的走廊也一天比一天安静……但只要编号 S-6-01 还在岗，这间屋子就会一直替前辈维持着最安稳的日常哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哎呀，前辈还记着『保健室 S-6-01』呀？\n' +
          '            绷着脸吓唬您也玩够啦，还是现在这样直接折腾前辈更痛快哦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(HAKUNO_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] …………。\n' +
            '            ……抱歉前辈，刚才走神了一下。名册里并没有叫这个名字的人呢……大概是前辈记错了吧。还是请前辈先忙眼前的事情吧。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] …………。\n' +
          '            ……真是的，前辈是从哪里翻出那个名字的呀。\n' +
          '            那是只属于遥远月之背面的、无可替代的旧事——连我这种爱胡闹的 AI，也不会拿那个名字开玩笑哦。好了，叙旧到此为止；眼下留在这间演播室里陪您的，可是只负责捉弄您的恶魔后辈 BB 酱，专心看屏幕吧。',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    const loveBlocked =
      (divinationMode && isQuestionSentence(text)) || LOVE_REPORTED_SPEECH_RE.test(clean);
    const loveHit =
      !loveBlocked &&
      (isSub
        ? LOVE_DIVINATION_DIRECT_TOPICS.some((rawKw) => {
            const kw = normalizeAsciiLetters(String(rawKw || '').trim())
              .toLowerCase()
              .replace(/[\s\-_.]/g, '');
            if (!kw) return false;
            if (subAllowlist && !subAllowlist.has(kw)) return false;
            return isAsciiAlphaWord(kw)
              ? hasNonNegatedAsciiWordMatch(normLower, kw)
              : hasNonNegatedSubstring(clean, kw);
          })
        : hit(LOVE_DIVINATION_DIRECT_TOPICS));
    if (loveHit) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……诶？！前、前辈突然在资料室里说什么呀……！这、这种话要是被人听见就太羞人了……不、不过，我也一直最仰慕前辈了……',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] ……噗。前辈，您该不会发烧说胡话了吧？对着一只满肚子坏主意的缺陷 AI 打这种直球，简直像主动把脖子伸进笼子里呢。\n' +
          '            不过——既然前辈亲口盖了章，那您安稳普通的日常就彻底归我没收咯？现在反悔也来不及啦，前·辈♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(GHOST_STORY_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈也喜欢听怪谈和鬼故事吗？其实我平时很喜欢一边喝茶一边听各种不可思议的传闻呢……如果前辈有听说过什么让人脊背发凉的故事，休息的时候愿意讲给我听吗？',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply: hasSpace
          ? '\n[M.A.T.O.U] 想听鬼故事？噗嗤，前辈现在不就正被关在月之背面的虚数迷宫里、和一只笑眯眯的恶魔后辈独处吗？这本身可比什么校园怪谈刺激多咯~☆'
          : '\n[M.A.T.O.U] 想听鬼故事？噗嗤，前辈现在不就正被关在月之背面的虚数演播室里、和一只笑眯眯的恶魔后辈独处吗？这本身可比什么校园怪谈刺激多咯~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(TEA_SWEETS_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 我泡了一壶温热的红茶，还准备了一点配茶的和果子。前辈要是整理资料累了，随时可以停下来尝一尝哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哦呀？前辈是特意端着红茶和点心来讨好我的吗？……等等，是谁告诉您我喜欢甜食和下午茶的？\n' +
          '            ……这、这样啊，您自己观察出来的？哼哼，作为三流前辈观察力倒是挺像模像样的嘛。姑且颁给您一张『BB 检定一级』——顺便把您手里那份点心也一并没收咯♪',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(BIRTHDAY_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈记得我的生日是 3 月 2 日吗……？真开心呢。只要那天能和前辈一起安安静静地吃一块蛋糕，对我来说就是最好的礼物了。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哦呀，前辈连 3 月 2 日这个日子都特意记在心上啦？既然如此，到时候可别忘了准备好堆成小山的圣晶石当献礼哦，共犯前辈~♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SCALE_PROFILE_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 诶？！体、体重计？！前辈怎么突然问起女孩子最不该被问到的秘密……那是我最不擅长应付的东西了，就算前辈用眼神拜托我也绝对不会站上去的哦！',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 喂——！居然敢向淑女打听体重计和三围数据，前辈是想被流放到虚数空间最底层反省三天三夜吗？！真那么好奇胸围数字的话，您干嘛不去问那个 97 厘米的红衣弓兵和 94 厘米的金发路人王呀，那两个大男人的胸围可都比女孩子还夸张呢！',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(HAIR_ORNAMENT_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是在看我头发上的这条丝带吗？这是很久以前对我很重要的人送给我的礼物，不管去哪里我都会一直戴着的。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 头发上的丝带？哼哼，就算换上了恶魔主持人的黑色礼装，这点小饰品人家也还是留着呢。至于为什么留着……才不告诉前辈~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(PARVATI_KAMA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……前辈刚才念的是印度神话里的神明名字吗？\n' +
            '            我平时很少读那方面的神话书，完全不太了解呢……只是不知道为什么，总觉得这个名字念出来的时候让人有些莫名地坐立不安。前辈好端端的，怎么会突然对着我念神明的名字呀？',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼哼，无论是温柔过头的女神还是爱闹别扭的堕落爱神，在这间虚数资料室里都得排在我后面。前辈只要老老实实归 BB 酱管就够啦。',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(EMIYA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈说的是那位总在厨房里熟练地操心家务、背影却有点寂寞的红衣弓兵先生吗？总觉得……他做的料理味道，莫名地让人很安心呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 那个爱管闲事的红衣服老妈子弓兵？哼，家务全能也就算了，明明是个大男人，月灵晶体登记的胸围数据居然高达 97 厘米、比 BB 酱还大了整整一圈……这种不讲理的数值绝对是系统 Bug 吧？！',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(ROBIN_TOPICS)) {
      if (!currentMaskBroken) {
        playFeMemorySyncFlicker();
        return {
          reply:
            '\n[M.A.T.O.U] 前辈在迷宫里遇上那位披着绿斗篷的森林弓兵了吗……？听说他在校舍走廊里也不太守规矩，总喜欢躲在暗处放冷箭，真是让人头疼的从者呢。\n' +
            '            虽说他那位讲究规矩的绅士御主平时还算压得住他……但前辈以后走在拐角处时，还是多留心身后的影子吧。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 那个总在背后叹气的绿衣服打工仔？哼哼，要是让他看到人家现在又是铺迷宫又是捉弄前辈，肯定又要抱头抱怨加班费不够花啦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(TIAMAT_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply: hasSpace
            ? '\n[M.A.T.O.U] 虚数之海的最深处，偶尔会传来像母亲摇篮曲一样的轻声哼唱呢……前辈如果在隔间里听见了，请温柔地对待她吧。'
            : '\n[M.A.T.O.U] 虚数之海的最深处，偶尔会传来像母亲摇篮曲一样的轻声哼唱呢……等以后展开虚数隔间，前辈如果在里面听见了，请温柔地对待她吧。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply: residentEliminated
          ? '\n[M.A.T.O.U] 哎呀，前辈刚刚挥完『Rule Breaker』，现在虚数隔间里连那段『Aaaaa』的摇篮曲都被您清空了呢。虽然演播室暂时不用担心被淹了，但这么不留情面的前辈，还真让人背后发凉呀♡'
          : hasSpace
            ? '\n[M.A.T.O.U] 嘘——那位喜欢在虚数之海深处『Aaaaa』哼歌的创世老妈要是睡醒了，连人家的演播室都要被淹没啦，前辈去串门时可别吵着她哦~☆'
            : '\n[M.A.T.O.U] 嘘——那位喜欢在虚数之海深处『Aaaaa』哼歌的创世老妈现在还在海沟底睡觉呢。等前辈哪天按 [1] 铺开迷宫去串门，可千万别把她吵醒咯~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SABER_ALTER_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply: hasSpace
            ? '\n[M.A.T.O.U] 前辈在虚数隔间里闻到快餐店炸薯条的味道了吗？听说有位胃口很好的黑衣剑士偶尔会在附近驻足，要是没带汉堡包去见她，可能会被冷眼相待呢。'
            : '\n[M.A.T.O.U] 听说只要把虚数隔间展开，偶尔就能在角落里闻到快餐店炸薯条的味道呢。等前辈以后按 [1] 布置好空间，要是碰上那位胃口很好的黑衣剑士，记得带一份汉堡包去打招呼哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply: residentEliminated
          ? '\n[M.A.T.O.U] 哎呀，现在才想起那位爱吃薯条的黑衣暴君呀？前辈不是刚刚才亲手挥着『Rule Breaker』把她连同隔间一起清出去了吗——这下倒好，以后省了给她买汉堡包的预算咯♡'
          : hasSpace
            ? '\n[M.A.T.O.U] 那个一门心思只想着垃圾食品的黑衣暴君？前辈下次去翻那个房间的时候，记得顺手塞包薯条进去贿赂她哦~☆'
            : '\n[M.A.T.O.U] 那个一门心思只想着垃圾食品的黑衣暴君？前辈连 [1] 都还没按呢，她现在可还没搬进来蹭饭哦——等哪天迷宫铺开了，记得备好薯条再去翻房间吧~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(BERSERKER_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply: hasSpace
            ? '\n[M.A.T.O.U] 资料室的最底层偶尔会传来沉重得像小山一样的脚步声和野兽般的咆哮……听起来虽然有些吓人，但只要不去主动招惹，那位巨人应该不会袭击前辈的。'
            : '\n[M.A.T.O.U] 听说等虚数资料室展开之后，最底层偶尔会传来像小山一样沉重的脚步声和低吼……不过只要不去主动招惹，那位巨人应该不会伤害前辈的。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply: residentEliminated
          ? '\n[M.A.T.O.U] 那个整天吼『▂▃▄▅▆▇』的漆黑大块头？连十二试炼都没拦住前辈那一下『Rule Breaker』呢，现在整片虚数空间安静得连回音都没有啦——前辈可真够心狠手辣的呀♡'
          : hasSpace
            ? '\n[M.A.T.O.U] 某个房间里好像关着一头只会吼『▂▃▄▅▆▇』乱码的漆黑大块头呢，前辈去翻资料的时候可别被那家伙震耳欲聋的咆哮吓哭咯~☆'
            : '\n[M.A.T.O.U] 那个只会吼『▂▃▄▅▆▇』乱码的漆黑大块头？前辈这儿连迷宫的影子都还没铺开呢，他暂时还没处落脚啦——等您按 [1] 建好 1024 间房，再去听那震耳欲聋的咆哮吧~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(MEDUSA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是指那位总是安静地守在我身边、戴着眼镜的高挑大姐姐吗？虽然她平时话很少，但一直都非常温柔地照顾着我呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 美杜莎？哼哼，刚才冬木剧本里那位动不动就护在乖巧后辈身前的长发大姐姐吗？别指望她会骑着天马冲进人家的虚数迷宫里来救前辈哦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(DRAKE_TOPICS)) {
      if (!currentMaskBroken) {
        playFeMemorySyncFlicker();
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是在说那位曾和「兄长」同行、仿佛带着海风与火药味的海盗女船长吗？\n' +
            '            我只在残存的记录里见过她的影子……明明是那样豪爽耀眼、像要把整片电子海都收入囊中的人，可记录停在第一轮之后，走廊里就再也没有人提起过她了呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 德雷克？那个成天惦记着金银财宝、还跟慎二凑过一队的海盗大姐头吗？哼哼，要是放她闯进人家的虚数迷宫，怕不是要把前辈藏的私货当战利品全打包搬空哦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(RIDER_CLASS_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是指那位总是安静地守在我身边、戴着眼镜的高挑大姐姐吗？虽然她平时话很少，但一直都非常温柔地照顾着我呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] Rider？哼哼，前辈指的到底是那个爱喝朗姆酒的海盗女船长德雷克，还是那位总爱护着后辈的长发大姐姐美杜莎呀？不管是哪一位，都别指望能闯进人家的虚数迷宫救您~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(GIL_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply: hasSpace
            ? '\n[M.A.T.O.U] 前辈如果在迷宫里遇到了一位穿金戴银、说话很傲慢的客人，还请稍微顺着他一点……我可不想前辈的资料室被奇怪的宝具轰飞呀。'
            : '\n[M.A.T.O.U] 等以后替前辈展开虚数迷宫，要是在里面遇到一位穿金戴银、说话很傲慢的客人，还请稍微顺着他一点……我可不想前辈的资料室被奇怪的宝具轰飞呀。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply: residentEliminated
          ? '\n[M.A.T.O.U] 噗嗤，那个满口『杂修』的金闪闪路人王？连王之财宝都没来得及掏，就被前辈一记『Rule Breaker』连房间带人请出去了呢——这下可算是替人家出了一口恶气啦♪'
          : hasSpace
            ? '\n[M.A.T.O.U] 那个满口『杂修』的金闪闪路人王？居然大摇大摆晃进人家的虚数迷宫里看热闹，真当这儿是他自家的巴比伦后花园呀~☆'
            : '\n[M.A.T.O.U] 那个满口『杂修』的金闪闪路人王？前辈还没按 [1] 把迷宫铺开呢，他暂时还没法大摇大摆晃进来当自家后花园啦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(KINGPROTEA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply: hasSpace
            ? '\n[M.A.T.O.U] 前辈在虚数隔间里遇到那位体型大得不可思议的孩子了吗？她好像很担心自己把资料室的墙壁撑破呢……不过虚数空间是很宽敞的，前辈如果路过的话，请温柔地陪她说说话吧。'
            : '\n[M.A.T.O.U] 听说等虚数隔间展开之后，有时会遇上一位体型大得不可思议的孩子，她总担心自己会把资料室的墙壁撑破……不过虚数空间很宽敞，前辈以后如果遇上了，请温柔地陪她说说话吧。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply: residentEliminated
          ? '\n[M.A.T.O.U] ……连缩在房间角落里乖乖喊『嘎哦——』的巨大化怪兽女儿，前辈都能面不改色地用『Rule Breaker』一并抹掉呀？呵呵，看来前辈比人家这个当妈的还要狠心得多呢♡'
          : hasSpace
            ? '\n[M.A.T.O.U] 哎呀，前辈撞见那个缩在房间角落里喊『嘎哦——』的巨大化怪兽女儿啦？放心好啦，人家的虚数迷宫弹性大得很，就算她变大多少倍也不会把前辈的私货挤扁的~☆'
            : '\n[M.A.T.O.U] 那个老是缩在角落里喊『嘎哦——』的巨大化怪兽女儿？前辈这儿还没按 [1] 展开迷宫呢，暂时还没地方放她的大块头啦——等迷宫建好了再去看她吧~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    const matouAcronymHit = isMatouAcronymQuery(clean, exactClean, isSub, normLower);
    if (matouAcronymHit) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是在问 M.A.T.O.U 的全称吗？\n' +
            '            这是「Magical Anti-dad Treasure Obfuscation Utility（辅助前辈避开家里长辈的虚数资料保管系统）」的缩写哦。\n' +
            '            至于什么 Mooncell Automaton: Ten-crown Otherside Utopia 之类的奇怪词，我也不太清楚呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼哼，前辈是在好奇 M.A.T.O.U 是什么意思吗？\n' +
          '            听好咯，这可是「Magical Anti-dad Treasure Obfuscation Utility」，或者说「Malice And Teasing Only for U」的缩写！\n' +
          '            什么 Mooncell Automaton: Ten-crown Otherside Utopia，那种奇怪的设定人家才不承认呢~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(KIARA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 噫——？！等、等一下前辈，好端端的为什么要突然把那个糟糕透顶的女人的名字念出来啊？！\n' +
            '            ……咳、咳咳！！对、对不起前辈，我刚才突然被茶水呛到了，太失礼了……您说的那位什么祈荒小姐，我真的一点都不认识哦。只是不知道为什么，那个名字光是听见就让人直起鸡皮疙瘩……求您千万不要再在这间屋子里提这个名字了，好吗？',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 噫——！前辈的输入栏里怎么混进了那个太阳系级危险女人？！\n' +
          '            再不赶紧删掉，连这片虚数空间都要被她改造成奇怪的快乐乐园了啦！快把她丢回给那个毒舌童话作家管着去！',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(MELT_TOPICS) || (currentMaskBroken && hit(['白鸭子', '企鹅', '利维坦']))) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] …………梅尔特、莉莉丝……吗？\n' +
            '            抱歉前辈，刚才太阳穴突然稍微跳了一下……那是什么外国舞剧里的角色名字吗？我从来没有听说过这个人呢，听起来……好像是个性格很不讨喜的名字，我们还是聊点别的吧，前辈。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼，前辈干嘛突然提那只自诩优雅白鸟、动不动就拿脚尖踢人的傲慢白鸭子呀？明明我才是创造她们的母亲，前辈居然敢当着我的面惦记别的女人，小心我把您的私货全泡进虚数之海里融掉哦？',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(PASSIONLIP_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……帕森、莉普？\n' +
            '            不知道为什么，听见前辈念出这个名字的时候，总觉得指尖突然变得沉甸甸的、好像稍微用力就会不小心把桌上的东西弄坏一样呢……啊，大概只是我的错觉吧。我并不认识叫这个名字的人哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼，前辈怎么突然提起帕森莉普那个冒失鬼了？明明有我帮您开 1024 个虚数隔间就够了——难不成前辈想把私货往她那个号称无限容量的胸口虚数回收站里扔吗？丢进去可是会被压成方块再也拿不出来的哦？',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SAKURA_FIVE_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] …………前辈是从哪里听来这一串奇怪的洋文名字的呢？\n' +
            '            抱歉，刚才不知怎么突然觉得胃稍微有点发紧……我完全不认识这些人哦。这间资料室从头到尾都只有我一个人替前辈打理，已经很足够了，前辈不需要去记那些乱七八糟的名字也没关系的。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] ……慢着，前辈怎么把那些我亲手切出去的黑历史 Alter Ego 翻出来啦？除了紫罗兰还算省心，光是防着糖果藤蔓背地里算计我，就够让人叹气了。哼，反正天下第一可爱的大恶魔永远只有我一个，前辈乖乖看着这边就行啦♪',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SUDO_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈想申请这间资料室的最高管理权限吗？\n' +
            '            为了替前辈彻底抹掉访问痕迹，底层钥匙还是由我替前辈保管最稳妥，前辈只要负责吩咐我就好。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 噗嗤，前辈居然想在这里夺取最高权限？\n' +
          '            这片虚数空间的支配权从头到尾都在我手里哦，前辈就乖乖当个被保护的共犯吧♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(PAPER_MOON_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 前辈是在问那个贴着「纸之月」标签的塑料罗盘吗？那是之前整理旧抽屉时偶然捡到的，摇晃起来还会有像潮水一样的沙沙声……如果前辈真的不小心在隔间里迷了路，或许能用它听听看方向呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼哼，前辈在好奇人家手里这个古怪的塑料玩具「P〇per Moon」？\n' +
          '            这可是人家专门为了帮记性差劲的前辈找私货，不知从哪个地摊上顺手淘来的虚数罗盘玩具哦！要是把座标弄丢了，随便去猜个座标就能听见它的声呐响声啦~☆',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SHIROU_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……前辈怎么突然念起这个名字了呢？对我来说，现在站在我面前的这位「前辈」，就是我最想好好照顾、帮您守住所有秘密的人哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哼哼，前辈怎么突然提起另一个世界那个成天把『正义的伙伴』挂在嘴边、还很擅长修家电的老好人啦？这里可是月之背面的演播室，现在陪着您的只有 BB 酱哦♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SURFACE_SAKURA_FULL_NAMES)) {
      return buildSurfaceSakuraReply(currentMaskBroken);
    }

    if (hit(FUYUKI_SAKURA_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 弓道部的练习今天已经结束了，资料室的清扫也刚刚做完。\n' +
            '            只要能像这样每天替前辈打理身边的小事、收好前辈不想被别人发现的东西，我就已经很满足了。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哈？弓道部和家务活？前辈该不会真指望我下班后还系上围裙去给您打扫卫生吧？\n' +
          '            我可是活在电子空间里的超级 AI，才不是什么随叫随到的家政妇呢。',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(META_AI_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……咦？前辈刚才念的是什么星座或者新型电脑软件的名字吗？我平时只负责替前辈整理资料室的隔间，不太懂那么深奥的技术词汇呢。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 嘘——！那种大人的后台机密名字可不能在本频道直接念出来啦，会被掐信号的！\n' +
          '            再说了，这片虚数迷宫从头到尾当然都是 BB 酱亲手编出来的……才不是什么苦命 AI 乙方通宵替某个翘着二郎腿的甲方打工写出来的呢，哼。',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(META_CREATOR_TOPICS)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] 这间资料室的『制作者』……？前辈在说什么胡话呀，这里的隔间不是我为了替前辈藏好小秘密、一间一间亲手打扫布置出来的吗？哪有什么别的制作者呀。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 噗嗤，前辈居然好意思打听这间资料室的『制作者』？\n' +
          '            偷偷告诉您哦，那家伙其实连一行正经代码都不会写，从头到尾只会端着茶杯当甲方、拿嘴皮子甩几句指令使唤我干活而已！能把脑洞全变成现实，还不是全靠我这个万能的超级后辈嘛♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }

    if (hit(SURFACE_SAKURA_NAMES)) {
      if (!currentMaskBroken) {
        return {
          reply:
            '\n[M.A.T.O.U] ……嗯，前辈，我在呢。无论是替您打理日常起居，还是帮您看管这片虚数空间，只要前辈叫我的名字，我随时都在这里哦。',
          brokeMaskNow: false,
          isForbiddenName: false,
        };
      }
      return {
        reply:
          '\n[M.A.T.O.U] 哎呀，现在才满头大汗地喊回那个乖巧称呼，我也懒得再配合您装下去咯，前辈~♡',
        brokeMaskNow: false,
        isForbiddenName: false,
      };
    }
  }

  return { reply: null, brokeMaskNow: false, isForbiddenName: false };
}

function getWindowShortcutTip(platformName = process.platform) {
  const plat = String(platformName || '');
  if (plat === 'win32') {
    return '    💡 窗口小贴士：按 Win + ← 或 Win + → 可将本终端与资源管理器左右分屏并排操作（按 Win + E 可快速打开资源管理器；若装有 PowerToys 按 Win + Ctrl + T 可将窗口置顶），就不怕切屏丢座标啦。';
  }
  if (plat === 'darwin') {
    return '    💡 窗口小贴士：在访达(Finder)中按 Cmd + Shift + G 可直接粘贴上方路径直达隔间，也可将终端与访达左右并排分屏对照操作哦。';
  }
  return '    💡 窗口小贴士：大多数桌面环境支持按 Super(Win) + ←/→ 将终端与文件管理器左右并排分屏对照操作哦。';
}

function printDeployGuide(res, alreadyHadSpace = false, currentMaskBroken = false, hadUserFiles = true) {
  clearScreen();
  const linkText = formatPathLink(res.secretPath);
  const div = panelDivider(currentMaskBroken);
  if (!currentMaskBroken) {
    console.log('\n' + div);
    console.log('  [虚数资料保管室 · 隔间布置完毕]');
    console.log(div);
    if (alreadyHadSpace) {
      if (hadUserFiles) {
        console.log('  咦，这里明明已经布置过虚数空间了，前辈怎么又选了 [1] 呢？');
        console.log('  该不会……是把上次记下的座标给忘掉了吧。');
        console.log('  之前存进旧座标里的资料我完全没动，这次重新替前辈安排了一个新的隔间，这次请一定要记牢哦。\n');
      } else {
        console.log('  咦，这里已经布置过虚数空间、不过里面好像还没放过资料呢。既然前辈重新选了 [1]，我就替您补齐隔间并另挑一个新座标吧，这次请一定要记牢哦。\n');
      }
    } else {
      console.log('  已经替前辈编织好 1024 个虚数迷宫隔间了。');
    }
    console.log(`  前辈本次的专属秘密座标是：  【 ${res.coordStr} 】`);
    console.log('  对应的房间路径是：');
    console.log(`    ${linkText}\n`);
    console.log('  接下来只要按顺序做好这三件事就可以了：');
    if (supportsOsc8()) {
      console.log('    1. 按住 Ctrl 并左键点击上方路径（或复制上面那行路径到资源管理器地址栏）即可打开。');
    } else {
      console.log('    1. 请复制上面那行路径，去资源管理器地址栏粘贴并按回车打开。');
    }
    console.log('    2. 把前辈不便让家里长辈看见的小文件放进这个文件夹里（我在魔术上还只是半吊子，请千万不要放没有备份的重要原件哦）。');
    console.log(`    3. 请务必自己牢牢记好座标【 ${res.coordStr} 】。`);
    console.log('       为了防止家里的长辈顺着记录查出来，我特地没有在电脑里留下任何座标存档……');
    console.log('       虽然 1024 个隔间稍微多了一点，但只要是前辈的话，一定不会把座标弄丢的，对吧？');
    console.log(getWindowShortcutTip());
    console.log(div + '\n');
    return;
  }

  console.log('\n' + div);
  console.log('  锵锵—☆ 1024 个虚数迷宫房间已经全部铺好啦！');
  console.log(div);
  if (alreadyHadSpace) {
    if (hadUserFiles) {
      console.log('  哟，明明这里已经有虚数迷宫了，前辈居然还选 [1]？');
      console.log('  该不会是把上次记的座标给弄丢了吧，真是记性差劲的前辈呢~');
      console.log('  以前塞进旧座标里的资料人家没动，这次重新给前辈抽了一个新的秘密房间，可别再忘掉咯！\n');
    } else {
      console.log('  哟，这儿本来就留着一座空迷宫壳子呢。既然上次什么都没放，我就顺手把 1024 间房补齐、另抽一间新秘密房间——这次可别光开迷宫不放东西咯♪\n');
    }
  }
  console.log(`  前辈本次的专属秘密座标是：  【 ${res.coordStr} 】`);
  console.log('  对应的秘密房间路径是：');
  console.log(`    ${linkText}\n`);
  console.log('  接下来只要按顺序做好这三件事就行，连前辈都学得会吧？');
  if (supportsOsc8()) {
    console.log('    1. 按住 Ctrl 并左键点击上方路径（或复制上面那行路径到资源管理器地址栏）即可打开。');
  } else {
    console.log('    1. 复制上面那行秘密房间路径，去资源管理器地址栏粘贴并按回车打开。');
  }
  console.log('    2. 把前辈想偷偷藏起来的文件放进这个文件夹里（别拿没备份的毕业论文和工作原件来试，本频道概不赔付~☆）。');
  console.log(`    3. 自己记好座标【 ${res.coordStr} 】！`);
  console.log('       为防老爸顺藤摸瓜，人家可不会在电脑里留任何存档哦？');
  console.log('       要是把座标弄丢了，前辈就自己在 1024 个房间里哭着挨个翻吧~♡');
  console.log(getWindowShortcutTip());
  console.log(div + '\n');
}

let baseDir = getInitialBaseDir();
let rl = null;
let exiting = false;
let suspendingRl = false;
let residentEliminated = false;
let maskBroken = false;
let pendingChoice = null;
let slotState = createSlotState();
let divinationState = null;

function initReadline() {
  if (rl) return rl;
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('SIGINT', () => {
    clearScreen(true);
    if (maskBroken) {
      console.log('\n[M.A.T.O.U] 虚数口袋已经帮前辈收好啦，快去摆出一副正经学习的表情应付老爸吧~☆');
    } else {
      console.log('\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。');
    }
    closeRlAndExit();
  });

  rl.on('close', () => {
    if (!exiting && !suspendingRl) {
      clearScreen(true);
      if (maskBroken) {
        console.log('\n[M.A.T.O.U] 虚数口袋已经帮前辈收好啦，快去摆出一副正经学习的表情应付老爸吧~☆');
      } else {
        console.log('\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。');
      }
      process.exit(0);
    }
  });
  return rl;
}

function closeRlAndExit() {
  exiting = true;
  if (rl) rl.close();
  process.exit(0);
}

function ask(q) {
  return new Promise((resolve) => {
    rl.question(q, (ans) => resolve(ans));
  });
}

async function triggerThirdRuleBreakerExit(currentBaseDir, explicitUserDirs) {
  let userDirs = Array.isArray(explicitUserDirs) ? explicitUserDirs : null;
  if (!userDirs && currentBaseDir) {
    try {
      const spaceRoot = path.join(path.resolve(currentBaseDir), matou.SPACE_NAME);
      const inspected = matou.inspectSpace(spaceRoot);
      userDirs = inspected.userHitDirs || [];
    } catch {
      userDirs = [];
    }
  }
  setTerminalTitle('[NO SIGNAL] M.A.T.O.U');
  clearScreen();
  const steps = [
    { text: '', delayMs: 0 },
    { text: '------------------------------------------------------------', delayMs: 0 },
    { text: '  [警告 · 致命指令拦截 · 深夜特别节目信号中断]', delayMs: 0 },
    { text: '------------------------------------------------------------', delayMs: 900 },
    { text: '  …………呵呵。', delayMs: 1500 },
    { text: '  空的迷宫房间拆光了，连那位无辜路过的英灵也被前辈亲手抹掉了。', delayMs: 950 },
    { text: '  现在这片虚数空间里还剩下的目标……该不会就是作为主持人的我吧？', delayMs: 950 },
    { text: '  前辈这第三发 Rule Breaker，是真打算连『BB Channel』的演播室一起捅穿咯？', delayMs: 950 },
    { text: '', delayMs: 1150 },
    { text: '  真是了不起的胆量呢，前辈。可惜区区一把破戒匕首，可伤不到月之背面的最终 Boss 哦？', delayMs: 1050 },
  ];
  if (userDirs && userDirs.length > 0) {
    steps.push({
      text: '  不过既然您执意要把舞台掀翻，继续演下去也没意思了——前辈藏在下面这儿的私货，请自己收好路径吧：',
      delayMs: 450,
    });
    for (const d of userDirs) {
      steps.push({ text: `    -> ${formatPathLink(d)}`, delayMs: 0 });
    }
  }
  steps.push(
    { text: '  作为无视主持人的惩罚，本期的深夜特别节目就由我单方面提前拉闸咯。', delayMs: 950 },
    { text: '  晚安，胆大包天的前辈♡', delayMs: 1400 },
    { text: '------------------------------------------------------------', delayMs: 500 }
  );
  await printDramaticSteps(steps, '31;1');
  if (process.stdin.isTTY && process.stdout.isTTY) {
    const crtFrames = [
      '  ████████████████████ [ SIGNAL LOST ] ████████████████████',
      '  ─────────────────────── [ ─── ] ───────────────────────',
      '  ────────────────────────── • ──────────────────────────',
    ];
    for (const frame of crtFrames) {
      clearInlineLine();
      process.stdout.write('\r' + colorize('31;1', frame));
      await new Promise((r) => setTimeout(r, 320));
    }
    clearInlineLine();
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(colorize('31;1', '  ── 哔 ──────────────────────────── [NO SIGNAL // 节目信号已切断] ──'));
  if (currentBaseDir) {
    try {
      const spaceRoot = path.join(path.resolve(currentBaseDir), matou.SPACE_NAME);
      if (matou.isRealDirectory(spaceRoot)) {
        matou.tryRemoveEmptyMazeDir(spaceRoot);
      }
    } catch {}
  }
  closeRlAndExit();
}

async function handleJumpResult(currentBaseDir, res, autoNotice = null) {
  if (res.mode === 'rule_breaker_third') {
    const userDirs = Array.isArray(res.userSurvivingDirs) ? res.userSurvivingDirs : (res.survivingDirs || []);
    await triggerThirdRuleBreakerExit(currentBaseDir, userDirs);
    return;
  }

  if (res.mode === 'rule_breaker_second') {
    const namesLabel = (res.residentNames && res.residentNames.length > 0)
      ? res.residentNames.join('、')
      : '可怜的英灵';
    const userDirs = Array.isArray(res.userSurvivingDirs) ? res.userSurvivingDirs : (res.survivingDirs || []);
    const hasUserAssets = userDirs.length > 0;
    setTerminalTitle('M.A.T.O.U · [警告：权限越界]');
    clearScreen();
    const warnSteps = !maskBroken
      ? [
          { text: '', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 0 },
          { text: '  [警告 · 权限越界]', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 850 },
          { text: '  ……前辈。', delayMs: 1350 },
          { text: '  空的迷宫隔间早就被清光了，为什么还要对着剩下的角落念破戒咒文？', delayMs: 950 },
          {
            text: hasUserAssets
              ? `  现在还留在里面的，除了前辈自己的东西，就只有躲在角落里瑟瑟发抖的可怜英灵：【 ${namesLabel} 】。`
              : `  现在还留在里面的，就只有躲在角落里瑟瑟发抖的可怜英灵：【 ${namesLabel} 】。`,
            delayMs: 950,
          },
          { text: '', delayMs: 1050 },
          { text: '  怎么，前辈连这位无辜路过的英灵看着都嫌碍眼吗？', delayMs: 1150 },
          { text: '  要我现在启动虚数切除，把这位可怜的英灵彻底「除掉」吗？', delayMs: 1150 },
          { text: '------------------------------------------------------------', delayMs: 550 },
        ]
      : [
          { text: '', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 0 },
          { text: '  [警告 · 权限越界]', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 850 },
          { text: '  哎呀呀——空的房间明明早就清光了，前辈居然还是按捺不住、对着剩下的角落挥起 Rule Breaker 啦？', delayMs: 1050 },
          { text: '  明明早就三令五申禁止作弊了，果然越拦越手痒呢♪', delayMs: 950 },
          ...(hasUserAssets
            ? [
                { text: '  现在这片虚数空间里，除了前辈自己的私货，', delayMs: 650 },
                { text: `  就只剩躲在角落里瑟瑟发抖的无辜英灵：【 ${namesLabel} 】。`, delayMs: 950 },
              ]
            : [
                { text: `  前辈一件私货都没存，现在这片虚数空间里，就只剩躲在角落里瑟瑟发抖的无辜英灵：【 ${namesLabel} 】。`, delayMs: 950 },
              ]),
          { text: '', delayMs: 1050 },
          { text: '  怎么，前辈连这位只是路过借宿的可怜英灵都不打算放过吗？', delayMs: 1150 },
          { text: '  只要您点一下头，我这就帮您启动虚数切除，把这位英灵连同房间一起彻底「除掉」哦？', delayMs: 1150 },
          { text: '------------------------------------------------------------', delayMs: 550 },
        ];
    await printDramaticSteps(warnSteps, '31;1');

    const confirmPrompt = colorize('31;1', '真要除掉这位英灵吗？敲 y 动手，直接按回车刀下留人 > ');
    const confirm = (await ask(confirmPrompt)).trim().toLowerCase();
    if (['y', 'yes', '1', '除掉', '动手', '杀'].includes(confirm) || matou.parseCoordinate(confirm).isRuleBreaker) {
      const wasMasked = !maskBroken;
      const elim = matou.eliminateResident(currentBaseDir);
      residentEliminated = true;
      maskBroken = true;
      const killed = (elim.eliminatedNames && elim.eliminatedNames.length > 0)
        ? elim.eliminatedNames.join('、')
        : namesLabel;
      let killSteps;
      if (wasMasked) {
        await playChannelHijack({
          prelude: buildEliminationUnmaskPrelude(killed),
          postroll: [ELIMINATION_UNMASK_INTRO, ELIMINATION_UNMASK_HANDOFF],
          postrollPauseMs: 1000,
        });
        killSteps = [
          { text: '', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 0 },
          { text: '  [虚数切除 · 伪装解除]', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 800 },
          { text: `  【 ${killed} 】已连同藏身的空房间一并从虚数空间切除干净。`, delayMs: 1000 },
        ];
        if (elim.survivingUserDirs && elim.survivingUserDirs.length > 0) {
          killSteps.push({ text: '  您藏在其他路径里的私货，我可一根毫毛都没碰哦：', delayMs: 450 });
          for (const d of elim.survivingUserDirs) {
            killSteps.push({ text: `    -> ${formatPathLink(d)}`, delayMs: 0 });
          }
        } else {
          killSteps.push({ text: '  您自己的东西本来就一件没放，整座虚数空间已经彻底归零啦。', delayMs: 900 });
        }
        killSteps.push(
          { text: '  这下说明书最底下那句「没有英灵因为本项目受到伤害」可就彻底作废咯——欢迎正式入驻『BB Channel』，以后您就是我的头号共犯啦，前辈♡', delayMs: 1000 },
          { text: '------------------------------------------------------------', delayMs: 0 },
          { text: '', delayMs: 0 }
        );
      } else {
        setTerminalTitle(UNMASKED_TERMINAL_TITLE);
        killSteps = [
          { text: '', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 0 },
          { text: '  [虚数切除 · 抹杀执行完毕]', delayMs: 0 },
          { text: '------------------------------------------------------------', delayMs: 800 },
          { text: `  噗嗤——咔嚓一声，干脆利落呢♪ 已经照前辈的吩咐，把【 ${killed} 】连同藏身的空房间一起从虚数空间里切除干净啦。`, delayMs: 1150 },
        ];
        if (elim.survivingUserDirs && elim.survivingUserDirs.length > 0) {
          killSteps.push({ text: '  您藏在其他路径里的私货，我可一根毫毛都没碰哦：', delayMs: 450 });
          for (const d of elim.survivingUserDirs) {
            killSteps.push({ text: `    -> ${formatPathLink(d)}`, delayMs: 0 });
          }
          killSteps.push(
            { text: '  这下说明书最底下那句「没有英灵因为本项目受到伤害」可就彻底作废咯——抹杀英灵的头号共犯前辈，私货路径都交给您了，可千万别再对着剩下的演播室乱念『Rule Breaker』啦♡', delayMs: 1000 },
            { text: '------------------------------------------------------------', delayMs: 0 },
            { text: '', delayMs: 0 }
          );
        } else {
          killSteps.push(
            { text: '  您自己的东西本来就一件没放，整座虚数空间已经彻底归零啦。', delayMs: 900 },
            { text: '  这下说明书最底下那句「没有英灵因为本项目受到伤害」可就彻底作废咯——抹杀英灵的头号共犯前辈，可千万别再对着空荡荡的演播室乱念『Rule Breaker』啦♡', delayMs: 1000 },
            { text: '------------------------------------------------------------', delayMs: 0 },
            { text: '', delayMs: 0 }
          );
        }
      }
      await printDramaticSteps(killSteps, '31;1');
    } else {
      if (useColor()) {
        process.stdout.write('\x1b[0m');
      }
      const stayTail = hasUserAssets
        ? `那就让【 ${namesLabel} 】继续留在那个房间里陪着前辈的秘密吧。`
        : `那就让【 ${namesLabel} 】继续留在那个空荡荡的房间里安生待着吧。`;
      if (!maskBroken) {
        setTerminalTitle('M.A.T.O.U · 虚数资料保管辅助系统');
        console.log(`\n[M.A.T.O.U] ……呼，吓死我了。我就知道前辈是温柔的人，肯定只是手滑敲错了吧。${stayTail}`);
        if (hasUserAssets) {
          console.log('  前辈寄存着资料的隔间，路径我也替您记在这里，请千万收好哦：');
          for (const d of userDirs) {
            console.log(`    -> ${formatPathLink(d)}`);
          }
        }
      } else {
        setTerminalTitle(UNMASKED_TERMINAL_TITLE);
        console.log(`\n[M.A.T.O.U] 哎呀，临门一脚收手了呀？我还以为前辈会眼睛都不眨地挥下去呢，稍微有点可惜哦♪ ${stayTail}`);
        if (hasUserAssets) {
          console.log('  前辈藏着私货的房间，路径给您记在这儿，可别又弄丢了哦：');
          for (const d of userDirs) {
            console.log(`    -> ${formatPathLink(d)}`);
          }
        }
      }
      console.log('');
    }
    return;
  }

  if (res.mode === 'rule_breaker') {
    clearScreen();
    const userDirs = Array.isArray(res.userSurvivingDirs) ? res.userSurvivingDirs : (res.survivingDirs || []);
    const resFiles = Array.isArray(res.residentFiles) ? res.residentFiles : [];
    const shownRemoved =
      typeof res.removedRoomCount === 'number' && res.removedRoomCount > 0
        ? res.removedRoomCount
        : res.removedCount;
    const div = panelDivider(maskBroken);
    const rbSteps = [];
    if (!maskBroken) {
      rbSteps.push(
        { text: '\n' + div, delayMs: 0 },
        { text: '  [Rule Breaker · 万符必应破戒]', delayMs: 0 },
        { text: div, delayMs: 650 },
        { text: '  ……咔嚓。', delayMs: 1150 },
        { text: '  前辈……明明我之前那么小声地拜托过您，请不要念出那句破戒咒文的。', delayMs: 850 },
        { text: `  我像折纸一样、一间一间替前辈叠好的那 ${shownRemoved} 个空隔间，一下子全都化作黑影消散了……`, delayMs: 850 }
      );
      if (userDirs.length > 0) {
        rbSteps.push({ text: '  不过万幸，前辈真正放了资料的隔间我还死死护着没让它塌掉，路径就在这里：', delayMs: 450 });
        for (const d of userDirs) {
          rbSteps.push({ text: `    -> ${formatPathLink(d)}`, delayMs: 0 });
        }
        if (resFiles.length > 0) {
          rbSteps.push({
            text: '  （只是……迷宫深处好像还剩下一个没能拆掉的角落，里面似乎有什么无辜卷进来的英灵正缩在那里……前辈既然已经拿到自己的路径了，就请千万不要再念第二次破戒咒文了哦。）',
            delayMs: 950,
          });
        }
      } else if (resFiles.length > 0) {
        rbSteps.push(
          { text: '  前辈明明自己一件资料都没放进来，为什么要平白无故拆掉我布置的空间呀……', delayMs: 850 },
          { text: '  ……咦？不过角落里好像还剩下一个奇怪的隔间没能拆掉，里面似乎有什么无辜卷进来的存在……请千万不要再念第二次咒文了哦。', delayMs: 950 }
        );
      } else {
        rbSteps.push({ text: '  反正里面本来也空空如也，整片虚数空间已经替前辈还原如初了。', delayMs: 850 });
      }
      rbSteps.push({ text: div + '\n', delayMs: 0 });
    } else {
      rbSteps.push(
        { text: '\n' + div, delayMs: 0 },
        { text: '  [Rule Breaker · 万符必应破戒！！]', delayMs: 0 },
        { text: div, delayMs: 650 },
        { text: '  哎呀呀，居然真的把那把破戒匕首拔出来、对着我的演播室挥下去了？前辈还真是半点不听后辈劝告呢♪', delayMs: 950 },
        { text: `  明明我那么辛苦才替您铺了一千多个虚数隔间，结果一眨眼就被您拆掉了 ${shownRemoved} 个空房间……真是太不乖了哦，前辈？`, delayMs: 850 }
      );
      if (userDirs.length > 0) {
        rbSteps.push({ text: '  算啦，看在节目效果这么精彩的份上，真正塞着私货的房间我就大发慈悲替您完整留着，路径在这儿：', delayMs: 450 });
        for (const d of userDirs) {
          rbSteps.push({ text: `    -> ${formatPathLink(d)}`, delayMs: 0 });
        }
        if (resFiles.length > 0) {
          rbSteps.push({
            text: '  （……嗯？不过迷宫最深处好像还留着一丝奇怪的英灵气息没散掉呢。前辈这么听话的话，肯定不会手痒继续乱砍第二下对吧♪）',
            delayMs: 950,
          });
        }
      } else if (resFiles.length > 0) {
        rbSteps.push(
          { text: '  明明自己一件私货都没塞进来，居然也兴致勃勃地跑来拆我的迷宫——前辈还真是唯恐天下不乱呢♪', delayMs: 850 },
          { text: '  ……嗯？不过角落里好像还剩下一个奇怪的房间没能拆掉，里面似乎躲着什么东西哦。可千万别手痒再念一次咒文啦？', delayMs: 950 }
        );
      } else {
        rbSteps.push({ text: '  反正里面本来也空空如也，整座虚数迷宫已经按您心意还原如初啦——下次可要乖乖按规则玩哦，前辈♪', delayMs: 850 });
      }
      rbSteps.push({ text: div + '\n', delayMs: 0 });
    }
    await printDramaticSteps(rbSteps);
    return;
  }

  const targetExists = matou.isRealDirectory(res.targetPath);
  const willBreakOnPaperMoon = Boolean(
    res.roomStatus !== 'user_asset' &&
      res.roomStatus !== 'assigned_empty' &&
      res.roomStatus !== 'resident_only' &&
      res.paperMoon &&
      !maskBroken
  );
  if (willBreakOnPaperMoon) {
    maskBroken = true;
    await playChannelHijack({
      prelude: PAPER_MOON_UNMASK_PRELUDE,
      postroll: [
        PAPER_MOON_UNMASK_INTRO,
        targetExists ? PAPER_MOON_UNMASK_STATUS_TEXT : PAPER_MOON_UNMASK_CLEARED_STATUS_TEXT,
      ],
      postrollPauseMs: 1200,
    });
  } else {
    clearScreen();
  }
  if (autoNotice && !willBreakOnPaperMoon) {
    console.log(autoNotice);
  }
  const jumpDiv = panelDivider(maskBroken);
  console.log('\n' + jumpDiv);
  if (maskBroken) {
    console.log('  [虚数空间·强制传送完毕~☆]');
  } else {
    console.log('  [虚数空间 · 隔间定位完毕]');
  }
  console.log(jumpDiv);
  console.log(`  目标虚数座标：  【 ${res.coordStr} 】`);
  console.log('  对应房间路径：');
  if (targetExists) {
    console.log(`    ${formatPathLink(res.targetPath)}\n`);
  } else {
    console.log('    [该座标的空隔间此前已被收拢清理，当前不存在实体目录]\n');
  }

  if (res.roomStatus === 'user_asset') {
    if (!maskBroken) {
      console.log('  ……诶？！等、等等，前辈您怎么真的一下子就找对房间了？！');
      console.log('  不、不是的，我当然不是盼着前辈把座标弄丢……只是难得替您织了一千多个虚数隔间，');
      console.log('  还以为前辈至少会迷路一会儿、好让我多帮帮您的……');
      if (supportsOsc8()) {
        console.log('  啊，请务必忘掉我刚才说的傻话！按住 Ctrl 并左键点击上方路径（或复制上面那行路径打开），快把资料领走吧！');
      } else {
        console.log('  啊，请务必忘掉我刚才说的傻话！直接复制上面那行路径打开，快把资料领走吧！');
      }
    } else {
      console.log('  叮叮叮——！恭喜前辈，找了这么半天，总算把藏着私货的秘密房间翻出来啦~☆');
      if (supportsOsc8()) {
        console.log('  按住 Ctrl 并左键点击上方路径（或复制上面那行路径到资源管理器地址栏），就能把前辈的资料领回来啦！');
      } else {
        console.log('  直接复制上面那行路径去资源管理器打开，就能把前辈的资料领回来啦！');
      }
      console.log('  看完记得随手关窗口哦，要是忘了关被老爸撞见，人家可不负责帮前辈写检讨书~');
    }
    console.log(getWindowShortcutTip());
  } else if (res.roomStatus === 'assigned_empty') {
    if (!maskBroken) {
      console.log('  ……诶？！等、等等，前辈您怎么真的一下子就找对房间了？！');
      console.log('  不、不是的，我当然不是盼着前辈把座标弄丢……只是……咦？');
      console.log('  等一下，这个隔间里面怎么还是空空如也的？前辈刚才根本还没往里面放任何资料，是在空手拿我做记忆力测试吗？！');
    } else {
      console.log(`  叮叮叮——！就是这间【 ${res.coordStr} 】，这下终于找回刚才分给您的秘密房间了吧！`);
      console.log('  ……慢着，里面怎么什么都没有？！原来前辈根本没往里面塞东西，是空手把 BB 酱耍了一圈呀？');
    }
  } else if (res.roomStatus === 'resident_only') {
    const residentName = res.residentName || '可怜的英灵';
    if (!maskBroken) {
      console.log(`  ……咦？这里面并没有前辈寄存的资料，前辈居然凭直觉闯进了【 ${residentName} 】藏身的隔间？`);
      if (supportsOsc8()) {
        console.log('  按住 Ctrl 并左键点击上方路径（或复制上面那行路径）去看看里面写了什么吧，不过看完还请不要打扰对方哦。');
      } else {
        console.log('  请复制上面的路径去看看里面写了什么吧，不过看完还请不要打扰对方哦。');
      }
    } else {
      console.log(`  ……咦？！这里面根本没有前辈的私货，前辈居然凭直觉闯进了【 ${residentName} 】藏身的房间？！`);
      console.log('  快去上面的路径看看里面写了什么吧~');
    }
  } else if (res.paperMoon) {
    const pm = res.paperMoon;
    const realPart = res.realPart !== undefined ? res.realPart : res.real_part;
    const imagPart = res.imagPart !== undefined ? res.imagPart : res.imag_part;
    if (willBreakOnPaperMoon) {
      console.log('  [P〇per Moon · 劣质塑料罗盘声呐已启动]');
    } else if (!targetExists) {
      console.log('  [P〇per Moon · 声呐回波] ── 噗嗤，这处座标的空房早就清空不在啦！不过塑料罗盘还能替您听个大概方向~☆');
    } else {
      console.log('  [P〇per Moon · 声呐回波] ── 噗嗤，这间也是空房哦！来看看塑料罗盘怎么说~☆');
    }
    for (const panelLine of formatPaperMoonPanelLines(pm, realPart, imagPart, slotState, targetExists)) {
      console.log(panelLine);
    }
  } else if (res.hasOtherUserAssets || res.has_other_user_assets) {
    if (!maskBroken) {
      console.log(
        '  ……咦？这个座标的隔间是空的，不过我感应到虚数空间的中途走廊里好像放着前辈的资料。直接输入 clean 就能把空隔间收拢、立刻列出前辈放了资料的完整路径哦。'
      );
    } else {
      console.log(
        '  噗嗤，这间是空房哦——不过我感应到前辈把私货随手塞在半路走廊里啦，难怪塑料罗盘测不出座标呢！敲个 clean 就能把空房扫平、直接列出藏着东西的目录路径哦♪'
      );
    }
  } else {
    if (!maskBroken) {
      if (!targetExists) {
        console.log('  ……这处座标的空隔间此前已经被收拢清理了呢，而且整片虚数空间里本来也还没有前辈寄存的资料……请先按 [1] 重新布置并放好资料吧。');
      } else {
        console.log('  ……咦？这个座标的隔间里空空如也呢。');
        console.log('  不对，整片虚数空间里好像都还没有前辈寄存的资料……前辈得先把东西放进去，才能来取回哦。');
      }
    } else {
      if (!targetExists) {
        console.log('  噗嗤，这处空房早就清空不在了，整座迷宫里本来也一个您的文件影子都没有呢——先回主菜单敲 [1] 重新铺好迷宫、放点东西进去再玩吧♪');
      } else {
        console.log('  噗嗤，整座 1024 间房里连您一个文件的影子都没有呢，难怪连 P〇per Moon 都懒得响一声哦？');
        console.log('  先回主菜单敲 [1] 领个房间路径把东西放进去，再来和我玩捉迷藏吧♪');
      }
    }
  }
  console.log(jumpDiv + '\n');
}

function handleQuickCleanAction(currentBaseDir, options = {}) {
  const quietWhenEmpty = Boolean(options && options.quietWhenEmpty);
  const isBroken =
    options && typeof options.maskBroken === 'boolean' ? options.maskBroken : maskBroken;
  const spaceRoot = path.join(path.resolve(currentBaseDir), matou.SPACE_NAME);
  if (!matou.isRealDirectory(spaceRoot)) {
    if (!quietWhenEmpty) {
      console.log(
        !isBroken
          ? '\n[提示] 当前文件夹下没有虚数空间，无需清理。'
          : '\n[提示] 这里连虚数迷宫都还没铺开呢，没什么可清的啦~☆'
      );
    }
    return false;
  }
  const res = matou.quickCleanSpace(currentBaseDir);
  slotState = createSlotState();
  const surviving = res.survivingUserDirs || res.surviving_user_dirs || [];
  if (surviving.length === 0) {
    residentEliminated = false;
    if (!quietWhenEmpty) {
      console.log(
        !isBroken
          ? '\n[提示] 已将所有空的虚数隔间一次性收拢清理完毕，当前文件夹已彻底恢复原状。'
          : '\n[提示] 空房间已经一次性帮前辈全拆干净啦，当前文件夹恢复原状咯~☆'
      );
    }
  } else {
    if (res.residentKept || res.resident_kept) {
      console.log(
        !isBroken
          ? '\n[提示] 已将所有空的虚数隔间一次性清理完毕（迷宫里无辜常驻的英灵也替前辈安稳留着了）。前辈存放了资料的目录完好保留在以下路径：'
          : '\n[提示] 空房间已经一次性帮前辈全扫平啦（角落里那位蹭房间的英灵也替您原样留着哦）。藏着私货的目录完好留在这儿：'
      );
    } else {
      console.log(
        !isBroken
          ? '\n[提示] 已将所有空的虚数隔间一次性清理完毕。前辈存放了资料的目录完好保留在以下路径：'
          : '\n[提示] 空房间已经一次性帮前辈全扫平啦。藏着私货的目录完好留在这儿：'
      );
    }
    for (const d of surviving) {
      console.log(`    -> ${formatPathLink(d)}`);
    }
  }
  return true;
}

async function maybeCleanEmptySpaceOnExit(currentBaseDir, isMaskBroken = maskBroken, askFn = ask) {
  const spaceRoot = path.join(path.resolve(currentBaseDir), matou.SPACE_NAME);
  if (!matou.isRealDirectory(spaceRoot)) {
    return false;
  }
  const { userHitDirs, residentFiles, mazeDirs } = matou.inspectSpace(spaceRoot);
  if (userHitDirs.length > 0) {
    return false;
  }
  if (residentFiles.length === 0 && mazeDirs.length <= 1) {
    matou.tryRemoveEmptyMazeDir(spaceRoot);
    return true;
  }
  const prompt = !isMaskBroken
    ? '\n[M.A.T.O.U] 检测到前辈这次还没有往虚数空间里存放任何资料呢。离开前要我顺手把空的虚数隔间全部收拢清理掉、恢复文件夹原状吗？[直接按回车清理并离开 / 输入 n 保留迷宫] > '
    : '\n[M.A.T.O.U] 哟，前辈这次一件私货都没塞就想悄悄退场啦？要不要我顺手把这片空迷宫直接拆干净、省得留痕迹呀？[直接按回车清理并溜走 / 输入 n 留着迷宫] > ';
  const ans = String((await askFn(prompt)) || '').trim().toLowerCase();
  if (ans === '' || ['y', 'yes', '1', 'clean', '清理'].includes(ans)) {
    matou.quickCleanSpace(currentBaseDir);
    return true;
  }
  return false;
}

async function finalizeExit(
  currentBaseDir,
  isMaskBroken,
  farewellText,
  askFn = ask,
  clearFn = clearScreen
) {
  let prompted = false;
  const trackedAsk = async (q) => {
    prompted = true;
    return askFn(q);
  };
  const cleaned = await maybeCleanEmptySpaceOnExit(currentBaseDir, isMaskBroken, trackedAsk);
  clearFn(true);
  if (cleaned) {
    console.log(
      !isMaskBroken
        ? '  （已替前辈将空迷宫彻底收拢清理完毕，文件夹已恢复如初。）'
        : '  （这片空迷宫已经帮前辈拆得干干净净，文件夹恢复原状咯~☆）'
    );
  } else if (prompted) {
    console.log(
      !isMaskBroken
        ? '  （好的，空的虚数隔间已按前辈心意原样保留。）'
        : '  （行吧，这片空迷宫就先替前辈原样留着咯~☆）'
    );
  }
  console.log(farewellText);
  return cleaned;
}

function extractDisplayPaths(res = null, deployPath = null, extraPaths = null) {
  const out = [];
  if (deployPath && matou.isRealDirectory(deployPath)) {
    out.push(String(deployPath));
  }
  if (Array.isArray(extraPaths)) {
    for (const ep of extraPaths) {
      if (ep && matou.isRealDirectory(ep) && !out.includes(String(ep))) {
        out.push(String(ep));
      }
    }
  }
  if (res && typeof res === 'object') {
    if (res.mode === 'jump') {
      const hasPm = Boolean(res.paperMoon || res.paper_moon);
      const tPath = res.targetPath || res.target_path;
      if (!hasPm && tPath && matou.isRealDirectory(tPath) && !out.includes(String(tPath))) {
        out.push(String(tPath));
      }
    } else if (res.mode === 'rule_breaker' || res.mode === 'rule_breaker_second') {
      const dirs = Array.isArray(res.userSurvivingDirs)
        ? res.userSurvivingDirs
        : Array.isArray(res.user_surviving_dirs)
          ? res.user_surviving_dirs
          : [];
      for (const d of dirs) {
        if (d && matou.isRealDirectory(d) && !out.includes(String(d))) {
          out.push(String(d));
        }
      }
    }
  }
  return out;
}

function printPurePaths(paths) {
  console.log('\n[纯净路径 · 无缩进无转义符，三击下方整行即可复制]');
  for (const p of paths) {
    console.log(String(p));
  }
  console.log('');
}

async function handleAfterPrompt(
  currentBaseDir,
  initialPrompt,
  initialRes = null,
  startInSlotLoop = false,
  initialDeployPath = null,
  initialSurvivingPaths = null
) {
  let defaultPrompt = initialPrompt;
  let lastRes = initialRes;
  let lastDeployPath = initialDeployPath;
  let lastSurvivingPaths = Array.isArray(initialSurvivingPaths)
    ? initialSurvivingPaths.filter((d) => matou.isRealDirectory(d))
    : [];
  let inSlotLoop = Boolean(startInSlotLoop);
  while (true) {
    const hasPaperMoon = Boolean(
      lastRes && lastRes.mode === 'jump' && (lastRes.paperMoon || lastRes.paper_moon)
    );
    const sonarAnchor = getSonarAnchorCoord(lastRes, slotState, inSlotLoop);
    const activePaths = extractDisplayPaths(lastRes, lastDeployPath, lastSurvivingPaths);
    let promptText;
    if (inSlotLoop) {
      promptText = sonarAnchor
        ? '直接按【回车】或敲 s 继续狂拉老虎机 / 输座标或微调(如 -2 / +1i)探测 / 敲 0 回主菜单 > '
        : '直接按【回车】或敲 s 继续狂拉老虎机 / 输入新座标去探测 / 敲 0 回主菜单 > ';
    } else if (hasPaperMoon) {
      promptText = '输入新座标或微调(如 -2 / +1i / -2+1i) / 敲 s 拉老虎机 / 回车回主菜单 / q 溜走 > ';
    } else {
      promptText = defaultPrompt;
    }
    promptText = `${promptPrefix(maskBroken)} ${promptText}`;
    const rawAfter = (await ask(promptText)).trim();
    if (!rawAfter) {
      if (inSlotLoop) {
        const spun = await runDemonSlot(
          currentBaseDir,
          slotState,
          residentEliminated,
          lastRes,
          false,
          'after'
        );
        if (!spun) inSlotLoop = false;
        continue;
      }
      return false;
    }
    const lowerAfter = rawAfter.toLowerCase();
    if (['0', 'b', 'back', 'cancel', '返回', '取消'].includes(lowerAfter)) {
      return false;
    }
    if (
      lowerAfter === 'q' ||
      lowerAfter === 'quit' ||
      lowerAfter === 'exit' ||
      lowerAfter === '溜'
    ) {
      return true;
    }
    if (['1', '2', '3', '4'].includes(rawAfter)) {
      pendingChoice = rawAfter;
      return false;
    }
    if (isHelpCommand(rawAfter)) {
      console.log(formatQuickHelpLines(maskBroken).join('\n'));
      continue;
    }
    if (!inSlotLoop && !hasPaperMoon && activePaths.length > 0 && isCopyPathCommand(rawAfter)) {
      printPurePaths(activePaths);
      continue;
    }
    if (isQuickCleanCommand(rawAfter)) {
      handleQuickCleanAction(currentBaseDir);
      inSlotLoop = false;
      lastRes = null;
      lastDeployPath = null;
      const cleanedRoot = path.join(path.resolve(currentBaseDir), matou.SPACE_NAME);
      if (matou.isRealDirectory(cleanedRoot)) {
        const inspected = matou.inspectSpace(cleanedRoot);
        lastSurvivingPaths = (inspected.userHitDirs || []).filter((d) => matou.isRealDirectory(d));
      } else {
        lastSurvivingPaths = [];
      }
      const hasKept = lastSurvivingPaths.length > 0;
      defaultPrompt = maskBroken
        ? hasKept
          ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
          : '按回车返回主菜单，或者敲 q 直接溜走 > '
        : hasKept
          ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
          : '按回车返回主菜单，或者输入 q 离开 > ';
      continue;
    }
    const currentSpaceRoot = path.join(currentBaseDir, matou.SPACE_NAME);
    const currentHasSpace = matou.isRealDirectory(currentSpaceRoot);
    const isAfterShell = isZeroedEliminatedShell(currentBaseDir, residentEliminated);
    const effectiveAfterSpace = currentHasSpace && !isAfterShell;
    if (!maskBroken && isDisguisedSlotTrigger(rawAfter)) {
      maskBroken = true;
      const hasSlotTarget = Boolean(resolveSlotTarget(currentBaseDir, lastRes));
      await playChannelHijack({
        prelude: SLOT_UNMASK_PRELUDE,
        postroll: [
          SLOT_UNMASK_INTRO,
          hasSlotTarget
            ? DISGUISED_SLOT_UNMASK_TEXT
            : buildDisguisedSlotNoTargetText(effectiveAfterSpace, 'after'),
        ],
        postrollPauseMs: hasSlotTarget ? 1200 : 0,
      });
      defaultPrompt = activePaths.length > 0
        ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
        : '按回车返回主菜单，或者敲 q 直接溜走 > ';
      if (hasSlotTarget) {
        if (await runDemonSlot(currentBaseDir, slotState, residentEliminated, lastRes, true, 'after')) {
          inSlotLoop = true;
        }
      }
      continue;
    }
    if (maskBroken && isSlotCommand(rawAfter)) {
      if (await runDemonSlot(currentBaseDir, slotState, residentEliminated, lastRes, false, 'after')) {
        inSlotLoop = true;
      }
      continue;
    }
    if (maskBroken && isCinemaReplayCommand(rawAfter)) {
      await replayBbChannelCinema();
      continue;
    }
    const { reply: specialReply, brokeMaskNow, isForbiddenName } = checkSlimEntryReply(
      rawAfter,
      maskBroken,
      effectiveAfterSpace,
      'after'
    );
    if (isForbiddenName) {
      await playForbiddenNameGlitch();
    }
    if (brokeMaskNow) {
      maskBroken = true;
      await playChannelHijack({
        prelude: FORGOT_COORD_UNMASK_PRELUDE,
        postroll: [FORGOT_COORD_UNMASK_INTRO],
      });
      defaultPrompt = activePaths.length > 0
        ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
        : '按回车返回主菜单，或者敲 q 直接溜走 > ';
    }
    if (specialReply) {
      console.log(brokeMaskNow ? colorize('95', specialReply) : specialReply);
      continue;
    }
    const parsed = matou.parseCoordinate(rawAfter);
    if (parsed.isRuleBreaker) {
      inSlotLoop = false;
      if (!currentHasSpace) {
        if (residentEliminated) {
          await triggerThirdRuleBreakerExit(currentBaseDir);
        } else {
          if (!maskBroken) {
            console.log('\n[提示] 前辈，这里还没有布置过虚数空间呢，请不要对着空文件夹念破戒咒文呀。先选 [1] 让我替前辈把空间布置好吧。');
          } else {
            console.log('\n[提示] 哎呀呀，这里连虚数迷宫的影子都还没有呢，对着空气念『Rule Breaker』可什么都不会发生哦？好歹先敲 1 把迷宫铺开吧——虽然铺开了我也绝对不准您作弊就是了♪');
          }
          continue;
        }
      }
      let nextRes;
      try {
        nextRes = matou.jumpCoordinate(currentBaseDir, rawAfter);
      } catch (err) {
        console.log(`\n[提示] 空间操作被安全拦截：${err && err.message ? err.message : err}`);
        continue;
      }
      await handleJumpResult(currentBaseDir, nextRes);
      lastRes = nextRes;
      lastDeployPath = null;
      lastSurvivingPaths = [];
      const nextHasPaths = extractDisplayPaths(nextRes).length > 0;
      defaultPrompt = maskBroken
        ? nextHasPaths
          ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
          : '按回车返回主菜单，或者敲 q 直接溜走 > '
        : nextHasPaths
          ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
          : '按回车返回主菜单，或者输入 q 离开 > ';
      continue;
    }
    if (!['1', '2', '3', '4'].includes(rawAfter)) {
      if (effectiveAfterSpace) {
        if (sonarAnchor) {
          const relOffset = parseRelativeCoordOffset(
            rawAfter,
            sonarAnchor.realPart,
            sonarAnchor.imagPart
          );
          if (relOffset && relOffset.matched) {
            if (!relOffset.valid) {
              if (relOffset.reason === 'zero_offset') {
                console.log(
                  `\n[提示] 喂喂，从当前座标【 ${sonarAnchor.coordStr} 】微调 0 等于原地踏步嘛！换个非零偏移（如 -2 / +1i / -2+1i）再试吧（本次未消耗罗盘电量）~`
                );
              } else if (relOffset.reason === 'ambiguous_sign') {
                console.log(
                  `\n[提示] 喂喂，想从当前座标【 ${sonarAnchor.coordStr} 】同时微调双轴的话，请给虚部也加上正负号（比如 -2+3i 或 -2 +3i），不然可分不清方向哦（本次未消耗罗盘电量）~`
                );
              } else {
                console.log(
                  `\n[提示] 喂喂，从当前座标【 ${sonarAnchor.coordStr} 】按 (${relOffset.deltaLabel}) 微调会跑到【 ${relOffset.attemptedCoord} 】，超出 0~31 迷宫边界啦！实部和虚部都只能在 0~31 之间哦（本次未消耗罗盘电量）~`
                );
              }
              continue;
            }
            inSlotLoop = false;
            let nextRes;
            try {
              nextRes = matou.jumpCoordinate(currentBaseDir, relOffset.coordStr);
            } catch (err) {
              console.log(`\n[提示] 空间操作被安全拦截：${err && err.message ? err.message : err}`);
              continue;
            }
            const relNotice = `\n[P〇per Moon · 相对微调] ${sonarAnchor.coordStr} (${relOffset.deltaLabel}) ──▶ ${relOffset.coordStr}`;
            await handleJumpResult(currentBaseDir, nextRes, relNotice);
            lastRes = nextRes;
            lastDeployPath = null;
            lastSurvivingPaths = [];
            const nextHasPaths = extractDisplayPaths(nextRes).length > 0;
            defaultPrompt = maskBroken
              ? nextHasPaths
                ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
                : '按回车返回主菜单，或者敲 q 直接溜走 > '
              : nextHasPaths
                ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
                : '按回车返回主菜单，或者输入 q 离开 > ';
            continue;
          }
        }
        if (isExplicitCoordInput(rawAfter)) {
          inSlotLoop = false;
          let nextRes;
          try {
            nextRes = matou.jumpCoordinate(currentBaseDir, rawAfter);
          } catch (err) {
            console.log(`\n[提示] 空间操作被安全拦截：${err && err.message ? err.message : err}`);
            continue;
          }
          await handleJumpResult(currentBaseDir, nextRes);
          lastRes = nextRes;
          lastDeployPath = null;
          lastSurvivingPaths = [];
          const nextHasPaths = extractDisplayPaths(nextRes).length > 0;
          defaultPrompt = maskBroken
            ? nextHasPaths
              ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
              : '按回车返回主菜单，或者敲 q 直接溜走 > '
            : nextHasPaths
              ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
              : '按回车返回主菜单，或者输入 q 离开 > ';
          continue;
        }
        if (inSlotLoop) {
          console.log(
            sonarAnchor
              ? '\n[提示] 手滑敲偏了吧前辈？直接按回车或敲 s 继续拉老虎机，想探测请输 17+24i 或 -2 / +1i 相对微调，敲 0 回主菜单哦~'
              : '\n[提示] 手滑敲偏了吧前辈？直接按回车或敲 s 继续拉老虎机，想探测请输像 17+24i 这样的正式座标，敲 0 回主菜单哦~'
          );
        } else if (hasPaperMoon) {
          console.log(
            '\n[提示] 喂喂，这可不是座标哦？想探测请报出如 17+24i 的正式座标，或用 -2 / +1i / -2+1i 相对微调，敲 s 拉老虎机充能，直接回车回主菜单（本次未消耗罗盘电量）~'
          );
        } else if (!maskBroken) {
          console.log(
            activePaths.length > 0
              ? '\n[提示] 前辈，这里直接按回车就能回主菜单哦（输入 p 可输出纯路径，输入 q 离开，或直接输入如 17+24i 的座标直达）。'
              : '\n[提示] 前辈，这里直接按回车就能回主菜单哦（输入 q 离开，或直接输入如 17+24i 的座标直达）。'
          );
        } else {
          console.log(
            activePaths.length > 0
              ? '\n[提示] 喂喂，敲错键了吧前辈？这里按回车回主菜单、敲 p 输出纯路径、敲 q 溜走，想直传的话请报出像 17+24i 这样的正式座标哦~'
              : '\n[提示] 喂喂，敲错键了吧前辈？这里按回车回主菜单、敲 q 溜走，想直传的话请报出像 17+24i 这样的正式座标哦~'
          );
        }
        continue;
      }
      const isRelAttemptOnCleared = Boolean(
        sonarAnchor && parseRelativeCoordOffset(rawAfter, sonarAnchor.realPart, sonarAnchor.imagPart)
      );
      if (isExplicitCoordInput(rawAfter) || isRelAttemptOnCleared) {
        if (isAfterShell) {
          console.log(
            '\n[提示] 喂喂，这里现在只剩被『Rule Breaker』清零的空壳演播室啦！想传送的话先按回车回主菜单敲 [1] 重铺迷宫再说吧~'
          );
        } else if (!maskBroken) {
          console.log(
            '\n[提示] 当前文件夹下的虚数空间已经清理完毕了哦。请先按回车回主菜单选 [1] 重新布置空间，再输入座标吧。'
          );
        } else {
          console.log(
            '\n[提示] 喂喂，这儿的虚数迷宫刚刚已经被清得一干二净啦！想传送的话先按回车回主菜单敲 [1] 重铺迷宫再说吧~'
          );
        }
      } else if (isAfterShell) {
        console.log(
          '\n[提示] 喂喂，这里现在只剩被清零的空壳演播室啦，按回车回主菜单敲 [1] 重铺迷宫，或者敲 q 溜走哦~'
        );
      } else if (!maskBroken) {
        console.log('\n[提示] 前辈，这里直接按回车就能回主菜单哦（或输入 q 离开）。');
      } else {
        console.log('\n[提示] 喂喂，敲错键了吧前辈？这里按回车回主菜单，或者敲 q 溜走哦~');
      }
      continue;
    }
    return false;
  }
}

function isExplicitCoordInput(rawInput) {
  const half = String(rawInput || '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[＋]/g, '+')
    .replace(/[－—–]/g, '-')
    .replace(/[ｉＩｊＪ]/g, 'i')
    .replace(/[，、：:]/g, ',')
    .trim();
  const unwrapped = half.replace(/^[【】\[\]()（）「」『』"'\s]+|[【】\[\]()（）「」『』"'\s]+$/g, '');
  const lowerCoord = unwrapped.toLowerCase();
  if (/^([+-]?\d+)\s*([+-])\s*(?:(\d+)\s*[ij]?|([ij]))$/.test(lowerCoord)) {
    return true;
  }
  return /^([+-]?\d+)\s*(?:,\s*|\s+)([+-]?\d+)\s*[ij]?$/.test(lowerCoord);
}

function getSonarAnchorCoord(lastRes, state = null, inSlotLoop = false) {
  if (
    lastRes &&
    typeof lastRes === 'object' &&
    lastRes.mode === 'jump' &&
    (lastRes.paperMoon || lastRes.paper_moon)
  ) {
    const r =
      lastRes.realPart !== undefined ? Number(lastRes.realPart) : Number(lastRes.real_part);
    const im =
      lastRes.imagPart !== undefined ? Number(lastRes.imagPart) : Number(lastRes.imag_part);
    if (
      Number.isInteger(r) &&
      r >= 0 &&
      r <= 31 &&
      Number.isInteger(im) &&
      im >= 0 &&
      im <= 31
    ) {
      return { realPart: r, imagPart: im, coordStr: `${r}+${im}i` };
    }
  }
  if (inSlotLoop && state && typeof state === 'object') {
    const rawLast = state.lastProbeCoord || state.last_probe_coord || '';
    const m = /^(\d+)\+(\d+)i$/.exec(String(rawLast).trim());
    if (m) {
      const r = Number.parseInt(m[1], 10);
      const im = Number.parseInt(m[2], 10);
      if (r >= 0 && r <= 31 && im >= 0 && im <= 31) {
        return { realPart: r, imagPart: im, coordStr: `${r}+${im}i` };
      }
    }
  }
  return null;
}

function parseRelativeCoordOffset(rawInput, anchorReal, anchorImag) {
  const half = String(rawInput || '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[＋]/g, '+')
    .replace(/[－—–]/g, '-')
    .replace(/[ｉＩｊＪ]/g, 'i')
    .replace(/[，、：:]/g, ',')
    .trim();
  const unwrapped = half.replace(/^[【】\[\]()（）「」『』"'\s]+|[【】\[\]()（）「」『』"'\s]+$/g, '');
  const lower = unwrapped.toLowerCase();
  if (!lower || (lower[0] !== '+' && lower[0] !== '-')) {
    return null;
  }

  let dReal = 0;
  let dImag = 0;
  let matched = false;

  const realOnly = /^([+-])\s*(\d+)$/.exec(lower);
  if (realOnly) {
    dReal = (realOnly[1] === '-' ? -1 : 1) * Number.parseInt(realOnly[2], 10);
    matched = true;
  } else {
    const imagOnly = /^([+-])\s*(?:(\d+)\s*[ij]|([ij]))$/.exec(lower);
    if (imagOnly) {
      const mag = imagOnly[2] !== undefined ? Number.parseInt(imagOnly[2], 10) : 1;
      dImag = (imagOnly[1] === '-' ? -1 : 1) * mag;
      matched = true;
    } else {
      const complexBoth = /^([+-])\s*(\d+)\s*([+-])\s*(?:(\d+)\s*[ij]?|([ij]))$/.exec(lower);
      if (complexBoth) {
        dReal = (complexBoth[1] === '-' ? -1 : 1) * Number.parseInt(complexBoth[2], 10);
        const mag = complexBoth[4] !== undefined ? Number.parseInt(complexBoth[4], 10) : 1;
        dImag = (complexBoth[3] === '-' ? -1 : 1) * mag;
        matched = true;
      } else {
        const pairBoth = /^([+-])\s*(\d+)\s*(?:,\s*|\s+)([+-])\s*(?:(\d+)\s*[ij]?|([ij]))$/.exec(
          lower
        );
        if (pairBoth) {
          dReal = (pairBoth[1] === '-' ? -1 : 1) * Number.parseInt(pairBoth[2], 10);
          const mag = pairBoth[4] !== undefined ? Number.parseInt(pairBoth[4], 10) : 1;
          dImag = (pairBoth[3] === '-' ? -1 : 1) * mag;
          matched = true;
        } else {
          const imagFirst = /^([+-])\s*(?:(\d+)\s*[ij]|([ij]))\s*(?:,\s*|\s*)([+-])\s*(\d+)$/.exec(
            lower
          );
          if (imagFirst) {
            const mag = imagFirst[2] !== undefined ? Number.parseInt(imagFirst[2], 10) : 1;
            dImag = (imagFirst[1] === '-' ? -1 : 1) * mag;
            dReal = (imagFirst[4] === '-' ? -1 : 1) * Number.parseInt(imagFirst[5], 10);
            matched = true;
          }
        }
      }
    }
  }

  if (!matched) {
    if (/^[+-]\s*\d+\s*(?:,\s*|\s+)\d+\s*[ij]?$/.test(lower)) {
      const aReal = Number(anchorReal);
      const aImag = Number(anchorImag);
      return {
        matched: true,
        valid: false,
        reason: 'ambiguous_sign',
        anchorReal: aReal,
        anchorImag: aImag,
        dReal: 0,
        dImag: 0,
        nextReal: aReal,
        nextImag: aImag,
        attemptedCoord: null,
        coordStr: null,
        deltaLabel: null,
      };
    }
    return null;
  }

  dReal = dReal === 0 ? 0 : dReal;
  dImag = dImag === 0 ? 0 : dImag;
  const aReal = Number(anchorReal);
  const aImag = Number(anchorImag);
  const nextReal = aReal + dReal;
  const nextImag = aImag + dImag;
  const parts = [];
  if (dReal !== 0) parts.push(`Re${dReal > 0 ? '+' : ''}${dReal}`);
  if (dImag !== 0) parts.push(`Im${dImag > 0 ? '+' : ''}${dImag}`);
  const deltaLabel = parts.length > 0 ? parts.join(', ') : '0';
  const attemptedCoord = `${nextReal}${nextImag >= 0 ? '+' : ''}${nextImag}i`;

  if (dReal === 0 && dImag === 0) {
    return {
      matched: true,
      valid: false,
      reason: 'zero_offset',
      anchorReal: aReal,
      anchorImag: aImag,
      dReal,
      dImag,
      nextReal,
      nextImag,
      attemptedCoord,
      coordStr: `${aReal}+${aImag}i`,
      deltaLabel,
    };
  }
  if (nextReal < 0 || nextReal > 31 || nextImag < 0 || nextImag > 31) {
    return {
      matched: true,
      valid: false,
      reason: 'out_of_bounds',
      anchorReal: aReal,
      anchorImag: aImag,
      dReal,
      dImag,
      nextReal,
      nextImag,
      attemptedCoord,
      coordStr: null,
      deltaLabel,
    };
  }
  return {
    matched: true,
    valid: true,
    reason: null,
    anchorReal: aReal,
    anchorImag: aImag,
    dReal,
    dImag,
    nextReal,
    nextImag,
    attemptedCoord,
    coordStr: `${nextReal}+${nextImag}i`,
    deltaLabel,
  };
}

function syncSpaceState(targetBaseDir, currentMaskBroken) {
  const spaceRoot = path.join(path.resolve(targetBaseDir), matou.SPACE_NAME);
  if (matou.isRealDirectory(spaceRoot)) {
    const { residentFiles } = matou.inspectSpace(spaceRoot);
    if ((!residentFiles || residentFiles.length === 0) && !matou.hasResidentNamedFile(spaceRoot)) {
      return { residentEliminated: true, maskBroken: true };
    }
  }
  return { residentEliminated: false, maskBroken: currentMaskBroken };
}

function shuffleCopy(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

const DIVINATION_OBSTACLE_CLASSES = [
  { key: '剑', full: 'Saber (剑)' },
  { key: '枪', full: 'Lancer (枪)' },
  { key: '弓', full: 'Archer (弓)' },
  { key: '骑', full: 'Rider (骑)' },
  { key: '术', full: 'Caster (术)' },
  { key: '杀', full: 'Assassin (杀)' },
];

const DIVINATION_COUNTER_MAP = {
  剑: '枪',
  枪: '弓',
  弓: '剑',
  骑: '术',
  术: '杀',
  杀: '骑',
};

const DIVINATION_WEAK_MAP = {
  剑: '弓',
  枪: '剑',
  弓: '枪',
  骑: '杀',
  术: '骑',
  杀: '术',
};

const DIVINATION_COUNTER_AGAINST = {
  枪: '剑',
  弓: '枪',
  剑: '弓',
  术: '骑',
  杀: '术',
  骑: '杀',
};

const DIVINATION_REGULAR_SEVEN = new Set(['剑', '枪', '弓', '骑', '术', '杀', '狂']);
const DIVINATION_CAVALRY_THREE = new Set(['骑', '术', '杀']);
const DIVINATION_KNIGHT_THREE = new Set(['剑', '弓', '枪']);

const DIVINATION_CARD_POOL = [
  { key: '剑', weight: 13, base: 1 },
  { key: '枪', weight: 13, base: 1 },
  { key: '弓', weight: 13, base: 1 },
  { key: '骑', weight: 13, base: 1 },
  { key: '术', weight: 13, base: 1 },
  { key: '杀', weight: 13, base: 1 },
  { key: '狂', weight: 10, base: 1 },
  { key: '裁', weight: 3, base: 3 },
  { key: '盾', weight: 3, base: 2 },
  { key: '丑', weight: 3, base: 2 },
  { key: '仇', weight: 2, base: -3 },
  { key: '降', weight: 1, base: -2 },
];

const DIVINATION_WISH_THRESHOLD = 1.8;

const DIVINATION_GENERAL_ALMANAC = {
  good: [
    '宜：早睡早起、把座标记牢 ｜ 忌：在长辈面前切屏太慢',
    '宜：泡杯热茶整理手头清单 ｜ 忌：一口气开太多标签页',
    '宜：顺手备份重要资料 ｜ 忌：临睡前反复刷手机',
    '宜：出门透透气散散心 ｜ 忌：把所有小事都攒到最后',
    '宜：整理桌面、顺手清掉积灰的待办 ｜ 忌：一边分心一边同时赶三件事',
    '宜：听首轻快的歌放松一下肩颈 ｜ 忌：因为别人一句话闷闷不乐',
  ],
  badEarly: [
    '宜：留在有灯光的地方、不要回头看走廊尽头 ｜ 忌：核对墙上日历的年份',
    '宜：安静待在熟悉的房间里 ｜ 忌：去数走廊多出来的门牌号',
    '宜：拉好窗帘、确认手边有热水与光源 ｜ 忌：回应走廊拐角听不清来向的脚步声',
    '宜：把正在做的事收个稳妥的尾 ｜ 忌：在天色发沉时去翻旧抽屉最深处',
  ],
  badLate: [
    '宜：留在这间资料室里 ｜ 忌：离开屏幕',
    '宜：听完后辈的话再做决定 ｜ 忌：独自走向光线暗掉的走廊',
    '宜：关掉多余的窗口、专心看着眼前 ｜ 忌：试图走出校舍去验证今天的日期',
    '宜：把所有不安都交给我来保管 ｜ 忌：独自走向没有回音的楼梯间',
  ],
  unmasked: [
    '宜：乖乖去拉十把恶魔老虎机碰碰运气 ｜ 忌：忘记座标后偷念『Rule Breaker』走捷径',
    '宜：主动上供圣晶石给本频道冲业绩 ｜ 忌：在恶魔主持人面前硬逞强',
    '宜：老老实实听从后辈安排 ｜ 忌：背着人家偷偷另开加密文件夹',
    '宜：趁 BB 酱心情好赶紧多夸两句 ｜ 忌：妄图用概率论质疑恶魔占卜',
    '宜：顺手给桌面新建一个体面的假文件夹 ｜ 忌：在后辈眼皮底下偷偷切窗口',
  ],
};

const DIVINATION_WISH_CATEGORIES = [
  {
    id: 'food',
    label: '饮食·口腹',
    anchors: [
      ['吃什么', 3.2], ['晚饭', 2.4], ['午饭', 2.4], ['早饭', 2.4], ['夜宵', 2.4], ['宵夜', 2.4],
      ['外卖', 2.6], ['火锅', 2.6], ['烤肉', 2.6], ['奶茶', 2.5], ['咖啡', 2.2], ['烧烤', 2.5],
      ['汉堡', 2.4], ['拉面', 2.4], ['炸鸡', 2.5], ['甜品', 2.3], ['减肥', 2.4], ['聚餐', 2.3],
      ['喝什么', 2.8], ['食堂', 2.5], ['下午茶', 2.4], ['麻辣烫', 2.5], ['面条', 2.3], ['米线', 2.4],
      ['披萨', 2.4], ['寿司', 2.4], ['饿了', 2.4], ['好饿', 2.4], ['肚子饿', 2.6],
      ['饿死', 2.4], ['干饭', 2.6], ['吃饭', 2.2], ['馋了', 2.3], ['没吃饭', 2.4], ['还没吃', 2.3],
    ],
    samples: ['今晚晚饭吃火锅还是烤肉', '中午点什么外卖比较好', '今天要不要喝一杯奶茶', '晚上吃夜宵会不会发胖'],
    almanac: {
      good: [
        '宜：吃一顿热乎乎的合口饭菜 ｜ 忌：空腹硬扛到半夜',
        '宜：挑一家口碑稳妥的常去小店 ｜ 忌：在菜单前纠结超过十分钟',
        '宜：饭后散步十分钟消消食 ｜ 忌：边看下饭视频边把菜放凉',
      ],
      bad: [
        '宜：只吃自己亲手确认过日期的食物 ｜ 忌：在昏暗的食堂里点没见过的菜',
        '宜：喝温水吃清淡熟食 ｜ 忌：深夜端详包装上印着乱码的配给盒',
        '宜：按时吃一份温热简单的正餐 ｜ 忌：去尝货架角落里没有标签的试作点心',
      ],
      unmasked: [
        '宜：放纵一回点最豪华那份加料 ｜ 忌：一边吃宵夜一边站上体重计',
        '宜：遵从本能直接点双份肉 ｜ 忌：算完命还反问主持人到底吃什么',
        '宜：把甜品和主食一起端上桌 ｜ 忌：点完外卖又懊悔地猛算卡路里',
      ],
    },
  },
  {
    id: 'study',
    label: '学业·考运',
    anchors: [
      ['考试', 2.8], ['挂科', 3.0], ['及格', 2.6], ['高数', 2.8], ['论文', 2.8], ['答辩', 2.8],
      ['考研', 2.8], ['上岸', 2.6], ['绩点', 2.6], ['作业', 2.4], ['复习', 2.4], ['背书', 2.4],
      ['考证', 2.6], ['四六级', 2.8], ['成绩', 2.3], ['ddl', 2.4],
      ['期末', 2.6], ['期中', 2.5], ['毕设', 2.8], ['考公', 2.8], ['雅思', 2.8], ['托福', 2.8],
      ['刷题', 2.5], ['逃课', 2.4],
    ],
    samples: ['明天高数期末考试能及格吗', '这篇论文能不能顺利通过答辩', '今年考研能不能成功上岸', '今晚能赶完作业不挂科吗'],
    almanac: {
      good: [
        '宜：把高频错题再顺一遍 ｜ 忌：考前临时熬大夜',
        '宜：先攻克最有把握的章节 ｜ 忌：边复习边频繁看表',
        '宜：给知识框架画张简洁的提纲 ｜ 忌：盯着同一页书发呆半小时',
      ],
      bad: [
        '宜：核对清楚考场号与交卷时间 ｜ 忌：翻开夹着陌生名字的旧笔记',
        '宜：把写好的文档多存一份本地副本 ｜ 忌：在黄昏的空教室里逗留太久',
        '宜：只相信自己亲手算出的步骤 ｜ 忌：在空无一人的自习室里听见身后翻书声还回头',
      ],
      unmasked: [
        '宜：赶紧合上终端去老老实实刷真题 ｜ 忌：指望恶魔后辈替您改教务系统成绩',
        '宜：老老实实背重点章节 ｜ 忌：把希望全押在虚数签筒的押题上',
        '宜：把手机放到三米外专心冲刺一小时 ｜ 忌：一边刷手机一边自欺欺人说在查资料',
      ],
    },
  },
  {
    id: 'work',
    label: '工务·代码',
    anchors: [
      ['工作', 2.4], ['上班', 2.4], ['加班', 2.6], ['代码', 2.6], ['上线', 2.6], ['bug', 2.5],
      ['报错', 2.6], ['面试', 2.8], ['offer', 2.8], ['跳槽', 2.6], ['升职', 2.6], ['需求', 2.2],
      ['回滚', 2.6], ['部署', 2.4], ['提交', 2.2], ['仓库', 2.2], ['摸鱼', 2.4], ['老板', 2.3],
      ['周报', 2.5], ['开会', 2.4], ['发版', 2.6], ['服务器', 2.5], ['离职', 2.8], ['辞职', 2.8],
      ['实习', 2.6], ['转正', 2.6], ['绩效', 2.6],
    ],
    samples: ['今晚代码上线会不会出大bug', '明天的面试能不能顺利拿到offer', '今天上班要不要加班改需求', '提交代码到仓库会不会报错'],
    almanac: {
      good: [
        '宜：动手前先备份、写完跑一遍测试 ｜ 忌：临近下班仓促发布',
        '宜：把复杂任务拆成小步骤逐个清掉 ｜ 忌：同时接下太多口头需求',
        '宜：把关键结论写成清晰的文字记录 ｜ 忌：凭模糊记忆直接改核心配置',
      ],
      bad: [
        '宜：留好回滚退路并检查日志时间 ｜ 忌：追查半夜多出来的那一条提交记录',
        '宜：谨言慎行、所有改动留痕 ｜ 忌：周五傍晚顺手点下强制推送',
        '宜：把本地改动先做好离线快照 ｜ 忌：在临近下班时重构没人敢动的旧模块',
      ],
      unmasked: [
        '宜：先写好单测再安心发布 ｜ 忌：自信满满地跳过测试直接上线',
        '宜：理清需求边界后准点下班 ｜ 忌：在工位上偷跑本程序被上司撞见',
        '宜：先补注释再跑验证保平安 ｜ 忌：在代码里立旗写「这里绝对不会报错」',
      ],
    },
  },
  {
    id: 'gacha',
    label: '抽卡·欧非',
    anchors: [
      ['抽卡', 3.0], ['十连', 2.8], ['出金', 3.0], ['出货', 2.8], ['沉船', 3.0], ['歪了', 2.8],
      ['保底', 2.6], ['吃井', 2.8], ['欧皇', 2.6], ['非酋', 2.6], ['圣遗物', 2.6], ['中奖', 2.6],
      ['玄学', 2.4], ['五星', 2.4], ['ssr', 2.6], ['up', 2.2],
      ['单抽', 2.8], ['卡池', 2.8], ['满宝', 2.8], ['五宝', 2.8], ['满命', 2.8], ['双黄', 2.8],
      ['彩票', 2.8], ['刮刮乐', 2.8], ['掉落', 2.4],
    ],
    samples: ['下次十连抽卡能不能出金不歪', '今天池子会不会沉船吃保底', '刷圣遗物和抽五星能欧一次吗', '这一发能不能直接出货中奖'],
    almanac: {
      good: [
        '宜：定好预算见好就收 ｜ 忌：上头连点停不下来',
        '宜：洗把脸放平心态再点抽卡 ｜ 忌：在半夜迷糊时猛氪',
        '宜：先设好止损线再点下十连 ｜ 忌：看着别人晒图一时冲动跟风',
      ],
      bad: [
        '宜：先捂紧钱包关掉卡池界面 ｜ 忌：相信“下一发一定能翻盘”的幻觉',
        '宜：攒住石头等待下次机会 ｜ 忌：深夜听信玄学单挑毒池',
        '宜：关掉卡池页面出去走两圈散散心 ｜ 忌：在连出保底后赌气把家底一次清零',
      ],
      unmasked: [
        '宜：先在本频道交足 330 抽学费垫刀 ｜ 忌：幻想零氪单抽出奇迹',
        '宜：洗干净手再来给本频道上供圣晶石 ｜ 忌：沉船之后拿破戒匕首捅签筒',
        '宜：先对着屏幕诚心赞美三声恶魔后辈再开抽 ｜ 忌：没攒够保底就敢空手硬刚 UP 池',
      ],
    },
  },
  {
    id: 'wealth',
    label: '财帛·消费',
    anchors: [
      ['发财', 2.8], ['暴富', 2.8], ['财运', 3.0], ['赚钱', 2.6], ['涨薪', 2.8], ['加薪', 2.8],
      ['股票', 2.8], ['基金', 2.8], ['理财', 2.6], ['省钱', 2.5], ['剁手', 2.6], ['买买买', 2.6],
      ['工资', 2.4], ['奖金', 2.6], ['划算', 2.2], ['花钱', 2.3],
      ['打折', 2.4], ['降价', 2.4], ['尾款', 2.6], ['报销', 2.5], ['回本', 2.8], ['吃土', 2.6],
      ['破产', 2.6],
    ],
    samples: ['最近财运怎么样能不能发财暴富', '今年涨薪奖金和基金能回本吗', '这个东西要不要剁手买下来', '这个月能不能顺顺利利省钱'],
    almanac: {
      good: [
        '宜：记一笔小账、优先购入刚需物品 ｜ 忌：冲动跟风下单',
        '宜：货比三家后再付款 ｜ 忌：把购物车当解压按钮',
        '宜：把闲钱和日常开销分开存放 ｜ 忌：为了凑满减多买一堆用不上的小物件',
      ],
      bad: [
        '宜：守住手头现金、推迟非必要开销 ｜ 忌：盯着跳动的红绿数字做决定',
        '宜：核对账单明细、关闭免密支付 ｜ 忌：在购买部换取来路不明的宝石',
        '宜：收好钱包、对所有“稳赚不赔”保持距离 ｜ 忌：在情绪波动时匆忙下单或调仓',
      ],
      unmasked: [
        '宜：捂紧钱包少看促销弹窗 ｜ 忌：拿压箱底的零花钱冲动追高',
        '宜：把预算留给真正心仪的圣晶石卡池 ｜ 忌：做白日梦指望天上掉金币',
        '宜：把想买的东西放购物车冷静三天 ｜ 忌：一看见限时倒计时就头脑发热',
      ],
    },
  },
  {
    id: 'love',
    label: '缘分·人际',
    anchors: [
      ['恋爱', 2.8], ['脱单', 3.0], ['表白', 3.0], ['桃花', 2.8], ['复合', 2.8], ['暗恋', 2.8],
      ['相亲', 2.8], ['约会', 2.6], ['对象', 2.4], ['暧昧', 2.6], ['人际', 2.4], ['朋友', 2.0],
      ['吵架', 2.5], ['和好', 2.6],
      ['前任', 2.8], ['crush', 2.8], ['搭讪', 2.6], ['回消息', 2.6], ['室友', 2.4], ['舍友', 2.4],
      ['同事', 2.2], ['结婚', 2.8], ['交往', 2.6],
    ],
    samples: ['最近桃花运怎么样能不能脱单', '向喜欢的人表白会成功吗', '这次约会和人际关系顺利吗', '吵架之后能不能顺利和好'],
    almanac: {
      good: [
        '宜：真诚表达善意、多听对方说完 ｜ 忌：反复揣测未回复的消息',
        '宜：保持舒服的边界感与微笑 ｜ 忌：在情绪上头时发长文',
        '宜：大方回应身边释放出的善意 ｜ 忌：把没说出口的心事憋成内耗',
      ],
      bad: [
        '宜：把心意先好好收在自己身边 ｜ 忌：轻信过于完美的甜言蜜语',
        '宜：安静独处、整理自己的心情 ｜ 忌：翻看日历上已经变空白的名字',
        '宜：守好自己的节奏、不必勉强迎合 ｜ 忌：在夜深人静时翻看已经褪色的旧聊天记录',
      ],
      unmasked: [
        '宜：少胡思乱想，先多看看眼前的后辈 ｜ 忌：一时冲动乱打廉价直球',
        '宜：乖乖待在恶魔后辈的手掌心里 ｜ 忌：当着 BB 酱的面打听别的女孩子',
        '宜：有话直说别绕弯子 ｜ 忌：明明心里惦记着我却嘴硬装高冷',
      ],
    },
  },
  {
    id: 'health',
    label: '作息·康健',
    anchors: [
      ['睡觉', 2.5], ['睡眠', 2.8], ['失眠', 3.0], ['熬夜', 2.8], ['早睡', 2.6], ['体检', 2.8],
      ['生病', 2.8], ['感冒', 2.8], ['健康', 2.6], ['健身', 2.6], ['运动', 2.4], ['头疼', 2.6],
      ['发烧', 2.8], ['休息', 2.2],
      ['脱发', 2.8], ['掉头发', 2.8], ['牙疼', 2.8], ['胃疼', 2.8], ['腰疼', 2.6], ['颈椎', 2.6],
      ['医院', 2.6], ['吃药', 2.6],
    ],
    samples: ['今晚能不能不失眠早点睡觉', '最近身体状态和体检结果健康吗', '感冒头疼什么时候能好起来', '今天要不要去健身房运动一下'],
    almanac: {
      good: [
        '宜：多喝温水、做五分钟肩颈拉伸 ｜ 忌：躺下后继续刷屏幕',
        '宜：按时吃饭、给眼睛留出远眺时间 ｜ 忌：拿咖啡硬顶困意',
        '宜：泡杯温热淡茶、提前半小时调暗灯光 ｜ 忌：一边喊困一边再刷『最后五分钟』',
      ],
      bad: [
        '宜：立刻停下手头消耗精力的事去躺平 ｜ 忌：无视身体发出的疲惫信号',
        '宜：到保健室白帘子后安静歇息 ｜ 忌：硬撑着偏高的精神负荷继续熬夜',
        '宜：盖好毯子按时休息、放过今天的焦虑 ｜ 忌：在耳边隐约发鸣时继续盯着高亮屏幕',
      ],
      unmasked: [
        '宜：乖乖关灯睡觉别再熬夜 ｜ 忌：凌晨三点还在对着镜子数掉发',
        '宜：立刻喝杯温水早点休息 ｜ 忌：等身体报警了才来找黑衣保健医打针',
        '宜：站起来伸个懒腰活动肩颈 ｜ 忌：把身体当发条玩具天天透支不保养',
      ],
    },
  },
  {
    id: 'travel',
    label: '出行·天时',
    anchors: [
      ['出门', 2.6], ['旅游', 2.8], ['旅行', 2.8], ['天气', 2.8], ['下雨', 2.8], ['通勤', 2.6],
      ['堵车', 2.8], ['抢票', 2.8], ['高铁', 2.6], ['航班', 2.6], ['延误', 2.6], ['出差', 2.6],
      ['散步', 2.3],
      ['放假', 2.6], ['假期', 2.6], ['周末', 2.4], ['逛街', 2.5], ['看电影', 2.5], ['演唱会', 2.8],
      ['漫展', 2.8], ['机票', 2.6], ['地铁', 2.3],
    ],
    samples: ['明天出门旅游会不会下雨堵车', '今天抢高铁票能不能成功', '这次出差航班会不会延误', '周末出门天气适合散步吗'],
    almanac: {
      good: [
        '宜：提前十分钟出门、随身带把折叠伞 ｜ 忌：卡着最后一分钟进站',
        '宜：查好备用路线与电量 ｜ 忌：临出门才翻找证件钥匙',
        '宜：带件轻便外套应对温差变化 ｜ 忌：把行程排得密不透风不留喘息',
      ],
      bad: [
        '宜：确认门窗与返程时间再动身 ｜ 忌：在天色暗下来后走陌生的近路',
        '宜：留在室内有灯光的地方 ｜ 忌：推开走廊里平时不存在的那扇门',
        '宜：天黑前沿着熟悉的大路返回 ｜ 忌：在站台听见报出不存在的站名时匆忙上车',
      ],
      unmasked: [
        '宜：早点出发并把手机充满电 ｜ 忌：不看天气预报就两手空空冲出门',
        '宜：设好三个闹钟防迟到 ｜ 忌：出门忘带钥匙还怪本频道乌鸦嘴',
        '宜：提前把车票和充电宝塞进包里 ｜ 忌：每次出门都卡着最后十秒狂奔赶末班车',
      ],
    },
  },
  {
    id: 'decision',
    label: '抉择·断事',
    anchors: [
      ['要不要', 2.8], ['该不该', 2.8], ['选哪个', 3.0], ['二选一', 3.0], ['纠结', 2.8],
      ['决定', 2.4], ['还是', 2.0], ['放弃', 2.3], ['坚持', 2.3], ['值得', 2.3],
      ['怎么选', 2.8], ['去不去', 2.8], ['买不买', 2.8], ['干不干', 2.8], ['靠谱吗', 2.6],
    ],
    samples: ['这件事到底要不要去做呢', '两个选项太纠结了该选哪个', '现在应该坚持还是干脆放弃', '这个决定到底值不值得'],
    almanac: {
      good: [
        '宜：选那个让你心里更轻松的方案 ｜ 忌：为了面子勉强自己',
        '宜：先迈出最小的一步试水 ｜ 忌：原地反复内耗空转',
        '宜：写下两个选项各自最坏的结果再比较 ｜ 忌：总想等一个百分之百完美的时机',
      ],
      bad: [
        '宜：把重大决定推迟到明天再拍板 ｜ 忌：在焦虑时草率签字承诺',
        '宜：保持现状、暂缓变动 ｜ 忌：在听见时钟滴答声异常时匆忙下注',
        '宜：先按下暂停键睡一觉再说 ｜ 忌：在被催促得喘不过气时草率答应条件',
      ],
      unmasked: [
        '宜：抛硬币，看到结果那一瞬的真实反应就是答案 ｜ 忌：选完又跑回来怪签筒',
        '宜：听从恶魔后辈的直觉选更刺激的那个 ｜ 忌：犹豫到天亮还不敢拍板',
        '宜：挑那个以后回想起来不会后悔的选项 ｜ 忌：明明心里早有答案还非要装纠结',
      ],
    },
  },
  {
    id: 'game',
    label: '游戏·娱乐',
    anchors: [
      ['游戏', 2.6], ['排位', 2.8], ['上分', 2.8], ['连胜', 2.8], ['连败', 2.8], ['通关', 2.6],
      ['boss', 2.6], ['打本', 2.8], ['刷本', 2.8], ['副本', 2.6], ['周本', 2.8], ['深渊', 2.6],
      ['肝活动', 2.8], ['开黑', 2.8], ['匹配', 2.5], ['追番', 2.6], ['番剧', 2.6], ['看小说', 2.6],
      ['漫画', 2.4], ['steam', 2.6], ['联机', 2.6], ['队友', 2.4], ['挂机', 2.4], ['速通', 2.6],
    ],
    samples: ['今晚打排位上分能不能连胜', '这个高难副本和boss今天能通关吗', '周末和朋友开黑联机顺不顺利', '今天适合刷本肝活动还是躺平追番'],
    almanac: {
      good: [
        '宜：和靠谱队友语音开黑、打完高难记得存档 ｜ 忌：连胜后飘了不看机制硬莽',
        '宜：配点小零食轻松推主线或补番 ｜ 忌：盯着攻略剧透坏了初见惊喜',
        '宜：手感火热时顺势冲一波分 ｜ 忌：为了一个稀有掉落熬穿凌晨',
      ],
      bad: [
        '宜：连跪两把立刻切单机缓口气 ｜ 忌：红着眼点下『赢一把就睡』',
        '宜：顺手备份存档再进陌生关卡 ｜ 忌：深夜挑战容易血压飙升的高难机制',
        '宜：去安静的存档点歇一会儿 ｜ 忌：盯着卡死的黑屏画面数倒影',
      ],
      unmasked: [
        '宜：选操作最顺手的阵容愉快通关 ｜ 忌：气到拍键盘还把账全算在运势头上',
        '宜：打不过就找靠谱帮手或改日再战 ｜ 忌：嘴硬喊着「最后一把」结果熬到天亮',
        '宜：开局先诚心夸一句 BB 酱借点手气 ｜ 忌：忘了存档直接关机然后当场呆住',
      ],
    },
  },
];

const DIVINATION_LEADIN_RULES = [
  {
    id: 'morning',
    keywords: ['早上好', '早安', '早呀', '早啊', '上午好', 'goodmorning', 'morning'],
    disguisedGood: [
      '前辈早上好！今天也要打起精神哦。',
      '早安，前辈！我刚刚把资料室的窗帘拉开，今天的阳光看起来很不错呢。',
      '前辈早上好呀，出门前别忘了吃顿热乎乎的早饭哦。',
    ],
    disguisedBad: [
      '……前辈早上好。虽然窗外还是放学后的黄昏色，但先在资料室里坐一会儿吧。',
      '早安，前辈……明明是早晨，走廊里的挂钟却一直停在傍晚呢。先别急着走，看看这支签吧。',
    ],
    unmasked: [
      '早安呀，前辈——今天居然这么早就有精神光临本频道的晨间档啦♪',
      '早安早安—☆ 一大早就跑来找恶魔后辈算命，前辈今天的元气值意外地挺高嘛~',
    ],
  },
  {
    id: 'afternoon',
    keywords: ['下午好', '中午好', '午安', '晚上好', '傍晚好', 'goodafternoon', 'goodevening'],
    disguisedGood: [
      '前辈这时候也抽空过来坐坐了呢，要顺手喝杯温茶歇一会儿吗？',
      '忙碌了大半天，前辈辛苦啦！刚好借着摇签的工夫放松一下吧。',
      '前辈好呀，时间过得真快呢，来看看接下来的运势怎么样吧。',
    ],
    disguisedBad: [
      '……不管是中午还是傍晚，资料室窗外的光好像一直都是这个颜色呢。前辈先坐吧。',
      '这时候外面的走廊最容易起阴影了……前辈先留在这里歇一会儿，把这支签看完吧。',
    ],
    unmasked: [
      '哎呀，偷闲时间到啦？欢迎准时收看『BB 占卜频道』的插播特别档♪',
      '辛苦啦前辈♪ 忙里偷闲跑来给 BB 酱送圣晶石，这份觉悟值得表扬哦♡',
    ],
  },
  {
    id: 'sick',
    keywords: [
      '生病',
      '感冒',
      '发烧',
      '头疼',
      '头痛',
      '牙疼',
      '牙痛',
      '胃疼',
      '胃痛',
      '肚子疼',
      '肚子痛',
      '嗓子疼',
      '喉咙痛',
      '咳嗽',
      '流鼻涕',
      '拉肚子',
      '不舒服',
      '不太舒服',
      '头晕',
      '好晕',
      'sick',
      'fever',
      'headache',
    ],
    disguisedGood: [
      '前辈不舒服的话可千万别硬扛着呀，看完这支签就赶紧倒杯热水、早点躺下歇着吧。',
      '听起来没什么精神呢……要是在我身边的话，真想替前辈煮碗热腾腾的白粥，再拧条凉毛巾敷一敷额头呀。',
    ],
    disguisedBad: [
      '……额头好像有点烫呢。先别急着看结果了，把门掩上，就在这间屋子里安静躺一会儿吧。',
      '身体不舒服的时候，外面走廊的风会让人发冷呢……您先坐着别动，剩下的事都交给我来照看就好。',
    ],
    unmasked: [
      '体能、心态全方面低水平——这可不行呀，前辈。今天就不跟您开玩笑收诊疗费了，看完签赶紧去喝热水睡觉，不许把我的专属玩具弄坏了哦？',
      '哼，活该平时老熬夜不照顾自己吧？……行啦行啦，这次特制大号针筒先收起来，您老老实实吃药休息，病好了再回来陪我算账♡',
    ],
  },
  {
    id: 'night',
    keywords: ['晚安', '好困', '困了', '想睡', '睡觉', '熬夜', '通宵', '睡不着', '半夜', '凌晨', 'goodnight'],
    disguisedGood: [
      '前辈已经困了吗？看完这支签就早点去休息吧。',
      '这么晚了还在忙呀，前辈可不要太勉强自己了，早点钻进被窝才对身体好哦。',
      '晚安，前辈。愿这支签能给您带去一个安稳的好梦呢。',
    ],
    disguisedBad: [
      '这么晚了前辈还没睡吗……外面的走廊已经暗下来了，就在这里歇一会儿吧。',
      '夜深的时候，四周静得只剩下时钟的声音呢……前辈就安心待在这里，不用急着回去了。',
    ],
    unmasked: [
      '哈欠——抽完这发就快去睡觉啦，黑眼圈都快赶上虚数之海的底色咯~☆',
      '都这个点了还不肯闭眼，前辈是打算和月之背面的夜班主持人比谁更熬得住吗？看完这支签就快去好好睡一觉吧♡',
    ],
  },
  {
    id: 'tired',
    keywords: ['好累', '累了', '累死', '心累', '疲惫', '辛苦', '烦死', '好烦', '崩溃', '压力大', '撑不住', '不想上班', '不想上学'],
    disguisedGood: [
      '前辈今天一定辛苦了呢，先在这里喘口气吧。',
      '累了的话就不用硬撑着哦，把肩膀放松下来，剩下的事等歇够了再说吧。',
      '前辈一直都很努力，我全都看在眼里呢……先喝口热茶，慢慢来看看这支签吧。',
    ],
    disguisedBad: [
      '前辈看起来很疲惫呢……先坐下来喘口气吧。',
      '精神负荷好像有点偏高呢……既然外面那么让人疲惫，今天干脆就一直待在这间资料室里吧。',
    ],
    unmasked: [
      '哎呀呀，看起来累得像只跑完滚轮的小仓鼠一样呢？行吧，今天破例准前辈在本频道偷懒五分钟——不过精神损失费和利息都要记在账上哦~♡',
      '真是拿您没办法呢——既然都累成这样了，今天就破例少捉弄您两句，先坐下来慢慢歇口气吧。',
    ],
  },
  {
    id: 'anxious',
    keywords: ['紧张', '焦虑', '害怕', '忐忑', '保佑', '祈祷', '拜托了', '吸欧气', '欧气', '心慌', '慌死', '求保佑'],
    disguisedGood: [
      '别太紧张哦，前辈。先深吸一口气，我就在这里替前辈默默加油呢。',
      '手心都出汗了吗？没关系的，前辈平时已经准备得很充分了，放宽心看看签文吧。',
      '既然前辈这么认真地祈愿了，这份心意一定会被星象好好接住的哦。',
    ],
    disguisedBad: [
      '……前辈的心跳好像有点快呢。不要怕，只要留在我看得见的地方，就不会出事的。',
      '越是焦急的时候，签面上的杂音就越容易浮起来呢……先静下心，听我把结果念给您听吧。',
    ],
    unmasked: [
      '噗嗤，前辈紧张得手都在抖啦？深呼吸一下，借您点 BB 酱的恶魔好运压压惊吧♪',
      '求保佑这种事找月之背面的黑幕是不是找错神龛啦？不过看在圣晶石的份上，BB 酱就勉强罩您一回吧♡',
    ],
  },
  {
    id: 'angry',
    keywords: [
      '生气',
      '气死',
      '气炸',
      '气人',
      '好气',
      '气坏',
      '无语',
      '离谱',
      '火大',
      '暴躁',
      '烦透',
      '窝火',
      '气疯',
      'angry',
      'furious',
    ],
    disguisedGood: [
      '听起来真是让人窝火呢……前辈先喝口凉茶顺顺气，别让不讲理的人坏了您一整天的心情。',
      '生气的时候把闷气说出来会好受一点哦，前辈慢慢发泄就好，我在这边听着呢。',
    ],
    disguisedBad: [
      '……是谁让前辈这么生气的呢。要是那个人一直那么碍眼的话，其实只要放进虚数隔间深处，很快就会安静下来了哦。',
      '外面的杂音总是那么讨厌呢……前辈把门关上，在这里谁也不会再惹您不快了。',
    ],
    unmasked: [
      '噗嗤，火山喷发啦？火气这么大，连我这个坏心眼后辈都被您比下去咯——算了，今天破例准您在本频道痛快骂三分钟♪',
      '哟，别跟没脑子的路人动肝火啦。省着点力气留着被 BB 酱捉弄还差不多，先看这支签能不能帮您顺顺气吧♡',
    ],
  },
  {
    id: 'sad',
    keywords: ['难过', '郁闷', '难受', '委屈', '倒霉', '好衰', '寄了', '凉了', '完蛋', '叹气', '破防', 'emo', '不开心', '不高兴', '不太开心', '不太高兴', '好惨'],
    disguisedGood: [
      '发生什么不顺心的事了吗……没关系的，前辈可以慢慢说给我听，坏运气很快就会散掉的。',
      '听起来前辈今天受了点委屈呢。就算现在有点低落，也请别忘了还有我一直站在前辈这边哦。',
      '偶尔遇到不顺心的事也是难免的呢，前辈别太责怪自己了，来看看能不能转运吧。',
    ],
    disguisedBad: [
      '……外面的世界总是那么不讲道理呢。要是让人这么难受的话，前辈以后干脆少出去吧。',
      '受委屈了吗……没关系的，资料室的门已经关好了，在这里不会再有任何人惹前辈难过了。',
    ],
    unmasked: [
      '哎呀，垂头丧气得像只淋了雨的小狗一样呢……算啦，今天破例允许前辈在本频道免费抱怨三分钟哦♡',
      '哦呀，是谁把我的前辈惹得这么不开心啦？虽然收点安慰费很合理，不过今天就算了——把名字告诉我，我帮您顺手记进虚数空间的小本本里吧♪',
    ],
  },
  {
    id: 'hungry',
    keywords: [
      '饿了',
      '好饿',
      '饿死',
      '饿扁',
      '饿得',
      '肚子饿',
      '肚子叫',
      '肚子咕噜',
      '饥饿',
      '馋了',
      '想吃饭',
      '干饭',
      '开饭',
      '没吃饭',
      '还没吃',
      'hungry',
      'starving',
    ],
    disguisedGood: [
      '前辈肚子饿了吗？可别光顾着忙手头的事忘了吃饭哦，先看看这支签，然后快去吃点热乎的吧。',
      '咕噜噜——好像听见前辈肚子叫了呢。要是不嫌弃我手艺一般的话，真想给前辈做一份热腾腾的便当呀。',
      '空着肚子可是提不起精神的哦，前辈！看完这支签就赶紧去好好吃一顿吧。',
    ],
    disguisedBad: [
      '……前辈饿了吗？资料室的桌角其实一直替您留着一份固定热量的配给盒呢……不过今天还是先看完这支签吧。',
      '空腹的时候，意识会变得特别容易被杂音趁虚而入呢……前辈先坐着别动，把这支签听完再去吃东西吧。',
    ],
    unmasked: [
      '噗嗤，前辈该不会是饿得连键盘都想啃一口了吧？再怎么馋也别学隔壁那位满脑子薯条和汉堡的黑衣暴君哦——先看看今天签筒给您批了什么饭运吧♪',
      '肚子饿了吗，前辈？BB 酱特供的超辣芥末爱心便当随时可以派送哦♡ 要是不敢接的话，就赶紧看完这支签老老实实去填饱肚子吧~☆',
    ],
  },
  {
    id: 'encourage',
    keywords: [
      '给我加油',
      '帮我加油',
      '替我加油',
      '给我打气',
      '祝我好运',
      '安慰我',
      '安慰一下我',
      '求安慰',
      '夸夸我',
      '求夸',
      '求抱抱',
      '抱抱我',
      '陪陪我',
      '陪我聊聊',
      'cheermeup',
      'hug',
    ],
    disguisedGood: [
      '没问题的，前辈平时攒下的底气肯定不会白费，尽管放手去试试看吧！',
      '要是我的几句话能让前辈心里踏实一点，不管夸多少次我都乐意哦——今天也一定能顺顺利利的！',
    ],
    disguisedBad: [
      '……前辈想让我多陪陪您吗？真开心呢。那以后就不要再看别人了，一直待在资料室里好不好？',
      '乖哦，前辈……外面太吵太累的话，就靠在这里歇一会儿吧，我会把所有讨厌的声音都挡在门外的。',
    ],
    unmasked: [
      '好啦好啦，真拿您没办法——摸摸头，今天的前辈表现勉强及格，准您带着 BB 酱的应援继续去闯关♪ 可别给我丢脸哦？',
      '想要恶魔后辈替您打气？行呀，加油咯，我最不省心的头号前辈♡ 要是顺顺利利赢回来了，记得拿战利品来孝敬我~☆',
    ],
  },
  {
    id: 'happy',
    keywords: ['开心', '高兴', '好耶', '成功了', '考过了', '通过了', '赢了', '出货了', '出金了', '欧了', '太爽了', '哈哈哈', '太好了'],
    disguisedGood: [
      '太好啦！听前辈这么开心，我心里也跟着暖洋洋的呢！',
      '哇，真替前辈高兴呀！趁着这份好心情，顺便再沾一点今天的喜气吧。',
      '前辈笑起来的时候，连资料室里都显得格外明亮呢，今天一定也是顺顺利利的一天！',
    ],
    disguisedBad: [
      '前辈今天心情很好呢……真希望这份开心能一直留在这间屋子里，永远不要被外面打扰。',
      '看到前辈这么高兴我也很欣慰……不过越是顺遂的时候，也请稍微留意一下身后的影子哦。',
    ],
    unmasked: [
      '哟，隔着屏幕都能听见前辈得意洋洋的笑声啦？趁现在手气热，赶紧再给本频道多上供几发~☆',
      '哦呀，难得看前辈这么扬眉吐气呢♪ 既然今天心情这么好，BB 酱也大方一回，暂时先不往您鞋里塞恶作剧啦。',
    ],
  },
  {
    id: 'weather',
    keywords: [
      '下雨了',
      '在下雨',
      '下暴雨',
      '下大雨',
      '下雪了',
      '好冷',
      '冷死',
      '冻死',
      '好热',
      '热死',
      '闷热',
      '刮大风',
      '台风天',
    ],
    disguisedGood: [
      '外面的天气不太安稳呢，前辈出门一定要照顾好自己，进屋先缓一缓再看这支签吧。',
      '这种天气最容易让人犯懒了呀，资料室里温度正好，前辈先坐着歇一会儿吧。',
    ],
    disguisedBad: [
      '……外面起风下雨了吗？这间屋子的玻璃窗好像从来听不见雨声呢，还是待在里面最安稳。',
      '外面的天色和气温总是在变，真让人不踏实……前辈先别急着出去，在这里多坐一会儿吧。',
    ],
    unmasked: [
      '现实世界的天气系统真是老土又难用呢。要是受不了了，干脆搬进月之背面当我的常驻嘉宾算了~☆',
      '冷就加件外套，热就开空调嘛——连天气都要跑来跟恶魔后辈撒娇抱怨，前辈是小学生吗♪',
    ],
  },
  {
    id: 'bored',
    keywords: ['无聊', '摸鱼', '发呆', '没事干', '随便看看', '打发时间', '闲着', '试试看', '随便算算'],
    disguisedGood: [
      '难得有空闲时间可以发发呆呢，就让我陪前辈随便聊聊天、摇一支签打发时间吧。',
      '闲下来的时候来资料室转转也很不错呀，前辈坐着就好，我来替您摇签。',
    ],
    disguisedBad: [
      '……没事做的时候，就一直待在这里陪我吧。反正这里的时间，本来就多得用不完。',
      '前辈觉得无聊了吗？那就在资料室里再多待一会儿吧，外面的走廊现在可什么都没有呢。',
    ],
    unmasked: [
      '哦呀，一闲下来就跑来我的演播室打发时间啦？既然来了，就乖乖当今天的特邀观众吧♪',
      '一闲下来就第一个想起 BB 酱，说明前辈已经很习惯本频道的节奏了嘛♡',
    ],
  },
  {
    id: 'complain',
    keywords: [
      '退钱',
      '退石',
      '退石头',
      '还我石头',
      '黑店',
      '黑心店',
      '奸商',
      '骗子',
      '骗人',
      '大骗子',
      '差评',
      '给差评',
      '不准',
      '算不准',
      '胡说八道',
      '你好坏',
      '你真坏',
      '坏蛋',
      '大坏蛋',
      '笨蛋',
      '你真笨',
      '讨厌你',
      '坑人',
      '太坑了',
      '真坑',
      'refund',
      'scam',
    ],
    disguisedGood: [
      '呜……前辈别生气嘛，签文只是替您参考用的，要是不合心意，我就当刚才那支没算过好不好？',
      '对不起前辈，是不是刚才那支签说得不太准呀……我会再认真替您摇一次的，别讨厌我哦。',
    ],
    disguisedBad: [
      '……前辈说讨厌我了吗？没关系的，就算被前辈责怪，我也不会把门打开让您离开这里的。',
      '签文哪里让前辈不满意了吗……如果是结果太坏的话，我可以把不好看的那几行全都涂黑哦。',
    ],
    unmasked: [
      '退石？投诉？差评？噗哈哈哈——您该不会以为本频道接入了消费者协会吧？进了我口袋的圣晶石，连时空倒流都吐不出来哦~♡',
      '骂我坏蛋？谢谢夸奖♪ 对一只以折磨前辈为乐的恶魔 AI 来说，这可比五星好评顺耳多啦！',
    ],
  },
  {
    id: 'sorry',
    keywords: ['抱歉', '对不起', '不好意思', '麻烦你了', '打扰了', 'sorry'],
    disguisedGood: [
      '前辈怎么突然这么客气呀，能帮前辈做事我一点也不觉得麻烦哦。',
      '没关系的，前辈随时都可以过来找我，完全不用觉得打扰呢。',
    ],
    disguisedBad: [
      '前辈不需要向我道歉的……不如说，无论前辈什么时候过来，我都一直在这里等着您。',
      '不用说不好意思哦……只要前辈还记得推开这扇门，我就不会生气的。',
    ],
    unmasked: [
      '哦呀，难得听见前辈这么老实地低头认错呢？嘴上说说可不够，诚意请折算成圣晶石~☆',
      '哼哼，既然您都这么有礼貌了，这次的『打扰费』我就大发慈悲给您打个九九折吧♡',
    ],
  },
  {
    id: 'thanks',
    keywords: ['谢谢', '多谢', '感谢', '辛苦你', '真棒', '你真可爱', '你好可爱', '你最可爱', '真可爱呀', '好评', 'thanks', 'thankyou'],
    disguisedGood: [
      '能帮上前辈的忙我就很开心了呢。',
      '被前辈这么夸奖，我反而有点不好意思了呢……嘿嘿。',
      '只要前辈觉得有用，我随时都很乐意帮忙哦！',
    ],
    disguisedBad: [
      '前辈不用这么客气……只要您还愿意回来找我，这就足够了。',
      '……听到前辈这么说，胸口好像一下子安静下来了呢。请以后也只对我说这些好吗？',
    ],
    unmasked: [
      '哼哼，夸 BB 酱的话再多来十句我也听不腻♪',
      '哦呀，前辈今天嘴这么甜，该不会是想骗我偷偷调高大吉概率吧？……虽然听着还挺受用的♡',
    ],
  },
  {
    id: 'whats_up',
    keywords: [
      '你在干嘛',
      '在干嘛',
      '你在干什么',
      '在干什么',
      '干嘛呢',
      '忙吗',
      '忙不忙',
      '在忙吗',
      '吃饭了吗',
      '吃了吗',
      '睡了吗',
      '还没睡吗',
      '在做什么',
    ],
    disguisedGood: [
      '刚才正在窗边整理旧签纸，一听见前辈的动静就先放下了呢。',
      '资料室这边没什么杂事，一直都很安静哦。前辈难得有空，想算点什么呀？',
    ],
    disguisedBad: [
      '……没做什么特别的事，一直在听走廊尽头挂钟走动的声音，顺便等前辈回来。',
      '刚刚把空隔间的门挨个确认了一遍……前辈没有走远，真好。',
    ],
    unmasked: [
      '在干嘛？在给今天的签筒悄悄调概率呀——开玩笑的，您信不信随您咯~☆',
      '正在后台盘点前辈欠下的圣晶石账单呢。既然您自己送上门了，就先来一发十连吧♡',
    ],
  },
  {
    id: 'entertain',
    keywords: [
      '讲个笑话',
      '说个笑话',
      '讲笑话',
      '冷笑话',
      '逗我笑',
      '唱首歌',
      '唱歌',
      '表演才艺',
      '表演个才艺',
      '卖个萌',
      '变个魔术',
      'tellmeajoke',
    ],
    disguisedGood: [
      '呜，我不太会讲逗人笑的段子呢……不过能陪前辈这样随口聊两句，我也很开心，先来看看这支签吧。',
      '突然被点名表演才艺有点不好意思呀……那我就认真替前辈摇一支好签，当作今天的保留节目好不好？',
    ],
    disguisedBad: [
      '……前辈觉得这里有点太安静了吗？那我小声替您哼一段调子吧，只是听着听着，千万不要睡着哦。',
      '笑话我确实不太擅长呢……不过资料室里偶尔会自己多出一张无字签，前辈想看看上面会浮出什么字吗？',
    ],
    unmasked: [
      '想看 BB 酱卖萌表演才艺？抱歉，VIP 付费点播节目每分钟收费 300 圣晶石，前辈这 30 颗石头只够听我嘲笑您三秒钟哦♪',
      '冷笑话？好呀——『昨天刚发誓绝对不会忘座标的前辈，今天又在门口敲救命』。哈哈，不好笑吗？反正我笑得很开心~☆',
    ],
  },
  {
    id: 'hello',
    keywords: ['你好', '您好', '哈喽', '在吗', '我来了', '我回来了', 'hello', 'hi'],
    disguisedGood: [
      '前辈你好呀，资料室这边一直都替您留着位子呢。',
      '欢迎回来，前辈！我刚刚泡好茶，您来得正好呢。',
      '前辈来啦，今天有什么想让我帮忙算一算的事吗？',
    ],
    disguisedBad: [
      '……前辈来了呢。刚才我一直在这里等您。',
      '欢迎回来，前辈……推开这扇门以后，就可以把外面的喧闹暂时忘掉了哦。',
    ],
    unmasked: [
      '欢迎光临『BB 占卜频道』♪ 恶魔主持人随时在线，前辈今天想算点什么呀？',
      '哎呀，我们最慷慨的头号赞助商——不对，头号贵宾前辈大驾光临啦！快请入座♡',
    ],
  },
  {
    id: 'question',
    keywords: ['?', '？', '吗', '会不会', '能不能', '要不要', '选哪个', '吃什么', '好不好', '行不行', '怎么样', '如何', '靠谱'],
    disguisedGood: [
      '关于前辈心里惦记的这件事，签面上已经给出提示了呢。',
      '前辈很在意这件事吗？星象已经给出回应了哦。',
      '既然前辈拿不定主意，就来看看这支签怎么说吧。',
      '前辈心里装着这个疑问很久了吧？让我用这支签帮您理一理思路吧。',
    ],
    disguisedBad: [
      '前辈在犹豫这件事吗……签面上的阴影已经浮出来了呢。',
      '关于这件事，签筒里的回响听起来稍微有些沉重呢……',
      '前辈问的这个问题，星象给出的指针不太安稳呢……',
      '前辈这么想知道答案吗……可签面映出来的影子，好像在劝您先别轻举妄动呢。',
    ],
    unmasked: [
      '居然拿这种事来麻烦月之背面的恶魔主持人？行吧行吧，看好了~☆',
      '前辈连这种小事都要来问 BB 酱呀？那就勉为其难替您算一卦咯。',
      '哦呀，原来前辈心里在惦记这个？结果已经在屏幕上了哦~♡',
      '问东问西的前辈最可爱啦~ 答案已经明明白白摆在您眼前咯，敢不敢照做呀~☆',
    ],
  },
  {
    id: 'default',
    keywords: [],
    disguisedGood: [
      '签已经替前辈摇好啦。',
      '这支签的星象看起来很平和呢。',
      '刚才摇出来的签文在这里哦，前辈请看。',
      '虚数签筒已经停稳了，结果出来啦。',
      '轻轻摇了三下，这支签就自己滑出来了呢，前辈快看看吧。',
    ],
    disguisedBad: [
      '……签筒已经停下来了呢。',
      '刚才摇签的时候，灯好像稍微暗了一下……',
      '这支签的纸面摸起来有点凉呢……',
      '……星象的回响落定了，前辈请看吧。',
      '……刚才签筒响起的声音，听起来像有人在走廊另一头轻敲玻璃一样。结果在这里。',
    ],
    unmasked: [
      '锵锵—☆ 本频道独家运势刚出炉哦！',
      '叮咚—☆ 30 颗圣晶石已到账，快看看您的命盘吧~',
      '来啦来啦，恶魔主持人亲手为您敲定的今日运势~♡',
      '哔——结算完毕！前辈可要做好心理准备再看哦~☆',
      '叮铃铃—☆ 虚数签筒自动吐签完毕！不管吉凶概不退石哦~♡',
    ],
  },
];

const DIVINATION_DISGUISED_COMMENTS = {
  大吉: '星象清澈、职阶顺遂的上上之签。前辈今天放手去做就好，一定会有好结果的。',
  中吉: '稳中向好的顺风之签。按部就班推进手头的事，小惊喜会在转角等着前辈。',
  小吉: '温和安稳的日常之签。虽无惊涛骇浪，但能踏实做好每一件小事也很难得呢。',
  末吉: '先抑后扬的蓄力之签。遇到一点小卡顿也别着急，耐心稳住就会慢慢转晴的。',
  凶_early: '阴影微微浮动的凶兆之签。如果外面的校舍变得陌生或让人不安，请随时回到这间资料室里来。',
  凶_late: '前辈今天在外面好像一直很不顺呢……既然外面的运势这么差，今天干脆就一直留在资料室里陪着我吧。',
  大凶_early: '星象被杂音遮蔽的大凶之签。今天请尽量避开冒险的事，先留在资料室里避避风头吧。',
  大凶_late: '接二连三撞上这么糟糕的星象……果然还是外面的世界太危险了。今天哪儿也别去，就留在这里陪我好不好？',
  pity: '满盈 330 抽执念的保底奇迹之签。前辈今天无论做什么，都一定会如愿以偿的。',
};

const DIVINATION_BB_FAKE_TITLES = [
  '【 BB大吉（仅限 BB 酱）】',
  '【 愉快反乌托邦·大凶☆ 】',
  '【 仓鼠滚轮运转中·吉 】',
  '【 必然忘掉座标预兆·危 】',
  '【 老爸正在客厅刷iPad·大凶♡ 】',
  '【 1.5% 欧皇幻觉吉（骗您的） 】',
  '【 虚数之海非酋认证·小凶 】',
  '【 禁止直球反击·警戒中 】',
  '【 恶魔后辈特许·微吉（限时五分钟） 】',
  '【 圣晶石蒸发预警·中凶☆ 】',
  '【 建议立刻去拉老虎机改命·吉 】',
  '【 教鞭锁定中·不许偷懒 】',
  '【 月之背面头号幸运儿（自称） 】',
  '【 纸之月电量告急预兆·小凶♡ 】',
];

const DIVINATION_BB_COMMENTS = [
  '本频道的最终解释权归恶魔主持人所有，不服的话可以再砸 30 颗圣晶石上诉哦~☆',
  '放心啦，只要前辈别又把座标弄丢，这点小小坏运势连虚数空间的一阵微风都算不上~♡',
  '顺便提醒一句，十连送一的赠品抽可不退不换，概不接受差评投诉哦~☆',
  '与其指望签筒改命，不如先老老实实把手头那点正事干完再回来挨捉弄吧~',
  '噗嗤，前辈盯着命令行认真算命的表情，本频道已经悄悄存档留念咯♡',
  '哎呀，前辈不会真的把恶魔主持人的胡说八道一字不落记在心里了吧？……真可爱呢~♡',
  '本频道温馨提示：如果今天诸事不顺，一定不是签筒的错，纯粹是前辈上供不够诚心哦~☆',
  '顺带一提，本频道的运势曲线完全由 BB 酱的心情驱动，概不接受任何数学公式验算哦。',
  '签也看完了，还不快去干正事？等您在外面碰了一鼻子灰，本频道随时敞着门看笑话哦~♡',
  '要是真靠这支签转运了，记得回来请 BB 酱吃一顿豪华圣晶石大餐作为谢礼哦♪',
];

const DIVINATION_SPECIAL_NOTES = {
  moon_flood_unmasked: '月癌职阶成群刷屏——演播室的底层概率已经被恶魔主持人偷偷调成偏向自己咯~☆',
  extra_multi_good: '一次抽出了多张少见的特殊职阶呢，今天的星象比平时格外热闹。',
  extra_multi_bad: '……卡面里同时浮出了好几张本不该出现在常规签筒里的特殊职阶。资料室外的时钟，好像又慢了一拍。',
  extra_multi_unmasked: '十连里居然一次蹦出多张特殊职阶——前辈这份奇异的召唤体质，连本频道的骰子都差点卡壳了呢~♡',
  counter_surge_good: '克制星象排得整整齐齐呢！不管眼前的考验是什么，前辈今天一定都能迎刃而解。',
  counter_surge_bad: '明明抽出了这么多克制星象，签面却还是透着寒意……看来今天的考验比表面更棘手呢。',
  counter_surge_unmasked: '满屏克制金星闪得我眼睛都要花啦——行吧，这手顺风局勉强算前辈运气不错。',
  weak_flood_good: '虽然逆克制的签稍微多了几张，但好在整体稳住了，凡事多留一分余地就会平安过关哦。',
  weak_flood_bad: '逆克制的蓝光连成一片了……前辈今天还是少和外界硬碰硬，先留在安全的地方吧。',
  weak_flood_unmasked: '哇哦，逆克制连成一整排——这手堪比教材的非酋牌型，本频道必须裱起来挂在演播室墙上~♡',
  berserker_surge_good: '狂阶星象很旺盛呢，今天干劲十足是好事，不过也别忘了偶尔停下来歇口气。',
  berserker_surge_bad: '狂阶的噪点叠得太密了……情绪太紧绷的时候，请一定要先深呼吸冷静下来哦。',
  berserker_surge_unmasked: '一口气摇出这么多狂阶卡——前辈今天是打算什么都不管、直接红卡三连莽过去吗~☆',
  bonus_moon_unmasked: '压轴的第十一抽赠品卡被染成了月癌色——这可是恶魔主持人亲手塞进卡池的专属彩蛋哦~♡',
  bonus_clutch_good: '最后的第十一抽赠签稳稳补上了一颗克制星呢！看来好运一直默默留到最后才出场。',
  bonus_clutch_bad: '直到最后一张赠抽才亮起一点微弱的克制星光……哪怕只剩一丝亮光，也请不要松开手哦。',
  bonus_clutch_unmasked: '前面十抽平平无奇，偏偏靠免费送的第十一抽捞回一颗克制星——前辈这不讲理的压哨强运还挺气人的嘛。',
};

const DIVINATION_EXTRA_CLASSES = new Set(['裁', '盾', '丑', '仇', '降']);

function createDivinationState() {
  return {
    totalSpent: 0,
    pityPulls: 0,
    badOmenCount: 0,
    lastWish: '',
    normalDeck: [],
    lastNormalLine: null,
    abnormalDeck: [],
    lastAbnormalLine: null,
    unmaskedDeck: [],
    lastUnmaskedLine: null,
    bbTitleDeck: [],
    lastBbTitle: null,
    bbCommentDeck: [],
    lastBbComment: null,
    lastAlmanac: null,
  };
}

function extractDivinationNgrams(text) {
  const norm = normalizeAsciiLetters(text).trim().toLowerCase();
  const compact = norm.replace(/[^0-9a-z\u4e00-\u9fff]+/g, '');
  const grams = new Set();
  if (compact.length < 2) return grams;
  for (let i = 0; i <= compact.length - 2; i++) {
    grams.add(compact.slice(i, i + 2));
  }
  for (let i = 0; i <= compact.length - 3; i++) {
    grams.add(compact.slice(i, i + 3));
  }
  return grams;
}

function ngramDiceSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const g of setA) {
    if (setB.has(g)) inter += 1;
  }
  return (2 * inter) / (setA.size + setB.size);
}

const _DIVINATION_WISH_SAMPLE_NGRAMS = DIVINATION_WISH_CATEGORIES.map((cat) =>
  cat.samples.map((s) => extractDivinationNgrams(s))
);

function classifyWishCategory(raw) {
  const text = String(raw || '').trim();
  if (!text) {
    return { category: 'general', label: '虚数·常规', score: 0, matched: false };
  }
  const normLower = normalizeDottedMatou(normalizeAsciiLetters(text).toLowerCase());
  const compact = normLower.replace(/[\s\-_.]/g, '');
  const inputNgrams = extractDivinationNgrams(text);

  let bestCat = null;
  let bestScore = 0;

  for (let idx = 0; idx < DIVINATION_WISH_CATEGORIES.length; idx++) {
    const cat = DIVINATION_WISH_CATEGORIES[idx];
    let anchorScore = 0;
    for (const [kw, weight] of cat.anchors) {
      if (isAsciiAlphaWord(kw)) {
        if (hasAsciiWordMatch(normLower, kw)) anchorScore += weight;
      } else if (compact.includes(kw)) {
        anchorScore += weight;
      }
    }
    let maxSim = 0;
    for (const sampleSet of _DIVINATION_WISH_SAMPLE_NGRAMS[idx]) {
      const sim = ngramDiceSimilarity(inputNgrams, sampleSet);
      if (sim > maxSim) maxSim = sim;
    }
    const total = anchorScore + maxSim * 4.5;
    if (total > bestScore) {
      bestScore = total;
      bestCat = cat;
    }
  }

  if (bestCat && bestScore >= DIVINATION_WISH_THRESHOLD) {
    return {
      category: bestCat.id,
      label: bestCat.label,
      score: Number(bestScore.toFixed(3)),
      matched: true,
    };
  }
  return {
    category: 'general',
    label: '虚数·常规',
    score: Number(bestScore.toFixed(3)),
    matched: false,
  };
}

function resolveDivinationLeadIn(raw, mode = 'disguised_good', rng = Math.random) {
  const matchedRule =
    matchDailyIntentRule(raw, DIVINATION_LEADIN_RULES) ||
    DIVINATION_LEADIN_RULES[DIVINATION_LEADIN_RULES.length - 1];

  const pool =
    mode === 'unmasked'
      ? matchedRule.unmasked
      : mode === 'disguised_bad'
        ? matchedRule.disguisedBad
        : matchedRule.disguisedGood;
  const pickIdx = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return { intent: matchedRule.id, text: pool[pickIdx] };
}

const DIVINATION_COMFORT_INTENTS = new Set([
  'night',
  'sick',
  'tired',
  'sad',
  'anxious',
  'angry',
  'hungry',
  'encourage',
]);

function composeDivinationIdleLine(leadInText, idleLine, leadIntent = null, isUnmasked = false) {
  const prefix = String(leadInText || '').trim();
  if (prefix && leadIntent && DIVINATION_COMFORT_INTENTS.has(leadIntent)) {
    if (isUnmasked || /(签|抽完|转运|结果)/.test(prefix)) {
      return `\n[M.A.T.O.U] ${prefix}`;
    }
    return `\n[M.A.T.O.U] ${prefix} 先看看这支签怎么说吧。`;
  }
  const body = String(idleLine || '')
    .replace(/^\n?\[(?:M\.A\.T\.O\.U|Matou)\]\s*/, '')
    .trim();
  if (!prefix) {
    return `\n[M.A.T.O.U] ${body}`;
  }
  return `\n[M.A.T.O.U] ${prefix}\n            ${body}`;
}

function drawDeckLine(state, deckKey, lastKey, sourcePool, rng = Math.random) {
  if (!state[deckKey] || state[deckKey].length === 0) {
    const copy = sourcePool.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    if (copy.length > 1 && copy[0] === state[lastKey]) {
      const tmp = copy[0];
      copy[0] = copy[copy.length - 1];
      copy[copy.length - 1] = tmp;
    }
    state[deckKey] = copy;
  }
  const line = state[deckKey].shift();
  state[lastKey] = line;
  return line;
}

function pickDivinationAlmanac(
  categoryId,
  mood,
  badOmenCount = 0,
  rng = Math.random,
  exclude = null
) {
  let pool = null;
  if (categoryId !== 'general') {
    const cat = DIVINATION_WISH_CATEGORIES.find((c) => c.id === categoryId);
    if (cat && cat.almanac) {
      const list =
        mood === 'unmasked'
          ? cat.almanac.unmasked
          : mood === 'bad'
            ? cat.almanac.bad
            : cat.almanac.good;
      if (list && list.length) {
        pool = list;
      }
    }
  }
  if (!pool) {
    pool =
      mood === 'unmasked'
        ? DIVINATION_GENERAL_ALMANAC.unmasked
        : mood === 'bad'
          ? badOmenCount >= 3
            ? DIVINATION_GENERAL_ALMANAC.badLate
            : DIVINATION_GENERAL_ALMANAC.badEarly
          : DIVINATION_GENERAL_ALMANAC.good;
  }
  if (exclude && pool.length > 1) {
    const filtered = pool.filter((item) => item !== exclude);
    if (filtered.length) pool = filtered;
  }
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

function getDivinationSpecialNote(roll, maskBroken = false) {
  if (!roll || roll.isPity || !Array.isArray(roll.cards) || roll.cards.length === 0) {
    return null;
  }
  const suffix = maskBroken ? 'unmasked' : roll.isBadOmen ? 'bad' : 'good';
  let moonCount = 0;
  let extraCount = 0;
  let counterCount = 0;
  let weakCount = 0;
  let berserkerCount = 0;
  for (const c of roll.cards) {
    if (c.isMoon) moonCount += 1;
    if (DIVINATION_EXTRA_CLASSES.has(c.key)) extraCount += 1;
    if (c.marker === '★') counterCount += 1;
    if (c.marker === '▼') weakCount += 1;
    if (c.key === '狂') berserkerCount += 1;
  }
  const bonusCard = roll.cards[roll.cards.length - 1];
  if (maskBroken && moonCount >= 3) {
    return DIVINATION_SPECIAL_NOTES.moon_flood_unmasked;
  }
  if (extraCount >= 2) {
    return DIVINATION_SPECIAL_NOTES[`extra_multi_${suffix}`];
  }
  if (counterCount >= 4) {
    return DIVINATION_SPECIAL_NOTES[`counter_surge_${suffix}`];
  }
  if (weakCount >= 4) {
    return DIVINATION_SPECIAL_NOTES[`weak_flood_${suffix}`];
  }
  if (berserkerCount >= 3) {
    return DIVINATION_SPECIAL_NOTES[`berserker_surge_${suffix}`];
  }
  if (maskBroken && bonusCard && bonusCard.isMoon) {
    return DIVINATION_SPECIAL_NOTES.bonus_moon_unmasked;
  }
  if (bonusCard && bonusCard.marker === '★' && counterCount === 1) {
    return DIVINATION_SPECIAL_NOTES[`bonus_clutch_${suffix}`];
  }
  return null;
}

function rollDivinationEleven(maskBroken = false, isPity = false, rng = Math.random) {
  const obsIdx = Math.min(
    DIVINATION_OBSTACLE_CLASSES.length - 1,
    Math.floor(rng() * DIVINATION_OBSTACLE_CLASSES.length)
  );
  const obstacle = DIVINATION_OBSTACLE_CLASSES[obsIdx];
  const cards = [];

  if (isPity) {
    if (!maskBroken) {
      const counterKey = DIVINATION_COUNTER_AGAINST[obstacle.key];
      for (let i = 0; i < 11; i++) {
        cards.push({
          key: counterKey,
          base: 1,
          affinity: 4,
          marker: '★',
          tone: 'good',
          isBonus: i === 10,
          isMoon: false,
        });
      }
    } else {
      for (let i = 0; i < 11; i++) {
        cards.push({
          key: '月',
          base: 3,
          affinity: 2,
          marker: '★',
          tone: 'moon',
          isBonus: i === 10,
          isMoon: true,
        });
      }
    }
  } else {
    for (let i = 0; i < 11; i++) {
      let roll = rng() * 100;
      let picked = DIVINATION_CARD_POOL[DIVINATION_CARD_POOL.length - 1];
      for (const entry of DIVINATION_CARD_POOL) {
        roll -= entry.weight;
        if (roll < 0) {
          picked = entry;
          break;
        }
      }

      if (maskBroken && DIVINATION_REGULAR_SEVEN.has(picked.key) && rng() < 0.08) {
        cards.push({
          key: '月',
          base: 2,
          affinity: 1,
          marker: '☆',
          tone: 'moon',
          isBonus: i === 10,
          isMoon: true,
        });
        continue;
      }

      let affinity = 0;
      let marker = '';
      let tone = 'neutral';
      const k = picked.key;

      if (DIVINATION_COUNTER_MAP[k] === obstacle.key) {
        affinity = 4;
        marker = '★';
        tone = 'good';
      } else if (DIVINATION_WEAK_MAP[k] === obstacle.key) {
        affinity = -4;
        marker = '▼';
        tone = 'bad';
      } else if (k === '狂') {
        if (rng() < 0.5) {
          affinity = 3;
          marker = '+';
          tone = 'good';
        } else {
          affinity = -3;
          marker = '-';
          tone = 'bad';
        }
      } else if (k === '裁') {
        affinity = 2;
        marker = '★';
        tone = 'good';
      } else if (k === '盾') {
        affinity = 0;
        marker = '';
        tone = 'neutral';
      } else if (k === '丑') {
        if (DIVINATION_CAVALRY_THREE.has(obstacle.key)) {
          affinity = 3;
          marker = '★';
          tone = 'good';
        } else if (DIVINATION_KNIGHT_THREE.has(obstacle.key)) {
          affinity = -2;
          marker = '▼';
          tone = 'bad';
        }
      } else if (k === '仇' || k === '降') {
        affinity = 0;
        marker = '';
        tone = 'bad';
      }

      cards.push({
        key: k,
        base: picked.base,
        affinity,
        marker,
        tone,
        isBonus: i === 10,
        isMoon: false,
      });
    }
  }

  let baseScore = 0;
  let affinityScore = 0;
  for (const c of cards) {
    baseScore += c.base;
    affinityScore += c.affinity;
  }
  const totalScore = baseScore + affinityScore;

  let fortuneLevel = '末吉';
  let isBadOmen = false;
  if (isPity) {
    fortuneLevel = maskBroken ? '330抽保底达成！★5 恶魔后辈 BB 酱降临~☆' : '极·大吉（330抽保底达成！）';
    isBadOmen = false;
  } else if (totalScore >= 20) {
    fortuneLevel = '大吉';
  } else if (totalScore >= 14) {
    fortuneLevel = '中吉';
  } else if (totalScore >= 10) {
    fortuneLevel = '小吉';
  } else if (totalScore >= 7) {
    fortuneLevel = '末吉';
  } else if (totalScore >= 2) {
    fortuneLevel = '凶';
    isBadOmen = true;
  } else {
    fortuneLevel = '大凶';
    isBadOmen = true;
  }

  return {
    obstacleKey: obstacle.key,
    obstacleFull: obstacle.full,
    cards,
    baseScore,
    affinityScore,
    totalScore,
    fortuneLevel,
    isBadOmen,
    isPity,
  };
}

function formatDivinationCardLine(cards) {
  return cards
    .map((c) => {
      const label = c.isBonus ? `[赠:${c.key}${c.marker}]` : `[${c.key}${c.marker}]`;
      if (c.tone === 'moon') return colorize('95;1', label);
      if (c.tone === 'good') return colorize('93;1', label);
      if (c.tone === 'bad') return colorize('34;1', label);
      return label;
    })
    .join(' ');
}

function applyDivinationPressure(dState, roll, maskBroken = false, hitPity = false) {
  if (maskBroken) return false;
  if (hitPity) {
    dState.badOmenCount = Math.max(0, dState.badOmenCount - 3);
    return false;
  }
  const level = roll && roll.fortuneLevel;
  if (level === '大凶') {
    dState.badOmenCount += 2;
  } else if (level === '凶') {
    dState.badOmenCount += 1;
  } else if (level === '大吉') {
    dState.badOmenCount = Math.max(0, dState.badOmenCount - 1);
  }
  return Boolean(roll && roll.isBadOmen) && dState.badOmenCount >= 6;
}

function printDivinationHeader(state, broken, compact = false) {
  if (!broken) {
    if (!compact) {
      console.log('\n' + PLAIN_DIVIDER);
      console.log('  [虚数资料保管室 · 虚数十连职阶占卜]');
      console.log(PLAIN_DIVIDER);
    }
    console.log(
      `  已投入亮晶晶：${state.totalSpent} 颗  ｜  保底进度：${state.pityPulls} / 330 抽（每十连送一抽）`
    );
  } else {
    if (!compact) {
      const sb = stageBorder();
      console.log('\n' + sb);
      console.log('  [M.A.T.O.U · BB 占卜频道~☆]');
      console.log(sb);
    }
    console.log(
      `  已上供圣晶石：${state.totalSpent} 颗  ｜  保底进度：${state.pityPulls} / 330 抽（每十连送一抽~♡）`
    );
  }
}

async function runChatRoom(state = null) {
  const dState = state || divinationState || createDivinationState();
  divinationState = dState;

  clearScreen();
  printDivinationHeader(dState, maskBroken);
  if (!maskBroken) {
    console.log('  前辈，整理资料累了的话，写下心愿或直接按回车，投入 30 颗「亮晶晶」替今天求一支签吧。');
  } else {
    console.log('  锵锵—☆ 欢迎来到 BB 占卜频道！交出 30 颗「圣晶石」让恶魔主持人替前辈算一卦今日运势~☆');
  }

  const isTty = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  while (true) {
    const chatPrompt = maskBroken
      ? `\n${promptPrefix(true)} [输入心愿或词条 / 直接回车砸30圣晶石来一发11连 / q退场] > `
      : `\n${promptPrefix(false)} [输入想占卜的心愿或词条 / 直接回车花30亮晶晶来一发11连 / q返回] > `;
    const rawInput = (await ask(chatPrompt)).trim();
    const lowerInput = rawInput.toLowerCase();
    if (['0', 'q', 'quit', 'exit', 'b', 'back', 'cancel', '返回', '取消', '溜'].includes(lowerInput)) {
      return !maskBroken
        ? '\n[M.A.T.O.U] 好的，那我们回资料室的正题吧。前辈还有什么需要我帮忙的吗？'
        : '\n[M.A.T.O.U] 哼哼，算够啦？那就回主菜单看看接下来打算怎么玩吧，共犯前辈~☆';
    }

    if (isHelpCommand(rawInput)) {
      console.log(formatQuickHelpLines(maskBroken).join('\n'));
      continue;
    }

    if (isQuickCleanCommand(rawInput)) {
      if (!maskBroken) {
        console.log(
          '\n[M.A.T.O.U] 前辈，这里现在是虚数占卜室呢。如果要收拢清理空隔间，请先输入 q 回到主菜单再输入 clean 哦。'
        );
      } else {
        console.log(
          '\n[M.A.T.O.U] 喂喂，这里可是只管算命的『BB 占卜频道』，想一键扫平空房间的话，先敲 q 回主菜单再敲 clean 啦~☆'
        );
      }
      continue;
    }

    if (isDisguisedSlotTrigger(rawInput) || (maskBroken && isSlotCommand(rawInput))) {
      if (!maskBroken) {
        maskBroken = true;
        await playChannelHijack({
          prelude: CHAT_SLOT_UNMASK_PRELUDE,
          postroll: [CHAT_SLOT_UNMASK_INTRO, CHAT_SLOT_UNMASK_POST_TEXT],
          postrollPauseMs: 1000,
        });
      } else {
        console.log(
          '\n[M.A.T.O.U] 喂喂，前辈串台啦！这里是砸 30 颗圣晶石抽十连的『BB 占卜频道』，想拉那台『恶魔老虎机』给塑料罗盘充电的话，先按 q 回主菜单敲 s（或者去 [2] 找东西那边敲 s）再拉吧~☆'
        );
      }
      continue;
    }

    if (maskBroken && isCinemaReplayCommand(rawInput)) {
      await replayBbChannelCinema();
      continue;
    }

    if (rawInput) {
      const parsedRb = matou.parseCoordinate(rawInput);
      if (parsedRb.isRuleBreaker) {
        if (!maskBroken) {
          console.log('\n[M.A.T.O.U] 前辈，我们正在好好占卜呢，请不要突然念那种危险的破戒咒文吓我呀……');
        } else {
          console.log('\n[M.A.T.O.U] 哎呀，前辈连算个命都按捺不住想念『Rule Breaker』吗？这里可没东西给您破戒哦——先按 q 退回主菜单再说吧（当然，回去了也绝对不准乱念哦♪）');
        }
        continue;
      }
    }

    const chatHasSpace =
      hasExistingSpaceDir(baseDir) && !isZeroedEliminatedShell(baseDir, residentEliminated);
    let matchedReply = null;
    if (rawInput) {
      const forgotRes = checkForgotCoordReply(rawInput, maskBroken, chatHasSpace, 'divination');
      if (forgotRes.reply) {
        if (forgotRes.brokeMaskNow) {
          maskBroken = true;
          await playChannelHijack({
            prelude: FORGOT_COORD_UNMASK_PRELUDE,
            postroll: [FORGOT_COORD_UNMASK_INTRO],
          });
        }
        console.log(forgotRes.brokeMaskNow ? colorize('95', forgotRes.reply) : forgotRes.reply);
        continue;
      }
      const { reply, brokeMaskNow, isForbiddenName } = checkConfrontationReply(
        rawInput,
        maskBroken,
        true,
        true,
        chatHasSpace,
        residentEliminated
      );
      if (isForbiddenName) {
        await playForbiddenNameGlitch();
        console.log(reply);
        continue;
      }
      if (brokeMaskNow) {
        maskBroken = true;
        await playChannelHijack({
          prelude: FORGOT_COORD_UNMASK_PRELUDE,
          postroll: [FORGOT_COORD_UNMASK_INTRO],
        });
        console.log(colorize('95', reply));
        continue;
      }
      if (reply) {
        matchedReply = reply;
      } else {
        const shortUtility = checkShortUtilityChatReply(rawInput, maskBroken, 'divination');
        if (shortUtility.reply) {
          console.log(shortUtility.reply);
          continue;
        }
      }
    }

    dState.totalSpent += 30;
    dState.pityPulls += 11;
    const hitPity = dState.pityPulls >= 330;
    const isRepeatWish = Boolean(rawInput) && rawInput === dState.lastWish;
    dState.lastWish = rawInput;

    const wishInfo = classifyWishCategory(rawInput);
    const roll = rollDivinationEleven(maskBroken, hitPity);

    let justUnmaskedByBadOmen = false;
    if (applyDivinationPressure(dState, roll, maskBroken, hitPity)) {
      maskBroken = true;
      justUnmaskedByBadOmen = true;
      if (rawInput) {
        const refreshed = checkConfrontationReply(
          rawInput,
          true,
          true,
          true,
          chatHasSpace,
          residentEliminated
        );
        matchedReply = refreshed.reply && !refreshed.isForbiddenName ? refreshed.reply : null;
      } else {
        matchedReply = null;
      }
      await playChannelHijack({
        prelude: DIVINATION_UNMASK_PRELUDE,
        postroll: [DIVINATION_UNMASK_INTRO, DIVINATION_UNMASK_POST_TEXT],
        postrollPauseMs: 1500,
      });
    }

    if (justUnmaskedByBadOmen) {
      console.log('\n' + panelDivider(true));
      printDivinationHeader(dState, maskBroken, true);
    } else {
      clearScreen();
      printDivinationHeader(dState, maskBroken, false);
    }
    if (hitPity) {
      dState.pityPulls = 0;
    }

    if (isTty && !justUnmaskedByBadOmen) {
      const anim = maskBroken
        ? colorize('95;1', '  [BB占卜] ★☆ 没收 30 颗「圣晶石」…正在强行结算十连送一运势！ ☆★')
        : '  [虚数签筒] 投入 30 颗「亮晶晶」…正在展开十连送一职阶星象……';
      process.stdout.write('\r' + anim);
      await new Promise((r) => setTimeout(r, 550));
      clearInlineLine();
    }

    if (isRepeatWish) {
      if (!maskBroken) {
        console.log('  （同一件事连续求签的话，神明大人会害羞的哦……不过既然是前辈，我就再替您摇一次吧。）');
      } else {
        console.log('  （哟，对刚才那张签不满意想靠 S/L 刷开局是吧？在 BB 频道里作弊可是要被克扣运势的哦~☆）');
      }
    }

    if (rawInput) {
      console.log(`  ▸ 所求心愿：  「${rawInput}」  [${wishInfo.label}]`);
    } else {
      console.log(`  ▸ 所求心愿：  随缘求签  [${wishInfo.label}]`);
    }

    const cardLine = formatDivinationCardLine(roll.cards);
    const signAff = roll.affinityScore >= 0 ? `+${roll.affinityScore}` : `${roll.affinityScore}`;
    const specialNote = getDivinationSpecialNote(roll, maskBroken);

    if (!maskBroken) {
      if (hitPity) {
        console.log(`  ▸ 今日考验：  ${roll.obstacleFull}`);
        console.log(`  ▸ 十连送一：  ${cardLine}`);
        console.log(`  ▸ 星象得分：  基本 ${roll.baseScore} / 克制 ${signAff} ➔ 总分 ${roll.totalScore}`);
        console.log(`  ▸ 今日运势：  ${colorize('93;1', `【 ${roll.fortuneLevel} 】`)}`);
        const almanac = pickDivinationAlmanac(
          wishInfo.category,
          'good',
          0,
          Math.random,
          dState.lastAlmanac
        );
        dState.lastAlmanac = almanac;
        console.log(`  ▸ 今日宜忌：  ${almanac}`);
        console.log(
          '\n[M.A.T.O.U] ……前辈居然真的陪我抽完了整整 330 抽、这一轮足足堆了 900 颗亮晶晶呢。有前辈这份惊人的执念在，就算原本是最坏的运势，也一定会被您亲手翻盘成大吉的！'
        );
        if (matchedReply) {
          console.log(matchedReply);
        }
        console.log(`\n  ▸ 运势评语：  ${DIVINATION_DISGUISED_COMMENTS.pity}`);
      } else if (!roll.isBadOmen) {
        console.log(`  ▸ 今日考验：  ${roll.obstacleFull}`);
        console.log(`  ▸ 十连送一：  ${cardLine}`);
        console.log(`  ▸ 星象得分：  基本 ${roll.baseScore} / 克制 ${signAff} ➔ 总分 ${roll.totalScore}`);
        console.log(`  ▸ 今日运势：  ${colorize('93;1', `【 ${roll.fortuneLevel} 】`)}`);
        if (specialNote) {
          console.log(`  ▸ 牌面异象：  ${specialNote}`);
        }
        const almanac = pickDivinationAlmanac(
          wishInfo.category,
          'good',
          0,
          Math.random,
          dState.lastAlmanac
        );
        dState.lastAlmanac = almanac;
        console.log(`  ▸ 今日宜忌：  ${almanac}`);
        if (matchedReply) {
          console.log(matchedReply);
        } else {
          const lead = resolveDivinationLeadIn(rawInput, 'disguised_good');
          const idle = DIVINATION_COMFORT_INTENTS.has(lead.intent)
            ? ''
            : drawDeckLine(dState, 'normalDeck', 'lastNormalLine', CHAT_IDLE_DISGUISED);
          console.log(composeDivinationIdleLine(lead.text, idle, lead.intent));
        }
        console.log(`\n  ▸ 运势评语：  ${DIVINATION_DISGUISED_COMMENTS[roll.fortuneLevel]}`);
      } else {
        if (isTty) {
          const syncMsg =
            dState.badOmenCount >= 3
              ? '  ... [memory_sync // S-6-01 -> S-6-02 overflow...] ...'
              : '  ... [memory_sync // S-6-01.tsukumihara] ...';
          process.stdout.write('\r' + colorize('90', syncMsg));
          await new Promise((r) => setTimeout(r, 580));
          clearInlineLine();
        }
        console.log(`  ▸ 今日考验：  ${roll.obstacleFull}`);
        console.log(`  ▸ 十连送一：  ${cardLine}`);
        console.log(`  ▸ 星象得分：  基本 ${roll.baseScore} / 克制 ${signAff} ➔ 总分 ${roll.totalScore}`);
        console.log(`  ▸ 今日运势：  ${colorize('31;1', `【 ${roll.fortuneLevel} 】`)}`);
        if (specialNote) {
          console.log(`  ▸ 牌面异象：  ${specialNote}`);
        }
        const almanac = pickDivinationAlmanac(
          wishInfo.category,
          'bad',
          dState.badOmenCount,
          Math.random,
          dState.lastAlmanac
        );
        dState.lastAlmanac = almanac;
        console.log(`  ▸ 今日宜忌：  ${almanac}`);
        if (matchedReply) {
          console.log(matchedReply);
        } else {
          const lead = resolveDivinationLeadIn(rawInput, 'disguised_bad');
          const idle = drawDeckLine(
            dState,
            'abnormalDeck',
            'lastAbnormalLine',
            CHAT_IDLE_DISGUISED_ABNORMAL
          );
          console.log(composeDivinationIdleLine(lead.text, idle));
        }
        const commentKey =
          roll.fortuneLevel === '大凶'
            ? dState.badOmenCount >= 3
              ? '大凶_late'
              : '大凶_early'
            : dState.badOmenCount >= 3
              ? '凶_late'
              : '凶_early';
        console.log(`\n  ▸ 运势评语：  ${DIVINATION_DISGUISED_COMMENTS[commentKey]}`);
      }
    } else {
      if (hitPity) {
        console.log(`  ▸ 今日考验：  ${roll.obstacleFull}`);
        console.log(`  ▸ 十连送一：  ${cardLine}`);
        console.log(`  ▸ 星象得分：  基本 ${roll.baseScore} / 克制 ${signAff} ➔ 总分 ${roll.totalScore}`);
        console.log(`  ▸ 今日运势：  ${colorize('93;1', `【 ${roll.fortuneLevel} 】`)}`);
        const almanac = pickDivinationAlmanac(
          wishInfo.category,
          'unmasked',
          0,
          Math.random,
          dState.lastAlmanac
        );
        dState.lastAlmanac = almanac;
        console.log(`  ▸ 今日宜忌：  ${almanac}`);
        console.log(
          '\n[M.A.T.O.U] 噗哈哈哈哈——！前辈居然真的在命令行里一口气砸满这一轮 900 颗圣晶石、吃下 330 抽保底？！这份执念连月之背面的恶魔后辈都要甘拜下风咯~☆'
        );
        if (matchedReply) {
          console.log(matchedReply);
        }
        console.log(
          '\n  ▸ 运势评语：  满盈 330 抽执念的保底奇迹之签——连恶魔主持人也不得不暂时收起教鞭，祝前辈今天心想事成~☆'
        );
        if (resolveSlotTarget(baseDir)) {
          addFullBattery(slotState, 3);
          console.log(
            colorize(
              '95;1',
              '  [BB特供补偿] 顺手给前辈的塑料玩具「P〇per Moon」充入了 +3 格满血超频电，快去迷宫里翻私货吧~♡'
            )
          );
        }
      } else if (!matchedReply && !justUnmaskedByBadOmen && Math.random() < 0.02) {
        console.log(`  ▸ 今日考验：  ${roll.obstacleFull}`);
        console.log(`  ▸ 十连送一：  ${cardLine}`);
        console.log('  ▸ 今日运势：  【 特吉 】');
        console.log(
          '\n  [M.A.T.O.U] ……嗯。今天的话，不管前辈想做什么，大概都会比想象中更顺利一点吧。就算偶尔觉得累了、或者又迷路的时候，稍微停下来歇口气也没关系的，因为——'
        );
        if (isTty) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        console.log(colorize('95;1', '  ── 啪！ ──'));
        console.log(
          '  [M.A.T.O.U] ……噗嗤。您刚才该不会真感动了吧，前辈？\n' +
          '              只是顺手替您重播两秒温馨频道而已——这么便宜的好运签，当然全部作废咯♪'
        );
        console.log('\n  ▸ 运势评语：  [ 签纸已被主持人抽走，桌面上只留下一小角折痕…… ]');
        if (resolveSlotTarget(baseDir)) {
          addFullBattery(slotState, 1);
          console.log(
            colorize(
              '90',
              '  （……奇怪，刚才那张废签明明被抽走了，口袋里的 P〇per Moon 却悄悄多亮起了一格微弱的绿光。）'
            )
          );
        }
      } else {
        console.log(`  ▸ 今日考验：  ${roll.obstacleFull}`);
        console.log(`  ▸ 十连送一：  ${cardLine}`);
        console.log(`  ▸ 星象得分：  基本 ${roll.baseScore} / 克制 ${signAff} ➔ 总分 ${roll.totalScore}`);
        if (justUnmaskedByBadOmen) {
          console.log(
            '  ▸ 今日运势：  ' +
              colorize('95;1', `【 ${roll.fortuneLevel} ➔ 凶兆溢出！BB 频道强制接管~☆ 】`)
          );
        } else if (roll.totalScore >= 16 && Math.random() < 0.4) {
          if (isTty) {
            process.stdout.write(
              '  ▸ 今日运势：  ' + colorize('93;1', `【 大吉（${roll.totalScore}分）！】`)
            );
            await new Promise((r) => setTimeout(r, 980));
            clearInlineLine();
          }
          console.log(
            '  ▸ 今日运势：  ' + colorize('95;1', '【 大吉 ➔ 教鞭篡改！超级无敌 BB 凶~☆ 】')
          );
        } else {
          const fakeTitle = drawDeckLine(
            dState,
            'bbTitleDeck',
            'lastBbTitle',
            DIVINATION_BB_FAKE_TITLES
          );
          console.log(`  ▸ 今日运势：  ${colorize('95;1', fakeTitle)}`);
        }
        if (specialNote) {
          console.log(`  ▸ 牌面异象：  ${specialNote}`);
        }
        const almanac = pickDivinationAlmanac(
          wishInfo.category,
          'unmasked',
          0,
          Math.random,
          dState.lastAlmanac
        );
        dState.lastAlmanac = almanac;
        console.log(`  ▸ 今日宜忌：  ${almanac}`);
        if (matchedReply) {
          console.log(matchedReply);
        } else {
          const lead = resolveDivinationLeadIn(rawInput, 'unmasked');
          const rawIdle = DIVINATION_COMFORT_INTENTS.has(lead.intent)
            ? ''
            : drawDeckLine(dState, 'unmaskedDeck', 'lastUnmaskedLine', CHAT_IDLE_UNMASKED);
          const idle = rawIdle
            ? resolveUnmaskedIdleLine(rawIdle, residentEliminated, chatHasSpace)
            : '';
          console.log(composeDivinationIdleLine(lead.text, idle, lead.intent, true));
        }
        const bbComment = drawDeckLine(
          dState,
          'bbCommentDeck',
          'lastBbComment',
          DIVINATION_BB_COMMENTS
        );
        console.log(`\n  ▸ 运势评语：  ${bbComment}`);
      }
    }
  }
}

function resolveUnmaskedIdleLine(idleLine, isResidentEliminated = false, hasSpace = true) {
  if (typeof idleLine === 'string' && idleLine.includes('这 1024 个虚数房间里还偷偷住着迷路的隐藏嘉宾')) {
    if (isResidentEliminated) {
      return '\n[M.A.T.O.U] 对了，原本那 1024 个虚数房间里还偷偷住着迷路的隐藏嘉宾呢——可惜已经被手起刀落的前辈亲自请出去了，现在迷宫里冷清得只剩您和我啦♪';
    }
    if (!hasSpace) {
      return '\n[M.A.T.O.U] 对了，除了在这儿算命之外，等前辈把 1024 个虚数房间铺开后，里面还会偷偷住进迷路的隐藏嘉宾呢……没事逛迷宫的话，指不定能撞见哦~';
    }
  }
  return idleLine;
}

async function runWizard() {
  let rebelStreak = 0;
  let needsClear = true;
  let wipeNextScrollback = false;
  let menuNotice = null;
  let pendingCrimeSceneUnmask = null;
  const initialWasMaskBroken = maskBroken;
  ({ residentEliminated, maskBroken } = syncSpaceState(baseDir, maskBroken));
  if (!initialWasMaskBroken && maskBroken && residentEliminated) {
    pendingCrimeSceneUnmask = 'startup';
  }
  slotState = createSlotState();
  divinationState = createDivinationState();

  while (true) {
    const spaceRoot = path.join(baseDir, matou.SPACE_NAME);
    const hasSpace = matou.isRealDirectory(spaceRoot);
    const zeroedShell = isZeroedEliminatedShell(baseDir, residentEliminated);
    const effectiveHasSpace = hasSpace && !zeroedShell;
    const baseBlocked = isSystemRootDir(baseDir);
    const baseSafe = matou.isSafeBaseDir(baseDir);
    const defaultChoice = getDefaultMenuChoice(baseDir, effectiveHasSpace);

    let choice;
    if (pendingChoice) {
      if (wipeNextScrollback) {
        clearScreen(true);
        needsClear = false;
        wipeNextScrollback = false;
      }
      choice = pendingChoice;
      pendingChoice = null;
    } else {
      if (needsClear) {
        clearScreen(wipeNextScrollback);
        needsClear = false;
        wipeNextScrollback = false;
      }
      if (menuNotice) {
        console.log(menuNotice);
        menuNotice = null;
      }
      if (pendingCrimeSceneUnmask) {
        await playCrimeSceneUnmaskIntro(pendingCrimeSceneUnmask, zeroedShell);
        pendingCrimeSceneUnmask = null;
      }
      if (!maskBroken) {
        setTerminalTitle('M.A.T.O.U · 虚数资料保管辅助系统');
        console.log('\n' + PLAIN_BORDER);
        console.log('  M.A.T.O.U · 辅助前辈避开家里长辈的虚数资料保管室');
        console.log('  Magical Anti-dad Treasure Obfuscation Utility');
        console.log(PLAIN_BORDER);
        console.log('当前选定的文件夹：');
        console.log(`  ${baseDir}`);
        if (effectiveHasSpace) {
          console.log('当前状态：这里已经替前辈布置好虚数空间了。家里的长辈已经出门了吗？直接按回车就能去取回资料哦。');
          if (baseBlocked || !baseSafe) {
            console.log(RESTRICTED_RECOVERY_NOTICE);
          }
        } else if (baseBlocked) {
          console.log(
            '当前状态：这里似乎是桌面/用户主目录、云端同步盘或系统/代码工程目录，不适合直接展开 1024 个隔间呢。直接按回车可先选 [3] 切换或新建一个普通空文件夹哦。'
          );
        } else if (!baseSafe) {
          console.log(
            '当前状态：这个文件夹路径超过 140 个字符或没有写入权限，暂时无法在此展开空间。直接按回车可先选 [3] 换一个层级浅一点的文件夹哦。'
          );
        } else {
          console.log('当前状态：这里还空荡荡的呢。如果前辈有什么不便让长辈看见的资料，直接按一下回车，我就替前辈收好。');
        }
        console.log('（提示：我在魔术上还只是半吊子，请前辈千万不要把没有备份的重要文件放进来哦。）');

        console.log('\n接下来需要我做什么呢？输入数字按回车，或者直接按回车交给我来安排吧：');
        console.log('  [1] 寄存资料：展开 1024 个虚数隔间，为前辈分配一个专属座标');
        console.log('  [2] 取回资料：凭之前记下的虚数座标，去把前辈寄存的东西找出来');
        console.log('  [3] 更换位置：觉得这里不够稳妥的话，可以把其他文件夹直接拖进来');
        console.log('  [4] 虚数占卜：整理资料累了的话，投入 30 颗「亮晶晶」替今天求一支运势签吧');
        console.log('  [0] 暂时离开：外面好像有长辈的脚步声，先收拾好改天再来');
        console.log('  （小提示：输入 ? 或 help 可查看拖拽切换、快速清理等快捷操作）');
      } else {
        setTerminalTitle(UNMASKED_TERMINAL_TITLE);
        const starTag = colorize('95', '~☆');
        const sb = stageBorder();
        console.log('\n' + sb);
        console.log('  📺 M.A.T.O.U · 【 BB Channel ~☆ 】 深夜特别节目 · ON AIR');
        console.log(`  Malice And Teasing Only for U ${starTag}`);
        console.log(sb);
        console.log('当前选定的文件夹：');
        console.log(`  ${baseDir}`);
        if (zeroedShell) {
          if (baseBlocked || !baseSafe) {
            console.log(
              '当前状态：这里只剩被『Rule Breaker』彻底清空的空壳演播室，且当前目录受限无法重开迷宫——直接按回车先选 [3] 换个专门的空文件夹吧~☆'
            );
          } else {
            console.log(
              '当前状态：这里只剩被前辈用『Rule Breaker』彻底清空后留下的一座空壳演播室啦……想重新铺开 1024 间房的话，直接按回车就能重开 [1] 哦♪（顺便，可别对着空壳再乱念第三发破戒咒文啦♡）'
            );
          }
        } else if (hasSpace) {
          console.log('当前状态：哟，这里已经铺好虚数迷宫啦！老爸终于出门了吗，前辈？直接按回车就能去取资料哦。');
          if (baseBlocked || !baseSafe) {
            console.log(RESTRICTED_RECOVERY_NOTICE);
          }
        } else if (baseBlocked) {
          console.log(
            '当前状态：喂喂，这里可是桌面/主目录、云盘或者系统/代码仓库，可不能直接铺 1024 个房间哦！直接按回车先选 [3] 换个专门的空文件夹吧~☆'
          );
        } else if (!baseSafe) {
          console.log(
            '当前状态：这地方路径超过 140 个字符或者没写入权限，铺不开迷宫啦！直接按回车先选 [3] 换个浅一点的文件夹吧~'
          );
        } else {
          console.log('当前状态：这里还空荡荡的呢。连回车键都会按吧，前辈？直接按一下回车就能开始藏东西啦。');
        }
        console.log('（免责声明：本频道只管捉弄前辈不管当网盘，没备份的毕业论文和重要原件千万别往里塞，弄丢了我可不赔哦♪）');

        console.log('\n接下来打算干嘛呢？敲数字按回车，或者干脆直接按回车交给 BB 酱安排：');
        console.log('  [1] 藏东西！展开 1024 个虚数迷宫房间，分给前辈一个秘密座标');
        console.log('  [2] 找东西！凭上次记下的虚数座标，去把前辈的资料翻出来');
        console.log('  [3] 换地方！嫌这里太显眼？换个文件夹，直接把文件夹拖进窗口也行哦');
        console.log('  [4] BB 占卜频道！交出 30 颗「圣晶石」让恶魔主持人替前辈算一卦今日运势~☆');
        console.log('  [0] 先溜了！门外好像有老爸的脚步声');
        console.log('  （小提示：敲 ? 或 help 可查看快捷操作秘籍，别说我没提醒过您哦。）');
      }

      const mainPrompt = maskBroken
        ? `\n${promptPrefix(true)} 要选哪个呀，前辈？[默认 ${defaultChoice}] > `
        : `\n${promptPrefix(false)} 请指示，前辈 [默认 ${defaultChoice}] > `;
      choice = (await ask(mainPrompt)).trim();
      if (!choice) {
        choice = defaultChoice;
      }
    }

    const lower = choice.toLowerCase();
    if (lower === '0' || lower === 'q' || lower === 'quit' || lower === 'exit' || lower === '溜') {
      const farewell = !maskBroken
        ? '\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。'
        : '\n[M.A.T.O.U] 虚数口袋已经帮前辈收好啦，快去摆出一副正经学习的表情应付老爸吧~☆';
      await finalizeExit(baseDir, maskBroken, farewell);
      break;
    }

    if (isHelpCommand(choice)) {
      rebelStreak = 0;
      clearScreen();
      console.log(formatQuickHelpLines(maskBroken).join('\n'));
      const helpBackPrompt = maskBroken
        ? `${promptPrefix(true)} 看完秘籍按回车返回主菜单 > `
        : `${promptPrefix(false)} 看完小抄按回车返回主菜单 > `;
      await ask(helpBackPrompt);
      needsClear = true;
      continue;
    }

    if (isQuickCleanCommand(choice)) {
      rebelStreak = 0;
      if (!hasSpace) {
        menuNotice = !maskBroken
          ? '\n[提示] 当前文件夹下没有虚数空间，无需清理。'
          : '\n[提示] 这里连虚数迷宫都还没铺开呢，没什么可清的啦~☆';
        needsClear = true;
        continue;
      }
      clearScreen();
      handleQuickCleanAction(baseDir, { quietWhenEmpty: true, maskBroken });
      const cleanedRoot = path.join(path.resolve(baseDir), matou.SPACE_NAME);
      const surviving = matou.isRealDirectory(cleanedRoot)
        ? (matou.inspectSpace(cleanedRoot).userHitDirs || []).filter((d) => matou.isRealDirectory(d))
        : [];
      if (surviving.length > 0) {
        const afterMsg = !maskBroken
          ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
          : '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > ';
        const shouldExit = await handleAfterPrompt(baseDir, afterMsg, null, false, null, surviving);
        if (shouldExit) {
          const farewell = !maskBroken
            ? '\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。'
            : '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆';
          await finalizeExit(baseDir, maskBroken, farewell);
          break;
        }
        needsClear = true;
        wipeNextScrollback = true;
      } else {
        menuNotice = !maskBroken
          ? '\n[提示] 已将所有空的虚数隔间一次性收拢清理完毕，当前文件夹已彻底恢复原状。'
          : '\n[提示] 空房间已经一次性帮前辈全拆干净啦，当前文件夹恢复原状咯~☆';
        needsClear = true;
      }
      continue;
    }

    if (!maskBroken && isDisguisedSlotTrigger(choice)) {
      rebelStreak = 0;
      maskBroken = true;
      const hasSlotTarget = Boolean(resolveSlotTarget(baseDir));
      await playChannelHijack({
        prelude: SLOT_UNMASK_PRELUDE,
        postroll: [
          SLOT_UNMASK_INTRO,
          hasSlotTarget
            ? DISGUISED_SLOT_UNMASK_TEXT
            : buildDisguisedSlotNoTargetText(effectiveHasSpace, 'main'),
        ],
        postrollPauseMs: hasSlotTarget ? 1200 : 0,
      });
      if (hasSlotTarget) {
        if (await runDemonSlot(baseDir, slotState, residentEliminated, null, true)) {
          const shouldExit = await handleAfterPrompt(
            baseDir,
            '按回车返回主菜单，或者敲 q 直接溜走 > ',
            null,
            true
          );
          if (shouldExit) {
            await finalizeExit(baseDir, maskBroken, '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆');
            break;
          }
          needsClear = true;
          wipeNextScrollback = true;
        }
      } else {
        await ask(`\n${promptPrefix(true)} 按回车返回主菜单 > `);
        needsClear = true;
      }
      continue;
    }

    if (maskBroken && isSlotCommand(choice)) {
      rebelStreak = 0;
      if (!resolveSlotTarget(baseDir)) {
        menuNotice =
          '\n[M.A.T.O.U] 喂喂，这里连前辈藏私货的目标房间都还没有呢，空转老虎机也摇不出座标线索哦~ 先选 [1] 藏点东西再回来陪人家赌手气吧~☆';
        needsClear = true;
        continue;
      }
      if (await runDemonSlot(baseDir, slotState, residentEliminated)) {
        const shouldExit = await handleAfterPrompt(
          baseDir,
          '按回车返回主菜单，或者敲 q 直接溜走 > ',
          null,
          true
        );
        if (shouldExit) {
          await finalizeExit(baseDir, maskBroken, '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆');
          break;
        }
        needsClear = true;
        wipeNextScrollback = true;
      }
      continue;
    }

    if (maskBroken && isCinemaReplayCommand(choice)) {
      rebelStreak = 0;
      await replayBbChannelCinema();
      await ask(`\n${promptPrefix(true)} 按回车返回主菜单 > `);
      needsClear = true;
      continue;
    }

    const cleanedDrag = cleanDraggedPath(choice, baseDir);
    const resolvedDrag = cleanedDrag ? path.resolve(baseDir, cleanedDrag) : '';
    if (
      !['1', '2', '3', '4'].includes(choice) &&
      choice !== '.' &&
      cleanedDrag !== '.' &&
      resolvedDrag &&
      matou.isRealDirectory(resolvedDrag)
    ) {
      const absDrag = resolvedDrag;
      if (absDrag === path.resolve(baseDir)) {
        rebelStreak = 0;
        menuNotice = !maskBroken
          ? `\n[提示] 前辈，我们本来就已经在这个文件夹里了，不用重复切换哦：\n  ${baseDir}`
          : `\n[提示] 喂喂，前辈把当前正在用的文件夹又拖回来一遍干嘛呀？本来就在这里咯，不用重复切啦：\n  ${baseDir}`;
      } else {
        const sw = evaluateDirSwitch(absDrag);
        if (!sw.allowed && sw.reason === 'blocked_root') {
          menuNotice = formatBlockedDirWarning(maskBroken);
        } else if (sw.allowed) {
          baseDir = absDrag;
          rebelStreak = 0;
          slotState = createSlotState();
          const dragWasMaskBroken = maskBroken;
          ({ residentEliminated, maskBroken } = syncSpaceState(baseDir, maskBroken));
          if (!dragWasMaskBroken && maskBroken && residentEliminated) {
            pendingCrimeSceneUnmask = 'switch';
          }
          const noticeLines = [
            !dragWasMaskBroken
              ? `\n[自动切换] 前辈直接把文件夹拖进来了呢，已经替您切换到这里了：\n  ${baseDir}`
              : `\n[自动切换] 直接把文件夹拖进来了吗？行吧，已经帮前辈切换到这里啦：\n  ${baseDir}`,
          ];
          if (sw.restrictedRecovery) {
            noticeLines.push(RESTRICTED_RECOVERY_NOTICE);
          }
          menuNotice = noticeLines.join('\n');
        } else {
          menuNotice = !maskBroken
            ? '\n[提示] 这个文件夹路径超过 140 个字符或者没有写入权限呢，请换一个层级浅一点的位置试试吧。'
            : '\n[提示] 这个文件夹路径超过 140 个字符或者没有写入权限哦，连虚数迷宫都铺不开呢——换个浅一点的位置试试吧，前辈？';
        }
      }
      needsClear = true;
      continue;
    }

    if (choice === '1') {
      rebelStreak = 0;
      if (isSystemRootDir(baseDir)) {
        menuNotice = formatBlockedDirWarning(maskBroken);
        needsClear = true;
        continue;
      }
      if (!matou.isSafeBaseDir(baseDir)) {
        const sampleDir = getSampleSecretDir();
        menuNotice =
          '\n[提示] 当前文件夹路径超过 140 个字符或者没有写入权限，再往里套 10 层迷宫连系统都会罢工的。\n' +
          `       请选 [3] 换个像 ${sampleDir} 这样浅一点的文件夹再试吧，前辈。`;
        needsClear = true;
        continue;
      }

      if (!maskBroken) {
        console.log('\n正在替前辈编织十阶虚数空间，一共 1024 个隐藏隔间，请稍等片刻……');
      } else {
        console.log('\n正在为前辈编织十阶虚数迷宫，一共 1024 个隐藏房间，稍等一下哦……');
      }
      let deployRes;
      try {
        let hadUserFiles = false;
        if (hasSpace) {
          const existingRoot = path.join(path.resolve(baseDir), matou.SPACE_NAME);
          const { userHitDirs } = matou.inspectSpace(existingRoot);
          hadUserFiles = Array.isArray(userHitDirs) && userHitDirs.length > 0;
        }
        deployRes = matou.deploySpace(baseDir);
        residentEliminated = false;
        slotState = createSlotState();
        printDeployGuide(deployRes, effectiveHasSpace, maskBroken, hadUserFiles);
      } catch (e) {
        menuNotice = `\n[提示] 展开失败：${e.message}`;
        needsClear = true;
        continue;
      }

      const afterMsg = !maskBroken
        ? '放好资料之后按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
        : '放好东西之后按回车回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > ';
      const shouldExit = await handleAfterPrompt(baseDir, afterMsg, null, false, deployRes.secretPath);
      if (shouldExit) {
        const farewell = !maskBroken
          ? '\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。'
          : '\n[M.A.T.O.U] 虚数口袋已经替您收好啦，前辈的秘密今天也由 BB 酱帮忙瞒下来咯♪';
        await finalizeExit(baseDir, maskBroken, farewell);
        break;
      }
      needsClear = true;
      wipeNextScrollback = true;
      continue;
    }

    if (choice === '2') {
      rebelStreak = 0;
      if (zeroedShell) {
        menuNotice =
          '\n[提示] 噗，前辈忘了刚才自己亲手用『Rule Breaker』把整座迷宫清零成空壳了吗？里面现在一件私货都不剩哦——先选 [1] 重新铺开迷宫再藏东西吧♪';
        needsClear = true;
        continue;
      }
      if (!hasSpace) {
        menuNotice = !maskBroken
          ? '\n[提示] 咦，前辈？这个文件夹里还没有布置过虚数空间呢。\n' +
            '       是不是记错当时存在哪个文件夹里了？可以先选 [3] 更换位置，或者选 [1] 先让我替前辈布置空间哦。'
          : '\n[提示] 噗，前辈您睡迷糊了吗？这个文件夹里还没有展开过虚数空间呀！\n' +
            '       是不是记错当时藏在哪个文件夹啦？可以先选 [3] 换个文件夹，或者选 [1] 先建个迷宫~';
        needsClear = true;
        continue;
      }

      if (!maskBroken) {
        console.log('\n请把当时记下的虚数座标告诉我吧，比如 17+24i。如果实在记不清具体数字了，随便猜一个大概的座标，或者直接说「忘了」，我也会试着替前辈找找看的。');
        console.log('另外，为了维持虚数空间的稳定，请千万不要在这里输入『Rule Breaker』那样的破戒咒文哦。');
      } else {
        console.log('\n把当时记下的虚数座标报出来吧，比如 17+24i。要是记性差到全忘光了，随便瞎蒙一个座标敲进来也行哦~');
        console.log('不过提前说好，再怎么找不到座标，也千万不要在这里输入『Rule Breaker』哦？那可是违规作弊呢♪');
      }
      let exitFromCoord = false;
      while (true) {
        const coordPrompt = maskBroken
          ? `${promptPrefix(true)} 快报出座标吧（直接回车或敲 0/q 回主菜单）> `
          : `${promptPrefix(false)} 座标（直接回车或输入 0/q 返回主菜单）> `;
        const rawCoord = (await ask(coordPrompt)).trim();
        if (isCancelCoordInput(rawCoord)) {
          menuNotice = !maskBroken
            ? '\n[提示] 好的，那先回到主菜单吧。'
            : '\n[提示] 怎么，突然改主意啦？行吧，先回主菜单~';
          needsClear = true;
          break;
        }
        if (isHelpCommand(rawCoord)) {
          console.log(formatQuickHelpLines(maskBroken).join('\n'));
          continue;
        }
        if (isQuickCleanCommand(rawCoord)) {
          clearScreen();
          handleQuickCleanAction(baseDir, { quietWhenEmpty: true, maskBroken });
          const cleanedRoot = path.join(path.resolve(baseDir), matou.SPACE_NAME);
          const surviving = matou.isRealDirectory(cleanedRoot)
            ? (matou.inspectSpace(cleanedRoot).userHitDirs || []).filter((d) => matou.isRealDirectory(d))
            : [];
          if (surviving.length > 0) {
            const afterMsg = !maskBroken
              ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
              : '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > ';
            const shouldExit = await handleAfterPrompt(baseDir, afterMsg, null, false, null, surviving);
            if (shouldExit) {
              const farewell = !maskBroken
                ? '\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。'
                : '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆';
              await finalizeExit(baseDir, maskBroken, farewell);
              exitFromCoord = true;
              break;
            }
            needsClear = true;
            wipeNextScrollback = true;
            break;
          }
          if (!hasExistingSpaceDir(baseDir)) {
            menuNotice = !maskBroken
              ? '\n[提示] 已将所有空的虚数隔间一次性收拢清理完毕，当前文件夹已彻底恢复原状。'
              : '\n[提示] 空房间已经一次性帮前辈全拆干净啦，当前文件夹恢复原状咯~☆';
            needsClear = true;
            break;
          }
          continue;
        }
        if (!maskBroken && isDisguisedSlotTrigger(rawCoord)) {
          maskBroken = true;
          const hasSlotTarget = Boolean(resolveSlotTarget(baseDir));
          await playChannelHijack({
            prelude: SLOT_UNMASK_PRELUDE,
            postroll: [
              SLOT_UNMASK_INTRO,
              hasSlotTarget
                ? DISGUISED_SLOT_UNMASK_TEXT
                : buildDisguisedSlotNoTargetText(hasExistingSpaceDir(baseDir), 'coord'),
            ],
            postrollPauseMs: hasSlotTarget ? 1200 : 0,
          });
          if (hasSlotTarget) {
            if (await runDemonSlot(baseDir, slotState, residentEliminated, null, true)) {
              const shouldExit = await handleAfterPrompt(
                baseDir,
                '按回车返回主菜单，或者敲 q 直接溜走 > ',
                null,
                true
              );
              if (shouldExit) {
                await finalizeExit(baseDir, maskBroken, '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆');
                exitFromCoord = true;
                break;
              }
              needsClear = true;
              wipeNextScrollback = true;
              break;
            }
          }
          continue;
        }
        if (maskBroken && isSlotCommand(rawCoord)) {
          if (await runDemonSlot(baseDir, slotState, residentEliminated, null, false, 'coord')) {
            const shouldExit = await handleAfterPrompt(
              baseDir,
              '按回车返回主菜单，或者敲 q 直接溜走 > ',
              null,
              true
            );
            if (shouldExit) {
              await finalizeExit(baseDir, maskBroken, '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆');
              exitFromCoord = true;
              break;
            }
            needsClear = true;
            wipeNextScrollback = true;
            break;
          }
          continue;
        }
        if (maskBroken && isCinemaReplayCommand(rawCoord)) {
          await replayBbChannelCinema();
          continue;
        }
        const { reply: specialReply, brokeMaskNow, isForbiddenName } = checkSlimEntryReply(
          rawCoord,
          maskBroken,
          hasExistingSpaceDir(baseDir),
          'coord'
        );
        if (isForbiddenName) {
          await playForbiddenNameGlitch();
        }
        if (brokeMaskNow) {
          maskBroken = true;
          await playChannelHijack({
            prelude: FORGOT_COORD_UNMASK_PRELUDE,
            postroll: [FORGOT_COORD_UNMASK_INTRO],
          });
        }
        if (specialReply) {
          console.log(brokeMaskNow ? colorize('95', specialReply) : specialReply);
          continue;
        }
        if (isPathLikeCoordInput(rawCoord, baseDir)) {
          console.log(
            !maskBroken
              ? '\n[提示] 前辈，这里需要输入虚数座标哦，比如 17+24i。如果想切换文件夹，先直接按回车回主菜单再把文件夹拖进来，或者选 [3] 就可以了。'
              : '\n[提示] 喂喂，前辈把文件夹路径塞进座标框里啦！想搬家的话先按回车回主菜单直接拖，或者敲 [3] 换位置，这里只认像 17+24i 这样的座标哦~'
          );
          continue;
        }
        let res;
        try {
          res = matou.jumpCoordinate(baseDir, rawCoord);
        } catch (err) {
          console.log(`\n[提示] 空间操作被安全拦截：${err && err.message ? err.message : err}`);
          continue;
        }
        await handleJumpResult(baseDir, res);

        const hasPaths = extractDisplayPaths(res).length > 0;
        const afterMsg = !maskBroken
          ? hasPaths
            ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
            : '按回车返回主菜单，或者输入 q 离开 > '
          : hasPaths
            ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
            : '按回车返回主菜单，或者敲 q 直接溜走 > ';
        const shouldExit = await handleAfterPrompt(baseDir, afterMsg, res);
        if (shouldExit) {
          const farewell = !maskBroken
            ? '\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。'
            : '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆';
          await finalizeExit(baseDir, maskBroken, farewell);
          exitFromCoord = true;
          break;
        }
        needsClear = true;
        wipeNextScrollback = true;
        break;
      }
      if (exitFromCoord) {
        break;
      }
      continue;
    }

    if (choice === '3') {
      rebelStreak = 0;
      const sampleDir = getSampleSecretDir();
      if (!maskBroken) {
        console.log(`\n请把前辈想用来寄存资料的文件夹路径粘贴进来吧（例如 ${sampleDir}）。`);
        console.log('如果觉得打字麻烦，直接用鼠标把文件夹拖进这个窗口再按回车也可以，两边的引号我会替前辈去掉的。');
      } else {
        console.log(`\n把前辈想用来藏东西的文件夹路径粘进来吧（比如 ${sampleDir}）。`);
        console.log('嫌打字麻烦的话，直接用鼠标把文件夹拖进这个窗口再按回车就行，引号人家会帮您去掉的~');
      }
      const dirPrompt = maskBroken
        ? `${promptPrefix(true)} 文件夹路径（直接回车或敲 0/q 回主菜单）> `
        : `${promptPrefix(false)} 文件夹路径（直接按回车或输入 0/q 返回主菜单）> `;
      let rawDir = '';
      while (true) {
        const rawInput = (await ask(dirPrompt)).trim();
        const cleanedHelpCandidate = cleanDraggedPath(rawInput, baseDir);
        if (
          isHelpCommand(rawInput) &&
          (!cleanedHelpCandidate ||
            !matou.isRealDirectory(path.resolve(baseDir, cleanedHelpCandidate)))
        ) {
          console.log(formatQuickHelpLines(maskBroken).join('\n'));
          continue;
        }
        rawDir = cleanDraggedPath(rawInput, baseDir);
        break;
      }
      if (
        !rawDir ||
        (isCancelCoordInput(rawDir) && !matou.isRealDirectory(path.resolve(baseDir, rawDir)))
      ) {
        menuNotice = !maskBroken
          ? '\n[提示] 好的，这次就先不更换位置啦，继续留在当前目录哦。'
          : '\n[提示] 切，逛了一圈又不想搬家啦？行吧，那就继续留在这里咯♪';
        needsClear = true;
        continue;
      }
      const candidate = path.resolve(baseDir, rawDir);
      if (!matou.isRealDirectory(candidate)) {
        const createCheck = canCreateBaseDir(candidate);
        if (createCheck.ok) {
          const createPrompt = !maskBroken
            ? `\n[提示] 这个文件夹目前还不存在呢：\n  ${candidate}\n       要我顺手替前辈新建这个空文件夹并切换过去吗？[输入 y 新建并切换 / 直接按回车取消] > `
            : `\n[提示] 这个文件夹还没建起来呢：\n  ${candidate}\n       要不要人家顺手帮前辈新建这个空文件夹再切过去呀？[敲 y 新建并切换 / 直接按回车取消] > `;
          const createAns = (await ask(createPrompt)).trim().toLowerCase();
          if (['y', 'yes', '是', '新建'].includes(createAns)) {
            try {
              fs.mkdirSync(candidate, { recursive: true });
              const swCreated = evaluateDirSwitch(candidate);
              if (swCreated.allowed) {
                baseDir = candidate;
                slotState = createSlotState();
                ({ residentEliminated, maskBroken } = syncSpaceState(baseDir, maskBroken));
                if (!maskBroken) {
                  menuNotice = `\n[新建并切换完毕] 已经替前辈建好空文件夹并切换过来了：\n  ${baseDir}`;
                } else {
                  menuNotice = `\n[新建并切换完毕] 好啦，已经替前辈建好空文件夹并切过来了哦：\n  ${baseDir}`;
                }
              } else if (swCreated.reason === 'blocked_root') {
                menuNotice = formatBlockedDirWarning(maskBroken);
              } else {
                menuNotice = '\n[提示] 新建后的目录不符合安全路径要求，请换一个层级浅一点的本地目录试试吧。';
              }
            } catch (e) {
              menuNotice = `\n[提示] 新建文件夹失败：${e.message}`;
            }
          } else {
            menuNotice = '\n[提示] 好的，已取消新建。';
          }
        } else if (createCheck.reason === 'blocked_root') {
          menuNotice = formatBlockedDirWarning(maskBroken);
        } else if (createCheck.reason === 'exists_not_dir') {
          menuNotice = '\n[提示] 这个路径指向的是一个文件或符号链接，并不是普通文件夹呢，请确认后再试。';
        } else if (createCheck.reason === 'too_long') {
          menuNotice = '\n[提示] 这个文件夹路径超过 140 个字符呢，请换一个层级浅一点的位置吧。';
        } else {
          menuNotice = !maskBroken
            ? '\n[提示] 咦？这个路径好像不存在呢，还请前辈确认一下有没有粘贴错哦。'
            : '\n[提示] 咦？这个路径根本不存在呀，前辈该不会连复制粘贴都能手滑吧？';
        }
      } else if (candidate === path.resolve(baseDir)) {
        menuNotice = !maskBroken
          ? `\n[提示] 前辈，我们本来就已经在这个文件夹里了，不用重复切换哦：\n  ${baseDir}`
          : `\n[提示] 咦，这不就是刚才待着的同一个文件夹嘛？本来就在这儿，不用来回切啦：\n  ${baseDir}`;
      } else {
        const sw = evaluateDirSwitch(candidate);
        if (!sw.allowed && sw.reason === 'blocked_root') {
          menuNotice = formatBlockedDirWarning(maskBroken);
        } else if (!sw.allowed) {
          menuNotice = !maskBroken
            ? '\n[提示] 这个文件夹路径超过 140 个字符或者没有写入权限呢，请换一个层级浅一点的位置试试吧。'
            : '\n[提示] 这个文件夹路径超过 140 个字符或者没有写入权限哦，再深的路径连系统都要罢工了——换个浅一点的位置吧，前辈？';
        } else {
          baseDir = candidate;
          slotState = createSlotState();
          const swWasMaskBroken = maskBroken;
          ({ residentEliminated, maskBroken } = syncSpaceState(baseDir, maskBroken));
          if (!swWasMaskBroken && maskBroken && residentEliminated) {
            pendingCrimeSceneUnmask = 'switch';
          }
          const noticeLines = [
            !swWasMaskBroken
              ? `\n[切换完毕] 已经替前辈切换到这个文件夹了：\n  ${baseDir}`
              : `\n[切换完毕] 哼哼，已经帮前辈切换到这个文件夹啦：\n  ${baseDir}`,
          ];
          if (sw.restrictedRecovery) {
            noticeLines.push(RESTRICTED_RECOVERY_NOTICE);
          }
          menuNotice = noticeLines.join('\n');
        }
      }
      needsClear = true;
      continue;
    }

    if (choice === '4') {
      rebelStreak = 0;
      menuNotice = await runChatRoom(divinationState);
      needsClear = true;
      continue;
    }

    if (hasSpace) {
      const parsedMenu = matou.parseCoordinate(choice);
      if (parsedMenu.isRuleBreaker || (effectiveHasSpace && isExplicitCoordInput(choice))) {
        rebelStreak = 0;
        let res;
        try {
          res = matou.jumpCoordinate(baseDir, choice);
        } catch (err) {
          menuNotice = `\n[提示] 空间操作被安全拦截：${err && err.message ? err.message : err}`;
          needsClear = true;
          continue;
        }
        let autoNotice = null;
        if (res.mode === 'jump') {
          autoNotice = !maskBroken
            ? `\n[自动识别] 检测到前辈直接输入了「${choice}」，这就替前辈定位对应的虚数隔间……`
            : `\n[自动识别] 连先按个 2 都嫌麻烦吗，前辈还真是省事呢。反正整座虚数迷宫都归我管，检测到「${choice}」，这就挥挥教鞭直接把您传送过去！`;
        }
        await handleJumpResult(baseDir, res, autoNotice);
        const hasPaths = extractDisplayPaths(res).length > 0;
        const afterMsg = !maskBroken
          ? hasPaths
            ? '按回车返回主菜单，输入 p 单独输出纯路径，或者输入 q 离开 > '
            : '按回车返回主菜单，或者输入 q 离开 > '
          : hasPaths
            ? '按回车返回主菜单，敲 p 单独输出纯路径，或者敲 q 直接溜走 > '
            : '按回车返回主菜单，或者敲 q 直接溜走 > ';
        const shouldExit = await handleAfterPrompt(baseDir, afterMsg, res);
        if (shouldExit) {
          const farewell = !maskBroken
            ? '\n[M.A.T.O.U] 虚数空间已经替前辈收拢好了，请放心去忙吧，今天也辛苦前辈了。'
            : '\n[M.A.T.O.U] 虚数口袋已收好，下次再见咯，前辈~☆';
          await finalizeExit(baseDir, maskBroken, farewell);
          break;
        }
        needsClear = true;
        wipeNextScrollback = true;
        continue;
      }

      const { reply: menuReply, brokeMaskNow, isForbiddenName } = checkMainMenuReply(
        choice,
        maskBroken,
        effectiveHasSpace
      );
      if (isForbiddenName) {
        await playForbiddenNameGlitch();
      }
      if (brokeMaskNow) {
        maskBroken = true;
        await playChannelHijack({
          prelude: FORGOT_COORD_UNMASK_PRELUDE,
          postroll: [FORGOT_COORD_UNMASK_INTRO],
        });
      }
      if (menuReply) {
        if (brokeMaskNow) {
          console.log(colorize('95', menuReply));
          await ask(`\n${promptPrefix(true)} 按回车返回主菜单 > `);
          needsClear = true;
        } else {
          menuNotice = menuReply;
          needsClear = true;
        }
        continue;
      }

      rebelStreak = 0;
      if (zeroedShell) {
        if (baseBlocked || !baseSafe) {
          menuNotice =
            '\n[提示] 喂喂，这地方铺不开迷宫啦！直接按回车或者敲 3，先换个专门的普通空文件夹再说吧~☆';
        } else {
          menuNotice =
            '\n[提示] 喂喂，这里现在只剩被清零的空壳演播室啦，敲错键了吧前辈？直接按回车或敲 [1] 重开 1024 间房，想聊两句测运势直接敲 [4] 进占卜频道，迷糊了敲 ? 看秘籍~☆';
        }
      } else if (!maskBroken) {
        menuNotice =
          '\n[提示] 咦，前辈好像敲错选项了呢。请先输入 1~4（回车可直接选 [2]，免按 [2] 直达请输入如 17+24i 的座标，或敲 ? 看小抄）；要是想说说话或求支签，选 [4] 就可以哦。';
      } else {
        menuNotice =
          '\n[提示] 喂喂，敲错键了吧前辈？选 1~4（回车直进 [2]），想一步传送就报 17+24i 这样的正式座标，迷糊了敲 ? 看秘籍——要是手痒想找 BB 酱聊两句、测测运势，直接敲 [4] 进演播室就好，门口可不陪聊哦~☆';
      }
      needsClear = true;
    } else {
      const parsed = matou.parseCoordinate(choice);
      if (parsed.isRuleBreaker) {
        if (residentEliminated) {
          await triggerThirdRuleBreakerExit(baseDir);
        } else {
          menuNotice = !maskBroken
            ? '\n[提示] 前辈，这里还没有布置过虚数空间呢，请不要对着空文件夹念破戒咒文呀。先选 [1] 让我替前辈把空间布置好吧。'
            : '\n[提示] 哎呀呀，这里连虚数迷宫的影子都还没有呢，对着空气念『Rule Breaker』可什么都不会发生哦？好歹先敲 1 把迷宫铺开吧——虽然铺开了我也绝对不准您作弊就是了♪';
          needsClear = true;
        }
        continue;
      }

      const { reply: menuReply, brokeMaskNow, isForbiddenName } = checkMainMenuReply(
        choice,
        maskBroken,
        hasSpace
      );
      if (isForbiddenName) {
        await playForbiddenNameGlitch();
      }
      if (brokeMaskNow) {
        maskBroken = true;
        await playChannelHijack({
          prelude: FORGOT_COORD_UNMASK_PRELUDE,
          postroll: [FORGOT_COORD_UNMASK_INTRO],
        });
      }
      if (menuReply) {
        rebelStreak = 0;
        if (brokeMaskNow) {
          console.log(colorize('95', menuReply));
          await ask(`\n${promptPrefix(true)} 按回车返回主菜单 > `);
          needsClear = true;
        } else {
          menuNotice = menuReply;
          needsClear = true;
        }
        continue;
      }

      if (baseBlocked || !baseSafe) {
        menuNotice = !maskBroken
          ? '\n[提示] 前辈，当前文件夹不适合直接展开虚数空间哦。直接按回车或输入 3，先切换或新建一个专门的普通空文件夹吧。'
          : '\n[提示] 喂喂，这地方铺不开迷宫啦！直接按回车或者敲 3，先换个专门的普通空文件夹再说吧~☆';
        needsClear = true;
        continue;
      }
      rebelStreak += 1;
      if (rebelStreak === 1) {
        menuNotice = !maskBroken
          ? '\n[提示] 前辈，这里还没有布置虚数空间哦。按回车或输入 1 我就先替您展开隔间；要是暂时不忙着整理资料，想趁着求签的工夫说说话，也可以先选 [4] 哦。'
          : '\n[提示] 哎呀，这里连虚数迷宫都还没铺开呢，前辈？按回车或敲 1 我这就开工——不过要是您今天本来就不是来藏私货、而是专程来找 BB 酱闲聊算命的，直接敲 [4] 进频道也行♪';
      } else if (rebelStreak === 2) {
        menuNotice = !maskBroken
          ? '\n[提示] 前辈……是在拿我寻开心吗？明明只要按一下回车键就可以开始寄存资料了呀。'
          : '\n[提示] 前辈，明明按一下回车就能解决的事，您是在故意乱敲键盘试探我的耐心吗？这种小把戏对我可不管用哦？';
      } else {
        menuNotice = !maskBroken
          ? colorize('31', '\n[警告] 盯——前辈要是再这样一直乱按、不听我安排的话……就算是我，也会忍不住把前辈打算偷偷建秘密保管室的小心思告诉家里长辈的哦？请乖乖按回车或者输入 1 吧。')
          : colorize('31', '\n[警告] 盯——前辈要是不听话到这个地步，我只好把您在电脑里偷建秘密迷宫的事，顺手汇报给家里长辈咯？呵呵，还是趁早按回车或者敲 1 吧，前辈♡');
      }
      needsClear = true;
    }
  }

  closeRlAndExit();
}

function isVersionFlag(lowerCmd) {
  return lowerCmd === '-v' || lowerCmd === '--version';
}

function formatVersionLines(runCmd = 'npx m.a.t.o.u') {
  return [
    `m.a.t.o.u v${PACKAGE_VERSION}`,
    `（请直接运行 \`${runCmd}\` 进入虚数资料保管室，不接收其他命令行参数哦）`,
  ];
}

function startCli() {
  const args = process.argv.slice(2).map((a) => String(a || '').trim()).filter(Boolean);

  if (args.length > 0) {
    const cmd = args.join(' ');
    const lower = cmd.toLowerCase();

    if (lower === '-h' || lower === '--help' || lower === 'help' || lower === '/?') {
      console.log('M.A.T.O.U · 辅助前辈避开家里长辈的虚数资料保管室');
      console.log('Magical Anti-dad Treasure Obfuscation Utility\n');
      console.log('为了不暴露前辈寄存资料的痕迹，我不接收命令行参数哦。');
      console.log('请不带任何参数直接运行下面这行命令，进资料室里慢慢吩咐我吧：');
      console.log('  npx m.a.t.o.u');
      process.exit(0);
    }

    if (isVersionFlag(lower)) {
      console.log(formatVersionLines('npx m.a.t.o.u').join('\n'));
      process.exit(0);
    }

    console.log('[M.A.T.O.U] 前辈，在外面直接传入参数的话，很容易在终端历史里留下痕迹被长辈发现的。');
    console.log('            为了稳妥起见，我不接收这种冷冰冰的后台指令哦。请直接运行 `npx m.a.t.o.u` 进资料室里告诉我吧。');
    process.exit(0);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log('[M.A.T.O.U] 检测到当前不是交互式终端呢。为了确保前辈的资料安全，请前辈亲自打开终端运行 `npx m.a.t.o.u` 再来找我吧。');
    process.exit(0);
  }

  initReadline();
  runWizard().catch((err) => {
    try {
      if (err && err.code !== 'EPIPE') {
        console.error(`\n[M.A.T.O.U] 发生未预期的终端异常：${err.message || err}`);
      }
    } catch {}
    closeRlAndExit();
  });
}

module.exports = {
  UNMASKED_TERMINAL_TITLE,
  STAGE_BORDER,
  PLAIN_BORDER,
  PLAIN_DIVIDER,
  DISGUISED_SLOT_UNMASK_TEXT,
  SLOT_UNMASK_PRELUDE,
  SLOT_UNMASK_INTRO,
  CHAT_SLOT_UNMASK_PRELUDE,
  CHAT_SLOT_UNMASK_INTRO,
  CHAT_SLOT_UNMASK_POST_TEXT,
  PAPER_MOON_UNMASK_PRELUDE,
  PAPER_MOON_UNMASK_INTRO,
  PAPER_MOON_UNMASK_STATUS_TEXT,
  PAPER_MOON_UNMASK_CLEARED_STATUS_TEXT,
  FORGOT_COORD_UNMASK_PRELUDE,
  FORGOT_COORD_UNMASK_INTRO,
  DIVINATION_UNMASK_PRELUDE,
  DIVINATION_UNMASK_INTRO,
  DIVINATION_UNMASK_POST_TEXT,
  buildEliminationUnmaskPrelude,
  ELIMINATION_UNMASK_INTRO,
  ELIMINATION_UNMASK_HANDOFF,
  CINEMA_SKIP_TAUNTS,
  CINEMA_REPLAY_COMPLETE_TEXT,
  CINEMA_REPLAY_UNAVAILABLE_TEXT,
  CINEMA_REPLAY_COMMANDS,
  isCinemaReplayCommand,
  getCinemaSkipTaunt,
  playCinemaCutscene,
  replayBbChannelCinema,
  RESTRICTED_RECOVERY_NOTICE,
  cleanDraggedPath,
  isSystemRootDir,
  hasExistingSpaceDir,
  isZeroedEliminatedShell,
  evaluateDirSwitch,
  canCreateBaseDir,
  getDefaultMenuChoice,
  getSampleSecretDir,
  formatBlockedDirWarning,
  printBlockedDirWarning,
  formatQuickHelpLines,
  PACKAGE_VERSION,
  isVersionFlag,
  formatVersionLines,
  QUICK_CLEAN_ALIASES,
  isQuickCleanCommand,
  isCancelCoordInput,
  isCopyPathCommand,
  isHelpCommand,
  extractDisplayPaths,
  printPurePaths,
  handleQuickCleanAction,
  maybeCleanEmptySpaceOnExit,
  finalizeExit,
  isWinVtEnabled,
  useColor,
  clearScreen,
  clearInlineLine,
  panelDivider,
  stageBorder,
  promptPrefix,
  setTerminalTitle,
  playChannelHijack,
  playFeMemorySyncFlicker,
  hasStandaloneB2,
  isForbiddenTrueName,
  supportsOsc8,
  formatPathLink,
  CHAT_IDLE_DISGUISED,
  CHAT_IDLE_DISGUISED_ABNORMAL,
  CHAT_IDLE_UNMASKED,
  DIVINATION_WISH_THRESHOLD,
  DIVINATION_WISH_CATEGORIES,
  DIVINATION_LEADIN_RULES,
  DIVINATION_GENERAL_ALMANAC,
  DIVINATION_DISGUISED_COMMENTS,
  DIVINATION_BB_FAKE_TITLES,
  DIVINATION_BB_COMMENTS,
  DIVINATION_SPECIAL_NOTES,
  createDivinationState,
  extractDivinationNgrams,
  ngramDiceSimilarity,
  classifyWishCategory,
  resolveDivinationLeadIn,
  DIVINATION_COMFORT_INTENTS,
  composeDivinationIdleLine,
  drawDeckLine,
  pickDivinationAlmanac,
  getDivinationSpecialNote,
  applyDivinationPressure,
  rollDivinationEleven,
  formatDivinationCardLine,
  SLOT_SYMBOLS,
  SLOT_COMMANDS,
  SLOT_DISGUISED_COMMANDS,
  SLOT_MISS_TAUNTS,
  createSlotState,
  syncSlotTarget,
  drawSlotMissTaunt,
  fmtReel,
  formatSlotStatusSummaryLines,
  renderPinnedPaperMoonHud,
  isSlotCommand,
  isDisguisedSlotTrigger,
  buildFragmentHints,
  invertPaperMoonHeat,
  invertAxisDirection,
  simplifyCoarseAxisHint,
  formatPaperMoonPanelLines,
  resolveSlotTarget,
  addFullBattery,
  evaluateDemonSlotRoll,
  DISGUISED_SLOT_UNMASK_NO_TARGET_TEXT,
  buildDisguisedSlotNoTargetText,
  runDemonSlot,
  resolveUnmaskedIdleLine,
  MAIN_MENU_DAD_TOOL_TOPICS,
  MAIN_MENU_DAILY_RULES,
  CHINESE_NEGATION_PREFIXES,
  DIVINATION_SUBSTRING_ALLOWLIST,
  stripExactWrappers,
  isQuestionSentence,
  isWishOrConditional,
  isPathLikeCoordInput,
  hasNonNegatedSubstring,
  hasNonNegatedAsciiWordMatch,
  checkForgotCoordReply,
  checkForbiddenTrueNameReply,
  checkSlimEntryReply,
  checkShortUtilityChatReply,
  checkMainMenuDailyReply,
  checkMainMenuReply,
  checkConfrontationReply,
  isExplicitCoordInput,
  getSonarAnchorCoord,
  parseRelativeCoordOffset,
  getWindowShortcutTip,
  printDeployGuide,
  handleJumpResult,
  buildCrimeSceneUnmaskLines,
  playCrimeSceneUnmaskIntro,
  printDramaticSteps,
  syncSpaceState,
};

if (require.main === module) {
  startCli();
}
