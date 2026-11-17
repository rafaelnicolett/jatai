/**
 * VsCodeSettings.ts — a porta `Settings` sobre `workspace.getConfiguration`
 * da seção da marca.
 */

import * as vscode from "vscode";
import type { Settings } from "./Settings";
import { BRAND } from "../../data/brand.pure";

export class VsCodeSettings implements Settings {
  get<T>(key: string, defaultValue: T): T {
    return vscode.workspace.getConfiguration(BRAND.configSection).get<T>(key, defaultValue);
  }
}
