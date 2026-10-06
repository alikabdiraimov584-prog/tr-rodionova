-- Скрытие категорий из CRM: категория и её вещи пропадают с витрины и возвращаются одной кнопкой
ALTER TABLE "Category" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "hiddenWithCategory" BOOLEAN NOT NULL DEFAULT false;
