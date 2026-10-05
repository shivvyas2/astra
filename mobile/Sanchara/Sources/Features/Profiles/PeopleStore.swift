import Foundation

/// The user's saved people. Owner-only on the server; nothing is cached on
/// the device beyond this screen's lifetime.
@Observable
@MainActor
final class PeopleStore {
    var people: [Person] = []
    /// False until migration 0012 is applied on the server.
    var available = true
    var isLoading = false
    var errorMessage: String?

    func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let payload = try await PeopleAPI.list()
            people = payload.people
            available = payload.available
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Saves a new person; returns them with their chart, or nil with `errorMessage` set.
    func add(_ draft: PersonDraft) async -> Person? {
        do {
            let person = try await PeopleAPI.create(draft)
            people.append(person)
            errorMessage = nil
            return person
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func update(_ id: String, _ draft: PersonDraft) async -> Person? {
        do {
            let person = try await PeopleAPI.update(id: id, draft)
            if let i = people.firstIndex(where: { $0.id == id }) { people[i] = person }
            errorMessage = nil
            return person
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func remove(_ id: String) async -> Bool {
        do {
            try await PeopleAPI.delete(id: id)
            people.removeAll { $0.id == id }
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }
}
