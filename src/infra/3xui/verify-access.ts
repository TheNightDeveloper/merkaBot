import { ThreeXUiGateway } from "./gateway";

export async function verifyPanelAccess(gateway: ThreeXUiGateway): Promise<void> {
  await gateway.verifyAccess();
}
