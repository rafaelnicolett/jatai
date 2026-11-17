/**
 * GreenfieldScaffolder.ts
 *
 * O scaffold local do projeto greenfield (F3.4, passo 6): docs, features BDD,
 * contrato OpenAPI, código (backend por stack × arquitetura, frontend) e
 * infraestrutura. O texto vem das funções puras de `../content/`; aqui fica
 * só a escrita no disco. O kit de agentes é do `KitInstaller`.
 */

import * as path from "path";
import * as fs from "fs/promises";
import type { WizardState } from "../../types";
import { BRAND } from "../../data/brand.pure";
import { copyDirIfExists, copyFileIfExists } from "../fs/copy";
import { kitRoot } from "../install/kit-root";
import { buildBoundedContexts, buildContextMap, buildDocsReadme, buildEventStorming, buildExampleFeature, buildOpenAPIContract } from "../content/docs";
import { buildBackendDockerfile, buildBackendMain, buildBackendReadme, buildDotnetCsproj, buildDotnetProgram, buildDotnetSln, buildPomXml, buildPyprojectToml, getBackendDirs } from "../content/backend";
import { buildFrontendReadme } from "../content/frontend";
import { buildCIPipeline, buildDockerCompose } from "../content/infra";

export class GreenfieldScaffolder {
  /** Docs, features, API, código e infra, nesta ordem (a mesma de antes). */
  async scaffold(dir: string, state: WizardState): Promise<void> {
    // 2. Documentation (ADRs, architecture, domain model)
    await this._generateDocumentation(dir, state);

    // 3. BDD features
    await this._generateFeatures(dir, state);

    // 4. API contracts
    await this._generateAPI(dir, state);

    // 5. Code scaffold (hexagonal backend + frontend)
    await this._generateCodeScaffold(dir, state);

    // 6. Infrastructure & pipelines
    await this._generateInfrastructure(dir, state);
  }

  /**
   * Generates docs/adr/, docs/architecture/, docs/domain/ adapted to project.
   */
  private async _generateDocumentation(dir: string, state: WizardState): Promise<void> {
    const tmplRoot = kitRoot("templates");

    // Seed apenas ADRs de referência genéricos (o template não carrega os ADRs
    // internos do Helyx). A fase @architecture produz os ADRs específicos do
    // projeto do cliente.
    await copyDirIfExists(
      path.join(tmplRoot, "docs/adr"),
      path.join(dir, "docs/adr")
    );

    // docs/architecture nasce vazio — a fase @architecture gera os C4 do projeto.
    await fs.mkdir(path.join(dir, "docs/architecture"), { recursive: true });

    // Generate domain model adapted to project
    await fs.mkdir(path.join(dir, "docs/domain"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "docs/domain/bounded-contexts.md"),
      buildBoundedContexts(state)
    );
    await fs.writeFile(
      path.join(dir, "docs/domain/context-map.md"),
      buildContextMap(state)
    );
    await fs.writeFile(
      path.join(dir, "docs/domain/event-storming.md"),
      buildEventStorming(state)
    );

    // Copy delivery flow docs
    await copyFileIfExists(
      path.join(tmplRoot, "docs/delivery-flow.md"),
      path.join(dir, "docs/delivery-flow.md")
    );
    await copyFileIfExists(
      path.join(tmplRoot, "docs/hierarchy.md"),
      path.join(dir, "docs/hierarchy.md")
    );
    await copyFileIfExists(
      path.join(tmplRoot, "docs/routing-rules.md"),
      path.join(dir, "docs/routing-rules.md")
    );

    // Main docs README
    await fs.writeFile(
      path.join(dir, "docs/README.md"),
      buildDocsReadme(state)
    );
  }

  /**
   * Generates features/ with BDD scenarios based on project domain.
   */
  private async _generateFeatures(dir: string, state: WizardState): Promise<void> {
    await fs.mkdir(path.join(dir, "features/support"), { recursive: true });
    
    // Copy support files from bundled templates
    await copyFileIfExists(
      path.join(kitRoot("templates"), "features/support/README.md"),
      path.join(dir, "features/support/README.md")
    );

    // Generate example feature based on domain
    await fs.writeFile(
      path.join(dir, `features/${state.projectName}.feature`),
      buildExampleFeature(state)
    );
  }

  /**
   * Generates api/openapi.yaml with complete contract structure.
   */
  private async _generateAPI(dir: string, state: WizardState): Promise<void> {
    await fs.mkdir(path.join(dir, "api"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "api/openapi.yaml"),
      buildOpenAPIContract(state)
    );
  }

  /**
   * Generates code/ with stack-correct backend structure + frontend (if selected).
   * Each backend stack gets its own directory layout and seed files.
   */
  private async _generateCodeScaffold(dir: string, state: WizardState): Promise<void> {
    const slug = state.projectName;
    const backendDir = path.join(dir, `code/services/${slug}-api`);

    // Directories depend on both stack and architecture
    const backendDirs = getBackendDirs(state.backendArchitecture, state.backendStack);
    for (const d of backendDirs) {
      await fs.mkdir(path.join(backendDir, d), { recursive: true });
    }

    await fs.writeFile(path.join(backendDir, "README.md"), buildBackendReadme(state));
    await fs.writeFile(path.join(backendDir, "Dockerfile"), buildBackendDockerfile(state));

    // Stack-specific seed files
    switch (state.backendStack) {
      case "java-spring":
        await this._seedJavaSpring(backendDir, state);
        break;
      case "dotnet-core":
        await this._seedDotnet(backendDir, state);
        break;
      case "python-agentic":
        await this._seedPythonAgentic(backendDir, state);
        break;
      case "python-api":
      default:
        await this._seedPythonApi(backendDir, state);
        break;
    }

    // Frontend scaffold (if selected)
    if (state.frontendStack && state.frontendStack !== "none") {
      const frontendDir = path.join(dir, `code/apps/${slug}-web`);
      await fs.mkdir(frontendDir, { recursive: true });
      await this._seedFrontend(frontendDir, state);
    }
  }

  // ── Backend seed helpers (one per stack) ─────────────────────────────────

  private async _seedJavaSpring(dir: string, state: WizardState): Promise<void> {
    const pkg  = "com.example.app";
    const pkgPath = pkg.replace(/\./g, "/");
    const cls  = state.projectName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");

    await fs.writeFile(path.join(dir, "pom.xml"), buildPomXml(state));
    await fs.writeFile(
      path.join(dir, `src/main/java/${pkgPath}/${cls}Application.java`),
      `package ${pkg};\n\nimport org.springframework.boot.SpringApplication;\nimport org.springframework.boot.autoconfigure.SpringBootApplication;\n\n@SpringBootApplication\npublic class ${cls}Application {\n    public static void main(String[] args) {\n        SpringApplication.run(${cls}Application.class, args);\n    }\n}\n`
    );
    await fs.writeFile(
      path.join(dir, "src/main/resources/application.yaml"),
      `spring:\n  application:\n    name: ${state.projectName}\n  datasource:\n    url: jdbc:postgresql://localhost:5432/${state.projectName.replace(/-/g, "_")}\n    username: dev\n    password: dev\n\nserver:\n  port: 8080\n\nmanagement:\n  endpoints:\n    web:\n      exposure:\n        include: health,info,metrics,prometheus\n`
    );
    await fs.writeFile(path.join(dir, ".gitignore"), "target/\n.mvn/\n*.class\n*.jar\n");
  }

  private async _seedDotnet(dir: string, state: WizardState): Promise<void> {
    const ns  = state.projectName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");

    await fs.writeFile(path.join(dir, `${ns}.sln`), buildDotnetSln(state, ns));
    await fs.mkdir(path.join(dir, `src/${ns}.API`), { recursive: true });
    await fs.writeFile(
      path.join(dir, `src/${ns}.API/${ns}.API.csproj`),
      buildDotnetCsproj(state, ns)
    );
    await fs.writeFile(
      path.join(dir, `src/${ns}.API/Program.cs`),
      buildDotnetProgram(state, ns)
    );
    await fs.writeFile(
      path.join(dir, `src/${ns}.API/appsettings.json`),
      `{\n  "Logging": { "LogLevel": { "Default": "Information" } },\n  "AllowedHosts": "*",\n  "ConnectionStrings": {\n    "DefaultConnection": "Host=localhost;Database=${state.projectName};Username=dev;Password=dev"\n  }\n}\n`
    );
    await fs.writeFile(path.join(dir, ".gitignore"), "bin/\nobj/\n*.user\n.vs/\n");
  }

  private async _seedPythonApi(dir: string, state: WizardState): Promise<void> {
    await fs.writeFile(path.join(dir, "src/__init__.py"), "");
    await fs.writeFile(path.join(dir, "src/main.py"), buildBackendMain(state));
    await fs.writeFile(path.join(dir, "tests/__init__.py"), "");
    await fs.writeFile(path.join(dir, "pyproject.toml"), buildPyprojectToml(state, false));
    // Architecture-specific init files
    if (state.backendArchitecture === "hexagonal") {
      await fs.writeFile(path.join(dir, "src/domain/__init__.py"), "");
      await fs.writeFile(path.join(dir, "src/domain/model/__init__.py"), "");
    } else if (state.backendArchitecture === "ddd-tactical") {
      // ddd-tactical creates src/domain/aggregates, entities, value_objects, etc. — no model/
      await fs.writeFile(path.join(dir, "src/domain/__init__.py"), "");
    } else if (state.backendArchitecture === "vertical-slice") {
      await fs.writeFile(path.join(dir, "src/features/__init__.py"), "");
    } else if (state.backendArchitecture === "layered") {
      for (const mod of ["controllers", "services", "repositories"]) {
        await fs.writeFile(path.join(dir, `src/${mod}/__init__.py`), "");
      }
    }
    await fs.writeFile(path.join(dir, ".gitignore"), "__pycache__/\n*.pyc\n.venv/\ndist/\n.pytest_cache/\n");
  }

  private async _seedPythonAgentic(dir: string, state: WizardState): Promise<void> {
    // Ensure agentic-specific subdirectories exist before writing files into them
    await fs.mkdir(path.join(dir, "src/agents"), { recursive: true });
    await fs.mkdir(path.join(dir, "src/tools"), { recursive: true });
    await fs.mkdir(path.join(dir, "src/prompts"), { recursive: true });
    await fs.mkdir(path.join(dir, "tests"), { recursive: true });

    await fs.writeFile(path.join(dir, "src/__init__.py"), "");
    await fs.writeFile(
      path.join(dir, "src/main.py"),
      `"""${state.projectName} — Agentic entry point\nGenerated by ${BRAND.displayName}\n"""\n\nfrom fastapi import FastAPI\n\napp = FastAPI(title="${state.projectName}", version="0.1.0")\n\n@app.get("/health")\nasync def health():\n    return {"status": "ok"}\n\n# Agent graph will be defined by @backend-python-agentic during implementation\n`
    );
    await fs.writeFile(path.join(dir, "src/agents/__init__.py"), "");
    await fs.writeFile(path.join(dir, "src/tools/__init__.py"), "");
    await fs.writeFile(path.join(dir, "src/prompts/__init__.py"), "");
    await fs.writeFile(path.join(dir, "tests/__init__.py"), "");
    await fs.writeFile(path.join(dir, "pyproject.toml"), buildPyprojectToml(state, true));
    await fs.writeFile(path.join(dir, ".gitignore"), "__pycache__/\n*.pyc\n.venv/\ndist/\n.pytest_cache/\n");
  }

  // ── Frontend seed helpers ──────────────────────────────────────────────

  private async _seedFrontend(dir: string, state: WizardState): Promise<void> {
    await fs.writeFile(path.join(dir, "README.md"), buildFrontendReadme(state));

    switch (state.frontendStack) {
      case "react-vite":
        await this._seedReact(dir, state);
        break;
      case "flutter":
        await this._seedFlutter(dir, state);
        break;
      case "android-compose":
        await this._seedAndroid(dir, state);
        break;
      case "ios-swiftui":
        await this._seedIos(dir, state);
        break;
    }
  }

  private async _seedReact(dir: string, state: WizardState): Promise<void> {
    const name = state.projectName;
    await fs.mkdir(path.join(dir, "src/features"), { recursive: true });
    await fs.mkdir(path.join(dir, "src/shared"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "package.json"),
      `{\n  "name": "${name}-web",\n  "version": "0.1.0",\n  "private": true,\n  "type": "module",\n  "scripts": {\n    "dev": "vite",\n    "build": "tsc && vite build",\n    "lint": "eslint src",\n    "test": "vitest"\n  },\n  "dependencies": {\n    "react": "^18.3.0",\n    "react-dom": "^18.3.0"\n  },\n  "devDependencies": {\n    "@types/react": "^18.3.0",\n    "@types/react-dom": "^18.3.0",\n    "@vitejs/plugin-react": "^4.3.0",\n    "typescript": "^5.5.0",\n    "vite": "^5.4.0",\n    "vitest": "^2.1.0"\n  }\n}\n`
    );
    await fs.writeFile(
      path.join(dir, "vite.config.ts"),
      `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 3000 },\n});\n`
    );
    await fs.writeFile(
      path.join(dir, "tsconfig.json"),
      `{\n  "compilerOptions": {\n    "target": "ES2020",\n    "lib": ["ES2020","DOM","DOM.Iterable"],\n    "module": "ESNext",\n    "moduleResolution": "bundler",\n    "jsx": "react-jsx",\n    "strict": true,\n    "noUnusedLocals": true,\n    "noUnusedParameters": true\n  },\n  "include": ["src"]\n}\n`
    );
    await fs.writeFile(
      path.join(dir, "src/main.tsx"),
      `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode><App /></StrictMode>\n);\n`
    );
    await fs.writeFile(
      path.join(dir, "src/App.tsx"),
      `export default function App() {\n  return <div><h1>${state.projectName}</h1><p>Gerado pela ${BRAND.displayName}</p></div>;\n}\n`
    );
    await fs.writeFile(path.join(dir, ".gitignore"), "node_modules/\ndist/\n.env\n");
  }

  private async _seedFlutter(dir: string, state: WizardState): Promise<void> {
    const name = state.projectName.replace(/-/g, "_");
    await fs.mkdir(path.join(dir, "lib/features"), { recursive: true });
    await fs.mkdir(path.join(dir, "lib/shared"), { recursive: true });
    await fs.mkdir(path.join(dir, "test"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "pubspec.yaml"),
      `name: ${name}\ndescription: "${state.startupIdea ?? `Gerado pela ${BRAND.displayName}`}"\npublish_to: "none"\nversion: 0.1.0+1\n\nenvironment:\n  sdk: ">=3.3.0 <4.0.0"\n\ndependencies:\n  flutter:\n    sdk: flutter\n  flutter_riverpod: ^2.5.0\n  go_router: ^13.0.0\n  dio: ^5.4.0\n  freezed_annotation: ^2.4.0\n\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\n  build_runner: ^2.4.0\n  freezed: ^2.4.0\n  flutter_lints: ^3.0.0\n`
    );
    await fs.writeFile(
      path.join(dir, "lib/main.dart"),
      `import 'package:flutter/material.dart';\n\nvoid main() => runApp(const MyApp());\n\nclass MyApp extends StatelessWidget {\n  const MyApp({super.key});\n  @override\n  Widget build(BuildContext context) {\n    return MaterialApp(\n      title: '${state.projectName}',\n      home: const Scaffold(body: Center(child: Text('${state.projectName}'))),\n    );\n  }\n}\n`
    );
    await fs.writeFile(path.join(dir, ".gitignore"), ".dart_tool/\nbuild/\n.flutter-plugins\n.flutter-plugins-dependencies\n");
  }

  private async _seedAndroid(dir: string, state: WizardState): Promise<void> {
    const pkg = `com.example.${state.projectName.replace(/-/g, "")}`;
    const pkgPath = pkg.replace(/\./g, "/");
    await fs.mkdir(path.join(dir, `app/src/main/java/${pkgPath}`), { recursive: true });
    await fs.mkdir(path.join(dir, `app/src/main/res/layout`), { recursive: true });
    await fs.writeFile(
      path.join(dir, "settings.gradle.kts"),
      `pluginManagement { repositories { google(); mavenCentral() } }\nrootProject.name = "${state.projectName}"\ninclude(":app")\n`
    );
    await fs.writeFile(
      path.join(dir, "build.gradle.kts"),
      `plugins {\n  alias(libs.plugins.android.application) apply false\n  alias(libs.plugins.kotlin.android) apply false\n}\n`
    );
    await fs.writeFile(
      path.join(dir, "app/build.gradle.kts"),
      `plugins {\n  alias(libs.plugins.android.application)\n  alias(libs.plugins.kotlin.android)\n}\n\nandroid {\n  namespace = "${pkg}"\n  compileSdk = 35\n  defaultConfig {\n    applicationId = "${pkg}"\n    minSdk = 26\n    targetSdk = 35\n    versionCode = 1\n    versionName = "0.1.0"\n  }\n  buildFeatures { compose = true }\n  composeOptions { kotlinCompilerExtensionVersion = "1.5.14" }\n}\n\ndependencies {\n  implementation(libs.androidx.core.ktx)\n  implementation(libs.androidx.lifecycle.runtime.ktx)\n  implementation(libs.androidx.activity.compose)\n  implementation(platform(libs.androidx.compose.bom))\n  implementation(libs.androidx.ui)\n  implementation(libs.androidx.material3)\n  implementation(libs.hilt.android)\n}\n`
    );
    await fs.writeFile(
      path.join(dir, `app/src/main/java/${pkgPath}/MainActivity.kt`),
      `package ${pkg}\n\nimport android.os.Bundle\nimport androidx.activity.ComponentActivity\nimport androidx.activity.compose.setContent\nimport androidx.compose.material3.Text\n\nclass MainActivity : ComponentActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(savedInstanceState)\n    setContent { Text("${state.projectName}") }\n  }\n}\n`
    );
    await fs.writeFile(
      path.join(dir, `app/src/main/AndroidManifest.xml`),
      `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n  <application android:label="${state.projectName}">\n    <activity android:name=".MainActivity" android:exported="true">\n      <intent-filter>\n        <action android:name="android.intent.action.MAIN"/>\n        <category android:name="android.intent.category.LAUNCHER"/>\n      </intent-filter>\n    </activity>\n  </application>\n</manifest>\n`
    );
    await fs.writeFile(path.join(dir, ".gitignore"), "*.iml\n.gradle/\nbuild/\n.idea/\n");
  }

  private async _seedIos(dir: string, state: WizardState): Promise<void> {
    const name = state.projectName.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("");
    await fs.mkdir(path.join(dir, `${name}/Sources`), { recursive: true });
    await fs.mkdir(path.join(dir, `${name}Tests`), { recursive: true });
    await fs.writeFile(
      path.join(dir, "Package.swift"),
      `// swift-tools-version: 5.9\nimport PackageDescription\n\nlet package = Package(\n  name: "${name}",\n  platforms: [.iOS(.v17)],\n  dependencies: [\n    .package(url: "https://github.com/pointfreeco/swift-composable-architecture", from: "1.10.0"),\n  ],\n  targets: [\n    .target(name: "${name}", dependencies: [\n      .product(name: "ComposableArchitecture", package: "swift-composable-architecture"),\n    ]),\n    .testTarget(name: "${name}Tests", dependencies: ["${name}"]),\n  ]\n)\n`
    );
    await fs.writeFile(
      path.join(dir, `${name}/Sources/${name}App.swift`),
      `import SwiftUI\n\n@main\nstruct ${name}App: App {\n  var body: some Scene {\n    WindowGroup {\n      ContentView()\n    }\n  }\n}\n`
    );
    await fs.writeFile(
      path.join(dir, `${name}/Sources/ContentView.swift`),
      `import SwiftUI\n\nstruct ContentView: View {\n  var body: some View {\n    Text("${state.projectName}")\n  }\n}\n`
    );
    await fs.writeFile(path.join(dir, ".gitignore"), ".build/\n*.xcworkspace/xcuserdata\nDerivedData/\n");
  }

  /**
   * Generates infrastructure/ and pipelines/ with functional configs.
   */
  private async _generateInfrastructure(dir: string, state: WizardState): Promise<void> {
    await fs.mkdir(path.join(dir, "infrastructure"), { recursive: true });
    await fs.mkdir(path.join(dir, "pipelines"), { recursive: true });

    await fs.writeFile(
      path.join(dir, "infrastructure/docker-compose.local.yml"),
      buildDockerCompose(state)
    );

    await fs.writeFile(
      path.join(dir, "pipelines/ci.yaml"),
      buildCIPipeline(state)
    );
  }
}
