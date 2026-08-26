import Foundation
import SwiftUI

/// The three reading modes the API accepts (`app/api/chat/route.ts`).
enum ChatMode: String, CaseIterable, Identifiable, Sendable {
    case vedic
    case western
    case numerology

    var id: String { rawValue }

    var label: String {
        switch self {
        case .vedic: "Vedic"
        case .western: "Western"
        case .numerology: "Numerology"
        }
    }

    /// The dot colours from `components/Chat.tsx`.
    var dot: Color {
        switch self {
        case .vedic: Theme.accent
        case .western: Color(hex: 0x6B74FF)
        case .numerology: Color(hex: 0xF0B429)
        }
    }

    var next: ChatMode {
        let all = ChatMode.allCases
        return all[(all.firstIndex(of: self)! + 1) % all.count]
    }

    init(dbValue: String) {
        self = ChatMode(rawValue: dbValue) ?? .vedic
    }
}

/// One turn in the transcript. Identity is stable per turn so SwiftUI can keep
/// rows in place while the assistant's content grows during streaming.
struct ChatMessage: Identifiable {
    enum Role { case user, assistant }

    let id = UUID()
    let role: Role
    var content: String
}

/// A past reading, read straight from Supabase under the owner-only RLS policy.
struct Conversation: Decodable, Identifiable, Hashable {
    let id: String
    let tradition: String
    let title: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, tradition, title
        case createdAt = "created_at"
    }

    var mode: ChatMode { ChatMode(dbValue: tradition) }
}

struct StoredMessage: Decodable {
    let role: String
    let content: String

    var asChatMessage: ChatMessage {
        ChatMessage(role: role == "user" ? .user : .assistant, content: content)
    }
}
