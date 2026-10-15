import test from "node:test";
import assert from "node:assert/strict";
import { can, SECTIONS, homeFor } from "../../src/lib/permissions";
import { allowedWithoutTwoFactor, twoFactorRequired } from "../../src/lib/two-factor-policy";

test("CRM section permissions follow the explicit least-privilege matrix", () => {
  const expected: Record<keyof typeof SECTIONS, string[]> = {
    dashboard: ["MANAGER", "ADMIN"],
    analytics: ["MANAGER", "ADMIN"],
    ads: ["MANAGER", "ADMIN"],
    adsEdit: ["ADMIN"],
    campaigns: ["MANAGER", "ADMIN"],
    content: ["MANAGER", "ADMIN"],
    giftcards: ["SUPPORT", "MANAGER", "ADMIN"],
    stylist: ["SUPPORT", "MANAGER", "ADMIN"],
    support: ["SUPPORT", "MANAGER", "ADMIN"],
    orders: ["SUPPORT", "MANAGER", "ADMIN"],
    ordersEdit: ["MANAGER", "ADMIN"],
    customers: ["SUPPORT", "MANAGER", "ADMIN"],
    customersEdit: ["MANAGER", "ADMIN"],
    customersExport: ["ADMIN"],
    points: ["MANAGER", "ADMIN"],
    tasks: ["SUPPORT", "MANAGER", "ADMIN"],
    products: ["MANAGER", "ADMIN"],
    stock: ["MANAGER", "ADMIN"],
    loyalty: ["MANAGER", "ADMIN"],
    loyaltyEdit: ["ADMIN"],
    promos: ["MANAGER", "ADMIN"],
    reviews: ["SUPPORT", "MANAGER", "ADMIN"],
    finance: ["ADMIN"],
    staff: ["ADMIN"],
    settings: ["ADMIN"],
    integrations: ["ADMIN"],
    audit: ["ADMIN"],
  };

  assert.deepEqual(Object.keys(SECTIONS).sort(), Object.keys(expected).sort());
  for (const [section, allowedRoles] of Object.entries(expected) as [keyof typeof SECTIONS, string[]][]) {
    for (const role of ["CUSTOMER", "SUPPORT", "MANAGER", "ADMIN"]) {
      assert.equal(can(role as never, section), allowedRoles.includes(role), `${role} access to ${section}`);
    }
  }
});

test("high-impact CRM capabilities remain admin-only", () => {
  for (const section of ["adsEdit", "customersExport", "loyaltyEdit", "finance", "staff", "settings", "integrations", "audit"] as const) {
    assert.equal(can("ADMIN" as never, section), true, `ADMIN must access ${section}`);
    assert.equal(can("MANAGER" as never, section), false, `MANAGER must not access ${section}`);
    assert.equal(can("SUPPORT" as never, section), false, `SUPPORT must not access ${section}`);
    assert.equal(can("CUSTOMER" as never, section), false, `CUSTOMER must not access ${section}`);
  }
});

test("staff 2FA policy defaults to ADMIN and MANAGER and can explicitly include SUPPORT", () => {
  const previous = process.env.STAFF_2FA_REQUIRED;
  try {
    delete process.env.STAFF_2FA_REQUIRED;
    assert.equal(twoFactorRequired("ADMIN"), true);
    assert.equal(twoFactorRequired("MANAGER"), true);
    assert.equal(twoFactorRequired("SUPPORT"), false);
    assert.equal(twoFactorRequired("CUSTOMER"), false);

    process.env.STAFF_2FA_REQUIRED = "all";
    assert.equal(twoFactorRequired("SUPPORT"), true);

    process.env.STAFF_2FA_REQUIRED = "0";
    assert.equal(twoFactorRequired("ADMIN"), false);
  } finally {
    if (previous === undefined) delete process.env.STAFF_2FA_REQUIRED;
    else process.env.STAFF_2FA_REQUIRED = previous;
  }
});

test("only the security setup area is allowed before mandatory 2FA", () => {
  assert.equal(allowedWithoutTwoFactor("/crm/security"), true);
  assert.equal(allowedWithoutTwoFactor("/crm/security/setup"), true);
  assert.equal(allowedWithoutTwoFactor("/crm"), false);
  assert.equal(allowedWithoutTwoFactor("/crm/orders"), false);
  assert.equal(allowedWithoutTwoFactor("/crm/security-evil"), false);
});

test("role landing pages never send customers to the CRM", () => {
  assert.equal(homeFor("CUSTOMER" as never), "/account");
  assert.equal(homeFor("SUPPORT" as never), "/crm/support");
  assert.equal(homeFor("MANAGER" as never), "/crm");
  assert.equal(homeFor("ADMIN" as never), "/crm");
});
