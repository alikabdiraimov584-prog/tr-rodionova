import type { Role } from "@/generated/prisma/enums";

/** Разделы CRM и роли, которым они доступны. */
export const SECTIONS = {
  dashboard: ["MANAGER", "ADMIN"],
  analytics: ["MANAGER", "ADMIN"],
  campaigns: ["MANAGER", "ADMIN"],
  content: ["MANAGER", "ADMIN"], // лукбук, журнал
  giftcards: ["SUPPORT", "MANAGER", "ADMIN"],
  stylist: ["SUPPORT", "MANAGER", "ADMIN"],
  support: ["SUPPORT", "MANAGER", "ADMIN"],
  orders: ["SUPPORT", "MANAGER", "ADMIN"],
  ordersEdit: ["MANAGER", "ADMIN"],
  customers: ["SUPPORT", "MANAGER", "ADMIN"],
  customersEdit: ["MANAGER", "ADMIN"],
  customersExport: ["ADMIN"], // выгрузка ПДн всей базы — только администратор
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
} as const satisfies Record<string, readonly Role[]>;

export type Section = keyof typeof SECTIONS;

export function can(role: Role | null | undefined, section: Section): boolean {
  return !!role && (SECTIONS[section] as readonly Role[]).includes(role);
}

export const STAFF_ROLES: Role[] = ["SUPPORT", "MANAGER", "ADMIN"];

export function homeFor(role: Role): string {
  if (role === "CUSTOMER") return "/account";
  if (role === "SUPPORT") return "/crm/support";
  return "/crm";
}
