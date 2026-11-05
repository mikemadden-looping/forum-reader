import SwiftUI

struct ForumBrowserView: View {
    @StateObject private var model: BrowserModel
    @Environment(\.openURL) private var openURL
    private let forum: Forum

    init(forum: Forum, store: ForumStore) {
        self.forum = forum
        _model = StateObject(wrappedValue: BrowserModel(forum: forum) { [weak store] id, change in
            store?.update(id, change)
        })
    }

    var body: some View {
        WebView(webView: model.webView)
            .ignoresSafeArea(edges: .bottom)
            .overlay(alignment: .top) {
                if model.isLoading {
                    ProgressView(value: model.progress)
                        .progressViewStyle(.linear)
                        .tint(.accentColor)
                        .frame(height: 2)
                }
            }
            .navigationTitle(forum.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { model.reload() } label: { Label("Reload", systemImage: "arrow.clockwise") }
                        Button { model.goHome() } label: { Label("Forum Home Page", systemImage: "house") }
                        // For emailed sign-in links (groups.io and others): copy the
                        // link in Mail, then open it here so the login lands in this app.
                        Button { model.openCopiedLink() } label: { Label("Open Copied Link", systemImage: "link") }
                        if let url = model.url {
                            ShareLink(item: url) { Label("Share Link", systemImage: "square.and.arrow.up") }
                            Button { openURL(url) } label: { Label("Open in Safari", systemImage: "safari") }
                            Button { UIPasteboard.general.url = url } label: { Label("Copy Link", systemImage: "doc.on.doc") }
                        }
                    } label: {
                        Label("More", systemImage: "ellipsis.circle")
                    }
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button { model.goBack() } label: { Label("Back", systemImage: "chevron.backward") }
                        .disabled(!model.canGoBack)
                    Spacer()
                    Button { model.goForward() } label: { Label("Forward", systemImage: "chevron.forward") }
                        .disabled(!model.canGoForward)
                    Spacer()
                    Menu {
                        Button { model.zoomIn() } label: { Label("Larger Text", systemImage: "textformat.size.larger") }
                        Button { model.zoomOut() } label: { Label("Smaller Text", systemImage: "textformat.size.smaller") }
                        Button { model.setZoom(1.0) } label: { Label("Site's Own Size", systemImage: "arrow.uturn.backward") }
                        Text("Text size \(Int((model.zoom * 100).rounded()))%")
                    } label: {
                        Label("Text Size", systemImage: "textformat.size")
                    }
                    Spacer()
                    Button {
                        model.setReader(!model.readerOn)
                    } label: {
                        Label(model.readerOn ? "Original Page" : "Clean View",
                              systemImage: model.readerOn ? "doc.plaintext.fill" : "doc.plaintext")
                    }
                    .disabled(!model.readerAvailable)
                    Spacer()
                    Button { model.goHome() } label: { Label("Home", systemImage: "house") }
                }
            }
            .onAppear { model.start() }
    }
}
