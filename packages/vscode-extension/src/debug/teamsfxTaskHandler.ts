// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ProductName } from "@microsoft/teamsfx-api";
import * as vscode from "vscode";

import { getLocalTeamsAppId } from "./commonUtils";
import { ext } from "../extensionVariables";
import { ExtTelemetry } from "../telemetry/extTelemetry";
import { TelemetryEvent, TelemetryProperty } from "../telemetry/extTelemetryEvents";
import { isWorkspaceSupported, getTeamsAppId } from "../utils/commonUtils";

interface IRunningTeamsfxTask {
  source: string;
  name: string;
  scope: vscode.WorkspaceFolder | vscode.TaskScope;
}

const allRunningTeamsfxTasks: Map<IRunningTeamsfxTask, number> = new Map<
  IRunningTeamsfxTask,
  number
>();
const allRunningDebugSessions: Set<string> = new Set<string>();
const activeNpmInstallTasks = new Set<string>();

function isNpmInstallTask(task: vscode.Task): boolean {
  if (task) {
    return task.name.trim().toLocaleLowerCase().endsWith("npm install");
  }

  return false;
}

function isTeamsfxTask(task: vscode.Task): boolean {
  // teamsfx: xxx start / xxx watch
  if (task) {
    if (
      task.source === ProductName &&
      (task.name.trim().toLocaleLowerCase().endsWith("start") ||
        task.name.trim().toLocaleLowerCase().endsWith("watch"))
    ) {
      // provided by toolkit
      return true;
    }

    if (task.definition && task.definition.type === ProductName) {
      // defined by launch.json
      const command = task.definition.command as string;
      return (
        command !== undefined &&
        (command.trim().toLocaleLowerCase().endsWith("start") ||
          command.trim().toLocaleLowerCase().endsWith("watch"))
      );
    }
  }

  return false;
}

function onDidStartTaskProcessHandler(event: vscode.TaskProcessStartEvent): void {
  if (ext.workspaceUri && isWorkspaceSupported(ext.workspaceUri.fsPath)) {
    const task = event.execution.task;
    if (task.scope !== undefined && isTeamsfxTask(task)) {
      allRunningTeamsfxTasks.set(
        { source: task.source, name: task.name, scope: task.scope },
        event.processId
      );
    } else if (isNpmInstallTask(task)) {
      activeNpmInstallTasks.add(task.name);
    }
  }
}

function onDidEndTaskProcessHandler(event: vscode.TaskProcessEndEvent): void {
  const task = event.execution.task;
  if (task.scope !== undefined && isTeamsfxTask(task)) {
    allRunningTeamsfxTasks.delete({ source: task.source, name: task.name, scope: task.scope });
  } else if (isNpmInstallTask(task)) {
    activeNpmInstallTasks.delete(task.name);
    // when the task in the active terminal is ended.
    // TODO: only when the task is ended successfully.
    if (vscode.window.activeTerminal?.name === task.name) {
      for (const hiddenTaskName of activeNpmInstallTasks) {
        // show the first hiden terminal.
        const hiddenTerminal = vscode.window.terminals.find(t => t.name === hiddenTaskName);
        if (hiddenTerminal !== undefined) {
          hiddenTerminal.show(true);
          return;
        }
      }
    }
  }
}

function onDidStartDebugSessionHandler(event: vscode.DebugSession): void {
  if (ext.workspaceUri && isWorkspaceSupported(ext.workspaceUri.fsPath)) {
    const debugConfig = event.configuration;
    if (
      debugConfig &&
      debugConfig.name &&
      (debugConfig.url || debugConfig.port) && // it's from launch.json
      !debugConfig.postRestartTask
    ) {
      // and not a restart one
      // send f5 event telemetry
      try {
        const remoteAppId = getTeamsAppId() as string;
        const localAppId = getLocalTeamsAppId() as string;
        const isRemote =
          (debugConfig.url as string) &&
          remoteAppId &&
          (debugConfig.url as string).includes(remoteAppId);
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DebugStart, {
          [TelemetryProperty.DebugSessionId]: event.id,
          [TelemetryProperty.DebugType]: debugConfig.type,
          [TelemetryProperty.DebugRequest]: debugConfig.request,
          [TelemetryProperty.DebugPort]: debugConfig.port + "",
          [TelemetryProperty.DebugRemote]: isRemote ? "true" : "false",
          [TelemetryProperty.DebugAppId]: isRemote ? remoteAppId : localAppId,
        });
      } catch {
        // ignore telemetry error
      }

      allRunningDebugSessions.add(event.id);
    }
  }
}

export function terminateAllRunningTeamsfxTasks(): void {
  for (const task of allRunningTeamsfxTasks) {
    try {
      process.kill(task[1], "SIGTERM");
    } catch (e) {
      // ignore and keep killing others
    }
  }
  allRunningTeamsfxTasks.clear();
}

function onDidTerminateDebugSessionHandler(event: vscode.DebugSession): void {
  if (allRunningDebugSessions.has(event.id)) {
    // a valid debug session
    // send stop-debug event telemetry
    try {
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DebugStop, {
        [TelemetryProperty.DebugSessionId]: event.id,
      });
    } catch {
      // ignore telemetry error
    }

    const extConfig: vscode.WorkspaceConfiguration =
      vscode.workspace.getConfiguration("fx-extension");
    if (extConfig.get<boolean>("stopTeamsToolkitTasksPostDebug", true)) {
      terminateAllRunningTeamsfxTasks();
    }

    allRunningDebugSessions.delete(event.id);
    allRunningTeamsfxTasks.clear();
  }
}

export function registerTeamsfxTaskAndDebugEvents(): void {
  ext.context.subscriptions.push(vscode.tasks.onDidStartTaskProcess(onDidStartTaskProcessHandler));
  ext.context.subscriptions.push(vscode.tasks.onDidEndTaskProcess(onDidEndTaskProcessHandler));
  ext.context.subscriptions.push(
    vscode.debug.onDidStartDebugSession(onDidStartDebugSessionHandler)
  );
  ext.context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession(onDidTerminateDebugSessionHandler)
  );
}
