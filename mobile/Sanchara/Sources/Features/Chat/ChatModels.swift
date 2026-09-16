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

    /// Which model wrote this turn.
    ///
    /// Shown in the transcript, not merely tracked: `generative-ai.md ›
    /// Transparency` is blunt about it — "Communicate where your app uses AI"
    /// and "Clearly identify when and where you use AI". The two sources also
    /// behave differently in ways the user can feel, so hiding the difference
    /// would be a bug even if disclosure weren't required: an on-device answer
    /// is instant, works offline, never leaves the phone, and is not saved with
    /// the rest of the reading.
    enum Source {
        /// Claude, through `/api/chat`. Saved to the conversation.
        case server
        /// Apple's on-device model reading the local chart. Not saved.
        case onDevice
    }

    let id = UUID()
    let role: Role
    var content: String
    var source: Source = .server
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
