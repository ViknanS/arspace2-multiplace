import SwiftUI
import UIKit

/// ARSpace colours (the same tokens as the website's CSS variables).
enum Theme {
    static let bg = Color(red: 0x0b / 255, green: 0x10 / 255, blue: 0x20 / 255) // --bg
    static let surface = Color(red: 0x15 / 255, green: 0x1d / 255, blue: 0x30 / 255) // --surface
    static let accent = Color(red: 0x6c / 255, green: 0x8c / 255, blue: 0xff / 255) // --accent
    static let accent2 = Color(red: 0x9d / 255, green: 0x7b / 255, blue: 0xff / 255) // --accent-2
    static let text = Color(red: 0xf8 / 255, green: 0xfa / 255, blue: 0xfc / 255)
    static let muted = Color(red: 0xa8 / 255, green: 0xb3 / 255, blue: 0xc7 / 255)
    static let ok = Color(red: 0x4a / 255, green: 0xde / 255, blue: 0x80 / 255)
    static let warn = Color(red: 0xfb / 255, green: 0xbf / 255, blue: 0x24 / 255)
    static let danger = Color(red: 1, green: 0x7a / 255, blue: 0x8a / 255)
    static let accentUI = UIColor(red: 0x6c / 255, green: 0x8c / 255, blue: 0xff / 255, alpha: 1)

    static let gradient = LinearGradient(colors: [accent, accent2], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let panel = Color(red: 0x0b / 255, green: 0x10 / 255, blue: 0x20 / 255).opacity(0.72)
}

/// Rounded pill buttons used over the camera view (at least 48 pt tall).
struct PillButtonStyle: ButtonStyle {
    enum Kind { case primary, normal, ghost, danger }
    var kind: Kind
    @Environment(\.isEnabled) private var isEnabled

    init(kind: Kind = .normal) {
        self.kind = kind
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 16, weight: .semibold))
            .lineLimit(1)
            .padding(.horizontal, 16)
            .frame(minHeight: 48)
            .foregroundStyle(kind == .primary ? Theme.bg : (kind == .danger ? Theme.danger : Theme.text))
            .background {
                if kind == .primary {
                    Capsule().fill(Theme.gradient)
                } else {
                    Capsule().fill(Theme.bg.opacity(kind == .ghost ? 0.55 : 0.82))
                        .overlay(Capsule().strokeBorder(.white.opacity(0.2)))
                }
            }
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct RoundIconButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 18, weight: .semibold))
            .frame(width: 48, height: 48)
            .foregroundStyle(Theme.text)
            .background(Circle().fill(Theme.bg.opacity(0.82)).overlay(Circle().strokeBorder(.white.opacity(0.2))))
            .opacity(isEnabled ? 1 : 0.4)
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
    }
}
