//  RemoteBrowserView.swift
//  Phase 11 — Native iOS remote-browser view + supervised takeover.
//
//  Reference SwiftUI implementation for the Concierge mobile app. It mirrors the web
//  widget (src/app/remoteBrowser.js): a live MJPEG-over-SSE view of the dedicated
//  OpenClaw worker browser, with an explicit, audited takeover that relays the user's
//  OWN keyboard/taps (password, captcha, 2FA) into the portal.
//
//  Safety: the autonomous agent never types credentials. This view only forwards human
//  input through /api/runtime/browser/takeover/input after the user taps "Take over"
//  (which the server records as an interactive_takeover approval gate). Keystroke values
//  are never persisted server-side.
//
//  Drop into an iOS app target (iOS 16+). Point `baseURL` at the FastAPI facade or the
//  Node runtime, and pass the authenticated session/user ids.

import SwiftUI
import UIKit

// MARK: - Wire models

struct RemoteInput: Encodable {
    let kind: String            // "key" | "text" | "mouse" | "scroll"
    var type: String?           // CDP event type, e.g. "mousePressed", "keyDown"
    var text: String?
    var key: String?
    var code: String?
    var keyCode: Int?
    var x: Double?              // normalized 0...1
    var y: Double?
    var button: String?
    var clickCount: Int?
}

struct TakeoverRequestResult: Decodable { let ok: Bool; let takeoverId: String?; let status: String? }
struct TakeoverGrantResult: Decodable { let ok: Bool; let grantToken: String?; let status: String?; let expiresAt: String? }
struct SimpleResult: Decodable { let ok: Bool; let status: String? }
struct StartResult: Decodable { let ok: Bool; let status: String?; let targetUrl: String? }

// MARK: - Client

@MainActor
final class RemoteBrowserClient: ObservableObject {
    @Published var currentFrame: UIImage?
    @Published var status: String = "Idle. Start the live view to watch the worker browser."
    @Published var inControl = false

    private let baseURL: URL
    private let sessionId: String
    private let userId: String?
    private let authToken: String?

    private var takeoverId: String?
    private var grantToken: String?
    private var streamTask: Task<Void, Never>?

    init(baseURL: URL, sessionId: String, userId: String? = nil, authToken: String? = nil) {
        self.baseURL = baseURL
        self.sessionId = sessionId
        self.userId = userId
        self.authToken = authToken
    }

    // MARK: Live frames (SSE)

    func startLiveView() async {
        status = "Starting live view…"
        let body: [String: Any] = ["sessionId": sessionId, "userId": userId as Any]
        guard let result: StartResult = try? await post("/api/runtime/browser/screencast/start", body), result.ok else {
            status = "Could not start live view."
            return
        }
        status = "Live view of \(result.targetUrl ?? "worker browser") — read-only."
        startFrameStream()
    }

    private func startFrameStream() {
        streamTask?.cancel()
        streamTask = Task { [weak self] in
            guard let self else { return }
            var components = URLComponents(url: self.baseURL.appendingPathComponent("/api/runtime/browser/frames/stream"), resolvingAgainstBaseURL: false)!
            components.queryItems = [URLQueryItem(name: "sessionId", value: self.sessionId)]
                + (self.userId.map { [URLQueryItem(name: "userId", value: $0)] } ?? [])
            var request = URLRequest(url: components.url!)
            request.timeoutInterval = 3600
            self.authToken.map { request.setValue("Bearer \($0)", forHTTPHeaderField: "Authorization") }
            do {
                let (bytes, _) = try await URLSession.shared.bytes(for: request)
                var dataLine = ""
                for try await line in bytes.lines {
                    if line.hasPrefix("data:") {
                        dataLine = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                    } else if line.isEmpty, !dataLine.isEmpty {
                        self.handleFrameEvent(dataLine)
                        dataLine = ""
                    }
                }
            } catch {
                await MainActor.run { self.status = "Live view reconnecting…" }
            }
        }
    }

    private func handleFrameEvent(_ json: String) {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let b64 = obj["data"] as? String,
              let imgData = Data(base64Encoded: b64),
              let image = UIImage(data: imgData) else { return }
        Task { @MainActor in self.currentFrame = image }
    }

    // MARK: Takeover

    func takeControl() async {
        status = "Requesting control…"
        let reqBody: [String: Any] = ["sessionId": sessionId, "userId": userId as Any, "reason": "user_password_or_captcha"]
        guard let req: TakeoverRequestResult = try? await post("/api/runtime/browser/takeover/request", reqBody),
              req.ok, let id = req.takeoverId else { status = "Takeover request failed."; return }
        takeoverId = id
        let grantBody: [String: Any] = ["takeoverId": id, "sessionId": sessionId, "userId": userId as Any, "approvedBy": "user"]
        guard let grant: TakeoverGrantResult = try? await post("/api/runtime/browser/takeover/grant", grantBody),
              grant.ok, let token = grant.grantToken else { status = "Takeover not granted."; return }
        grantToken = token
        inControl = true
        status = "You have control. Tap the page to focus a field, then type your password or captcha."
    }

    func returnControl() async {
        if let id = takeoverId {
            _ = try? await post("/api/runtime/browser/takeover/end", ["takeoverId": id, "reason": "user_returned_control"]) as SimpleResult?
        }
        takeoverId = nil; grantToken = nil; inControl = false
        status = "Control returned to the assistant. Live view continues (read-only)."
    }

    func relay(_ input: RemoteInput) async {
        guard inControl, let id = takeoverId, let token = grantToken else { return }
        let payload: [String: Any] = [
            "takeoverId": id, "grantToken": token, "sessionId": sessionId, "userId": userId as Any,
            "input": (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(input))) as Any
        ]
        _ = try? await post("/api/runtime/browser/takeover/input", payload) as SimpleResult?
    }

    // Tap on the live image at a normalized point -> remote click (focuses fields).
    func tap(atNormalized point: CGPoint) async {
        await relay(RemoteInput(kind: "mouse", type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1))
        await relay(RemoteInput(kind: "mouse", type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1))
    }

    func sendText(_ text: String) async { await relay(RemoteInput(kind: "text", text: text)) }
    func sendEnter() async {
        await relay(RemoteInput(kind: "key", type: "keyDown", key: "Enter", code: "Enter", keyCode: 13))
        await relay(RemoteInput(kind: "key", type: "keyUp", key: "Enter", code: "Enter", keyCode: 13))
    }

    // MARK: HTTP

    private func post<T: Decodable>(_ path: String, _ body: [String: Any]) async throws -> T {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        authToken.map { request.setValue("Bearer \($0)", forHTTPHeaderField: "Authorization") }
        request.httpBody = try JSONSerialization.data(withJSONObject: body.compactMapValues { $0 is NSNull ? nil : $0 })
        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - View

struct RemoteBrowserView: View {
    @StateObject var client: RemoteBrowserClient
    @State private var relayText: String = ""
    @FocusState private var relayFocused: Bool

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Text("Worker browser").font(.subheadline).foregroundStyle(.secondary)
                Spacer()
                if client.inControl {
                    Text("You are in control")
                        .font(.caption.bold()).padding(.horizontal, 8).padding(.vertical, 3)
                        .background(.orange, in: Capsule()).foregroundStyle(.black)
                }
            }

            GeometryReader { geo in
                ZStack {
                    Color.black
                    if let frame = client.currentFrame {
                        Image(uiImage: frame).resizable().scaledToFit()
                    } else {
                        ProgressView().tint(.white)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(client.inControl ? .orange : .clear, lineWidth: 2))
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onEnded { value in
                    guard client.inControl else { return }
                    let nx = max(0, min(1, value.location.x / geo.size.width))
                    let ny = max(0, min(1, value.location.y / geo.size.height))
                    Task { await client.tap(atNormalized: CGPoint(x: nx, y: ny)); relayFocused = true }
                })
            }
            .aspectRatio(3.0 / 4.0, contentMode: .fit)

            controls
            if client.inControl { relayBar }
            Text(client.status).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
    }

    private var controls: some View {
        HStack {
            if client.currentFrame == nil {
                Button("Start live view") { Task { await client.startLiveView() } }.buttonStyle(.borderedProminent)
            } else if !client.inControl {
                Button("Take over (password / captcha)") { Task { await client.takeControl() } }.buttonStyle(.borderedProminent)
            } else {
                Button("Return control") { Task { await client.returnControl(); relayText = "" } }
                    .buttonStyle(.bordered).tint(.orange)
            }
        }
    }

    // Native keyboard relay. SecureField keeps the password off-screen on the phone;
    // each change is forwarded as insertText, so the value reaches only the portal.
    private var relayBar: some View {
        HStack(spacing: 8) {
            SecureField("Type password / captcha", text: $relayText)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .textFieldStyle(.roundedBorder).focused($relayFocused)
                .onChange(of: relayText) { _, newValue in
                    Task { await client.sendText(String(newValue.suffix(1))) } // forward the new character
                }
            Button("Enter") { Task { await client.sendEnter(); relayText = "" } }
                .buttonStyle(.borderedProminent).tint(.green)
        }
    }
}
