// Forum Reader clean view.
// Injected into every page. Always hides common ad slots; when clean view is
// on and the page is a recognised thread or topic list, it lays the posts out
// as one readable column and hides the original page (kept in the DOM so
// toggling back is instant and forms still work).
(() => {
  if (window.__fr) return;

  const $ = (s, r = document) => { try { return r.querySelector(s); } catch (e) { return null; } };
  const $$ = (s, r = document) => { try { return Array.from(r.querySelectorAll(s)); } catch (e) { return []; } };
  const text = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const firstText = (root, sels) => { for (const s of sels) { const t = text($(s, root)); if (t) return t; } return ''; };
  const firstEl = (root, sels) => { for (const s of sels) { const e = $(s, root); if (e) return e; } return null; };
  // Dates: prefer a <time datetime> (sites often render it twice, long and short).
  const fmtDate = el => {
    const t = el && (el.matches && el.matches('time') ? el : $('time[datetime]', el));
    const dt = t && t.getAttribute('datetime');
    if (dt) { const d = new Date(dt); if (!isNaN(d)) return d.toLocaleString([], { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', hour: 'numeric', minute: '2-digit' }); }
    return text(el);
  };
  const dateOf = (root, sels) => { for (const s of sels) { const e = $(s, root); if (e && fmtDate(e)) return fmtDate(e); } return ''; };
  const replies = t => { const m = (t || '').match(/(\d[\d.,]*\s*[kKmM]?)/); return m ? m[1].trim() + ' replies' : ''; };
  const post = msg => { try { window.webkit.messageHandlers.fr.postMessage(msg); } catch (e) {} };

  // ---- Ad cleanup that applies to every page, clean view or not ----------
  const AD_CSS = `
    ins.adsbygoogle, .adsbygoogle, [id^="google_ads"], [id^="div-gpt-ad"],
    [id^="AdThrive_"], .adthrive-ad, .adthrive-footer-message,
    [data-ad-slot], [data-google-query-id], .ad-slot, .ad-container,
    .advertisement, .advert, .sponsored-content, .taboola, [id^="taboola"],
    .OUTBRAIN, [id^="outbrain"], .content-ad, .content_ad,
    .samBannerUnit, .samCodeUnit, .samUnitWrapper,
    .ipsAdvertisement, [data-role="advertisement"]
    { display: none !important; }
    img, video, iframe { max-width: 100% !important; }
    img { height: auto !important; }
  `;

  // ---- Platform adapters -------------------------------------------------
  // thread() -> [{author, date, body}] ; list() -> [{title, href, meta}]
  const adapters = [
    {
      name: 'jforum',
      test: () => !!$('.postrow, .topic-list') || /\/jforum\//.test(location.pathname),
      thread: () => $$('.postrow').map(r => {
        let info = r.previousElementSibling;
        while (info && !info.classList.contains('postinfo')) info = info.previousElementSibling;
        return {
          author: firstText(r, ['.postShowUserDiv b', '.postShowUserDiv']),
          date: info ? firstText(info, ['.date a[name]', '.date']) : '',
          body: firstEl(r, ['[id^="post_text_"] .postbody td', '[id^="post_text_"]'])
        };
      }),
      list: () => $$('.topic-list').map(r => {
        const a = $('.subject-line a, .topictitle a', r);
        if (!a) return null;
        const forum = text($('.forum-name a', r));
        const last = text($('.last-message', r)).replace(/\[Latest Reply\]/, '').trim();
        const ans = text($('.answers', r));
        const m = ans.match(/Replies:?\s*(\d[\d,]*)/i) || ans.match(/^(\d[\d,]*)$/);
        return {
          title: text(a), href: a.href,
          meta: [forum, m ? m[1] + ' replies' : '', last ? 'last: ' + last : '']
            .filter(Boolean).join(' · ')
        };
      })
    },
    {
      name: 'xenforo',
      test: () => document.documentElement.id === 'XF' || !!$('.p-body-inner, article.message--post'),
      thread: () => $$('article.message--post, article.message').map(a => ({
        author: firstText(a, ['.message-name', '.message-userDetails .username', '.username']),
        date: dateOf(a, ['.message-attribution time', 'time.u-dt', 'time']),
        body: firstEl(a, ['.message-body .bbWrapper', '.message-body', '.message-content'])
      })),
      list: () => $$('.structItem--thread').map(r => {
        const a = $$('.structItem-title a[href*="threads/"], .structItem-title a', r).pop();
        if (!a) return null;
        const last = dateOf(r, ['.structItem-latestDate']);
        return {
          title: text(a), href: a.href,
          meta: [firstText(r, ['.structItem-minor .username', '.username']),
                 replies(firstText(r, ['.structItem-cell--meta dd'])),
                 last ? 'last: ' + last : '']
            .filter(Boolean).join(' · ')
        };
      })
    },
    {
      name: 'invision',
      test: () => !!$('body[data-pageapp], [data-role="commentContent"], .ipsApp, #ipsLayout_body'),
      thread: () => $$('article[id^="elComment_"], article.cPost, article.ipsComment, article.ipsEntry').map(a => ({
        author: firstText(a, ['.cAuthorPane_author', '[data-role="authorName"]', '.ipsEntry__author-name', '.ipsUsername', 'a[href*="/profile/"]']),
        date: dateOf(a, ['time']),
        body: firstEl(a, ['[data-role="commentContent"]', '.ipsRichText', '.ipsType_richText', '.cPost_contentWrap'])
      })),
      list: () => $$('li[data-rowid], .ipsDataItem, .ipsData__item').map(r => {
        const a = firstEl(r, ['.ipsDataItem_title a[href*="/topic/"]', '.ipsData__title a', 'h4 a[href*="/topic/"]', 'a[href*="/topic/"]']);
        if (!a || !text(a)) return null;
        return {
          title: text(a), href: a.href,
          meta: [replies(firstText(r, ['[data-stattype="forums_comments"] .ipsData__stats-label', '.ipsDataItem_stats_number', '[data-stattype="forums_comments"]'])),
                 dateOf(r, ['.ipsDataItem_lastPoster time', '.ipsData__last time', 'time'])]
            .filter(Boolean).join(' · ')
        };
      })
    },
    {
      name: 'phpbb',
      test: () => document.body && (document.body.id === 'phpbb' || !!$('.postbody .content, ul.topiclist')),
      thread: () => $$('div.post').map(p => ({
        author: firstText(p, ['.author .username', '.author .username-coloured', '.postprofile .username', '.postprofile .username-coloured']),
        date: dateOf(p, ['.author time']) || firstText(p, ['p.author']).replace(/^.*»\s*/, ''),
        body: firstEl(p, ['.postbody .content', '.content'])
      })),
      list: () => $$('ul.topiclist.topics li.row, ul.topiclist li.row').map(r => {
        const a = $('a.topictitle', r);
        if (!a) return null;
        return { title: text(a), href: a.href, meta: [replies(firstText(r, ['dd.posts'])), dateOf(r, ['dd.lastpost time']) || firstText(r, ['dd.lastpost'])].filter(Boolean).join(' · ') };
      })
    },
    {
      name: 'vbulletin',
      test: () => !!$('#posts .postcontainer, .b-post, li.threadbit, #threads'),
      thread: () => $$('li.postcontainer, .postbitlegacy, .b-post').map(p => ({
        author: firstText(p, ['.username', '.b-post__author a', '.author a']),
        date: dateOf(p, ['time']) || firstText(p, ['.postdate .date', '.date']),
        body: firstEl(p, ['.postcontent', '.js-post__content-text', '.post-content'])
      })),
      list: () => $$('li.threadbit, .topic-list-item, tr.topic-item').map(r => {
        const a = firstEl(r, ['a.title', 'a.topic-title', 'h3 a']);
        if (!a) return null;
        return { title: text(a), href: a.href, meta: firstText(r, ['.threadlastpost', '.lastpost']) };
      })
    },
    {
      name: 'smf',
      test: () => !!$('#forumposts, #messageindex'),
      thread: () => $$('#forumposts .post_wrapper').map(p => ({
        author: firstText(p, ['.poster h4 a', '.poster h4']),
        date: firstText(p, ['.keyinfo .smalltext', '.postinfo .smalltext']).replace(/^.*?on:\s*/i, ''),
        body: firstEl(p, ['.inner', '.post'])
      })),
      list: () => $$('#messageindex .subject, #messageindex td.subject').map(r => {
        const a = $('a', r);
        return a ? { title: text(a), href: a.href, meta: '' } : null;
      })
    }
  ];

  // ---- Pagination --------------------------------------------------------
  function pagination() {
    const pathSig = u => { try { return new URL(u, location.href).pathname.replace(/\d+/g, '#'); } catch (e) { return ''; } };
    const here = pathSig(location.href);
    const navLike = a => !!a.closest('[class*="pag" i], [class*="pageNav"], nav, .pages');
    const byNum = new Map();
    for (const a of $$('a[href]')) {
      const t = text(a);
      if (!/^\d{1,5}$/.test(t)) continue;
      if (!navLike(a) && pathSig(a.href) !== here) continue;
      const n = parseInt(t, 10);
      if (!byNum.has(n)) byNum.set(n, a.href);
    }
    // The highlighted page number: the first marker whose text is a number
    // (site menus also use aria-current, so skip non-numeric matches).
    const currentEl = $$('[aria-current="page"], .pageNav-page--current, .ipsPagination_active, .pagination .active, ' +
      '.pagination strong, span.current, .pages .current, span.selected').find(e => /^\d+$/.test(text(e)));
    let current = currentEl ? parseInt(text(currentEl), 10) : null;
    const nums = [...byNum.keys()].sort((a, b) => a - b);
    if (!nums.length) return null;
    const max = Math.max(...nums, current || 0);
    if (!current) {
      // The current page is usually the one number that isn't a link.
      for (let i = 1; i <= max; i++) if (!byNum.has(i)) { current = i; break; }
      if (!current) current = max + 1; // every number up to max is a link: we're past them, on the last page
    }
    const last = Math.max(max, current);
    const link = n => byNum.get(n) || null;
    const relNext = firstEl(document, ['a[rel="next"]', '.pageNav-jump--next', '.ipsPagination_next a', 'li.next a']);
    const relPrev = firstEl(document, ['a[rel="prev"]', '.pageNav-jump--prev', '.ipsPagination_prev a', 'li.previous a']);
    return {
      current, last,
      first: current > 1 ? link(1) : null,
      prev: current > 1 ? (link(current - 1) || (relPrev && relPrev.href)) : null,
      next: current < last ? (link(current + 1) || (relNext && relNext.href)) : null,
      lastHref: current < last ? link(last) : null
    };
  }

  // ---- Cleaning post bodies ---------------------------------------------
  function cleanBody(el) {
    const c = el.cloneNode(true);
    $$('script, style, noscript, ins, form, button, [id^="div-gpt-ad"], [id^="AdThrive_"], .adsbygoogle', c).forEach(n => n.remove());
    $$('[style]', c).forEach(n => { if (!/^(BLOCKQUOTE|SPAN|DIV)$/.test(n.tagName)) n.removeAttribute('style'); });
    $$('img', c).forEach(img => {
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-url') || img.getAttribute('data-original');
      if (lazy && (!img.getAttribute('src') || /^data:|blank|transp|lazy/i.test(img.getAttribute('src')))) img.setAttribute('src', lazy);
      img.removeAttribute('width'); img.removeAttribute('height'); img.removeAttribute('srcset');
      img.setAttribute('loading', 'lazy');
    });
    $$('iframe', c).forEach(f => { f.removeAttribute('width'); f.removeAttribute('height'); });
    $$('a[href]', c).forEach(a => a.removeAttribute('target'));
    // DCUM wraps quote attribution in <cite>; keep it but make it a heading.
    return c;
  }

  // ---- Building the clean view ------------------------------------------
  const READER_CSS = `
    html.fr-on body > *:not(#fr-reader) { display: none !important; }
    html.fr-on body { padding: 0 !important; margin: 0 !important; background: var(--fr-bg) !important; }
    html.fr-on { background: var(--fr-bg) !important; }
    #fr-reader { display: none; }
    html.fr-on #fr-reader { display: block !important; }
    #fr-reader {
      --fr-bg: #f7f5f0; --fr-card: #ffffff; --fr-text: #1d1d1f; --fr-muted: #6e6e73;
      --fr-line: #e3e0d8; --fr-accent: #0a66c2; --fr-quote: #f1efe9;
      font: 17px/1.5 -apple-system, system-ui, sans-serif; color: var(--fr-text);
      background: var(--fr-bg); padding: 12px 12px 40px; max-width: 760px; margin: 0 auto;
      -webkit-text-size-adjust: 100%; overflow-wrap: anywhere;
    }
    @media (prefers-color-scheme: dark) {
      #fr-reader, html.fr-on body, html.fr-on { --fr-bg: #121214; --fr-card: #1c1c1f; --fr-text: #ececf0;
        --fr-muted: #9a9aa2; --fr-line: #2c2c31; --fr-accent: #5aa9ff; --fr-quote: #26262b; }
    }
    #fr-reader h1 { font-size: 1.25em; line-height: 1.3; margin: 4px 4px 12px; }
    #fr-reader .fr-post, #fr-reader .fr-item { background: var(--fr-card); border: 1px solid var(--fr-line);
      border-radius: 12px; padding: 12px 14px; margin: 0 0 10px; }
    #fr-reader .fr-head { font-size: .82em; color: var(--fr-muted); margin-bottom: 6px; display: flex; gap: 8px; }
    #fr-reader .fr-head b { color: var(--fr-text); font-weight: 600; }
    #fr-reader .fr-num { margin-left: auto; }
    #fr-reader .fr-body table, #fr-reader .fr-body tbody, #fr-reader .fr-body tr, #fr-reader .fr-body td { display: block; width: auto !important; padding: 0; }
    #fr-reader .fr-body blockquote, #fr-reader .fr-body [class*="quote" i]:not(cite) {
      background: var(--fr-quote); border-left: 3px solid var(--fr-line); margin: 6px 0; padding: 6px 10px;
      border-radius: 6px; font-size: .94em; color: var(--fr-text) !important; }
    #fr-reader .fr-body blockquote blockquote { margin-left: 0; }
    #fr-reader .fr-body blockquote + br, #fr-reader .fr-body blockquote + br + br { display: none; }
    #fr-reader .fr-body input[type="button"] { font: inherit; font-size: .78em; padding: 3px 9px; border-radius: 7px;
      border: 1px solid var(--fr-line); background: var(--fr-quote); color: var(--fr-muted); -webkit-appearance: none; }
    #fr-reader .fr-body cite { display: block; font-style: normal; font-weight: 600; font-size: .85em; color: var(--fr-muted); margin-bottom: 2px; }
    #fr-reader .fr-body * { max-width: 100% !important; font-size: inherit; line-height: inherit; color: inherit; background-color: transparent; }
    #fr-reader .fr-body img { border-radius: 6px; }
    #fr-reader a { color: var(--fr-accent); }
    #fr-reader .fr-item a { display: block; font-weight: 600; text-decoration: none; color: var(--fr-text); }
    #fr-reader .fr-item .fr-meta { font-size: .8em; color: var(--fr-muted); margin-top: 3px; }
    #fr-reader .fr-pages { display: flex; gap: 6px; align-items: center; justify-content: center; margin: 8px 0 14px; flex-wrap: wrap; }
    #fr-reader .fr-pages a, #fr-reader .fr-pages span { padding: 7px 11px; border-radius: 9px; background: var(--fr-card);
      border: 1px solid var(--fr-line); text-decoration: none; font-size: .9em; }
    #fr-reader .fr-pages span.fr-off { opacity: .35; }
    #fr-reader .fr-pages .fr-cur { border: none; background: none; color: var(--fr-muted); }
    #fr-reader .fr-orig { display: block; text-align: center; font-size: .85em; margin-top: 18px; }
  `;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function pagesBar(p) {
    if (!p || p.last <= 1) return null;
    const bar = el('div', 'fr-pages');
    const btn = (label, href) => href ? `<a href="${esc(href)}">${label}</a>` : `<span class="fr-off">${label}</span>`;
    bar.innerHTML = btn('«', p.first) + btn('‹ Prev', p.prev) +
      `<span class="fr-cur">Page ${p.current} of ${p.last}</span>` + btn('Next ›', p.next) + btn('»', p.lastHref);
    return bar;
  }

  function pageTitle() {
    const h = firstText(document, ['h1.p-title-value', 'h1.ipsType_pageTitle', 'h1.ipsPageHeader__title', 'h2.topic-title a', 'h1']);
    return h || document.title;
  }

  function detect() {
    for (const a of adapters) {
      let ok = false;
      try { ok = a.test(); } catch (e) {}
      if (!ok) continue;
      let posts = [];
      try { posts = (a.thread() || []).filter(p => p && p.body && text(p.body).length + $$('img', p.body).length > 0); } catch (e) {}
      if (posts.length) return { adapter: a.name, kind: 'thread', posts };
      let items = [];
      try { items = (a.list() || []).filter(Boolean); } catch (e) {}
      if (items.length >= 3) return { adapter: a.name, kind: 'list', items };
    }
    return null;
  }

  function build() {
    const found = detect();
    if (!found) return null;
    const root = el('div');
    root.id = 'fr-reader';
    root.appendChild(el('h1', null, esc(pageTitle())));
    const pages = pagination();
    const top = pagesBar(pages);
    if (top) root.appendChild(top);
    if (found.kind === 'thread') {
      const numbered = !(pages && pages.current > 1);
      found.posts.forEach((p, i) => {
        const card = el('article', 'fr-post');
        card.appendChild(el('div', 'fr-head',
          `<b>${esc(p.author || 'Unknown')}</b><span>${esc(p.date || '')}</span>` + (numbered ? `<span class="fr-num">#${i + 1}</span>` : '')));
        const body = el('div', 'fr-body');
        body.appendChild(cleanBody(p.body));
        card.appendChild(body);
        root.appendChild(card);
      });
    } else {
      found.items.forEach(it => {
        const card = el('div', 'fr-item', `<a href="${esc(it.href)}">${esc(it.title)}</a>` + (it.meta ? `<div class="fr-meta">${esc(it.meta)}</div>` : ''));
        root.appendChild(card);
      });
    }
    const bottom = pagesBar(pages);
    if (bottom) root.appendChild(bottom);
    const orig = el('a', 'fr-orig', 'Show original page (to reply, log in or search)');
    orig.href = '#';
    orig.addEventListener('click', e => { e.preventDefault(); FR.setEnabled(false); post({ type: 'readerToggled', on: false }); });
    root.appendChild(orig);
    return { root, found };
  }

  function addStyle(id, css) {
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  const FR = window.__fr = {
    enabled: window.__FR_CLEAN !== false,
    result: null,
    setEnabled(on) {
      this.enabled = on;
      if (on && !this.result) this.run();
      document.documentElement.classList.toggle('fr-on', !!(on && this.result));
      if (on && this.result) window.scrollTo(0, 0);
    },
    run() {
      addStyle('fr-ad-css', AD_CSS);
      if (this.result) return;
      const r = build();
      if (r) {
        addStyle('fr-reader-css', READER_CSS);
        document.body.appendChild(r.root);
        this.result = r.found;
        document.documentElement.classList.toggle('fr-on', this.enabled);
      }
      post({ type: 'page', available: !!this.result, kind: this.result ? this.result.kind : null,
             adapter: this.result ? this.result.adapter : null, count: this.result ? (this.result.posts || this.result.items).length : 0 });
    }
  };

  const start = () => {
    FR.run();
    // Some sites finish rendering after load; try once more if nothing matched.
    if (!FR.result) setTimeout(() => FR.run(), 1500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
