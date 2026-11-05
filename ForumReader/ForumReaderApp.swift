import SwiftUI

@main
struct ForumReaderApp: App {
    @StateObject private var store = ForumStore()

    var body: some Scene {
        WindowGroup {
            ForumListView()
                .environmentObject(store)
        }
    }
}
