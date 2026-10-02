"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, hashPassword, verifyPassword } from "@/lib/auth";
import type { ActionState } from "@/lib/action-result";
import { recordConsent } from "@/lib/consent";

const ProfileSchema = z.object({
  firstName: z.string().trim().min(1, "Введите имя"),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().min(10, "Введите телефон"),
  birthday: z.string().optional(),
  preferredSize: z.string().trim().max(10).optional(),
  marketingConsent: z.string().optional(),
});

export async function updateProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/profile");
  const parsed = ProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;
  // День рождения можно указать один раз — защита от злоупотребления подарочными баллами
  const birthday = user.birthday ?? (d.birthday ? new Date(d.birthday) : null);
  const marketing = d.marketingConsent === "on";
  if (marketing !== user.marketingConsent) {
    await db.$transaction((tx) => recordConsent(tx, user.id, "MARKETING", marketing));
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      firstName: d.firstName,
      lastName: d.lastName || null,
      phone: d.phone,
      birthday,
      preferredSize: d.preferredSize || null,
      marketingConsent: marketing,
    },
  });
  revalidatePath("/account", "layout");
  return { ok: true, message: "Данные сохранены" };
}

const PasswordSchema = z.object({
  current: z.string().min(1, "Введите текущий пароль"),
  next: z.string().min(8, "Новый пароль — минимум 8 символов"),
});

export async function changePasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/profile");
  const parsed = PasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await verifyPassword(parsed.data.current, user.passwordHash))) return { error: "Текущий пароль неверен" };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  return { ok: true, message: "Пароль изменён" };
}

const AddressSchema = z.object({
  label: z.string().trim().optional(),
  city: z.string().trim().min(1, "Город"),
  street: z.string().trim().min(1, "Улица"),
  building: z.string().trim().min(1, "Дом"),
  apartment: z.string().trim().optional(),
  postcode: z.string().trim().optional(),
  comment: z.string().trim().optional(),
  isDefault: z.string().optional(),
});

export async function addAddressAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/account/profile");
  const parsed = AddressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: `Заполните поле «${parsed.error.issues[0].message}»` };
  const d = parsed.data;
  const count = await db.address.count({ where: { userId: user.id } });
  const isDefault = d.isDefault === "on" || count === 0;
  await db.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    await tx.address.create({
      data: {
        userId: user.id,
        label: d.label || null,
        city: d.city,
        street: d.street,
        building: d.building,
        apartment: d.apartment || null,
        postcode: d.postcode || null,
        comment: d.comment || null,
        isDefault,
      },
    });
  });
  revalidatePath("/account/profile");
  revalidatePath("/checkout");
  return { ok: true, message: "Адрес добавлен" };
}

export async function deleteAddressAction(formData: FormData) {
  const user = await requireUser("/account/profile");
  const id = String(formData.get("id"));
  const used = await db.order.count({ where: { addressId: id } });
  if (used > 0) {
    // адрес связан с заказами — отвязываем от пользователя логически: снимаем флаг по умолчанию и помечаем
    await db.address.updateMany({ where: { id, userId: user.id }, data: { isDefault: false, label: "Архив" } });
  } else {
    await db.address.deleteMany({ where: { id, userId: user.id } });
  }
  revalidatePath("/account/profile");
}

export async function setDefaultAddressAction(formData: FormData) {
  const user = await requireUser("/account/profile");
  const id = String(formData.get("id"));
  await db.$transaction([
    db.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
    db.address.updateMany({ where: { id, userId: user.id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/account/profile");
}
