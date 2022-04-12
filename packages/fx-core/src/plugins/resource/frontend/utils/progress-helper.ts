// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { IProgressHandler, UserInteraction } from "@microsoft/teamsfx-api";
import { Messages } from "../resources/messages";

export interface IProgress {
  title: string;
  steps: { [key: string]: string };
}

export class ProgressHelper {
  static progressHandler: IProgressHandler | undefined;

  static async startProgress(
    ui: UserInteraction | undefined,
    progress: IProgress
  ): Promise<IProgressHandler | undefined> {
    await this.progressHandler?.end(true);

    this.progressHandler = ui?.createProgressBar(
      progress.title,
      Object.entries(progress.steps).length
    );
    await this.progressHandler?.start(Messages.ProgressStart);
    return this.progressHandler;
  }

  static async endProgress(success: boolean): Promise<void> {
    await this.progressHandler?.end(success);
    this.progressHandler = undefined;
  }
}
