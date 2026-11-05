import WebKit

/// A small built-in ad blocker: blocks requests to the big ad and tracking
/// networks forums use, and hides common ad slots. Compiled once by WebKit
/// and cached between launches.
enum AdBlock {
    // Bump when the list changes so WebKit recompiles it.
    private static let identifier = "forumreader-ads-v1"

    private static let domains = [
        // Google ads
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "googletagservices.com",
        "adservice.google.com", "google-analytics.com", "googletagmanager.com",
        // Header bidding and exchanges
        "amazon-adsystem.com", "adnxs.com", "adsrvr.org", "rubiconproject.com", "pubmatic.com",
        "openx.net", "criteo.com", "criteo.net", "casalemedia.com", "indexww.com", "3lift.com",
        "sharethrough.com", "teads.tv", "smartadserver.com", "adform.net", "yieldmo.com",
        "lijit.com", "sovrn.com", "gumgum.com", "kargo.com", "33across.com", "sonobi.com",
        "bidswitch.net", "contextweb.com", "media.net", "advertising.com", "adsystem.com",
        "springserve.com", "spotxchange.com", "aniview.com", "undertone.com", "districtm.io",
        "triplelift.com", "onetag-sys.com", "rlcdn.com", "adsafeprotected.com", "moatads.com",
        "doubleverify.com", "id5-sync.com", "liadm.com", "crwdcntrl.net", "bluekai.com",
        // Site ad managers (DCUM uses AdThrive/Raptive)
        "adthrive.com", "raptive.com", "cafemedia.com", "ezoic.net", "ezojs.com", "freestar.com",
        "pub.network", "playwire.com", "snigelweb.com", "adpushup.com", "venatusmedia.com",
        "vidazoo.com", "connatix.com", "primis.tech", "nativo.com", "exponential.com",
        // Content recommendation widgets
        "taboola.com", "outbrain.com", "revcontent.com", "mgid.com", "zergnet.com",
        // Measurement
        "scorecardresearch.com", "quantserve.com", "quantcount.com",
    ]

    private static let hiddenSelectors = [
        "ins.adsbygoogle", "[id^=\"div-gpt-ad\"]", "[id^=\"google_ads\"]", "[id^=\"AdThrive_\"]",
        ".adthrive-ad", ".ad-slot", ".advertisement", ".samBannerUnit", ".samCodeUnit",
        ".ipsAdvertisement", "[id^=\"taboola\"]", ".OUTBRAIN",
    ]

    private static var rulesJSON: String {
        var rules: [[String: Any]] = domains.map { domain in
            let escaped = domain.replacingOccurrences(of: ".", with: "\\.")
            return [
                "trigger": ["url-filter": "^[^:]+://+([^:/]+\\.)?\(escaped)[:/]", "load-type": ["third-party"]],
                "action": ["type": "block"],
            ]
        }
        rules.append([
            "trigger": ["url-filter": ".*"],
            "action": ["type": "css-display-none", "selector": hiddenSelectors.joined(separator: ", ")],
        ])
        let data = try! JSONSerialization.data(withJSONObject: rules)
        return String(decoding: data, as: UTF8.self)
    }

    private static var cached: WKContentRuleList?

    /// The compiled rule list, or nil if WebKit couldn't compile it (the app
    /// still works, just without request blocking).
    @MainActor
    static func ruleList() async -> WKContentRuleList? {
        if let cached { return cached }
        guard let store = WKContentRuleListStore.default() else { return nil }
        let existing: WKContentRuleList? = await withCheckedContinuation { cont in
            store.lookUpContentRuleList(forIdentifier: identifier) { list, _ in cont.resume(returning: list) }
        }
        if let existing {
            cached = existing
            return existing
        }
        let json = rulesJSON
        let compiled: WKContentRuleList? = await withCheckedContinuation { cont in
            store.compileContentRuleList(forIdentifier: identifier, encodedContentRuleList: json) { list, error in
                if let error { print("Ad block rules failed to compile: \(error)") }
                cont.resume(returning: list)
            }
        }
        cached = compiled
        return compiled
    }
}
