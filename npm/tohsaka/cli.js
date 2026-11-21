#!/usr/bin/env node
'use strict';

const readline = require('readline');
const tohsaka = require('./index.js');

if (process.stdout && typeof process.stdout.on === 'function') {
  process.stdout.on('error', () => process.exit(0));
}
let isFinaleLockedPhase = false;

process.on('SIGINT', () => {
  if (isFinaleLockedPhase) {
    console.log('\n[Tohsaka · 书房时计] 怀表虽已合上，门外的叩门声却并未止歇……愿阁下今日尚能维持从容。');
  } else {
    console.log('\n[Tohsaka · 书房时计] 已为您合上怀表，取消本次闹钟。愿您今日亦能维持从容。');
  }
  process.exit(0);
});

const args = process.argv.slice(2);
let dryRun = false;
let chimeMode = false;
let helpMode = false;
let versionMode = false;
let interactiveMode = false;
let quotesSalonMode = false;
let codexQuery = '';

const cliWarnings = [];
const cleanArgs = [];

const CODEX_FLAGS = new Set([
  '--codex',
  '-codex',
  '--collation',
  '-collation',
  '--manuscript',
  '--salon',
  '-salon',
  '--quotes',
  '--aphorisms',
  '-s',
]);

const EXPLICIT_POS_COMP_FLAG_RE = /^(?:--compensate|--add-hour)$/i;
const PLUS_ONE_HOUR_TOKEN_RE =
  /^\+\s*(?:1h|1hr|1hour|60m|60min|60mins|01:00|1小时|1个小时|一小时|一个小时|壹小时|1钟头|1个钟头|一钟头|一个钟头|壹钟头|60分钟|六十分钟|60分|3600秒|3600s)$/i;
const STANDALONE_NEG_COMP_RE =
  /^-\s*(?:1h|1hr|1hour|60m|60min|60mins|01:00|1小时|1个小时|一小时|一个小时|壹小时|1钟头|1个钟头|一钟头|一个钟头|壹钟头|60分钟|六十分钟|60分|3600秒|3600s)$/i;

for (let i = 0; i < args.length; i++) {
  const arg = String(args[i] || '').trim();
  if (!arg) continue;
  const lower = arg.toLowerCase();

  if (lower === '--version' || lower === '-v' || arg === '-V') {
    versionMode = true;
    continue;
  }
  if (lower === '--dry-run' || lower === '--dryrun' || lower === '-n') {
    dryRun = true;
    continue;
  }
  if (lower === '--chime' || lower === '--chimes' || lower === '--clock' || lower === '-c') {
    chimeMode = true;
    continue;
  }
  if (lower === '--help' || lower === '-h' || lower === 'help' || lower === '/?') {
    helpMode = true;
    continue;
  }
  if (lower === '--interactive' || lower === '-i') {
    interactiveMode = true;
    continue;
  }
  if (CODEX_FLAGS.has(lower)) {
    quotesSalonMode = true;
    continue;
  }
  if (lower.startsWith('--codex=') || lower.startsWith('--salon=') || lower.startsWith('--collation=')) {
    quotesSalonMode = true;
    codexQuery = arg.split('=')[1] || '';
    continue;
  }

  if (tohsaka.FORBIDDEN_CLI_FLAGS.has(lower)) {
    cliWarnings.push(tohsaka.warnNoBuffer(arg));
    continue;
  }

  if (tohsaka.FORBIDDEN_MUTE_FLAGS.has(lower)) {
    cliWarnings.push(tohsaka.warnMuteSnooze(arg));
    continue;
  }

  if (lower.startsWith('--offset=') || lower.startsWith('--buffer=')) {
    const val = arg.split('=')[1];
    if (val !== '60') {
      cliWarnings.push(tohsaka.warnOffsetOverride(val, arg));
    }
    continue;
  }

  if (lower === '--offset' || lower === '--buffer') {
    const candidate = args[i + 1] !== undefined ? String(args[i + 1]).trim() : '';
    const canConsume =
      Boolean(candidate) &&
      /^(?:[+-]?\d+(?:\.\d+)?(?:m|min|mins|h|hr|hrs|分|分钟|小时|钟头)?|none|off|false|zero)$/i.test(candidate);
    const nextVal = canConsume ? candidate : '';
    if (canConsume) {
      i += 1;
    }
    if (nextVal !== '60') {
      const argDisplay = nextVal ? `${arg} ${nextVal}` : arg;
      cliWarnings.push(tohsaka.warnOffsetOverride(null, argDisplay));
    }
    continue;
  }

  if (EXPLICIT_POS_COMP_FLAG_RE.test(arg)) {
    cliWarnings.push(tohsaka.warnReverseCompensate(arg));
    continue;
  }

  if (STANDALONE_NEG_COMP_RE.test(arg)) {
    cliWarnings.push(
      `[Tohsaka · 缓冲规制] 检测到试图抵消提前量的负偏移参数 "${arg}"。该请求已温和驳回，仍保留标准的 60 分钟提前量。`
    );
    continue;
  }

  if (arg.startsWith('-') && !/^-\d/.test(arg)) {
    cliWarnings.push(
      `[Tohsaka · 选项提示] 未识别的命令行参数 "${arg}" 已为您略过；如需查阅用法说明，请使用 --help。`
    );
    continue;
  }

  cleanArgs.push(arg);
}

if (cleanArgs.some((a) => PLUS_ONE_HOUR_TOKEN_RE.test(a))) {
  const nonPlusTokens = cleanArgs.filter((a) => !PLUS_ONE_HOUR_TOKEN_RE.test(a));
  let hasOtherTime = false;
  if (nonPlusTokens.length > 0) {
    const { targetStr } = tohsaka.resolveCliPositionalArgs(nonPlusTokens);
    hasOtherTime = tohsaka.isLikelyTimeInput(targetStr);
  }
  if (hasOtherTime) {
    const filteredClean = [];
    for (const a of cleanArgs) {
      if (PLUS_ONE_HOUR_TOKEN_RE.test(a)) {
        cliWarnings.push(tohsaka.warnReverseCompensate(a));
      } else {
        filteredClean.push(a);
      }
    }
    cleanArgs.length = 0;
    cleanArgs.push(...filteredClean);
  }
}

const sysNow = new Date();
const report = tohsaka.chime(sysNow);

function printHelp() {
  console.log(`Tohsaka v${tohsaka.VERSION} — 永远提前一小时的闹钟 · 当前读数 ${report.tohsakaFormatted} / 物理时间 ${report.physicalFormatted}\n`);
  console.log('用法:');
  console.log('  npx tohsaka                             # 启动交互式定时，含古本箴言与随笔轮播');
  console.log('  npx tohsaka --chime                     # 查看 +1h 报时与今日箴言');
  console.log('  npx tohsaka --version                   # 查看当前版本与书房时计读数');
  console.log('  npx tohsaka --codex [目录|条数|旧札|词] # 翻阅《远坂四十八手》古本、总目与 25 篇旧札');
  console.log('  npx tohsaka <时间> [事务名称]           # 设定目标时间，固定提前 60 分钟响铃');
  console.log('  npx tohsaka 02:00 "关键事务" --dry-run   # 预览校准、双线框候场展卷与响铃效果');
  console.log('\n支持的时间格式，均自动静默识别:');
  console.log('  02:00 / 1430 / 2026-11-20 14:00 / 下午2点半 / 明早8点 / 半夜2点 / 正午 / 午夜 / 90分钟后 / 60m10s');
}

function executeAlarmPlan(targetStrInput, taskLabelInput) {
  try {
    const planNow = new Date();
    const plan = tohsaka.calibrate(targetStrInput, planNow);
    const targetFmt = tohsaka.formatTime(plan.targetAt);
    const triggerFmt = tohsaka.formatTime(plan.triggerAt);
    const allWarnings = [...cliWarnings, ...(plan.warnings || [])];

    const printPlanHeader = () => {
      console.log(`[Tohsaka · 书房核准] 事务 : ${taskLabelInput}`);
      console.log(`[Tohsaka · 书房核准] 目标 : ${targetFmt}`);
      console.log(`[Tohsaka · 书房核准] 响铃 : ${triggerFmt} · 固定提前 60 分钟`);
      console.log(`[Tohsaka · 书房核准] 读数 : ${tohsaka.formatTime(plan.tohsakaNow)} · 物理时间 ${tohsaka.formatTime(planNow)}`);

      if (allWarnings.length > 0) {
        console.log('');
        for (const w of allWarnings) {
          console.log(w);
        }
      }
      console.log('');
    };

    const ringLoop = () => {
      let wave = 1;
      let activeCadenceTimers = [];
      let stopped = false;

      const clearCadenceTimers = () => {
        if (activeCadenceTimers.length > 0) {
          for (const timerId of activeCadenceTimers) {
            clearTimeout(timerId);
          }
          activeCadenceTimers = [];
        }
      };

      const emitWave = (afterWavePrinted) => {
        clearCadenceTimers();
        const currentWave = wave;
        wave += 1;
        if (!dryRun && process.stdout.isTTY) {
          tohsaka.clearTerminalScreen();
          printPlanHeader();
        }
        const currNow = new Date();
        const remMin = Math.max(
          0,
          Math.ceil((plan.targetAt.getTime() - currNow.getTime()) / 60000)
        );
        const bar = tohsaka.formatBufferProgressBar(plan.isWithinBuffer ? remMin : Math.min(60, remMin));
        const cadenceRes = tohsaka.ringWakeupCadence({
          taskLabel: taskLabelInput,
          targetFormatted: targetFmt,
          remainingMinutes: remMin,
          waveIndex: currentWave,
          blockingBurst: !dryRun,
          onComplete: ({ headline }) => {
            activeCadenceTimers = [];
            if (stopped) return;
            console.log(headline);
            console.log(`  ${bar}`);
            console.log(`\n  「${tohsaka.IRREVERSIBLE_TIME_EPIGRAPH.text}」`);
            for (const verseLine of tohsaka.IRREVERSIBLE_TIME_EPIGRAPH.original.split(' / ')) {
              console.log(`  ${verseLine}`);
            }
            console.log(`  —— ${tohsaka.IRREVERSIBLE_TIME_EPIGRAPH.author}\n`);
            if (plan.isWithinBuffer) {
              console.log(`  距离 ${targetFmt} 已不足 1 小时，仅余 ${remMin} 分钟，已略过等待直接响铃。`);
            } else {
              console.log(
                `  书房内唯余红木立钟指向 ${tohsaka.formatTime(tohsaka.now(currNow))} 独自鸣响，案头镇纸下压着一页字条：「凡事预留一小时余裕，纵有变数亦足从容应对——请整顿衣冠，静候关键时刻。」`
              );
            }
            if (typeof afterWavePrinted === 'function') {
              afterWavePrinted();
            }
          },
        });
        activeCadenceTimers = Array.isArray(cadenceRes.timers) ? cadenceRes.timers : [];
      };

      if (dryRun || !process.stdout.isTTY) {
        printPlanHeader();
      }

      if (dryRun) {
        emitWave();
        console.log('\n[Tohsaka · 候场展卷双线框预览]');
        console.log(
          tohsaka.stylizeStudyTerminal(
            tohsaka.formatCountdownFolioPage({
              taskLabel: taskLabelInput,
              targetFormatted: targetFmt,
              triggerFormatted: triggerFmt,
              tohsakaFormatted: tohsaka.formatTime(plan.tohsakaNow),
              physicalFormatted: tohsaka.formatTime(planNow),
              quoteStep: 0,
              quoteObj: tohsaka.pickRandomAphorism(),
              essayProgress: null,
            })
          )
        );
        const essays = tohsaka.getCountdownQuotes('complaint');
        if (essays.length > 0) {
          console.log('');
          console.log(tohsaka.formatCountdownQuoteLine(essays[0]));
        }
        setTimeout(() => process.exit(0), 250);
        return;
      }

      if (!process.stdin.isTTY) {
        emitWave(() => {
          setTimeout(() => process.exit(0), 50);
        });
        return;
      }

      let nagTimer = null;
      const scheduleNextNag = () => {
        if (stopped) return;
        nagTimer = setTimeout(() => {
          nagTimer = null;
          if (stopped) return;
          emitWave(() => {
            if (!stopped) {
              console.log('\n  尚未按 [Enter] 确认清醒，继续响铃...');
              scheduleNextNag();
            }
          });
        }, 8000);
      };

      emitWave(() => {
        if (!stopped) {
          console.log('\n  按 [Enter] 键停止响铃，未确认则每 8 秒继续清屏响铃...');
          scheduleNextNag();
        }
      });

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const stopRingingCleanup = () => {
        stopped = true;
        clearCadenceTimers();
        if (nagTimer) {
          clearTimeout(nagTimer);
          nagTimer = null;
        }
      };
      rl.on('SIGINT', () => {
        stopRingingCleanup();
        rl.close();
        process.emit('SIGINT');
      });
      rl.once('line', () => {
        stopRingingCleanup();
        rl.close();
        console.log(
          '[Tohsaka · 书房时计] 钟声止歇，书房重归寂静。案头字条末行写着：「请善用剩下的 60 分钟缓冲期，切莫辜负这份从容。」'
        );
        process.exit(0);
      });
      rl.once('close', () => {
        if (stopped) return;
        stopRingingCleanup();
        console.log('\n[Tohsaka · 书房时计] 输入流已闭合，钟声止歇，书房重归寂静。');
        process.exit(0);
      });
    };

    if (dryRun || plan.isWithinBuffer) {
      ringLoop();
    } else {
      const totalWaitSeconds = Math.max(0, (plan.triggerAt.getTime() - Date.now()) / 1000);
      const director = new tohsaka.CountdownTimelineDirector(totalWaitSeconds);
      const totalNotesCount = tohsaka.getCountdownQuotes('complaint').length || 25;
      let quoteStep = 0;
      let currentFrame = null;
      const frameHistory = [];
      let frameHistoryCursor = -1;
      let isLocked = false;
      let finaleForced = false;
      let escapementTick = 0;
      let inlineCodexView = null; // null | { mode: 'hand', handIdx: number, leaf: 'upper'|'lower' } | { mode: 'note', noteNo: number }

      const renderCurrentCountdownFrame = (nowMs) => {
        const curNow = new Date(nowMs);
        tohsaka.clearTerminalScreen();
        if (allWarnings.length > 0) {
          for (const w of allWarnings) {
            console.log(w);
          }
          console.log('');
        }
        console.log(
          tohsaka.stylizeStudyTerminal(
            tohsaka.formatCountdownFolioPage({
              taskLabel: taskLabelInput,
              targetFormatted: targetFmt,
              triggerFormatted: triggerFmt,
              tohsakaFormatted: tohsaka.formatTime(tohsaka.now(curNow)),
              physicalFormatted: tohsaka.formatTime(curNow),
              quoteStep: currentFrame.step,
              quoteObj: currentFrame.quote,
              essayProgress: currentFrame.essayProgress,
            })
          )
        );
        console.log('');
      };

      const isInlineLeafOverflow = (handIdx, leaf) => {
        const hand = tohsaka.ANCIENT_CODEX_HANDS[handIdx] || tohsaka.ANCIENT_CODEX_HANDS[0];
        return leaf === 'lower'
          ? tohsaka.isCodexLowerLeafOverflowing(hand)
          : tohsaka.isCodexUpperLeafOverflowing(hand);
      };

      const renderInlineCodexView = () => {
        if (!inlineCodexView) return;
        tohsaka.clearTerminalScreen();
        const { boxInnerWidth } = tohsaka.getTerminalViewportSize();
        const hintBar = tohsaka.makeSingleBoxBar(
          '[候场阅卷] ←/→/N/P 翻页 | Tab 切上下叶 | C/B/Esc 返回候场 | Ctrl+C 退出',
          boxInnerWidth
        );
        if (inlineCodexView.mode === 'note') {
          console.log(tohsaka.stylizeStudyTerminal(tohsaka.formatCodexNotePage(inlineCodexView.noteNo)));
          console.log(tohsaka.stylizeStudyTerminal(hintBar.join('\n')));
          console.log('');
          return;
        }
        const pageIndex = 3 + inlineCodexView.handIdx * 2 + (inlineCodexView.leaf === 'lower' ? 1 : 0);
        const overflowing = isInlineLeafOverflow(inlineCodexView.handIdx, inlineCodexView.leaf);
        let activeSub = inlineCodexView.subWindow || 'auto';
        if (activeSub === 'auto' && overflowing) {
          activeSub = 'partA';
          inlineCodexView.subWindow = 'partA';
        } else if (!overflowing) {
          activeSub = 'auto';
        }
        console.log(tohsaka.stylizeStudyTerminal(tohsaka.formatCodexPage(pageIndex, activeSub, 'safe', false)));
        console.log(tohsaka.stylizeStudyTerminal(hintBar.join('\n')));
        console.log('');
      };

      const writeStatusFooter = (nowMs) => {
        if (!process.stdout.isTTY) return;
        const remMs = Math.max(0, plan.triggerAt.getTime() - nowMs);
        const remSec = Math.ceil(remMs / 1000);
        const curNow = new Date(nowMs);
        const activeDur = tohsaka.getQuoteDisplayDuration(currentFrame ? currentFrame.quote : null);
        const frames = tohsaka.ESCAPEMENT_FRAMES || ['◴', '◷', '◶', '◵'];
        const gearIcon = isLocked ? '❖' : frames[escapementTick % frames.length];
        escapementTick += 1;
        const useColor = tohsaka.shouldEnableStudyColor ? tohsaka.shouldEnableStudyColor() : !process.env.NO_COLOR;
        const remRaw = tohsaka.formatRemainingDuration(remSec);
        const { cols } = tohsaka.getTerminalViewportSize();
        const statusLine = tohsaka
          .formatCountdownStatusLine({
            gearIcon,
            tohsakaTimeStr: tohsaka.formatTime(tohsaka.now(curNow)),
            physicalTimeStr: tohsaka.formatTime(curNow),
            remStr: remRaw,
            frameDuration: activeDur,
            isLocked,
            inlineCodexActive: Boolean(inlineCodexView),
            finaleForced: finaleForced || remSec <= 15,
            cols,
            useColor,
          })
          .replace(/\x1b\[K$/, '');
        process.stdout.write(`${statusLine}\x1b[K`);
      };

      const advanceCountdownFrame = (nowMs, forceNew = false) => {
        if (!forceNew && frameHistoryCursor + 1 < frameHistory.length) {
          frameHistoryCursor += 1;
          currentFrame = frameHistory[frameHistoryCursor];
        } else {
          const { quote, essayProgress } = director.nextFrame();
          currentFrame = { quote, essayProgress, step: quoteStep };
          quoteStep += 1;
          frameHistory.push(currentFrame);
          frameHistoryCursor = frameHistory.length - 1;
        }
        renderCurrentCountdownFrame(nowMs);
      };

      const rewindCountdownFrame = (nowMs) => {
        if (frameHistoryCursor > 0) {
          frameHistoryCursor -= 1;
          currentFrame = frameHistory[frameHistoryCursor];
          renderCurrentCountdownFrame(nowMs);
          return true;
        }
        return false;
      };

      if (totalWaitSeconds <= 15.0) {
        director.finaleLocked = true;
      }
      advanceCountdownFrame(Date.now());
      finaleForced = Boolean(director.finaleLocked);
      isFinaleLockedPhase = finaleForced;
      let lastQuoteNs = process.hrtime.bigint();

      const canUseRawKeys =
        !dryRun &&
        Boolean(process.stdin && process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') &&
        Boolean(process.stdout && process.stdout.isTTY);

      let onKeyData = null;
      const cleanupCountdownKeys = () => {
        if (canUseRawKeys) {
          if (onKeyData) {
            process.stdin.removeListener('data', onKeyData);
            onKeyData = null;
          }
          try {
            process.stdin.setRawMode(false);
          } catch (_) {
            // ignore
          }
          try {
            process.stdin.pause();
          } catch (_) {
            // ignore
          }
        }
      };

      if (canUseRawKeys) {
        try {
          process.stdin.setRawMode(true);
          process.stdin.resume();
          process.stdin.setEncoding('utf8');
          onKeyData = (chunk) => {
            const key = String(chunk || '');
            if (!key) return;
            const nowMs = Date.now();
            const remSec = (plan.triggerAt.getTime() - nowMs) / 1000;
            if (key.includes('\u0003')) {
              const inFinale = Boolean(finaleForced || isFinaleLockedPhase || remSec <= 15.0);
              cleanupCountdownKeys();
              if (inFinale) {
                console.log('\n[Tohsaka · 书房时计] 怀表虽已合上，门外的叩门声却并未止歇……愿阁下今日尚能维持从容。');
              } else {
                console.log('\n[Tohsaka · 书房时计] 已为您合上怀表，取消本次闹钟。愿您今日亦能维持从容。');
              }
              process.exit(0);
              return;
            }
            if (remSec <= 15.0) {
              isFinaleLockedPhase = true;
              return;
            }
            let lowerKey = key.toLowerCase();
            if (key === '\u001b[C' || key === '\u001b[B' || key === '\u001bOC' || key === '\u001bOB') {
              lowerKey = 'n';
            } else if (key === '\u001b[D' || key === '\u001b[A' || key === '\u001bOD' || key === '\u001bOA') {
              lowerKey = 'p';
            }
            if ((lowerKey === 'l' || key === ' ') && !inlineCodexView) {
              isLocked = !isLocked;
              if (!isLocked) {
                lastQuoteNs = process.hrtime.bigint();
              }
              writeStatusFooter(nowMs);
            } else if (key === '\t') {
              if (inlineCodexView && inlineCodexView.mode === 'hand') {
                inlineCodexView.leaf = inlineCodexView.leaf === 'upper' ? 'lower' : 'upper';
                inlineCodexView.subWindow = isInlineLeafOverflow(inlineCodexView.handIdx, inlineCodexView.leaf)
                  ? 'partA'
                  : 'auto';
                renderInlineCodexView();
                writeStatusFooter(nowMs);
              }
            } else if (lowerKey === 'c') {
              if (!inlineCodexView) {
                const q = currentFrame ? currentFrame.quote : null;
                if (q && q.category === 'complaint') {
                  inlineCodexView = {
                    mode: 'note',
                    noteNo: Number(q.essayIndex) || 1,
                  };
                } else {
                  const hIdx = Math.max(0, Math.min(47, (Number(q && q.handIndex) || 1) - 1));
                  inlineCodexView = {
                    mode: 'hand',
                    handIdx: hIdx,
                    leaf: 'upper',
                    subWindow: isInlineLeafOverflow(hIdx, 'upper') ? 'partA' : 'auto',
                  };
                }
                renderInlineCodexView();
                writeStatusFooter(nowMs);
              } else {
                inlineCodexView = null;
                lastQuoteNs = process.hrtime.bigint();
                renderCurrentCountdownFrame(nowMs);
                writeStatusFooter(nowMs);
              }
            } else if (lowerKey === 'b' || key === '\u001b') {
              if (inlineCodexView) {
                inlineCodexView = null;
                lastQuoteNs = process.hrtime.bigint();
                renderCurrentCountdownFrame(nowMs);
                writeStatusFooter(nowMs);
              }
            } else if (lowerKey === 'n') {
              if (inlineCodexView) {
                if (inlineCodexView.mode === 'note') {
                  inlineCodexView.noteNo = (inlineCodexView.noteNo % totalNotesCount) + 1;
                } else if (
                  inlineCodexView.subWindow === 'partA' &&
                  isInlineLeafOverflow(inlineCodexView.handIdx, inlineCodexView.leaf)
                ) {
                  inlineCodexView.subWindow = 'partB';
                } else if (inlineCodexView.leaf === 'upper') {
                  inlineCodexView.leaf = 'lower';
                  inlineCodexView.subWindow = isInlineLeafOverflow(inlineCodexView.handIdx, 'lower')
                    ? 'partA'
                    : 'auto';
                } else {
                  inlineCodexView.leaf = 'upper';
                  inlineCodexView.handIdx = (inlineCodexView.handIdx + 1) % tohsaka.ANCIENT_CODEX_HANDS.length;
                  inlineCodexView.subWindow = isInlineLeafOverflow(inlineCodexView.handIdx, 'upper')
                    ? 'partA'
                    : 'auto';
                }
                renderInlineCodexView();
                writeStatusFooter(nowMs);
              } else {
                lastQuoteNs = process.hrtime.bigint();
                advanceCountdownFrame(nowMs);
                writeStatusFooter(nowMs);
              }
            } else if (lowerKey === 'p') {
              if (inlineCodexView) {
                if (inlineCodexView.mode === 'note') {
                  inlineCodexView.noteNo =
                    inlineCodexView.noteNo <= 1 ? totalNotesCount : inlineCodexView.noteNo - 1;
                } else if (
                  inlineCodexView.subWindow === 'partB' &&
                  isInlineLeafOverflow(inlineCodexView.handIdx, inlineCodexView.leaf)
                ) {
                  inlineCodexView.subWindow = 'partA';
                } else if (inlineCodexView.leaf === 'lower') {
                  inlineCodexView.leaf = 'upper';
                  inlineCodexView.subWindow = isInlineLeafOverflow(inlineCodexView.handIdx, 'upper')
                    ? 'partB'
                    : 'auto';
                } else {
                  inlineCodexView.leaf = 'lower';
                  inlineCodexView.handIdx =
                    (inlineCodexView.handIdx - 1 + tohsaka.ANCIENT_CODEX_HANDS.length) %
                    tohsaka.ANCIENT_CODEX_HANDS.length;
                  inlineCodexView.subWindow = isInlineLeafOverflow(inlineCodexView.handIdx, 'lower')
                    ? 'partB'
                    : 'auto';
                }
                renderInlineCodexView();
                writeStatusFooter(nowMs);
              } else {
                if (rewindCountdownFrame(nowMs)) {
                  lastQuoteNs = process.hrtime.bigint();
                }
                writeStatusFooter(nowMs);
              }
            }
          };
          process.stdin.on('data', onKeyData);
        } catch (_) {
          // fallback gracefully if rawMode is unsupported
        }
      }

      const timer = setInterval(() => {
        const nowMs = Date.now();
        const remMs = plan.triggerAt.getTime() - nowMs;
        if (remMs <= 0) {
          clearInterval(timer);
          isFinaleLockedPhase = false;
          cleanupCountdownKeys();
          ringLoop();
          return;
        }

        const remSec = remMs / 1000;
        // 强制收尾铁律: once rem <= 15.0s, auto-unlock, exit inline codex view, and lock onto Essay #25
        if (remSec <= 15.0) {
          isFinaleLockedPhase = true;
          if (!finaleForced) {
            finaleForced = true;
            isLocked = false;
            inlineCodexView = null;
            director.finaleLocked = true;
            advanceCountdownFrame(nowMs, true);
          }
          writeStatusFooter(nowMs);
          return;
        }

        const nowNs = process.hrtime.bigint();
        const activeDurationSec = tohsaka.getQuoteDisplayDuration(currentFrame ? currentFrame.quote : null);
        if (!isLocked && !inlineCodexView && Number(nowNs - lastQuoteNs) / 1e9 >= activeDurationSec) {
          lastQuoteNs = nowNs;
          advanceCountdownFrame(nowMs);
        }

        writeStatusFooter(nowMs);
      }, 500);
    }
  } catch (err) {
    for (const w of cliWarnings) {
      console.log(w);
    }
    console.error(err && err.message ? err.message : String(err));
    process.exit(1);
  }
}

const CODEX_UNIFIED_NAV_BAR =
  '[阅卷] ←/→/N/P 翻页 | Tab 切上下叶 | M 目录 | J 旧札 | / 检索跳页 | B 返回 | C/Q 退出';

function runInteractiveCodex(filterArg, initialNotices = [], onExit = null, sharedFallbackRl = null) {
  const totalPages = tohsaka.getCodexTotalPages();
  const totalNotes = tohsaka.getCountdownQuotes('complaint').length;
  let noteModeIdx = null;
  let tocMode = false;
  let currentPage = 0;
  let subWindow = 'auto';
  let prevViewState = null;
  let pendingNotices = [...initialNotices];
  let lastSearchQuery = '';
  let lastSearchHits = [];
  let lastSearchDomain = 'hand'; // 'hand' | 'note'
  let lastSearchCursor = 0;

  const savePrevViewState = () => {
    prevViewState = {
      tocMode,
      noteModeIdx,
      currentPage,
      subWindow,
    };
  };

  const formatHitNotice = (keyword, hits, cursor, domain = 'hand') => {
    const shown = hits.slice(0, 6).join(', ') + (hits.length > 6 ? '…' : '');
    const currItem = hits[cursor];
    const unit = domain === 'note' ? '篇旧札' : '手';
    if (hits.length > 1) {
      return `[检索命中] 「${keyword}」共命中 ${hits.length} 条 · 第 ${shown} ${unit} · 当前第 ${currItem} ${unit} · 按 =/. 或再次检索可跳至下一命中处`;
    }
    return `[检索命中] 「${keyword}」命中第 ${currItem} ${unit}。`;
  };

  const trimmedInit = String(filterArg || '').trim();
  if (trimmedInit) {
    const initToc = /^(?:目录|总目|目次|toc|list|\?|h|help|m|menu)$/i.test(trimmedInit);
    const initNoteAll = /^(?:旧札|随笔|日记|notes?)$/i.test(trimmedInit);
    const initNoteNum = /^(?:n|旧札)\s*(\d{1,2})$/i.exec(trimmedInit);
    if (initToc) {
      tocMode = true;
    } else if (initNoteAll) {
      noteModeIdx = 1;
    } else if (initNoteNum) {
      const nVal = Number(initNoteNum[1]);
      if (nVal >= 1 && nVal <= totalNotes) {
        noteModeIdx = nVal;
      } else {
        pendingNotices.push(`[Tohsaka · 检索提示] 旧札共收录 ${totalNotes} 篇，已为您打开卷首封面。`);
      }
    } else {
      const resolvedInit = tohsaka.resolveCodexPageQuery(trimmedInit, null);
      if (resolvedInit !== null) {
        currentPage = resolvedInit;
        if (
          !/^(?:0|t|f|p\d{1,3}|\d{1,3}\s*[aAbB上下]?|\d{1,2}\s*[-~]\s*\d{1,2}|函面|封面|题签|卷首|四十八手|四十八则|书房时计四十八则|题记|初代|封面题记|扉页|辨正|副签|墨批|读法|all|全部|全卷)$/i.test(
            trimmedInit
          )
        ) {
          const initHits = tohsaka.searchCodexMatches(trimmedInit);
          if (initHits.length > 0) {
            lastSearchQuery = trimmedInit;
            lastSearchHits = initHits;
            lastSearchDomain = 'hand';
            lastSearchCursor = 0;
            if (initHits.length > 1) {
              pendingNotices.push(formatHitNotice(trimmedInit, initHits, 0, 'hand'));
            }
          }
        }
      } else {
        const noteHits = tohsaka.searchCodexNoteMatches(trimmedInit);
        if (noteHits.length > 0) {
          noteModeIdx = noteHits[0];
          lastSearchQuery = trimmedInit;
          lastSearchHits = noteHits;
          lastSearchDomain = 'note';
          lastSearchCursor = 0;
          pendingNotices.push(formatHitNotice(trimmedInit, noteHits, 0, 'note'));
        } else {
          pendingNotices.push(`[Tohsaka · 检索提示] 未检索到与「${trimmedInit}」匹配的条目，已为您打开卷首封面。`);
        }
      }
    }
  }

  const isPageOverflow = (pageIdx) => {
    if (pageIdx < 3) return false;
    const offset = pageIdx - 3;
    const hand = tohsaka.ANCIENT_CODEX_HANDS[Math.floor(offset / 2)];
    if (!hand) return false;
    return offset % 2 === 1
      ? tohsaka.isCodexLowerLeafOverflowing(hand)
      : tohsaka.isCodexUpperLeafOverflowing(hand);
  };

  let transitionTimerA = null;
  let transitionTimerB = null;
  const sanitizedPageKeys = new Set();

  const clearPendingTransition = () => {
    if (transitionTimerA) {
      clearTimeout(transitionTimerA);
      transitionTimerA = null;
    }
    if (transitionTimerB) {
      clearTimeout(transitionTimerB);
      transitionTimerB = null;
    }
  };

  const canUseRawCodex = Boolean(
    process.stdin &&
      process.stdin.isTTY &&
      typeof process.stdin.setRawMode === 'function' &&
      process.stdout &&
      process.stdout.isTTY
  );

  const fallbackRl = !canUseRawCodex
    ? sharedFallbackRl ||
      readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    : null;
  if (fallbackRl && !sharedFallbackRl) {
    fallbackRl.on('SIGINT', () => {
      fallbackRl.close();
      process.emit('SIGINT');
    });
  }

  let onCodexKeyData = null;
  let searchLineModeActive = false;

  const detachCodexRawKeys = () => {
    if (onCodexKeyData) {
      process.stdin.removeListener('data', onCodexKeyData);
      onCodexKeyData = null;
    }
    if (canUseRawCodex) {
      try {
        process.stdin.setRawMode(false);
      } catch (_) {
        // ignore
      }
      try {
        process.stdin.pause();
      } catch (_) {
        // ignore
      }
    }
  };

  const closeCodexAndReturn = (forceExitProcess = false) => {
    clearPendingTransition();
    detachCodexRawKeys();
    if (fallbackRl && !sharedFallbackRl) {
      fallbackRl.close();
    }
    console.log('\n[Tohsaka · 地下书库] 已为您合上檀木函。愿先哲与先祖之训常伴左右。');
    if (!forceExitProcess && typeof onExit === 'function') {
      onExit();
    } else {
      if (sharedFallbackRl) {
        sharedFallbackRl.close();
      }
      process.exit(0);
    }
  };

  const doStepNextPage = (fromEnterKey = false) => {
    if (tocMode) {
      if (fromEnterKey && prevViewState !== null && !prevViewState.tocMode) {
        const saved = prevViewState;
        savePrevViewState();
        tocMode = false;
        noteModeIdx = saved.noteModeIdx;
        currentPage = Number(saved.currentPage);
        subWindow = String(saved.subWindow);
      } else {
        tocMode = false;
        currentPage = 0;
        subWindow = 'auto';
      }
    } else if (noteModeIdx !== null) {
      noteModeIdx = (noteModeIdx % totalNotes) + 1;
    } else if (subWindow === 'partA' && isPageOverflow(currentPage)) {
      subWindow = 'partB';
    } else {
      subWindow = 'auto';
      currentPage = (currentPage + 1) % totalPages;
    }
  };

  const doStepPrevPage = () => {
    if (tocMode) {
      tocMode = false;
      currentPage = totalPages - 1;
      subWindow = isPageOverflow(currentPage) ? 'partB' : 'auto';
    } else if (noteModeIdx !== null) {
      noteModeIdx = noteModeIdx <= 1 ? totalNotes : noteModeIdx - 1;
    } else if (subWindow === 'partB' && isPageOverflow(currentPage)) {
      subWindow = 'partA';
    } else {
      const prevPage = (currentPage - 1 + totalPages) % totalPages;
      currentPage = prevPage;
      subWindow = isPageOverflow(prevPage) ? 'partB' : 'auto';
    }
  };

  const doToggleHandLeaf = () => {
    if (!tocMode && noteModeIdx === null && currentPage >= 3) {
      const offset = currentPage - 3;
      currentPage = offset % 2 === 1 ? currentPage - 1 : currentPage + 1;
      subWindow = 'auto';
    } else {
      pendingNotices.push('[提示] 当前不在正编手页，按 / 输入 1~48 进入正编后可按 Tab 切换上/下叶。');
    }
  };

  const doOpenToc = () => {
    if (!tocMode) {
      savePrevViewState();
    }
    tocMode = true;
    noteModeIdx = null;
  };

  const doOpenNotes = () => {
    savePrevViewState();
    tocMode = false;
    if (noteModeIdx === null) {
      noteModeIdx = 1;
    }
  };

  const doJumpCover = () => {
    savePrevViewState();
    tocMode = false;
    noteModeIdx = null;
    currentPage = 0;
    subWindow = 'auto';
  };

  const doJumpPreface = () => {
    savePrevViewState();
    tocMode = false;
    noteModeIdx = null;
    currentPage = 1;
    subWindow = 'auto';
  };

  const doJumpFlyleaf = () => {
    savePrevViewState();
    tocMode = false;
    noteModeIdx = null;
    currentPage = 2;
    subWindow = 'auto';
  };

  const doGoBack = () => {
    if (prevViewState !== null) {
      const saved = prevViewState;
      savePrevViewState();
      tocMode = Boolean(saved.tocMode);
      noteModeIdx = saved.noteModeIdx;
      currentPage = Number(saved.currentPage);
      subWindow = String(saved.subWindow);
    } else if (tocMode || noteModeIdx !== null) {
      savePrevViewState();
      tocMode = false;
      noteModeIdx = null;
      subWindow = 'auto';
    } else {
      pendingNotices.push('[提示] 当前尚无跳转前的历史页码记录，已停留在当前页。');
    }
  };

  const doNextSearchHit = () => {
    if (lastSearchHits.length === 0) {
      pendingNotices.push('[提示] 当前尚无活跃检索记录，请先按 / 输入关键词。');
      return;
    }
    savePrevViewState();
    tocMode = false;
    lastSearchCursor = (lastSearchCursor + 1) % lastSearchHits.length;
    if (lastSearchDomain === 'note') {
      noteModeIdx = lastSearchHits[lastSearchCursor];
    } else {
      noteModeIdx = null;
      currentPage = 3 + (lastSearchHits[lastSearchCursor] - 1) * 2;
      subWindow = 'auto';
    }
    pendingNotices.push(formatHitNotice(lastSearchQuery, lastSearchHits, lastSearchCursor, lastSearchDomain));
  };

  // Returns true if codex should remain open and redraw, false if codex closed
  const executeSearchOrJumpQuery = (rawCmd, allowEmptyNext = false) => {
    const cmd = String(rawCmd || '').trim();
    if (!cmd) {
      if (allowEmptyNext) {
        doStepNextPage(true);
      }
      return true;
    }
    const lowerCmd = cmd.toLowerCase();
    if (lowerCmd === 'q' || lowerCmd === 'quit' || lowerCmd === 'exit' || lowerCmd === 'c') {
      closeCodexAndReturn(false);
      return false;
    }
    if (/^(?:目录|总目|目次|toc|list|\?|h|help|m|menu)$/i.test(cmd)) {
      doOpenToc();
      return true;
    }
    if (/^(?:b|back|返回)$/i.test(cmd)) {
      doGoBack();
      return true;
    }
    if (lowerCmd === 'tab') {
      doToggleHandLeaf();
      return true;
    }
    if (lowerCmd === 'j' || /^(?:旧札|随笔|日记|notes?)$/i.test(cmd)) {
      doOpenNotes();
      return true;
    }
    if (
      cmd === '=' ||
      cmd === '.' ||
      cmd === '/' ||
      (lastSearchHits.length > 1 && lowerCmd === lastSearchQuery.toLowerCase())
    ) {
      doNextSearchHit();
      return true;
    }
    const noteJump = /^(?:n|旧札)\s*(\d{1,2})$/i.exec(cmd);
    if (noteJump) {
      const nVal = Number(noteJump[1]);
      if (nVal >= 1 && nVal <= totalNotes) {
        savePrevViewState();
        tocMode = false;
        noteModeIdx = nVal;
      } else {
        pendingNotices.push(`[提示] 旧札共收录 ${totalNotes} 篇，请输入 n1~n${totalNotes}。`);
      }
      return true;
    }
    if (lowerCmd === 'n' || lowerCmd === 'next') {
      doStepNextPage(false);
      return true;
    }
    if (lowerCmd === 'p' || lowerCmd === 'prev') {
      doStepPrevPage();
      return true;
    }
    if (lowerCmd === '0' || cmd === '函面' || cmd === '封面') {
      doJumpCover();
      return true;
    }
    if (lowerCmd === 't' || cmd === '题记') {
      savePrevViewState();
      tocMode = false;
      noteModeIdx = null;
      currentPage = 1;
      subWindow = 'auto';
      return true;
    }
    if (lowerCmd === 'f' || cmd === '扉页') {
      savePrevViewState();
      tocMode = false;
      noteModeIdx = null;
      currentPage = 2;
      subWindow = 'auto';
      return true;
    }
    const pageJump = /^p(\d{1,3})$/i.exec(cmd);
    if (pageJump) {
      const pNum = Number(pageJump[1]);
      if (pNum >= 1 && pNum <= totalPages) {
        savePrevViewState();
        tocMode = false;
        noteModeIdx = null;
        currentPage = pNum - 1;
        subWindow = 'auto';
      } else {
        pendingNotices.push(`[提示] 古本全卷共 ${totalPages} 页，请输入 p1~p${totalPages}。`);
      }
      return true;
    }
    if (
      /^(?:0|函面|封面|题签|卷首|四十八手|四十八则|书房时计四十八则|all|全部|全卷|t|题记|初代|封面题记|f|扉页|辨正|副签|墨批|读法|\d{1,3}\s*[aAbB上下]?|\d{1,2}\s*[-~]\s*\d{1,2})$/i.test(
        cmd
      )
    ) {
      const resolved = tohsaka.resolveCodexPageQuery(cmd, null);
      if (resolved === null) {
        pendingNotices.push(`[提示] 未检索到与「${cmd}」匹配的条目，已停留在当前页。`);
      } else {
        savePrevViewState();
        tocMode = false;
        noteModeIdx = null;
        currentPage = resolved;
        subWindow = 'auto';
      }
      return true;
    }
    if (/^[a-zA-Z]$/.test(cmd)) {
      pendingNotices.push(
        `[提示] 未识别的单字母指令「${cmd}」，已停留在当前页，西文检索请至少输入 2 个字母，汉字检索支持单字。`
      );
      return true;
    }
    const preferNotes = noteModeIdx !== null;
    const handHits = tohsaka.searchCodexMatches(cmd);
    const noteHits = tohsaka.searchCodexNoteMatches(cmd);
    if (preferNotes && noteHits.length > 0) {
      savePrevViewState();
      tocMode = false;
      noteModeIdx = noteHits[0];
      lastSearchQuery = cmd;
      lastSearchHits = noteHits;
      lastSearchDomain = 'note';
      lastSearchCursor = 0;
      pendingNotices.push(formatHitNotice(cmd, noteHits, 0, 'note'));
    } else if (handHits.length > 0) {
      savePrevViewState();
      tocMode = false;
      noteModeIdx = null;
      lastSearchQuery = cmd;
      lastSearchHits = handHits;
      lastSearchDomain = 'hand';
      lastSearchCursor = 0;
      currentPage = 3 + (handHits[0] - 1) * 2;
      subWindow = 'auto';
      pendingNotices.push(formatHitNotice(cmd, handHits, 0, 'hand'));
    } else if (noteHits.length > 0) {
      savePrevViewState();
      tocMode = false;
      noteModeIdx = noteHits[0];
      lastSearchQuery = cmd;
      lastSearchHits = noteHits;
      lastSearchDomain = 'note';
      lastSearchCursor = 0;
      pendingNotices.push(formatHitNotice(cmd, noteHits, 0, 'note'));
    } else {
      pendingNotices.push(`[提示] 未检索到与「${cmd}」匹配的条目，已停留在当前页。`);
    }
    return true;
  };

  const drawCodexStageScreen = (activeMode, stage, useAnsiColor, notices) => {
    tohsaka.clearTerminalScreen();
    const rawRendered = tohsaka.formatCodexPage(currentPage, activeMode, stage, useAnsiColor);
    console.log(stage === 'glitch' ? rawRendered : tohsaka.stylizeStudyTerminal(rawRendered));
    if (Array.isArray(notices) && notices.length > 0) {
      for (const note of notices) {
        console.log(note);
      }
    }
    const { boxInnerWidth } = tohsaka.getTerminalViewportSize();
    const navBox = tohsaka.makeSingleBoxBar(CODEX_UNIFIED_NAV_BAR, boxInnerWidth);
    if (stage === 'glitch' && useAnsiColor) {
      console.log('\x1b[31;1m' + navBox.join('\n') + '\x1b[0m');
    } else {
      console.log(tohsaka.stylizeStudyTerminal(navBox.join('\n')));
    }
  };

  const openSearchJumpBar = (initialChar = '') => {
    if (searchLineModeActive) return;
    searchLineModeActive = true;
    const hadPendingTransition = Boolean(transitionTimerA || transitionTimerB);
    clearPendingTransition();
    if (hadPendingTransition && !tocMode && noteModeIdx === null) {
      drawCodexStageScreen(
        subWindow === 'auto' && isPageOverflow(currentPage) ? 'partA' : subWindow,
        'safe',
        false,
        []
      );
    }
    detachCodexRawKeys();
    const searchRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    searchRl.on('SIGINT', () => {
      searchRl.close();
      searchLineModeActive = false;
      closeCodexAndReturn(true);
    });
    searchRl.question(
      '[跳页/检索] 请输入手数(1~48)、页码(p1~99)、旧札(n1~25)或关键词 (回车取消): ',
      (ans) => {
        searchRl.close();
        searchLineModeActive = false;
        const shouldContinue = executeSearchOrJumpQuery(ans, false);
        if (shouldContinue) {
          attachCodexRawKeys();
          renderInteractiveCodexPage();
        }
      }
    );
    if (initialChar) {
      searchRl.write(initialChar);
    }
  };

  const attachCodexRawKeys = () => {
    if (!canUseRawCodex) return;
    if (onCodexKeyData) {
      process.stdin.removeListener('data', onCodexKeyData);
    }
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      onCodexKeyData = (chunk) => {
        if (searchLineModeActive) return;
        const key = String(chunk || '');
        if (!key) return;
        if (key.includes('\u0003')) {
          clearPendingTransition();
          closeCodexAndReturn(true);
          return;
        }
        if (
          key === '/' ||
          key === 's' ||
          key === 'S' ||
          key === 'g' ||
          key === 'G'
        ) {
          openSearchJumpBar();
          return;
        }
        if (/^[1-9]$/.test(key)) {
          openSearchJumpBar(key);
          return;
        }
        if (key === 'c' || key === 'C' || key === 'q' || key === 'Q') {
          clearPendingTransition();
          closeCodexAndReturn(false);
          return;
        }
        if (
          key === '\u001b[C' ||
          key === '\u001b[B' ||
          key === '\u001bOC' ||
          key === '\u001bOB' ||
          key === 'n' ||
          key === 'N' ||
          key === ' ' ||
          key === '\r' ||
          key === '\n'
        ) {
          clearPendingTransition();
          doStepNextPage(key === '\r' || key === '\n');
          renderInteractiveCodexPage();
          return;
        }
        if (
          key === '\u001b[D' ||
          key === '\u001b[A' ||
          key === '\u001bOD' ||
          key === '\u001bOA' ||
          key === 'p' ||
          key === 'P'
        ) {
          clearPendingTransition();
          doStepPrevPage();
          renderInteractiveCodexPage();
          return;
        }
        if (key === '\t') {
          clearPendingTransition();
          doToggleHandLeaf();
          renderInteractiveCodexPage();
          return;
        }
        if (key === 'm' || key === 'M') {
          clearPendingTransition();
          doOpenToc();
          renderInteractiveCodexPage();
          return;
        }
        if (key === 't' || key === 'T') {
          clearPendingTransition();
          doJumpPreface();
          renderInteractiveCodexPage();
          return;
        }
        if (key === 'f' || key === 'F') {
          clearPendingTransition();
          doJumpFlyleaf();
          renderInteractiveCodexPage();
          return;
        }
        if (key === 'j' || key === 'J') {
          clearPendingTransition();
          doOpenNotes();
          renderInteractiveCodexPage();
          return;
        }
        if (key === '0') {
          clearPendingTransition();
          doJumpCover();
          renderInteractiveCodexPage();
          return;
        }
        if (key === 'b' || key === 'B' || key === '\u001b') {
          clearPendingTransition();
          doGoBack();
          renderInteractiveCodexPage();
          return;
        }
        if (key === '=' || key === '.') {
          clearPendingTransition();
          doNextSearchHit();
          renderInteractiveCodexPage();
          return;
        }
      };
      process.stdin.on('data', onCodexKeyData);
    } catch (_) {
      // fallback if setRawMode fails
    }
  };

  const promptFallbackLineCommand = () => {
    if (canUseRawCodex || !fallbackRl) return;
    fallbackRl.question(
      '[跳页/检索] 请输入手数(1~48)、页码(p1~99)、旧札(n1~25)或关键词 (回车翻页): ',
      (ans) => {
        clearPendingTransition();
        const shouldContinue = executeSearchOrJumpQuery(ans, true);
        if (shouldContinue) {
          renderInteractiveCodexPage();
        }
      }
    );
  };

  const renderInteractiveCodexPage = () => {
    clearPendingTransition();
    const frameNotices = pendingNotices;
    pendingNotices = [];
    if (tocMode) {
      tohsaka.clearTerminalScreen();
      console.log(tohsaka.stylizeStudyTerminal(tohsaka.formatCodexTocPage()));
      if (Array.isArray(frameNotices) && frameNotices.length > 0) {
        for (const note of frameNotices) {
          console.log(note);
        }
      }
      const { boxInnerWidth } = tohsaka.getTerminalViewportSize();
      const navBox = tohsaka.makeSingleBoxBar(CODEX_UNIFIED_NAV_BAR, boxInnerWidth);
      console.log(tohsaka.stylizeStudyTerminal(navBox.join('\n')));
      promptFallbackLineCommand();
      return;
    }
    if (noteModeIdx !== null) {
      tohsaka.clearTerminalScreen();
      console.log(tohsaka.stylizeStudyTerminal(tohsaka.formatCodexNotePage(noteModeIdx)));
      if (Array.isArray(frameNotices) && frameNotices.length > 0) {
        for (const note of frameNotices) {
          console.log(note);
        }
      }
      const { boxInnerWidth } = tohsaka.getTerminalViewportSize();
      const navBox = tohsaka.makeSingleBoxBar(CODEX_UNIFIED_NAV_BAR, boxInnerWidth);
      console.log(tohsaka.stylizeStudyTerminal(navBox.join('\n')));
      promptFallbackLineCommand();
      return;
    }

    let activeMode = subWindow;
    if (activeMode === 'auto' && isPageOverflow(currentPage)) {
      activeMode = 'partA';
      subWindow = 'partA';
    }
    const pageKey = `${currentPage}:${activeMode}`;
    const isSamePageRedraw = sanitizedPageKeys.has(pageKey);
    const shouldAnimate = canUseRawCodex && !isSamePageRedraw;
    const rawText = tohsaka.formatCodexPage(currentPage, activeMode, 'raw', false);
    if (shouldAnimate && (tohsaka.hasMysteryViolation(rawText) || currentPage === 0)) {
      sanitizedPageKeys.add(pageKey);
      drawCodexStageScreen(activeMode, 'raw', false, frameNotices);
      transitionTimerA = setTimeout(() => {
        transitionTimerA = null;
        drawCodexStageScreen(activeMode, 'glitch', true, frameNotices);
        transitionTimerB = setTimeout(() => {
          transitionTimerB = null;
          drawCodexStageScreen(activeMode, 'safe', false, frameNotices);
        }, 650);
      }, 750);
    } else {
      sanitizedPageKeys.add(pageKey);
      drawCodexStageScreen(activeMode, 'safe', false, frameNotices);
      promptFallbackLineCommand();
    }
  };

  attachCodexRawKeys();
  renderInteractiveCodexPage();
}

if (versionMode) {
  console.log(
    `Tohsaka v${tohsaka.VERSION} (宽政二年庚戌冬月古本 · 书房时计规制 | 恒定超前 +60 分钟) · 当前读数 ${report.tohsakaFormatted}`
  );
  return;
}

if (helpMode) {
  printHelp();
  return;
}

if (chimeMode) {
  tohsaka.ringWakeupCadence({
    taskLabel: 'Tohsaka 报时',
    targetFormatted: report.tohsakaFormatted,
    remainingMinutes: 60,
    waveIndex: 1,
  });
  if (cliWarnings.length > 0) {
    for (const w of cliWarnings) {
      console.log(w);
    }
    console.log('');
  }
  console.log(`Tohsaka 标准时间 : ${report.tohsakaFormatted} · 固定快 1 小时`);
  console.log(`系统物理参考时间 : ${report.physicalFormatted}`);
  console.log(report.announcement);
  console.log('\n' + tohsaka.formatCountdownQuoteLine(tohsaka.pickRandomAphorism()));
  setTimeout(() => process.exit(0), 400);
  return;
}

if (quotesSalonMode) {
  const filterArg = (codexQuery || cleanArgs.join(' ')).trim();
  const isAllQuery = /^(?:all|全部|全卷)$/i.test(filterArg);

  if (!dryRun && !isAllQuery && (interactiveMode || (process.stdin.isTTY && process.stdout.isTTY))) {
    runInteractiveCodex(filterArg, cliWarnings);
    return;
  }

  if (cliWarnings.length > 0) {
    for (const w of cliWarnings) {
      console.log(w);
    }
    console.log('');
  }
  console.log('[Tohsaka · 古本单页预览] 交互终端下可直接按方向键/N/P翻页，或传入 目录、1~48、1a/1b、p1~p99、旧札/n1~n25、题记、扉页、all 检索：\n');
  console.log(tohsaka.stylizeStudyTerminal(tohsaka.formatAncientCodex(filterArg)));
  return;
}

if (cleanArgs.length === 0) {
  if (!interactiveMode && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    printHelp();
    return;
  }

  tohsaka.clearTerminalScreen();
  console.log(tohsaka.stylizeStudyTerminal(tohsaka.buildInteractiveGreeting(sysNow)));
  if (cliWarnings.length > 0) {
    console.log('');
    for (const w of cliWarnings) {
      console.log(w);
    }
  }
  console.log('\n' + tohsaka.formatCountdownQuoteLine(tohsaka.pickRandomAphorism()) + '\n');

  const canUseRawInteractive = Boolean(
    process.stdin &&
      process.stdin.isTTY &&
      typeof process.stdin.setRawMode === 'function' &&
      process.stdout &&
      process.stdout.isTTY
  );
  const sharedPipeRl = !canUseRawInteractive
    ? readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
    : null;
  if (sharedPipeRl) {
    sharedPipeRl.on('SIGINT', () => {
      sharedPipeRl.close();
      process.emit('SIGINT');
    });
  }

  const askSingleLineQuestion = (promptText, callback) => {
    if (sharedPipeRl) {
      sharedPipeRl.question(promptText, callback);
      return;
    }
    const qRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    qRl.on('SIGINT', () => {
      qRl.close();
      process.emit('SIGINT');
    });
    qRl.question(promptText, (answer) => {
      qRl.close();
      callback(answer);
    });
  };

  const resumeInteractivePromptAfterCodex = () => {
    console.log('');
    askInteractiveTime();
  };

  const askInteractiveTime = () => {
    askSingleLineQuestion(
      '[Tohsaka] 请示下目标时刻，如 02:00、下午4点 或 90分钟后，输入 codex 可展阅古本，直接按回车默认设为 61分钟后： ',
      (rawTime) => {
        const trimmedTime = String(rawTime || '').trim();
        if (/^(?:q|quit|exit)$/i.test(trimmedTime)) {
          if (sharedPipeRl) sharedPipeRl.close();
          console.log('[Tohsaka] 已为您合上怀表。愿您今日亦能维持从容。');
          process.exit(0);
          return;
        }
        if (/^(?:chime|clock|-c|--chime)$/i.test(trimmedTime)) {
          console.log(`\n${tohsaka.chime(new Date()).announcement}`);
          console.log('');
          askInteractiveTime();
          return;
        }
        const codexShortcutMatch = /^(?:--?codex|--?salon|codex|salon|古本)(?:\s+(.+))?$/i.exec(trimmedTime);
        if (codexShortcutMatch) {
          runInteractiveCodex(
            (codexShortcutMatch[1] || '').trim(),
            [],
            resumeInteractivePromptAfterCodex,
            sharedPipeRl
          );
          return;
        }
        if (/^(?:目录|总目|目次|旧札(?:\s*\d{1,2})?|随笔)$/i.test(trimmedTime)) {
          runInteractiveCodex(trimmedTime, [], resumeInteractivePromptAfterCodex, sharedPipeRl);
          return;
        }
        const chosenTime = trimmedTime || '61分钟后';
        const preview = tohsaka.parseFlexibleTime(chosenTime, new Date());
        if (!preview.ok) {
          console.log(`\n${preview.error}\n`);
          askInteractiveTime();
          return;
        }
        askSingleLineQuestion(
          '[Tohsaka] 请示下事务名目，直接按回车默认记为 书房品茗与要务批阅： ',
          (rawLabel) => {
            const trimmedLabel = String(rawLabel || '').trim();
            if (/^(?:q|quit|exit)$/i.test(trimmedLabel)) {
              if (sharedPipeRl) sharedPipeRl.close();
              console.log('[Tohsaka] 已为您合上怀表。愿您今日亦能维持从容。');
              process.exit(0);
              return;
            }
            const chosenLabel = trimmedLabel || '书房品茗与要务批阅';
            if (sharedPipeRl) sharedPipeRl.close();
            console.log('');
            executeAlarmPlan(chosenTime, chosenLabel);
          }
        );
      }
    );
  };

  askInteractiveTime();
  return;
}

const { targetStr, taskLabel } = tohsaka.resolveCliPositionalArgs(cleanArgs);
executeAlarmPlan(targetStr, taskLabel);
