import { MessagingExtensionCommandParameter } from "./messagingExtensionCommandParameter";
import { MessagingExtensionCommandTaskInfo } from "./messagingExtensionCommandTaskInfo";

export interface MessagingExtensionCommand {
  id: string;
  type: string;
  title: string;
  description: string;
  initialRun: boolean;
  fetchTask: boolean;
  context: string[];
  parameters: MessagingExtensionCommandParameter[];
  taskInfo: MessagingExtensionCommandTaskInfo;
}
