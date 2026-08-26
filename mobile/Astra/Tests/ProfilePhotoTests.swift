import UIKit
import XCTest
@testable import Astra

/// The photo travels as one part of the same multipart POST the birth details
/// use, so these guard the contract with `/api/profile`: it only overwrites the
/// stored avatar when a `photo` part is present.
final class ProfilePhotoTests: XCTestCase {

    private func image(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    func testDownscalesLargePhotos() throws {
        let jpeg = try XCTUnwrap(image(width: 3000, height: 2000).avatarJPEG())
        let decoded = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(max(decoded.size.width, decoded.size.height), 1024, accuracy: 1)
        XCTAssertEqual(decoded.size.width / decoded.size.height, 1.5, accuracy: 0.01, "aspect ratio should survive")
        XCTAssertLessThan(jpeg.count, 500_000, "an upload this size should be well under half a megabyte")
    }

    func testLeavesSmallPhotosAlone() throws {
        let jpeg = try XCTUnwrap(image(width: 400, height: 400).avatarJPEG())
        let decoded = try XCTUnwrap(UIImage(data: jpeg))
        XCTAssertEqual(decoded.size.width, 400, accuracy: 1, "no upscaling")
    }

    func testMultipartCarriesThePhotoWhenOneIsPicked() throws {
        let jpeg = try XCTUnwrap(image(width: 200, height: 200).avatarJPEG())
        var input = BirthProfileInput()
        input.firstName = "Shiv"
        input.timezone = "Asia/Kolkata"
        input.photoJPEG = jpeg

        let body = input.multipartBody(boundary: "test-boundary")
        let disposition = Data("Content-Disposition: form-data; name=\"photo\"; filename=\"avatar.jpg\"".utf8)
        XCTAssertNotNil(body.range(of: disposition), "the photo part must be named `photo`")
        XCTAssertNotNil(body.range(of: Data("Content-Type: image/jpeg".utf8)))
        XCTAssertNotNil(body.range(of: jpeg), "the image bytes themselves must be in the body")
        XCTAssertNotNil(body.range(of: Data("name=\"first_name\"".utf8)), "text fields still travel")
        XCTAssertNotNil(body.range(of: Data("--test-boundary--\r\n".utf8)), "body must be terminated")
    }

    func testMultipartOmitsThePhotoPartWhenNoneIsPicked() {
        var input = BirthProfileInput()
        input.firstName = "Shiv"

        let body = input.multipartBody(boundary: "test-boundary")
        XCTAssertNil(
            body.range(of: Data("name=\"photo\"".utf8)),
            "sending an empty photo part would clear a profile photo the user meant to keep"
        )
        XCTAssertNotNil(body.range(of: Data("name=\"first_name\"".utf8)))
    }
}
