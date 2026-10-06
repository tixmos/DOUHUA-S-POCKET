/* 豆花的口袋 —— 前端逻辑（纯静态，数据存本机浏览器 localStorage） */
(function () {
  'use strict';

  var STORE_KEY = 'douhua-pocket-v1';
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

  /* ---------- 状态 ---------- */
  var items = [];
  var filter = { q: '', category: 'all', type: 'all' };
  var editingId = null;
  var confirmResolve = null;
  var contentSource = 'seed';   // seed | published | local
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
      if (bk.author) bits.push(esc(bk.author));
      if (bk.locator) bits.push(esc(bk.locator));
      if (bk.status) bits.push(esc(bk.status));
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
    $('#empty').hidden = list.length > 0;
    $('#heroCount').textContent = items.length;
    $('#resultLine').textContent = items.length
      ? '显示 ' + list.length + ' / 共 ' + items.length + ' 件'
      : '';
    $$('#chips .chip').forEach(function (c) {
      c.classList.toggle('is-active', c.dataset.cat === filter.category);
    });
    $('#typeFilter').value = filter.type;
    renderSourceNote();
  }

  function renderSourceNote() {
    var note = $('#sourceNote');
    if (!note) return;
    var n = items.length;
    if (!storageOK) {
      note.innerHTML = '注意：这个浏览器不允许本地保存，改动可能留不住 · 建议用本地服务打开，或随时「导出备份」';
      return;
    }
    if (contentSource === 'local') {
      note.innerHTML = '当前显示 <b>本地草稿</b>（' + n + ' 件）· 只在你这台电脑上，导出 content.js 上传后别人才看得到';
    } else if (contentSource === 'published') {
      note.innerHTML = '当前显示 <b>content.js</b> 里的内容（' + n + ' 件）';
    } else {
      note.innerHTML = '当前显示 <b>内置示例</b> · 还没有 content.js';
    }
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
        '<button class="c-del" type="button" title="删除这条评论" aria-label="删除这条评论">×</button>' +
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
    html += '<div class="detail-head">' +
      '<div class="card-meta">' + catTagHTML(it.category) +
      '<span class="tag">' + esc(meta.label) + '</span><time>' + esc(fmtDate(it.date)) + '</time>' +
      (it.type === 'book' && bk.status ? '<span class="status-chip' + statusClass(bk.status) + '">' + esc(bk.status) + '</span>' : '') +
      '</div>' +
      '<h2>' + esc(it.title) + '</h2>';
    if (it.type === 'book') {
      var bits = [];
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
      '<button class="btn btn-ghost" type="button" id="editEntryBtn">编辑</button>' +
      '<button class="btn btn-danger" type="button" id="deleteEntryBtn">删除</button>' +
      '<button class="btn btn-ghost" type="button" data-close="detailModal">关闭</button>' +
      '</div>';
    $('#detailContent').innerHTML = html;
    openModal('detailModal');
    $('#editEntryBtn').onclick = function () { closeModal('detailModal'); openEditor(it.id); };
    $('#deleteEntryBtn').onclick = function () { deleteEntry(it.id); };
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
      entry.comments = entry.comments || [];
      entry.comments.push(c);
      entry.updatedAt = c.date;
      writeStore(items);
      var emptyEl = $('.c-empty', $('#detailModal'));
      if (emptyEl) emptyEl.remove();
      $('#commentList').insertAdjacentHTML('beforeend', commentHTML(c));
      $('#commentCount').textContent = entry.comments.length;
      $('#cText').value = '';
      render();
      toast('已发表');
    });

    $('#commentList').addEventListener('click', function (e) {
      var btn = e.target.closest('.c-del');
      if (!btn) return;
      var wrap = btn.closest('.comment');
      if (!wrap) return;
      var cid = wrap.getAttribute('data-cid');
      askConfirm('删除这条评论？', '删除', true).then(function (ok) {
        if (!ok) return;
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
    $('#titleLabel').innerHTML = (type === 'book')
      ? '书名 / 标题 <span class="req">*</span>'
      : '标题 <span class="req">*</span>';
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

    var data = {
      type: type,
      title: title,
      category: $('#fCategory').value,
      date: $('#fDate').value || todayStr(),
      summary: $('#fSummary').value.trim(),
      quote: $('#fQuote').value.trim(),
      body: $('#fBody').value.trim(),
      book: (type === 'book') ? {
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
  }

  /* ---------- 文件读取 ---------- */
  function readAsDataURL(file, cb) {
    var fr = new FileReader();
    fr.onload = function () { cb(fr.result); };
    fr.readAsDataURL(file);
  }

  function handleFilePick(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    var row = input.closest('.row');
    if (input.classList.contains('img-file')) {
      if (file.size > 1.5 * 1024 * 1024) toast('图片偏大，本地存储可能吃紧，也可以改用图片链接。');
      readAsDataURL(file, function (url) {
        var src = $('.img-src', row);
        src.value = url;
        var th = $('.row-thumb', row);
        th.src = url;
        th.classList.remove('is-empty');
      });
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
      // 新条目选「读书笔记」时，顺手把分类也切过去（还可以再改）
      if (this.value === 'book' && !editingId && $('#fCategory').value === CATEGORIES[0]) {
        $('#fCategory').value = '读书笔记';
      }
      syncTypeSections(this.value, true);
    });
    $('#addImageBtn').addEventListener('click', function () { addRow('#imageRows', imageRowHTML({})); });
    $('#addVideoBtn').addEventListener('click', function () { addRow('#videoRows', videoRowHTML({})); });
    $('#addLinkBtn').addEventListener('click', function () { addRow('#linkRows', linkRowHTML({})); });
    $('#entryForm').addEventListener('submit', saveEntry);
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
    buildChips();
    buildCategoryOptions();
    loadContent().then(function (res) {
      items = res.items;
      contentSource = res.source;
      bindEvents();
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
