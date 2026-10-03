import Foundation

/// Calls the Sanchara API on Vercel, which holds everything that cannot ship in a
/// client binary: the Anthropic key, the Swiss Ephemeris, and PDF generation.
enum SancharaAPI {

    enum APIError: LocalizedError {
        case unauthorized
        case badURL
        case server(String)

        var errorDescription: String? {
            switch self {
            case .unauthorized: "Your session expired. Please sign in again."
            case .badURL: "That request could not be built."
            case .server(let message): message
            }
        }
    }

    private static func request(_ path: String, method: String) async throws -> URLRequest {
        var req = URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent(path))
        req.httpMethod = method
        guard let token = await Supa.accessToken() else { throw APIError.unauthorized }
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return req
    }

    /// Saves birth details and computes the chart. Mirrors `POST /api/profile`.
    static func saveProfile(_ profile: BirthProfileInput) async throws {
        var req = try await request("api/profile", method: "POST")
        let boundary = "sanchara-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = profile.multipartBody(boundary: boundary)

        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    /// Downloads the kundli PDF. Mirrors `GET /api/kundli`.
    static func kundliPDF() async throws -> Data {
        let req = try await request("api/kundli", method: "GET")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
        return data
    }

    /// Permanently deletes the account. Required by App Store guideline 5.1.1(v).
    static func deleteAccount() async throws {
        let req = try await request("api/account", method: "DELETE")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    /// Birthplace search. Mirrors `GET /api/geocode`, which pairs the geocoder
    /// with `tz-lookup` so the timezone the ephemeris needs comes back with the
    /// coordinates. The route is public, so this call carries no token.
    static func geocode(_ query: String) async throws -> [GeoResult] {
        guard var components = URLComponents(
            url: AppConfig.apiBaseURL.appendingPathComponent("api/geocode"),
            resolvingAgainstBaseURL: false
        ) else { throw APIError.badURL }
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        guard let url = components.url else { throw APIError.badURL }
        let (data, response) = try await URLSession.shared.data(from: url)
        try check(response, data)
        return try JSONDecoder().decode([GeoResult].self, from: data)
    }

    /// The dasha life map with the user's pinned moments. Mirrors `GET /api/timeline`.
    static func timeline() async throws -> TimelinePayload {
        let req = try await request("api/timeline", method: "GET")
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
        return try JSONDecoder().decode(TimelinePayload.self, from: data)
    }

    /// Asks the server to write the plain-language meaning of every period.
    /// Mirrors `POST /api/timeline/explain`, which answers with the same shape
    /// as the GET once the meanings are in place.
    static func explainTimeline() async throws -> TimelinePayload {
        var req = try await request("api/timeline/explain", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // One model call covers all twelve periods; give it room.
        req.timeoutInterval = 120
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
        return try JSONDecoder().decode(TimelinePayload.self, from: data)
    }

    /// Proposes moments from the user's own chat history. Mirrors
    /// `POST /api/timeline/scan`. Nothing is saved until the user confirms.
    static func scanLifeEvents() async throws -> [CandidateEvent] {
        var req = try await request("api/timeline/scan", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Reading a whole transcript takes longer than a chat turn.
        req.timeoutInterval = 120
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
        struct Payload: Decodable { let candidates: [CandidateEvent] }
        return try JSONDecoder().decode(Payload.self, from: data).candidates
    }

    /// Pins moments onto the timeline. Mirrors `POST /api/life-events`, which
    /// takes a batch so confirming a page of candidates is one call.
    static func addLifeEvents(_ events: [NewLifeEvent]) async throws {
        var req = try await request("api/life-events", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["events": events])
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    /// Unpins a moment. Mirrors `DELETE /api/life-events`.
    static func deleteLifeEvent(id: String) async throws {
        var req = try await request("api/life-events", method: "DELETE")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["id": id])
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    /// Registers this device for dosha alerts. Mirrors `POST /api/devices`.
    static func registerDevice(token: String, environment: String) async throws {
        var req = try await request("api/devices", method: "POST")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["token": token, "environment": environment])
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    /// Stops alerts to this device — used on sign-out.
    static func unregisterDevice(token: String) async throws {
        var req = try await request("api/devices", method: "DELETE")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["token": token])
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data)
    }

    // MARK: - Chat

    /// One piece of a streaming reading.
    enum ChatEvent {
        /// The conversation this turn belongs to, from the `x-conversation-id`
        /// header. Arrives before any text, and is the id to send back on the
        /// next turn so the server keeps appending to the same conversation.
        case conversationId(String)
        case text(String)
    }

    /// Streams a reading from `POST /api/chat`.
    ///
    /// The route answers with plain UTF-8 text chunks rather than SSE. They are
    /// read as the network delivers them — a few dozen bytes to a few hundred
    /// at a time — through a `URLSession` delegate, rather than one byte at a
    /// time through `URLSession.bytes`, which cost an `await` per byte and
    /// re-decoded the buffer on each. A chunk boundary can still split a
    /// multi-byte character, so the decoder holds back an incomplete tail
    /// until the rest arrives.
    static func chatStream(
        conversationId: String?,
        mode: ChatMode,
        message: String,
        deep: Bool
    ) -> AsyncThrowingStream<ChatEvent, Error> {
        AsyncThrowingStream { continuation in
            let work = Task {
                do {
                    var req = try await request("api/chat", method: "POST")
                    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    req.httpBody = try JSONEncoder().encode(
                        ChatRequest(
                            conversationId: conversationId,
                            tradition: mode.rawValue,
                            message: message,
                            deep: deep
                        )
                    )
                    // Readings can think for a while before the first byte.
                    req.timeoutInterval = 120

                    let (http, chunks) = try await ChunkedResponse.open(req)
                    guard (200..<300).contains(http.statusCode) else {
                        if http.statusCode == 401 { throw APIError.unauthorized }
                        var body = Data()
                        for try await chunk in chunks { body.append(chunk) }
                        let message = String(data: body, encoding: .utf8)?
                            .trimmingCharacters(in: .whitespacesAndNewlines)
                        throw APIError.server(message?.isEmpty == false ? message! : "Something went wrong.")
                    }

                    if let id = http.value(forHTTPHeaderField: "x-conversation-id") {
                        continuation.yield(.conversationId(id))
                    }

                    var decoder = IncrementalUTF8()
                    for try await chunk in chunks {
                        if let text = decoder.decode(chunk), !text.isEmpty {
                            continuation.yield(.text(text))
                        }
                    }
                    if let tail = decoder.flush(), !tail.isEmpty {
                        continuation.yield(.text(tail))
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in work.cancel() }
        }
    }

    private struct ChatRequest: Encodable {
        let conversationId: String?
        let tradition: String
        let message: String
        let deep: Bool
    }

    private static func check(_ response: URLResponse, _ data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        switch http.statusCode {
        case 200..<300: return
        case 401: throw APIError.unauthorized
        default:
            let message = String(data: data, encoding: .utf8) ?? "Something went wrong."
            throw APIError.server(message)
        }
    }
}

// MARK: - Chunked responses

/// A response whose body arrives as a stream of `Data` chunks.
///
/// `open` returns once the headers are in, so the status and the
/// conversation id can be read before the first byte of the body. Each
/// delegate callback becomes one element of the stream; cancelling the
/// consuming task cancels the request.
enum ChunkedResponse {
    static func open(_ request: URLRequest) async throws -> (HTTPURLResponse, AsyncThrowingStream<Data, Error>) {
        let delegate = Delegate()
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        delegate.session = session
        let task = session.dataTask(with: request)
        delegate.task = task

        let chunks = AsyncThrowingStream<Data, Error> { continuation in
            delegate.continuation = continuation
            continuation.onTermination = { _ in
                task.cancel()
                session.finishTasksAndInvalidate()
            }
        }

        let response: HTTPURLResponse = try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { (headers: CheckedContinuation<HTTPURLResponse, Error>) in
                delegate.headers = headers
                task.resume()
            }
        } onCancel: {
            task.cancel()
        }

        return (response, chunks)
    }

    /// Bridges the delegate callbacks to the two continuations. All state is
    /// guarded by a lock because the callbacks arrive on the session's queue.
    private final class Delegate: NSObject, URLSessionDataDelegate {
        var session: URLSession?
        var task: URLSessionDataTask?

        private let lock = NSLock()
        private var _headers: CheckedContinuation<HTTPURLResponse, Error>?
        private var _continuation: AsyncThrowingStream<Data, Error>.Continuation?
        private var finished = false

        var headers: CheckedContinuation<HTTPURLResponse, Error>? {
            get { lock.withLock { _headers } }
            set { lock.withLock { _headers = newValue } }
        }

        var continuation: AsyncThrowingStream<Data, Error>.Continuation? {
            get { lock.withLock { _continuation } }
            set { lock.withLock { _continuation = newValue } }
        }

        func urlSession(
            _ session: URLSession,
            dataTask: URLSessionDataTask,
            didReceive response: URLResponse,
            completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
        ) {
            let pending = lock.withLock { () -> CheckedContinuation<HTTPURLResponse, Error>? in
                defer { _headers = nil }
                return _headers
            }
            if let http = response as? HTTPURLResponse {
                pending?.resume(returning: http)
                completionHandler(.allow)
            } else {
                pending?.resume(throwing: SancharaAPI.APIError.server("The stars are unreachable right now."))
                completionHandler(.cancel)
            }
        }

        func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
            continuation?.yield(data)
        }

        func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
            let (pending, stream) = lock.withLock { () -> (CheckedContinuation<HTTPURLResponse, Error>?, AsyncThrowingStream<Data, Error>.Continuation?) in
                guard !finished else { return (nil, nil) }
                finished = true
                defer { _headers = nil; _continuation = nil }
                return (_headers, _continuation)
            }
            if let error {
                // A failure before the headers arrived fails the open; after,
                // it fails the stream.
                if let pending {
                    pending.resume(throwing: error)
                } else {
                    stream?.finish(throwing: (error as NSError).code == NSURLErrorCancelled ? CancellationError() : error)
                }
            } else {
                pending?.resume(throwing: SancharaAPI.APIError.server("The reading ended before it began."))
                stream?.finish()
            }
            session.finishTasksAndInvalidate()
        }
    }
}

/// Decodes UTF-8 that arrives in arbitrary pieces, holding back an incomplete
/// multi-byte sequence at the end of a piece until the next one completes it.
struct IncrementalUTF8 {
    private var buffer = Data()

    /// The text that is complete so far, or nil if nothing decodes yet.
    mutating func decode(_ data: Data) -> String? {
        buffer.append(data)
        // A UTF-8 scalar is at most four bytes, so at most three can be
        // dangling. Try the whole buffer, then progressively shorter prefixes.
        for cut in 0...min(3, buffer.count) {
            let end = buffer.count - cut
            if end == 0 { return nil }
            if let text = String(data: buffer.prefix(end), encoding: .utf8) {
                buffer.removeFirst(end)
                return text
            }
        }
        return nil
    }

    /// Whatever is left, decoded leniently (an invalid tail becomes U+FFFD
    /// rather than being lost).
    mutating func flush() -> String? {
        defer { buffer.removeAll() }
        guard !buffer.isEmpty else { return nil }
        return String(decoding: buffer, as: UTF8.self)
    }
}

/// A birthplace from `/api/geocode`, already carrying the resolved timezone.
struct GeoResult: Decodable, Identifiable, Hashable {
    let name: String
    let lat: Double
    let lng: Double
    let timezone: String
    let country: String

    var id: String { "\(name)|\(lat)|\(lng)" }
}

struct BirthProfileInput {
    var firstName = ""
    var lastName = ""
    /// `yyyy-MM-dd`, matching the `birth_date` column.
    var birthDate = ""
    /// `HH:mm`, matching the `birth_time` column.
    var birthTime = ""
    var placeName = ""
    var lat: Double = 0
    var lng: Double = 0
    var timezone = ""
    /// Optional profile photo, already downscaled to JPEG. The route uploads it
    /// to the `avatars` bucket and only overwrites the stored URL when one is
    /// sent, so leaving this nil keeps the existing photo.
    var photoJPEG: Data?

    func multipartBody(boundary: String) -> Data {
        var body = Data()
        func append(_ text: String) { body.append(Data(text.utf8)) }

        let fields: [(String, String)] = [
            ("first_name", firstName),
            ("last_name", lastName),
            ("birth_date", birthDate),
            ("birth_time", birthTime),
            ("place_name", placeName),
            ("lat", String(lat)),
            ("lng", String(lng)),
            ("timezone", timezone),
        ]
        for (name, value) in fields {
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            append("\(value)\r\n")
        }
        if let photoJPEG, !photoJPEG.isEmpty {
            append("--\(boundary)\r\n")
            append("Content-Disposition: form-data; name=\"photo\"; filename=\"avatar.jpg\"\r\n")
            append("Content-Type: image/jpeg\r\n\r\n")
            body.append(photoJPEG)
            append("\r\n")
        }
        append("--\(boundary)--\r\n")
        return body
    }
}
