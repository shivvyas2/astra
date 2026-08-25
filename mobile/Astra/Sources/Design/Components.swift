import SwiftUI

/// Form field matching the site's input: `bg-white/[0.04]`, `border-white/10`,
/// `rounded-lg`, and 16pt text (the web forces 16px on phones so iOS Safari
/// does not zoom on focus — native has no such bug, but the size is the look).
struct AstraField: View {
    let placeholder: String
    @Binding var text: String
    var isSecure = false
    var keyboard: UIKeyboardType = .default
    var textContentType: UITextContentType?

    var body: some View {
        Group {
            if isSecure {
                SecureField("", text: $text, prompt: prompt)
            } else {
                TextField("", text: $text, prompt: prompt)
            }
        }
        .font(.system(size: 16))
        .foregroundStyle(Theme.fg)
        .keyboardType(keyboard)
        .textContentType(textContentType)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .background(Theme.fieldFill)
        .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.cornerRadius)
                .stroke(Theme.hairline, lineWidth: 1)
        )
    }

    private var prompt: Text {
        Text(placeholder).foregroundStyle(Theme.muted)
    }
}

/// The site's primary button: `bg-fg text-bg rounded-lg`.
struct AstraPrimaryButton: View {
    let title: String
    var isLoading = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .opacity(isLoading ? 0 : 1)
                if isLoading {
                    ProgressView().tint(Theme.bg)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.fg)
            .foregroundStyle(Theme.bg)
            .clipShape(RoundedRectangle(cornerRadius: Theme.cornerRadius))
        }
        .disabled(isLoading)
    }
}

/// The site's secondary button: `border-white/15`, muted text.
struct AstraSecondaryButton: View {
    let title: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(Theme.muted)
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.cornerRadius)
                        .stroke(Color.white.opacity(0.15), lineWidth: 1)
                )
        }
    }
}
