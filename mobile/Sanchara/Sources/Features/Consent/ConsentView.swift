import SwiftUI

/// The AI consent screen: what is sent, to whom, what is kept, and the
/// user's choices, then "Agree and continue" or "Not now". "Not now" is
/// never a dead end: the chart and the rest of the app stay open, and this
/// explains why readings need it and offers the notice again.
///
/// `mode: .review` is the same notice opened from Profile, with no decision
/// to make.
struct ConsentView: View {
    enum Mode { case decide, review }

    var mode: Mode = .decide
    var isSaving = false
    var errorMessage: String? = nil
    var onAgree: () -> Void = {}
    /// Leaves Ask for the rest of the app.
    var onNotNow: () -> Void = {}

    @State private var declined = false
    @State private var legalPage: LegalPage?

    var body: some View {
        ZStack {
            Atmosphere(mood: .dusk)
            if declined {
                declinedBody
                    .transition(.opacity)
            } else {
                notice
                    .transition(.opacity)
            }
        }
        .animation(Theme.ease, value: declined)
    }

    // MARK: Notice

    private var notice: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                ScreenHeader(
                    eyebrow: ConsentCopy.eyebrow,
                    title: ConsentCopy.title,
                    blurb: ConsentCopy.intro,
                    titleSize: 40
                )

                VStack(spacing: 0) {
                    BrutDivider()
                    ForEach(ConsentCopy.sections) { section in
                        sectionRow(section)
                        BrutDivider()
                    }
                }

                Button {
                    legalPage = .privacy
                } label: {
                    HStack(spacing: 6) {
                        Text("Read the full privacy policy")
                        Image(systemName: "arrow.up.right").font(.scaled(size: 11, weight: .semibold))
                    }
                    .font(.scaled(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.fg)
                    .frame(minHeight: 44)
                }
                .legalSheet($legalPage)
                .buttonStyle(DipButtonStyle())
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 16)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollIndicators(.hidden)
        .safeAreaInset(edge: .bottom) {
            if mode == .decide { decisionBar }
        }
    }

    private func sectionRow(_ section: ConsentCopy.Section) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 16) {
            Text(section.label)
                .font(.brutMono(11, weight: .bold))
                .textCase(.uppercase)
                .tracking(1.3)
                .foregroundStyle(Theme.accent)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .frame(width: 60, alignment: .leading)
            VStack(alignment: .leading, spacing: 10) {
                Text(section.title)
                    .font(.brutTitle(18))
                    .foregroundStyle(Theme.fg)
                ForEach(section.points, id: \.self) { point in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Circle()
                            .fill(Theme.fg.opacity(0.5))
                            .frame(width: 4, height: 4)
                            .alignmentGuide(.firstTextBaseline) { d in d[VerticalAlignment.center] + 4 }
                        Text(point)
                            .font(.brutBody(14))
                            .foregroundStyle(Theme.muted)
                            .lineSpacing(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 18)
        .accessibilityElement(children: .combine)
    }

    private var decisionBar: some View {
        VStack(spacing: 10) {
            if let errorMessage {
                BrutNotice(text: errorMessage)
            }
            SancharaPrimaryButton(title: ConsentCopy.agree, isLoading: isSaving, action: onAgree)
            SancharaSecondaryButton(title: ConsentCopy.notNow) { declined = true }
                .disabled(isSaving)
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 8)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
        .background {
            LinearGradient(
                stops: [.init(color: Theme.bg.opacity(0), location: 0), .init(color: Theme.bg, location: 0.28)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        }
    }

    // MARK: Not now

    private var declinedBody: some View {
        VStack(alignment: .leading, spacing: 28) {
            Spacer(minLength: 0)
            ScreenHeader(
                eyebrow: L10n.string("Nothing was sent"),
                title: ConsentCopy.declinedTitle,
                blurb: ConsentCopy.declinedBody,
                accent: Theme.ember,
                titleSize: 40
            )
            VStack(spacing: 10) {
                SancharaPrimaryButton(title: ConsentCopy.reviewAgain) { declined = false }
                Button("Keep exploring without readings", action: onNotNow)
                    .buttonStyle(BrutButtonStyle(kind: .quiet))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 24)
        .frame(maxWidth: 520)
        .frame(maxWidth: .infinity)
    }
}

/// Shows the consent screen in place of `content` until the account has
/// agreed to the current notice. Wraps Ask in MainTabView; the photo that
/// opens You normally lives in Ask's header, so it is kept here too.
struct ConsentGate<Content: View>: View {
    var onNotNow: () -> Void
    var onYou: () -> Void
    @ViewBuilder var content: () -> Content

    @State private var consent = ConsentStore.shared

    var body: some View {
        Group {
            switch consent.state {
            case .checking:
                LoadingScreen()
            case .needed:
                ConsentView(
                    isSaving: consent.isSaving,
                    errorMessage: consent.errorMessage,
                    onAgree: { Task { await consent.agree() } },
                    onNotNow: onNotNow
                )
                .overlay(alignment: .topTrailing) {
                    CircleButton(systemImage: "person", label: L10n.string("You"), size: 38, action: onYou)
                        .padding(.horizontal, 20)
                        .padding(.top, 12)
                }
                .clearsTabBar()
            case .accepted:
                content()
            }
        }
    }
}
