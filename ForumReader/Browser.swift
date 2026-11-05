import SwiftUI
import WebKit
import Combine

/// Owns one forum's web view: ad blocking, zoom, the clean-view script, and
/// the navigation state the toolbar shows.
@MainActor
final class BrowserModel: NSObject, ObservableObject {
    let webView: WKWebView
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false
    @Published var progress = 0.0
    @Published var url: URL?
    /// Whether the current page is one the clean view understands.
    @Published var readerAvailable = false
    @Published var readerOn: Bool
    @Published var zoom: Double

    private var forum: Forum
    private let save: @MainActor (Forum.ID, (inout Forum) -> Void) -> Void
    private var observers: [NSKeyValueObservation] = []
    private var started = false

    static let zoomSteps: [Double] = [0.85, 1.0, 1.15, 1.25, 1.4, 1.6, 1.8, 2.0, 2.3]

    private static let readerSource: String = {
        guard let url = Bundle.main.url(forResource: "reader", withExtension: "js"),
              let s = try? String(contentsOf: url, encoding: .utf8) else { return "" }
        return s
    }()

    init(forum: Forum, save: @escaping @MainActor (Forum.ID, (inout Forum) -> Void) -> Void) {
        self.forum = forum
        self.save = save
        self.readerOn = forum.cleanView
        self.zoom = forum.zoom

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // keeps logins and the Cloudflare "checking your browser" pass
        config.allowsInlineMediaPlayback = true
        // Present as mobile Safari so sites serve their normal phone layout.
        config.applicationNameForUserAgent = "Version/18.0 Mobile/15E148 Safari/604.1"
        config.defaultWebpagePreferences.preferredContentMode = .mobile

        webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = true
        webView.pageZoom = forum.zoom
        super.init()

        webView.configuration.userContentController.add(WeakMessageHandler(self), name: "fr")
        installScripts()

        webView.navigationDelegate = self
        webView.uiDelegate = self

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        observers = [
            webView.observe(\.canGoBack) { [weak self] wv, _ in Task { @MainActor in self?.canGoBack = wv.canGoBack } },
            webView.observe(\.canGoForward) { [weak self] wv, _ in Task { @MainActor in self?.canGoForward = wv.canGoForward } },
            webView.observe(\.isLoading) { [weak self] wv, _ in Task { @MainActor in self?.isLoading = wv.isLoading } },
            webView.observe(\.estimatedProgress) { [weak self] wv, _ in Task { @MainActor in self?.progress = wv.estimatedProgress } },
            webView.observe(\.url) { [weak self] wv, _ in Task { @MainActor in self?.url = wv.url } },
        ]
    }

    func start() {
        guard !started else { return }
        started = true
        Task {
            if forum.blockAds, let rules = await AdBlock.ruleList() {
                webView.configuration.userContentController.add(rules)
            }
            webView.load(URLRequest(url: forum.lastURL ?? forum.url))
        }
    }

    private func installScripts() {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        // With clean view on, keep the page hidden until reader.js has decided
        // how to show it, so the full site never flashes up first.
        let pending = readerOn ? """
            document.documentElement.classList.add('fr-pending');
            (function(){var s=document.createElement('style');s.textContent='html.fr-pending body{visibility:hidden!important}';
            (document.head||document.documentElement).appendChild(s);})();
            """ : ""
        controller.addUserScript(WKUserScript(source: "window.__FR_CLEAN = \(readerOn);" + pending,
                                              injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.addUserScript(WKUserScript(source: Self.readerSource,
                                              injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    }

    // MARK: Toolbar actions

    func goBack() { webView.goBack() }
    func goForward() { webView.goForward() }
    func reload() { webView.reload() }
    func goHome() { webView.load(URLRequest(url: forum.url)) }

    func openCopiedLink() {
        let pb = UIPasteboard.general
        let url = pb.url ?? pb.string.flatMap { URL(string: $0.trimmingCharacters(in: .whitespacesAndNewlines)) }
        guard let url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else { return }
        webView.load(URLRequest(url: url))
    }

    func setReader(_ on: Bool) {
        readerOn = on
        installScripts() // so later pages follow the new setting
        webView.evaluateJavaScript("window.__fr && window.__fr.setEnabled(\(on))")
        forum.cleanView = on
        save(forum.id) { $0.cleanView = on }
    }

    func setZoom(_ value: Double) {
        let z = min(max(value, Self.zoomSteps.first!), Self.zoomSteps.last!)
        zoom = z
        webView.pageZoom = z
        save(forum.id) { $0.zoom = z }
    }

    func zoomIn() { setZoom(Self.zoomSteps.first { $0 > zoom + 0.001 } ?? zoom) }
    func zoomOut() { setZoom(Self.zoomSteps.last { $0 < zoom - 0.001 } ?? zoom) }

    @objc private func pullToRefresh(_ sender: UIRefreshControl) {
        webView.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { sender.endRefreshing() }
    }

    fileprivate func received(_ body: Any) {
        guard let msg = body as? [String: Any], let type = msg["type"] as? String else { return }
        switch type {
        case "page":
            readerAvailable = msg["available"] as? Bool ?? false
        case "readerToggled":
            let on = msg["on"] as? Bool ?? false
            readerOn = on
            // "Reply" on a site with a rich editor shows the original page for
            // just this page; the forum's setting stays as it was.
            if msg["temporary"] as? Bool != true {
                forum.cleanView = on
                installScripts()
                save(forum.id) { $0.cleanView = on }
            }
        default:
            break
        }
    }
}

extension BrowserModel: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        readerAvailable = false
        readerOn = forum.cleanView
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        if let url = webView.url, url.scheme?.hasPrefix("http") == true {
            save(forum.id) { $0.lastURL = url }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else { return .allow }
        if ["http", "https", "about", "blob", "data"].contains(scheme) { return .allow }
        // mailto:, tel:, app links and so on go to the system.
        _ = await UIApplication.shared.open(url)
        return .cancel
    }

    /// Links that open a new window (target="_blank") load in place instead.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }
}

/// WKUserContentController holds its handlers strongly; this breaks the cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var model: BrowserModel?
    init(_ model: BrowserModel) { self.model = model }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body
        Task { @MainActor in self.model?.received(body) }
    }
}

struct WebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
