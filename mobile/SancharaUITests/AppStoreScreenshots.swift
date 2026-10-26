import XCTest

/// Walks a simulator that is already signed in through the screens used for
/// the App Store listing and writes each one to `SHOTS_DIR` as a PNG.
///
/// Run with `TEST_RUNNER_SHOTS_DIR=/some/dir xcodebuild test
/// -only-testing:SancharaUITests …`. Without it the test skips, so it never
/// runs as part of the ordinary suite. It never signs in: sign in by hand
/// first, and the session in the simulator's keychain carries over.
final class AppStoreScreenshots: XCTestCase {
    private var app: XCUIApplication!
    private var dir: URL!

    override func setUpWithError() throws {
        guard let path = ProcessInfo.processInfo.environment["SHOTS_DIR"] else {
            throw XCTSkip("SHOTS_DIR not set")
        }
        dir = URL(fileURLWithPath: path)
        continueAfterFailure = true
        app = XCUIApplication()
        app.launch()
    }

    func testCaptureListingScreens() throws {
        let skip = app.buttons["Skip"]
        if skip.waitForExistence(timeout: 8) { skip.tap() }
        // The AI consent screen, when the account has not agreed yet.
        let agree = app.buttons["Agree and continue"]
        if agree.waitForExistence(timeout: 4) { agree.tap() }

        XCTAssertTrue(tab("Today").waitForExistence(timeout: 20), "Not signed in, or the tab bar is missing")
        tab("Today").tap()
        sleep(6)
        shoot("02-today")

        tab("Ask").tap()
        sleep(2)
        shoot("07-ask-home")
        // Asking costs a reading; set SHOTS_SKIP_ASK to keep the one already taken.
        let field = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        if ProcessInfo.processInfo.environment["SHOTS_SKIP_ASK"] == nil, field.waitForExistence(timeout: 10) {
            field.tap()
            field.typeText(ProcessInfo.processInfo.environment["SHOTS_QUESTION"] ?? "Will I change jobs next year?")
            // The composer's Send; the keyboard can carry a second one.
            let send = app.buttons.matching(identifier: "Send").allElementsBoundByIndex.first { $0.isHittable }
            send?.tap()
            // The kundli loader, before the first words arrive.
            if app.staticTexts["Reading your chart…"].waitForExistence(timeout: 5) {
                shoot("03a-ask-reading")
            }
            // Long enough for the reading to stream to the end.
            sleep(50)
            shoot("03-ask")
            // The top of the answer, where the kundli seal sits.
            app.swipeDown(velocity: .slow)
            sleep(1)
            shoot("03b-ask-top")
        }

        tab("Kundli").tap()
        sleep(4)
        // Bring the chart drawing up from behind the tab bar.
        app.swipeUp(velocity: .slow)
        sleep(2)
        shoot("04-kundli")

        tab("Life").tap()
        sleep(5)
        shoot("05-life")

        tab("You").tap()
        let row = app.buttons.containing(NSPredicate(format: "label CONTAINS[c] %@", "Text size and display")).firstMatch
        for _ in 0..<6 where !row.isHittable { app.swipeUp() }
        if row.waitForExistence(timeout: 5) {
            row.tap()
            sleep(2)
            shoot("06-accessibility")
        }
    }

    /// Reopens the oldest reading from Past readings and captures its top,
    /// seal and all. Asks nothing, so it costs no reading; later answers to
    /// the same account refer back to earlier ones, which reads oddly in a
    /// store screenshot.
    func testCaptureFirstReading() throws {
        let skip = app.buttons["Skip"]
        if skip.waitForExistence(timeout: 8) { skip.tap() }
        XCTAssertTrue(tab("Ask").waitForExistence(timeout: 20))
        tab("Ask").tap()
        let seeAll = app.buttons["See all"]
        for _ in 0..<4 where !seeAll.isHittable { app.swipeUp() }
        seeAll.tap()
        let rows = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "change jobs")).allElementsBoundByIndex
        try XCTUnwrap(rows.last, "No earlier reading about changing jobs").tap()
        sleep(3)
        for _ in 0..<3 { app.swipeDown(velocity: .fast) }
        sleep(1)
        shoot("03c-first-reading-top")
    }

    /// The You tab's app icon picker.
    func testCaptureIconPicker() throws {
        let skip = app.buttons["Skip"]
        if skip.waitForExistence(timeout: 8) { skip.tap() }
        XCTAssertTrue(tab("You").waitForExistence(timeout: 20))
        tab("You").tap()
        let picker = app.staticTexts["App icon"]
        for _ in 0..<8 where !picker.isHittable { app.swipeUp(velocity: .slow) }
        sleep(1)
        shoot("08-icon-picker")
    }

    private func tab(_ title: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label CONTAINS %@", title)).firstMatch
    }

    private func shoot(_ name: String) {
        let png = XCUIScreen.main.screenshot().pngRepresentation
        try? png.write(to: dir.appendingPathComponent("\(name).png"))
        let attachment = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
