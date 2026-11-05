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
  // "1,234" -> 1234, "2.6k" -> 2600; null when there's no number.
  const count = t => {
    const m = (t || '').replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([kKmM])?/);
    if (!m) return null;
    const n = parseFloat(m[1]) * (m[2] ? ({ k: 1e3, m: 1e6 })[m[2].toLowerCase()] : 1);
    return Math.round(n);
  };
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
  // thread() -> [{author, date, body}] ; list() -> [{title, href, meta, n (reply count), unread (site says so)}]
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
          body: firstEl(r, ['[id^="post_text_"] .postbody td', '[id^="post_text_"]']),
          quote: info ? $('a[href*="/posts/quote/"]', info) : null
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
          title: text(a), href: a.href, n: m ? count(m[1]) : null,
          unread: !!$('[class*="folder_new"], img[src*="_new"]', r),
          meta: [forum, m ? m[1] + ' replies' : '', last ? 'last: ' + last : '']
            .filter(Boolean).join(' · ')
        };
      })
    },
    {
      // groups.io email lists (also on custom domains like groups.jewishgen.org)
      name: 'groupsio',
      test: () => /^\/g\//.test(location.pathname) && !!$('.expanded-message, a.subject[href*="/topic/"]'),
      thread: () => $$('.expanded-message').map(m => {
        const when = $('.expanded-sender-meta span[title]', m);
        return {
          author: firstText(m, ['.user-chip-name', 'h3.visually-hidden']),
          date: when ? when.getAttribute('title') : '',
          body: $('.user-content', m),
          quote: null
        };
      }),
      list: () => $$('tr').map(r => {
        const a = $('a.subject[href*="/topic/"]', r);
        if (!a) return null;
        const msgs = count(text($('.subject .badge', r)));
        const times = $$('.thread-attribution span[title]', r);
        const last = times.length ? times[times.length - 1].getAttribute('title') : '';
        const by = text($('.thread-attribution', r)).replace(/^(Started by|By)\s*/i, '').split(/\s+@|\s+·/)[0].replace(/^Started by\s*/i, '').replace(/^By\s*/i, '');
        return {
          title: text(a), href: a.href, n: msgs != null ? msgs - 1 : null, unread: false,
          preview: text($('.truncate-one-line', r)),
          meta: [by, msgs != null ? msgs + (msgs === 1 ? ' message' : ' messages') : '', last ? 'last: ' + last : ''].filter(Boolean).join(' · ')
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
          n: count(firstText(r, ['.structItem-cell--meta dd'])), unread: r.classList.contains('is-unread'),
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
        const rc = firstText(r, ['[data-stattype="forums_comments"] .ipsData__stats-label', '.ipsDataItem_stats_number', '[data-stattype="forums_comments"]']);
        return {
          title: text(a), href: a.href, n: /topic\//.test(a.href) ? count(rc) : null,
          unread: r.matches('.ipsDataItem_unread, .ipsData__item--unread, [data-ips-unread]'),
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
        body: firstEl(p, ['.postbody .content', '.content']),
        quote: $('a[href*="mode=quote"]', p)
      })),
      list: () => $$('ul.topiclist.topics li.row, ul.topiclist li.row').map(r => {
        const a = $('a.topictitle', r);
        if (!a) return null;
        return { title: text(a), href: a.href, n: count(firstText(r, ['dd.posts'])), unread: !!$('dl[class*="unread"]', r) || /unread/.test(r.className),
          meta: [replies(firstText(r, ['dd.posts'])), dateOf(r, ['dd.lastpost time']) || firstText(r, ['dd.lastpost'])].filter(Boolean).join(' · ') };
      })
    },
    {
      name: 'vbulletin',
      test: () => !!$('#posts .postcontainer, .b-post, li.threadbit, #threads'),
      thread: () => $$('li.postcontainer, .postbitlegacy, .b-post').map(p => ({
        author: firstText(p, ['.username', '.b-post__author a', '.author a']),
        date: dateOf(p, ['time']) || firstText(p, ['.postdate .date', '.date']),
        body: firstEl(p, ['.postcontent', '.js-post__content-text', '.post-content']),
        quote: $('a[href*="newreply.php"][href*="p="]', p)
      })),
      list: () => $$('li.threadbit, .topic-list-item, tr.topic-item').map(r => {
        const a = firstEl(r, ['a.title', 'a.topic-title', 'h3 a']);
        if (!a) return null;
        return { title: text(a), href: a.href, n: count(firstText(r, ['.threadstats li', '.replies', '.posts-count'])),
          unread: /\b(new|unread)\b/.test(r.className), meta: firstText(r, ['.threadlastpost', '.lastpost']) };
      })
    },
    {
      name: 'smf',
      test: () => !!$('#forumposts, #messageindex'),
      thread: () => $$('#forumposts .post_wrapper').map(p => ({
        author: firstText(p, ['.poster h4 a', '.poster h4']),
        date: firstText(p, ['.keyinfo .smalltext', '.postinfo .smalltext']).replace(/^.*?on:\s*/i, ''),
        body: firstEl(p, ['.inner', '.post']),
        quote: $('a[href*="quote="]', p)
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


  // ---- Read tracking ----------------------------------------------------
  // Kept in each site's own localStorage (which the app's web view keeps
  // between launches): for every thread, how many posts you've read through.
  const RKEY = 'fr-read-v1';
  const readStore = {
    load() {
      let d = {};
      try { d = JSON.parse(localStorage.getItem(RKEY) || '{}') || {}; } catch (e) {}
      d.t = d.t || {}; d.per = d.per || {};
      return d;
    },
    save(d) {
      try {
        const keys = Object.keys(d.t);
        if (keys.length > 4000) keys.sort((a, b) => d.t[a].at - d.t[b].at).slice(0, keys.length - 3500).forEach(k => delete d.t[k]);
        localStorage.setItem(RKEY, JSON.stringify(d));
      } catch (e) {}
    }
  };
  const DEFAULT_PER = { groupsio: 20, jforum: 15, xenforo: 20, invision: 25, phpbb: 25, vb: 20, smf: 20 };

  // Which thread a URL points at, independent of page: {id, kind, base, page|offset}.
  function threadRef(href) {
    let u;
    try { u = new URL(href, location.href); } catch (e) { return null; }
    const p = u.pathname.replace(/;jsessionid=[^/]*/i, ''), q = u.searchParams, o = u.origin;
    let m;
    if ((m = p.match(/^(.*\/posts\/list\/)(?:(\d+)\/)?(\d+)\.page$/)))
      return { id: 'j' + m[3], kind: 'jforum', origin: o, prefix: m[1], tid: m[3], offset: m[2] ? +m[2] : 0 };
    if ((m = p.match(/^(.*\/threads\/(?:[^/]*\.)?(\d+))(?:\/(?:page-(\d+))?)?\/?$/)))
      return { id: 'x' + m[2], kind: 'xenforo', origin: o, base: m[1], page: m[3] ? +m[3] : 1 };
    if ((m = p.match(/^(.*\/g\/[^/]+\/topic\/[^/]+\/(\d+))\/?$/)))
      return { id: 'g' + m[2], kind: 'groupsio', origin: o, base: m[1], page: +(q.get('page') || 1) };
    if ((m = p.match(/^(.*\/topic\/(\d+)[^/]*)(?:\/(?:page\/(\d+))?)?\/?$/)))
      return { id: 'i' + m[2], kind: 'invision', origin: o, base: m[1], page: m[3] ? +m[3] : 1 };
    if (/viewtopic\.php$/.test(p) && q.get('t'))
      return { id: 'p' + q.get('t'), kind: 'phpbb', origin: o, base: p + '?t=' + q.get('t'), offset: +(q.get('start') || 0) };
    if (/showthread\.php$/.test(p) && q.get('t'))
      return { id: 'v' + q.get('t'), kind: 'vb', origin: o, base: p + '?t=' + q.get('t'), page: +(q.get('page') || 1) };
    if (q.get('topic')) {
      const [t, off] = q.get('topic').split('.');
      return { id: 's' + t, kind: 'smf', origin: o, base: p + '?topic=' + t, offset: +(off || 0) };
    }
    return null;
  }

  function pageURL(ref, n, per) {
    const off = (n - 1) * per;
    switch (ref.kind) {
      case 'jforum': return ref.origin + ref.prefix + (n > 1 ? off + '/' : '') + ref.tid + '.page';
      case 'xenforo': return ref.origin + ref.base + '/' + (n > 1 ? 'page-' + n : '');
      case 'invision': return ref.origin + ref.base + '/' + (n > 1 ? 'page/' + n + '/' : '');
      case 'phpbb': return ref.origin + ref.base + (n > 1 ? '&start=' + off : '');
      case 'vb': return ref.origin + ref.base + (n > 1 ? '&page=' + n : '');
      case 'smf': return ref.origin + ref.base + '.' + off;
      case 'groupsio': return ref.origin + ref.base + (n > 1 ? '?page=' + n : '');
    }
    return null;
  }

  // Posts per page: from the offset in the page-2 link where the site uses
  // offsets, otherwise from a full (non-last) page, otherwise remembered.
  function postsPerPage(ref, onPage, pages, d) {
    let per = null;
    if ('offset' in ref) {
      const offs = $$('a[href]').map(a => threadRef(a.href)).filter(r => r && r.id === ref.id && r.offset > 0).map(r => r.offset);
      if (ref.offset > 0) offs.push(ref.offset);
      if (offs.length && pages) {
        // The smallest offset is page 2's, unless we're on page 2 and it isn't linked.
        const min = Math.min(...offs);
        per = pages.current === 2 && ref.offset === min ? ref.offset : min;
      } else if (offs.length) per = Math.min(...offs);
    } else if (pages && pages.current < pages.last) {
      per = onPage;
    }
    if (per) d.per[ref.kind] = per;
    return per || d.per[ref.kind] || DEFAULT_PER[ref.kind] || 20;
  }

  function trackThread(root, found, pages) {
    const ref = threadRef(location.href);
    if (!ref) return;
    const d = readStore.load();
    const cards = $$('.fr-post', root);
    const per = postsPerPage(ref, cards.length, pages, d);
    const page = (pages && pages.current) || ref.page || (ref.offset ? Math.round(ref.offset / per) + 1 : 1);
    const first = (page - 1) * per; // posts before this page
    const before = (d.t[ref.id] || {}).seen || 0;
    cards.forEach((c, i) => {
      const num = $('.fr-num', c);
      if (num) num.textContent = '#' + (first + i + 1);
    });
    const firstNew = before > 0 ? cards.find((c, i) => first + i + 1 > before) : null;
    if (firstNew) {
      firstNew.classList.add('fr-new');
      firstNew.parentNode.insertBefore(el('div', 'fr-newline', 'New since you last read'), firstNew);
      FR.jumpTo = firstNew.previousElementSibling;
    }
    d.t[ref.id] = { seen: Math.max(before, first + cards.length), at: Date.now() };
    readStore.save(d);
  }

  function trackList(root, found) {
    const d = readStore.load();
    const links = $$('.fr-item', root);
    const marks = [];
    found.items.forEach((it, i) => {
      const card = links[i], a = card && $('a', card);
      const ref = a && threadRef(it.href);
      if (!ref) return;
      const rec = d.t[ref.id];
      const total = it.n != null ? it.n + 1 : null; // replies + the opening post
      if (!rec) {
        card.classList.add('fr-unread');
      } else if (total != null && total > rec.seen) {
        card.classList.add('fr-unread');
        a.insertAdjacentHTML('beforeend', ` <span class="fr-badge">+${total - rec.seen} new</span>`);
        // Open at the page holding the first post you haven't read.
        const per = d.per[ref.kind] || DEFAULT_PER[ref.kind] || 20;
        const n = Math.floor(rec.seen / per) + 1;
        if (n > 1) { const u = pageURL(ref, n, per); if (u) a.href = u; }
      } else if (it.unread && total == null) {
        card.classList.add('fr-unread');
      } else {
        card.classList.add('fr-read');
      }
      if (total != null) marks.push([ref.id, total]);
    });
    if (marks.length) {
      const all = el('a', 'fr-markall', 'Mark all on this page as read');
      all.href = '#';
      all.addEventListener('click', e => {
        e.preventDefault();
        const d2 = readStore.load();
        marks.forEach(([id, total]) => { d2.t[id] = { seen: Math.max(total, (d2.t[id] || {}).seen || 0), at: Date.now() }; });
        readStore.save(d2);
        $$('.fr-item', root).forEach(c => { c.classList.remove('fr-unread'); c.classList.add('fr-read'); });
        $$('.fr-badge', root).forEach(b => b.remove());
        all.remove();
      });
      root.appendChild(all);
    }
  }


  // ---- Posting ------------------------------------------------------------
  // Replies always go through the site's own form (so logins, captchas and
  // anti-spam tokens keep working); the clean view just presents it.
  const isRealLink = a => a && a.getAttribute('href') && !/^(#|javascript:)/i.test(a.getAttribute('href'));

  // The page's form for writing a post: a POST form with a message box.
  function findPostForm() {
    const forms = $$('form').filter(f => {
      if ((f.getAttribute('method') || '').toLowerCase() !== 'post') return false;
      if (/search|login|log-in|signin|register/i.test((f.getAttribute('action') || '') + ' ' + f.id + ' ' + f.className)) return false;
      return !!$('textarea, [contenteditable="true"]', f);
    });
    const size = f => { const t = $('textarea', f); return t ? (t.rows || 2) * (t.cols || 20) + 1000 : 500; };
    return forms.sort((a, b) => size(b) - size(a))[0] || null;
  }

  // A plain textarea form can be moved into the clean view and still work;
  // rich editors (XenForo, Invision) can't, so those use the original page.
  const isPlainForm = f => !!$('textarea', f) && !$('[contenteditable="true"], iframe, .fr-box, .ck-editor', f);

  function replyLink() {
    return $$('a[href]').find(a => isRealLink(a) && /^(post )?reply( to (this )?(thread|topic))?$/i.test(text(a))) || null;
  }

  let formHome = null, movedForm = null, replySlot = null;
  function placeForm(inReader) {
    if (!movedForm || !replySlot) return;
    if (inReader) replySlot.appendChild(movedForm);
    else if (formHome && formHome.parentNode) formHome.parentNode.insertBefore(movedForm, formHome);
  }

  function addReplySection(root) {
    const form = findPostForm();
    const section = el('section', 'fr-reply');
    if (form && isPlainForm(form)) {
      section.appendChild(el('h2', null, 'Reply'));
      replySlot = el('div', 'fr-replyform');
      section.appendChild(replySlot);
      formHome = document.createComment('fr-form-home');
      form.parentNode.insertBefore(formHome, form);
      movedForm = form;
    } else {
      const link = replyLink();
      if (link) {
        section.innerHTML = `<a class="fr-btn" href="${esc(link.href)}">Reply</a>`;
      } else if (form) {
        const b = el('a', 'fr-btn', 'Reply');
        b.href = '#';
        b.addEventListener('click', e => {
          e.preventDefault();
          FR.setEnabled(false);
          post({ type: 'readerToggled', on: false, temporary: true });
          setTimeout(() => { form.scrollIntoView({ block: 'center' }); const box = $('[contenteditable="true"], textarea', form); if (box) box.focus(); }, 60);
        });
        section.appendChild(b);
      } else return;
    }
    root.appendChild(section);
  }

  // On a reply or quote page, show just the posting form, with a Cancel link.
  function compose() {
    const form = findPostForm();
    // Only on pages that are about writing a post, so a stray form elsewhere
    // (a shoutbox on the forum index, say) doesn't take over the page.
    if (!form || !/reply|post|quote|new|create|add|edit|compose|message/i.test(location.pathname + location.search)) return null;
    let n = form;
    while (n && n !== document.body) {
      for (const sib of Array.from(n.parentNode ? n.parentNode.children : [])) if (sib !== n && sib.tagName !== 'SCRIPT') sib.classList.add('fr-hide');
      n = n.parentNode;
    }
    form.classList.add('fr-composeform');
    const bar = el('div', 'fr-composebar', `<b>${esc(pageTitle())}</b>`);
    const cancel = el('a', null, 'Cancel');
    cancel.href = '#';
    cancel.addEventListener('click', e => { e.preventDefault(); history.back(); });
    bar.appendChild(cancel);
    form.parentNode.insertBefore(bar, form);
    const box = $('textarea', form);
    if (box && FR.enabled) setTimeout(() => { const v = box.value; box.focus(); box.setSelectionRange(v.length, v.length); }, 300);
    return { adapter: 'form', kind: 'compose' };
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
    #fr-reader .fr-item .fr-preview { font-size: .88em; color: var(--fr-muted); margin-top: 3px; display: -webkit-box;
      -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    #fr-reader .fr-item .fr-meta { font-size: .8em; color: var(--fr-muted); margin-top: 3px; }
    #fr-reader .fr-pages { display: flex; gap: 6px; align-items: center; justify-content: center; margin: 8px 0 14px; flex-wrap: wrap; }
    #fr-reader .fr-pages a, #fr-reader .fr-pages span { padding: 7px 11px; border-radius: 9px; background: var(--fr-card);
      border: 1px solid var(--fr-line); text-decoration: none; font-size: .9em; }
    #fr-reader .fr-pages span.fr-off { opacity: .35; }
    #fr-reader .fr-pages .fr-cur { border: none; background: none; color: var(--fr-muted); }
    #fr-reader .fr-quote { margin-left: 8px; font-size: .95em; text-decoration: none; }
    #fr-reader .fr-num:empty { display: none; }
    #fr-reader .fr-num:empty + .fr-quote { margin-left: auto; }
    #fr-reader .fr-reply { margin: 16px 0 0; }
    #fr-reader .fr-reply h2 { font-size: 1em; margin: 0 4px 8px; }
    #fr-reader .fr-btn { display: block; text-align: center; padding: 12px; border-radius: 12px; background: var(--fr-accent);
      color: #fff !important; font-weight: 600; text-decoration: none; }
    #fr-reader .fr-replyform form, html.fr-compose .fr-composeform { background: var(--fr-card); border: 1px solid var(--fr-line);
      border-radius: 12px; padding: 12px; margin: 0; }
    #fr-reader .fr-replyform textarea, html.fr-compose .fr-composeform textarea { width: 100% !important; box-sizing: border-box;
      min-height: 9em; font: 17px/1.45 -apple-system, system-ui, sans-serif; padding: 10px; border-radius: 9px;
      border: 1px solid var(--fr-line); background: var(--fr-bg); color: var(--fr-text); }
    #fr-reader .fr-replyform input[type="submit"], html.fr-compose .fr-composeform input[type="submit"],
    html.fr-compose .fr-composeform button[type="submit"] { -webkit-appearance: none; font: 600 16px -apple-system, system-ui, sans-serif;
      padding: 10px 22px; border-radius: 10px; border: none; background: var(--fr-accent); color: #fff; margin-top: 10px; }
    html.fr-compose .fr-hide { display: none !important; }
    html.fr-compose, html.fr-compose body { background: var(--fr-bg) !important; }
    html.fr-compose body { margin: 0 !important; padding: 12px !important; }
    html.fr-compose .fr-composeform textarea { min-height: 45vh; }
    .fr-composebar { display: none; }
    html.fr-compose .fr-composebar { display: flex; justify-content: space-between; align-items: baseline; gap: 12px;
      font: 16px/1.35 -apple-system, system-ui, sans-serif; color: var(--fr-text); margin: 4px 2px 12px; }
    html.fr-compose .fr-composebar a { color: var(--fr-accent); white-space: nowrap; }
    html.fr-compose { --fr-bg: #f7f5f0; --fr-card: #ffffff; --fr-text: #1d1d1f; --fr-line: #e3e0d8; --fr-accent: #0a66c2; }
    @media (prefers-color-scheme: dark) {
      html.fr-compose { --fr-bg: #121214; --fr-card: #1c1c1f; --fr-text: #ececf0; --fr-line: #2c2c31; --fr-accent: #5aa9ff; }
    }
    #fr-reader .fr-orig, #fr-reader .fr-markall { display: block; text-align: center; font-size: .85em; margin-top: 18px; }
    #fr-reader .fr-item.fr-unread a { font-weight: 700; }
    #fr-reader .fr-item.fr-unread a::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 4px;
      background: var(--fr-accent); margin-right: 7px; vertical-align: 2px; }
    #fr-reader .fr-item.fr-read a { font-weight: 500; color: var(--fr-muted); }
    #fr-reader .fr-badge { display: inline-block; font-size: .72em; font-weight: 700; color: #fff; background: var(--fr-accent);
      border-radius: 9px; padding: 1px 7px; margin-left: 4px; vertical-align: 2px; }
    #fr-reader .fr-post.fr-new { border-color: var(--fr-accent); }
    #fr-reader .fr-newline { text-align: center; color: var(--fr-accent); font-size: .8em; font-weight: 700; margin: 6px 0 8px;
      scroll-margin-top: 8px; }
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
        // Numbers are made thread-wide by trackThread when it knows the page size.
        card.appendChild(el('div', 'fr-head',
          `<b>${esc(p.author || 'Unknown')}</b><span>${esc(p.date || '')}</span><span class="fr-num">${numbered ? '#' + (i + 1) : ''}</span>`));
        if (isRealLink(p.quote)) {
          const q = el('a', 'fr-quote', 'Quote');
          q.href = p.quote.href;
          card.firstChild.appendChild(q);
        }
        const body = el('div', 'fr-body');
        body.appendChild(cleanBody(p.body));
        card.appendChild(body);
        root.appendChild(card);
      });
    } else {
      found.items.forEach(it => {
        const card = el('div', 'fr-item', `<a href="${esc(it.href)}">${esc(it.title)}</a>` +
          (it.preview ? `<div class="fr-preview">${esc(it.preview)}</div>` : '') +
          (it.meta ? `<div class="fr-meta">${esc(it.meta)}</div>` : ''));
        root.appendChild(card);
      });
    }
    const bottom = pagesBar(pages);
    if (bottom) root.appendChild(bottom);
    try { found.kind === 'thread' ? trackThread(root, found, pages) : trackList(root, found); } catch (e) {}
    if (found.kind === 'thread') try { addReplySection(root); } catch (e) {}
    const orig = el('a', 'fr-orig', 'Show original page');
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
      const kind = this.result && this.result.kind;
      document.documentElement.classList.toggle('fr-on', !!(on && this.result && kind !== 'compose'));
      document.documentElement.classList.toggle('fr-compose', !!(on && kind === 'compose'));
      placeForm(on);
      if (on && this.result) window.scrollTo(0, 0);
    },
    run() {
      addStyle('fr-ad-css', AD_CSS);
      if (this.result) return;
      const r = build();
      if (!r) {
        const c = compose();
        if (c) {
          addStyle('fr-reader-css', READER_CSS);
          this.result = c;
          document.documentElement.classList.toggle('fr-compose', this.enabled);
        }
      }
      if (r) {
        addStyle('fr-reader-css', READER_CSS);
        document.body.appendChild(r.root);
        this.result = r.found;
        document.documentElement.classList.toggle('fr-on', this.enabled);
        placeForm(this.enabled);
        if (this.enabled && this.jumpTo && !location.hash) {
          const target = this.jumpTo;
          setTimeout(() => target.scrollIntoView({ block: 'start' }), 50);
        }
      }
      post({ type: 'page', available: !!this.result, kind: this.result ? this.result.kind : null,
             adapter: this.result ? this.result.adapter : null, count: this.result ? (this.result.posts || this.result.items || []).length : 0 });
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
