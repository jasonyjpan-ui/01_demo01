import type { MenuItem, Order } from "../../shared/contracts";

interface StaleItem {
  id: number;
  name: string;
  orderedPrice: number;
  currentPrice?: number;
  reason: string;
}

interface CartValidationProps {
  order: Order | null;
  menu: MenuItem[];
  onApplyLatestItems?: () => void;
  onRemoveStaleItems?: () => void;
  onRefreshMenu?: () => void;
}

function sameLogicalItem(a: MenuItem, b: MenuItem): boolean {
  return (
    a.id === b.id ||
    (a.logicalId !== undefined &&
      b.logicalId !== undefined &&
      a.logicalId === b.logicalId)
  );
}

export function CartValidation({
  order,
  menu,
  onApplyLatestItems,
  onRemoveStaleItems,
  onRefreshMenu,
}: CartValidationProps) {
  if (!order || order.items.length === 0) {
    return null;
  }

  const unavailableItems: StaleItem[] = [];
  const priceChangedItems: StaleItem[] = [];

  order.items.forEach((orderItem) => {
    const currentMenu = menu.find((item) => sameLogicalItem(item, orderItem.item));

    if (!currentMenu) {
      unavailableItems.push({
        id: orderItem.item.id,
        name: orderItem.item.name,
        orderedPrice: orderItem.item.price,
        reason: "此品項已下架",
      });
      return;
    }

    if (currentMenu.version === orderItem.item.version) {
      return;
    }

    const validationItem = {
      id: orderItem.item.id,
      name: orderItem.item.name,
      orderedPrice: orderItem.item.price,
      currentPrice: currentMenu.price,
      reason: currentMenu.changeReason || "菜單已有新版本",
    };

    if (currentMenu.price !== orderItem.item.price) {
      priceChangedItems.push(validationItem);
    } else {
      unavailableItems.push(validationItem);
    }
  });

  if (unavailableItems.length === 0 && priceChangedItems.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 space-y-3">
      {priceChangedItems.length > 0 ? (
        <div className="alert alert-warning items-start">
          <div className="w-full">
            <div className="mb-2 font-semibold">購物車中有品項價格已更新</div>
            <ul className="space-y-2 text-sm">
              {priceChangedItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded bg-base-100/70 px-3 py-2"
                >
                  <span className="font-medium">{item.name}</span>
                  <span>
                    <span className="line-through opacity-60">
                      ${item.orderedPrice}
                    </span>
                    <span className="mx-2">→</span>
                    <span className="font-bold">${item.currentPrice}</span>
                  </span>
                  <span className="text-xs opacity-70">{item.reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {onApplyLatestItems ? (
                <button
                  type="button"
                  onClick={onApplyLatestItems}
                  className="btn btn-sm btn-warning btn-outline"
                >
                  套用最新價格
                </button>
              ) : null}
              {onRemoveStaleItems ? (
                <button
                  type="button"
                  onClick={onRemoveStaleItems}
                  className="btn btn-sm btn-error btn-outline"
                >
                  移除過期品項
                </button>
              ) : null}
              {onRefreshMenu ? (
                <button
                  type="button"
                  onClick={onRefreshMenu}
                  className="btn btn-sm btn-primary btn-outline"
                >
                  重新整理菜單
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {unavailableItems.length > 0 ? (
        <div className="alert alert-error items-start">
          <div className="w-full">
            <div className="mb-2 font-semibold">購物車中有無法送出的品項</div>
            <p className="mb-2 text-sm">
              這些品項已經下架或版本過舊，請移除後再送出訂單。
            </p>
            <ul className="space-y-2 text-sm">
              {unavailableItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded bg-base-100/70 px-3 py-2"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs opacity-70">{item.reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {onRemoveStaleItems ? (
                <button
                  type="button"
                  onClick={onRemoveStaleItems}
                  className="btn btn-sm btn-error btn-outline"
                >
                  移除過期品項
                </button>
              ) : null}
              {onRefreshMenu ? (
                <button
                  type="button"
                  onClick={onRefreshMenu}
                  className="btn btn-sm btn-primary btn-outline"
                >
                  重新整理菜單
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
