/* 豆花的口袋 —— 前端逻辑（纯静态，数据存本机浏览器 localStorage） */
(function () {
  'use strict';

  var STORE_KEY = 'douhua-pocket-v1';

  /* ---------- 线上后台（Supabase）----------
     没有填 supabase-config.js 的时候 ONLINE 是 false，
     网站就退回「本地草稿 + content.js」的老模式，功能不受影响。 */
  var SB_CFG = window.DH_SUPABASE || {};
  var ONLINE = !!(SB_CFG.url && SB_CFG.anonKey && window.supabase && window.supabase.createClient);
  var sb = ONLINE ? window.supabase.createClient(SB_CFG.url, SB_CFG.anonKey) : null;
  var session = null;
  var canEdit = !ONLINE;      // 线上模式：登录之后才变成 true
  var CATEGORIES = ['哲学', '宗教', '艺术', '自然科学', '女性主义', '历史', '游戏', '诗歌文学', '杂谈'];
  var TYPES = {
    note:  { label: '图文', glyph: '文' },
    image: { label: '图片', glyph: '图' },
    video: { label: '视频', glyph: '影' },
    link:  { label: '链接', glyph: '链' },
    book:  { label: '读书', glyph: '读' }
  };

  /* ---------- 示例数据（可随时编辑或删除） ---------- */
  /* 兜底示例：只在「没有本地草稿、也读不到 content.json」时出现
     （比如把文件夹直接双击打开的时候）。对外展示的内容放在 content.json 里。 */
  var SEED = [
    {
      id: 'seed-start',
      type: 'note',
      title: '示例 · 先随便写点什么',
      category: '杂谈',
      date: '2026-10-06',
      summary: '点右上角「＋ 放进口袋」，就可以添加、编辑、删除内容。',
      quote: '',
      body: '这个口袋里什么都装：读到的段落、看到的图、玩到的游戏、忽然冒出来的念头。\n\n这条只是兜底示例，删掉也没关系。',
      book: {},
      images: [],
      videos: [],
      links: [],
      comments: [],
      tags: ['开始'],
      createdAt: '2026-10-06T10:00:00+08:00',
      updatedAt: '2026-10-06T10:00:00+08:00'
    },
    {
      id: 'seed-book',
      type: 'book',
      title: '示例 · 读书笔记的样子',
      category: '历史',
      date: '2026-10-03',
      summary: '读书笔记会多出作者、版本、位置、状态，摘录和自己的话分开排。',
      quote: '把原文摘录放在这里，详情页会单独排成一段引文。',
      book: {
        title: '《一本关于仪式的书》',
        author: '作者名（示例）',
        edition: '出版社 · 版次 / 年份',
        locator: '第三章 · p.88',
        status: '在读'
      },
      body: '下面这一块留给我自己的想法：这段论述为什么重要、能不能和别的材料对上、我还有什么疑问。',
      images: [],
      videos: [],
      links: [],
      comments: [
        { id: 'seed-c1', name: '豆花', text: '每条内容底下都能发评论，评论会跟着这条内容一起保存。', date: '2026-10-03T22:30:00+08:00' }
      ],
      tags: ['读书笔记'],
      createdAt: '2026-10-03T22:10:00+08:00',
      updatedAt: '2026-10-03T22:10:00+08:00'
    }
  ];

  /* ---------- 小工具 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid() { return 'it-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDate(s) { return String(s || '').replace(/-/g, '.'); }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  var NAME_KEY = 'douhua-pocket-name';
  function readName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch (e) { return ''; } }
  function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) {} }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
  function catGlyph(c) { return String(c || '记').slice(0, 1); }

  /* 每个分类一套低饱和的柔和配色 */
  var CAT_STYLE = {
    '哲学':     { fg: '#8a7bb8', bg: '#f2effa' },
    '宗教':     { fg: '#6b8cc4', bg: '#edf2fb' },
    '艺术':     { fg: '#b57ba8', bg: '#f9eff5' },
    '自然科学': { fg: '#4f9b93', bg: '#eaf6f2' },
    '女性主义': { fg: '#c4778d', bg: '#fceff3' },
    '历史':     { fg: '#b08a63', bg: '#f8f1e8' },
    '游戏':     { fg: '#4f9ab0', bg: '#eaf5f8' },
    '诗歌文学': { fg: '#8a9b6a', bg: '#f2f6ec' },
    '杂谈':     { fg: '#8a94a6', bg: '#f0f2f6' }
  };
  var CAT_FALLBACK = { fg: '#7aa79a', bg: '#eaf4f0' };

  function catStyle(c) { return CAT_STYLE[c] || CAT_FALLBACK; }

  function statusClass(s) {
    if (s === '在读') return ' is-doing';
    if (s === '读毕') return ' is-done';
    return '';
  }

  function tileHTML(cat) {
    var s = catStyle(cat);
    return '<div class="tile" style="--tile-bg:' + s.bg + ';--tile-fg:' + s.fg + '">' +
      '<span>' + esc(catGlyph(cat)) + '</span></div>';
  }

  function catTagHTML(cat) {
    var s = catStyle(cat);
    return '<span class="tag tag-cat" style="color:' + s.fg + ';background:' + s.bg + ';border-color:' + s.bg + '">' +
      esc(cat || '未分类') + '</span>';
  }

  function classifyVideo(url) {
    var u = String(url || '').trim();
    var bv = u.match(/(BV[0-9A-Za-z]{10})/);
    if (bv) return { kind: 'embed', src: 'https://player.bilibili.com/player.html?bvid=' + bv[1] + '&autoplay=0&danmaku=0&high_quality=1' };
    var av = u.match(/\/av(\d+)/i) || u.match(/^av(\d+)$/i);
    if (av) return { kind: 'embed', src: 'https://player.bilibili.com/player.html?aid=' + av[1] + '&autoplay=0' };
    var yt = u.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    if (yt) return { kind: 'embed', src: 'https://www.youtube.com/embed/' + yt[1] };
    if (/\.(mp4|webm|ogv|ogg|mov)(\?|#|$)/i.test(u) || u.indexOf('data:video') === 0) return { kind: 'file', src: u };
    return { kind: 'embed', src: u };
  }

  /* ---------- 存储 ---------- */
  var storageOK = (function () {
    try {
      localStorage.setItem('__dh_probe', '1');
      localStorage.removeItem('__dh_probe');
      return true;
    } catch (e) { return false; }
  })();

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.items)) return data.items;
      return null;
    } catch (e) { return null; }
  }
  function writeStore(list) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
      contentSource = 'local';
    } catch (e) {
      toast(storageOK
        ? '保存失败：内容可能太大（多为本地图片/视频占的空间），建议改用图片链接或先导出备份。'
        : '这个浏览器不允许本地保存（用 file:// 直接打开时可能如此），请改用本地服务打开，或先用导出备份保存内容。');
    }
  }

  /* 内容来源：本地草稿 > content.js > content.json > 内置示例
     —— 本地打开（file:// 或本机服务）优先读草稿，方便随手改；
        正式上线后访客没有草稿，读的就是 content.js。
        （用 script 标签读内容，这样直接双击 index.html 也能读到，不会被浏览器的
          file:// 限制挡下来。） */
  function loadContent() {
    if (ONLINE) return loadOnline();
    var stored = readStore();
    if (stored) return Promise.resolve({ items: stored, source: 'local' });
    if (window.DH_CONTENT && window.DH_CONTENT.length) {
      return Promise.resolve({ items: window.DH_CONTENT, source: 'published' });
    }
    return new Promise(function (resolve) {
      if (location.protocol === 'file:') {
        resolve({ items: JSON.parse(JSON.stringify(SEED)), source: 'seed' });
        return;
      }
      fetch('content.json', { cache: 'no-store' })
        .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error('missing')); })
        .then(function (data) {
          var arr = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
          if (!arr || !arr.length) throw new Error('empty');
          resolve({ items: arr, source: 'published' });
        })
        .catch(function () {
          resolve({ items: JSON.parse(JSON.stringify(SEED)), source: 'seed' });
        });
    });
  }

  /* ---------- 线上模式：读写 Supabase ---------- */
  function checkErr(res) {
    if (res && res.error) throw res.error;
    return res;
  }

  function rowToItem(r, comments) {
    return {
      id: r.id,
      type: r.type || 'note',
      title: r.title || '',
      category: r.category || '',
      date: r.date || '',
      summary: r.summary || '',
      quote: r.quote || '',
      body: r.body || '',
      book: r.book || {},
      images: r.images || [],
      videos: r.videos || [],
      links: r.links || [],
      tags: r.tags || [],
      comments: comments || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }

  function itemToRow(it) {
    return {
      type: it.type || 'note',
      title: it.title || '',
      category: it.category || '',
      date: it.date || null,
      summary: it.summary || '',
      quote: it.quote || '',
      body: it.body || '',
      book: it.book || {},
      images: it.images || [],
      videos: it.videos || [],
      links: it.links || [],
      tags: it.tags || [],
      updated_at: new Date().toISOString()
    };
  }

  function loadOnline(attempt) {
    attempt = attempt || 0;
    return Promise.all([
      sb.from('entries').select('*').order('date', { ascending: false }),
      sb.from('comments').select('*').order('created_at', { ascending: true })
    ]).then(function (res) {
      if (res[0].error) throw res[0].error;
      var byEntry = {};
      (res[1] && res[1].data ? res[1].data : []).forEach(function (c) {
        if (!byEntry[c.entry_id]) byEntry[c.entry_id] = [];
        byEntry[c.entry_id].push({
          id: c.id, name: c.name || '', text: c.content || '', date: c.created_at
        });
      });
      var rows = res[0].data || [];
      return {
        items: rows.map(function (r) { return rowToItem(r, byEntry[r.id] || []); }),
        source: 'online'
      };
    }).catch(function (err) {
      // 网络偶尔抽一下（尤其是国内连 supabase.co），先自动重试两次再说
      if (attempt < 2) {
        return new Promise(function (res) { setTimeout(res, 700 * (attempt + 1)); })
          .then(function () { return loadOnline(attempt + 1); });
      }
      toast('读取线上内容失败：' + ((err && err.message) ? err.message : '请检查 supabase-config.js'));
      return { items: JSON.parse(JSON.stringify(SEED)), source: 'seed' };
    });
  }

  function refreshOnline() {
    if (!ONLINE) return Promise.resolve();
    return loadOnline().then(function (res) {
      items = res.items;
      contentSource = res.source;
      render();
    });
  }

  /* ---------- 状态 ---------- */
  var items = [];
  var filter = { q: '', category: 'all', type: 'all' };
  var editingId = null;
  var confirmResolve = null;
  var contentSource = 'seed';   // seed | published | local | online
  var loading = true;           // 首次读取还没回来时，先别显示"口袋里什么都没有"
  var tasks = [];               // 待办 / 待读书目 / 日历事项
  var tasksReady = true;        // 线上还没建 tasks 表时为 false
  var view = 'notes';           // notes | todo | calendar
  var calCursor = new Date();   // 日历当前显示的月份
  var calSelected = null;       // 日历选中的日期 YYYY-MM-DD
  var toastTimer = null;

  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 3000);
  }

  /* ---------- 渲染 ---------- */
  function visibleItems() {
    var q = filter.q.trim().toLowerCase();
    return items.filter(function (it) {
      if (filter.category !== 'all' && it.category !== filter.category) return false;
      if (filter.type !== 'all' && it.type !== filter.type) return false;
      if (!q) return true;
      var meta = TYPES[it.type] || TYPES.note;
      var hay = [it.title, it.summary, it.body, it.category, (it.tags || []).join(' '), meta.label].join(' ').toLowerCase();
      return hay.indexOf(q) > -1;
    }).sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || '')) ||
             String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
    });
  }

  function excerptOf(it) {
    if (it.summary) return it.summary;
    if (it.quote) return it.quote.replace(/\s+/g, ' ').slice(0, 110);
    if (it.body) return it.body.replace(/\s+/g, ' ').slice(0, 110);
    if (it.links && it.links.length) return (it.links[0].title || it.links[0].url);
    return '';
  }

  function cardHTML(it) {
    var meta = TYPES[it.type] || TYPES.note;
    var img = (it.images || []).filter(function (x) { return x && x.src; })[0];
    var media = img
      ? '<img class="thumb" src="' + esc(img.src) + '" alt="' + esc(it.title) + '" loading="lazy">'
      : tileHTML(it.category);
    var tags = (it.tags || []).slice(0, 4).map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('');
    var bookLine = '';
    if (it.type === 'book') {
      var bk = it.book || {};
      var bits = [];
      if (bk.title) bits.push(esc(bk.title));
      if (bk.author) bits.push(esc(bk.author));
      if (bits.length) bookLine = '<div class="card-book-meta">' + bits.join(' · ') + '</div>';
    }
    var cCount = (it.comments || []).length;
    return '' +
      '<article class="card" tabindex="0" role="button" data-id="' + esc(it.id) + '" aria-label="' + esc(it.title) + '">' +
        '<div class="card-media" data-cat="' + esc(it.category || '') + '"><span class="badge">' + esc(meta.label) + '</span>' + media + '</div>' +
        '<div class="card-body">' +
          '<div class="card-meta">' + catTagHTML(it.category) + '<time>' + esc(fmtDate(it.date)) + '</time>' +
            (cCount ? '<span class="c-badge">评论 ' + cCount + '</span>' : '') +
          '</div>' +
          '<h3>' + esc(it.title) + '</h3>' +
          bookLine +
          '<p class="excerpt">' + esc(excerptOf(it)) + '</p>' +
          (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
        '</div>' +
      '</article>';
  }

  function render() {
    var list = visibleItems();
    $('#grid').innerHTML = list.map(cardHTML).join('');
    $('#empty').hidden = loading || list.length > 0;
    $('#heroCount').textContent = items.length;
    $('#resultLine').textContent = loading
      ? '正在读取…'
      : (items.length ? '显示 ' + list.length + ' / 共 ' + items.length + ' 件' : '');
    $$('#chips .chip').forEach(function (c) {
      c.classList.toggle('is-active', c.dataset.cat === filter.category);
    });
    $('#typeFilter').value = filter.type;
    var hs = $('#heroSource');
    if (hs) {
      hs.textContent = (contentSource === 'online')
        ? (canEdit ? '· 已登录，改动立刻生效' : '· 线上内容，实时更新')
        : '· 内容保存在本机浏览器';
    }
    var et = $('#emptyTitle'), ep = $('#emptyText');
    if (et) et.textContent = canEdit ? '口袋里还什么都没有' : '口袋还是空的';
    if (ep) ep.textContent = canEdit
      ? '一段话、一张图、一个念头、一条链接，什么都可以先放进来。'
      : '等主人往里放点东西吧。';
    renderEditAffordances();
    renderSourceNote();
  }

  /* 线上模式下没登录时（也就是访客），把编辑入口收起来，页面就是只读的 */
  function renderEditAffordances() {
    ['#addBtn', '#heroAdd', '#emptyAdd'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.hidden = !canEdit;
    });
    if (ONLINE) {
      var pub = $('#publishBtn'), rst = $('#resetBtn'), imp = $('#importBtn');
      if (pub) pub.hidden = true;    // 线上模式不需要再导出 content.js
      if (rst) rst.hidden = true;    // 也没有本地草稿要清
      if (imp) imp.hidden = !canEdit;
    }
    // 待办 / 日历是站长自己的东西，访客看不到这两个标签
    var tabs = $('#tabs');
    if (tabs) tabs.hidden = !canEdit;
    if (!canEdit && view !== 'notes') setView('notes');
  }

  function renderSourceNote() {
    var note = $('#sourceNote');
    if (!note) return;
    var n = items.length;
    if (contentSource === 'online') {
      note.innerHTML = '线上数据库 · ' + n + ' 条' +
        (canEdit ? ' · <b>已登录</b>，改完立刻生效' : '');
      return;
    }
    if (!storageOK) {
      note.innerHTML = '注意：这个浏览器不允许本地保存，改动可能留不住 · 建议用本地服务打开，或随时「导出备份」';
      return;
    }
    if (contentSource === 'local') {
      note.innerHTML = '当前显示 <b>本地草稿</b>（' + n + ' 件）· 只在你这台电脑上，导出 content.js 上传后别人才看得到';
    } else if (contentSource === 'published') {
      note.innerHTML = '当前显示 <b>content.js</b> 里的内容（' + n + ' 件）';
    } else {
      note.innerHTML = ONLINE
        ? '线上读取失败，暂时显示 <b>内置示例</b> · 检查一下 supabase-config.js'
        : '当前显示 <b>内置示例</b> · 还没有 content.js';
    }
  }

  /* ================= 星盘 =================
     一圈一圈向外衍射的圆环（实线 / 虚线 / 点线交替，间距由内向外变宽），
     环上散着星点与星座连线。中心留空给标题，三层各自转动（见 styles.css）。 */
  function buildAstrolabe() {
    var targets = document.querySelectorAll('.astro svg');
    if (!targets.length) return;
    var C = 350;
    /* 九道环：半径由内向外间距逐渐变宽，像水波一圈圈扩大 */
    var RINGS = [
      { r: 78,  c: '#a8d3c5', o: .55, w: 1,   dash: '' },
      { r: 106, c: '#b9cfe8', o: .45, w: 1,   dash: '1 7' },
      { r: 134, c: '#cfc6e8', o: .42, w: .8,  dash: '' },
      { r: 168, c: '#a8d3c5', o: .5,  w: 1,   dash: '6 10' },
      { r: 198, c: '#b9cfe8', o: .4,  w: .8,  dash: '' },
      { r: 232, c: '#cfc6e8', o: .38, w: 1,   dash: '1 9' },
      { r: 268, c: '#a8d3c5', o: .36, w: .9,  dash: '10 14' },
      { r: 306, c: '#b9cfe8', o: .32, w: .8,  dash: '' },
      { r: 346, c: '#cfc6e8', o: .3,  w: 1,   dash: '1 12' }
    ];
    function ringHTML(band) {
      return band.map(function (b) {
        return '<circle cx="' + C + '" cy="' + C + '" r="' + b.r + '" stroke="' + b.c +
          '" stroke-width="' + b.w + '" opacity="' + b.o + '"' +
          (b.dash ? ' stroke-dasharray="' + b.dash + '"' : '') + '/>';
      }).join('');
    }

    /* 星点：沿着环带散布（细碎的底星） */
    function starPos(k) {
      var ang = (k * 53) % 360;
      var rr = RINGS[(k * 3) % RINGS.length].r + ((k * 11) % 22) - 11;
      var a = ang * Math.PI / 180;
      return { x: C + Math.sin(a) * rr, y: C - Math.cos(a) * rr };
    }
    /* 四角星图标：用星形代替圆点，绿色 / 蓝色交替，免得看着像脏点 */
    var STAR_COLORS = ['#a8d3c5', '#b9cfe8', '#a8d3c5', '#cfc6e8'];
    function starGlyph(x, y, r, color, opacity) {
      var i = r * 0.3;
      return '<path d="M' + x.toFixed(1) + ' ' + (y - r).toFixed(1) +
        ' L' + (x + i).toFixed(1) + ' ' + (y - i).toFixed(1) +
        ' L' + (x + r).toFixed(1) + ' ' + y.toFixed(1) +
        ' L' + (x + i).toFixed(1) + ' ' + (y + i).toFixed(1) +
        ' L' + x.toFixed(1) + ' ' + (y + r).toFixed(1) +
        ' L' + (x - i).toFixed(1) + ' ' + (y + i).toFixed(1) +
        ' L' + (x - r).toFixed(1) + ' ' + y.toFixed(1) +
        ' L' + (x - i).toFixed(1) + ' ' + (y - i).toFixed(1) + ' Z" fill="' + color + '" stroke="none" opacity="' + opacity + '"/>';
    }
    var stars = '';
    for (var k = 0; k < 34; k++) {
      var p = starPos(k);
      stars += starGlyph(p.x, p.y, 1.7 + ((k * 5) % 4) * 0.5, STAR_COLORS[k % STAR_COLORS.length], (0.5 + ((k * 3) % 3) * 0.16).toFixed(2));
    }

    /* 星座：几组小图案（北斗、仙后 W、三角、钩子、风筝），
       每颗星画成大小不一的点，再用短线连起来——这样才有"星座"的样子 */
    var CONSTELLATIONS = [
      { x: 208, y: 168, rot: -16, s: 1.0, pts: [[0, 0], [16, -10], [32, -12], [46, -4], [58, 8], [74, 6], [88, 14]] },
      { x: 468, y: 206, rot: 12, s: 1.0, pts: [[-34, 0], [-18, 14], [-2, -8], [14, 12], [30, -4]] },
      { x: 262, y: 508, rot: -6, s: 1.05, pts: [[0, -18], [18, 12], [-16, 14], [0, -18]] },
      { x: 524, y: 462, rot: 24, s: 1.0, pts: [[0, 0], [14, 12], [28, 10], [36, -6], [28, -18]] },
      { x: 348, y: 296, rot: 0, s: 0.95, pts: [[-22, -10], [0, -22], [22, -10], [0, 6], [0, -22]] },
      { x: 152, y: 356, rot: 38, s: 0.9, pts: [[0, 0], [18, 5], [28, 20]] }
    ];
    CONSTELLATIONS.forEach(function (c) {
      var rad = c.rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
      var pts = c.pts.map(function (q) {
        var x = q[0] * c.s, y = q[1] * c.s;
        return { x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos };
      });
      stars += '<path d="' + pts.map(function (q, i) {
        return (i ? 'L' : 'M') + q.x.toFixed(1) + ' ' + q.y.toFixed(1);
      }).join(' ') + '" opacity=".5"/>';
      pts.forEach(function (q, i) {
        stars += starGlyph(q.x, q.y, i % 2 === 0 ? 4.2 : 2.8,
          i % 2 === 0 ? '#a8d3c5' : '#b9cfe8', i % 2 === 0 ? '.95' : '.7');
      });
    });
    [[250, 40], [470, 300], [150, 520], [540, 120]].forEach(function (q) {
      var x = q[0], y = q[1];
      stars += '<path d="M' + x + ' ' + (y - 9) + ' L' + (x + 2.6) + ' ' + (y - 2.6) + ' L' + (x + 9) + ' ' + y +
        ' L' + (x + 2.6) + ' ' + (y + 2.6) + ' L' + x + ' ' + (y + 9) + ' L' + (x - 2.6) + ' ' + (y + 2.6) +
        ' L' + (x - 9) + ' ' + y + ' L' + (x - 2.6) + ' ' + (y - 2.6) + ' Z" fill="currentColor" stroke="none" opacity=".7"/>';
    });

    var markup =
      '<g class="g-in" fill="none" stroke-linecap="round">' + ringHTML(RINGS.slice(0, 3)) + '</g>' +
      '<g class="g-star" fill="none" stroke-linecap="round">' + ringHTML(RINGS.slice(3, 6)) + '</g>' +
      '<g class="g-out" fill="none" stroke-linecap="round">' + ringHTML(RINGS.slice(6)) + '</g>' +
      '<g class="g-in" fill="none" stroke="#b9cfe8" stroke-width="1" stroke-linecap="round">' + stars + '</g>';
    Array.prototype.forEach.call(targets, function (el) { el.innerHTML = markup; });
  }

  function buildChips() {
    var html = '<button class="chip is-active" data-cat="all">全部</button>';
    CATEGORIES.forEach(function (c) {
      html += '<button class="chip" data-cat="' + esc(c) + '">' + esc(c) + '</button>';
    });
    $('#chips').innerHTML = html;
  }

  function buildCategoryOptions() {
    $('#fCategory').innerHTML = CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');
  }

  /* ================= 待办 / 待读书目 / 日历 ================= */
  var TASK_KEY = 'douhua-pocket-tasks-v1';

  function pad2(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseYmd(s) { var a = String(s).split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }

  /* 二十四节气：21 世纪常用近似公式，小寒起、每两个月一对 */
  var TERM_C = [5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
    7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94];
  var TERM_N = ['小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
    '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'];

  function termsOfMonth(year, month) {
    var y = year % 100, out = {}, i0 = (month - 1) * 2;
    for (var k = 0; k < 2; k++) {
      var i = i0 + k;
      var day = Math.floor(y * 0.2422 + TERM_C[i]) - Math.floor((i < 4 ? (y - 1) : y) / 4);
      out[day] = TERM_N[i];
    }
    return out;
  }
  function termOfDay(d) { return termsOfMonth(d.getFullYear(), d.getMonth() + 1)[d.getDate()] || ''; }

  /* 公历节日：固定日期，不会错 */
  var FIXED_HOLIDAY = {
    '01-01': '元旦', '02-14': '情人节', '03-08': '妇女节', '03-12': '植树节', '04-01': '愚人节',
    '05-01': '劳动节', '05-04': '青年节', '06-01': '儿童节', '07-01': '建党节', '08-01': '建军节',
    '09-10': '教师节', '10-01': '国庆节', '10-31': '万圣夜', '11-11': '双十一',
    '12-24': '平安夜', '12-25': '圣诞节'
  };
  /* 农历大节：按年份查表（目前 2025-2027）。
     调休安排以国务院公布为准，这里只标节日名；跨年后让 Codex 补下一年即可。 */
  var LUNAR_HOLIDAY = {
    '2025': { '01-28': '除夕', '01-29': '春节', '02-12': '元宵', '05-31': '端午', '08-29': '七夕', '09-06': '中元', '10-06': '中秋', '10-29': '重阳' },
    '2026': { '02-16': '除夕', '02-17': '春节', '03-03': '元宵', '06-19': '端午', '08-19': '七夕', '08-27': '中元', '09-25': '中秋', '10-18': '重阳' },
    '2027': { '02-05': '除夕', '02-06': '春节', '02-20': '元宵', '06-09': '端午', '08-08': '七夕', '08-16': '中元', '09-15': '中秋', '10-08': '重阳' }
  };
  function holidayOf(d) {
    var mmdd = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    var y = String(d.getFullYear());
    return (LUNAR_HOLIDAY[y] && LUNAR_HOLIDAY[y][mmdd]) || FIXED_HOLIDAY[mmdd] || '';
  }
  function dayLabel(d) { return holidayOf(d) || termOfDay(d) || ''; }

  function rowToTask(r) {
    return {
      id: r.id, kind: r.kind || 'todo', title: r.title || '',
      author: r.author || '', genre: r.genre || '', note: r.note || '',
      date: r.date || '', done: !!r.done, doneAt: r.done_at || '', createdAt: r.created_at || ''
    };
  }
  function taskToRow(t) {
    return {
      kind: t.kind || 'todo', title: t.title || '',
      author: t.author || '', genre: t.genre || '', note: t.note || '',
      date: t.date || null, done: !!t.done,
      done_at: t.done ? (t.doneAt || new Date().toISOString()) : null,
      updated_at: new Date().toISOString()
    };
  }
  function readTaskStore() {
    try { var raw = localStorage.getItem(TASK_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeTaskStore() {
    try { localStorage.setItem(TASK_KEY, JSON.stringify(tasks)); } catch (e) {}
  }

  function loadTasks() {
    if (!ONLINE) { tasks = readTaskStore() || []; tasksReady = true; return Promise.resolve(); }
    if (!canEdit) { tasks = []; tasksReady = true; return Promise.resolve(); }
    return sb.from('tasks').select('*').order('created_at', { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        tasks = (res.data || []).map(rowToTask);
        tasksReady = true;
      })
      .catch(function () {
        tasks = [];
        tasksReady = false;   // 多半是还没建表
      });
  }
  function persistTask(t, isNew) {
    if (!ONLINE) { writeTaskStore(); return Promise.resolve(); }
    var row = taskToRow(t);
    var q = isNew
      ? sb.from('tasks').insert(row).select().single()
      : sb.from('tasks').update(row).eq('id', t.id);
    return q.then(function (res) {
      if (res.error) throw res.error;
      if (isNew && res.data) t.id = res.data.id;
    });
  }
  function removeTaskRow(id) {
    if (!ONLINE) return Promise.resolve();
    return sb.from('tasks').delete().eq('id', id).then(checkErr);
  }

  function sortTasks(list) {
    return list.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      var da = a.date || '', db = b.date || '';
      if (da !== db) return da < db ? -1 : 1;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
  }
  function taskHTML(t) {
    var meta = [];
    if (t.kind === 'book') {
      if (t.author) meta.push(esc(t.author));
      if (t.genre) meta.push(esc(t.genre));
    }
    if (t.date) meta.push(esc(t.date));
    if (t.note) meta.push(esc(t.note));
    return '<li class="task' + (t.done ? ' is-done' : '') + '" data-id="' + esc(t.id) + '">' +
      '<button class="task-check" type="button" aria-label="标记完成"></button>' +
      '<div class="task-main">' +
        '<div class="task-title">' + esc(t.title) + '</div>' +
        (meta.length ? '<div class="task-meta">' + meta.join(' · ') + '</div>' : '') +
      '</div>' +
      '<button class="task-del" type="button" aria-label="删除">×</button>' +
      '</li>';
  }

  function renderTodos() {
    var books = tasks.filter(function (t) { return t.kind === 'book'; });
    var todos = tasks.filter(function (t) { return t.kind === 'todo'; });
    var bookList = $('#bookList'), todoList = $('#todoList');
    if (!bookList || !todoList) return;
    bookList.innerHTML = books.length
      ? sortTasks(books).map(taskHTML).join('')
      : '<li class="task-empty">还没有想读的书</li>';
    todoList.innerHTML = todos.length
      ? sortTasks(todos).map(taskHTML).join('')
      : '<li class="task-empty">暂时没有待办</li>';
    $('#bookCount').textContent = books.filter(function (t) { return !t.done; }).length;
    $('#todoCount').textContent = todos.filter(function (t) { return !t.done; }).length;
    var setup = $('#todoSetup');
    setup.hidden = tasksReady;
    if (!tasksReady) {
      setup.innerHTML = '待办功能还没启用：需要先在 Supabase 的 <b>SQL Editor</b> 里跑一下 ' +
        '<code>supabase-schema.sql</code> 末尾那段建表语句（表名 <code>tasks</code>），然后刷新本页。';
    }
  }

  function renderCalendar() {
    var grid = $('#calGrid');
    if (!grid) return;
    var y = calCursor.getFullYear(), m = calCursor.getMonth();
    $('#calTitle').textContent = y + ' 年 ' + (m + 1) + ' 月';
    var terms = termsOfMonth(y, m + 1);
    var startPad = new Date(y, m, 1).getDay();
    var days = new Date(y, m + 1, 0).getDate();
    var today = ymd(new Date());
    var byDate = {};
    tasks.forEach(function (t) { if (t.date) (byDate[t.date] = byDate[t.date] || []).push(t); });

    var total = Math.ceil((startPad + days) / 7) * 7;
    var cells = '';
    for (var i = 0; i < total; i++) {
      var d = new Date(y, m, i - startPad + 1);
      var ds = ymd(d);
      var out = d.getMonth() !== m;
      var label = out ? holidayOf(d) : (holidayOf(d) || terms[d.getDate()] || '');
      var list = byDate[ds] || [];
      cells += '<button class="cal-cell' + (out ? ' is-out' : '') +
        (ds === today ? ' is-today' : '') + (ds === calSelected ? ' is-sel' : '') +
        '" type="button" data-date="' + ds + '">' +
        '<span class="cal-num">' + d.getDate() + '</span>' +
        (label ? '<span class="cal-label">' + esc(label) + '</span>' : '') +
        (list.length ? '<span class="cal-dots">' +
          list.slice(0, 4).map(function () { return '<i></i>'; }).join('') + '</span>' : '') +
        '</button>';
    }
    grid.innerHTML = cells;
    renderCalDay();
  }

  function renderCalDay() {
    var box = $('#calDay');
    if (!box) return;
    if (!calSelected) { box.innerHTML = '<p class="cal-hint">点上面任意一天，看当天的事项。</p>'; return; }
    var d = parseYmd(calSelected);
    var label = dayLabel(d);
    var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    var list = tasks.filter(function (t) { return t.date === calSelected; });
    var html = '<div class="cal-day-head"><h4>' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · 星期' + week + '</h4>' +
      (label ? '<span class="cal-tag">' + esc(label) + '</span>' : '') + '</div>';
    html += '<ul class="task-list">' + (list.length
      ? sortTasks(list).map(taskHTML).join('')
      : '<li class="task-empty">这天还没有安排</li>') + '</ul>';
    html += '<form class="cal-add" id="calAddForm">' +
      '<input class="inp" id="calAddInput" placeholder="给这天加一件事…">' +
      '<button class="btn btn-primary btn-sm" type="submit">添加</button></form>';
    box.innerHTML = html;
    $('#calAddForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#calAddInput').value.trim();
      if (!v) return;
      addTaskObj({ kind: 'event', title: v, date: calSelected });
    });
  }

  function setView(v) {
    view = v;
    $$('#tabs .tab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-view') === v);
    });
    $('#notesHead').hidden = (v !== 'notes');
    $('#notesView').hidden = (v !== 'notes');
    $('#todoView').hidden = (v !== 'todo');
    $('#calView').hidden = (v !== 'calendar');
    $('#achView').hidden = (v !== 'ach');
    if (v === 'todo') renderTodos();
    if (v === 'calendar') {
      if (!calSelected) calSelected = ymd(new Date());
      renderCalendar();
    }
    if (v === 'ach') renderAchievements();
  }

  /* ---------- 增删改 ---------- */
  function afterTaskChange() { renderTodos(); renderCalendar(); evaluateAchievements(); }
  function taskFail(err) {
    toast('保存失败：' + ((err && err.message) ? err.message : '未知错误'));
    return loadTasks().then(afterTaskChange);
  }

  function addTaskObj(data) {
    var t = Object.assign({ id: uid(), done: false, doneAt: '', createdAt: new Date().toISOString() }, data);
    tasks.push(t);
    persistTask(t, true).then(function () {
      afterTaskChange();
      toast('已添加');
    }).catch(taskFail);
  }
  function toggleTask(id) {
    var t = tasks.filter(function (x) { return x.id === id; })[0];
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? new Date().toISOString() : '';
    afterTaskChange();
    persistTask(t, false).catch(taskFail);
  }
  function deleteTaskById(id) {
    askConfirm('删掉这一条？', '删除', true).then(function (ok) {
      if (!ok) return;
      tasks = tasks.filter(function (x) { return x.id !== id; });
      afterTaskChange();
      removeTaskRow(id).catch(taskFail);
    });
  }

  function openTaskModal(kind, task, date) {
    var k = task ? task.kind : (kind || 'todo');
    var isBook = (k === 'book');
    $('#taskId').value = task ? task.id : '';
    $('#taskKind').value = k;
    $('#taskModalTitle').textContent = task
      ? (isBook ? '编辑书目' : (k === 'event' ? '编辑事项' : '编辑待办'))
      : (isBook ? '添加书目' : (k === 'event' ? '添加事项' : '添加待办'));
    $('#taskTitleLabel').innerHTML = isBook ? '书名 <span class="req">*</span>' : '内容 <span class="req">*</span>';
    $('#taskTitle').placeholder = isBook ? '比如：《金枝》' : (k === 'event' ? '这天要做什么？' : '要做什么？');
    $('#taskAuthorField').hidden = !isBook;
    $('#taskGenreField').hidden = !isBook;
    $('#taskDateField').hidden = isBook;
    $('#taskTitle').value = task ? task.title : '';
    $('#taskAuthor').value = (task && task.author) || '';
    $('#taskGenre').value = (task && task.genre) || '';
    $('#taskNote').value = (task && task.note) || '';
    $('#taskDate').value = (task && task.date) || date || '';
    openModal('taskModal');
    setTimeout(function () { $('#taskTitle').focus(); }, 60);
  }

  function submitTaskForm(e) {
    e.preventDefault();
    var id = $('#taskId').value;
    var kind = $('#taskKind').value || 'todo';
    var title = $('#taskTitle').value.trim();
    if (!title) { toast('先写点什么'); $('#taskTitle').focus(); return; }
    var data = {
      kind: kind, title: title,
      author: $('#taskAuthor').value.trim(),
      genre: $('#taskGenre').value.trim(),
      note: $('#taskNote').value.trim(),
      date: $('#taskDate').value || ''
    };
    if (id) {
      var t = tasks.filter(function (x) { return x.id === id; })[0];
      if (!t) return;
      Object.assign(t, data);
      persistTask(t, false).then(afterTaskChange).catch(taskFail);
      toast('已更新');
    } else {
      var nt = Object.assign({ id: uid(), done: false, doneAt: '', createdAt: new Date().toISOString() }, data);
      tasks.push(nt);
      persistTask(nt, true).then(afterTaskChange).catch(taskFail);
      toast('已添加');
    }
    closeModal('taskModal');
  }

  /* ================= 成就 ================= */
  var ACH_KEY = 'douhua-pocket-achievements-v1';
  var STATS_KEY = 'douhua-pocket-stats-v1';
  var ach = {};            // id -> 解锁时间
  var achReady = true;     // 线上还没建 achievements 表时为 false
  var achQueue = [];
  var achTimer = null;

  var ACHIEVEMENTS = [
    /* —— 内容 —— */
    { id: 'first-entry', name: '第一勺', icon: '🥢', tier: 'common',
      desc: '发布第一条内容。锅已经架好了。',
      check: function (c) { return c.entries.length >= 1; } },
    { id: 'five-types', name: '五行不缺', icon: '🖐', tier: 'rare',
      desc: '图文、图片、视频、链接、读书笔记，五样都齐了。',
      check: function (c) {
        var s = {};
        c.entries.forEach(function (e) { s[e.type] = 1; });
        return ['note', 'image', 'video', 'link', 'book'].every(function (t) { return s[t]; });
      } },
    { id: 'nine-cats', name: '九宫格', icon: '🧩', tier: 'legend',
      desc: '九个分类，每格都塞了点东西。',
      check: function (c) {
        var s = {};
        c.entries.forEach(function (e) { if (e.category) s[e.category] = 1; });
        return CATEGORIES.every(function (x) { return s[x]; });
      } },
    { id: 'twenty', name: '二十而立', icon: '📦', tier: 'rare',
      desc: '收藏满 20 条。',
      check: function (c) { return c.entries.length >= 20; } },
    { id: 'tenk', name: '一万字而已', icon: '✍️', tier: 'legend',
      desc: '所有正文加起来超过一万字（摘录不算）。',
      check: function (c) {
        var n = 0;
        c.entries.forEach(function (e) { n += String(e.body || '').length; });
        return n >= 10000;
      } },
    { id: 'ten-images', name: '有图有真相', icon: '📷', tier: 'common',
      desc: '上传满 10 张图片。',
      check: function (c) {
        var n = 0;
        c.entries.forEach(function (e) { n += (e.images || []).length; });
        return n >= 10;
      } },
    { id: 'night-owl', name: '熬夜的证据', icon: '🌙', tier: 'rare',
      desc: '在凌晨 0 点到 5 点之间发过内容。',
      check: function (c) {
        return c.entries.some(function (e) {
          var h = new Date(e.createdAt).getHours();
          return !isNaN(h) && h >= 0 && h < 5;
        });
      } },
    { id: 'streak-7', name: '七日谈', icon: '📆', tier: 'rare',
      desc: '连续 7 天都有发布。',
      check: function (c) {
        return hasStreak(c.entries.map(function (e) { return String(e.createdAt || e.date || '').slice(0, 10); }), 7);
      } },

    /* —— 读书 —— */
    { id: 'first-wish', name: '先码为敬', icon: '🔖', tier: 'common',
      desc: '添加第一本想读的书。',
      check: function (c) { return c.books.length >= 1; } },
    { id: 'first-read', name: '居然读完了', icon: '📗', tier: 'common',
      desc: '第一本书打了钩。',
      check: function (c) { return c.books.some(function (b) { return b.done; }); } },
    { id: 'ten-read', name: '书架不是摆设', icon: '📚', tier: 'legend',
      desc: '累计读完 10 本。',
      check: function (c) { return c.books.filter(function (b) { return b.done; }).length >= 10; } },
    { id: 'five-genres', name: '杂食动物', icon: '🍽', tier: 'rare',
      desc: '书单覆盖 5 种不同类型。',
      check: function (c) {
        var s = {};
        c.books.forEach(function (b) { if (b.genre) s[b.genre] = 1; });
        return Object.keys(s).length >= 5;
      } },

    /* —— 待办与日历 —— */
    { id: 'first-done', name: '搞定一件', icon: '✅', tier: 'common',
      desc: '完成第一条待办。',
      check: function (c) { return c.todos.some(function (t) { return t.done; }); } },
    { id: 'fifty-done', name: '干掉了五十件', icon: '💪', tier: 'legend',
      desc: '累计完成 50 条待办。',
      check: function (c) { return c.todos.filter(function (t) { return t.done; }).length >= 50; } },
    { id: 'clear-day', name: '今日事今日毕', icon: '🌤', tier: 'rare',
      desc: '把某一天的待办全部打了钩。',
      check: function (c) {
        return Object.keys(c.byDay).some(function (d) {
          var l = c.byDay[d];
          return l.length && l.every(function (t) { return t.done; });
        });
      } },
    { id: 'first-event', name: '钉在日历上', icon: '📌', tier: 'common',
      desc: '第一次给某一天添加事项。',
      check: function (c) { return c.events.length >= 1; } },
    { id: 'solar-term', name: '踩着节气走', icon: '🌾', tier: 'rare',
      desc: '在二十四节气当天发过内容。',
      check: function (c) {
        return c.entries.some(function (e) {
          if (!e.date || String(e.date).length < 10) return false;
          return !!termOfDay(parseYmd(e.date));
        });
      } },

    /* —— 彩蛋（解锁前看不见是什么） —— */
    { id: 'first-visitor', name: '有人敲门', icon: '🚪', tier: 'common',
      desc: '收到第一条访客留言。',
      check: function (c) { return c.commentTotal >= 1; } },
    { id: 'hot-entry', name: '门庭若市', icon: '🏮', tier: 'legend', hidden: true,
      desc: '单条内容收到 10 条留言。',
      check: function (c) {
        return c.entries.some(function (e) { return (e.comments || []).length >= 10; });
      } },
    { id: 'new-year-eve', name: '守岁', icon: '🧧', tier: 'rare', hidden: true,
      desc: '除夕当天发过内容。',
      check: function (c) {
        return c.entries.some(function (e) {
          return e.date && String(e.date).length >= 10 && holidayOf(parseYmd(e.date)) === '除夕';
        });
      } },
    { id: 'anniversary', name: '一年了，还活着', icon: '🎂', tier: 'legend', hidden: true,
      desc: '网站满一周年。',
      check: function (c) {
        if (!c.entries.length) return false;
        var first = c.entries.map(function (e) { return e.createdAt || ''; }).sort()[0];
        return !!first && (Date.now() - new Date(first).getTime()) >= 365 * 864e5;
      } },
    { id: 'backup', name: '有备无患', icon: '🎒', tier: 'rare', hidden: true,
      desc: '导出过 5 次备份。',
      check: function (c) { return (c.stats.exports || 0) >= 5; } }
  ];

  function readStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function bumpStat(k) {
    var s = readStats();
    s[k] = (s[k] || 0) + 1;
    try { localStorage.setItem(STATS_KEY, JSON.stringify(s)); } catch (e) {}
    return s[k];
  }
  function readAchStore() {
    try { return JSON.parse(localStorage.getItem(ACH_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeAchStore() {
    try { localStorage.setItem(ACH_KEY, JSON.stringify(ach)); } catch (e) {}
  }
  function hasStreak(days, n) {
    var set = {};
    days.forEach(function (d) { if (d && d.length === 10) set[d] = 1; });
    var list = Object.keys(set).sort();
    var best = 0, run = 0, prev = null;
    list.forEach(function (d) {
      if (prev) {
        var diff = (parseYmd(d) - parseYmd(prev)) / 86400000;
        run = (diff === 1) ? run + 1 : 1;
      } else { run = 1; }
      prev = d;
      if (run > best) best = run;
    });
    return best >= n;
  }
  function achContext() {
    var entries = items || [];
    var byDay = {};
    tasks.forEach(function (t) { if (t.date && t.kind === 'todo') (byDay[t.date] = byDay[t.date] || []).push(t); });
    return {
      entries: entries,
      books: tasks.filter(function (t) { return t.kind === 'book'; }),
      todos: tasks.filter(function (t) { return t.kind === 'todo'; }),
      events: tasks.filter(function (t) { return t.kind === 'event'; }),
      byDay: byDay,
      stats: readStats(),
      commentTotal: entries.reduce(function (n, e) { return n + (e.comments || []).length; }, 0)
    };
  }
  function safeCheck(a, ctx) { try { return !!a.check(ctx); } catch (e) { return false; } }

  function pushAch(ids) {
    if (!ONLINE || !achReady || !ids.length) return;
    sb.from('achievements')
      .upsert(ids.map(function (id) { return { id: id, unlocked_at: ach[id] }; }),
        { onConflict: 'id', ignoreDuplicates: true })
      .then(function () {})
      .catch(function () {});
  }

  function loadAchievements() {
    if (!ONLINE) { ach = readAchStore(); achReady = true; return Promise.resolve(); }
    if (!canEdit) { ach = {}; achReady = true; return Promise.resolve(); }
    return sb.from('achievements').select('*').then(function (res) {
      if (res.error) throw res.error;
      ach = {};
      (res.data || []).forEach(function (r) { ach[r.id] = r.unlocked_at; });
      achReady = true;
      // 本地记过、线上还没有的（比如建表之前解锁的）补传一次
      var local = readAchStore(), merged = [];
      Object.keys(local).forEach(function (id) {
        if (!ach[id] && ACHIEVEMENTS.some(function (a) { return a.id === id; })) {
          ach[id] = local[id];
          merged.push(id);
        }
      });
      if (merged.length) pushAch(merged);
    }).catch(function () {
      ach = readAchStore();     // 表还没建就先存在本地，功能照样能用
      achReady = false;
    });
  }

  function unlockAchievements(ids) {
    var now = new Date().toISOString();
    var fresh = [];
    ids.forEach(function (id) { if (!ach[id]) { ach[id] = now; fresh.push(id); } });
    if (!fresh.length) return;
    writeAchStore();
    pushAch(fresh);
    achQueue = achQueue.concat(fresh);
    showAchToast();
  }
  function evaluateAchievements() {
    if (!canEdit) return;
    var ctx = achContext();
    var newly = ACHIEVEMENTS.filter(function (a) { return !ach[a.id] && safeCheck(a, ctx); })
      .map(function (a) { return a.id; });
    unlockAchievements(newly);
    renderAchievements();
  }

  function showAchToast() {
    if (achTimer || !achQueue.length) return;
    var id = achQueue.shift();
    var a = ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
    if (!a) { showAchToast(); return; }
    var el = $('#achToast');
    if (!el) return;
    $('#achToastIcon').textContent = a.icon;
    $('#achToastName').textContent = a.name;
    $('#achToastDesc').textContent = a.desc;
    el.hidden = false;
    el.classList.remove('is-on');
    void el.offsetWidth;                 // 强制重排，让动画重新播一次
    el.classList.add('is-on');
    achTimer = setTimeout(function () {
      el.classList.remove('is-on');
      achTimer = null;
      setTimeout(function () {
        if (!achQueue.length) el.hidden = true;
        showAchToast();
      }, 460);
    }, 4200);
  }

  function renderAchievements() {
    var grid = $('#achGrid');
    if (!grid) return;
    var got = ACHIEVEMENTS.filter(function (a) { return ach[a.id]; }).length;
    $('#achProgress').textContent = got + ' / ' + ACHIEVEMENTS.length;
    $('#achBar').style.width = Math.round(got / ACHIEVEMENTS.length * 100) + '%';
    var setup = $('#achSetup');
    if (setup) {
      setup.hidden = achReady;
      if (!achReady) {
        setup.innerHTML = '成就现在只记在这台电脑的浏览器里。想在手机上也能看到同一份进度，' +
          '去 Supabase 的 <b>SQL Editor</b> 跑一下 <code>supabase-schema.sql</code> 末尾那段（建 <code>achievements</code> 表），然后刷新。';
      }
    }
    grid.innerHTML = ACHIEVEMENTS.map(function (a) {
      var on = !!ach[a.id];
      var masked = a.hidden && !on;
      return '<div class="ach' + (on ? ' is-on' : '') + ' tier-' + (a.tier || 'common') + '">' +
        '<div class="ach-icon">' + (masked ? '❔' : a.icon) + '</div>' +
        '<div class="ach-body">' +
          '<div class="ach-title">' + (masked ? '？？？' : esc(a.name)) + '</div>' +
          '<div class="ach-desc">' + (masked ? '一条隐藏成就，解锁后才知道是什么。' : esc(a.desc)) + '</div>' +
          (on ? '<div class="ach-date">' + esc(fmtDate(String(ach[a.id]).slice(0, 10))) + ' 解锁</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ---------- 详情 ---------- */
  function paragraphs(text) {
    return String(text).split(/\n{2,}/).map(function (b) {
      return '<p>' + esc(b).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }

  function linksHTML(links, big) {
    var rows = links.filter(function (l) { return l && l.url; }).map(function (l) {
      return '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
        '<span class="l-title">' + esc(l.title || l.url) + '</span>' +
        '<span class="l-host">' + esc(hostOf(l.url)) + '</span>' +
        (l.note ? '<em>' + esc(l.note) + '</em>' : '') +
        '</a></li>';
    }).join('');
    if (!rows) return '';
    return '<ul class="link-list' + (big ? ' big' : '') + '">' + rows + '</ul>';
  }

  function mediaHTML(it) {
    var out = '';
    var imgs = (it.images || []).filter(function (x) { return x && x.src; });
    if (imgs.length) {
      out += '<div class="gallery' + (imgs.length === 1 ? ' single' : '') + '">' + imgs.map(function (im) {
        return '<figure><a href="' + esc(im.src) + '" target="_blank" rel="noopener">' +
          '<img src="' + esc(im.src) + '" alt="' + esc(im.caption || it.title) + '" loading="lazy"></a>' +
          (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '') +
          '</figure>';
      }).join('') + '</div>';
    }
    (it.videos || []).filter(function (v) { return v && v.src; }).forEach(function (v) {
      var inner = (v.kind === 'file')
        ? '<video controls preload="metadata" src="' + esc(v.src) + '"></video>'
        : '<div class="frame"><iframe src="' + esc(v.src) + '" allowfullscreen loading="lazy" referrerpolicy="no-referrer"></iframe></div>';
      out += '<figure class="video-figure">' + inner +
        (v.caption ? '<figcaption>' + esc(v.caption) + '</figcaption>' : '') + '</figure>';
    });
    if (it.type === 'link') out += linksHTML(it.links || [], true);
    return out;
  }

  /* ---------- 评论 ---------- */
  function commentHTML(c) {
    return '<article class="comment" data-cid="' + esc(c.id) + '">' +
      '<div class="c-head">' +
        '<span class="c-name">' + esc(c.name || '匿名') + '</span>' +
        '<time>' + esc(fmtDateTime(c.date)) + '</time>' +
        (canEdit ? '<button class="c-del" type="button" title="删除这条评论" aria-label="删除这条评论">×</button>' : '') +
      '</div>' +
      '<p>' + esc(c.text).replace(/\n/g, '<br>') + '</p>' +
      '</article>';
  }

  function commentsHTML(it) {
    var list = it.comments || [];
    return '<section class="comments">' +
      '<h3 class="c-title">评论 <span id="commentCount">' + list.length + '</span></h3>' +
      '<div class="comment-list" id="commentList">' + list.map(commentHTML).join('') + '</div>' +
      (list.length ? '' : '<p class="c-empty">还没有评论。</p>') +
      '<form class="comment-form" id="commentForm">' +
        '<input class="inp c-name-input" id="cName" maxlength="20" placeholder="昵称（可留空）" value="' + esc(readName()) + '">' +
        '<textarea class="inp textarea-sm" id="cText" placeholder="写点什么…"></textarea>' +
        '<div class="comment-foot">' +
          '<span class="hint">评论会跟着这条内容一起保存</span>' +
          '<button class="btn btn-primary" type="submit">发表</button>' +
        '</div>' +
      '</form>' +
      '</section>';
  }

  function openDetail(id) {
    var it = items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var meta = TYPES[it.type] || TYPES.note;
    var bk = it.book || {};
    var html = '';
    // 顶栏：返回 +（登录后才有）编辑 / 删除
    html += '<div class="reader-bar">' +
      '<button class="reader-back" type="button" data-close="detailModal">← 返回</button>' +
      '<div class="reader-actions">' +
        (canEdit
          ? '<button class="btn btn-ghost btn-sm" type="button" id="editEntryBtn">编辑</button>' +
            '<button class="btn btn-danger btn-sm" type="button" id="deleteEntryBtn">删除</button>'
          : '') +
      '</div>' +
      '</div>';
    html += '<div class="astro astro-reader" aria-hidden="true"><svg viewBox="0 0 700 700"></svg></div>';
    html += '<article class="reader">';
    html += '<div class="detail-head">' +
      '<div class="card-meta">' + catTagHTML(it.category) +
      '<span class="tag">' + esc(meta.label) + '</span><time>' + esc(fmtDate(it.date)) + '</time>' +
      (it.type === 'book' && bk.status ? '<span class="status-chip' + statusClass(bk.status) + '">' + esc(bk.status) + '</span>' : '') +
      '</div>' +
      '<h2>' + esc(it.title) + '</h2>';
    if (it.type === 'book') {
      var bits = [];
      if (bk.title) bits.push('<span class="bk-title">' + esc(bk.title) + '</span>');
      if (bk.author) bits.push('<span class="bk-author">' + esc(bk.author) + '</span>');
      if (bk.edition) bits.push('<span>' + esc(bk.edition) + '</span>');
      if (bk.locator) bits.push('<span class="bk-loc">' + esc(bk.locator) + '</span>');
      if (bits.length) html += '<div class="book-meta">' + bits.join('') + '</div>';
    }
    if (it.summary) html += '<p class="detail-summary">' + esc(it.summary) + '</p>';
    html += '</div>';
    if (it.quote) html += '<div class="quote">' + paragraphs(it.quote) + '</div>';
    html += mediaHTML(it);
    if (it.body) html += '<div class="detail-body">' + paragraphs(it.body) + '</div>';
    if (it.type !== 'link' && it.links && it.links.length) html += linksHTML(it.links, false);
    if (it.tags && it.tags.length) {
      html += '<div class="detail-tags">' + it.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</div>';
    }
    html += commentsHTML(it);
    html += '<div class="detail-foot">' +
      '<button class="btn btn-ghost" type="button" data-close="detailModal">← 返回</button>' +
      '</div>';
    html += '</article>';
    $('#detailContent').innerHTML = html;
    buildAstrolabe();          // 阅读页里那份星盘也要画出来
    openModal('detailModal');
    if (canEdit) {
      $('#editEntryBtn').onclick = function () { closeModal('detailModal'); openEditor(it.id); };
      $('#deleteEntryBtn').onclick = function () { deleteEntry(it.id); };
    }
    bindComments(it);
  }

  function bindComments(it) {
    var entryOf = function () {
      return items.filter(function (x) { return x.id === it.id; })[0];
    };

    $('#commentForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var text = $('#cText').value.trim();
      if (!text) { toast('先写点什么再发表吧'); $('#cText').focus(); return; }
      var name = $('#cName').value.trim();
      saveName(name);
      var c = { id: uid(), name: name, text: text, date: new Date().toISOString() };
      var entry = entryOf();
      if (!entry) return;
      var emptyEl = $('.c-empty', $('#detailModal'));

      if (ONLINE) {
        sb.from('comments')
          .insert({ entry_id: entry.id, name: name, content: text })
          .select().single()
          .then(function (res) {
            if (res.error) throw res.error;
            var row = res.data;
            if (emptyEl) emptyEl.remove();
            $('#commentList').insertAdjacentHTML('beforeend',
              commentHTML({ id: row.id, name: row.name || '', text: row.content, date: row.created_at }));
            $('#commentCount').textContent = String($('#commentList').children.length);
            $('#cText').value = '';
            toast('已发表');
            evaluateAchievements();
          })
          .catch(function (err) { toast('发表失败：' + err.message); });
        return;
      }

      entry.comments = entry.comments || [];
      entry.comments.push(c);
      entry.updatedAt = c.date;
      writeStore(items);
      if (emptyEl) emptyEl.remove();
      $('#commentList').insertAdjacentHTML('beforeend', commentHTML(c));
      $('#commentCount').textContent = entry.comments.length;
      $('#cText').value = '';
      render();
      toast('已发表');
      evaluateAchievements();
    });

    $('#commentList').addEventListener('click', function (e) {
      var btn = e.target.closest('.c-del');
      if (!btn) return;
      var wrap = btn.closest('.comment');
      if (!wrap) return;
      var cid = wrap.getAttribute('data-cid');
      askConfirm('删除这条评论？', '删除', true).then(function (ok) {
        if (!ok) return;
        if (ONLINE) {
          sb.from('comments').delete().eq('id', cid).then(checkErr).then(function () {
            wrap.remove();
            $('#commentCount').textContent = String($('#commentList').children.length);
            if (!$('#commentList').children.length) {
              $('#commentList').insertAdjacentHTML('afterend', '<p class="c-empty">还没有评论。</p>');
            }
            toast('已删除');
          }).catch(function (err) { toast('删除失败：' + err.message); });
          return;
        }
        var entry = entryOf();
        if (!entry) return;
        entry.comments = (entry.comments || []).filter(function (c) { return c.id !== cid; });
        writeStore(items);
        wrap.remove();
        $('#commentCount').textContent = entry.comments.length;
        if (!entry.comments.length) {
          $('#commentList').insertAdjacentHTML('afterend', '<p class="c-empty">还没有评论。</p>');
        }
        render();
        toast('已删除');
      });
    });
  }

  function deleteEntry(id) {
    askConfirm('确定把这件收藏从口袋里拿出来吗？删除后无法撤销，建议先导出备份。', '删除', true).then(function (ok) {
      if (!ok) return;
      if (ONLINE) {
        sb.from('entries').delete().eq('id', id).then(checkErr).then(function () {
          closeModal('detailModal');
          toast('已删除');
          return refreshOnline();
        }).catch(function (err) { toast('删除失败：' + err.message); });
        return;
      }
      items = items.filter(function (x) { return x.id !== id; });
      writeStore(items);
      render();
      closeModal('detailModal');
      toast('已删除');
    });
  }

  /* ---------- 弹层 ---------- */
  function openModal(id) {
    $('#' + id).hidden = false;
    document.body.classList.add('noscroll');
  }
  function hideModal(id) {
    var el = $('#' + id);
    if (!el) return;
    el.hidden = true;
    if ($$('.modal:not([hidden])').length === 0) document.body.classList.remove('noscroll');
  }
  function closeModal(id) {
    hideModal(id);
    if (id === 'confirmModal' && confirmResolve) {
      var resolve = confirmResolve;
      confirmResolve = null;
      resolve(false);
    }
  }
  function closeTopModal() {
    var open = $$('.modal:not([hidden])');
    if (open.length) closeModal(open[open.length - 1].id);
  }

  /* 站内确认框，替代浏览器原生 confirm */
  function askConfirm(message, okText, danger) {
    $('#confirmMsg').textContent = message;
    var ok = $('#confirmOk');
    ok.textContent = okText || '确定';
    ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');
    openModal('confirmModal');
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }

  /* ---------- 登录：只有站长需要，别人打开是只读的 ---------- */
  function setSession(s) {
    session = s || null;
    canEdit = !ONLINE || !!session;
    renderAuthUI();
    render();
    loadTasks().then(function () {
      renderTodos();
      if (view === 'calendar') renderCalendar();
      return loadAchievements();
    }).then(function () {
      evaluateAchievements();
    });
  }

  function renderAuthUI() {
    var btn = $('#authBtn');
    if (!btn) return;
    if (!ONLINE) { btn.hidden = true; return; }
    btn.hidden = false;
    btn.textContent = session ? '退出' : '登录';
    btn.title = (session && session.user) ? session.user.email : '只有你自己需要登录';
  }

  function initAuth() {
    if (!ONLINE) return;
    sb.auth.getSession().then(function (res) {
      setSession(res && res.data ? res.data.session : null);
    }).catch(function () { setSession(null); });
    sb.auth.onAuthStateChange(function (_evt, s) { setSession(s); });
  }

  /* ---------- 实时推送：你保存之后，正开着页面的人会自动看到新的 ---------- */
  function subscribeRealtime() {
    if (!ONLINE) return;
    sb.channel('douhua-pocket')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, function () { refreshOnline(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, function () { refreshOnline(); })
      .subscribe();
  }

  /* ---------- 表单行 ---------- */
  function imageRowHTML(data) {
    data = data || {};
    return '<div class="row">' +
      '<img class="row-thumb' + (data.src ? '' : ' is-empty') + '" alt="" src="' + esc(data.src || '') + '">' +
      '<div class="row-main">' +
        '<input class="inp img-src" placeholder="图片地址 https://…" value="' + esc(data.src || '') + '">' +
        '<input class="inp img-cap" placeholder="图片说明（可选）" value="' + esc(data.caption || '') + '">' +
      '</div>' +
      '<div class="row-side">' +
        '<label class="mini-btn">选文件<input type="file" accept="image/*" class="img-file" hidden></label>' +
        '<button class="mini-btn danger row-del" type="button">删除</button>' +
      '</div>' +
    '</div>';
  }
  function videoRowHTML(data) {
    data = data || {};
    return '<div class="row">' +
      '<div class="row-thumb is-empty" aria-hidden="true">' +
        '<div class="tile" style="position:static;background:none"><span style="font-size:20px">影</span></div>' +
      '</div>' +
      '<div class="row-main">' +
        '<input class="inp v-src" placeholder="B站 / YouTube 链接，或 mp4 直链" value="' + esc(data.src || '') + '">' +
        '<input class="inp v-cap" placeholder="视频说明（可选）" value="' + esc(data.caption || '') + '">' +
      '</div>' +
      '<div class="row-side">' +
        '<label class="mini-btn">选文件<input type="file" accept="video/*" class="video-file" hidden></label>' +
        '<button class="mini-btn danger row-del" type="button">删除</button>' +
      '</div>' +
    '</div>';
  }
  function linkRowHTML(data) {
    data = data || {};
    return '<div class="row">' +
      '<div class="row-thumb is-empty" aria-hidden="true">' +
        '<div class="tile" style="position:static;background:none"><span style="font-size:20px">链</span></div>' +
      '</div>' +
      '<div class="row-main">' +
        '<input class="inp l-title" placeholder="链接名称" value="' + esc(data.title || '') + '">' +
        '<input class="inp l-url" placeholder="https://…" value="' + esc(data.url || '') + '">' +
        '<input class="inp l-note" placeholder="备注（可选）" value="' + esc(data.note || '') + '">' +
      '</div>' +
      '<div class="row-side"><button class="mini-btn danger row-del" type="button">删除</button></div>' +
    '</div>';
  }

  function fillRows(sel, list, tpl) {
    var host = $(sel);
    host.innerHTML = '';
    if (list && list.length) {
      list.forEach(function (d) { host.insertAdjacentHTML('beforeend', tpl(d)); });
    } else {
      host.insertAdjacentHTML('beforeend', tpl({}));
    }
  }
  function addRow(sel, html) { $(sel).insertAdjacentHTML('beforeend', html); }

  function collectRows(sel, mapFn) {
    return $$(sel + ' .row').map(mapFn);
  }

  function syncTypeSections(type, withRows) {
    var showImages = (type === 'note' || type === 'image' || type === 'book');
    var showVideos = (type === 'video');
    var showLinks = (type === 'note' || type === 'link' || type === 'book');
    $('#secBook').hidden = (type !== 'book');
    $('#secImages').hidden = !showImages;
    $('#secVideos').hidden = !showVideos;
    $('#secLinks').hidden = !showLinks;
    if (withRows) {
      if (showImages && !$$('#imageRows .row').length) addRow('#imageRows', imageRowHTML({}));
      if (showVideos && !$$('#videoRows .row').length) addRow('#videoRows', videoRowHTML({}));
      if (showLinks && !$$('#linkRows .row').length) addRow('#linkRows', linkRowHTML({}));
    }
    $('#titleLabel').innerHTML = '标题 <span class="req">*</span>';
    $('#fTitle').placeholder = (type === 'book')
      ? '这条笔记的标题，比如：关于「仪式」的三点疑问'
      : '比如：一座村庙的岁末祭仪';
    $('#bodyLabel').textContent = (type === 'book') ? '我的想法 / 笔记' : ((type === 'note') ? '正文' : '说明 / 备注');
    $('#bodyHint').textContent = (type === 'book')
      ? '空一行分段；写判断、疑问，或可以和别的材料对照的地方。'
      : ((type === 'note') ? '空一行分段；可以写田野笔记、释读、引用。' : '可选，写点背景或说明。');
  }

  function openEditor(id) {
    editingId = id || null;
    var it = null;
    if (id) it = items.filter(function (x) { return x.id === id; })[0];
    $('#editorTitle').textContent = it ? '编辑这件收藏' : '放进口袋';
    $('#fTitle').value = it ? it.title : '';
    $('#fType').value = it ? it.type : 'note';
    $('#fCategory').value = it ? (it.category || CATEGORIES[0]) : CATEGORIES[0];
    $('#fDate').value = (it && it.date) || todayStr();
    $('#fSummary').value = it ? (it.summary || '') : '';
    $('#fQuote').value = it ? (it.quote || '') : '';
    $('#fBody').value = it ? (it.body || '') : '';
    var bk = (it && it.book) || {};
    $('#fBookTitle').value = bk.title || '';
    $('#fBookAuthor').value = bk.author || '';
    $('#fBookEdition').value = bk.edition || '';
    $('#fBookLocator').value = bk.locator || '';
    $('#fBookStatus').value = bk.status || '在读';
    $('#fTags').value = (it && it.tags && it.tags.length) ? it.tags.join('，') : '';
    fillRows('#imageRows', it ? it.images : null, imageRowHTML);
    fillRows('#videoRows', it ? it.videos : null, videoRowHTML);
    fillRows('#linkRows', it ? it.links : null, linkRowHTML);
    syncTypeSections($('#fType').value, true);
    openModal('editorModal');
    setTimeout(function () { $('#fTitle').focus(); }, 60);
  }

  function saveEntry(e) {
    e.preventDefault();
    var type = $('#fType').value;
    var title = $('#fTitle').value.trim();
    if (!title) { toast('先写个标题吧'); $('#fTitle').focus(); return; }

    var images = collectRows('#imageRows', function (r) {
      return { src: $('.img-src', r).value.trim(), caption: $('.img-cap', r).value.trim() };
    }).filter(function (x) { return x.src; });

    var videos = collectRows('#videoRows', function (r) {
      return { src: $('.v-src', r).value.trim(), caption: $('.v-cap', r).value.trim() };
    }).filter(function (x) { return x.src; }).map(function (v) {
      var info = classifyVideo(v.src);
      return { src: info.src, kind: info.kind, caption: v.caption };
    });

    var links = collectRows('#linkRows', function (r) {
      return { title: $('.l-title', r).value.trim(), url: $('.l-url', r).value.trim(), note: $('.l-note', r).value.trim() };
    }).filter(function (x) { return x.url; });

    if (type === 'image' && !images.length) { toast('图片类型至少需要一张图片'); return; }
    if (type === 'video' && !videos.length) { toast('视频类型至少需要一个视频地址'); return; }
    if (type === 'link' && !links.length) { toast('链接类型至少需要一个链接'); return; }
    if (type === 'book' && !$('#fBookTitle').value.trim()) {
      toast('读书笔记记得写书名'); $('#fBookTitle').focus(); return;
    }

    var data = {
      type: type,
      title: title,
      category: $('#fCategory').value,
      date: $('#fDate').value || todayStr(),
      summary: $('#fSummary').value.trim(),
      quote: $('#fQuote').value.trim(),
      body: $('#fBody').value.trim(),
      book: (type === 'book') ? {
        title: $('#fBookTitle').value.trim(),
        author: $('#fBookAuthor').value.trim(),
        edition: $('#fBookEdition').value.trim(),
        locator: $('#fBookLocator').value.trim(),
        status: $('#fBookStatus').value
      } : {},
      tags: $('#fTags').value.split(/[,，、\s]+/).map(function (s) { return s.trim().replace(/^#/, ''); }).filter(Boolean),
      images: images,
      videos: videos,
      links: links,
      updatedAt: new Date().toISOString()
    };

    var isEdit = !!editingId;
    if (ONLINE) {
      var q = isEdit
        ? sb.from('entries').update(itemToRow(data)).eq('id', editingId)
        : sb.from('entries').insert(itemToRow(data));
      q.then(checkErr).then(function () {
        editingId = null;
        closeModal('editorModal');
        toast(isEdit ? '已更新，别人刷新就能看到' : '已发到线上');
        return refreshOnline().then(evaluateAchievements);
      }).catch(function (err) {
        toast('保存失败：' + err.message);
      });
      return;
    }
    if (isEdit) {
      items = items.map(function (x) {
        if (x.id !== editingId) return x;
        return Object.assign({}, x, data);
      });
    } else {
      data.id = uid();
      data.createdAt = new Date().toISOString();
      items.unshift(data);
    }

    writeStore(items);
    render();
    editingId = null;
    closeModal('editorModal');
    toast(isEdit ? '已更新' : '已放进口袋');
      evaluateAchievements();
  }

  /* ---------- 文件读取 ---------- */
  function readAsDataURL(file, cb) {
    var fr = new FileReader();
    fr.onload = function () { cb(fr.result); };
    fr.readAsDataURL(file);
  }

  /* 线上模式：图片传到 Supabase 的 images 桶，网页里只存网址 */
  function uploadImage(file) {
    var ext = (String(file.name || '').split('.').pop() || 'jpg').toLowerCase();
    if (!/^(jpg|jpeg|png|gif|webp|avif|svg)$/.test(ext)) ext = 'jpg';
    var name = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7) + '.' + ext;
    return sb.storage.from('images')
      .upload(name, file, { cacheControl: '31536000', upsert: false })
      .then(function (res) {
        if (res.error) throw res.error;
        return sb.storage.from('images').getPublicUrl(name).data.publicUrl;
      });
  }

  function handleFilePick(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var row = input.closest('.row');
    if (input.classList.contains('img-file')) {
      var apply = function (url) {
        var src = $('.img-src', row);
        src.value = url;
        var th = $('.row-thumb', row);
        th.src = url;
        th.classList.remove('is-empty');
      };
      if (ONLINE) {
        toast('正在上传图片…');
        uploadImage(file)
          .then(function (url) { apply(url); toast('图片已上传'); })
          .catch(function (err) { toast('上传失败：' + err.message); });
      } else {
        if (file.size > 1.5 * 1024 * 1024) toast('图片偏大，本地存储可能吃紧，也可以改用图片链接。');
        readAsDataURL(file, apply);
      }
    } else if (input.classList.contains('video-file')) {
      if (file.size > 4 * 1024 * 1024) { toast('视频文件建议小于 4MB，更长请用外链。'); input.value = ''; return; }
      readAsDataURL(file, function (url) { $('.v-src', row).value = url; });
    }
    input.value = '';
  }

  /* ---------- 导入导出 ---------- */
  function downloadFile(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportBackup() {
    downloadFile('douhua-pocket-' + todayStr() + '.json', JSON.stringify(items, null, 2));
    toast('已导出备份文件');
    bumpStat('exports');
    evaluateAchievements();
  }

  function exportPublish() {
    downloadFile('content.js',
      '/* 豆花的口袋 —— 对外展示的内容\n' +
      '   在页面里编辑好之后点「导出 content.js」，覆盖网站文件夹里的同名文件即可。 */\n' +
      'window.DH_CONTENT = ' + JSON.stringify(items, null, 2) + ';\n',
      'application/javascript');
    toast('已生成 content.js，覆盖文件夹里的同名文件即可');
  }

  function importJSON(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var data = JSON.parse(fr.result);
        var arr = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
        if (!arr) throw new Error('bad');
        askConfirm('导入会覆盖当前口袋里的 ' + items.length + ' 件内容，继续吗？', '覆盖导入').then(function (ok) {
          if (!ok) return;
          if (ONLINE) {
            var rows = arr.map(function (x) { return itemToRow(x); });
            sb.from('entries').insert(rows).then(checkErr).then(function () {
              toast('已导入 ' + rows.length + ' 条到线上');
              return refreshOnline();
            }).catch(function (err) { toast('导入失败：' + err.message); });
            return;
          }
          items = arr.map(function (x) {
            return Object.assign({ createdAt: new Date().toISOString() }, x, { id: x && x.id ? x.id : uid() });
          });
          writeStore(items);
          render();
          toast('导入完成，共 ' + items.length + ' 件');
        });
      } catch (err) {
        toast('导入失败：这不是有效的备份文件');
      }
    };
    fr.readAsText(file);
  }

  /* ---------- 事件 ---------- */
  function bindEvents() {
    $('#searchInput').addEventListener('input', function () {
      filter.q = this.value;
      render();
    });
    $('#typeFilter').addEventListener('change', function () {
      filter.type = this.value;
      render();
    });
    $('#chips').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      filter.category = chip.dataset.cat;
      render();
    });
    $('#grid').addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) openDetail(card.dataset.id);
    });
    $('#grid').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.card');
      if (!card) return;
      e.preventDefault();
      openDetail(card.dataset.id);
    });

    ['#addBtn', '#heroAdd', '#emptyAdd'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.addEventListener('click', function () { openEditor(null); });
    });
    $('#heroBrowse').addEventListener('click', function () {
      $('.list-head').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#brandLink').addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    document.addEventListener('click', function (e) {
      var closer = e.target.closest('[data-close]');
      if (closer) { closeModal(closer.getAttribute('data-close')); return; }

      // 待办 / 书目的勾选、删除、编辑
      var tcheck = e.target.closest('.task-check');
      if (tcheck) {
        var taskRow = tcheck.closest('.task');
        if (taskRow) toggleTask(taskRow.getAttribute('data-id'));
        return;
      }
      var tdel = e.target.closest('.task-del');
      if (tdel) {
        var taskRow2 = tdel.closest('.task');
        if (taskRow2) deleteTaskById(taskRow2.getAttribute('data-id'));
        return;
      }
      var tmain = e.target.closest('.task-main');
      if (tmain) {
        var row3 = tmain.closest('.task');
        var theTask = row3 ? tasks.filter(function (x) { return x.id === row3.getAttribute('data-id'); })[0] : null;
        if (theTask) openTaskModal(theTask.kind, theTask);
        return;
      }

      var del = e.target.closest('.row-del');
      if (del) {
        var row = del.closest('.row');
        if (row) row.remove();
      }
    });
    $$('.modal').forEach(function (m) {
      m.addEventListener('mousedown', function (e) {
        if (e.target === m) closeModal(m.id);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeTopModal();
    });

    $('#fType').addEventListener('change', function () {
      syncTypeSections(this.value, true);
    });
    $('#addImageBtn').addEventListener('click', function () { addRow('#imageRows', imageRowHTML({})); });
    $('#addVideoBtn').addEventListener('click', function () { addRow('#videoRows', videoRowHTML({})); });
    $('#addLinkBtn').addEventListener('click', function () { addRow('#linkRows', linkRowHTML({})); });
    $('#entryForm').addEventListener('submit', saveEntry);

    // 视图切换
    $('#tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (b) setView(b.getAttribute('data-view'));
    });
    // 待办 / 书目
    $('#addBookBtn').addEventListener('click', function () { openTaskModal('book'); });
    $('#addTodoBtn').addEventListener('click', function () { openTaskModal('todo'); });
    $('#taskForm').addEventListener('submit', submitTaskForm);
    // 日历
    $('#calPrev').addEventListener('click', function () {
      calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); renderCalendar();
    });
    $('#calNext').addEventListener('click', function () {
      calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); renderCalendar();
    });
    $('#calToday').addEventListener('click', function () {
      calCursor = new Date(); calSelected = ymd(new Date()); renderCalendar();
    });
    $('#calGrid').addEventListener('click', function (e) {
      var cell = e.target.closest('.cal-cell');
      if (!cell) return;
      calSelected = cell.getAttribute('data-date');
      renderCalendar();
    });

    document.addEventListener('change', function (e) {
      if (e.target.classList && (e.target.classList.contains('img-file') || e.target.classList.contains('video-file'))) {
        handleFilePick(e.target);
      }
    });

    // 图片挂了就退回分类底纹，不留破图
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.classList || !img.classList.contains('thumb')) return;
      var box = img.parentNode;
      if (!box || !box.classList || !box.classList.contains('card-media')) return;
      box.insertAdjacentHTML('beforeend', tileHTML(box.getAttribute('data-cat') || ''));
      img.remove();
    }, true);

    $('#exportBtn').addEventListener('click', exportBackup);
    $('#authBtn').addEventListener('click', function () {
      if (!ONLINE) return;
      if (session) {
        askConfirm('退出后这个页面就变成只读的，你自己也要重新登录才能改。确定退出吗？', '退出').then(function (ok) {
          if (!ok) return;
          sb.auth.signOut().then(function () { toast('已退出登录'); });
        });
      } else {
        openModal('loginModal');
      }
    });
    $('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ONLINE) return;
      var email = $('#loginEmail').value.trim();
      var pass = $('#loginPass').value;
      if (!email || !pass) { toast('邮箱和密码都填一下'); return; }
      var btn = $('#loginSubmit');
      btn.disabled = true;
      btn.textContent = '登录中…';
      sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
        btn.disabled = false;
        btn.textContent = '登录';
        if (res.error) { toast('登录失败：' + res.error.message); return; }
        $('#loginPass').value = '';
        closeModal('loginModal');
        toast('登录成功，现在可以直接改了');
      }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '登录';
        toast('登录失败：' + err.message);
      });
    });
    $('#publishBtn').addEventListener('click', exportPublish);
    $('#importBtn').addEventListener('click', function () { $('#importFile').click(); });
    $('#importFile').addEventListener('change', function () {
      if (this.files && this.files[0]) importJSON(this.files[0]);
      this.value = '';
    });
    $('#resetBtn').addEventListener('click', function () {
      askConfirm('会清空这台电脑上的本地草稿，重新读取 content.js（读不到就回到内置示例）。没有导出备份的改动会丢失，确定吗？', '重新载入').then(function (ok) {
        if (!ok) return;
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        location.reload();
      });
    });

    $('#confirmOk').addEventListener('click', function () {
      if (!confirmResolve) return;
      var resolve = confirmResolve;
      confirmResolve = null;
      hideModal('confirmModal');
      resolve(true);
    });
    $('#confirmCancel').addEventListener('click', function () { closeModal('confirmModal'); });
  }

  /* ---------- 启动 ---------- */
  function init() {
    buildAstrolabe();
    buildChips();
    buildCategoryOptions();
    bindEvents();          // 先把交互接上，页面不会白着
    render();
    loadContent().then(function (res) {
      items = res.items;
      contentSource = res.source;
      loading = false;
      render();
      initAuth();
      subscribeRealtime();
      loadTasks().then(function () {
        renderTodos();
        return loadAchievements();
      }).then(function () {
        evaluateAchievements();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
