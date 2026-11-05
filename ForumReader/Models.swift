import Foundation

/// A forum the person has added. Everything about how it's shown is per forum.
struct Forum: Codable, Identifiable, Hashable {
    var id = UUID()
    var name: String
    var url: URL
    /// Page zoom, like Safari's aA setting. 1.0 = the site's own size.
    var zoom: Double = 1.0
    /// Lay recognised threads and topic lists out as a clean column.
    var cleanView: Bool = true
    var blockAds: Bool = true
    /// Where the person was last, so reopening a forum picks up there.
    var lastURL: URL?

    var host: String {
        let h = url.host() ?? url.absoluteString
        return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    }

    var displayName: String { name.trimmingCharacters(in: .whitespaces).isEmpty ? host : name }

    /// Turns what someone typed ("dcurbanmom.com/jforum") into a URL.
    static func normalize(_ input: String) -> URL? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty else { return nil }
        if let list = emailList(s) { return list.url }
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") {
            s = "https://" + s
        }
        guard let url = URL(string: s), let host = url.host(), host.contains(".") else { return nil }
        return url
    }

    /// An email group's address ("knitters@groups.io", "main@groups.jewishgen.org",
    /// "group+subgroup@groups.io") becomes its groups.io Topics page.
    static func emailList(_ input: String) -> (url: URL, name: String)? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.lowercased().hasPrefix("mailto:") { s = String(s.dropFirst(7)) }
        let parts = s.split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !s.contains("/"), !s.contains(" ") else { return nil }
        let local = String(parts[0]), domain = String(parts[1]).lowercased()
        guard !local.isEmpty, domain.contains("."), !domain.hasPrefix("."), !domain.hasSuffix(".") else { return nil }
        let path = local.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? local
        guard let url = URL(string: "https://\(domain)/g/\(path)/topics") else { return nil }
        return (url, local)
    }
}

@MainActor
final class ForumStore: ObservableObject {
    @Published private(set) var forums: [Forum] = []

    private let key = "forums.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let saved = try? JSONDecoder().decode([Forum].self, from: data) {
            forums = saved
            // Build 1 started forums at 125%, which was too big with the clean
            // view's own larger text. Move anything still at that default to 100%.
            if !UserDefaults.standard.bool(forKey: "zoomMigrated.v2") {
                for i in forums.indices where abs(forums[i].zoom - 1.25) < 0.001 { forums[i].zoom = 1.0 }
                UserDefaults.standard.set(true, forKey: "zoomMigrated.v2")
                save()
            }
        }
    }

    func forum(_ id: Forum.ID) -> Forum? { forums.first { $0.id == id } }

    func add(_ forum: Forum) {
        forums.append(forum)
        save()
    }

    func update(_ id: Forum.ID, _ change: (inout Forum) -> Void) {
        guard let i = forums.firstIndex(where: { $0.id == id }) else { return }
        change(&forums[i])
        save()
    }

    func replace(_ forum: Forum) {
        update(forum.id) { $0 = forum }
    }

    func delete(at offsets: IndexSet) {
        forums.remove(atOffsets: offsets)
        save()
    }

    func move(from source: IndexSet, to destination: Int) {
        forums.move(fromOffsets: source, toOffset: destination)
        save()
    }

    private func save() {
        if let data = try? JSONEncoder().encode(forums) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
