import SwiftUI

struct ForumListView: View {
    @EnvironmentObject private var store: ForumStore
    @State private var editing: Forum?
    @State private var adding = false

    var body: some View {
        NavigationStack {
            Group {
                if store.forums.isEmpty {
                    ContentUnavailableView {
                        Label("No forums yet", systemImage: "bubble.left.and.text.bubble.right")
                    } description: {
                        Text("Add a forum by its web address. It opens with ads blocked and text you can make bigger.")
                    } actions: {
                        Button("Add a Forum") { adding = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    List {
                        ForEach(store.forums) { forum in
                            NavigationLink(value: forum.id) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(forum.displayName).font(.headline)
                                    Text(forum.host).font(.subheadline).foregroundStyle(.secondary)
                                }
                                .padding(.vertical, 2)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    if let i = store.forums.firstIndex(of: forum) { store.delete(at: [i]) }
                                } label: { Label("Delete", systemImage: "trash") }
                                Button { editing = forum } label: { Label("Edit", systemImage: "pencil") }
                                    .tint(.gray)
                            }
                            .contextMenu {
                                Button { editing = forum } label: { Label("Edit", systemImage: "pencil") }
                                Button {
                                    store.update(forum.id) { $0.lastURL = nil }
                                } label: { Label("Start from Home Page Next Time", systemImage: "house") }
                            }
                        }
                        .onDelete { store.delete(at: $0) }
                        .onMove { store.move(from: $0, to: $1) }
                    }
                }
            }
            .navigationTitle("Forums")
            .navigationDestination(for: Forum.ID.self) { id in
                if let forum = store.forum(id) {
                    ForumBrowserView(forum: forum, store: store)
                }
            }
            .toolbar {
                if !store.forums.isEmpty {
                    ToolbarItem(placement: .topBarLeading) { EditButton() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Label("Add Forum", systemImage: "plus") }
                }
            }
            .sheet(isPresented: $adding) {
                ForumEditView(forum: nil) { store.add($0) }
            }
            .sheet(item: $editing) { forum in
                ForumEditView(forum: forum) { store.replace($0) }
            }
        }
    }
}

struct ForumEditView: View {
    let forum: Forum?
    let onSave: (Forum) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var address = ""
    @State private var name = ""
    @State private var blockAds = true
    @State private var cleanView = true

    private var url: URL? { Forum.normalize(address) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Web address", text: $address, prompt: Text("dcurbanmom.com/jforum"))
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("Name", text: $name, prompt: Text(url.map { Forum(name: "", url: $0).host } ?? "Optional"))
                } footer: {
                    Text("Use the page you'd want to start on, such as the forum's main list or a favorite board. For a groups.io email list, use its Topics page, like groups.io/g/listname/topics.")
                }
                Section {
                    Toggle("Block ads", isOn: $blockAds)
                    Toggle("Clean view", isOn: $cleanView)
                } footer: {
                    Text("Clean view shows threads and topic lists as a simple column of posts. Turn it off for a forum if it doesn't look right there; you can also switch it per page with the reader button.")
                }
            }
            .navigationTitle(forum == nil ? "Add Forum" : "Edit Forum")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let url else { return }
                        var f = forum ?? Forum(name: name, url: url)
                        if f.url != url { f.lastURL = nil }
                        f.url = url
                        f.name = name
                        f.blockAds = blockAds
                        f.cleanView = cleanView
                        onSave(f)
                        dismiss()
                    }
                    .disabled(url == nil)
                }
            }
            .onAppear {
                if let forum {
                    address = forum.url.absoluteString
                    name = forum.name
                    blockAds = forum.blockAds
                    cleanView = forum.cleanView
                }
            }
        }
    }
}
