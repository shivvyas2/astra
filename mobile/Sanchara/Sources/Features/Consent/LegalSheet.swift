import SafariServices
import SwiftUI

/// The two legal pages. The site is their one source of truth; the app shows
/// them in a sheet so reading them never leaves Astrya.
enum LegalPage: String, Identifiable {
    case terms, privacy

    var id: String { rawValue }

    var url: URL {
        switch self {
        case .terms: ConsentCopy.termsURL
        case .privacy: ConsentCopy.privacyURL
        }
    }

    var title: String {
        switch self {
        case .terms: L10n.string("Terms of use")
        case .privacy: L10n.string("Privacy policy")
        }
    }

    /// Which page a tapped link points at, if it is one of these.
    init?(url: URL) {
        guard let page = [LegalPage.terms, .privacy].first(where: { $0.url == url }) else { return nil }
        self = page
    }
}

/// A legal page in Safari's in-app reader, tinted to the app.
struct LegalSheet: UIViewControllerRepresentable {
    let page: LegalPage

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: page.url)
        controller.preferredControlTintColor = UIColor(Theme.accent)
        controller.preferredBarTintColor = UIColor(Theme.bg)
        controller.dismissButtonStyle = .done
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

extension View {
    /// Opens Terms and Privacy links tapped anywhere inside this view in a
    /// sheet, and presents `page` when it is set directly.
    func legalSheet(_ page: Binding<LegalPage?>) -> some View {
        self
            .environment(\.openURL, OpenURLAction { url in
                guard let legal = LegalPage(url: url) else { return .systemAction }
                page.wrappedValue = legal
                return .handled
            })
            .sheet(item: page) { LegalSheet(page: $0).ignoresSafeArea() }
    }
}
