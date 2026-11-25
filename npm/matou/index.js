'use strict';

const fs = require('fs');
const path = require('path');

const SPACE_NAME = '_Imaginary_Space_';
const BRANCH_0 = '[-i]';
const BRANCH_1 = '[+i]';
const MAZE_BRANCH_DIRS = new Set([BRANCH_0, BRANCH_1]);

const RULE_BREAKER_ALIASES = new Set([
  'rulebreaker',
  'lulubuleika',
  '撸撸不累卡',
  '万符必应破戒',
  '万符必将破戒',
]);

const RESIDENT_FILENAMES = new Set([
  'Tiamat.txt',
  'Kingprotea.txt',
  'Saber_Alter.txt',
  'Berserker.txt',
  'Blonde_Passerby.txt',
]);

const OS_METADATA_FILENAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

function isRealDirectory(targetPath) {
  if (!targetPath) return false;
  try {
    const stat = fs.lstatSync(targetPath);
    return !stat.isSymbolicLink() && stat.isDirectory();
  } catch {
    return false;
  }
}

function isOsMetadataFile(fullPath, fileName) {
  const name = (fileName || path.basename(fullPath)).toLowerCase();
  if (!OS_METADATA_FILENAMES.has(name)) return false;
  try {
    const lstat = fs.lstatSync(fullPath);
    return !lstat.isSymbolicLink() && lstat.isFile();
  } catch {
    return false;
  }
}

function tryRemoveEmptyMazeDir(dirPath) {
  if (!isRealDirectory(dirPath)) return false;
  try {
    fs.rmdirSync(dirPath);
    return true;
  } catch {}
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    if (entries.length === 0) {
      fs.rmdirSync(dirPath);
      return true;
    }
    const allJunk = entries.every(
      (entry) =>
        !entry.isSymbolicLink() &&
        entry.isFile() &&
        OS_METADATA_FILENAMES.has(entry.name.toLowerCase())
    );
    if (!allJunk) return false;
    for (const entry of entries) {
      try {
        fs.unlinkSync(path.join(dirPath, entry.name));
      } catch {
        return false;
      }
    }
    fs.rmdirSync(dirPath);
    return true;
  } catch {
    return false;
  }
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildTiamatText() {
  const segCount = randInt(2, 4);
  const tails = ['……', '…………', '——', '……？', '——！'];
  const parts = [];
  for (let i = 0; i < segCount; i++) {
    const head = Math.random() < 0.5 ? 'A' : 'a';
    const body = 'a'.repeat(randInt(4, 14));
    const tail = tails[Math.floor(Math.random() * tails.length)];
    parts.push(head + body + tail);
  }
  return parts.join('') + '\n';
}

function buildBerserkerText() {
  const bars = ['▂', '▃', '▄', '▅', '▆', '▇'];
  const count = randInt(4, bars.length);
  let body = '';
  for (let i = 0; i < count; i++) {
    body += bars[i].repeat(randInt(1, 4));
  }
  const dashes = '—'.repeat(randInt(2, 4));
  const bangs = '！'.repeat(randInt(2, 5));
  return `${body}${dashes}${bangs}\n`;
}

const FIXED_RESIDENT_TEXTS = {
  'Kingprotea.txt':
    '嘎哦——！我要把你吃掉啰！……骗你的啦，吓到了吗？……那个，这里有点窄，我都动不了了……不过在虚数空间里的话，不管变大多少都不会被骂吧？',
  'Saber_Alter.txt':
    '我问你，你就是闯入这片黑影的御主吗？……哼，塞进来的居然不是汉堡包。算了，下次再来的时候，记得顺手带一份薯条。',
  'Blonde_Passerby.txt':
    '趁现在把东西删掉的话，还能以人类的身份结束。……慢着，你这杂修往这片黑影里塞了些什么秽物，本王可没允许这种东西待在身侧！',
};

const TIAMAT_RE = /^(?:[Aa]a{4,14}(?:……|…………|——|……？|——！)){2,4}$/;
const BERSERKER_RE = /^[▂▃▄▅▆▇]+—{2,4}！{2,5}$/;

function isUntouchedResidentFile(fullPath, fileName) {
  const name = fileName || path.basename(fullPath);
  if (!RESIDENT_FILENAMES.has(name)) return false;
  try {
    const lstat = fs.lstatSync(fullPath);
    if (lstat.isSymbolicLink() || !lstat.isFile() || lstat.size >= 512) {
      return false;
    }
    const content = fs.readFileSync(fullPath, 'utf8').trim();
    if (Object.prototype.hasOwnProperty.call(FIXED_RESIDENT_TEXTS, name)) {
      return content === FIXED_RESIDENT_TEXTS[name];
    }
    if (name === 'Tiamat.txt') {
      return TIAMAT_RE.test(content);
    }
    if (name === 'Berserker.txt') {
      return BERSERKER_RE.test(content);
    }
    return false;
  } catch {
    return false;
  }
}

function pickRandomResident() {
  const choices = [
    ['Tiamat.txt', buildTiamatText],
    ['Kingprotea.txt', () => FIXED_RESIDENT_TEXTS['Kingprotea.txt'] + '\n'],
    ['Saber_Alter.txt', () => FIXED_RESIDENT_TEXTS['Saber_Alter.txt'] + '\n'],
    ['Berserker.txt', buildBerserkerText],
    ['Blonde_Passerby.txt', () => FIXED_RESIDENT_TEXTS['Blonde_Passerby.txt'] + '\n'],
  ];
  const [fileName, builder] = choices[Math.floor(Math.random() * choices.length)];
  return [fileName, builder()];
}

function bitsToPath(baseDir, bits10) {
  const parts = Array.from(bits10, (b) => (b === '1' ? BRANCH_1 : BRANCH_0));
  return path.join(baseDir, SPACE_NAME, ...parts);
}

function pathToCoordTuple(spaceRoot, targetDir) {
  try {
    const rel = path.relative(path.resolve(spaceRoot), path.resolve(targetDir));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
    const parts = rel.split(/[\\/]/).filter((p) => p && p !== '.');
    if (parts.length !== 10) return null;
    let bits = '';
    for (const seg of parts) {
      if (seg === BRANCH_1) {
        bits += '1';
      } else if (seg === BRANCH_0) {
        bits += '0';
      } else {
        return null;
      }
    }
    const realPart = Number.parseInt(bits.slice(0, 5), 2);
    const imagPart = Number.parseInt(bits.slice(5, 10), 2);
    return [realPart, imagPart];
  } catch {
    return null;
  }
}

function formatAxisHint(diff) {
  if (diff === 0) return '正好吻合 ✔（这一轴已经锁定啦！）';
  if (diff >= -3 && diff < 0) return '稍微偏小（只差 1~3 步咯，往大微调！）';
  if (diff < -3) return '明显偏小（往大点猜！）';
  if (diff > 0 && diff <= 3) return '稍微偏大（只差 1~3 步咯，往小微调！）';
  return '明显偏大（往小点猜！）';
}

function measurePaperMoon(spaceRoot, currentReal, currentImag, userHitDirs) {
  if (!Array.isArray(userHitDirs) || userHitDirs.length === 0) return null;
  const coords = [];
  for (const d of userHitDirs) {
    const tuple = pathToCoordTuple(spaceRoot, d);
    if (tuple) coords.push(tuple);
  }
  if (coords.length === 0) return null;

  let bestTuple = coords[0];
  let minDist = Math.abs(currentReal - bestTuple[0]) + Math.abs(currentImag - bestTuple[1]);
  for (let i = 1; i < coords.length; i++) {
    const c = coords[i];
    const dist = Math.abs(currentReal - c[0]) + Math.abs(currentImag - c[1]);
    if (dist < minDist) {
      minDist = dist;
      bestTuple = c;
    }
  }

  let bar;
  let heatText;
  if (minDist <= 3) {
    bar = '[■■■■■■■■■□]';
    heatText = '滚烫！（就在隔壁几步路啦，塑料玩具都在发烫了！）';
  } else if (minDist <= 8) {
    bar = '[■■■■■■■□□□]';
    heatText = '温热！（已经摸到附近街区咯~）';
  } else if (minDist <= 16) {
    bar = '[■■■■■□□□□□]';
    heatText = '微温（方向差不多，还得再走几步~）';
  } else if (minDist <= 28) {
    bar = '[■■■□□□□□□□]';
    heatText = '冰凉（隔着老远呢，大胆跨步猜吧！）';
  } else {
    bar = '[■□□□□□□□□□]';
    heatText = '极寒（简直是南辕北辙嘛，前辈~）';
  }

  const reHint = formatAxisHint(currentReal - bestTuple[0]);
  const imHint = formatAxisHint(currentImag - bestTuple[1]);

  return {
    distance: minDist,
    bar,
    heatText,
    heat_text: heatText,
    reHint,
    re_hint: reHint,
    imHint,
    im_hint: imHint,
    targetReal: bestTuple[0],
    target_real: bestTuple[0],
    targetImag: bestTuple[1],
    target_imag: bestTuple[1],
  };
}

function parseCoordinate(rawInput) {
  const half = String(rawInput || '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[＋]/g, '+')
    .replace(/[－—–]/g, '-')
    .replace(/[ｉＩｊＪ]/g, 'i')
    .replace(/[，、：:]/g, ',')
    .trim();
  const unwrapped = half.replace(/^[【】\[\]()（）「」『』"'\s]+|[【】\[\]()（）「」『』"'\s]+$/g, '');
  const normalizedCmd = unwrapped.toLowerCase().replace(/[\s\-_]/g, '');
  if (RULE_BREAKER_ALIASES.has(normalizedCmd)) {
    return { isRuleBreaker: true, realPart: 0, imagPart: 0, coordStr: 'Rule Breaker' };
  }

  try {
    const lowerCoord = unwrapped.toLowerCase();
    let rStr;
    let imStr;
    const complexMatch = /^([+-]?\d+)\s*([+-])\s*(?:(\d+)\s*[ij]?|([ij]))$/.exec(lowerCoord);
    if (complexMatch) {
      rStr = complexMatch[1];
      const sign = complexMatch[2] === '-' ? '-' : '';
      const mag = complexMatch[3] !== undefined ? complexMatch[3] : '1';
      imStr = `${sign}${mag}`;
    } else {
      const pairMatch = /^([+-]?\d+)\s*(?:,\s*|\s+)([+-]?\d+)\s*[ij]?$/.exec(lowerCoord);
      if (!pairMatch) throw new Error('no match');
      rStr = pairMatch[1];
      imStr = pairMatch[2];
    }
    const rBig = BigInt(rStr);
    const imBig = BigInt(imStr);
    const realPart = Number(((rBig % 32n) + 32n) % 32n);
    const imagPart = Number(((imBig % 32n) + 32n) % 32n);
    return {
      isRuleBreaker: false,
      realPart,
      imagPart,
      coordStr: `${realPart}+${imagPart}i`,
      bits10: realPart.toString(2).padStart(5, '0') + imagPart.toString(2).padStart(5, '0'),
    };
  } catch {
    let h = 0n;
    let idx = 0n;
    for (const ch of half) {
      idx += 1n;
      h += BigInt(ch.codePointAt(0)) * idx;
    }
    const realPart = Number((((h >> 5n) % 32n) + 32n) % 32n);
    const imagPart = Number(((h % 32n) + 32n) % 32n);
    return {
      isRuleBreaker: false,
      realPart,
      imagPart,
      coordStr: `${realPart}+${imagPart}i`,
      bits10: realPart.toString(2).padStart(5, '0') + imagPart.toString(2).padStart(5, '0'),
    };
  }
}

function isSafeBaseDir(baseDir) {
  try {
    if (!baseDir) return false;
    const resolved = path.resolve(baseDir);
    const lstatSelf = fs.lstatSync(resolved);
    if (lstatSelf.isSymbolicLink() || !lstatSelf.isDirectory()) return false;
    const realPath = fs.realpathSync(resolved);
    if (realPath.length > 140) return false;
    const stat = fs.lstatSync(realPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    fs.accessSync(realPath, fs.constants.W_OK);
    let curr = realPath;
    while (true) {
      if (fs.lstatSync(curr).isSymbolicLink()) return false;
      const parent = path.dirname(curr);
      if (parent === curr) break;
      curr = parent;
    }
    return true;
  } catch {
    return false;
  }
}

function tryOpenFolder(_targetPath) {
  return false;
}

function inspectSpace(spaceRoot) {
  const userHitDirs = [];
  const residentDirs = [];
  const residentFiles = [];
  const mazeDirs = [];
  if (!isRealDirectory(spaceRoot)) {
    return { hitDirs: [], userHitDirs, residentDirs, residentFiles, mazeDirs };
  }

  function walk(currentDir, depth) {
    mazeDirs.push(currentDir);
    let hasUserAsset = false;
    let hasResident = false;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      userHitDirs.push(currentDir);
      return;
    }
    const safeSubdirs = [];

    for (const entry of entries) {
      const fullSub = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        hasUserAsset = true;
      } else if (entry.isDirectory()) {
        if (depth >= 10 || !MAZE_BRANCH_DIRS.has(entry.name)) {
          hasUserAsset = true;
        } else {
          safeSubdirs.push(fullSub);
        }
      } else if (isOsMetadataFile(fullSub, entry.name)) {
        continue;
      } else if (isUntouchedResidentFile(fullSub, entry.name)) {
        hasResident = true;
        residentFiles.push(fullSub);
      } else {
        hasUserAsset = true;
      }
    }

    if (hasUserAsset) {
      userHitDirs.push(currentDir);
    } else if (hasResident) {
      residentDirs.push(currentDir);
    }
    for (const sub of safeSubdirs) {
      walk(sub, depth + 1);
    }
  }

  walk(spaceRoot, 0);
  const hitDirs = userHitDirs.concat(residentDirs);
  return { hitDirs, userHitDirs, residentDirs, residentFiles, mazeDirs };
}

function hasResidentNamedFile(spaceRoot) {
  if (!isRealDirectory(spaceRoot)) return false;
  let found = false;

  function walk(currentDir, depth) {
    if (found) return;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found) return;
      const fullSub = path.join(currentDir, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (depth < 10 && MAZE_BRANCH_DIRS.has(entry.name)) {
          walk(fullSub, depth + 1);
        }
      } else if (RESIDENT_FILENAMES.has(entry.name)) {
        found = true;
        return;
      }
    }
  }

  walk(spaceRoot, 0);
  return found;
}

function ensureSafeDirStep(dirPath, verifiedDirs) {
  if (verifiedDirs && verifiedDirs.has(dirPath)) return;
  try {
    const st = fs.lstatSync(dirPath);
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw new Error('检测到虚数空间路径中存在非普通目录或符号链接，为保障文件安全已中止写入。');
    }
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      try {
        fs.mkdirSync(dirPath);
      } catch (mkErr) {
        if (!mkErr || mkErr.code !== 'EEXIST') throw mkErr;
      }
      const stAfter = fs.lstatSync(dirPath);
      if (stAfter.isSymbolicLink() || !stAfter.isDirectory()) {
        throw new Error('检测到虚数空间路径中存在非普通目录或符号链接，为保障文件安全已中止写入。');
      }
    } else {
      throw err;
    }
  }
  if (verifiedDirs) verifiedDirs.add(dirPath);
}

function ensureSafeMazeDir(baseDir, bits10, verifiedDirs = null) {
  let cur = path.join(path.resolve(baseDir), SPACE_NAME);
  ensureSafeDirStep(cur, verifiedDirs);
  for (const ch of bits10) {
    cur = path.join(cur, ch === '0' ? '[-i]' : '[+i]');
    ensureSafeDirStep(cur, verifiedDirs);
  }
  return cur;
}

function spawnLuckyResident(baseDir, excludeBits10) {
  const resolved = path.resolve(baseDir);
  const spaceRoot = path.join(resolved, SPACE_NAME);
  const resolvedSpaceRoot = path.resolve(spaceRoot);
  const { userHitDirs, residentFiles, mazeDirs } = inspectSpace(spaceRoot);
  const isCollapsedMaze = mazeDirs.length < 500;
  for (const oldFile of residentFiles) {
    try {
      fs.unlinkSync(oldFile);
    } catch {}
    if (isCollapsedMaze) {
      let cur = path.resolve(path.dirname(oldFile));
      while (cur !== resolvedSpaceRoot && cur.startsWith(resolvedSpaceRoot + path.sep)) {
        if (!tryRemoveEmptyMazeDir(cur)) {
          break;
        }
        cur = path.dirname(cur);
      }
    }
  }

  const occupiedPaths = new Set(userHitDirs.map((d) => path.resolve(d)));
  const candidates = [];
  for (let i = 0; i < 1024; i++) {
    const b10 = i.toString(2).padStart(10, '0');
    if (b10 === excludeBits10) continue;
    const candidatePath = path.resolve(bitsToPath(resolved, b10));
    if (!occupiedPaths.has(candidatePath)) {
      candidates.push(b10);
    }
  }
  if (candidates.length === 0) {
    return { luckyCoordStr: null, luckyResidentFile: null, luckyPath: null };
  }
  const luckyBits = candidates[Math.floor(Math.random() * candidates.length)];

  const luckyReal = Number.parseInt(luckyBits.slice(0, 5), 2);
  const luckyImag = Number.parseInt(luckyBits.slice(5), 2);
  const luckyCoordStr = `${luckyReal}+${luckyImag}i`;
  const luckyPath = bitsToPath(resolved, luckyBits);

  const [residentFile, residentText] = pickRandomResident();
  if (isSafeBaseDir(resolved)) {
    ensureSafeMazeDir(resolved, luckyBits);
  } else if (!isRealDirectory(luckyPath)) {
    throw new Error('目标受限目录无法创建新的隐藏嘉宾房间。');
  }
  const residentFullPath = path.join(luckyPath, residentFile);
  let targetOccupied = false;
  try {
    fs.lstatSync(residentFullPath);
    targetOccupied = true;
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
  }
  if (targetOccupied) {
    return { luckyCoordStr: null, luckyResidentFile: null, luckyPath: null };
  }
  try {
    fs.writeFileSync(residentFullPath, residentText, { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return { luckyCoordStr: null, luckyResidentFile: null, luckyPath: null };
    }
    throw err;
  }

  return { luckyCoordStr, luckyResidentFile: residentFile, luckyPath };
}

const lastAssignedSecretDirs = new Map();

function getLastAssignedSecretDir(baseDir) {
  return lastAssignedSecretDirs.get(path.resolve(baseDir)) || null;
}

function deploySpace(baseDir) {
  const resolved = path.resolve(baseDir);
  if (!isSafeBaseDir(resolved)) {
    throw new Error('这个文件夹路径已经超过 140 个字符，或者没有写入权限呢，再往里套 10 层迷宫连系统都会罢工的啦！');
  }
  const verifiedDirs = new Set();
  for (let i = 0; i < 1024; i++) {
    const bits10 = i.toString(2).padStart(10, '0');
    ensureSafeMazeDir(resolved, bits10, verifiedDirs);
  }
  const realPart = Math.floor(Math.random() * 32);
  const imagPart = Math.floor(Math.random() * 32);
  const bits10 = realPart.toString(2).padStart(5, '0') + imagPart.toString(2).padStart(5, '0');
  const secretPath = bitsToPath(resolved, bits10);
  const coordStr = `${realPart}+${imagPart}i`;
  lastAssignedSecretDirs.set(resolved, path.resolve(secretPath));
  const { luckyCoordStr, luckyResidentFile, luckyPath } = spawnLuckyResident(resolved, bits10);
  const opened = module.exports.tryOpenFolder(secretPath);

  return {
    coordStr,
    secretPath,
    luckyCoordStr,
    luckyResidentFile,
    luckyPath,
    totalLeaves: 1024,
    opened,
  };
}

function inspectRoomStatus(targetPath) {
  if (!isRealDirectory(targetPath)) {
    return { roomStatus: 'empty', residentName: null };
  }
  let entries = [];
  try {
    entries = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch {
    return { roomStatus: 'empty', residentName: null };
  }
  if (entries.length === 0) {
    return { roomStatus: 'empty', residentName: null };
  }
  let hasUserAsset = false;
  let residentName = null;
  for (const entry of entries) {
    const fullSub = path.join(targetPath, entry.name);
    if (entry.isSymbolicLink() || entry.isDirectory()) {
      hasUserAsset = true;
    } else if (isOsMetadataFile(fullSub, entry.name)) {
      continue;
    } else if (isUntouchedResidentFile(fullSub, entry.name)) {
      residentName = entry.name;
    } else {
      hasUserAsset = true;
    }
  }
  if (hasUserAsset) {
    return { roomStatus: 'user_asset', residentName };
  }
  if (residentName) {
    return { roomStatus: 'resident_only', residentName };
  }
  return { roomStatus: 'empty', residentName: null };
}

function jumpCoordinate(baseDir, rawInput) {
  const resolved = path.resolve(baseDir);
  const spaceRoot = path.join(resolved, SPACE_NAME);
  const parsed = parseCoordinate(rawInput);

  if (parsed.isRuleBreaker) {
    lastAssignedSecretDirs.delete(resolved);
    const { userHitDirs, residentDirs, residentFiles, mazeDirs } = inspectSpace(spaceRoot);

    let removedCount = 0;
    let removedRoomCount = 0;
    for (let i = mazeDirs.length - 1; i >= 0; i--) {
      const dirPath = mazeDirs[i];
      if (tryRemoveEmptyMazeDir(dirPath)) {
        removedCount++;
        const relParts = path.relative(spaceRoot, dirPath).split(path.sep).filter(Boolean);
        if (relParts.length === 10) {
          removedRoomCount++;
        }
      }
    }

    if (removedCount <= 30 && residentFiles.length > 0) {
      const residentNames = residentFiles.map((rf) => path.basename(rf));
      return {
        mode: 'rule_breaker_second',
        removedCount: 0,
        removedRoomCount: 0,
        survivingDirs: userHitDirs.slice(),
        userSurvivingDirs: userHitDirs.slice(),
        residentSurvivingDirs: residentDirs.slice(),
        residentFiles,
        residentNames,
        message: '警告 · 权限越界 —— 连砍第二发 Rule Breaker，是否要除掉可怜的英灵？',
      };
    }

    if (removedCount <= 30 && residentFiles.length === 0) {
      return {
        mode: 'rule_breaker_third',
        removedCount: 0,
        removedRoomCount: 0,
        survivingDirs: userHitDirs.slice(),
        userSurvivingDirs: userHitDirs.slice(),
        residentSurvivingDirs: [],
        residentFiles: [],
        message: '警告 · 致命指令拦截 · 深夜特别节目信号中断 —— 第三发 Rule Breaker 触发强制断开连接。',
      };
    }

    const survivingDirs = userHitDirs.concat(residentDirs);
    const userSurvivingDirs = userHitDirs.slice();
    const residentSurvivingDirs = residentDirs.slice();
    for (const d of userSurvivingDirs.slice(0, 3)) {
      if (isRealDirectory(d)) {
        module.exports.tryOpenFolder(d);
      }
    }
    return {
      mode: 'rule_breaker',
      removedCount,
      removedRoomCount,
      survivingDirs,
      userSurvivingDirs,
      residentSurvivingDirs,
      residentFiles,
      message: 'Rule Breaker —— 空的迷宫房间已经全部帮前辈清掉啦，塞了东西的房间完好无损地留着哦~',
    };
  }

  const targetPath = bitsToPath(resolved, parsed.bits10);
  const lastAssigned = lastAssignedSecretDirs.get(resolved) || null;
  const lastAssignedExists = Boolean(
    lastAssigned &&
      isRealDirectory(spaceRoot) &&
      isRealDirectory(lastAssigned) &&
      path.resolve(lastAssigned).startsWith(path.resolve(spaceRoot) + path.sep)
  );
  let { roomStatus, residentName } = inspectRoomStatus(targetPath);
  let hasOtherUserAssets = false;
  let paperMoon = null;
  if (roomStatus === 'empty') {
    if (lastAssignedExists && path.resolve(targetPath) === path.resolve(lastAssigned)) {
      roomStatus = 'assigned_empty';
      if (isSafeBaseDir(resolved)) {
        ensureSafeMazeDir(resolved, parsed.bits10);
      }
    } else {
      const { userHitDirs } = inspectSpace(spaceRoot);
      const probeDirs =
        userHitDirs.length > 0 ? userHitDirs : lastAssignedExists ? [lastAssigned] : [];
      hasOtherUserAssets = probeDirs.length > 0;
      if (hasOtherUserAssets) {
        paperMoon = measurePaperMoon(spaceRoot, parsed.realPart, parsed.imagPart, probeDirs);
      }
    }
  }
  let opened = false;
  if (isRealDirectory(targetPath) && !(roomStatus === 'empty' && hasOtherUserAssets)) {
    opened = module.exports.tryOpenFolder(targetPath);
  }
  return {
    mode: 'jump',
    realPart: parsed.realPart,
    real_part: parsed.realPart,
    imagPart: parsed.imagPart,
    imag_part: parsed.imagPart,
    coordStr: parsed.coordStr,
    coord_str: parsed.coordStr,
    targetPath,
    target_path: targetPath,
    roomStatus,
    room_status: roomStatus,
    residentName,
    resident_name: residentName,
    hasOtherUserAssets,
    has_other_user_assets: hasOtherUserAssets,
    paperMoon,
    paper_moon: paperMoon,
    opened,
    message: `虚数空间·强制传送完毕~☆ 已帮前辈打开座标 [${parsed.coordStr}]`,
  };
}

function eliminateResident(baseDir) {
  const resolved = path.resolve(baseDir);
  lastAssignedSecretDirs.delete(resolved);
  const spaceRoot = path.join(resolved, SPACE_NAME);
  const { userHitDirs, residentFiles, mazeDirs } = inspectSpace(spaceRoot);

  const eliminatedNames = [];
  for (const rf of residentFiles) {
    try {
      fs.unlinkSync(rf);
      eliminatedNames.push(path.basename(rf));
    } catch {}
  }

  const resolvedSpaceRoot = path.resolve(spaceRoot);
  let collapsedDirs = 0;
  for (let i = mazeDirs.length - 1; i >= 0; i--) {
    if (path.resolve(mazeDirs[i]) === resolvedSpaceRoot) {
      continue;
    }
    if (tryRemoveEmptyMazeDir(mazeDirs[i])) {
      collapsedDirs++;
    }
  }

  return {
    eliminatedNames,
    collapsedDirs,
    survivingUserDirs: userHitDirs.filter((d) => isRealDirectory(d)),
  };
}

function quickCleanSpace(baseDir) {
  const resolved = path.resolve(baseDir);
  lastAssignedSecretDirs.delete(resolved);
  const spaceRoot = path.join(resolved, SPACE_NAME);
  if (!isRealDirectory(spaceRoot)) {
    return {
      survivingUserDirs: [],
      surviving_user_dirs: [],
      residentKept: false,
      resident_kept: false,
    };
  }
  const { userHitDirs, residentFiles, mazeDirs } = inspectSpace(spaceRoot);

  if (userHitDirs.length === 0) {
    for (const rf of residentFiles) {
      try {
        fs.unlinkSync(rf);
      } catch {}
    }
  }

  for (let i = mazeDirs.length - 1; i >= 0; i--) {
    tryRemoveEmptyMazeDir(mazeDirs[i]);
  }

  if (isRealDirectory(spaceRoot)) {
    tryRemoveEmptyMazeDir(spaceRoot);
  }

  const surviving = userHitDirs.filter((d) => isRealDirectory(d));
  const residentKept = userHitDirs.length > 0 && residentFiles.length > 0;
  return {
    survivingUserDirs: surviving,
    surviving_user_dirs: surviving,
    residentKept,
    resident_kept: residentKept,
  };
}

module.exports = {
  SPACE_NAME,
  BRANCH_0,
  BRANCH_1,
  RULE_BREAKER_ALIASES,
  RESIDENT_FILENAMES,
  OS_METADATA_FILENAMES,
  isRealDirectory,
  isOsMetadataFile,
  tryRemoveEmptyMazeDir,
  buildTiamatText,
  buildBerserkerText,
  isUntouchedResidentFile,
  pickRandomResident,
  bitsToPath,
  pathToCoordTuple,
  measurePaperMoon,
  parseCoordinate,
  resolveCoordinate: parseCoordinate,
  isSafeBaseDir,
  tryOpenFolder,
  getLastAssignedSecretDir,
  inspectSpace,
  hasResidentNamedFile,
  spawnLuckyResident,
  deploySpace,
  jumpCoordinate,
  eliminateResident,
  quickCleanSpace,
};
