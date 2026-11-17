// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "PainelFicticio",
  platforms: [.iOS(.v17)],
  dependencies: [
    .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.10.0"),
  ],
  targets: [
    .target(name: "PainelFicticio", dependencies: [
      .product(name: "ComposableArchitecture", package: "swift-composable-architecture"),
    ]),
    .testTarget(name: "PainelFicticioTests", dependencies: ["PainelFicticio"]),
  ]
)
