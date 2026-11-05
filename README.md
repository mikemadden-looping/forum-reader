# Forums

A small iPhone and iPad app for reading web forums on a phone. You add forums
by their web address; each one opens in its own browser with:

- **Ads blocked** — requests to the big ad and tracking networks are blocked
  (see `ForumReader/AdBlock.swift`), and common ad slots are hidden.
- **Text size per forum** — like Safari's aA zoom, remembered for each forum.
- **Clean view** — on thread and topic-list pages the app recognises, posts
  are laid out as one readable column with author, date, quotes and simple
  page buttons (« ‹ Prev · Page 3 of 12 · Next › »). Tap the reader button in
  the toolbar, or "Show original page" at the bottom, to switch back to the
  real page to reply, log in or search.
- **Posting in the same view** — the site's own reply box sits under the
  posts, each post has a Quote link, and the site's reply and quote pages show
  just the form, in large text, with Cancel. Posting still goes through the
  site's form, so logins and anti-spam checks work. Sites with rich editors
  (XenForo, Invision) get a Reply button that opens the original page at the
  reply box for that one page.
- **Remembers what you've read**, with no account needed. In clean-view topic
  lists, threads you haven't opened are bold with a dot, threads with new
  replies show "+5 new" and open at the page with the first new post (marked
  "New since you last read"), and threads you're caught up on are dimmed.
  "Mark all on this page as read" is at the bottom of each list. The history
  is kept on the phone, per site; on forums where you're logged in, the
  site's own unread marks are used too.
- **Picks up where you left off** in each forum; Home goes back to the address
  you added.

The real site is always underneath, so logins, posting and Cloudflare's
"checking your browser" pages work as they do in Safari.

## Which forums get the clean view

`ForumReader/Resources/reader.js` recognises these forum packages:

| Software | Examples | Tested |
|---|---|---|
| JForum | DC Urban Moms and Dads | threads, topic lists |
| Invision Community | American Weather | threads, topic lists (on invisioncommunity.com) |
| XenForo | VW ID Talk and many hobby forums | topic lists |
| phpBB, vBulletin, SMF | older boards | not yet |

Any other forum still gets ad blocking and text size; the reader button is
greyed out on pages it doesn't recognise. To add a site, give `reader.js`
another entry in `adapters` with CSS selectors for its posts.

## Install with TestFlight (GitHub Actions)

Uses the same signing secrets as the Trio Browser Build, set on the
`mikemadden-looping` organization: `TEAMID`, `GH_PAT`, `FASTLANE_KEY_ID`,
`FASTLANE_ISSUER_ID`, `FASTLANE_KEY`, `MATCH_PASSWORD`, plus the existing
`Match-Secrets` repository. The repository must be public for organization
secrets to reach it on a free GitHub plan.

1. **Actions → 1. Add identifier → Run workflow.** Registers
   `com.<TEAMID>.forumreader` and makes its App Store profile.
2. **App Store Connect → Apps → + → New App.** Platform iOS, any name (e.g.
   "Forums" — App Store Connect may require something more unique, like
   "Mike's Forum Reader"), bundle ID `com.<TEAMID>.forumreader`, any SKU.
3. **Actions → 2. Build to TestFlight → Run workflow.** About 10 minutes, then
   Apple takes a few more to process it.
4. In App Store Connect → the app → **TestFlight**, add yourself to an internal
   testing group (once), then install from the TestFlight app.

**0. Check build** compiles on every push without signing. TestFlight builds
expire after 90 days; run step 3 again for a fresh one.

## Build locally instead (Mac with Xcode 26)

`brew install xcodegen`, then `xcodegen generate`, open `ForumReader.xcodeproj`,
pick your team under Signing & Capabilities, and run.
