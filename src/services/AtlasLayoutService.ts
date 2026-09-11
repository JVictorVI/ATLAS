import * as vscode from "vscode";
import { AtlasSideBarLocation } from "../interfaces/AtlasConfigTypes";

const ATLAS_VIEW_ID = "atlas-chat.view";
const ATLAS_PRIMARY_CONTAINER_ID =
  "workbench.view.extension.atlas-chat-container";
const ATLAS_SECONDARY_CONTAINER_ID =
  "workbench.view.extension.atlas-chat-secondary-container";

export class AtlasLayoutService {
  public static async moveAtlasTo(
    location: AtlasSideBarLocation,
  ): Promise<void> {
    const primarySideBarLocation =
      vscode.workspace
        .getConfiguration("workbench")
        .get<AtlasSideBarLocation>("sideBar.location") === "right"
        ? "right"
        : "left";
    const destinationId =
      location === primarySideBarLocation
        ? ATLAS_PRIMARY_CONTAINER_ID
        : ATLAS_SECONDARY_CONTAINER_ID;

    await vscode.commands.executeCommand("vscode.moveViews", {
      viewIds: [ATLAS_VIEW_ID],
      destinationId,
    });
  }
}
