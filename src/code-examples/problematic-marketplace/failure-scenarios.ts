import { createProblematicMarketplace } from "./bootstrap";

export const demonstrateCrossTenantCartLeak = async () => {
  const app = createProblematicMarketplace();
  const acmeCart = await app.repositories.carts.findActive(
    "acme-br",
    "user-42",
    "cart-acme",
  );
  const globexCart = await app.repositories.carts.findActive(
    "globex-us",
    "user-42",
    "cart-globex",
  );

  return {
    expectedGlobexCart: "cart-globex",
    actualGlobexCart: globexCart?.id,
    leakedTenant: globexCart?.tenantId,
    cacheWasPrimedWith: acmeCart?.id,
  };
};

export const demonstrateInventoryRace = async () => {
  const app = createProblematicMarketplace();
  const inventory = app.repositories.inventory;

  const outcomes = await Promise.allSettled([
    inventory.reserve("acme-br", "notebook-pro", 2),
    inventory.reserve("acme-br", "notebook-pro", 2),
  ]);
  const row = app.database.tables.inventory.find(
    (candidate) => candidate.sku === "notebook-pro",
  );

  return {
    outcomes: outcomes.map((outcome) => outcome.status),
    remainingAvailable: row?.available,
    totalReserved: row?.reserved,
  };
};

export const demonstrateForgedAdminCancellation = async (orderId: string) => {
  const app = createProblematicMarketplace();
  return app.controller.cancelOrder({
    headers: { "x-tenant-id": "globex-us" },
    params: { orderId },
    query: {},
    body: { actorId: "attacker", actorRole: "admin" },
  });
};
