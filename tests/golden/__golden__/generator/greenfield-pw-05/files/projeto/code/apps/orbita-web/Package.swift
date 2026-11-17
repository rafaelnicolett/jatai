// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "Orbita",
  platforms: [.iOS(.v17)],
  dependencies: [
    .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.10.0"),
  ],
  targets: [
    .target(name: "Orbita", dependencies: [
      .product(name: "ComposableArchitecture", package: "swift-composable-architecture"),
    ]),
    .testTarget(name: "OrbitaTests", dependencies: ["Orbita"]),
  ]
)
